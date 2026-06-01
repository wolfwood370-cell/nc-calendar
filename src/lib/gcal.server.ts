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

export async function gcalCreate(input: CreateEventInput): Promise<CreateEventResult> {
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description ?? undefined,
    start: { dateTime: input.startISO },
    end: { dateTime: input.endISO },
    reminders: buildReminders(input.isOnline),
  };
  if (input.attendeeEmail) {
    body.attendees = [{ email: input.attendeeEmail }];
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
  url.searchParams.set("sendUpdates", "all");
  if (input.requestMeet) url.searchParams.set("conferenceDataVersion", "1");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: gcalHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Calendar create ${res.status}: ${text.slice(0, 300)}`);
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
    const text = await res.text().catch(() => "");
    throw new Error(`Google Calendar update ${res.status}: ${text.slice(0, 300)}`);
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
    const text = await res.text().catch(() => "");
    throw new Error(`Google Calendar delete ${res.status}: ${text.slice(0, 300)}`);
  }
  return { ok: true };
}
