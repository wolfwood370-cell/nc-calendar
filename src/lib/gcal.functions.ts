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
    colorId: z.string().max(2).optional(),
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
export const gcalCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSchema.parse(input))
  .handler(async ({ data, context }): Promise<GcalResult<{ googleEventId: string; meetingLink: string | null; htmlLink: string | null }>> => {
    try {
      // S-AUTHZ: ownership SEMPRE applicato (bookingId ora obbligatorio).
      const { attendeeEmail } = await assertBookingAccessAndGetAttendee(
        data.bookingId,
        context.userId,
      );

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

      return { ok: true, googleEventId: r.googleEventId, meetingLink: r.meetingLink, htmlLink: r.htmlLink };
    } catch (e) {
      console.error("gcalCreateEvent failed", e);
      return { ok: false, error: scrubGcalError(e, "create") };
    }
  });

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
    .select("coach_id")
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
  if (data.coach_id !== userId) {
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
  .handler(async ({ context }): Promise<ReconcileResult> => {
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
      const timeMinISO = new Date(now - 60 * 60_000).toISOString(); // now - 1h
      const timeMaxISO = new Date(now + 16 * 24 * 60 * 60_000).toISOString(); // now + 16g

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
