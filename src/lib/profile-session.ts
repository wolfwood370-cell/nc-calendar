// ----------------------------------------------------------------------------
// Sessioni dal Profilo cliente (passata 06, §3.3) — una strada sola
// ----------------------------------------------------------------------------
// Prima il Profilo aveva una sua scrittura (UPDATE secco di data, tipologia e
// stato, trainer.clients.$id.tsx:557-600 su main): il credito non seguiva la
// data né la tipologia. Ora ogni scrittura passa dagli helper del Calendario:
//   - stato Programmata · Svolta · Assente: changeSessionOutcome (03-04);
//   - data, ora, tipologia e note: editSession (04), cioè reschedule_booking e
//     il credito della tipologia nuova;
//   - annulla ed elimina: il dialog condiviso della 02 (cancel-session.ts);
//   - «Rimetti in agenda»: la regola del «Ripristina» della 02, il credito si
//     riprende con l'ordine del server (credit-order.ts); senza capienza
//     niente cambia;
//   - «Collega»: assignEventToClient della 02, credito dal blocco della data,
//     poi dagli extra;
//   - «Ignora» e «Scollega dal profilo»: le scritture di prima, spostate qui.
// Nessuna regola nuova sui crediti.
// ----------------------------------------------------------------------------

import {
  assignEventToClient,
  guessEventType,
  type AssignResult,
  type AssignStore,
  type AssignType,
} from "@/lib/assign-event";
import {
  CreditUnavailableError,
  SessionChangedError,
  findCreditToReturn,
  hasClientCredit,
  type CreditRef,
  type SessionStore,
  type StoredSession,
} from "@/lib/cancel-session";
import {
  sessionScheduleCheck,
  type AvailabilityException,
  type AvailabilitySlot,
  type OverlapCandidate,
} from "@/lib/calendar-time";
import { pickConsumeAllocation, pickConsumeExtraCredit } from "@/lib/credit-order";
import type { BookingStatus } from "@/lib/mock-data";
import { changeSessionOutcome, type SessionOutcome } from "@/lib/session-outcome";
import {
  canMoveOrRetype,
  editSession,
  undoEdit,
  type EditInput,
  type EditResult,
  type EditStore,
  type SessionSnapshot,
} from "@/lib/session-edit";

// ----------------------------------------------------------------------------
// «Modifica sessione»
// ----------------------------------------------------------------------------

/** Stati che il dialog lascia scegliere. */
export function isOutcome(status: string): status is SessionOutcome {
  return status === "scheduled" || status === "completed" || status === "no_show";
}

/**
 * Data, ora e tipologia si cambiano solo se la sessione è programmata, o se
 * il coach la riporta a programmata (lo stato cambia prima): la regola di
 * canMoveOrRetype della 04.
 */
export function canEditTime(current: string, target: string): boolean {
  return canMoveOrRetype({ status: current as BookingStatus }) || target === "scheduled";
}

/**
 * Data e ora nel dialog del Profilo (V7): gli avvisi del Calendario, con le
 * sue parole e la sua regola (sessionScheduleCheck). La sovrapposizione
 * ferma il salvataggio, come nel Calendario; il fuori disponibilità è un
 * avviso. Si controlla solo quando data e ora si possono cambiare
 * (canEditTime): una sessione svolta, assente o annullata non occupa
 * l'agenda.
 */
export function profileScheduleCheck<
  B extends OverlapCandidate & {
    client_id: string | null;
    coach_id: string | null;
    title?: string | null;
  },
>(args: {
  timeEditable: boolean;
  startIso: string | null;
  minutes: number;
  bufferMin: number;
  sessionId: string;
  bookings: readonly B[];
  slots: readonly AvailabilitySlot[];
  exceptions: readonly AvailabilityException[];
  clientName: (id: string) => string | null | undefined;
}): { overlap: B | null; warning: string | null } {
  return sessionScheduleCheck({
    start: args.timeEditable && args.startIso ? new Date(args.startIso) : null,
    minutes: args.minutes,
    bufferMin: args.bufferMin,
    excludeId: args.sessionId,
    bookings: args.bookings,
    checkAvailability: true,
    slots: args.slots,
    exceptions: args.exceptions,
    clientName: args.clientName,
  });
}

