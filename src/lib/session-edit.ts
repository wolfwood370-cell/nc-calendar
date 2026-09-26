// ----------------------------------------------------------------------------
// Modifica di sessioni e impegni dal Calendario (passata 04, §3.2)
// ----------------------------------------------------------------------------
// Il cliente non si cambia (prima calendar-event-edit-dialog.tsx aggiornava
// client_id, scheduled_at ed event_type_id con un update secco e i crediti
// restavano dov'erano).
//   - Data e ora di una sessione cliente passano da reschedule_booking, la
//     funzione che usa anche il cliente: sposta il credito sulla settimana
//     nuova e accetta il coach (20260827143053_…sql:130-298). Impegni ed
//     eventi senza cliente non li accetta (:186-187): per quelli un update.
//   - Tipologia di una sessione con credito: il credito si sposta, come
//     nella 02. Prima si prende quello della tipologia nuova (stesso ordine
//     del trigger d'inserimento, planSessionCredit), poi si restituisce il
//     vecchio (findCreditToReturn). Ogni scrittura vale solo se la riga è
//     ancora come letta; se qualcosa non va, si rimette tutto com'era.
//   - Durata, note del coach (bookings.trainer_notes, le stesse che il
//     cliente legge nel dettaglio della sessione) e titolo: update
//     condizionato.
//   - L'evento Google si aggiorna con gcalUpdateEvent; se Google non risponde
//     la modifica resta e lo si dice.
// «Ripristina» rifà tutto al contrario, solo se nel frattempo la sessione non
// è cambiata; altrimenti lo dice e non tocca niente.
// ----------------------------------------------------------------------------

import {
  CreditUnavailableError,
  SessionChangedError,
  findCreditToReturn,
  hasClientCredit,
  type CreditRef,
  type StoredSession,
} from "@/lib/cancel-session";
import type { SessionType } from "@/lib/mock-data";
import {
  NoCreditError,
  loadClientCredits,
  noCreditMessage,
  planSessionCredit,
  type CalendarStore,
  type CreditPlan,
} from "@/lib/session-create";

/** Riga bookings con i campi che la modifica può cambiare. */
export interface EditableSession extends StoredSession {
  duration_min: number;
  trainer_notes: string | null;
  title: string | null;
}

/** Campi scritti dalla modifica. */
export interface SessionFieldsPatch {
  scheduled_at?: string;
  duration_min?: number;
  event_type_id?: string | null;
  session_type?: SessionType;
  block_id?: string | null;
  trainer_notes?: string | null;
  title?: string | null;
}

/** Valori che la riga deve ancora avere perché la scrittura valga. */
export type SessionFieldsExpected = Partial<
  Pick<
    EditableSession,
    | "status"
    | "scheduled_at"
    | "duration_min"
    | "event_type_id"
    | "block_id"
    | "trainer_notes"
    | "title"
  >
>;

export interface EditStore extends CalendarStore {
  getEditableSession(id: string): Promise<EditableSession | null>;
  /** Scrive `patch` solo se la sessione non è eliminata e ha ancora i valori `expected`. */
  updateSessionFields(
    id: string,
    expected: SessionFieldsExpected,
    patch: SessionFieldsPatch,
  ): Promise<boolean>;
  /** RPC reschedule_booking. */
  rescheduleSession(id: string, scheduledAt: string): Promise<void>;
  updateGoogleEvent(
    googleEventId: string,
    event: { startISO: string; endISO: string; summary?: string; colorId?: string },
  ): Promise<boolean>;
}

/** Quello che «Ripristina» deve rimettere e ciò che controlla prima di farlo. */
export interface SessionSnapshot {
  status: EditableSession["status"];
  scheduled_at: string;
  duration_min: number;
  event_type_id: string | null;
  session_type: SessionType;
  block_id: string | null;
  trainer_notes: string | null;
  title: string | null;
}

export function snapshotOf(s: EditableSession): SessionSnapshot {
  return {
    status: s.status,
    scheduled_at: s.scheduled_at,
    duration_min: s.duration_min,
    event_type_id: s.event_type_id,
    session_type: s.session_type,
    block_id: s.block_id,
    trainer_notes: s.trainer_notes,
    title: s.title,
  };
}

function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

