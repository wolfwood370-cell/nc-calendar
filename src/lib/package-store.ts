// ----------------------------------------------------------------------------
// PackageStore su Supabase (per package-actions.ts)
// ----------------------------------------------------------------------------
// Stesse tabelle e stessi campi di `assignPackage` prima di questa passata:
// training_blocks, block_allocations, extra_credits, profiles. Le policy RLS
// «Coach manage …» permettono al coach di scrivere solo sui propri clienti.
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { EXTRA_EXPIRES_AT, type PackageStore } from "@/lib/package-actions";

export const supabasePackageStore: PackageStore = {
  async listBlocks(clientId) {
    const { data: blocks, error } = await supabase
      .from("training_blocks")
      .select("id, sequence_order, start_date, end_date, duration_days, grace_days")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    if (error) throw error;
    const ids = (blocks ?? []).map((b) => b.id);
    if (ids.length === 0) return [];
    const { data: allocations, error: aErr } = await supabase
      .from("block_allocations")
      .select(
        "block_id, week_number, session_type, event_type_id, quantity_assigned, quantity_booked",
      )
      .in("block_id", ids);
    if (aErr) throw aErr;
    return (blocks ?? []).map((b) => ({
      ...b,
      allocations: (allocations ?? []).filter((a) => a.block_id === b.id),
    }));
  },

  async getProfile(clientId) {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "path_type, pack_label, auto_renew, auto_renew_blocks, path_start_date, next_billing_date",
      )
      .eq("id", clientId)
      .single();
    if (error) throw error;
    return data;
  },

  async insertBlocks(rows) {
    const { data, error } = await supabase
      .from("training_blocks")
      .insert(rows)
      .select("id, sequence_order");
    if (error) throw error;
    return data ?? [];
  },

  async insertAllocations(rows) {
    const { error } = await supabase.from("block_allocations").insert(rows);
    if (error) throw error;
  },

  async bookedInBlocks(blockIds) {
    const { data, error } = await supabase
      .from("block_allocations")
      .select("quantity_booked")
      .in("block_id", blockIds);
    if (error) throw error;
    return (data ?? []).reduce((n, a) => n + a.quantity_booked, 0);
  },

  async removeBlocks(blockIds) {
    // Le allocazioni se ne vanno con il blocco (ON DELETE CASCADE).
    const { error } = await supabase.from("training_blocks").delete().in("id", blockIds);
    if (error) throw error;
  },

  async insertExtraCredit(row) {
    const { data, error } = await supabase
      .from("extra_credits")
      .insert({ ...row, quantity_booked: 0, expires_at: EXTRA_EXPIRES_AT })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  },

  async extraCreditBooked(id) {
    const { data, error } = await supabase
      .from("extra_credits")
      .select("quantity_booked")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data?.quantity_booked ?? null;
  },

  async deleteExtraCredit(id) {
    const { error } = await supabase.from("extra_credits").delete().eq("id", id);
    if (error) throw error;
  },

  async updateProfile(clientId, patch) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", clientId);
    if (error) throw error;
  },
};
