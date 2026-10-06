// ----------------------------------------------------------------------------
// Lista Clienti: stati, tab, crediti, presenza, ordinamento, URL (passata 05)
// ----------------------------------------------------------------------------
// Brief design_handoff_coach_redesign/passes/05-clienti.md (L2, L7, L8, T4, V5).
//   - Stato: archiviato; «In scadenza» dalla regola unica di renewal.ts (la
//     stessa della Panoramica), prima di «Completato»; completato quando le
//     sessioni del percorso hanno usato tutti i crediti assegnati (conteggio
//     di trainer.clients.index.tsx prima della passata 05, invariato);
//     altrimenti attivo.
//   - Crediti in scheda: blocco di riferimento (resolveCurrentBlock, lo stesso
//     di «In scadenza»), «Crediti del mese» per gli abbonamenti, «Crediti
//     extra» per i liberi.
//   - Presenza: getAttendance, la stessa del Profilo.
//   - Ordinamenti del brief, a parità per nome.
//   - Stato della lista nell'URL: q, stato, vista, ordina; new=cliente apre
//     «Nuovo cliente» e poi si toglie.
// ----------------------------------------------------------------------------

import { extraTotals } from "@/lib/extra-credits";
import { getAttendance } from "@/lib/attendance";
import { matchesClient } from "@/lib/client-search";
import { formatCreditsOf, getBlockCredits, sumCredits, type CreditAllocation } from "@/lib/credits";
import { blockTimingNote, resolveCurrentBlock } from "@/lib/current-block";
import {
  getRenewalInfo,
  isValidBlock,
  type RenewalBlock,
  type RenewalClient,
  type RenewalInfo,
} from "@/lib/renewal";

export type ClientStatus = "active" | "expiring" | "completed" | "archived";
export type ClientTab = "all" | ClientStatus;
export type ClientSort = "name" | "left" | "expiry" | "activity" | "attendance";
export type ClientView = "grid" | "table";

export const CLIENT_TABS: readonly ClientTab[] = [
  "all",
  "active",
  "expiring",
  "completed",
  "archived",
];
export const CLIENT_SORTS: readonly ClientSort[] = [
  "name",
  "left",
  "expiry",
  "activity",
  "attendance",
];

export const TAB_LABEL: Record<ClientTab, string> = {
  all: "Tutti",
  active: "Attivi",
  expiring: "In scadenza",
  completed: "Completati",
  archived: "Archiviati",
};
export const STATUS_LABEL: Record<ClientStatus, string> = {
  active: "Attivo",
  expiring: "In scadenza",
  completed: "Completato",
  archived: "Archiviato",
};
export const SORT_LABEL: Record<ClientSort, string> = {
  name: "Nome (A–Z)",
  left: "Crediti residui",
  expiry: "Scadenza del blocco",
  activity: "Ultima sessione svolta",
  attendance: "Presenza più bassa",
};

// ----------------------------------------------------------------------------
// Dati
// ----------------------------------------------------------------------------

export interface ListClient extends RenewalClient {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  pack_label: string | null;
}

export interface ListBlock extends RenewalBlock {
  client_id: string;
}

export interface ListAllocation extends CreditAllocation {
  block_id: string;
}

export interface ListBooking {
  client_id: string;
  event_type_id: string | null;
  session_type: string;
  status: string;
  scheduled_at: string;
}

export interface ListExtraCredit {
  client_id: string;
  quantity: number;
  quantity_booked: number;
  /** La scadenza: si contano solo i crediti che valgono adesso (extraTotals, passata 11). */
  expires_at: string;
}

/**
 * Sessioni usate e crediti assegnati su tutto il percorso, per tipologia (o
 * session_type per le allocazioni senza tipologia): prenotate, svolte e
 * annullate tardi contano, e per ogni tipologia non si va oltre l'assegnato.
 * È il conteggio con cui la lista decideva «Completato» prima della passata
 * 05, portato qui senza cambiarlo.
 */
