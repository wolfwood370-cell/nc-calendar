// ----------------------------------------------------------------------------
// gcal.server — server-only helpers per Google Calendar via connettore Lovable
// ----------------------------------------------------------------------------
// L'integrazione passa per il connector gateway di Lovable (connettore
// `google_calendar`). Il connettore autentica un singolo account Google
// (quello del workspace owner) → tutti gli eventi vengono creati su quel
// calendario, condiviso fra tutti i coach dell'app. La scelta architetturale
// è documentata in `.lovable/plan.md`.
//
// Niente OAuth per-coach, niente refresh token in DB, niente push webhook:
// l'app è la sola sorgente di verità, il calendario riceve solo le scritture
// che facciamo qui dentro.
// ----------------------------------------------------------------------------

const GATEWAY_BASE = "https://connector-gateway.lovable.dev/google_calendar";
const CALENDAR_PATH = "/calendar/v3/calendars/primary/events";

// GCAL-DIAG (2026-06-06): rimuove qualunque sequenza simile a un Bearer token
// dallo snippet del body Google prima di includerlo in messaggi di errore che
// possono finire in DB. Belt-and-suspenders: il gateway Lovable non dovrebbe
// echoare i nostri headers, ma se per qualche motivo lo facesse, non vogliamo
// un token nei log persistenti. La sostituzione è non-greedy + case-insensitive.
function redactBearer(s: string): string {
  return s.replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]");
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`gcal: missing required env var ${name}`);
  return v;
}

function gcalHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${requireEnv("LOVABLE_API_KEY")}`,
    "X-Connection-Api-Key": requireEnv("GOOGLE_CALENDAR_API_KEY"),
    "Content-Type": "application/json",
  };
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  /** Email del cliente: se presente viene aggiunto come attendee +
   *  sendUpdates=all → Google invia l'email di invito. */
  attendeeEmail?: string;
  /** Quando true il backend chiede a Google di creare una Google Meet room
   *  (conferenceData + conferenceDataVersion=1). */
  requestMeet?: boolean;
  /** Reminders policy: online → 30 min + 24h; in presenza → 2h + 24h. */
  isOnline?: boolean;
  /** Color id Google Calendar (1..11). Opzionale. */
  colorId?: string;
  /** Politica notifiche Google. Default "all" (invia invito all'attendee).
   *  Il backfill storico (gcalRepairMissingEvents) usa "none" per NON
   *  bombardare i clienti di inviti per eventi gia' passati/noti. */
  sendUpdates?: "all" | "none" | "externalOnly";
}

export interface CreateEventResult {
  ok: true;
  googleEventId: string;
  meetingLink: string | null;
  htmlLink: string | null;
}

function buildReminders(isOnline: boolean | undefined) {
  // Golden Standard: online ha bisogno solo di 30 min (basta aprire il
  // link), in presenza serve un anticipo per pasto + viaggio. Sempre + 24h
  // come pro-memoria del giorno prima.
  const closeMinutes = isOnline ? 30 : 120;
  return {
    useDefault: false,
    overrides: [
      { method: "popup", minutes: closeMinutes },
      { method: "popup", minutes: 24 * 60 },
    ],
  } as const;
}

// Wave 7 P8: validazione attendee email prima di passarla a Google Calendar
// con sendUpdates=all. L'email arriva da `profiles.email` (impostata dal
// coach in fase di invito), ma un valore malformato o di lunghezza
// abusiva farebbe inviare un invito Google a un indirizzo arbitrario o
// triggererebbe errori 400 ripetuti. RFC 5321 limita la lunghezza totale
// a 254 caratteri; la regex è volutamente permissiva (Google fa la
// validazione vera) ma rifiuta whitespace, CRLF injection e formati
// chiaramente non-email.
const EMAIL_RE = /^[^\s@<>,;"'\\]+@[^\s@<>,;"'\\]+\.[^\s@<>,;"'\\]+$/;
function isSafeEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (/[\r\n\t]/.test(email)) return false;
  return EMAIL_RE.test(email);
}

export async function gcalCreate(input: CreateEventInput): Promise<CreateEventResult> {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description ?? undefined,
    start: { dateTime: input.startISO },
    end: { dateTime: input.endISO },
    reminders: buildReminders(input.isOnline),
  };
  if (input.attendeeEmail) {
    if (!isSafeEmail(input.attendeeEmail)) {
      console.warn("[gcal] skipping invalid attendee email", {
        length: input.attendeeEmail.length,
      });
    } else {
      body.attendees = [{ email: input.attendeeEmail }];
    }
  }
  if (input.colorId) body.colorId = input.colorId;
  if (input.requestMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `nc-${crypto.randomUUID()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const url = new URL(`${GATEWAY_BASE}${CALENDAR_PATH}`);
  // Default "all" = invia invito Google all'attendee. Il backfill passa "none"
  // per creare l'evento in silenzio (nessuna email al cliente).
  url.searchParams.set("sendUpdates", input.sendUpdates ?? "all");
  if (input.requestMeet) url.searchParams.set("conferenceDataVersion", "1");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: gcalHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // GCAL-DIAG (2026-06-06): includiamo lo snippet (redacted) nel messaggio
    // del throw così finisce nel bookings.last_gcal_error per la diagnostica
    // dei 4xx Google. Wave 6 P7 (redact Bearer) preservato via redactBearer.
    const text = await res.text().catch(() => "");
    const snippet = redactBearer(text).slice(0, 300);
    console.error("[gcal] create failed", { status: res.status, snippet });
    throw new Error(`Google Calendar create ${res.status}: ${snippet}`);
  }
  const event = (await res.json()) as {
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
  };
  const meet =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    null;
  return {
    ok: true,
    googleEventId: event.id ?? "",
    meetingLink: meet,
    htmlLink: event.htmlLink ?? null,
  };
}