function sameSnapshot(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.status === b.status &&
    sameInstant(a.scheduled_at, b.scheduled_at) &&
    a.duration_min === b.duration_min &&
    a.event_type_id === b.event_type_id &&
    a.block_id === b.block_id &&
    (a.trainer_notes ?? null) === (b.trainer_notes ?? null) &&
    (a.title ?? null) === (b.title ?? null)
  );
}

export interface EditInput {
  sessionId: string;
  /** Com'era la sessione quando il dialog l'ha aperta. */
  expected: SessionSnapshot;
  scheduledAt: string;
  durationMin: number;
  /** Tipologia nuova (solo sessioni cliente). */
  type?: { id: string; name: string; base_type: SessionType } | null;
  clientName?: string;
  /** Note del coach (sessioni cliente). */
  notes?: string | null;
  /** Titolo (impegni). */
  title?: string | null;
  /** Titolo e colore dell'evento Google dopo la modifica. */
  google?: { summary: string; colorId?: string };
}

/** Spostamento del credito per il cambio di tipologia. */
export interface TypeCreditMove {
  /** Credito restituito (della tipologia vecchia). */
  released: CreditRef;
  /** Credito preso (della tipologia nuova). */
  taken: CreditRef;
  blockBefore: string | null;
  blockAfter: string | null;
}

export interface EditResult {
  sessionId: string;
  isClient: boolean;
  before: SessionSnapshot;
  after: SessionSnapshot;
  /** Data spostata con reschedule_booking. */
  rescheduled: boolean;
  typeMove: TypeCreditMove | null;
  /** Il credito vecchio non è tornato (errore dopo aver preso il nuovo). */
  refundFailed: boolean;
  googleEventId: string | null;
  googleUpdated: boolean;
  /** Evento Google prima della modifica, per «Ripristina». */
  googleBefore: { summary?: string; colorId?: string } | null;
}

/** Una sessione cliente non più programmata si modifica solo nelle note e nella durata. */
export function canMoveOrRetype(s: Pick<EditableSession, "status">): boolean {
  return s.status === "scheduled";
}

function refOf(plan: CreditPlan): CreditRef {
  return plan.source === "block"
    ? { kind: "allocation", id: plan.allocation.id }
    : { kind: "extra", id: plan.credit.id };
}