export function pathProgress(
  allocations: readonly Pick<
    ListAllocation,
    "event_type_id" | "session_type" | "quantity_assigned"
  >[],
  bookings: readonly Pick<ListBooking, "event_type_id" | "session_type" | "status">[],
): { used: number; total: number } {
  const keyOf = (etId: string | null, st: string) => etId ?? `st:${st}`;
  const agg = new Map<string, { used: number; total: number }>();
  for (const a of allocations) {
    const k = keyOf(a.event_type_id, a.session_type);
    const cur = agg.get(k) ?? { used: 0, total: 0 };
    cur.total += a.quantity_assigned;
    agg.set(k, cur);
  }
  for (const b of bookings) {
    if (b.status !== "completed" && b.status !== "late_cancelled" && b.status !== "scheduled") {
      continue;
    }
    const cur = agg.get(keyOf(b.event_type_id ?? null, b.session_type));
    if (cur) cur.used += 1;
  }
  let used = 0;
  let total = 0;
  for (const r of agg.values()) {
    if (r.total <= 0) continue;
    used += Math.min(r.used, r.total);
    total += r.total;
  }
  return { used, total };
}

/** Stato del cliente nella lista (chip e tab). */
export function clientStatus(
  client: ListClient,
  blocks: readonly ListBlock[],
  allocations: readonly ListAllocation[],
  bookings: readonly ListBooking[],
  now: Date,
): ClientStatus {
  if (client.status === "archived") return "archived";
  if (getRenewalInfo(client, blocks, allocations, now)) return "expiring";
  const p = pathProgress(allocations, bookings);
  if (p.total > 0 && p.used >= p.total) return "completed";
  return "active";
}

export interface CardCredits {
  /** «Crediti del blocco 3 di 6», «Crediti del mese», «Crediti extra». */
  title: string;
  left: number;
  total: number;
  /** «6 di 13 rimasti». */
  label: string;
  /** «6/13». */
  short: string;
}

/** Crediti da mostrare in scheda; null se non ce ne sono (niente barra). */
export function cardCredits(
  client: ListClient,
  blocks: readonly ListBlock[],
  allocations: readonly ListAllocation[],
  extras: readonly ListExtraCredit[],
  now: Date,
): CardCredits | null {
  let title: string;
  let left: number;
  let total: number;
  if (client.path_type === "free") {
    title = "Crediti extra";
    // Solo quelli che valgono adesso: un Booster scaduto non è più un credito
    // (passata 11 del lato cliente; prima si sommavano tutti).
    ({ total, left } = extraTotals(extras, now));
  } else {
    const valid = [...blocks.filter(isValidBlock)].sort(
      (a, b) => a.sequence_order - b.sequence_order,
    );
    const ref = resolveCurrentBlock(valid, now);
    if (!ref) return null;
    const c = sumCredits(getBlockCredits(ref.id, allocations));
    left = c.left;
    total = c.assigned;
    title =
      client.path_type === "recurring"
        ? "Crediti del mese"
        : `Crediti del blocco ${valid.indexOf(ref) + 1} di ${valid.length}`;
    // Fra due blocchi, o a percorso finito, il blocco mostrato non è in corso (V6).
    const note = blockTimingNote(ref, now);
    if (note) title = `${title} · ${note}`;
  }
  if (total <= 0) return null;
  return { title, left, total, label: formatCreditsOf(left, total), short: `${left}/${total}` };
}

/** Fine del blocco di riferimento (YYYY-MM-DD), per «Scadenza del blocco». */
export function referenceBlockEnd(blocks: readonly ListBlock[], now: Date): string | null {
  const ref = resolveCurrentBlock(blocks.filter(isValidBlock), now);
  return ref ? ref.end_date.slice(0, 10) : null;
}

