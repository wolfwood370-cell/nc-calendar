// ----------------------------------------------------------------------------
// Archivio in memoria per i test del Profilo (passata 06)
// ----------------------------------------------------------------------------
// L'archivio del Calendario (memory-calendar-store.ts) più quello che serve a
// «Collega» (getEvent e updateEvent come in session-store.ts, con i filtri su
// cliente, blocco e impegno personale), a «Ignora» (ignored_by_clients) e a
// «Scollega dal profilo». Lo usano solo i test.
// ----------------------------------------------------------------------------

import type { AssignableEvent } from "@/lib/assign-event";
import type { UnlinkStore } from "@/lib/profile-session";
import type { EditStore } from "@/lib/session-edit";
import {
  createMemoryCalendar,
  type MemBooking,
  type MemDb,
  type MemoryCalendar,
} from "@/lib/testing/memory-calendar-store";
import type { AssignStore } from "@/lib/assign-event";

export type MemoryProfileStore = EditStore & AssignStore & UnlinkStore;

export interface MemoryProfile extends Omit<MemoryCalendar, "store"> {
  store: MemoryProfileStore;
  ignored: Map<string, string[]>;
  /** Aggiunge una riga bookings così com'è, senza trigger (eventi importati, annullate). */
  put(b: Partial<MemBooking> & Pick<MemBooking, "id" | "scheduled_at">): MemBooking;
}

export function createMemoryProfile(db: MemDb): MemoryProfile {
  const mem = createMemoryCalendar(db);
  const ignored = new Map<string, string[]>();
  const booking = (id: string) => db.bookings.find((b) => b.id === id) ?? null;

  const store: MemoryProfileStore = {
    ...mem.store,
    async getEvent(id) {
      const b = booking(id);
      if (!b) return null;
      const e: AssignableEvent = {
        id: b.id,
        status: b.status,
        deleted_at: b.deleted_at,
        client_id: b.client_id,
        coach_id: b.coach_id,
        is_personal: b.is_personal,
        category: b.category,
        block_id: b.block_id,
        event_type_id: b.event_type_id,
        session_type: b.session_type,
        scheduled_at: b.scheduled_at,
        title: b.title,
        notes: null,
      };
      return e;
    },
    async updateEvent(id, expected, patch) {
      const b = booking(id);
      if (
        !b ||
        b.client_id !== expected.client_id ||
        b.block_id !== expected.block_id ||
        b.is_personal !== expected.is_personal
      ) {
        return false;
      }
      Object.assign(b, patch);
      return true;
    },
    async markSpecial(id, category) {
      const b = booking(id);
      if (!b) return;
      Object.assign(b, {
        client_id: null,
        event_type_id: null,
        block_id: null,
        is_personal: true,
        category,
      });
    },
    async getIgnoredBy(id) {
      return [...(ignored.get(id) ?? [])];
    },
    async setIgnoredBy(id, clients) {
      ignored.set(id, [...clients]);
    },
    async unlinkSession(id, list) {
      const b = booking(id);
      if (!b) throw new Error("Sessione non trovata.");
      b.client_id = null;
      b.block_id = null;
      ignored.set(id, [...list]);
    },
  };

  function put(b: Partial<MemBooking> & Pick<MemBooking, "id" | "scheduled_at">): MemBooking {
    const row: MemBooking = {
      status: "scheduled",
      deleted_at: null,
      client_id: null,
      coach_id: "coach",
      is_personal: false,
      block_id: null,
      event_type_id: null,
      session_type: "PT Session",
      google_event_id: null,
      duration_min: 60,
      trainer_notes: null,
      title: null,
      category: "client_session",
      buffer_min: 0,
      end_at: new Date(Date.parse(b.scheduled_at) + (b.duration_min ?? 60) * 60_000).toISOString(),
      ...b,
    };
    db.bookings.push(row);
    return row;
  }

  return { ...mem, store, ignored, put };
}
