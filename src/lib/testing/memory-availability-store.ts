// ----------------------------------------------------------------------------
// Archivio in memoria per i test della Disponibilità (passata 08)
// ----------------------------------------------------------------------------
// Fa quello che fa lo store Supabase (availability-store.ts) su due tabelle
// in memoria, trainer_availability e availability_exceptions, e tiene
// l'elenco delle richieste in ordine, letture comprese, per vedere cosa
// scrive ogni azione e in che ordine. Si può far fallire una lettura,
// l'inserimento o la cancellazione, o far cancellare meno righe del previsto.
// Lo usano solo i test.
// ----------------------------------------------------------------------------

import type { AvailabilityStore, NewAvailabilityRow } from "@/lib/availability-actions";
import type { NewExceptionRow } from "@/lib/availability-exceptions";
import type { AvailabilityExceptionRow, AvailabilityRow } from "@/lib/queries";

export interface MemAvailabilityDb {
  availability: AvailabilityRow[];
  exceptions: AvailabilityExceptionRow[];
}

export type MemAvailabilityRequest =
  | { op: "read"; table: "trainer_availability" }
  | { op: "insert"; table: "trainer_availability"; rows: NewAvailabilityRow[] }
  | { op: "delete"; table: "trainer_availability"; ids: string[] }
  | { op: "insert"; table: "availability_exceptions"; rows: NewExceptionRow[] }
  | { op: "delete"; table: "availability_exceptions"; ids: string[] };

export interface MemoryAvailability {
  store: AvailabilityStore;
  db: MemAvailabilityDb;
  /** Tutte le richieste, in ordine. */
  requests: MemAvailabilityRequest[];
  /** Solo le scritture, in ordine. */
  writes(): MemAvailabilityRequest[];
  /** Quale richiesta fallisce (una volta sola, poi torna a funzionare). */
  fail: {
    read?: boolean;
    /** Fallisce la seconda lettura (la rilettura dopo una cancellazione fallita). */
    reread?: boolean;
    insert?: boolean;
    delete?: boolean;
    /** La cancellazione ne toglie al massimo tante. */
    deleteAtMost?: number;
  };
}

export function createMemoryAvailability(db: MemAvailabilityDb): MemoryAvailability {
  let seq = 0;
  let reads = 0;
  const mem: MemoryAvailability = {
    db,
    requests: [],
    writes: () => mem.requests.filter((r) => r.op !== "read"),
    fail: {},
    store: {
      async listAvailability(coachId) {
        mem.requests.push({ op: "read", table: "trainer_availability" });
        reads += 1;
        if (mem.fail.read) {
          mem.fail.read = false;
          throw new Error("rete assente");
        }
        if (mem.fail.reread && reads > 1) {
          mem.fail.reread = false;
          throw new Error("rete assente");
        }
        return db.availability
          .filter((r) => r.coach_id === coachId)
          .map((r) => ({ ...r }))
          .sort(
            (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
          );
      },

      async insertAvailability(rows) {
        mem.requests.push({ op: "insert", table: "trainer_availability", rows });
        if (mem.fail.insert) {
          mem.fail.insert = false;
          throw new Error("violates check constraint");
        }
        const out = rows.map((r) => {
          seq += 1;
          return { id: `new-${seq}`, ...r };
        });
        db.availability.push(...out.map((r) => ({ ...r })));
        return out;
      },

      async deleteAvailability(coachId, ids) {
        mem.requests.push({ op: "delete", table: "trainer_availability", ids });
        if (mem.fail.delete) {
          mem.fail.delete = false;
          throw new Error("timeout");
        }
        let hit = db.availability.filter((r) => r.coach_id === coachId && ids.includes(r.id));
        if (mem.fail.deleteAtMost !== undefined) {
          hit = hit.slice(0, mem.fail.deleteAtMost);
          mem.fail.deleteAtMost = undefined;
        }
        const gone = new Set(hit.map((r) => r.id));
        db.availability = db.availability.filter((r) => !gone.has(r.id));
        return [...gone];
      },

      async insertExceptions(rows) {
        mem.requests.push({ op: "insert", table: "availability_exceptions", rows });
        if (mem.fail.insert) {
          mem.fail.insert = false;
          throw new Error("violates row-level security policy");
        }
        for (const r of rows) {
          if (r.id && db.exceptions.some((x) => x.id === r.id)) {
            throw new Error("duplicate key value violates unique constraint");
          }
        }
        const out = rows.map((r) => {
          seq += 1;
          return { ...r, id: r.id ?? `ex-${seq}` };
        });
        db.exceptions.push(...out.map((r) => ({ ...r })));
        return out;
      },

      async deleteExceptions(coachId, ids) {
        mem.requests.push({ op: "delete", table: "availability_exceptions", ids });
        if (mem.fail.delete) {
          mem.fail.delete = false;
          throw new Error("timeout");
        }
        let hit = db.exceptions.filter((r) => r.coach_id === coachId && ids.includes(r.id));
        if (mem.fail.deleteAtMost !== undefined) {
          hit = hit.slice(0, mem.fail.deleteAtMost);
          mem.fail.deleteAtMost = undefined;
        }
        const gone = new Set(hit.map((r) => r.id));
        db.exceptions = db.exceptions.filter((r) => !gone.has(r.id));
        return [...gone];
      },
    },
  };
  return mem;
}
