// ----------------------------------------------------------------------------
// Annullare o eliminare una sessione — regola unica (audit O1)
// ----------------------------------------------------------------------------
// Prima il coach annullava in due modi: dal Calendario solo lo stato, senza
// restituire il credito né togliere l'evento Google; dal Profilo con lo stato
// scelto a mano e il credito restituito alla prima allocazione trovata. Ora
// Calendario e Profilo passano da qui:
//   - più di 24 ore all'inizio: nessuna scelta, `cancelled` e credito restituito;
//   - 24 ore o meno, o sessione già iniziata: sceglie il coach. «Restituisci»
//     (predefinita) → `cancelled` e credito restituito; «Addebita» →
//     `late_cancelled`, il credito resta usato;
//   - l'evento Google si cancella sempre; `deleted_at` resta vuoto, così la
//     sessione resta nello storico come «Annullata»;
//   - il credito torna all'allocazione che sceglierebbe il server
//     (credit-order.ts); senza blocco, agli extra_credits;
//   - «Ripristina» rimette tutto com'era: stato, credito sulla stessa
//     allocazione, evento Google ricreato con il nuovo id sulla sessione.
// «Elimina» (sessioni inserite per errore) usa lo stesso percorso con
// `deleted_at`: la sessione sparisce e il credito, se ancora impegnato, torna.
// Le letture e le scritture passano da uno store iniettato: Supabase in app
// (session-store.ts), un archivio in memoria nei test.
// ----------------------------------------------------------------------------

import {
  pickRefundAllocation,
  pickRefundExtraCredit,
  type OrderedAllocation,
  type OrderedExtraCredit,
} from "@/lib/credit-order";
import type { BookingStatus, SessionType } from "@/lib/mock-data";

/** Sotto questa soglia il coach sceglie se restituire o addebitare il credito. */
export const LATE_CANCEL_HOURS = 24;

/** early: più di 24 ore all'inizio · late: 24 ore o meno · started: già iniziata o passata. */
export type CancelTiming = "early" | "late" | "started";
export type CreditChoice = "refund" | "charge";
export type SessionRemoval = "cancel" | "delete";

export function getCancelTiming(scheduledAt: string, now: Date = new Date()): CancelTiming {
  const msToStart = new Date(scheduledAt).getTime() - now.getTime();
  if (msToStart <= 0) return "started";
  return msToStart <= LATE_CANCEL_HOURS * 3_600_000 ? "late" : "early";
}

/** Il dialog chiede cosa fare del credito solo a 24 ore o meno dall'inizio. */
export function asksCreditChoice(timing: CancelTiming): boolean {
  return timing !== "early";
}

export function cancelledStatus(choice: CreditChoice): "cancelled" | "late_cancelled" {
  return choice === "charge" ? "late_cancelled" : "cancelled";
}

/** Stati da cui si può annullare. */
export function canCancel(status: string): boolean {
  return status === "scheduled" || status === "completed" || status === "no_show";
}

/**
 * Stati in cui il credito è impegnato: si scala alla prenotazione e torna solo
 * con un annullamento `cancelled` (o eliminando la sessione).
 */
export function holdsCredit(status: string): boolean {
  return canCancel(status) || status === "late_cancelled";
}

/** Riga bookings letta dallo store. */
export interface StoredSession {
  id: string;
  status: BookingStatus;
  deleted_at: string | null;
  client_id: string | null;
  coach_id: string;
  is_personal: boolean;
  block_id: string | null;
  event_type_id: string | null;
  session_type: SessionType;
  scheduled_at: string;
  google_event_id: string | null;
}

/** Sessione di un cliente: gli impegni personali e gli eventi del coach non hanno crediti. */
export function hasClientCredit(
  s: Pick<StoredSession, "client_id" | "coach_id" | "is_personal">,
): boolean {
  return !!s.client_id && s.client_id !== s.coach_id && !s.is_personal;
}

export type CreditRef = { kind: "allocation"; id: string } | { kind: "extra"; id: string };

