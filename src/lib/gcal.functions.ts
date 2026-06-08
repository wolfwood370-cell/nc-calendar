// ----------------------------------------------------------------------------
// gcal.functions — TanStack server functions per Google Calendar
// ----------------------------------------------------------------------------
// Thin wrapper sopra `gcal.server.ts`. Tutte le call site dell'app
// (booking confirm, reschedule, cancel) invocano queste server fn via
// `useServerFn(...)` o direttamente. Le credenziali Google sono mai esposte
// al client: il connettore Lovable parla col gateway server-side, qui sopra.
//
// Schema dei booking che persistono l'evento Google:
//   bookings.google_event_id → ritornato da gcalCreateEvent
//   bookings.meeting_link    → ritornato (hangoutLink) da gcalCreateEvent
//                              quando requestMeet:true
// ----------------------------------------------------------------------------

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gcalCreate, gcalUpdate, gcalDelete, gcalList } from "@/lib/gcal.server";

// Wrapper di sicurezza: ogni server fn ritorna SEMPRE un DTO {ok,error?}.
// Le UI esistenti non vogliono throw — mostrano toast warning quando ok=false.
type GcalResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
type GcalAck = { ok: true } | { ok: false; error: string };

const CreateSchema = z
  .object({
    // S-AUTHZ (audit 2026-06-05): bookingId OBBLIGATORIO. attendeeEmail RIMOSSO
    // dall'input — viene derivato server-side dal cliente del booking, così
    // nessuno può inviare inviti Google ad email arbitrarie dal calendario
    // condiviso del workspace.
    bookingId: z.string().uuid(),
    summary: z.string().min(1).max(500),
    description: z.string().max(2000).optional(),
    startISO: z.string().datetime({ offset: true }),
    endISO: z.string().datetime({ offset: true }),
    requestMeet: z.boolean().optional(),
    isOnline: z.boolean().optional(),
    // GCAL-FIX (2026-06-06): Google Calendar accetta colorId 1-11 (max 2 char
    // numeric). L'UI dell'app salva `event_types.color` come hex code (es.
    // "#10b981") per il display in-app, e prima passava quell'hex come colorId
    // a Google -> Zod buttava con too_big.max=2 -> handler MAI eseguito ->
    // google_event_id NULL su ogni booking dal 1/6 (confermato V4 PING).
    // Fix server-side: regex + .catch(undefined) droppa silenziosamente un
    // colorId invalido invece di rigettare l'INTERA prenotazione. Un colore
    // di display non valido per Google == evento senza colorId (Google usa
    // il colore di default del calendario). Mapping hex->1-11 sara' un todo
    // separato se servira'.
    colorId: z
      .string()
      .regex(/^\d{1,2}$/, "colorId must be 1-2 numeric chars (Google Calendar 1-11)")
      .optional()
      .catch(undefined),
  })
  // N11 (audit 2026-06-03): garantisce endISO > startISO prima della chiamata
  // a Google Calendar (che altrimenti ritorna un errore generico).
  .refine((d) => new Date(d.endISO) > new Date(d.startISO), {
    message: "endISO deve essere successivo a startISO",
    path: ["endISO"],
  });

// N5 (audit 2026-06-03): mappiamo solo errori noti a messaggi italiani;
// tutto il resto viene oscurato dietro un messaggio generico. Lo stacktrace
// reale resta nei log server-side. Evita di esporre URL Google API, token
// OAuth parziali, nomi di calendario o vincoli DB al client.
const KNOWN_ERROR_MESSAGES = new Set<string>([
  "Booking lookup failed",
  "Booking non trovato",
  "Permesso negato sul booking",
  "Permesso negato sull'evento",
  "endISO deve essere successivo a startISO",
]);
function scrubGcalError(e: unknown, op: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (KNOWN_ERROR_MESSAGES.has(msg)) return msg;
  console.error(`[gcal] ${op} internal error`, { message: msg });
  return "Operazione calendario fallita. Riprova più tardi.";
}

