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

const CreateSchema = z.object({
  bookingId: z.string().uuid().optional(),
  summary: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  startISO: z.string().datetime({ offset: true }),
  endISO: z.string().datetime({ offset: true }),
  attendeeEmail: z.string().email().optional(),
  requestMeet: z.boolean().optional(),
  isOnline: z.boolean().optional(),
  colorId: z.string().max(2).optional(),
});

/** Crea l'evento Google Calendar e, se fornito bookingId, scrive
 *  google_event_id + meeting_link sulla riga booking. */
export const gcalCreateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateSchema.parse(input))
  .handler(async ({ data }): Promise<GcalResult<{ googleEventId: string; meetingLink: string | null; htmlLink: string | null }>> => {
    try {
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
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
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

export const gcalUpdateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data }): Promise<GcalResult<Record<string, never>>> => {
    try {
      await gcalUpdate(data);
      return { ok: true };
    } catch (e) {
      console.error("gcalUpdateEvent failed", e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

const DeleteSchema = z.object({
  googleEventId: z.string().min(1).max(1024),
});

export const gcalDeleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteSchema.parse(input))
  .handler(async ({ data }): Promise<GcalResult<Record<string, never>>> => {
    try {
      await gcalDelete(data.googleEventId);
      return { ok: true };
    } catch (e) {
      console.error("gcalDeleteEvent failed", e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
