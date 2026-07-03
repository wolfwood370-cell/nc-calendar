// ----------------------------------------------------------------------------
// use-bia — misurazioni BIA (design handoff): lettura cliente + CRUD coach
// ----------------------------------------------------------------------------
// Tabella `bia_measurements` (migrazione 20260703090000). Il coach inserisce
// le misurazioni dal profilo cliente; il cliente le vede nel grafico
// "I tuoi progressi" della dashboard, aggiornato in realtime.
//
// Degradazione garbata: finché la migrazione non è applicata la tabella non
// esiste — la query intercetta l'errore "relation does not exist" e ritorna
// una lista vuota, così le card mostrano l'empty state invece di crashare.
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import type { Database } from "@/integrations/supabase/types";

export type BiaMeasurement = Database["public"]["Tables"]["bia_measurements"]["Row"];

/** true se l'errore PostgREST indica che la tabella/funzione non esiste ancora
 *  (migrazione non applicata). Codici: 42P01 = undefined_table (Postgres),
 *  PGRST205 = tabella non nello schema cache (PostgREST). */
export function isMissingMigration(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST202" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}

/** Misurazioni del cliente in ordine cronologico (per grafici e liste). */
export function useBiaMeasurements(clientId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.bia.client(clientId ?? ""),
    queryFn: async (): Promise<BiaMeasurement[]> => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from("bia_measurements")
        .select("*")
        .eq("client_id", clientId)
        .order("measured_on", { ascending: true });
      if (error) {
        if (isMissingMigration(error)) {
          console.warn("use-bia: tabella bia_measurements assente (migrazione da applicare)");
          return [];
        }
        throw new Error(error.message);
      }
      return data ?? [];
    },
    enabled: !!clientId,
    initialData: clientId ? undefined : [],
  });

  useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`bia:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bia_measurements",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: queryKeys.bia.client(clientId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clientId, qc]);

  return query;
}

export interface BiaInput {
  client_id: string;
  coach_id: string;
  measured_on: string; // YYYY-MM-DD
  weight_kg: number;
  muscle_kg: number;
  fat_pct: number;
}

/** Coach: aggiunge una misurazione (anche con data passata — il grafico la
 *  ordina cronologicamente lato query). */
export function useAddBiaMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BiaInput) => {
      const { error } = await supabase.from("bia_measurements").insert(input);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.bia.client(input.client_id) });
    },
  });
}

export function useUpdateBiaMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; client_id: string } & Partial<BiaInput>) => {
      const { id, client_id: _clientId, ...fields } = input;
      const { error } = await supabase.from("bia_measurements").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.bia.client(input.client_id) });
    },
  });
}

export function useDeleteBiaMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; client_id: string }) => {
      const { error } = await supabase.from("bia_measurements").delete().eq("id", input.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.bia.client(input.client_id) });
    },
  });
}