export interface UpdateEventInput {
  googleEventId: string;
  startISO?: string;
  endISO?: string;
  summary?: string;
  description?: string;
  colorId?: string;
}

export async function gcalUpdate(input: UpdateEventInput): Promise<{ ok: true }> {
  const body: Record<string, unknown> = {};
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.description !== undefined) body.description = input.description;
  if (input.startISO) body.start = { dateTime: input.startISO };
  if (input.endISO) body.end = { dateTime: input.endISO };
  if (input.colorId) body.colorId = input.colorId;

  const url = new URL(`${GATEWAY_BASE}${CALENDAR_PATH}/${encodeURIComponent(input.googleEventId)}`);
  url.searchParams.set("sendUpdates", "all");

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: gcalHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // 404/410 = evento già sparito su Google: trattiamo come no-op silenzioso.
    if (res.status === 404 || res.status === 410) return { ok: true };
    // GCAL-DIAG: snippet redacted nel throw (vedi gcalCreate).
    const text = await res.text().catch(() => "");
    const snippet = redactBearer(text).slice(0, 300);
    console.error("[gcal] update failed", { status: res.status, snippet });
    throw new Error(`Google Calendar update ${res.status}: ${snippet}`);
  }
  return { ok: true };
}

export async function gcalDelete(googleEventId: string): Promise<{ ok: true }> {
  const url = new URL(`${GATEWAY_BASE}${CALENDAR_PATH}/${encodeURIComponent(googleEventId)}`);
  url.searchParams.set("sendUpdates", "all");

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: gcalHeaders(),
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    // GCAL-DIAG: snippet redacted nel throw (vedi gcalCreate).
    const text = await res.text().catch(() => "");
    const snippet = redactBearer(text).slice(0, 300);
    console.error("[gcal] delete failed", { status: res.status, snippet });
    throw new Error(`Google Calendar delete ${res.status}: ${snippet}`);
  }
  return { ok: true };
}

// ----------------------------------------------------------------------------
// gcalList — LETTURA eventi (per la riconciliazione Google -> DB).
// Il gateway Lovable inoltra le GET (verificato 2026-06-06). Usiamo
// showDeleted=true per ricevere gli eventi cancellati con status="cancelled"
// (segnale ESPLICITO di cancellazione — non ci basiamo mai sull'assenza, per
// non cancellare booking validi a causa di un errore di rete transitorio).
// singleEvents=true espande le ricorrenze in istanze con id propri, coerente
// col modello 1 booking = 1 evento.
// ----------------------------------------------------------------------------
export interface GcalEventLite {
  id: string;
  /** "confirmed" | "tentative" | "cancelled" */
  status: string;
  /** epoch ms da start.dateTime; null per eventi all-day (start.date) -> ignorati a valle. */
  startMs: number | null;
  /** epoch ms da end.dateTime; null per all-day o end mancante. */
  endMs: number | null;
  /** Titolo dell'evento Google (per la UI di riconciliazione). "" se assente. */
  summary: string;
  /** true se all-day (start.date senza dateTime). */
  allDay: boolean;
}

export async function gcalList(opts: {
  timeMinISO: string;
  timeMaxISO: string;
}): Promise<GcalEventLite[]> {
  const out: GcalEventLite[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${GATEWAY_BASE}${CALENDAR_PATH}`);
    url.searchParams.set("timeMin", opts.timeMinISO);
    url.searchParams.set("timeMax", opts.timeMaxISO);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("maxResults", "250");
    url.searchParams.set("orderBy", "startTime");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { method: "GET", headers: gcalHeaders() });
    if (!res.ok) {
      // Qualsiasi errore di trasporto (404/410/429/5xx) -> NON riconciliare:
      // chi chiama deve abortire, non interpretare come "eventi spariti".
      const text = await res.text().catch(() => "");
      console.error("[gcal] list failed", { status: res.status, snippet: text.slice(0, 200) });
      throw new Error(`Google Calendar list ${res.status}`);
    }
    const json = (await res.json()) as {
      items?: Array<{
        id?: string;
        status?: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
      nextPageToken?: string;
    };
    for (const it of json.items ?? []) {
      if (!it.id) continue;
      // Confronto sempre su epoch (Date.parse gestisce l'offset es. +02:00),
      // mai su stringhe. all-day (start.date senza dateTime) -> startMs null.
      const parsed = it.start?.dateTime ? Date.parse(it.start.dateTime) : NaN;
      const parsedEnd = it.end?.dateTime ? Date.parse(it.end.dateTime) : NaN;
      out.push({
        id: it.id,
        status: it.status ?? "confirmed",
        startMs: Number.isFinite(parsed) ? parsed : null,
        endMs: Number.isFinite(parsedEnd) ? parsedEnd : null,
        summary: it.summary ?? "",
        allDay: !it.start?.dateTime && !!it.start?.date,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}
