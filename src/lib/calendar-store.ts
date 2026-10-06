// ----------------------------------------------------------------------------
// Store Supabase della creazione e della modifica dal Calendario (passata 04)
// ----------------------------------------------------------------------------
// Estende lo store della 02 (session-store.ts): stesse scritture
// condizionate, stesso evento Google. In più:
//   - insertSession: l'INSERT su bookings; il credito lo scalano i trigger;
//   - rescheduleSession: RPC reschedule_booking, come il cliente;
//   - updateSessionFields: UPDATE con un filtro per ogni valore atteso;
//   - updateGoogleEvent: gcalUpdateEvent.
// Gli errori del server arrivano al coach con coachWriteError.
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { gcalUpdateEvent } from "@/lib/gcal.functions";
import { coachWriteError } from "@/lib/session-create";
import type { EditStore, EditableSession, SessionFieldsExpected } from "@/lib/session-edit";
import { supabaseSessionStore } from "@/lib/session-store";

const EDITABLE_COLUMNS =
  "id, status, deleted_at, client_id, coach_id, is_personal, block_id, event_type_id, session_type, scheduled_at, google_event_id, duration_min, trainer_notes, title";

function writeError(e: { code?: string; message?: string }): Error {
  return new Error(coachWriteError(e));
}

export const supabaseCalendarStore: EditStore = {
  ...supabaseSessionStore,

  async listClientBlocks(clientId) {
    const { data, error } = await supabase
      .from("training_blocks")
      .select("id, start_date, end_date, sequence_order")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    if (error) throw writeError(error);
    return data ?? [];
  },

  async listClientAllocations(clientId) {
    const { data: blocks, error } = await supabase
      .from("training_blocks")
      .select("id")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    if (error) throw writeError(error);
    const ids = (blocks ?? []).map((b) => b.id);
    if (ids.length === 0) return [];
    const { data, error: aErr } = await supabase
      .from("block_allocations")
      .select(
        "id, block_id, event_type_id, session_type, week_number, quantity_assigned, quantity_booked, valid_until, created_at",
      )
      .in("block_id", ids);
    if (aErr) throw writeError(aErr);
    return data ?? [];
  },

  async listClientExtraCredits(clientId) {
    const { data, error } = await supabase
      .from("extra_credits")
      .select("id, event_type_id, quantity, quantity_booked, expires_at")
      .eq("client_id", clientId);
    if (error) throw writeError(error);
    return data ?? [];
  },

  async insertSession(row) {
    const { data, error } = await supabase.from("bookings").insert(row).select("id").single();
    if (error) throw writeError(error);
    return { id: data.id };
  },

  async getEditableSession(id) {
    const { data, error } = await supabase
      .from("bookings")
      .select(EDITABLE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw writeError(error);
    return (data as EditableSession | null) ?? null;
  },

  async updateSessionFields(id, expected: SessionFieldsExpected, patch) {
    let q = supabase.from("bookings").update(patch).eq("id", id).is("deleted_at", null);
    for (const [key, value] of Object.entries(expected)) {
      const column = key as keyof SessionFieldsExpected;
      q = value === null || value === undefined ? q.is(column, null) : q.eq(column, value);
    }
    const { data, error } = await q.select("id");
    if (error) throw writeError(error);
    return (data ?? []).length > 0;
  },

  async rescheduleSession(id, scheduledAt) {
    const { error } = await supabase.rpc("reschedule_booking", {
      p_booking_id: id,
      p_new_scheduled_at: scheduledAt,
    });
    if (error) throw writeError(error);
  },

  async updateGoogleEvent(googleEventId, event) {
    const r = await gcalUpdateEvent({ data: { googleEventId, ...event } });
    return r.ok;
  },
};
