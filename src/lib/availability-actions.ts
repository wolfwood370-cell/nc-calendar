// ----------------------------------------------------------------------------
// Scritture della Disponibilità (passata 08, D4 e D6)
// ----------------------------------------------------------------------------
// Una strada sola per il desktop e per il telefono.
//
// Orario settimanale, salvataggio senza perdite:
//   1. rilegge dal database le righe del coach, non dalla cache della pagina;
//   2. pianifica: le righe uguali (giorno, inizio e fine «HH:MM») restano
//      come sono, quelle che mancano si inseriscono, quelle che non ci sono
//      più si cancellano, contando i doppioni;
//   3. prima inserisce (una richiesta), poi cancella per id (una richiesta);
//   4. con un piano vuoto non scrive niente.
// Se l'inserimento fallisce non è cambiato niente. Se fallisce la
// cancellazione (o cancella meno righe del previsto) le righe nuove ci sono e
// le vecchie pure: l'errore porta le righe che il database ha davvero, e il
// salvataggio successivo, che rilegge, toglie le vecchie. Prima il codice
// cancellava tutto e poi inseriva: un inserimento fallito lasciava il coach
// senza disponibilità, e i clienti senza slot, senza un errore dalla loro
// parte. «Ripristina» è la stessa funzione con le righe di prima come obiettivo.
//
// Eccezioni: un periodo è una riga per giorno (availability-exceptions.ts),
// inserite con una richiesta sola; la rimozione toglie tutte le righe del
// periodo per id, e «Ripristina» le reinserisce con gli stessi id.
// ----------------------------------------------------------------------------

import {
  exceptionRows,
  type ExceptionInput,
  type NewExceptionRow,
} from "@/lib/availability-exceptions";
import { hm, isDow, type WeekSlot } from "@/lib/availability-week";
import type { AvailabilityExceptionRow, AvailabilityRow } from "@/lib/queries";