export interface ClientRow {
  client: ListClient;
  status: ClientStatus;
  renewal: RenewalInfo | null;
  credits: CardCredits | null;
  /** getAttendance, percentuale; null senza sessioni concluse nel periodo. */
  attendance: number | null;
  nextSessionMs: number | null;
  lastActivityMs: number | null;
  blockEnd: string | null;
}

export interface ClientListData {
  clients: readonly ListClient[];
  blocks: readonly ListBlock[];
  allocations: readonly ListAllocation[];
  bookings: readonly ListBooking[];
  extras: readonly ListExtraCredit[];
}

function groupBy<T>(items: readonly T[], key: (t: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!k) continue;
    const list = m.get(k) ?? [];
    list.push(it);
    m.set(k, list);
  }
  return m;
}

export function buildClientRows(data: ClientListData, now: Date): ClientRow[] {
  const blocksBy = groupBy(data.blocks, (b) => b.client_id);
  const clientOfBlock = new Map(data.blocks.map((b) => [b.id, b.client_id]));
  const allocsBy = groupBy(data.allocations, (a) => clientOfBlock.get(a.block_id));
  const bookingsBy = groupBy(data.bookings, (b) => b.client_id);
  const extrasBy = groupBy(data.extras, (e) => e.client_id);
  const nowMs = now.getTime();
  return data.clients.map((client) => {
    const blocks = blocksBy.get(client.id) ?? [];
    const allocs = allocsBy.get(client.id) ?? [];
    const bookings = bookingsBy.get(client.id) ?? [];
    let nextSessionMs: number | null = null;
    let lastActivityMs: number | null = null;
    for (const b of bookings) {
      const t = new Date(b.scheduled_at).getTime();
      if (b.status === "scheduled" && t > nowMs && (nextSessionMs === null || t < nextSessionMs)) {
        nextSessionMs = t;
      }
      if (b.status === "completed" && (lastActivityMs === null || t > lastActivityMs)) {
        lastActivityMs = t;
      }
    }
    const status = clientStatus(client, blocks, allocs, bookings, now);
    return {
      client,
      status,
      renewal: status === "expiring" ? getRenewalInfo(client, blocks, allocs, now) : null,
      credits: cardCredits(client, blocks, allocs, extrasBy.get(client.id) ?? [], now),
      attendance: getAttendance(bookings, now)?.percent ?? null,
      nextSessionMs,
      lastActivityMs,
      blockEnd: client.path_type === "free" ? null : referenceBlockEnd(blocks, now),
    };
  });
}

// ----------------------------------------------------------------------------
// Tab, ricerca, ordinamento
// ----------------------------------------------------------------------------

export type TabCounts = Record<ClientTab, number>;

/** Conteggi dei tab; «Tutti» esclude gli archiviati. */
export function tabCounts(rows: readonly Pick<ClientRow, "status">[]): TabCounts {
  const c: TabCounts = { all: 0, active: 0, expiring: 0, completed: 0, archived: 0 };
  for (const r of rows) {
    c[r.status]++;
    if (r.status !== "archived") c.all++;
  }
  return c;
}

export function inTab(status: ClientStatus, tab: ClientTab): boolean {
  return tab === "all" ? status !== "archived" : status === tab;
}

export function filterRows<R extends Pick<ClientRow, "status" | "client">>(
  rows: readonly R[],
  tab: ClientTab,
  q: string,
): R[] {
  return rows.filter((r) => inTab(r.status, tab) && matchesClient(r.client, q));
}

function nameOf(r: Pick<ClientRow, "client">): string {
  return r.client.full_name ?? r.client.email ?? "";
}

function byName(a: Pick<ClientRow, "client">, b: Pick<ClientRow, "client">): number {
  return (
    nameOf(a).localeCompare(nameOf(b), "it", { sensitivity: "base" }) ||
    a.client.id.localeCompare(b.client.id)
  );
}

/** Valori mancanti sempre in fondo. */
function nullsLast(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === null ? (b === null ? 0 : 1) : -1;
  return a - b;
}

