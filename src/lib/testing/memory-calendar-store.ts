// ----------------------------------------------------------------------------
// Archivio in memoria per i test del Calendario (passata 04)
// ----------------------------------------------------------------------------
// Riproduce, senza usare credit-order.ts, quello che fa il database:
//   - i trigger BEFORE INSERT su bookings, nell'ordine alfabetico in cui
//     girano: durate (set_booking_duration_defaults, 20260814102120_…sql),
//     credito di blocco (validate_booking_block_allocation) e credito extra
//     (validate_booking_extra_credits), 20260827143053_…sql:1-95;
//   - reschedule_booking (stesso file, :130-298);
//   - il trigger delle durate anche sugli UPDATE di scheduled_at,
//     duration_min ed event_type_id;
//   - il vincolo bookings_no_overlap_per_coach (20260522204517_…sql:147-150).
// Ogni scrittura è una transazione: se fallisce non resta niente a metà.
// Lo usano solo i test; l'app usa session-store.ts.
// ----------------------------------------------------------------------------

import type { BookingStatus, SessionType } from "@/lib/mock-data";
import type { CreditRef } from "@/lib/cancel-session";
import type { OrderedAllocation, OrderedExtraCredit } from "@/lib/credit-order";
import { coachWriteError, type NewSessionRow } from "@/lib/session-create";
import type { EditStore, EditableSession, SessionFieldsPatch } from "@/lib/session-edit";

export interface MemBlock {
  id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  deleted_at: string | null;
}

export interface MemExtra extends OrderedExtraCredit {
  client_id: string;
}

export interface MemType {
  id: string;
  name: string;
  duration: number;
  buffer_minutes: number;
  base_type: SessionType;
}

export interface MemBooking extends EditableSession {
  category: string;
  buffer_min: number;
  end_at: string;
}

export interface MemDb {
  types: MemType[];
  blocks: MemBlock[];
  allocations: OrderedAllocation[];
  extras: MemExtra[];
  bookings: MemBooking[];
}

