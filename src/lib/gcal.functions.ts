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
import { gcalCreate, gcalUpdate, gcalDelete } from "@/lib/gcal.server";

// Wrapper di sicurezza: ogni server fn ritorna SEMPRE un DTO {ok,error?}.
// Le UI esistenti non vogliono throw — mostrano toast warning quando ok=false.
type GcalResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
type GcalAck = { ok: true } | { ok: false; error: string };

const CreateSchema = z
  .object({
    bookingId: z.string().uuid().optional(),
    summary: z.string().min(1).max(500),
    description: z.string().max(2000).optional(),
    startISO: z.string().datetime({ offset: true }),
    endISO: z.string().datetime({ offset: true }),
    attendeeEmail: z.string().email().optional(),
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

/** Crea l'evento Google Calendar e, se fornito bookingId, scrive
 *  google_event_id + meeting_link sulla riga booking. */
// C1 (audit 2026-06-03): ownership check helper. Before any admin-client
// writeback to bookings or any Google Calendar mutation tied to a booking
// row, verify the caller is the booking's coach (or an admin). Without
// this a coach could pass any bookingId and overwrite another coach's
// google_event_id, or trigger gcal operations bound to events they don't own.
async function assertBookingOwnership(bookingId: string, userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("coach_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error("Booking lookup failed");
  if (!data) throw new Error("Booking non trovato");
  if (data.coach_id !== userId) {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Permesso negato sul booking");
  }
}

export const gcalCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSchema.parse(input))
  .handler(async ({ data, context }): Promise<GcalResult<{ googleEventId: string; meetingLink: string | null; htmlLink: string | null }>> => {
    try {
      if (data.bookingId) {
        await assertBookingOwnership(data.bookingId, context.userId);
      }

      const r = await gcalCreate({
        summary: data.summary,
        description: data.description,
        startISO: data.startISO,
        endISO: data.endISO,
        attendeeEmail: data.attendeeEmail,
        requestMeet: data.requestMeet,
        isOnline: data.isOnline,
        colorId: data.colorId,
      });

      if (data.bookingId && r.googleEventId) {
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