export interface NewAvailabilityRow {
  coach_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface AvailabilityStore {
  /** Righe dell'orario settimanale del coach, lette adesso dal database. */
  listAvailability(coachId: string): Promise<AvailabilityRow[]>;
  /** Inserisce tutte le righe con una richiesta; errore se non le inserisce tutte. */
  insertAvailability(rows: NewAvailabilityRow[]): Promise<AvailabilityRow[]>;
  /** Cancella per id con una richiesta; restituisce gli id cancellati davvero. */
  deleteAvailability(coachId: string, ids: string[]): Promise<string[]>;
  /** Inserisce tutte le righe con una richiesta; errore se non le inserisce tutte. */
  insertExceptions(rows: NewExceptionRow[]): Promise<AvailabilityExceptionRow[]>;
  /** Cancella per id con una richiesta; restituisce gli id cancellati davvero. */
  deleteExceptions(coachId: string, ids: string[]): Promise<string[]>;
}

function reasonOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Orario settimanale
// ---------------------------------------------------------------------------

function slotKey(dow: number, start: string, end: string): string {
  return `${dow}|${hm(start)}|${hm(end)}`;
}

/** Le fasce di un elenco di righe: l'obiettivo di «Ripristina». */
export function slotsOfRows(rows: readonly AvailabilityRow[]): WeekSlot[] {
  return rows
    .filter((r) => isDow(r.day_of_week))
    .map((r) => ({
      day_of_week: r.day_of_week as WeekSlot["day_of_week"],
      start: hm(r.start_time),
      end: hm(r.end_time),
    }));
}

export interface WeekPlan {
  keep: AvailabilityRow[];
  insert: WeekSlot[];
  remove: AvailabilityRow[];
}

/** Cosa scrivere per passare da `current` a `target`, doppioni compresi. */
export function planWeek(
  current: readonly AvailabilityRow[],
  target: readonly WeekSlot[],
): WeekPlan {
  const byKey = new Map<string, AvailabilityRow[]>();
  for (const r of current) {
    const k = slotKey(r.day_of_week, r.start_time, r.end_time);
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  const keep: AvailabilityRow[] = [];
  const insert: WeekSlot[] = [];
  for (const s of target) {
    const match = byKey.get(slotKey(s.day_of_week, s.start, s.end))?.shift();
    if (match) keep.push(match);
    else insert.push(s);
  }
  const remove = [...byKey.values()].flat();
  return { keep, insert, remove };
}

export function isEmptyPlan(plan: WeekPlan): boolean {
  return plan.insert.length === 0 && plan.remove.length === 0;
}

/** Niente è cambiato nel database. */
export class WeekSaveError extends Error {
  constructor(reason: string) {
    super(`Salvataggio non riuscito: ${reason}`);
    this.name = "WeekSaveError";
  }
}

export const WEEK_SAVE_INCOMPLETE =
  "Salvataggio incompleto: gli orari nuovi ci sono, ma quelli vecchi non sono stati tolti. Riprova.";

/** Le righe nuove ci sono, le vecchie (tutte o in parte) pure. */
export class WeekSaveIncompleteError extends Error {
  constructor(
    /** Le righe che il database ha davvero, rilette. */
    readonly actual: AvailabilityRow[],
  ) {
    super(WEEK_SAVE_INCOMPLETE);
    this.name = "WeekSaveIncompleteError";
  }
}

export interface WeekSaveResult {
  /** Le righe trovate al passo 1: l'obiettivo di «Ripristina». */
  before: AvailabilityRow[];
  /** Le righe dopo il salvataggio. */
  after: AvailabilityRow[];
  inserted: number;
  removed: number;
}

export async function saveWeek(
  store: AvailabilityStore,
  coachId: string,
  target: readonly WeekSlot[],
): Promise<WeekSaveResult> {
  let before: AvailabilityRow[];
  try {
    before = await store.listAvailability(coachId);
  } catch (e) {
    throw new WeekSaveError(reasonOf(e));
  }

  const plan = planWeek(before, target);
  if (isEmptyPlan(plan)) return { before, after: before, inserted: 0, removed: 0 };

  let inserted: AvailabilityRow[] = [];
  if (plan.insert.length > 0) {
    try {
      inserted = await store.insertAvailability(
        plan.insert.map((s) => ({
          coach_id: coachId,
          day_of_week: s.day_of_week,
          start_time: `${s.start}:00`,
          end_time: `${s.end}:00`,
        })),
      );
    } catch (e) {
      throw new WeekSaveError(reasonOf(e));
    }
  }

  if (plan.remove.length > 0) {
    const ids = plan.remove.map((r) => r.id);
    let deleted: string[] = [];
    let failed = false;
    try {
      deleted = await store.deleteAvailability(coachId, ids);
    } catch {
      failed = true;
    }
    if (failed || deleted.length < ids.length) {
      let actual: AvailabilityRow[];
      try {
        actual = await store.listAvailability(coachId);
      } catch {
        const gone = new Set(deleted);
        actual = [...before.filter((r) => !gone.has(r.id)), ...inserted];
      }
      throw new WeekSaveIncompleteError(actual);
    }
  }

  return {
    before,
    after: [...plan.keep, ...inserted],
    inserted: plan.insert.length,
    removed: plan.remove.length,
  };
}

// ---------------------------------------------------------------------------
// Eccezioni
// ---------------------------------------------------------------------------

/** Una riga per giorno del periodo, con un inserimento solo; restituisce le righe con gli id. */
export async function addException(
  store: AvailabilityStore,
  coachId: string,
  input: ExceptionInput,
): Promise<AvailabilityExceptionRow[]> {
  return store.insertExceptions(exceptionRows(coachId, input));
}

export const EXCEPTION_REMOVE_INCOMPLETE =
  "Non ho tolto tutti i giorni dell'eccezione: ricarica la pagina e riprova.";

/** Toglie tutte le righe del periodo; restituisce le righe tolte, per «Ripristina». */
export async function removeExceptions(
  store: AvailabilityStore,
  coachId: string,
  rows: readonly AvailabilityExceptionRow[],
): Promise<AvailabilityExceptionRow[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const deleted = await store.deleteExceptions(coachId, ids);
  if (deleted.length < ids.length) throw new Error(EXCEPTION_REMOVE_INCOMPLETE);
  return [...rows];
}

/** «Ripristina» dopo la rimozione: le stesse righe, con gli stessi id. */
export async function restoreExceptions(
  store: AvailabilityStore,
  rows: readonly AvailabilityExceptionRow[],
): Promise<AvailabilityExceptionRow[]> {
  if (rows.length === 0) return [];
  return store.insertExceptions(
    rows.map((r) => ({
      id: r.id,
      coach_id: r.coach_id,
      date: r.date,
      start_time: r.start_time,
      end_time: r.end_time,
      reason: r.reason,
    })),
  );
}