class PgError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Data a Roma, come `(ts AT TIME ZONE 'Europe/Rome')::date`. */
function localDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function days(a: string, b: string): number {
  return (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function week(dateLocal: string, blockStart: string): number {
  return Math.min(4, Math.max(1, Math.floor(days(dateLocal, blockStart) / 7) + 1));
}

function inPool(a: OrderedAllocation, eventTypeId: string | null, sessionType: string): boolean {
  return (
    (eventTypeId !== null && a.event_type_id === eventTypeId) || a.session_type === sessionType
  );
}

/** ORDER BY del server: valid_until NULLS LAST, tipologia, settimana, distanza, created_at. */
function serverSort(
  list: OrderedAllocation[],
  eventTypeId: string | null,
  weekOf: (a: OrderedAllocation) => number,
): OrderedAllocation[] {
  return [...list].sort((a, b) => {
    const va = a.valid_until ?? "9999-12-31";
    const vb = b.valid_until ?? "9999-12-31";
    if (va !== vb) return va < vb ? -1 : 1;
    const ta = eventTypeId !== null && a.event_type_id === eventTypeId ? 0 : 1;
    const tb = eventTypeId !== null && b.event_type_id === eventTypeId ? 0 : 1;
    if (ta !== tb) return ta - tb;
    const wa = weekOf(a);
    const wb = weekOf(b);
    const ea = a.week_number === wa ? 0 : 1;
    const eb = b.week_number === wb ? 0 : 1;
    if (ea !== eb) return ea - eb;
    const da = Math.abs(a.week_number - wa);
    const dbb = Math.abs(b.week_number - wb);
    if (da !== dbb) return da - dbb;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

export interface MemoryCalendar {
  store: EditStore;
  db: MemDb;
  google: {
    created: string[];
    deleted: string[];
    updated: Array<{ id: string; startISO: string; endISO: string; summary?: string }>;
    failCreate: boolean;
    failUpdate: boolean;
  };
  /** Chiamate a reschedule_booking. */
  rescheduleCalls: Array<{ id: string; at: string }>;
  /** Update diretti di scheduled_at (non via reschedule_booking). */
  timeUpdates: string[];
  inserted: NewSessionRow[];
  booked(allocationId: string): number;
  extraBooked(extraId: string): number;
}

export function createMemoryCalendar(db: MemDb): MemoryCalendar {
  let seq = 0;
  const google: MemoryCalendar["google"] = {
    created: [],
    deleted: [],
    updated: [],
    failCreate: false,
    failUpdate: false,
  };
  const rescheduleCalls: MemoryCalendar["rescheduleCalls"] = [];
  const timeUpdates: string[] = [];
  const inserted: NewSessionRow[] = [];

  const clone = () => JSON.parse(JSON.stringify(db)) as MemDb;
  const restore = (snap: MemDb) => Object.assign(db, snap);
  /** Una transazione: se `fn` lancia, il database torna com'era. */
  function tx<T>(fn: () => T): T {
    const snap = clone();
    try {
      return fn();
    } catch (e) {
      restore(snap);
      throw e;
    }
  }

  const block = (id: string) => db.blocks.find((b) => b.id === id) ?? null;
  const clientBlocks = (clientId: string) =>
    db.blocks.filter((b) => b.client_id === clientId && !b.deleted_at);
  const booking = (id: string) => db.bookings.find((b) => b.id === id) ?? null;

  function applyDurations(b: MemBooking) {
    if (b.event_type_id) {
      const t = db.types.find((x) => x.id === b.event_type_id);
      if (t) {
        b.buffer_min = t.buffer_minutes;
        if (!b.google_event_id && (b.duration_min == null || b.duration_min === 60)) {
          b.duration_min = t.duration;
        }
      }
    }
    b.end_at = new Date(
      Date.parse(b.scheduled_at) + (b.duration_min + b.buffer_min) * 60_000,
    ).toISOString();
  }

  function checkOverlap(b: MemBooking) {
    if (b.status !== "scheduled" || b.deleted_at) return;
    const s = Date.parse(b.scheduled_at);
    const e = Date.parse(b.end_at);
    const clash = db.bookings.find(
      (o) =>
        o.id !== b.id &&
        o.coach_id === b.coach_id &&
        o.status === "scheduled" &&
        !o.deleted_at &&
        Date.parse(o.scheduled_at) < e &&
        Date.parse(o.end_at) > s,
    );
    if (clash) {
      throw new PgError(
        "23P01",
        'conflicting key value violates exclusion constraint "bookings_no_overlap_per_coach"',
      );
    }
  }

  function takeBlockCredit(b: MemBooking) {
    const blk = block(b.block_id!);
    if (!blk) throw new PgError("P0001", "Blocco di allenamento non trovato.");
    const w = week(localDate(b.scheduled_at), blk.start_date);
    const ids = new Set(clientBlocks(b.client_id!).map((x) => x.id));
    const cands = db.allocations.filter(
      (a) =>
        ids.has(a.block_id) &&
        a.quantity_assigned > a.quantity_booked &&
        inPool(a, b.event_type_id, b.session_type),
    );
    const a = serverSort(cands, b.event_type_id, () => w)[0];
    if (!a) throw new PgError("P0001", "Credito di blocco non disponibile per questa tipologia.");
    if (a.block_id !== b.block_id) b.block_id = a.block_id;
    a.quantity_booked += 1;
  }

  function takeExtraCredit(b: MemBooking) {
    if (!b.event_type_id) {
      throw new PgError(
        "P0001",
        "Credito esaurito: nessun tipo sessione specificato per la prenotazione.",
      );
    }
    const e = db.extras
      .filter(
        (x) =>
          x.client_id === b.client_id &&
          x.event_type_id === b.event_type_id &&
          x.quantity - x.quantity_booked > 0,
      )
      .sort((x, y) => Date.parse(x.expires_at) - Date.parse(y.expires_at))[0];
    if (!e) {
      throw new PgError(
        "P0001",
        "Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.",
      );
    }
    e.quantity_booked += 1;
  }

  const hasClient = (b: MemBooking) => !!b.client_id && b.client_id !== b.coach_id;

  function reschedule(id: string, at: string) {
    tx(() => {
      const b = booking(id);
      if (!b) throw new PgError("P0001", "Sessione non trovata.");
      if (b.deleted_at || b.status !== "scheduled") {
        throw new PgError("P0001", "Sessione gia annullata o conclusa.");
      }
      if (b.is_personal || !hasClient(b)) {
        throw new PgError("P0001", "Questa sessione non e riprogrammabile dal cliente.");
      }
      if (Date.parse(b.scheduled_at) === Date.parse(at)) {
        throw new PgError("P0001", "La nuova data coincide con quella attuale.");
      }
      const newLocal = localDate(at);
      if (b.block_id) {
        const blk = block(b.block_id)!;
        const oldWeek = week(localDate(b.scheduled_at), blk.start_date);
        const rel =
          serverSort(
            db.allocations.filter(
              (a) =>
                a.block_id === b.block_id &&
                a.quantity_booked > 0 &&
                inPool(a, b.event_type_id, b.session_type),
            ),
            b.event_type_id,
            () => oldWeek,
          )[0] ?? null;
        const ids = new Set(clientBlocks(b.client_id!).map((x) => x.id));
        const cand =
          serverSort(
            db.allocations.filter(
              (a) =>
                ids.has(a.block_id) &&
                (a.quantity_assigned > a.quantity_booked || a.id === rel?.id) &&
                inPool(a, b.event_type_id, b.session_type),
            ),
            b.event_type_id,
            (a) => week(newLocal, block(a.block_id)!.start_date),
          )[0] ?? null;
        if (!cand) {
          throw new PgError(
            "P0001",
            "Nessun credito disponibile per la nuova data in questa tipologia.",
          );
        }
        if (!(rel && rel.id === cand.id)) {
          if (!rel) throw new PgError("P0001", "Impossibile spostare la sessione.");
          rel.quantity_booked = Math.max(0, rel.quantity_booked - 1);
          cand.quantity_booked += 1;
        }
        if (cand.block_id !== b.block_id) b.block_id = cand.block_id;
      } else if (b.event_type_id) {
        const byExp = (l: MemExtra[]) =>
          [...l].sort((x, y) => Date.parse(x.expires_at) - Date.parse(y.expires_at))[0] ?? null;
        const mine = db.extras.filter(
          (x) => x.client_id === b.client_id && x.event_type_id === b.event_type_id,
        );
        const rel = byExp(mine.filter((x) => x.quantity_booked > 0));
        const cand = byExp(
          mine.filter((x) => x.quantity - x.quantity_booked > 0 || x.id === rel?.id),
        );
        if (!cand)
          throw new PgError("P0001", "Credito esaurito per la nuova data. Acquista un Booster.");
        if (!(rel && rel.id === cand.id)) {
          if (!rel) throw new PgError("P0001", "Impossibile spostare la sessione.");
          rel.quantity_booked = Math.max(0, rel.quantity_booked - 1);
          cand.quantity_booked += 1;
        }
      }
      b.scheduled_at = at;
      applyDurations(b);
      checkOverlap(b);
    });
  }

  const store: EditStore = {
    async getSession(id) {
      const b = booking(id);
      return b ? { ...b } : null;
    },
    async getEditableSession(id) {
      const b = booking(id);
      return b ? { ...b } : null;
    },
    async updateSession(id, expected, patch) {
      const b = booking(id);
      if (!b || b.status !== expected.status || !!b.deleted_at !== expected.deleted) return false;
      Object.assign(b, patch);
      return true;
    },
    async updateSessionFields(id, expected, patch: SessionFieldsPatch) {
      return tx(() => {
        const b = booking(id);
        if (!b || b.deleted_at) return false;
        for (const [k, v] of Object.entries(expected)) {
          const cur = (b as unknown as Record<string, unknown>)[k];
          const same =
            k === "scheduled_at" && typeof v === "string" && typeof cur === "string"
              ? Date.parse(v) === Date.parse(cur)
              : (cur ?? null) === (v ?? null);
          if (!same) return false;
        }
        if (patch.scheduled_at !== undefined) timeUpdates.push(id);
        Object.assign(b, patch);
        applyDurations(b);
        checkOverlap(b);
        return true;
      });
    },
    async rescheduleSession(id, at) {
      rescheduleCalls.push({ id, at });
      try {
        reschedule(id, at);
      } catch (e) {
        throw new Error(coachWriteError(e as PgError));
      }
    },
    async listAllocations(blockId) {
      return db.allocations.filter((a) => a.block_id === blockId).map((a) => ({ ...a }));
    },
    async getBlockStart(blockId) {
      return block(blockId)?.start_date ?? null;
    },
    async listExtraCredits(clientId, eventTypeId) {
      return db.extras
        .filter((x) => x.client_id === clientId && x.event_type_id === eventTypeId)
        .map((x) => ({ ...x }));
    },
    async listClientBlocks(clientId) {
      return clientBlocks(clientId).map((b) => ({ ...b }));
    },
    async listClientAllocations(clientId) {
      const ids = new Set(clientBlocks(clientId).map((b) => b.id));
      return db.allocations.filter((a) => ids.has(a.block_id)).map((a) => ({ ...a }));
    },
    async listClientExtraCredits(clientId) {
      return db.extras.filter((x) => x.client_id === clientId).map((x) => ({ ...x }));
    },
    async moveCredit(ref: CreditRef, delta) {
      if (ref.kind === "allocation") {
        const a = db.allocations.find((x) => x.id === ref.id);
        if (!a) return false;
        if (delta === 1 ? a.quantity_booked >= a.quantity_assigned : a.quantity_booked <= 0)
          return false;
        a.quantity_booked += delta;
        return true;
      }
      const e = db.extras.find((x) => x.id === ref.id);
      if (!e) return false;
      if (delta === 1 ? e.quantity_booked >= e.quantity : e.quantity_booked <= 0) return false;
      e.quantity_booked += delta;
      return true;
    },
    async insertSession(row) {
      inserted.push({ ...row });
      try {
        return tx(() => {
          const b: MemBooking = {
            id: `s${++seq}`,
            status: row.status as BookingStatus,
            deleted_at: null,
            client_id: row.client_id,
            coach_id: row.coach_id,
            is_personal: row.is_personal,
            block_id: row.block_id,
            event_type_id: row.event_type_id,
            session_type: row.session_type,
            scheduled_at: row.scheduled_at,
            google_event_id: null,
            duration_min: row.duration_min,
            trainer_notes: null,
            title: row.title,
            category: row.category,
            buffer_min: 0,
            end_at: row.end_at,
          };
          applyDurations(b);
          if (hasClient(b)) {
            if (b.block_id) takeBlockCredit(b);
            else takeExtraCredit(b);
          }
          checkOverlap(b);
          db.bookings.push(b);
          return { id: b.id };
        });
      } catch (e) {
        throw new Error(coachWriteError(e as PgError));
      }
    },
    async deleteGoogleEvent(gid) {
      google.deleted.push(gid);
      return true;
    },
    async createGoogleEvent(id) {
      if (google.failCreate) return false;
      const b = booking(id);
      if (!b) return false;
      b.google_event_id = `g-${id}`;
      google.created.push(id);
      return true;
    },
    async updateGoogleEvent(gid, event) {
      if (google.failUpdate) return false;
      google.updated.push({ id: gid, ...event });
      return true;
    },
  };

  return {
    store,
    db,
    google,
    rescheduleCalls,
    timeUpdates,
    inserted,
    booked: (id) => db.allocations.find((a) => a.id === id)?.quantity_booked ?? NaN,
    extraBooked: (id) => db.extras.find((x) => x.id === id)?.quantity_booked ?? NaN,
  };
}