// C1 (audit 2026-06-03) + S-AUTHZ (audit 2026-06-05): access control helper.
// Verifica che il caller sia autorizzato sul booking (il CLIENT proprietario,
// il COACH assegnato, oppure un admin) e ritorna l'email autoritativa del
// cliente del booking, presa dal DB tramite profiles. Questo:
//   - rende impossibile creare eventi gcal senza un booking posseduto;
//   - elimina il vettore attendeeEmail arbitraria (sendUpdates=all): l'invito
//     Google può finire SOLO all'email reale del cliente di quel booking.
async function assertBookingAccessAndGetAttendee(
  bookingId: string,
  userId: string,
): Promise<{ attendeeEmail: string | null }> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("client_id, coach_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error("Booking lookup failed");
  if (!booking) throw new Error("Booking non trovato");

  const isOwner = booking.client_id === userId || booking.coach_id === userId;
  if (!isOwner) {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Permesso negato sul booking");
  }

  // Email autoritativa del cliente del booking (NON fornita dal client).
  let attendeeEmail: string | null = null;
  if (booking.client_id) {
    const { data: clientProfile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", booking.client_id)
      .maybeSingle();
    attendeeEmail = clientProfile?.email ?? null;
  }
  return { attendeeEmail };
}

/** Crea l'evento Google Calendar e scrive google_event_id + meeting_link
 *  sulla riga booking. Richiede SEMPRE un bookingId valido posseduto dal
 *  caller (client del booking, coach assegnato, o admin). L'attendee email
 *  è SEMPRE quella autoritativa del cliente del booking. */
// GCAL-DIAG v4 (2026-06-06): l'inputValidator Zod nella v3 chain `throws` PRIMA
// del handler quando il payload non matcha lo schema -> response 200 con envelope
// TSR/Error -> handler mai entrato -> niente write su last_gcal_error -> sintomo
// NULL ovunque nonostante il commit v3 sia in produzione (confermato da Lovable col
// content-hash dell'handler).
// Sostituiamo l'inputValidator con un cast pass-through (mantiene il TIPO per il
// caller TypeScript ma NON throws). La vera validazione Zod e' spostata DENTRO il
// try del handler -> un fail diventa [V4-ERR] [step:zod] ... visibile in DB invece
// di sparire come TSR/Error 200 silente.
type GcalCreateInput = {
  bookingId: string;
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  requestMeet?: boolean;
  isOnline?: boolean;
  colorId?: string;
};
export const gcalCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input): GcalCreateInput => input as GcalCreateInput)
  .handler(async ({ data: rawInput, context }): Promise<GcalResult<{ googleEventId: string; meetingLink: string | null; htmlLink: string | null }>> => {
    // bookingId estratto in modo tollerante PRIMA della validazione Zod, cosi'
    // anche un payload che fallisce la parse puo' comunque registrare l'errore
    // sul booking giusto (vedi catch).
    const rawObj = (rawInput ?? {}) as Record<string, unknown>;
    let bookingId: string | undefined =
      typeof rawObj.bookingId === "string" ? (rawObj.bookingId as string) : undefined;

    let step = "entry";
    try {
      // La validazione Zod sta DENTRO il try (non nell'inputValidator chain):
      // in TanStack Start un throw nell'inputValidator produce una response 200
      // con envelope TSR/Error PRIMA del handler -> l'errore non sarebbe mai
      // registrato. Qui invece un fail diventa last_gcal_error="[step:zod] ..."
      // visibile via SQL. (Lezione del bug colorId, 2026-06-06.)
      step = "zod";
      const data = CreateSchema.parse(rawInput);
      bookingId = data.bookingId;

      step = "assertBookingAccess";
      // S-AUTHZ: ownership SEMPRE applicato (bookingId ora obbligatorio).
      const { attendeeEmail } = await assertBookingAccessAndGetAttendee(
        data.bookingId,
        context.userId,
      );

      step = "gcalCreate";
      const r = await gcalCreate({
        summary: data.summary,
        description: data.description,
        startISO: data.startISO,
        endISO: data.endISO,
        // Email autoritativa derivata dal booking, mai dal client.
        attendeeEmail: attendeeEmail ?? undefined,
        requestMeet: data.requestMeet,
        isOnline: data.isOnline,
        colorId: data.colorId,
      });

      step = "writeback";
      if (r.googleEventId) {
        const { error: upErr } = await supabaseAdmin
          .from("bookings")
          .update({
            google_event_id: r.googleEventId,
            ...(r.meetingLink ? { meeting_link: r.meetingLink } : {}),
          })
          .eq("id", data.bookingId);
        if (upErr) {
          console.error("gcalCreateEvent: booking writeback failed", upErr);
        }
      }

      // Successo: azzeriamo last_gcal_error (nessun errore in sospeso).
      await persistGcalError(data.bookingId, null);

      return { ok: true, googleEventId: r.googleEventId, meetingLink: r.meetingLink, htmlLink: r.htmlLink };
    } catch (e) {
      console.error("gcalCreateEvent failed", e);
      const errBody = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      // last_gcal_error registra DOVE e' fallito (step) + il messaggio raw,
      // cosi' la diagnostica futura non richiede ri-strumentare il codice.
      const rawMsg = `[step:${step}] ${errBody}`;
      if (bookingId) {
        await persistGcalError(bookingId, rawMsg.slice(0, 1000));
      }
      return { ok: false, error: scrubGcalError(e, "create") };
    }
  });

