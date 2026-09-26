// ----------------------------------------------------------------------------
// Assegna evento — regole del dialog condiviso (passata 02)
// ----------------------------------------------------------------------------
// Un evento importato da Google senza cliente si assegna in tre modi:
//   - sessione cliente: si collega al cliente con la tipologia scelta e, se
//     il coach lo chiede, si scala un credito. Il credito viene dal blocco che
//     contiene la data della sessione, con l'ordine del server
//     (credit-order.ts); se lì non c'è capienza, dagli extra_credits della
//     tipologia, come fa il Profilo per le sessioni fuori percorso;
//   - consulenza esterna e impegno personale: RPC mark_booking_special, come
//     prima (nessun credito).
// «Ripristina» rimette l'evento com'era e restituisce il credito scalato.
// ----------------------------------------------------------------------------

import {
  CreditUnavailableError,
  SessionChangedError,
  type CreditRef,
  type SessionStore,
} from "@/lib/cancel-session";
import {
  pickConsumeAllocation,
  pickConsumeExtraCredit,
  romeDate,
  type OrderedAllocation,
  type OrderedExtraCredit,
} from "@/lib/credit-order";
import type { BookingStatus, SessionType } from "@/lib/mock-data";

const IMPORT_PREFIX = /^Importato da Google Calendar:\s*/i;

/** Riga bookings letta dal dialog. */
export interface AssignableEvent {
  id: string;
  status: BookingStatus;
  deleted_at: string | null;
  client_id: string | null;
  coach_id: string;
  is_personal: boolean;
  category: string;
  block_id: string | null;
  event_type_id: string | null;
  session_type: SessionType;
  scheduled_at: string;
  title: string | null;
  notes: string | null;
}

/** Titolo Google dell'evento: title, altrimenti le note senza il prefisso d'importazione. */
export function eventTitle(e: Pick<AssignableEvent, "title" | "notes">): string {
  const title = e.title?.trim();
  if (title) return title;
  const notes = e.notes?.trim().replace(IMPORT_PREFIX, "").trim();
  return notes || "Evento";
}

/**
 * Si può assegnare un evento senza cliente (o importato come evento del coach),
 * non personale, non annullato e senza crediti già scalati.
 */