function sameRef(a: CreditRef, b: CreditRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

async function mustRead(store: EditStore, id: string): Promise<EditableSession> {
  const s = await store.getEditableSession(id);
  if (!s || s.deleted_at) throw new SessionChangedError("La sessione non esiste più.");
  return s;
}

async function tryMove(store: EditStore, ref: CreditRef, delta: 1 | -1): Promise<boolean> {
  try {
    return await store.moveCredit(ref, delta);
  } catch {
    return false;
  }
}

async function tryGoogle(
  store: EditStore,
  googleEventId: string | null,
  s: Pick<SessionSnapshot, "scheduled_at" | "duration_min">,
  google?: { summary?: string; colorId?: string } | null,
): Promise<boolean> {
  if (!googleEventId) return false;
  const start = new Date(s.scheduled_at);
  const end = new Date(start.getTime() + s.duration_min * 60_000);
  try {
    return await store.updateGoogleEvent(googleEventId, {
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      ...(google?.summary ? { summary: google.summary } : {}),
      ...(google?.colorId ? { colorId: google.colorId } : {}),
    });
  } catch {
    return false;
  }
}

/** Sposta data e ora: reschedule_booking per le sessioni cliente, un update per il resto. */
async function moveTime(
  store: EditStore,
  s: EditableSession,
  isClient: boolean,
  scheduledAt: string,
): Promise<void> {
  if (isClient) {
    await store.rescheduleSession(s.id, scheduledAt);
    return;
  }
  const ok = await store.updateSessionFields(
    s.id,
    { status: s.status, scheduled_at: s.scheduled_at },
    { scheduled_at: scheduledAt },
  );
  if (!ok) throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
}

/**
 * Tipologia nuova di una sessione cliente. Se la sessione impegna un
 * credito, prende quello della tipologia nuova e restituisce il vecchio.
 */
async function retype(
  store: EditStore,
  s: EditableSession,
  type: NonNullable<EditInput["type"]>,
  clientName: string,
): Promise<{ move: TypeCreditMove | null; refundFailed: boolean }> {
  const oldRef = await findCreditToReturn(store, s);
  const fields = { event_type_id: type.id, session_type: type.base_type };
  const expected = { status: s.status, event_type_id: s.event_type_id, block_id: s.block_id };
  if (!oldRef) {
    // Nessun credito impegnato (per esempio assegnata senza credito): cambia solo la tipologia.
    if (!(await store.updateSessionFields(s.id, expected, fields))) {
      throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
    }
    return { move: null, refundFailed: false };
  }
  const plan = planSessionCredit({
    scheduledAt: s.scheduled_at,
    eventTypeId: type.id,
    sessionType: type.base_type,
    ...(await loadClientCredits(store, s.client_id!)),
  });
  if (!plan) throw new NoCreditError(noCreditMessage(clientName, type.name));
  const taken = refOf(plan);
  const blockAfter = plan.source === "block" ? plan.allocation.block_id : null;
  if (sameRef(taken, oldRef)) {
    // Stesso credito (tipologie con lo stesso session_type): cambia solo la tipologia.
    if (!(await store.updateSessionFields(s.id, expected, fields))) {
      throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
    }
    return { move: null, refundFailed: false };
  }
  if (!(await store.updateSessionFields(s.id, expected, { ...fields, block_id: blockAfter }))) {
    throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
  }
  if (!(await tryMove(store, taken, 1))) {
    await store.updateSessionFields(
      s.id,
      { event_type_id: type.id, block_id: blockAfter },
      { event_type_id: s.event_type_id, session_type: s.session_type, block_id: s.block_id },
    );
    throw new CreditUnavailableError(
      "Il credito della tipologia nuova si è esaurito nel frattempo: la sessione non è cambiata.",
    );
  }
  const refunded = await tryMove(store, oldRef, -1);
  return {
    move: { released: oldRef, taken, blockBefore: s.block_id, blockAfter },
    refundFailed: !refunded,
  };
}

/**
 * Controllo prima di salvare: con un cambio di tipologia su una sessione che
 * impegna un credito, serve un credito della tipologia nuova alla data nuova.
 */
export async function checkEditCredit(
  store: EditStore,
  s: EditableSession,
  input: Pick<EditInput, "scheduledAt" | "type" | "clientName">,
): Promise<string | null> {
  if (!hasClientCredit(s) || !input.type || input.type.id === s.event_type_id) return null;
  if (!(await findCreditToReturn(store, s))) return null;
  const plan = planSessionCredit({
    scheduledAt: input.scheduledAt,
    eventTypeId: input.type.id,
    sessionType: input.type.base_type,
    ...(await loadClientCredits(store, s.client_id!)),
  });
  return plan ? null : noCreditMessage(input.clientName ?? "Il cliente", input.type.name);
}

export async function editSession(store: EditStore, input: EditInput): Promise<EditResult> {
  const first = await mustRead(store, input.sessionId);
  const before = snapshotOf(first);
  if (!sameSnapshot(before, input.expected)) {
    throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
  }
  const isClient = hasClientCredit(first);
  const timeChanged = !sameInstant(input.scheduledAt, first.scheduled_at);
  const typeChanged = isClient && !!input.type && input.type.id !== first.event_type_id;
  if (isClient && (timeChanged || typeChanged) && !canMoveOrRetype(first)) {
    throw new SessionChangedError(
      "La sessione non è più programmata: si possono cambiare solo durata e note.",
    );
  }
  if (typeChanged) {
    const problem = await checkEditCredit(store, first, input);
    if (problem) throw new NoCreditError(problem);
  }

  let rescheduled = false;
  if (timeChanged) {
    await moveTime(store, first, isClient, input.scheduledAt);
    rescheduled = isClient;
  }

  let typeMove: TypeCreditMove | null = null;
  let refundFailed = false;
  if (typeChanged) {
    try {
      const r = await retype(
        store,
        await mustRead(store, first.id),
        input.type!,
        input.clientName ?? "Il cliente",
      );
      typeMove = r.move;
      refundFailed = r.refundFailed;
    } catch (e) {
      // La data è già cambiata: la si rimette com'era prima di dire che non si può.
      if (timeChanged) {
        await moveTime(store, await mustRead(store, first.id), isClient, first.scheduled_at).catch(
          () => undefined,
        );
      }
      throw e;
    }
  }

  const current = await mustRead(store, first.id);
  const patch: SessionFieldsPatch = {};
  if (input.durationMin !== current.duration_min) patch.duration_min = input.durationMin;
  if (isClient && input.notes !== undefined && (input.notes || null) !== current.trainer_notes) {
    patch.trainer_notes = input.notes || null;
  }
  if (!isClient && input.title !== undefined && (input.title?.trim() || null) !== current.title) {
    patch.title = input.title?.trim() || null;
  }
  if (Object.keys(patch).length) {
    const ok = await store.updateSessionFields(
      current.id,
      {
        status: current.status,
        duration_min: current.duration_min,
        trainer_notes: current.trainer_notes,
        title: current.title,
      },
      patch,
    );
    if (!ok)
      throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
  }

  const after = snapshotOf(await mustRead(store, first.id));
  const googleUpdated = await tryGoogle(store, first.google_event_id, after, input.google);
  return {
    sessionId: first.id,
    isClient,
    before,
    after,
    rescheduled,
    typeMove,
    refundFailed,
    googleEventId: first.google_event_id,
    googleUpdated,
    googleBefore: null,
  };
}

/**
 * «Ripristina» di una modifica: tutto torna com'era, credito compreso. Se nel
 * frattempo la sessione è cambiata, SessionChangedError e niente viene toccato.
 */
export async function undoEdit(
  store: EditStore,
  r: EditResult,
  google?: { summary?: string; colorId?: string },
): Promise<void> {
  const cur = await mustRead(store, r.sessionId);
  if (!sameSnapshot(snapshotOf(cur), r.after)) {
    throw new SessionChangedError(
      "La sessione è stata modificata dopo il salvataggio: non si può ripristinare.",
    );
  }
  const b = r.before;
  // 1. Durata, note e titolo.
  const back: SessionFieldsPatch = {};
  if (cur.duration_min !== b.duration_min) back.duration_min = b.duration_min;
  if (cur.trainer_notes !== b.trainer_notes) back.trainer_notes = b.trainer_notes;
  if (cur.title !== b.title) back.title = b.title;
  // 2. Tipologia: si riprende il credito vecchio, poi si restituisce il nuovo.
  const typeBack = cur.event_type_id !== b.event_type_id;
  if (typeBack) {
    const blockNow = r.typeMove ? r.typeMove.blockAfter : cur.block_id;
    const blockThen = r.typeMove ? r.typeMove.blockBefore : cur.block_id;
    const ok = await store.updateSessionFields(
      cur.id,
      { status: cur.status, event_type_id: cur.event_type_id, block_id: blockNow },
      {
        event_type_id: b.event_type_id,
        session_type: b.session_type,
        block_id: blockThen,
        ...back,
      },
    );
    if (!ok) throw new SessionChangedError("La sessione è stata modificata nel frattempo.");
    if (r.typeMove) {
      if (!(await tryMove(store, r.typeMove.released, 1))) {
        await store.updateSessionFields(
          cur.id,
          { event_type_id: b.event_type_id, block_id: blockThen },
          {
            event_type_id: cur.event_type_id,
            session_type: cur.session_type,
            block_id: blockNow,
            duration_min: cur.duration_min,
            trainer_notes: cur.trainer_notes,
            title: cur.title,
          },
        );
        throw new CreditUnavailableError(
          "Il credito di prima è stato usato nel frattempo: la sessione resta com'è.",
        );
      }
      if (!r.refundFailed) await tryMove(store, r.typeMove.taken, -1);
    }
  } else if (Object.keys(back).length) {
    const ok = await store.updateSessionFields(
      cur.id,
      {
        status: cur.status,
        duration_min: cur.duration_min,
        trainer_notes: cur.trainer_notes,
        title: cur.title,
      },
      back,
    );
    if (!ok) throw new SessionChangedError("La sessione è stata modificata nel frattempo.");
  }
  // 3. Data e ora.
  if (!sameInstant(cur.scheduled_at, b.scheduled_at)) {
    await moveTime(store, await mustRead(store, cur.id), r.isClient, b.scheduled_at);
  }
  await tryGoogle(store, r.googleEventId, b, google ?? r.googleBefore);
}