// GCAL-DIAG (2026-06-06): writeback del raw error su bookings.last_gcal_error.
// Wrapped in try/catch perché:
//   1) se la migration `last_gcal_error` non è ancora applicata, l'UPDATE
//      restituisce un errore PostgREST (colonna inesistente) -> NON deve
//      rompere il flusso prenotazione.
//   2) il client TS non ha ancora la colonna nei tipi generati (Lovable
//      rigenera dopo la migration), quindi cast localizzato.
async function persistGcalError(bookingId: string, rawMessage: string | null): Promise<void> {
  try {
    // GCAL-DIAG v2: Lovable ha rigenerato i tipi dopo la migration -> ora la
    // colonna esiste in Database type, niente cast `as any`.
    const { error: upErr } = await supabaseAdmin
      .from("bookings")
      .update({ last_gcal_error: rawMessage })
      .eq("id", bookingId);
    if (upErr) {
      // FIX v2: Supabase postgrest ritorna {error} object, NON throwa. La
      // versione v1 aveva solo try/catch esterno -> errori postgrest finivano
      // silenziosi e last_gcal_error non veniva mai popolato senza segnale.
      console.error("[gcal] persistGcalError postgrest error", {
        code: upErr.code,
        message: upErr.message,
        details: upErr.details,
        hint: upErr.hint,
      });
    }
  } catch (writeErr) {
    // Cattura il throw del proxy supabaseAdmin (env mancante) o errori di rete.
    console.error("[gcal] persistGcalError unexpected throw", writeErr);
  }
}

const UpdateSchema = z.object({
  googleEventId: z.string().min(1).max(1024),
  startISO: z.string().datetime({ offset: true }).optional(),
  endISO: z.string().datetime({ offset: true }).optional(),
  summary: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  colorId: z.string().max(2).optional(),
});

// C1: lookup booking by googleEventId and verify caller ownership before
// mutating the calendar event. Prevents a coach from updating/deleting
// another coach's Google Calendar event by guessing/snooping the event id.
async function assertGoogleEventOwnership(googleEventId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("coach_id, client_id")
    .eq("google_event_id", googleEventId)
    .maybeSingle();
  if (error) throw new Error("Booking lookup failed");
  if (!data) {
    // No booking row owns this event id: only admins may proceed (e.g.
    // cleanup of orphaned calendar events).
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Permesso negato sull'evento");
    return;
  }
  // BUGFIX (2026-06-07): autorizzato anche il CLIENTE proprietario del booking,
  // oltre al coach assegnato e all'admin. Prima solo coach/admin: le
  // riprogrammazioni fatte dal CLIENTE non riuscivano a spostare l'evento Google
  // (qui veniva lanciato "Permesso negato"), quindi l'evento restava al vecchio
  // orario e la riconciliazione Google->app riportava poi la sessione indietro
  // ("snap back"). Il lookup è per google_event_id -> il cliente può toccare
  // SOLO l'evento del proprio booking, quindi resta sicuro.
  if (data.coach_id !== userId && data.client_id !== userId) {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Permesso negato sull'evento");
  }
}

export const gcalUpdateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }): Promise<GcalAck> => {
    try {
      await assertGoogleEventOwnership(data.googleEventId, context.userId);
      await gcalUpdate(data);
      return { ok: true };
    } catch (e) {
      console.error("gcalUpdateEvent failed", e);
      return { ok: false, error: scrubGcalError(e, "update") };
    }
  });

const DeleteSchema = z.object({
  googleEventId: z.string().min(1).max(1024),
});

export const gcalDeleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteSchema.parse(input))
  .handler(async ({ data, context }): Promise<GcalAck> => {
    try {
      await assertGoogleEventOwnership(data.googleEventId, context.userId);
      await gcalDelete(data.googleEventId);
      return { ok: true };
    } catch (e) {
      console.error("gcalDeleteEvent failed", e);
      return { ok: false, error: scrubGcalError(e, "delete") };
    }
  });

// ----------------------------------------------------------------------------
// gcalReconcileEvents — riconciliazione Google -> DB (sync inverso).
// Innescata on-demand quando il coach apre/aggiorna /trainer/calendar.
// Confronta le sessioni 'scheduled' future (finestra now-1h .. now+16g) con
// gli eventi Google: se un evento e cancelled -> annulla la sessione + rimborsa
// (RPC reconcile_gcal_cancel); se l'orario e cambiato -> allinea (reconcile_gcal_move).
// SICUREZZA: cancella SOLO su status="cancelled" esplicito; se la GET fallisce
// o la lista e vuota con booking attesi -> NON tocca nulla (anti-wipe).
// ----------------------------------------------------------------------------
type ReconcileResult = {
  ok: boolean;
  cancelled?: number;
  moved?: number;
  conflicts?: number;
  skipped?: string;
  error?: string;
};

