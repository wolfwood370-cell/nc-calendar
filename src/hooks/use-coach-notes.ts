// ----------------------------------------------------------------------------
// use-coach-notes — nota privata + obiettivo del coach sul cliente
// ----------------------------------------------------------------------------
// Tabella `coach_client_notes` (migrazione 20260703090000), card
// "Note & obiettivi" nel profilo cliente lato coach. Il salvataggio è un
// upsert sulla PK (coach_id, client_id); il debounce dell'autosave vive nel
// componente, qui solo la persistenza.
//
// Degradazione garbata pre-migrazione: vedi isMissingMigration in use-bia.
// ----------------------------------------------------------------------------

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { isMissingMigration } from "@/hooks/use-bia";
import type { Database } from "@/integrations/supabase/types";

export type CoachClientNote = Database["public"]["Tables"]["coach_client_notes"]["Row"];

export function useCoachClientNote(
  coachId: string | null | undefined,
  clientId: string | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.coachNotes(coachId ?? "", clientId ?? ""),
    queryFn: async (): Promise<CoachClientNote | null> => {
      if (!coachId || !clientId) return null;
      const { data, error } = await supabase
        .from("coach_client_notes")
        .select("*")
        .eq("coach_id", coachId)
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) {
        if (isMissingMigration(error)) {
          console.warn(
            "use-coach-notes: tabella coach_client_notes assente (migrazione da applicare)",
          );
          return null;
        }
        throw new Error(error.message);
      }
      return data;
    },
    enabled: !!coachId && !!clientId,
  });
}

export function useSaveCoachClientNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      coach_id: string;
      client_id: string;
      note?: string;
      goal?: string;
    }) => {
      const { error } = await supabase
        .from("coach_client_notes")
        .upsert(input, { onConflict: "coach_id,client_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({
        queryKey: queryKeys.coachNotes(input.coach_id, input.client_id),
      });
    },
  });
}
