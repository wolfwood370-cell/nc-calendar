// ----------------------------------------------------------------------------
// Pure helpers per la selezione del pool di credito da scalare durante una
// prenotazione client-side. Tutte le funzioni sono closure-free: ricevono i
// dati come parametri così possono vivere in lib + essere riutilizzate (in
// futuro) anche da hook custom o test unit senza dipendere dal componente
// BookFlow originale.
// ----------------------------------------------------------------------------

import type { SessionType } from "@/lib/mock-data";
import type { AllocationRow } from "@/lib/queries";

/**
 * Chiave del pool di credito: event_type_id se presente, altrimenti il
 * session_type prefissato con `__` (gestione legacy delle allocations senza
 * event_type_id esplicito).
 */
export function allocKey(eventTypeId: string | null, type: SessionType): string {
  return eventTypeId ?? `__${type}`;
}

/** Subset structural del training_block che findAllocationForWeek consuma. */
export interface BlockForAllocation {
  start_date: string;
  allocations: AllocationRow[];
}

/**
 * Cerca un'allocation con credito disponibile nel blocco. Strategia:
 *   1. Preferisce stessa settimana del blocco (week_number = wn calcolata
 *      come `min(4, max(1, floor((slot - start_date)/7) + 1))`)
 *   2. Fallback su qualunque allocation matching del pool con residuo > 0
 *
 * Restituisce { id, remaining } dell'allocation scelta, o null se non
 * c'è capienza nel blocco.
 */
export function findAllocationForWeek(
  block: BlockForAllocation | null | undefined,
  type: SessionType,
  eventTypeId: string | null,
  isoDate: string,
): { id: string; remaining: number } | null {
  if (!block) return null;
  const slotDate = new Date(isoDate);
  const weeksFromStart = Math.floor(
    (slotDate.getTime() - new Date(block.start_date).getTime()) / (1000 * 60 * 60 * 24 * 7),
  );
  const wn = Math.min(4, Math.max(1, weeksFromStart + 1));
  const matchPool = (a: AllocationRow) =>
    eventTypeId
      ? a.event_type_id === eventTypeId
      : a.event_type_id === null && a.session_type === type;
  const sameWeek = block.allocations.find(
    (a) => matchPool(a) && a.week_number === wn && a.quantity_assigned - a.quantity_booked > 0,
  );
  if (sameWeek)
    return { id: sameWeek.id, remaining: sameWeek.quantity_assigned - sameWeek.quantity_booked };
  const fallback = block.allocations.find(
    (a) => matchPool(a) && a.quantity_assigned - a.quantity_booked > 0,
  );
  return fallback
    ? { id: fallback.id, remaining: fallback.quantity_assigned - fallback.quantity_booked }
    : null;
}

/** Subset structural di una riga extra_credits. */
export interface ExtraCreditRow {
  id: string;
  event_type_id: string | null;
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

/**
 * Cerca un extra_credit con quantità residua per il dato event_type,
 * ordinato per `expires_at` ASC (FIFO sui crediti che scadono prima).
 * Restituisce null se eventTypeId è falsy o non ci sono crediti residui.
 */
export function findExtraCredit(
  extraCredits: readonly ExtraCreditRow[] | null | undefined,
  eventTypeId: string | null,
): { id: string; quantity: number; quantity_booked: number } | null {
  if (!eventTypeId) return null;
  const candidates = (extraCredits ?? [])
    .filter((c) => c.event_type_id === eventTypeId && c.quantity - c.quantity_booked > 0)
    .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime());
  const first = candidates[0];
  return first
    ? { id: first.id, quantity: first.quantity, quantity_booked: first.quantity_booked }
    : null;
}
