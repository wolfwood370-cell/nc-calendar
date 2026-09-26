// ----------------------------------------------------------------------------
// Archivi Supabase della lista Clienti (passata 05)
// ----------------------------------------------------------------------------
// Le stesse chiamate che trainer.clients.index.tsx faceva prima: funzione edge
// admin-create-user, extra_credits, training_blocks, block_allocations e
// profiles per la creazione; client_invitations.status e profiles.status per
// inviti e archivio, con in più il filtro sullo stato di partenza.
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import type { ClientActionsStore } from "@/lib/client-actions";
import type { ClientCreateStore } from "@/lib/client-create";

export const supabaseClientCreateStore: ClientCreateStore = {
  async createUser(input) {
    const { data: res, error } = await supabase.functions.invoke("admin-create-user", {
      body: input,
    });
    const errMsg = (res as { error?: string } | null)?.error;
    const userId = (res as { user_id?: string } | null)?.user_id;
    if (error || errMsg || !userId) {
      return { error: errMsg ?? error?.message ?? "Creazione cliente non riuscita." };
    }
    return { userId };
  },

  async insertExtraCredit(row) {
    const { error } = await supabase.from("extra_credits").insert(row);
    if (error) throw error;
  },

  async updateProfile(id, patch) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) throw error;
  },

  async insertBlocks(rows) {
    const { data, error } = await supabase
      .from("training_blocks")
      .insert(rows)
      .select("id, sequence_order, end_date");
    if (error) throw error;
    return (data ?? []).map((b) => ({
      id: b.id as string,
      sequence_order: b.sequence_order as number,
      end_date: b.end_date as string,
    }));
  },

  async insertAllocations(rows) {
    const { error } = await supabase.from("block_allocations").insert(rows);
    if (error) throw error;
  },
};

export const supabaseClientActionsStore: ClientActionsStore = {
  async setInvitationStatus(id, from, to) {
    const { data, error } = await supabase
      .from("client_invitations")
      .update({ status: to })
      .eq("id", id)
      .eq("status", from)
      .select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  },

  async setClientStatus(id, from, to) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ status: to })
      .eq("id", id)
      .eq("status", from)
      .select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  },
};
