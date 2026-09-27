// ----------------------------------------------------------------------------
// Uso di una tipologia di sessione (passata 07, audit E2 ed E4)
// ----------------------------------------------------------------------------
// Un helper solo, puro, per il piè della card, per il dialog d'eliminazione e
// per la verifica che l'eliminazione rifà sul database subito prima di
// cancellare. Per una tipologia e un «adesso»:
//   - sessioni di questo mese: la regola della «Distribuzione servizi» della
//     Panoramica (isCountedSession), sul mese intero di Roma, giorni dopo oggi
//     compresi;
//   - sessioni future: programmate, non eliminate, dopo adesso, di qualunque
//     cliente;
//   - clienti con crediti: un'allocazione con crediti rimasti in un blocco non
//     eliminato e non ancora finito, oppure un credito extra con crediti
//     rimasti (gli extra non scadono). Gli archiviati si contano a parte; chi
//     non è fra i clienti del coach non conta;
//   - sessioni passate, e se il negozio dei clienti la vende (un pacchetto
//     attivo col suo nome esatto: checkout e webhook la cercano così).
// Eliminare una tipologia toglie la tipologia a sessioni, allocazioni e
// crediti extra (le tre chiavi sono ON DELETE SET NULL): per questo una
// tipologia in uso non si elimina.
// ----------------------------------------------------------------------------

import { romeDate } from "@/lib/credit-order";
import { toIsoDate } from "@/lib/current-block";
import { isCountedSession } from "@/lib/service-distribution";
import type { AgendaBooking } from "@/lib/today-agenda";

export interface UsageBooking extends AgendaBooking {
  event_type_id: string | null;
}

export interface UsageAllocation {
  event_type_id: string | null;
  quantity_assigned: number;
  quantity_booked: number;
}

export interface UsageBlock {
  client_id: string;
  end_date: string;
  deleted_at?: string | null;
  allocations: readonly UsageAllocation[];
}

export interface UsageExtraCredit {
  client_id: string;
  event_type_id: string | null;
  quantity: number;
  quantity_booked: number;
}

export interface UsageClient {
  id: string;
  status: string;
}

export interface UsageData {
  bookings: readonly UsageBooking[];
  blocks: readonly UsageBlock[];
  extraCredits: readonly UsageExtraCredit[];
  /** Clienti del coach non eliminati, con lo stato. */
  clients: readonly UsageClient[];
  /** event_type_title dei pacchetti attivi del negozio. */
  shopTitles: readonly string[];
}

export interface TypeUsage {
  monthSessions: number;
  futureSessions: number;
  /** Clienti non archiviati con crediti di questo tipo. */
  clientsWithCredits: number;
  archivedClientsWithCredits: number;
  pastSessions: number;
  soldInShop: boolean;
}

export interface UsageType {
  id: string;
  name: string;
}

export function typeUsage(type: UsageType, data: UsageData, now: Date): TypeUsage {
  const nowMs = now.getTime();
  const month = romeDate(now.toISOString()).slice(0, 7);
  const today = toIsoDate(now);

  let monthSessions = 0;
  let futureSessions = 0;
  let pastSessions = 0;
  for (const b of data.bookings) {
    if (b.event_type_id !== type.id || b.deleted_at) continue;
    const t = new Date(b.scheduled_at).getTime();
    if (b.status === "scheduled" && t > nowMs) futureSessions += 1;
    if (t <= nowMs) pastSessions += 1;
    if (isCountedSession(b) && romeDate(b.scheduled_at).slice(0, 7) === month) monthSessions += 1;
  }

  const withCredits = new Set<string>();
  for (const block of data.blocks) {
    if (block.deleted_at || block.end_date.slice(0, 10) < today) continue;
    for (const a of block.allocations) {
      if (a.event_type_id === type.id && a.quantity_assigned - a.quantity_booked > 0) {
        withCredits.add(block.client_id);
      }
    }
  }
  for (const e of data.extraCredits) {
    if (e.event_type_id === type.id && e.quantity - e.quantity_booked > 0) {
      withCredits.add(e.client_id);
    }
  }
  const statusOf = new Map(data.clients.map((c) => [c.id, c.status]));
  let clientsWithCredits = 0;
  let archivedClientsWithCredits = 0;
  for (const id of withCredits) {
    const status = statusOf.get(id);
    if (status === undefined) continue;
    if (status === "archived") archivedClientsWithCredits += 1;
    else clientsWithCredits += 1;
  }

  return {
    monthSessions,
    futureSessions,
    clientsWithCredits,
    archivedClientsWithCredits,
    pastSessions,
    soldInShop: data.shopTitles.includes(type.name),
  };
}

