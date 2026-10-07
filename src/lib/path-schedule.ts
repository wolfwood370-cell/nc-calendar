// ----------------------------------------------------------------------------
// Il calendario del percorso: il salvataggio (passata 13 del lato cliente)
// ----------------------------------------------------------------------------
// Il «Salva» del Percorso nel Profilo cliente, sul desktop e sul telefono.
// Fino alla passata 12 erano tre scritture separate (la data d'inizio su
// profiles, la cancellazione delle settimane in weekly_schedule, l'inserimento
// di quelle nuove): un errore dopo la cancellazione lasciava il cliente senza
// settimane salvate. Dal giro del server del 07/10/2026 è un'RPC sola, in una
// transazione:
//   save_path_schedule(p_client_id uuid, p_path_start_date date, p_rows jsonb)
//     RETURNS integer
//   - aggiorna profiles.path_start_date, cancella le settimane del cliente e
//     inserisce p_rows, un array di {week_number, block_number, monday_date
//     "YYYY-MM-DD", shifted}, con coach_id = il coach del cliente
//     (profiles.coach_id: per un coach è lui stesso);
//   - restituisce quante settimane ha scritto;
//   - errori: 42501 «Permesso negato.», P0001 «Dati del calendario non
//     validi.», 23505 su due settimane col numero uguale, 23502 su un campo
//     obbligatorio mancante; PGRST202 se la funzione non c'è (la migrazione
//     non ancora applicata; il suo ritorno indietro la lascia): allora non si
//     scrive niente.
// I tipi generati non hanno l'RPC finché Lovable non li rigenera: la chiamata
// rilassata di use-restore-booking.ts. I toast restano nei due componenti.
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import type { WeekRow } from "@/lib/client-profile";

/** Una settimana come la vuole save_path_schedule: i quattro campi, niente client_id né coach_id. */
export type PathScheduleRow = Pick<
  WeekRow,
  "week_number" | "block_number" | "monday_date" | "shifted"
>;

export interface SavePathScheduleArgs {
  p_client_id: string;
  /** La data d'inizio del percorso, YYYY-MM-DD. */
  p_path_start_date: string;
  p_rows: PathScheduleRow[];
}

interface RelaxedRpc {
  rpc: (
    fn: "save_path_schedule",
    args: SavePathScheduleArgs,
  ) => Promise<{ data: number | null; error: { code?: string; message: string } | null }>;
}
const sb = supabase as unknown as RelaxedRpc;

/**
 * Salva la data d'inizio e le settimane del percorso in una transazione sola
 * e restituisce quante settimane ha scritto il server. Delle settimane passano
 * solo i quattro campi, qualunque cosa ci sia accanto. Un errore (quello di
 * PostgREST, col suo code e il suo message) arriva al chiamante.
 */
export async function savePathSchedule(input: {
  clientId: string;
  pathStartDate: string;
  rows: readonly PathScheduleRow[];
}): Promise<number | null> {
  const { data, error } = await sb.rpc("save_path_schedule", {
    p_client_id: input.clientId,
    p_path_start_date: input.pathStartDate,
    p_rows: input.rows.map((r) => ({
      week_number: r.week_number,
      block_number: r.block_number,
      monday_date: r.monday_date,
      shifted: r.shifted,
    })),
  });
  if (error) throw error;
  return data;
}