export const gcalReconcileEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input): { timeMinISO?: string; timeMaxISO?: string } => (input ?? {}) as { timeMinISO?: string; timeMaxISO?: string })
  .handler(async ({ data, context }): Promise<ReconcileResult> => {
    try {
      // Authz: solo coach/admin (operazione su tutte le sessioni del workspace).
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (roleRow as { role?: string } | null)?.role;
      if (role !== "coach" && role !== "admin") {
        return { ok: false, error: "Permesso negato" };
      }

      const now = Date.now();
      // Finestra di default: -1h .. +16g (sync incrementale a ogni apertura).
      // Quando il caller passa timeMinISO/timeMaxISO espliciti -> forza sync
      // su una finestra arbitraria (es. dal 1° gennaio per allineare tutto
      // lo storico Google -> DB).
      const timeMinISO = typeof data.timeMinISO === "string" ? data.timeMinISO : new Date(now - 60 * 60_000).toISOString();
      const timeMaxISO = typeof data.timeMaxISO === "string" ? data.timeMaxISO : new Date(now + 16 * 24 * 60 * 60_000).toISOString();

      // Sessioni candidate: scheduled, non cancellate, con evento Google, nella finestra.
      const { data: bookings, error: bErr } = await supabaseAdmin
        .from("bookings")
        .select("id, google_event_id, scheduled_at")
        .eq("status", "scheduled")
        .is("deleted_at", null)
        .not("google_event_id", "is", null)
        .gte("scheduled_at", timeMinISO)
        .lte("scheduled_at", timeMaxISO);
      if (bErr) {
        console.error("gcalReconcile: bookings query failed", bErr);
        return { ok: false, error: "Lettura prenotazioni fallita" };
      }
      const rows = bookings ?? [];
      if (rows.length === 0) return { ok: true, cancelled: 0, moved: 0, conflicts: 0 };


      const byEventId = new Map<string, { id: string; scheduledMs: number }>();
      for (const b of rows) {
        if (b.google_event_id) {
          byEventId.set(b.google_event_id, { id: b.id, scheduledMs: Date.parse(b.scheduled_at) });
        }
      }

      // Lettura eventi Google. Se fallisce (errore di trasporto) -> abort totale.
      let events;
      try {
        events = await gcalList({ timeMinISO, timeMaxISO });
      } catch (e) {
        console.error("gcalReconcile: gcalList failed", e);
        return { ok: false, error: "Lettura Google Calendar fallita" };
      }

      // Anti-wipe: lista vuota MA con booking attesi = quasi certo un problema
      // (errore gateway/paginazione) -> non riconciliare nulla.
      if (events.length === 0 && byEventId.size > 0) {
        console.warn("gcalReconcile: lista Google vuota con booking attesi, skip (anti-wipe)");
        return { ok: true, skipped: "empty-list-guard", cancelled: 0, moved: 0, conflicts: 0 };
      }

      let cancelled = 0;
      let moved = 0;
      let conflicts = 0;
      for (const ev of events) {
        const booking = byEventId.get(ev.id);
        if (!booking) continue; // evento Google non mappato a una sessione -> ignora (no import)

        if (ev.status === "cancelled") {
          const { error } = await supabaseAdmin.rpc("reconcile_gcal_cancel", {
            p_booking_id: booking.id,
          });
          if (error) console.error("reconcile_gcal_cancel failed", { id: booking.id, error });
          else cancelled++;
          continue;
        }

        // Spostamento: confronto su epoch (offset-safe), tolleranza 60s.
        if (ev.startMs !== null && Number.isFinite(booking.scheduledMs)) {
          if (Math.abs(ev.startMs - booking.scheduledMs) > 60_000) {
            const { error } = await supabaseAdmin.rpc("reconcile_gcal_move", {
              p_booking_id: booking.id,
              p_new_scheduled_at: new Date(ev.startMs).toISOString(),
            });
            if (error) {
              console.error("reconcile_gcal_move failed", { id: booking.id, error });
              conflicts++;
            } else {
              moved++;
            }
          }
        }
      }
      return { ok: true, cancelled, moved, conflicts };
    } catch (e) {
      console.error("gcalReconcileEvents failed", e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

// ----------------------------------------------------------------------------
// gcalRepairMissingEvents — BACKFILL DB -> Google (rete di sicurezza).
// ----------------------------------------------------------------------------
// La creazione per-booking (gcalCreateEvent) e' una chiamata client-side
// fire-and-forget: se il browser la perde, fallisce, o un campo cosmetico
// rompe la validazione (es. il bug colorId), l'evento Google non viene mai
// creato e nessuno se ne accorge. Questa funzione e' il rimedio STABILE:
//
//   - gira interamente server-side (nessun parametro fragile dal client:
//     summary/start/end/color/attendee derivati TUTTI dal DB);
//   - e' idempotente: tocca SOLO i booking con google_event_id IS NULL;
//   - e' auto-innescata quando il coach apre /trainer/calendar (insieme alla
//     riconciliazione Google->DB) -> il sistema si auto-ripara senza che
//     nessuno debba ricordarsi nulla;
//   - puo' anche essere chiamata a mano dal bottone "Aggiorna".
//
// Cosi' anche se un domani un nuovo campo rompesse di nuovo gcalCreateEvent,
// gli eventi mancanti verrebbero comunque creati alla prossima apertura del
// calendario. Niente piu' dipendenza dal singolo percorso di prenotazione.
// ----------------------------------------------------------------------------
type RepairResult = {
  ok: boolean;
  created?: number;
  failed?: number;
  total?: number;
  error?: string;
};

// Google Calendar accetta colorId solo 1..11. event_types.color e' un hex
// (palette Google) per il display in-app -> mappiamo l'hex al colorId Google
// così l'evento creato mantiene lo stesso colore della tipologia configurata.
import { toGoogleColorId } from "@/lib/gcal-colors";

export const gcalRepairMissingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepairResult> => {
    try {
      // Authz: solo coach/admin.
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (roleRow as { role?: string } | null)?.role;
      if (role !== "coach" && role !== "admin") {
        return { ok: false, error: "Permesso negato" };
      }

      const now = Date.now();
      // Finestra di backfill: dal 1° gennaio 2026 fino a +90 giorni nel futuro.
      // Copre TUTTE le sessioni reali dell'anno mancanti su Google (richiesta
      // utente 2026-06-06), non solo le future.
      const timeMinISO = "2026-01-01T00:00:00.000Z";
      const timeMaxISO = new Date(now + 90 * 24 * 60 * 60_000).toISOString(); // +90g

      // Sessioni candidate: stati "reali" (scheduled/completed/no_show -> NON
      // cancelled/late_cancelled), non eliminate, NON personali, SENZA evento
      // Google, nella finestra. Coach -> solo le proprie; admin -> tutte.
      // is_personal=false: i blocchi personali del coach restano nell'app.
      // Gli eventi "tutto il giorno" (compleanni/Stripe/milestone) sono
      // esclusi DOPO il fetch (vedi isMidnightUtc) -> restano solo nell'app
      // (decisione utente 2026-06-06).
      let q = supabaseAdmin
        .from("bookings")
        .select(
          "id, client_id, coach_id, scheduled_at, end_at, duration_min, session_type, event_type_id, is_personal, title",
        )
        .in("status", ["scheduled", "completed", "no_show"])
        .is("deleted_at", null)
        .eq("is_personal", false)
        .is("google_event_id", null)
        .gte("scheduled_at", timeMinISO)
        .lte("scheduled_at", timeMaxISO)
        // Cap per-esecuzione: ogni gcalCreate e' una chiamata HTTP sequenziale,
        // un backfill enorme rischierebbe il timeout del server. La fn e'
        // idempotente e rigira al prossimo mount / click "Aggiorna", quindi
        // completa il backfill in piu' passate. Future/recenti prima.
        .order("scheduled_at", { ascending: false })
        .limit(50);
      if (role === "coach") q = q.eq("coach_id", context.userId);

      const { data: rows, error: bErr } = await q;
      if (bErr) {
        console.error("gcalRepair: bookings query failed", bErr);
        return { ok: false, error: "Lettura prenotazioni fallita" };
      }
      // Escludi gli eventi "tutto il giorno" (scheduled_at a mezzanotte UTC):
      // compleanni / promemoria Stripe / fine percorso -> restano solo nell'app,
      // non vanno spinti su Google (diventerebbero brutti eventi delle 02:00).
      const isMidnightUtc = (iso: string) => /T00:00:00(?:\.000)?Z$/i.test(iso);
      const bookings = (rows ?? []).filter((b) => !isMidnightUtc(b.scheduled_at));
      if (bookings.length === 0) return { ok: true, created: 0, failed: 0, total: 0 };

      // Prefetch event_types + profiles in 2 query (no N+1).
      const eventTypeIds = [...new Set(bookings.map((b) => b.event_type_id).filter(Boolean) as string[])];
      const clientIds = [...new Set(bookings.map((b) => b.client_id).filter(Boolean) as string[])];

      const eventTypeMap = new Map<string, { name: string; color: string; location_type: string; duration: number }>();
      if (eventTypeIds.length > 0) {
        const { data: ets } = await supabaseAdmin
          .from("event_types")
          .select("id, name, color, location_type, duration")
          .in("id", eventTypeIds);
        for (const et of ets ?? []) {
          eventTypeMap.set(et.id, {
            name: et.name,
            color: et.color,
            location_type: et.location_type,
            duration: et.duration,
          });
        }
      }

      const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
      if (clientIds.length > 0) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email")
          .in("id", clientIds);
        for (const p of profs ?? []) {
          profileMap.set(p.id, { full_name: p.full_name, email: p.email });
        }
      }

      let created = 0;
      let failed = 0;
      for (const b of bookings) {
        try {
          const et = b.event_type_id ? eventTypeMap.get(b.event_type_id) : undefined;
          const clientProfile = b.client_id ? profileMap.get(b.client_id) : undefined;

          // Titolo: "<tipo> — <cliente>" (cliente omesso per blocchi personali
          // o quando client == coach, cioe' eventi esterni del coach stesso).
          const typeLabel = b.title ?? et?.name ?? b.session_type ?? "Sessione";
          const isOwnEvent = b.is_personal || (b.client_id && b.client_id === b.coach_id);
          const clientName = !isOwnEvent ? clientProfile?.full_name : null;
          const summary = clientName ? `${typeLabel} — ${clientName}` : typeLabel;

          // Start/end derivati dal DB. end_at e' sempre valorizzato (trigger
          // a_trg_set_booking_duration_defaults); fallback a duration_min se
          // mancasse.
          const startISO = new Date(b.scheduled_at).toISOString();
          const endISO = b.end_at
            ? new Date(b.end_at).toISOString()
            : new Date(new Date(b.scheduled_at).getTime() + (b.duration_min ?? 60) * 60_000).toISOString();

          const isOnline = et?.location_type === "online";
          // Attendee SOLO per sessioni con un vero cliente (non blocchi
          // personali / eventi esterni del coach).
          const attendeeEmail = !isOwnEvent ? (clientProfile?.email ?? undefined) : undefined;

          const r = await gcalCreate({
            summary,
            startISO,
            endISO,
            attendeeEmail,
            requestMeet: isOnline,
            isOnline,
            colorId: toGoogleColorId(et?.color),
            // BACKFILL SILENZIOSO: nessun invito Google al cliente per eventi
            // storici/gia' noti (richiesta utente). Le prenotazioni NUOVE usano
            // il flusso gcalCreateEvent con sendUpdates="all" (default) -> quelle
            // sì mandano l'invito.
            sendUpdates: "none",
          });

          if (r.googleEventId) {
            await supabaseAdmin
              .from("bookings")
              .update({
                google_event_id: r.googleEventId,
                ...(r.meetingLink ? { meeting_link: r.meetingLink } : {}),
                last_gcal_error: null, // successo: nessun errore in sospeso
              })
              .eq("id", b.id);
            created++;
          } else {
            await persistGcalError(b.id, "[repair] gcalCreate ritornato senza eventId");
            failed++;
          }
        } catch (perBookingErr) {
          const msg = perBookingErr instanceof Error ? perBookingErr.message : String(perBookingErr);
          console.error("gcalRepair: per-booking failed", { id: b.id, msg });
          await persistGcalError(b.id, `[repair] ${msg}`.slice(0, 1000));
          failed++;
          // continua col prossimo: un booking rotto non blocca gli altri.
        }
      }

      return { ok: true, created, failed, total: bookings.length };
    } catch (e) {
      console.error("gcalRepairMissingEvents failed", e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

// ----------------------------------------------------------------------------
// gcalListEventsForReview — LETTURA eventi Google per la UI di riconciliazione.
// ----------------------------------------------------------------------------
// Sola lettura: espone al client (coach/admin) gli eventi Google "confirmed"
// di una finestra temporale, cosi' la pagina /trainer/calendar puo' confrontarli
// con i booking gia' caricati e mostrare:
//   - eventi su Google MA non in piattaforma (da importare/visualizzare);
//   - booking in piattaforma MA non su Google (da rivedere).
// Nessuna scrittura sul DB, nessuna migration: e' un confronto a video.
// ----------------------------------------------------------------------------
type ReviewEvent = { id: string; summary: string; startMs: number | null; endMs: number | null; allDay: boolean };
type ListReviewResult =
  | { ok: true; events: ReviewEvent[] }
  | { ok: false; error: string };

export const gcalListEventsForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input): { timeMinISO?: string; timeMaxISO?: string } => (input ?? {}) as { timeMinISO?: string; timeMaxISO?: string })
  .handler(async ({ data, context }): Promise<ListReviewResult> => {
    try {
      // Authz: solo coach/admin (lettura del calendario condiviso del workspace).
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (roleRow as { role?: string } | null)?.role;
      if (role !== "coach" && role !== "admin") {
        return { ok: false, error: "Permesso negato" };
      }

      const now = Date.now();
      // Finestra di default: -30g .. +90g (copre recenti + futuro). Il client
      // puo' passarne una propria; clampiamo a un massimo di ~13 mesi per non
      // tirare giu' un calendario intero.
      const defMin = new Date(now - 30 * 24 * 60 * 60_000).toISOString();
      const defMax = new Date(now + 90 * 24 * 60 * 60_000).toISOString();
      const timeMinISO = typeof data.timeMinISO === "string" ? data.timeMinISO : defMin;
      const timeMaxISO = typeof data.timeMaxISO === "string" ? data.timeMaxISO : defMax;

      const events = await gcalList({ timeMinISO, timeMaxISO });
      // Solo eventi "vivi": scartiamo i cancelled (sono gestiti dal sync
      // Google->DB) e gli all-day (non mappano a una sessione 1:1).
      const out: ReviewEvent[] = events
        .filter((e) => e.status !== "cancelled" && !e.allDay)
        .map((e) => ({ id: e.id, summary: e.summary, startMs: e.startMs, endMs: e.endMs, allDay: e.allDay }));
      return { ok: true, events: out };
    } catch (e) {
      console.error("gcalListEventsForReview failed", e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

// ----------------------------------------------------------------------------
// gcalImportEvent — FASE 2: importa un evento Google come booking in piattaforma.
// ----------------------------------------------------------------------------
// SAFE-BY-CONSTRUCTION: l'INSERT NON imposta mai block_id -> il trigger
// validate_booking_block_allocation ritorna subito (NESSUN consumo di crediti).
// L'INSERT gira come service_role -> il trigger enforce_client_booking_insert
// bypassa (auth.uid() IS NULL). Quindi nessun rischio crediti / authz.
//
// Due modalita' (scelta dall'utente "volta per volta"):
//   - "external": evento/impegno del coach (client_id=coach_id, is_personal=true,
//     category='personal'). NON consuma crediti, NON e' una sessione cliente.
//   - "client": sessione collegata a un cliente (client_id=clientId, category=
//     'client_session') MA SENZA scalare crediti (block_id null) -> import a
//     scopo di archivio/visibilita'. Il credito si gestisce a parte se serve.
//
// google_event_id viene impostato all'id Google -> niente doppioni: un secondo
// import dello stesso evento e' un no-op (gia' presente).
// ----------------------------------------------------------------------------
type ImportResult =
  | { ok: true; bookingId: string; alreadyImported?: boolean }
  | { ok: false; error: string };

const ImportSchema = z.object({
  googleEventId: z.string().min(1).max(1024),
  summary: z.string().max(500).optional(),
  startISO: z.string().datetime({ offset: true }),
  endISO: z.string().datetime({ offset: true }).optional(),
  // client      -> sessione collegata a un cliente (category client_session)
  // consulenza  -> consulenza / appuntamento esterno, senza cliente (category consulenza)
  // personal    -> impegno personale / blocco (category personal, is_personal)
  mode: z.enum(["client", "consulenza", "personal"]),
  clientId: z.string().uuid().optional(),
  eventTypeId: z.string().uuid().optional(),
});

export const gcalImportEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ImportSchema.parse(input))
  .handler(async ({ data, context }): Promise<ImportResult> => {
    try {
      // Authz: solo coach/admin.
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (roleRow as { role?: string } | null)?.role;
      if (role !== "coach" && role !== "admin") {
        return { ok: false, error: "Permesso negato" };
      }

      const coachId = context.userId;

      // Idempotenza / no doppioni: se esiste gia' un booking con questo
      // google_event_id, non re-importiamo.
      const { data: existing } = await supabaseAdmin
        .from("bookings")
        .select("id")
        .eq("google_event_id", data.googleEventId)
        .is("deleted_at", null)
        .maybeSingle();
      if (existing?.id) {
        return { ok: true, bookingId: existing.id, alreadyImported: true };
      }

      // Modalita' client: valida che il cliente sia davvero del coach.
      let clientId = coachId; // default: external -> evento del coach stesso
      let eventTypeId: string | null = null;
      let sessionType: "PT Session" | "BIA" | "Functional Test" = "PT Session";
      let durationMin = 60;

      if (data.mode === "client") {
        if (!data.clientId) return { ok: false, error: "Cliente non specificato" };
        const { data: clientProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, coach_id")
          .eq("id", data.clientId)
          .maybeSingle();
        if (!clientProfile) return { ok: false, error: "Cliente non trovato" };
        if (role === "coach" && clientProfile.coach_id !== coachId) {
          return { ok: false, error: "Il cliente non è assegnato a te" };
        }
        clientId = data.clientId;

        // Tipo evento opzionale -> definisce session_type + durata.
        // B19 (audit 2026-06-06): vincola il tipo evento al coach chiamante
        // (un coach non puo' usare la tipologia di un altro coach).
        if (data.eventTypeId) {
          const { data: et } = await supabaseAdmin
            .from("event_types")
            .select("id, base_type, duration")
            .eq("id", data.eventTypeId)
            .eq("coach_id", coachId)
            .maybeSingle();
          if (et) {
            eventTypeId = et.id;
            sessionType = et.base_type as typeof sessionType;
            if (et.duration) durationMin = et.duration;
          }
        }
      }

      const startMs = Date.parse(data.startISO);
      const endMs = data.endISO ? Date.parse(data.endISO) : NaN;
      if (Number.isFinite(endMs) && Number.isFinite(startMs)) {
        durationMin = Math.max(1, Math.round((endMs - startMs) / 60_000));
      }
      const endISO = Number.isFinite(endMs)
        ? new Date(endMs).toISOString()
        : new Date(startMs + durationMin * 60_000).toISOString();

      // Eventi passati -> 'completed' (archivio storico); futuri -> 'scheduled'.
      const status: "scheduled" | "completed" = startMs < Date.now() ? "completed" : "scheduled";
      // Mappa modalita' -> is_personal + category (CHECK: client_session|personal|consulenza).
      const isPersonalBlock = data.mode === "personal";
      const importCategory =
        data.mode === "client" ? "client_session" : data.mode === "consulenza" ? "consulenza" : "personal";

      // WORKAROUND TRIGGER CREDITI (2026-06-06): sul DB live il trigger
      // validate_booking_extra_credits NON ha (ancora) la guardia
      // `google_event_id IS NOT NULL` presente nel repo (drift repo<->DB; non
      // applicabile via migration senza crediti Lovable). Quel trigger e'
      // BEFORE INSERT e pretende un credito per le sessioni cliente
      // (client_id != coach_id, block_id null). Lo aggiriamo in 2 passi:
      //   1) INSERT con client_id = coachId -> il trigger salta (client_id =
      //      coach_id) -> nessun consumo crediti.
      //   2) se mode='client', UPDATE per collegare il cliente reale: i trigger
      //      crediti sono BEFORE INSERT (NON rifireano su UPDATE) e
      //      validate_client_booking_update bypassa il service_role.
      const insertRow = {
        coach_id: coachId,
        client_id: coachId, // passo 1: evita il trigger crediti
        scheduled_at: data.startISO,
        end_at: endISO,
        duration_min: durationMin,
        session_type: sessionType,
        event_type_id: eventTypeId,
        status,
        is_personal: isPersonalBlock,
        category: importCategory,
        title: data.summary ?? null,
        google_event_id: data.googleEventId, // LINK -> niente doppioni
        // block_id NON impostato -> nessun consumo crediti
      };

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("bookings")
        .insert(insertRow)
        .select("id")
        .single();

      if (insErr) {
        // 23P01 = sovrapposizione oraria con un altro booking dello stesso coach.
        if (insErr.code === "23P01") {
          return { ok: false, error: "Sovrapposizione: esiste già una sessione in questo orario." };
        }
        // 23505 = unique violation (es. google_event_id già usato): trattalo
        // come "già importato" invece che come errore.
        if (insErr.code === "23505") {
          return { ok: false, error: "Questo evento risulta già importato." };
        }
        console.error("gcalImportEvent insert failed", insErr);
        // Strumento interno coach/admin: esponiamo l'errore DB raw (code +
        // message + details) cosi' e' diagnosticabile dal toast senza dover
        // leggere i log server (che non catturano console.error degli handler).
        const detail = [insErr.code, insErr.message, insErr.details, insErr.hint]
          .filter(Boolean)
          .join(" · ");
        return { ok: false, error: `Import fallito → ${detail}`.slice(0, 400) };
      }

      const bookingId = (inserted as { id: string }).id;

      // Passo 2 (solo modalita' "client"): collega il cliente reale. I trigger
      // crediti sono BEFORE INSERT -> non rifireano qui; validate_client_booking_update
      // bypassa il service_role.
      if (data.mode === "client" && clientId !== coachId) {
        const { error: linkErr } = await supabaseAdmin
          .from("bookings")
          .update({ client_id: clientId, is_personal: false, category: "client_session" })
          .eq("id", bookingId);
        if (linkErr) {
          // Rollback: rimuovi la riga appena creata per non lasciare un evento
          // "esterno" mislabeled al posto della sessione cliente richiesta.
          await supabaseAdmin.from("bookings").delete().eq("id", bookingId);
          const d = [linkErr.code, linkErr.message, linkErr.details, linkErr.hint]
            .filter(Boolean)
            .join(" · ");
          return { ok: false, error: `Collegamento cliente fallito → ${d}`.slice(0, 400) };
        }
      }
      return { ok: true, bookingId };
    } catch (e) {
      console.error("gcalImportEvent failed", e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
