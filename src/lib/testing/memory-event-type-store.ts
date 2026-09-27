// ----------------------------------------------------------------------------
// Archivio in memoria per i test delle tipologie (passata 07)
// ----------------------------------------------------------------------------
// Fa quello che fa lo store Supabase (event-type-store.ts) su tabelle in
// memoria: tipologie, sessioni, blocchi con allocazioni, crediti extra,
// clienti e pacchetti del negozio. L'eliminazione fa quello che fanno le tre
// chiavi ON DELETE SET NULL del database: toglie la tipologia a sessioni,
// allocazioni e crediti extra. Tiene l'elenco delle scritture, per vedere
// cosa scrive ogni azione. Lo usano solo i test.
// ----------------------------------------------------------------------------

import type { EventTypeFields, EventTypePatch, EventTypeStore } from "@/lib/event-type-actions";
import type { UsageBooking, UsageExtraCredit } from "@/lib/event-type-usage";
import type { EventTypeRow } from "@/lib/queries";

export interface MemBlock {
  id: string;
  client_id: string;
  end_date: string;
  deleted_at: string | null;
}

export interface MemAllocation {
  block_id: string;
  event_type_id: string | null;
  quantity_assigned: number;
  quantity_booked: number;
}

export interface MemClient {
  id: string;
  coach_id: string;
  status: string;
  deleted_at: string | null;
}

export interface MemTypeDb {
  types: EventTypeRow[];
  bookings: UsageBooking[];
  blocks: MemBlock[];
  allocations: MemAllocation[];
  extraCredits: UsageExtraCredit[];
  clients: MemClient[];
  packs: { event_type_title: string; active: boolean }[];
}

export type MemWrite =
  | { op: "insert"; id: string; fields: EventTypeFields }
  | { op: "update"; id: string; patch: EventTypePatch }
  | { op: "delete"; id: string };

export interface MemoryEventTypes {
  store: EventTypeStore;
  db: MemTypeDb;
  writes: MemWrite[];
  /** Se vero, loadUsage fallisce (uso non leggibile). */
  failUsage: boolean;
  /** Eseguito dentro loadUsage dopo la lettura: simula chi scrive nel frattempo. */
  afterUsageRead?: () => void;
}

export function createMemoryEventTypes(db: MemTypeDb): MemoryEventTypes {
  let seq = 0;
  const mem: MemoryEventTypes = {
    db,
    writes: [],
    failUsage: false,
    store: {
      async listTypeNames(coachId) {
        return db.types
          .filter((t) => t.coach_id === coachId)
          .map((t) => ({ id: t.id, name: t.name }));
      },
      async activeShopTitles() {
        return db.packs.filter((p) => p.active).map((p) => p.event_type_title);
      },
      async insertType(coachId, fields) {
        seq += 1;
        const row: EventTypeRow = {
          id: `new-${seq}`,
          coach_id: coachId,
          base_type: "PT Session",
          ...fields,
        };
        db.types.push(row);
        mem.writes.push({ op: "insert", id: row.id, fields });
        return { ...row };
      },
      async updateType(id, patch) {
        const row = db.types.find((t) => t.id === id);
        if (!row) throw new Error("Tipologia non trovata: ricarica la pagina.");
        Object.assign(row, patch);
        mem.writes.push({ op: "update", id, patch: { ...patch } });
      },
      async deleteType(id) {
        const i = db.types.findIndex((t) => t.id === id);
        if (i < 0) throw new Error("Tipologia non trovata: ricarica la pagina.");
        db.types.splice(i, 1);
        // ON DELETE SET NULL sulle tre chiavi verso event_types.
        for (const b of db.bookings) if (b.event_type_id === id) b.event_type_id = null;
        for (const a of db.allocations) if (a.event_type_id === id) a.event_type_id = null;
        for (const e of db.extraCredits) if (e.event_type_id === id) e.event_type_id = null;
        mem.writes.push({ op: "delete", id });
      },
      async loadUsage(typeId, coachId) {
        if (mem.failUsage) throw new Error("permesso negato");
        const type = db.types.find((t) => t.id === typeId);
        if (!type) {
          return {
            name: null,
            data: { bookings: [], blocks: [], extraCredits: [], clients: [], shopTitles: [] },
          };
        }
        const allocs = db.allocations.filter((a) => a.event_type_id === typeId);
        const blockIds = new Set(allocs.map((a) => a.block_id));
        const blocks = db.blocks
          .filter((b) => blockIds.has(b.id))
          .map((b) => ({
            client_id: b.client_id,
            end_date: b.end_date,
            deleted_at: b.deleted_at,
            allocations: allocs.filter((a) => a.block_id === b.id).map((a) => ({ ...a })),
          }));
        const extraCredits = db.extraCredits
          .filter((e) => e.event_type_id === typeId)
          .map((e) => ({ ...e }));
        const clientIds = new Set([
          ...blocks.map((b) => b.client_id),
          ...extraCredits.map((e) => e.client_id),
        ]);
        const read = {
          name: type.name,
          data: {
            bookings: db.bookings
              .filter((b) => b.event_type_id === typeId && !b.deleted_at)
              .map((b) => ({ ...b })),
            blocks,
            extraCredits,
            clients: db.clients
              .filter((c) => c.coach_id === coachId && !c.deleted_at && clientIds.has(c.id))
              .map((c) => ({ id: c.id, status: c.status })),
            shopTitles: db.packs.filter((p) => p.active).map((p) => p.event_type_title),
          },
        };
        mem.afterUsageRead?.();
        return read;
      },
    },
  };
  return mem;
}
