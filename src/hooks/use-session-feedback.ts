// ----------------------------------------------------------------------------
// use-session-feedback — valutazione 1..5 post-sessione (design handoff)
// ----------------------------------------------------------------------------
// Tabella `session_feedback` (migrazione 20260703090000). Il cliente valuta
// l'ultima sessione completata dalla dashboard; il coach legge le valutazioni
// dei propri booking. Un solo feedback per booking (UNIQUE) — l'upsert
// permette di correggere la valutazione.
//
// Degradazione garbata pre-migrazione: vedi isMissingMigration in use-bia.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { isMissingMigration } from "@/hooks/use-bia";
import type { Database } from "@/integrations/supabase/types";

export type SessionFeedback = Database["public"]["Tables"]["session_feedback"]["Row"];

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

/** Cliente: registra (o corregge) la valutazione di una sessione completata. */
export function useSetSessionFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { booking_id: string; client_id: string; rating: number }) => {
      const { error } = await supabase
        .from("session_feedback")
        .upsert(input, { onConflict: "booking_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.sessionFeedback.client(input.client_id) });
    },
  });
}