/** In uso: sessioni future, clienti non archiviati con crediti o il negozio. */
export function isTypeInUse(u: TypeUsage): boolean {
  return u.futureSessions > 0 || u.clientsWithCredits > 0 || u.soldInShop;
}

// ---------------------------------------------------------------------------
// Testi
// ---------------------------------------------------------------------------

/** «a», «a e b», «a, b e c». */
function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Piè della card: «12 sessioni questo mese · 5 clienti con crediti». */
export function usageFooter(u: TypeUsage): string {
  const sessions = u.monthSessions === 1 ? "1 sessione" : `${u.monthSessions} sessioni`;
  const clients =
    u.clientsWithCredits === 1
      ? "1 cliente con crediti"
      : `${u.clientsWithCredits} clienti con crediti`;
  return `${sessions} questo mese · ${clients}`;
}

export const USAGE_UNAVAILABLE = "Utilizzo non disponibile";

export const USAGE_UNREADABLE = "Non riesco a leggere l'uso di questa tipologia: riprova.";

export const NOT_BOOKABLE_HINT =
  "Se vuoi solo che i clienti non la prenotino dall'app, rendila non prenotabile.";

export const ALREADY_NOT_BOOKABLE =
  "È già non prenotabile: i clienti non possono prenotarla dall'app.";

/** «È in uso: 3 sessioni future, 2 clienti hanno crediti di questo tipo e …». */
export function inUseSummary(u: TypeUsage): string {
  const parts: string[] = [];
  if (u.futureSessions > 0) {
    parts.push(
      u.futureSessions === 1 ? "1 sessione futura" : `${u.futureSessions} sessioni future`,
    );
  }
  if (u.clientsWithCredits > 0) {
    parts.push(
      u.clientsWithCredits === 1
        ? "1 cliente ha crediti di questo tipo"
        : `${u.clientsWithCredits} clienti hanno crediti di questo tipo`,
    );
  }
  if (u.soldInShop) parts.push("il negozio dei clienti la vende");
  return `È in uso: ${joinWithAnd(parts)}.`;
}

/** «Finché è in uso non si può eliminare: …», coi motivi delle parti vere. */
export function inUseReasons(u: TypeUsage): string {
  const sessions = u.futureSessions > 0;
  const credits = u.clientsWithCredits > 0;
  const reasons: string[] = [];
  if (sessions && credits) reasons.push("sessioni e crediti perderebbero la tipologia");
  else if (sessions) reasons.push("le sessioni perderebbero la tipologia");
  else if (credits) reasons.push("i crediti perderebbero la tipologia");
  if (u.soldInShop) reasons.push("il negozio dei clienti non la troverebbe più");
  return `Finché è in uso non si può eliminare: ${joinWithAnd(reasons)}.`;
}

/** Righe del dialog quando la tipologia non è in uso. */
export function notInUseLines(u: TypeUsage): string[] {
  const lines = ["Non ci sono sessioni future né clienti con crediti di questo tipo."];
  if (u.pastSessions > 0) {
    lines.push("Le sessioni passate restano nello storico, senza più questa tipologia.");
  }
  if (u.archivedClientsWithCredits > 0) {
    lines.push(
      u.archivedClientsWithCredits === 1
        ? "I crediti rimasti a 1 cliente archiviato perderebbero la tipologia."
        : `I crediti rimasti a ${u.archivedClientsWithCredits} clienti archiviati perderebbero la tipologia.`,
    );
  }
  return lines;
}

export type DeleteModel =
  | { kind: "in-use"; lines: string[]; canMakeNotBookable: boolean }
  | { kind: "free"; lines: string[] };

/** Cosa dice e cosa offre il dialog «Eliminare «<Nome>»?». */
export function deleteModel(type: { client_bookable: boolean }, u: TypeUsage): DeleteModel {
  if (isTypeInUse(u)) {
    return {
      kind: "in-use",
      lines: [
        inUseSummary(u),
        inUseReasons(u),
        type.client_bookable ? NOT_BOOKABLE_HINT : ALREADY_NOT_BOOKABLE,
      ],
      canMakeNotBookable: type.client_bookable,
    };
  }
  return { kind: "free", lines: notInUseLines(u) };
}