export interface SessionPatch {
  status?: BookingStatus;
  deleted_at?: string | null;
  google_event_id?: string | null;
}

export interface SessionStore {
  getSession(id: string): Promise<StoredSession | null>;
  /**
   * Scrive `patch` solo se la sessione ha ancora lo stato atteso ed è (o non è)
   * eliminata come atteso. false se nel frattempo è cambiata.
   */
  updateSession(
    id: string,
    expected: { status: BookingStatus; deleted: boolean },
    patch: SessionPatch,
  ): Promise<boolean>;
  listAllocations(blockId: string): Promise<OrderedAllocation[]>;
  getBlockStart(blockId: string): Promise<string | null>;
  listExtraCredits(clientId: string, eventTypeId: string): Promise<OrderedExtraCredit[]>;
  /**
   * −1 restituisce un credito (solo se ce n'è uno impegnato), +1 lo scala di
   * nuovo (solo se c'è capienza). false se non si può.
   */
  moveCredit(ref: CreditRef, delta: 1 | -1): Promise<boolean>;
  /** true se Google ha tolto l'evento. */
  deleteGoogleEvent(googleEventId: string): Promise<boolean>;
  /** Crea l'evento Google e ne salva l'id sulla sessione; true se riuscito. */
  createGoogleEvent(sessionId: string): Promise<boolean>;
}

/** La sessione non è più come quando il dialog è stato aperto. */
export class SessionChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionChangedError";
  }
}

/** Il credito da riprendere non c'è più (usato nel frattempo, o nessun residuo). */
export class CreditUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditUnavailableError";
  }
}

/** Il credito che il server restituirebbe per questa sessione, se ne impegna uno. */
export async function findCreditToReturn(
  store: SessionStore,
  s: StoredSession,
): Promise<CreditRef | null> {
  if (!hasClientCredit(s) || !holdsCredit(s.status)) return null;
  if (s.block_id) {
    const [allocations, blockStart] = await Promise.all([
      store.listAllocations(s.block_id),
      store.getBlockStart(s.block_id),
    ]);
    const a = pickRefundAllocation(s, allocations, blockStart);
    return a ? { kind: "allocation", id: a.id } : null;
  }
  if (!s.client_id || !s.event_type_id) return null;
  const e = pickRefundExtraCredit(
    s.event_type_id,
    await store.listExtraCredits(s.client_id, s.event_type_id),
  );
  return e ? { kind: "extra", id: e.id } : null;
}

async function tryMoveCredit(store: SessionStore, ref: CreditRef, delta: 1 | -1) {
  try {
    return await store.moveCredit(ref, delta);
  } catch {
    return false;
  }
}

/**
 * Che ne è del credito: restituito, addebitato (`late_cancelled`), nessuno
 * (impegno personale, o nessun credito impegnato da restituire), oppure non
 * restituito per un errore.
 */
export type CreditOutcome = "refunded" | "charged" | "none" | "failed";

export interface RemoveSessionInput {
  sessionId: string;
  removal: SessionRemoval;
  /** Scelta del coach: conta solo a 24 ore o meno dall'inizio. Predefinita «refund». */
  choice?: CreditChoice;
  now?: Date;
}

/** Tutto quello che serve a «Ripristina» per rimettere la sessione com'era. */
export interface RemoveSessionResult {
  sessionId: string;
  removal: SessionRemoval;
  previousStatus: BookingStatus;
  status: BookingStatus;
  /** Valore scritto in deleted_at, se la sessione è stata eliminata. */
  deletedAt: string | null;
  credit: CreditOutcome;
  /** Il credito restituito, da riprendere sulla stessa riga. */
  refunded: CreditRef | null;
  googleEventId: string | null;
  googleEventDeleted: boolean;
}

