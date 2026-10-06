// ----------------------------------------------------------------------------
// use-session-feedback — valutazione 1..5 post-sessione (design handoff)
// ----------------------------------------------------------------------------
// Tabella `session_feedback` (migrazione 20260703090000). Il cliente valuta
// l'ultima sessione completata dalla dashboard; il coach legge le valutazioni
// dei propri booking. Un solo feedback per booking (UNIQUE) — l'upsert
// permette di correggere la valutazione.
//
// Degradazione garbata pre-migrazione: vedi isMissingMigration in use-bia.
// La nota facoltativa (dettaglio della sessione, passata 04) vuole la colonna
// note, della migrazione del 02/10/2026: finché manca il voto si salva senza,
// e useSetSessionFeedback lo dice con noteSaved falso.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { isMissingMigration } from "@/hooks/use-bia";
import type { Database } from "@/integrations/supabase/types";

export type SessionFeedback = Database["public"]["Tables"]["session_feedback"]["Row"];
type FeedbackInsert = Database["public"]["Tables"]["session_feedback"]["Insert"];

/** Tutte le valutazioni del cliente (serve a capire quali sessioni completate
 *  sono ancora senza feedback). */
export function useClientFeedback(clientId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.sessionFeedback.client(clientId ?? ""),
    queryFn: async (): Promise<SessionFeedback[]> => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("session_feedback")
        .select("*")
        .eq("client_id", clientId);
      if (error) {
        if (isMissingMigration(error)) {
          console.warn(
            "use-session-feedback: tabella session_feedback assente (migrazione da applicare)",
          );
          return [];
        }
        throw new Error(error.message);
      }
      return data ?? [];
    },
    enabled: !!clientId,
    initialData: clientId ? undefined : [],
  });
}

/**
 * Cliente: registra (o corregge) la valutazione di una sessione completata.
 * `note`: una stringa, o null per toglierla; chi non la passa (la Home) non la
 * tocca, e la riga non ha la chiave. Senza la colonna note (PostgREST risponde
 * PGRST204, «Could not find the 'note' column … in the schema cache») riprova
 * una volta senza la nota e restituisce noteSaved falso.
 */
export function useSetSessionFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      booking_id: string;
      client_id: string;
      rating: number;
      note?: string | null;
    }): Promise<{ noteSaved: boolean }> => {
      const { note, ...row } = input;
      // La colonna note c'è dal giro del 02/10/2026 e i tipi rigenerati la
      // portano: niente cast. Senza la chiave la nota salvata resta com'è.
      const values: FeedbackInsert = note === undefined ? row : { ...row, note };
      const { error } = await supabase
        .from("session_feedback")
        .upsert(values, { onConflict: "booking_id" });
      if (!error) return { noteSaved: true };
      // Sull'errore di PostgREST, che ha il codice: new Error(error.message) lo perde.
      if (note !== undefined && isMissingMigration(error)) {
        const retry = await supabase
          .from("session_feedback")
          .upsert(row, { onConflict: "booking_id" });
        if (retry.error) throw new Error(retry.error.message);
        return { noteSaved: false };
      }
      throw new Error(error.message);
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.sessionFeedback.client(input.client_id) });
    },
  });
}