export function isAssignable(
  e: Pick<
    AssignableEvent,
    "deleted_at" | "status" | "is_personal" | "client_id" | "coach_id" | "block_id"
  >,
): boolean {
  if (e.deleted_at || e.is_personal || e.block_id) return false;
  if (e.status === "cancelled" || e.status === "late_cancelled") return false;
  return !e.client_id || e.client_id === e.coach_id;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function words(s: string): string[] {
  return fold(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function containsWords(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/**
 * Cliente suggerito dal titolo dell'evento: prima il nome completo (il più
 * lungo), poi nome o cognome da soli (almeno 3 lettere, parola intera). Se
 * più clienti corrispondono allo stesso modo non suggerisce nessuno: meglio
 * nessuna preselezione che quella sbagliata.
 */
export function guessClientFromTitle<T extends { id: string; full_name: string | null }>(
  title: string,
  clients: readonly T[],
): T | null {
  const hay = words(title);
  const unique = (list: T[]) => (list.length === 1 ? list[0]! : null);

  let best: T[] = [];
  let bestLength = 0;
  for (const c of clients) {
    const name = words(c.full_name ?? "");
    if (name.length < 2 || !containsWords(hay, name)) continue;
    const length = name.join(" ").length;
    if (length > bestLength) {
      best = [c];
      bestLength = length;
    } else if (length === bestLength) {
      best.push(c);
    }
  }
  if (best.length > 0) return unique(best);

  const byPart = clients.filter((c) =>
    words(c.full_name ?? "").some((w) => w.length >= 3 && hay.includes(w)),
  );
  return unique(byPart);
}

/** Tipologia suggerita dal titolo (nome più lungo contenuto), altrimenti la prima PT, altrimenti la prima. */
export function guessEventType<T extends { id: string; name: string; base_type: string }>(
  title: string,
  types: readonly T[],
): T | null {
  const hay = words(title);
  let best: T | null = null;
  let bestLength = 0;
  for (const t of types) {
    const name = words(t.name);
    const length = name.join(" ").length;
    if (containsWords(hay, name) && length > bestLength) {
      best = t;
      bestLength = length;
    }
  }
  return best ?? types.find((t) => t.base_type === "PT Session") ?? types[0] ?? null;
}

/** Blocco del cliente che contiene la data (a Roma) della sessione. */
export function blockForDate<T extends { start_date: string; end_date: string }>(
  blocks: readonly T[],
  scheduledAt: string,
): T | null {
  const day = romeDate(scheduledAt);
  return (
    [...blocks]
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .find((b) => b.start_date.slice(0, 10) <= day && day <= b.end_date.slice(0, 10)) ?? null
  );
}

/** Tipologia scelta nel dialog. */
export interface AssignType {
  id: string;
  base_type: SessionType;
}

function inPool(
  a: Pick<OrderedAllocation, "event_type_id" | "session_type">,
  type: AssignType,
): boolean {
  return a.event_type_id === type.id || a.session_type === type.base_type;
}

/**
 * Crediti che il cliente può usare per questa sessione: residuo del blocco
 * che contiene la data (stesso gruppo di allocazioni che il server
 * considererebbe) più gli extra della tipologia.
 */
export function countAvailableCredits(args: {
  blocks: ReadonlyArray<{
    id: string;
    start_date: string;
    end_date: string;
    allocations: ReadonlyArray<
      Pick<
        OrderedAllocation,
        "event_type_id" | "session_type" | "quantity_assigned" | "quantity_booked"
      >
    >;
  }>;
  extras: ReadonlyArray<Pick<OrderedExtraCredit, "event_type_id" | "quantity" | "quantity_booked">>;
  scheduledAt: string;
  type: AssignType;
}): number {
  const block = blockForDate(args.blocks, args.scheduledAt);
  const fromBlock = (block?.allocations ?? [])
    .filter((a) => inPool(a, args.type))
    .reduce((n, a) => n + Math.max(0, a.quantity_assigned - a.quantity_booked), 0);
  const fromExtras = args.extras
    .filter((e) => e.event_type_id === args.type.id)
    .reduce((n, e) => n + Math.max(0, e.quantity - e.quantity_booked), 0);
  return fromBlock + fromExtras;
}

/** Campi dell'evento che l'assegnazione cambia (e che «Ripristina» rimette). */
export interface EventLink {
  client_id: string | null;
  event_type_id: string | null;
  session_type: SessionType;
  is_personal: boolean;
  category: string;
  block_id: string | null;
}

export interface AssignStore extends Pick<
  SessionStore,
  "listAllocations" | "listExtraCredits" | "moveCredit"
> {
  getEvent(id: string): Promise<AssignableEvent | null>;
  /**
   * Scrive `patch` solo se cliente, blocco e flag personale sono ancora quelli
   * attesi; false se nel frattempo l'evento è cambiato.
   */
  updateEvent(
    id: string,
    expected: Pick<EventLink, "client_id" | "block_id" | "is_personal">,
    patch: Partial<EventLink>,
  ): Promise<boolean>;
  listClientBlocks(
    clientId: string,
  ): Promise<Array<{ id: string; start_date: string; end_date: string }>>;
  /** RPC mark_booking_special: consulenza o impegno personale. */
  markSpecial(id: string, category: "consulenza" | "personal"): Promise<void>;
}

export interface AssignResult {
  eventId: string;
  previous: EventLink;
  next: EventLink;
  /** Credito scalato, da restituire con «Ripristina». */
  credit: CreditRef | null;
}

function linkOf(e: AssignableEvent): EventLink {
  return {
    client_id: e.client_id,
    event_type_id: e.event_type_id,
    session_type: e.session_type,
    is_personal: e.is_personal,
    category: e.category,
    block_id: e.block_id,
  };
}

async function loadAssignable(store: AssignStore, id: string): Promise<AssignableEvent> {
  const e = await store.getEvent(id);
  if (!e || !isAssignable(e)) {
    throw new SessionChangedError("L'evento è già stato assegnato o non esiste più.");
  }
  return e;
}

/** Il credito da scalare: blocco della data, altrimenti extra della tipologia. */
async function findCreditToTake(
  store: AssignStore,
  e: AssignableEvent,
  clientId: string,
  type: AssignType,
): Promise<{ ref: CreditRef; blockId: string | null } | null> {
  const block = blockForDate(await store.listClientBlocks(clientId), e.scheduled_at);
  if (block) {
    const session = {
      block_id: block.id,
      event_type_id: type.id,
      session_type: type.base_type,
      scheduled_at: e.scheduled_at,
    };
    const a = pickConsumeAllocation(
      session,
      await store.listAllocations(block.id),
      block.start_date,
    );
    if (a) return { ref: { kind: "allocation", id: a.id }, blockId: block.id };
  }
  const x = pickConsumeExtraCredit(type.id, await store.listExtraCredits(clientId, type.id));
  return x ? { ref: { kind: "extra", id: x.id }, blockId: null } : null;
}

export async function assignEventToClient(
  store: AssignStore,
  input: { eventId: string; clientId: string; type: AssignType; useCredit: boolean },
): Promise<AssignResult> {
  const e = await loadAssignable(store, input.eventId);
  const credit = input.useCredit
    ? await findCreditToTake(store, e, input.clientId, input.type)
    : null;
  if (input.useCredit && !credit) {
    throw new CreditUnavailableError("Il cliente non ha più crediti per questa tipologia.");
  }

  const previous = linkOf(e);
  const next: EventLink = {
    client_id: input.clientId,
    event_type_id: input.type.id,
    session_type: input.type.base_type,
    is_personal: false,
    category: "client_session",
    block_id: credit?.blockId ?? null,
  };
  if (!(await store.updateEvent(e.id, previous, next))) {
    throw new SessionChangedError("L'evento è cambiato nel frattempo. Riprova.");
  }
  if (credit && !(await store.moveCredit(credit.ref, 1).catch(() => false))) {
    await store.updateEvent(e.id, next, previous);
    throw new CreditUnavailableError(
      "Il credito si è esaurito nel frattempo: l'evento non è stato assegnato.",
    );
  }
  return { eventId: e.id, previous, next, credit: credit?.ref ?? null };
}

/** Segna l'evento come consulenza esterna o impegno personale (nessun credito). */
export async function markEventSpecial(
  store: AssignStore,
  eventId: string,
  category: "consulenza" | "personal",
): Promise<AssignResult> {
  const e = await loadAssignable(store, eventId);
  await store.markSpecial(e.id, category);
  // Quello che scrive mark_booking_special (20260606120000_audit_round2_db_fixes.sql).
  const next: EventLink = {
    client_id: null,
    event_type_id: null,
    session_type: e.session_type,
    is_personal: true,
    category,
    block_id: null,
  };
  return { eventId: e.id, previous: linkOf(e), next, credit: null };
}

/** «Ripristina»: l'evento torna com'era e il credito scalato torna disponibile. */
export async function undoAssign(store: AssignStore, r: AssignResult): Promise<void> {
  if (!(await store.updateEvent(r.eventId, r.next, r.previous))) {
    throw new SessionChangedError(
      "L'evento è stato modificato dopo l'assegnazione: non si può ripristinare.",
    );
  }
  if (r.credit && !(await store.moveCredit(r.credit, -1).catch(() => false))) {
    throw new CreditUnavailableError(
      "L'evento è tornato da assegnare, ma il credito non è stato restituito.",
    );
  }
}
