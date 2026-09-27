// ----------------------------------------------------------------------------
// Store Supabase della Disponibilità (passata 08)
// ----------------------------------------------------------------------------
// Le scritture di availability-actions.ts su trainer_availability e
// availability_exceptions. Ogni scrittura è una richiesta sola; inserire meno
// righe di quelle mandate è un errore, e la cancellazione restituisce gli id
// cancellati davvero (zero righe non è un successo: lo decide l'azione).
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import type { AvailabilityStore } from "@/lib/availability-actions";
import type { AvailabilityExceptionRow, AvailabilityRow } from "@/lib/queries";

const AVAILABILITY_COLS = "id, coach_id, day_of_week, start_time, end_time";
const EXCEPTION_COLS = "id, coach_id, date, start_time, end_time, reason";

function countError(got: number, sent: number): Error {
  return new Error(`inserite ${got} righe su ${sent}`);
}

export const supabaseAvailabilityStore: AvailabilityStore = {
  async listAvailability(coachId) {
    const { data, error } = await supabase
      .from("trainer_availability")
      .select(AVAILABILITY_COLS)
      .eq("coach_id", coachId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as AvailabilityRow[];
  },

  async insertAvailability(rows) {
    const { data, error } = await supabase
      .from("trainer_availability")
      .insert(rows)
      .select(AVAILABILITY_COLS);
    if (error) throw new Error(error.message);
    if (!data || data.length !== rows.length) throw countError(data?.length ?? 0, rows.length);
    return data as AvailabilityRow[];
  },

  async deleteAvailability(coachId, ids) {
    const { data, error } = await supabase
      .from("trainer_availability")
      .delete()
      .eq("coach_id", coachId)
      .in("id", ids)
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id);
  },

  async insertExceptions(rows) {
    const { data, error } = await supabase
      .from("availability_exceptions")
      .insert(rows)
      .select(EXCEPTION_COLS);
    if (error) throw new Error(error.message);
    if (!data || data.length !== rows.length) throw countError(data?.length ?? 0, rows.length);
    return data as AvailabilityExceptionRow[];
  },

  async deleteExceptions(coachId, ids) {
    const { data, error } = await supabase
      .from("availability_exceptions")
      .delete()
      .eq("coach_id", coachId)
      .in("id", ids)
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id);
  },
};