export interface ProfileSessionInput extends Omit<EditInput, "expected"> {
  /** Com'era la sessione quando il dialog l'ha aperta. */
  expected: SessionSnapshot;
  /** Stato scelto; per una sessione annullata resta quello che ha. */
  status: string;
}

export interface ProfileSessionResult {
  sessionId: string;
  edit: EditResult | null;
  outcome: { from: SessionOutcome; to: SessionOutcome } | null;
}

function fieldsChanged(input: ProfileSessionInput): boolean {
  const e = input.expected;
  return (
    new Date(input.scheduledAt).getTime() !== new Date(e.scheduled_at).getTime() ||
    input.durationMin !== e.duration_min ||
    (!!input.type && input.type.id !== e.event_type_id) ||
    (input.notes !== undefined && (input.notes || null) !== (e.trainer_notes ?? null))
  );
}

/**
 * Salva il dialog: stato con changeSessionOutcome, il resto con editSession.
 * Se la sessione torna programmata, prima lo stato e poi la data (una sessione
 * non programmata non si sposta); altrimenti prima la data e poi lo stato. Se
 * il secondo passo non riesce, il primo si rimette com'era.
 */
export async function saveProfileSession(
  store: EditStore,
  input: ProfileSessionInput,
): Promise<ProfileSessionResult> {
  const from = input.expected.status;
  const to = isOutcome(from) && isOutcome(input.status) ? input.status : from;
  const outcome = from !== to ? { from: from as SessionOutcome, to: to as SessionOutcome } : null;
  const edit = fieldsChanged(input);

  if (outcome && outcome.to === "scheduled") {
    await changeSessionOutcome(store, input.sessionId, outcome.from, "scheduled");
    if (!edit) return { sessionId: input.sessionId, edit: null, outcome };
    try {
      const r = await editSession(store, {
        ...input,
        expected: { ...input.expected, status: "scheduled" },
      });
      return { sessionId: input.sessionId, edit: r, outcome };
    } catch (e) {
      await changeSessionOutcome(store, input.sessionId, "scheduled", outcome.from).catch(
        () => undefined,
      );
      throw e;
    }
  }

  const r = edit ? await editSession(store, input) : null;
  if (!outcome) return { sessionId: input.sessionId, edit: r, outcome: null };
  try {
    await changeSessionOutcome(store, input.sessionId, outcome.from, outcome.to);
  } catch (e) {
    if (r) await undoEdit(store, r).catch(() => undefined);
    throw e;
  }
  return { sessionId: input.sessionId, edit: r, outcome };
}

/** «Ripristina» del toast: tutto com'era, nell'ordine inverso. */
export async function undoProfileSession(
  store: EditStore,
  r: ProfileSessionResult,
  google?: { summary?: string; colorId?: string },
): Promise<void> {
  if (r.outcome && r.outcome.to === "scheduled") {
    if (r.edit) await undoEdit(store, r.edit, google);
    await changeSessionOutcome(store, r.sessionId, "scheduled", r.outcome.from);
    return;
  }
  if (r.outcome) await changeSessionOutcome(store, r.sessionId, r.outcome.to, r.outcome.from);
  if (r.edit) await undoEdit(store, r.edit, google);
}

// ----------------------------------------------------------------------------
// «Rimetti in agenda»
// ----------------------------------------------------------------------------
// Una sessione `cancelled` ha restituito il credito (cancel-session.ts): per
// tornare in agenda lo riprende, dal suo blocco con l'ordine del server,
// oppure dagli extra della tipologia se non ha blocco. Una `late_cancelled`
// il credito lo tiene già. Se il credito non c'è, niente cambia. L'evento
// Google era stato tolto all'annullamento: si toglie quello vecchio, se
// c'è ancora, e se ne crea uno nuovo, come nel «Ripristina» della 02.

