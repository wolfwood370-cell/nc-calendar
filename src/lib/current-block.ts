// ----------------------------------------------------------------------------
// Blocco in corso — regola unica
// ----------------------------------------------------------------------------
// Estratta dalla logica duplicata in client.book.tsx, client.index.tsx e
// client.settings.tsx (audit tecnico 21/09). Un blocco è «in corso» se la
// data di oggi cade tra start_date ed end_date, estremi inclusi. Le date
// YYYY-MM-DD si confrontano come date di calendario locali, come fa il server
// con Europe/Rome, invece di convertirle in mezzanotte UTC. A parità vince il
// sequence_order più basso.
// ----------------------------------------------------------------------------

import { format } from "date-fns";

/** Campi del training_block usati per stabilire quale blocco è in corso. */
export interface BlockDates {
  start_date: string;
  end_date: string;
  sequence_order: number;
}

/** Data di calendario locale in formato YYYY-MM-DD. */
export function toIsoDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function bySequence<T extends BlockDates>(blocks: readonly T[]): T[] {
  return [...blocks].sort((a, b) => a.sequence_order - b.sequence_order);
}

function contains(b: BlockDates, today: string): boolean {
  return b.start_date.slice(0, 10) <= today && today <= b.end_date.slice(0, 10);
}

/**
 * Il blocco che contiene oggi; null prima dell'inizio del percorso, tra due
 * blocchi non contigui e a percorso finito.
 */
export function findCurrentBlock<T extends BlockDates>(
  blocks: readonly T[],
  now: Date = new Date(),
): T | null {
  const today = toIsoDate(now);
  return bySequence(blocks).find((b) => contains(b, today)) ?? null;
}

/**
 * Blocco di riferimento del percorso: quello in corso; se non c'è, il primo
 * che deve ancora iniziare (percorso non ancora partito); altrimenti l'ultimo
 * (percorso terminato).
 */
export function resolveCurrentBlock<T extends BlockDates>(
  blocks: readonly T[],
  now: Date = new Date(),
): T | null {
  const today = toIsoDate(now);
  const sorted = bySequence(blocks);
  return (
    sorted.find((b) => contains(b, today)) ??
    sorted.find((b) => b.start_date.slice(0, 10) > today) ??
    sorted[sorted.length - 1] ??
    null
  );
}
