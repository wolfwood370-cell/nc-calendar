// ----------------------------------------------------------------------------
// «In scadenza» — regola unica (audit P4, decisione del 25/09/2026)
// ----------------------------------------------------------------------------
// In scadenza significa: c'è da rinnovare.
//   - archiviati e clienti liberi: mai;
//   - abbonamento mensile col rinnovo automatico acceso: mai, perché il blocco
//     successivo lo crea il server (_auto_renew_cron_run ed
//     ensure_client_block_state in 20260827143325);
//   - percorso fisso, e abbonamento mensile col rinnovo spento: solo se il
//     blocco di riferimento è l'ultimo (dopo di lui nessun blocco valido) e
//     restano 2 crediti o meno, oppure il blocco finisce entro 7 giorni.
// Il blocco di riferimento è quello di resolveCurrentBlock: in corso,
// altrimenti il primo che deve iniziare, altrimenti l'ultimo. Un percorso
// concluso (blocco finito e nessun credito residuo) non è in scadenza.
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
import { resolveCurrentBlock, type BlockDates } from "@/lib/current-block";

export const RENEWAL_MAX_CREDITS = 2;
export const RENEWAL_MAX_DAYS = 7;

/** Campi del profilo che decidono se la regola si applica. */
export interface RenewalClient {
  /** profiles.status: "active" | "archived". */
  status: string;
  /** profiles.path_type: "fixed" | "recurring" | "free". */
  path_type: string | null;
  /**
   * profiles.auto_renew_blocks. null vale spento, come nel server
   * (COALESCE(auto_renew_blocks, false) in ensure_client_block_state).
   */
  auto_renew_blocks?: boolean | null;
}

/** Un blocco del percorso del cliente (training_blocks non eliminato). */
export interface RenewalBlock extends BlockDates {
  id: string;
  /** training_blocks.status; un blocco «cancelled» non conta. */
  status?: string | null;
}

export interface RenewalInfo {
  /** Motivo da mostrare: «Il blocco scade tra 3 giorni» oppure i crediti («1 credito rimasto»). */
  reason: string;
  /** Crediti residui del blocco di riferimento. */
  remaining: number;
  /** Giorni di calendario alla fine del blocco: 0 = finisce oggi, negativo = già finito. */
  daysLeft: number;
}

/** Un blocco annullato non fa parte del percorso. */
export function isValidBlock(b: Pick<RenewalBlock, "status">): boolean {
  return b.status !== "cancelled";
}

/** Abbonamento mensile col rinnovo automatico acceso: il server crea il blocco successivo. */
export function renewsAutomatically(client: RenewalClient): boolean {
  return client.path_type === "recurring" && client.auto_renew_blocks === true;
}

function comesAfter(b: BlockDates, ref: BlockDates): boolean {
  if (b.sequence_order !== ref.sequence_order) return b.sequence_order > ref.sequence_order;
  return b.start_date.slice(0, 10) > ref.start_date.slice(0, 10);
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
 * giorni alla fine del blocco di riferimento. Se valgono sia la data sia i
 * crediti, il motivo è la data. `blocks` sono i blocchi del cliente;
 * `allocations` può contenere righe di altri blocchi: contano solo quelle del
 * blocco di riferimento.
 */
export function getRenewalInfo(
  client: RenewalClient,
  blocks: readonly RenewalBlock[],
  allocations: readonly CreditAllocation[],
  now: Date = new Date(),
): RenewalInfo | null {
  if (client.status === "archived" || client.path_type === "free") return null;
  if (renewsAutomatically(client)) return null;
  const valid = blocks.filter(isValidBlock);
  const current = resolveCurrentBlock(valid, now);
  if (!current) return null;
  // Dopo il blocco di riferimento ce n'è già un altro: non c'è da rinnovare.
  if (valid.some((b) => b !== current && comesAfter(b, current))) return null;
  const remaining = sumCredits(getBlockCredits(current.id, allocations)).left;
  const daysLeft = differenceInCalendarDays(parseISO(current.end_date), now);
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

/** Blocco con le sue allocazioni, come lo carica useCoachBlocks. */
export interface RenewalBlockWithAllocations extends RenewalBlock {
  client_id: string;
  allocations: readonly CreditAllocation[];
}

/**
 * Clienti in scadenza con il loro motivo, nell'ordine di compareRenewals (a
 * parità, per nome). Tutti, senza tagli.
 */
export function listRenewals<
  C extends RenewalClient & { id: string; full_name?: string | null; email?: string | null },
>(
  clients: readonly C[],
  blocks: readonly RenewalBlockWithAllocations[],
  now: Date = new Date(),
): Array<{ client: C; info: RenewalInfo }> {
  const byClient = new Map<string, RenewalBlockWithAllocations[]>();
  for (const b of blocks) {
    const list = byClient.get(b.client_id) ?? [];
    list.push(b);
    byClient.set(b.client_id, list);
  }
  const name = (c: C) => c.full_name ?? c.email ?? "";
  const rows: Array<{ client: C; info: RenewalInfo }> = [];
  for (const client of clients) {
    const own = byClient.get(client.id) ?? [];
    const info = getRenewalInfo(
      client,
      own,
      own.flatMap((b) => b.allocations),
      now,
    );
    if (info) rows.push({ client, info });
  }
  return rows.sort(
    (a, b) =>
      compareRenewals(a.info, b.info) ||
      name(a.client).localeCompare(name(b.client), "it", { sensitivity: "base" }),
  );
}