export interface PutBackResult {
  sessionId: string;
  previousStatus: "cancelled" | "late_cancelled";
  /** Credito ripreso, da restituire con «Ripristina». */
  taken: CreditRef | null;
  googleEventRecreated: boolean;
}

export const NO_CREDIT_TO_PUT_BACK =
  "Non ci sono crediti per rimettere in agenda questa sessione: resta annullata.";

async function creditToTake(store: SessionStore, s: StoredSession): Promise<CreditRef | null> {
  if (s.block_id) {
    const [allocations, blockStart] = await Promise.all([
      store.listAllocations(s.block_id),
      store.getBlockStart(s.block_id),
    ]);
    const a = pickConsumeAllocation(s, allocations, blockStart);
    return a ? { kind: "allocation", id: a.id } : null;
  }
  if (!s.client_id || !s.event_type_id) return null;
  const e = pickConsumeExtraCredit(
    s.event_type_id,
    await store.listExtraCredits(s.client_id, s.event_type_id),
    s.scheduled_at,
  );
  return e ? { kind: "extra", id: e.id } : null;
}

async function tryMove(store: SessionStore, ref: CreditRef, delta: 1 | -1): Promise<boolean> {
  try {
    return await store.moveCredit(ref, delta);
  } catch {
    return false;
  }
}

export async function putBackInAgenda(
  store: SessionStore,
  sessionId: string,
): Promise<PutBackResult> {
  const s = await store.getSession(sessionId);
  if (!s || s.deleted_at) throw new SessionChangedError("La sessione non esiste più.");
  if (s.status !== "cancelled" && s.status !== "late_cancelled") {
    throw new SessionChangedError("La sessione non è più annullata.");
  }
  const previousStatus = s.status;

  let taken: CreditRef | null = null;
  if (previousStatus === "cancelled" && hasClientCredit(s)) {
    taken = await creditToTake(store, s);
    if (!taken || !(await tryMove(store, taken, 1))) {
      throw new CreditUnavailableError(NO_CREDIT_TO_PUT_BACK);
    }
  }

  const oldGoogle = s.google_event_id;
  let written = false;
  try {
    written = await store.updateSession(
      s.id,
      { status: previousStatus, deleted: false },
      { status: "scheduled", ...(oldGoogle ? { google_event_id: null } : {}) },
    );
  } catch (e) {
    if (taken) await tryMove(store, taken, -1);
    throw e;
  }
  if (!written) {
    if (taken) await tryMove(store, taken, -1);
    throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
  }

  // L'evento di prima, se è ancora su Google (annullamenti fatti prima della
  // 02 non lo toglievano), non deve restare doppio.
  if (oldGoogle) {
    try {
      await store.deleteGoogleEvent(oldGoogle);
    } catch {
      /* già tolto o Google non risponde: l'id non è più sulla sessione */
    }
  }
  let googleEventRecreated = false;
  try {
    googleEventRecreated = await store.createGoogleEvent(s.id);
  } catch {
    googleEventRecreated = false;
  }
  return { sessionId: s.id, previousStatus, taken, googleEventRecreated };
}

/** «Ripristina»: la sessione torna annullata com'era e il credito ripreso torna libero. */
export async function undoPutBack(store: SessionStore, r: PutBackResult): Promise<void> {
  const s = await store.getSession(r.sessionId);
  if (!s || s.deleted_at || s.status !== "scheduled") {
    throw new SessionChangedError(
      "La sessione è stata modificata dopo che è tornata in agenda: non si può ripristinare.",
    );
  }
  const ok = await store.updateSession(
    s.id,
    { status: "scheduled", deleted: false },
    { status: r.previousStatus },
  );
  if (!ok) throw new SessionChangedError("La sessione è stata modificata nel frattempo.");
  if (r.taken && !(await tryMove(store, r.taken, -1))) {
    throw new CreditUnavailableError(
      "La sessione è di nuovo annullata, ma il credito non è tornato.",
    );
  }
  if (s.google_event_id) {
    try {
      await store.deleteGoogleEvent(s.google_event_id);
    } catch {
      /* come nell'annullamento: l'esito di Google non blocca */
    }
  }
}