export async function removeSession(
  store: SessionStore,
  input: RemoveSessionInput,
): Promise<RemoveSessionResult> {
  const now = input.now ?? new Date();
  const s = await store.getSession(input.sessionId);
  if (!s || s.deleted_at) throw new SessionChangedError("La sessione non esiste più.");
  if (input.removal === "cancel" && !canCancel(s.status)) {
    throw new SessionChangedError("La sessione è già annullata.");
  }

  const timing = getCancelTiming(s.scheduled_at, now);
  const choice: CreditChoice =
    input.removal === "delete" || !asksCreditChoice(timing) ? "refund" : (input.choice ?? "refund");
  const status: BookingStatus = input.removal === "delete" ? "cancelled" : cancelledStatus(choice);
  const deletedAt = input.removal === "delete" ? now.toISOString() : null;

  // Il credito da restituire si cerca prima di cambiare lo stato: dipende da
  // quello attuale (una sessione già annullata con rimborso non ne impegna).
  const target = choice === "refund" ? await findCreditToReturn(store, s) : null;

  const written = await store.updateSession(
    s.id,
    { status: s.status, deleted: false },
    deletedAt ? { status, deleted_at: deletedAt } : { status },
  );
  if (!written) {
    throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
  }

  let credit: CreditOutcome = "none";
  let refunded: CreditRef | null = null;
  if (hasClientCredit(s) && choice === "charge") {
    credit = "charged";
  } else if (target) {
    if (await tryMoveCredit(store, target, -1)) {
      credit = "refunded";
      refunded = target;
    } else {
      credit = "failed";
    }
  }

  let googleEventDeleted = false;
  if (s.google_event_id) {
    try {
      googleEventDeleted = await store.deleteGoogleEvent(s.google_event_id);
    } catch {
      googleEventDeleted = false;
    }
  }

  return {
    sessionId: s.id,
    removal: input.removal,
    previousStatus: s.status,
    status,
    deletedAt,
    credit,
    refunded,
    googleEventId: s.google_event_id,
    googleEventDeleted,
  };
}

export interface RestoreResult {
  /** null se non c'era un evento Google da ricreare. */
  googleEventRecreated: boolean | null;
}

/**
 * «Ripristina» del toast: rimette la sessione esattamente com'era prima di
 * removeSession. Stato (e deleted_at) tornano indietro, il credito restituito
 * si riprende dalla stessa riga, l'evento Google tolto si ricrea. Se il
 * credito non si riprende (usato nel frattempo), la sessione resta annullata e
 * si lancia CreditUnavailableError: mai una sessione in agenda senza il suo
 * credito.
 */
export async function restoreSession(
  store: SessionStore,
  r: RemoveSessionResult,
): Promise<RestoreResult> {
  const recreate = r.googleEventDeleted;
  const written = await store.updateSession(
    r.sessionId,
    { status: r.status, deleted: r.deletedAt !== null },
    {
      status: r.previousStatus,
      ...(r.deletedAt !== null ? { deleted_at: null } : {}),
      // L'id del vecchio evento non vale più: se restasse, la riconciliazione
      // Google → app vedrebbe l'evento cancellato e annullerebbe di nuovo la
      // sessione. Vuoto, lo riempie createGoogleEvent (o la riparazione del
      // Calendario, se Google non risponde).
      ...(recreate ? { google_event_id: null } : {}),
    },
  );
  if (!written) {
    throw new SessionChangedError(
      "La sessione è stata modificata dopo l'annullamento: non si può ripristinare.",
    );
  }

  if (r.refunded && !(await tryMoveCredit(store, r.refunded, 1))) {
    await store.updateSession(
      r.sessionId,
      { status: r.previousStatus, deleted: false },
      {
        status: r.status,
        ...(r.deletedAt !== null ? { deleted_at: r.deletedAt } : {}),
        ...(recreate ? { google_event_id: r.googleEventId } : {}),
      },
    );
    throw new CreditUnavailableError(
      "Il credito restituito è già stato usato per un'altra sessione: questa resta annullata.",
    );
  }

  if (!recreate) return { googleEventRecreated: null };
  try {
    return { googleEventRecreated: await store.createGoogleEvent(r.sessionId) };
  } catch {
    return { googleEventRecreated: false };
  }
}
