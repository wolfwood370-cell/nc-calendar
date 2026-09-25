// ----------------------------------------------------------------------------
// Crediti dei pacchetti — unità e conteggi condivisi
// ----------------------------------------------------------------------------
// Audit V2: l'unità è sempre «crediti», con il singolare corretto.
// Audit L8/V6: i crediti mostrati sono quelli del blocco in corso, calcolati
// come quantity_assigned − quantity_booked. Il credito si impegna alla
// prenotazione (quantity_booked sale quando la sessione viene prenotata),
// quindi il check-in segna la sessione come svolta senza cambiare il residuo.
// ----------------------------------------------------------------------------

import { allocKey } from "@/lib/booking-allocation";
import { findCurrentBlock, type BlockDates } from "@/lib/current-block";
import type { SessionType } from "@/lib/mock-data";

/** «1 credito rimasto» · «N crediti rimasti» · «Crediti esauriti». */
export function formatCreditsLeft(n: number): string {
  if (n <= 0) return "Crediti esauriti";
  return n === 1 ? "1 credito rimasto" : `${n} crediti rimasti`;
}

/** «6 di 13 rimasti»; singolare con un solo credito residuo: «1 di 1 rimasto». */
export function formatCreditsOf(left: number, total: number): string {
  const l = Math.max(0, left);
  return `${l} di ${total} ${l === 1 ? "rimasto" : "rimasti"}`;
}

/** Subset di una riga block_allocations usato per i conteggi. */
export interface CreditAllocation {
  block_id: string;
  event_type_id: string | null;
  session_type: SessionType;
  quantity_assigned: number;
  quantity_booked: number;
}

/** Crediti di una tipologia in un blocco. */
export interface TypeCredits {
  /** Chiave del pool (allocKey): event_type_id, o `__<session_type>` per le allocazioni legacy. */
  key: string;
  eventTypeId: string | null;
  sessionType: SessionType;
  assigned: number;
  booked: number;
  /** assigned − booked, mai sotto zero. */
  left: number;
}

/** Crediti per tipologia di un blocco, nell'ordine in cui compaiono le allocazioni. */
export function getBlockCredits(
  blockId: string,
  allocations: readonly CreditAllocation[],
): TypeCredits[] {
  const byKey = new Map<string, TypeCredits>();
  for (const a of allocations) {
    if (a.block_id !== blockId) continue;
    const key = allocKey(a.event_type_id, a.session_type);
    const row = byKey.get(key) ?? {
      key,
      eventTypeId: a.event_type_id,
      sessionType: a.session_type,
      assigned: 0,
      booked: 0,
      left: 0,
    };
    row.assigned += a.quantity_assigned;
    row.booked += a.quantity_booked;
    row.left = Math.max(0, row.assigned - row.booked);
    byKey.set(key, row);
  }
  return [...byKey.values()];
}

/** Crediti per tipologia del blocco in corso; vuoto se oggi nessun blocco è in corso. */
export function getCurrentBlockCredits(
  blocks: readonly (BlockDates & { id: string })[],
  allocations: readonly CreditAllocation[],
  now: Date = new Date(),
): TypeCredits[] {
  const current = findCurrentBlock(blocks, now);
  return current ? getBlockCredits(current.id, allocations) : [];
}

/** Totali di più tipologie: assegnati, prenotati, residui. */
export function sumCredits(rows: readonly TypeCredits[]): {
  assigned: number;
  booked: number;
  left: number;
} {
  return rows.reduce(
    (acc, r) => ({
      assigned: acc.assigned + r.assigned,
      booked: acc.booked + r.booked,
      left: acc.left + r.left,
    }),
    { assigned: 0, booked: 0, left: 0 },
  );
}