// ----------------------------------------------------------------------------
// Sessioni fuori percorso (K6)
// ----------------------------------------------------------------------------

export interface OrphanEvent {
  id: string;
  scheduled_at: string;
  title: string | null;
  notes: string | null;
  event_type_id: string | null;
}

export interface LinkType extends AssignType {
  name: string;
}

/** Tipologia con cui collegare: quella dell'evento, altrimenti quella suggerita dal titolo. */
export function orphanType<T extends LinkType>(o: OrphanEvent, types: readonly T[]): T | null {
  const own = o.event_type_id ? types.find((t) => t.id === o.event_type_id) : undefined;
  return own ?? guessEventType(`${o.title ?? ""} ${o.notes ?? ""}`, types);
}

/**
 * «Collega»: come «Assegna evento» con il credito. Il credito viene dal
 * blocco che contiene la data della sessione, poi dagli extra; se non c'è,
 * CreditUnavailableError e niente cambia.
 */
export async function linkOrphan(
  store: AssignStore,
  input: { eventId: string; clientId: string; type: AssignType; useCredit?: boolean },
): Promise<AssignResult> {
  return assignEventToClient(store, {
    eventId: input.eventId,
    clientId: input.clientId,
    type: input.type,
    useCredit: input.useCredit ?? true,
  });
}

export interface OrphanStore {
  /** bookings.ignored_by_clients. */
  getIgnoredBy(eventId: string): Promise<string[]>;
  setIgnoredBy(eventId: string, clients: string[]): Promise<void>;
}

/** «Ignora»: la scrittura di prima (discardOrphan), il cliente in ignored_by_clients. */
export async function ignoreOrphan(
  store: OrphanStore,
  eventId: string,
  clientId: string,
): Promise<void> {
  const current = await store.getIgnoredBy(eventId);
  if (current.includes(clientId)) return;
  await store.setIgnoredBy(eventId, [...current, clientId]);
}

/** «Ripristina» di «Ignora». */
export async function unignoreOrphan(
  store: OrphanStore,
  eventId: string,
  clientId: string,
): Promise<void> {
  const current = await store.getIgnoredBy(eventId);
  if (!current.includes(clientId)) return;
  await store.setIgnoredBy(
    eventId,
    current.filter((c) => c !== clientId),
  );
}

// ----------------------------------------------------------------------------
// «Scollega dal profilo»
// ----------------------------------------------------------------------------
// La scrittura di prima (unlinkBooking, trainer.clients.$id.tsx:519-553 su
// main): la sessione perde cliente e blocco, il cliente va in
// ignored_by_clients, e il credito ancora impegnato torna all'allocazione
// che sceglierebbe il server.

export interface UnlinkStore extends SessionStore, OrphanStore {
  /** UPDATE di client_id e block_id a null, con ignored_by_clients; lancia se non riesce. */
  unlinkSession(id: string, ignored: string[]): Promise<void>;
}

export async function unlinkFromClient(
  store: UnlinkStore,
  sessionId: string,
  clientId: string,
): Promise<{ creditReturned: boolean | null }> {
  const stored = await store.getSession(sessionId);
  const credit = stored ? await findCreditToReturn(store, stored) : null;
  const ignored = await store.getIgnoredBy(sessionId);
  await store.unlinkSession(
    sessionId,
    ignored.includes(clientId) ? ignored : [...ignored, clientId],
  );
  if (!credit) return { creditReturned: null };
  return { creditReturned: await tryMove(store, credit, -1) };
}
