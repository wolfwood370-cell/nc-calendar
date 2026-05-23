// ----------------------------------------------------------------------------
// use-current-block — wraps ensure_client_block_state RPC
// ----------------------------------------------------------------------------
// Lazy state reconciler for monthly training blocks. The RPC is
// idempotent: it closes expired blocks past their 7-day grace and
// auto-creates the next one when profiles.auto_renew_blocks=true. We
// call it on dashboard mount so the same logic handles both runtime
// state and historical cleanup (single source of truth).
//
// See supabase/migrations/20260524110000_block_auto_renew.sql for the
// RPC + grace + FIFO semantics.
// ----------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CurrentBlockState {
  currentBlockId: string | null;
  inGracePeriod: boolean;
  previousBlockId: string | null;
  residualsFromPrevious: number;
  /** YYYY-MM-DD when the current block (or its grace tail) ends. */
  nextRenewalDate: string | null;
}

// Relaxed client shim — the ensure_client_block_state RPC lands in
// generated types only after Lovable regenerates post-migration. Same
// pattern used in use-notifications.ts before its cleanup commit.
interface BlockStateRow {
  current_block_id: string | null;
  in_grace_period: boolean;
  previous_block_id: string | null;
  residuals_from_previous: number;
  next_renewal_date: string | null;
}
interface RelaxedRpc {
  rpc: (
    fn: "ensure_client_block_state",
    args: { p_client_id: string },
  ) => Promise<{ data: BlockStateRow[] | null; error: { message: string } | null }>;
}
const sb = supabase as unknown as RelaxedRpc;

const EMPTY_STATE: CurrentBlockState = {
  currentBlockId: null,
  inGracePeriod: false,
  previousBlockId: null,
  residualsFromPrevious: 0,
  nextRenewalDate: null,
};

export function useCurrentBlock(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["current-block", clientId],
    enabled: !!clientId,
    // Block state transitions on the day boundary. 5-minute stale window
    // keeps things snappy without hammering the RPC on every render.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CurrentBlockState> => {
      if (!clientId) return EMPTY_STATE;
      const { data, error } = await sb.rpc("ensure_client_block_state", {
        p_client_id: clientId,
      });
      if (error) throw new Error(error.message);
      const row = data?.[0];
      if (!row) return EMPTY_STATE;
      return {
        currentBlockId: row.current_block_id ?? null,
        inGracePeriod: row.in_grace_period ?? false,
        previousBlockId: row.previous_block_id ?? null,
        residualsFromPrevious: row.residuals_from_previous ?? 0,
        nextRenewalDate: row.next_renewal_date ?? null,
      };
    },
  });
}