const SORT_KEY: Record<Exclude<ClientSort, "name">, (r: ClientRow) => number | null> = {
  // Meno crediti residui in cima; senza crediti in fondo.
  left: (r) => (r.credits ? r.credits.left : null),
  // Blocco che finisce prima in cima.
  expiry: (r) => (r.blockEnd ? Date.parse(`${r.blockEnd}T00:00:00Z`) : null),
  // Ultima sessione svolta più recente in cima.
  activity: (r) => (r.lastActivityMs === null ? null : -r.lastActivityMs),
  // Presenza più bassa in cima.
  attendance: (r) => r.attendance,
};

/** Ordinamento stabile: a parità di valore, per nome. */
export function sortRows(rows: readonly ClientRow[], sort: ClientSort): ClientRow[] {
  const list = [...rows];
  if (sort === "name") return list.sort(byName);
  const key = SORT_KEY[sort];
  return list.sort((a, b) => nullsLast(key(a), key(b)) || byName(a, b));
}

// ----------------------------------------------------------------------------
// URL (T4)
// ----------------------------------------------------------------------------

export interface ClientsSearch {
  q?: string;
  stato?: Exclude<ClientTab, "all">;
  vista?: "tabella";
  ordina?: Exclude<ClientSort, "name">;
  new?: "cliente";
}

export interface ClientsListState {
  q: string;
  tab: ClientTab;
  view: ClientView;
  sort: ClientSort;
}

export function parseClientsSearch(search: Record<string, unknown>): ClientsSearch {
  const q = typeof search.q === "string" ? search.q.slice(0, 200) : "";
  const stato = search.stato;
  const ordina = search.ordina;
  return {
    q: q.trim() ? q : undefined,
    stato:
      typeof stato === "string" && stato !== "all" && (CLIENT_TABS as string[]).includes(stato)
        ? (stato as ClientsSearch["stato"])
        : undefined,
    vista: search.vista === "tabella" ? "tabella" : undefined,
    ordina:
      typeof ordina === "string" && ordina !== "name" && (CLIENT_SORTS as string[]).includes(ordina)
        ? (ordina as ClientsSearch["ordina"])
        : undefined,
    new: search.new === "cliente" ? "cliente" : undefined,
  };
}

export function clientsState(s: ClientsSearch): ClientsListState {
  return {
    q: s.q ?? "",
    tab: s.stato ?? "all",
    view: s.vista === "tabella" ? "table" : "grid",
    sort: s.ordina ?? "name",
  };
}

/** Parametri da scrivere nell'URL (i valori predefiniti non si scrivono). */
export function clientsSearchOf(st: ClientsListState): ClientsSearch {
  return {
    q: st.q.trim() ? st.q : undefined,
    stato: st.tab === "all" ? undefined : st.tab,
    vista: st.view === "table" ? "tabella" : undefined,
    ordina: st.sort === "name" ? undefined : st.sort,
  };
}

/** Dopo aver aperto «Nuovo cliente», new=cliente si toglie. */
export function withoutNewParam<T extends ClientsSearch>(s: T): T {
  return { ...s, new: undefined };
}

// ----------------------------------------------------------------------------
// Ritorno dal Profilo
// ----------------------------------------------------------------------------
// La scheda apre il Profilo portando nella cronologia la ricerca della lista;
// la freccia del Profilo riporta alla lista con quella ricerca. Da altre
// pagine (Panoramica, ricerca dell'header) si torna alla lista com'è di base.

declare module "@tanstack/history" {
  interface HistoryState {
    /** Ricerca della lista Clienti da cui si è aperto il Profilo. */
    clientsSearch?: ClientsSearch;
  }
}

/** La ricerca con cui il Profilo torna alla lista, dallo stato della cronologia. */
export function backToListSearch(state: { clientsSearch?: unknown } | undefined): ClientsSearch {
  const raw = state?.clientsSearch;
  if (!raw || typeof raw !== "object") return {};
  return withoutNewParam(parseClientsSearch(raw as Record<string, unknown>));
}
