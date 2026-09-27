// ----------------------------------------------------------------------------
// Store Supabase delle tipologie di sessione (passata 07)
// ----------------------------------------------------------------------------
// Le scritture di event-type-actions.ts e la rilettura dell'uso prima di
// eliminare. Zero righe non è un successo: aggiornare o eliminare senza
// toccare una riga è un errore, e un'allocazione il cui blocco non si legge
// rende l'uso illeggibile.
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import type { EventTypeStore } from "@/lib/event-type-actions";
import type { UsageBlock, UsageBooking, UsageExtraCredit } from "@/lib/event-type-usage";
import { BOOKINGS_FETCH_LIMIT, fetchActiveShopTitles, type EventTypeRow } from "@/lib/queries";

export const EVENT_TYPE_COLS =
  "id, coach_id, name, description, color, duration, base_type, location_type, buffer_minutes, location_address, client_bookable, unavailable_message";

const NOT_FOUND = "Tipologia non trovata: ricarica la pagina.";

export const supabaseEventTypeStore: EventTypeStore = {
  async listTypeNames(coachId) {
    const { data, error } = await supabase
      .from("event_types")
      .select("id, name")
      .eq("coach_id", coachId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  activeShopTitles: fetchActiveShopTitles,

  async insertType(coachId, fields) {
    const { data, error } = await supabase
      .from("event_types")
      .insert({ coach_id: coachId, ...fields })
      .select(EVENT_TYPE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return data as EventTypeRow;
  },

  async updateType(id, patch) {
    const { data, error } = await supabase
      .from("event_types")
      .update(patch)
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error(NOT_FOUND);
  },

  async deleteType(id) {
    const { data, error } = await supabase.from("event_types").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error(NOT_FOUND);
  },

  async loadUsage(typeId, coachId) {
    const type = await supabase
      .from("event_types")
      .select("id, name")
      .eq("id", typeId)
      .maybeSingle();
    if (type.error) throw new Error(type.error.message);
    if (!type.data) {
      return {
        name: null,
        data: { bookings: [], blocks: [], extraCredits: [], clients: [], shopTitles: [] },
      };
    }

    const [bookings, allocations, extraCredits, shopTitles] = await Promise.all([
      // Le più recenti per prime, come useCoachBookings: le future ci sono sempre.
      supabase
        .from("bookings")
        .select("id, client_id, coach_id, status, scheduled_at, deleted_at, event_type_id")
        .eq("event_type_id", typeId)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: false })
        .limit(BOOKINGS_FETCH_LIMIT),
      // Col conteggio esatto: se PostgREST taglia le righe (max-rows), l'uso
      // non è certo e l'eliminazione si ferma.
      supabase
        .from("block_allocations")
        .select("block_id, event_type_id, quantity_assigned, quantity_booked", { count: "exact" })
        .eq("event_type_id", typeId),
      supabase
        .from("extra_credits")
        .select("client_id, event_type_id, quantity, quantity_booked", { count: "exact" })
        .eq("event_type_id", typeId),
      fetchActiveShopTitles(),
    ]);
    if (bookings.error) throw new Error(bookings.error.message);
    if (allocations.error) throw new Error(allocations.error.message);
    if (extraCredits.error) throw new Error(extraCredits.error.message);
    for (const res of [allocations, extraCredits]) {
      if (res.count !== (res.data ?? []).length) throw new Error("Righe dei crediti tagliate.");
    }

    const allocs = allocations.data ?? [];
    const blockIds = [...new Set(allocs.map((a) => a.block_id))];
    let blocks: UsageBlock[] = [];
    if (blockIds.length > 0) {
      const res = await supabase
        .from("training_blocks")
        .select("id, client_id, end_date, deleted_at")
        .in("id", blockIds);
      if (res.error) throw new Error(res.error.message);
      const rows = res.data ?? [];
      // Ogni allocazione ha il suo blocco: se non si legge, l'uso non è certo.
      if (rows.length !== blockIds.length) {
        throw new Error("Blocchi dei crediti non leggibili.");
      }
      blocks = rows.map((b) => ({
        client_id: b.client_id,
        end_date: b.end_date,
        deleted_at: b.deleted_at,
        allocations: allocs.filter((a) => a.block_id === b.id),
      }));
    }

    const credits = (extraCredits.data ?? []) as UsageExtraCredit[];
    const clientIds = [
      ...new Set([...blocks.map((b) => b.client_id), ...credits.map((e) => e.client_id)]),
    ];
    let clients: { id: string; status: string }[] = [];
    if (clientIds.length > 0) {
      // Come useCoachClients: i clienti del coach non eliminati.
      const res = await supabase
        .from("profiles")
        .select("id, status")
        .eq("coach_id", coachId)
        .is("deleted_at", null)
        .in("id", clientIds);
      if (res.error) throw new Error(res.error.message);
      clients = res.data ?? [];
    }

    return {
      name: type.data.name,
      data: {
        bookings: (bookings.data ?? []) as UsageBooking[],
        blocks,
        extraCredits: credits,
        clients,
        shopTitles,
      },
    };
  },
};
