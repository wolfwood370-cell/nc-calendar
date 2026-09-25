// ----------------------------------------------------------------------------
// «In scadenza» — regola unica (audit P4)
// ----------------------------------------------------------------------------
// Un cliente è in scadenza se nel blocco in corso gli restano 2 crediti o
// meno, oppure se il blocco termina entro 7 giorni (da 0 a 7). Esclusi gli
// archiviati, i clienti liberi e i percorsi conclusi (blocco finito e nessun
// credito residuo). Riferimento: renewalInfo in
// design_handoff_coach_redesign/designs/nc-store.js.
// Da usare in Panoramica, lista Clienti (chip e tab) e Profilo, così lo stesso
// cliente risulta in scadenza ovunque.
// ----------------------------------------------------------------------------

import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  formatCreditsLeft,
  getBlockCredits,
  sumCredits,
  type CreditAllocation,
} from "@/lib/credits";

export const RENEWAL_MAX_CREDITS = 2;
export const RENEWAL_MAX_DAYS = 7;

/** Campi del profilo che escludono il cliente dalla regola. */
export interface RenewalClient {
  /** profiles.status: "active" | "archived". */
  status: string;
  /** profiles.path_type: "fixed" | "recurring" | "free". */
  path_type: string | null;
}

/** Il blocco in corso (o l'ultimo, se il percorso è terminato). */
export interface RenewalBlock {
  id: string;
  end_date: string;
}

export interface RenewalInfo {
  /** Motivo da mostrare: «Il blocco scade tra 3 giorni» oppure i crediti («1 credito rimasto»). */
  reason: string;
  /** Crediti residui del blocco. */
  remaining: number;
  /** Giorni di calendario alla fine del blocco: 0 = finisce oggi, negativo = già finito. */
  daysLeft: number;
}

function endsSoon(daysLeft: number): boolean {
  return daysLeft >= 0 && daysLeft <= RENEWAL_MAX_DAYS;
}

function blockEndReason(daysLeft: number): string {
  if (daysLeft === 0) return "Il blocco scade oggi";
  if (daysLeft === 1) return "Il blocco scade domani";
  return `Il blocco scade tra ${daysLeft} giorni`;
}

/**
 * null se il cliente non è in scadenza, altrimenti motivo, crediti residui e
 * giorni alla fine del blocco. Se valgono sia la data sia i crediti, il
 * motivo è la data. `allocations` può contenere righe di altri blocchi:
 * contano solo quelle di `currentBlock`.
 */
export function getRenewalInfo(
  client: RenewalClient,
  currentBlock: RenewalBlock | null | undefined,
  allocations: readonly CreditAllocation[],
  now: Date = new Date(),
): RenewalInfo | null {
  if (client.status === "archived" || client.path_type === "free" || !currentBlock) return null;
  const remaining = sumCredits(getBlockCredits(currentBlock.id, allocations)).left;
  const daysLeft = differenceInCalendarDays(parseISO(currentBlock.end_date), now);
  // Percorso concluso: il blocco è finito e non resta nulla da usare.
  if (daysLeft < 0 && remaining === 0) return null;
  const byDate = endsSoon(daysLeft);
  if (!byDate && remaining > RENEWAL_MAX_CREDITS) return null;
  return {
    reason: byDate ? blockEndReason(daysLeft) : formatCreditsLeft(remaining),
    remaining,
    daysLeft,
  };
}

/**
 * Ordine dei rinnovi: prima chi scade per data (meno giorni in cima), poi chi
 * è in scadenza per crediti (meno crediti in cima).
 */
export function compareRenewals(a: RenewalInfo, b: RenewalInfo): number {
  const rank = (r: RenewalInfo) =>
    endsSoon(r.daysLeft) ? r.daysLeft : RENEWAL_MAX_DAYS + 1 + r.remaining;
  return rank(a) - rank(b) || a.remaining - b.remaining;
}
