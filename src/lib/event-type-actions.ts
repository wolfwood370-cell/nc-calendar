// ----------------------------------------------------------------------------
// Scritture delle tipologie di sessione (passata 07)
// ----------------------------------------------------------------------------
// Una strada sola, per il desktop e per il telefono: i −/+ della card,
// l'interruttore «Prenotabile dai clienti», il salvataggio del dialog e
// l'eliminazione. I controlli stanno qui, non nei dialog, così valgono per
// chiunque salvi:
//   - nome vuoto, troppo lungo o doppione (senza maiuscole e spazi ai lati);
//   - nome bloccato se il negozio vende la tipologia cercandola per nome;
//   - una tipologia in uso non si elimina: l'uso si rilegge dal database
//     subito prima di cancellare, con lo stesso verdetto puro della pagina
//     (event-type-usage.ts). Se non si riesce a leggere, non si elimina.
//     Fra la rilettura e la cancellazione resta una finestra: chiuderla
//     vuole una funzione sul server, cioè una migrazione.
// Il salvataggio porta la logica di prima (indirizzo vuoto se Online, testi
// senza spazi ai lati), tranne la cancellazione di unavailable_message: il
// messaggio resta, e torna quando la tipologia si spegne di nuovo.
// ----------------------------------------------------------------------------

import {
  ADDRESS_MAX,
  BUFFER_GRID,
  DESCRIPTION_MAX,
  DURATION_GRID,
  MESSAGE_MAX,
  NAME_ERRORS,
  nameProblem,
  stepValue,
  type NameProblem,
} from "@/lib/event-type-rules";
import {
  inUseSummary,
  isTypeInUse,
  typeUsage,
  USAGE_UNREADABLE,
  type TypeUsage,
  type UsageData,
} from "@/lib/event-type-usage";
import type { EventTypeRow } from "@/lib/queries";

/** I campi che il coach modifica. */
export type EventTypeFields = Pick<
  EventTypeRow,
  | "name"
  | "description"
  | "color"
  | "duration"
  | "buffer_minutes"
  | "location_type"
  | "location_address"
  | "client_bookable"
  | "unavailable_message"
>;

export type EventTypePatch = Partial<EventTypeFields>;

/** Quello che il dialog raccoglie, testi così come sono scritti. */
export interface EventTypeInput {
  name: string;
  description: string;
  color: string;
  duration: number;
  buffer_minutes: number;
  location_type: "physical" | "online";
  location_address: string;
  client_bookable: boolean;
  unavailable_message: string;
}

export interface EventTypeStore {
  /** Tipologie del coach, lette adesso (per i doppioni). */
  listTypeNames(coachId: string): Promise<{ id: string; name: string }[]>;
  /** event_type_title dei pacchetti attivi del negozio, letti adesso. */
  activeShopTitles(): Promise<string[]>;
  insertType(coachId: string, fields: EventTypeFields): Promise<EventTypeRow>;
  /** Aggiorna una riga; errore se non ne aggiorna nessuna. */
  updateType(id: string, patch: EventTypePatch): Promise<void>;
  /** Elimina una riga; errore se non ne elimina nessuna. */
  deleteType(id: string): Promise<void>;
  /**
   * Nome attuale della tipologia (null se non c'è più) e tutte le righe che
   * decidono se è in uso, lette adesso dal database.
   */
  loadUsage(typeId: string, coachId: string): Promise<{ name: string | null; data: UsageData }>;
}

export class EventTypeRuleError extends Error {
  constructor(readonly problem: NameProblem | "invalid") {
    super(problem === "invalid" ? "Dati non validi." : NAME_ERRORS[problem]);
    this.name = "EventTypeRuleError";
  }
}

export class TypeInUseError extends Error {
  constructor(readonly usage: TypeUsage) {
    super(`${inUseSummary(usage)} Finché è in uso non si può eliminare.`);
    this.name = "TypeInUseError";
  }
}

export class UsageUnreadableError extends Error {
  constructor(readonly cause?: unknown) {
    super(USAGE_UNREADABLE);
    this.name = "UsageUnreadableError";
  }
}

export class TypeGoneError extends Error {
  constructor() {
    super("Questa tipologia non esiste più.");
    this.name = "TypeGoneError";
  }
}

// ---------------------------------------------------------------------------
// −/+ e interruttore della card
// ---------------------------------------------------------------------------

export type StepField = "duration" | "buffer_minutes";

const GRID = { duration: DURATION_GRID, buffer_minutes: BUFFER_GRID } as const;

/** Il valore dopo il clic, o null al limite (pulsante disabilitato). */
export function nextStep(type: Pick<EventTypeRow, StepField>, field: StepField, dir: 1 | -1) {
  return stepValue(type[field], dir, GRID[field]);
}

/** Scrive subito durata o margine; null (e nessuna scrittura) al limite. */
export async function stepEventType(
  store: EventTypeStore,
  type: Pick<EventTypeRow, "id" | StepField>,
  field: StepField,
  dir: 1 | -1,
): Promise<number | null> {
  const next = nextStep(type, field, dir);
  if (next === null) return null;
  await store.updateType(type.id, { [field]: next });
  return next;
}

/** Scrive solo client_bookable: il messaggio per i clienti non si tocca. */
export async function setBookable(
  store: EventTypeStore,
  typeId: string,
  bookable: boolean,
): Promise<void> {
  await store.updateType(typeId, { client_bookable: bookable });
}

// ---------------------------------------------------------------------------
// Salvataggio del dialog
// ---------------------------------------------------------------------------

function isValidInput(v: EventTypeInput): boolean {
  const int = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  return (
    /^#[0-9a-fA-F]{6}$/.test(v.color.trim()) &&
    int(v.duration, 15, 240) &&
    int(v.buffer_minutes, 0, 240) &&
    (v.location_type === "physical" || v.location_type === "online") &&
    v.description.trim().length <= DESCRIPTION_MAX &&
    v.location_address.trim().length <= ADDRESS_MAX &&
    v.unavailable_message.trim().length <= MESSAGE_MAX
  );
}

/** I campi da scrivere: testi senza spazi ai lati, vuoti = null, indirizzo solo in studio. */
export function fieldsOf(v: EventTypeInput, name: string): EventTypeFields {
  return {
    name,
    description: v.description.trim() || null,
    color: v.color.trim(),
    duration: v.duration,
    buffer_minutes: v.buffer_minutes,
    location_type: v.location_type,
    location_address: v.location_type === "physical" ? v.location_address.trim() || null : null,
    client_bookable: v.client_bookable,
    unavailable_message: v.unavailable_message.trim() || null,
  };
}

export function fieldsOfRow(row: EventTypeRow): EventTypeFields {
  return {
    name: row.name,
    description: row.description,
    color: row.color,
    duration: row.duration,
    buffer_minutes: row.buffer_minutes,
    location_type: row.location_type,
    location_address: row.location_address,
    client_bookable: row.client_bookable,
    unavailable_message: row.unavailable_message,
  };
}

export type SaveResult =
  | { kind: "created"; row: EventTypeRow }
  | { kind: "updated"; id: string; before: EventTypeFields; after: EventTypeFields };

/**
 * Crea (before = null) o aggiorna una tipologia. Rifiuta con
 * EventTypeRuleError: nome vuoto, troppo lungo, doppione, bloccato dal
 * negozio, o valori fuori dai limiti.
 */
export async function saveEventType(
  store: EventTypeStore,
  input: { coachId: string; before: EventTypeRow | null; values: EventTypeInput },
): Promise<SaveResult> {
  const { coachId, before, values } = input;
  const trimmed = values.name.trim();
  if (!trimmed) throw new EventTypeRuleError("empty");
  if (!isValidInput(values)) throw new EventTypeRuleError("invalid");

  const types = await store.listTypeNames(coachId);
  // Il nome com'è adesso nel database, non quello della cache della pagina.
  const current = before ? (types.find((t) => t.id === before.id)?.name ?? before.name) : null;
  const self = before && current !== null ? { id: before.id, name: current } : null;
  const renames = !!self && trimmed !== self.name.trim();
  const shopTitles = renames ? await store.activeShopTitles() : [];
  const problem = nameProblem(trimmed, self, types, shopTitles);
  if (problem) throw new EventTypeRuleError(problem);

  // Nome invariato: resta quello esatto, spazi compresi (il negozio lo cerca così).
  const name = self && !renames ? self.name : trimmed;
  const after = fieldsOf(values, name);
  if (!before) {
    const row = await store.insertType(coachId, after);
    return { kind: "created", row };
  }
  await store.updateType(before.id, after);
  return { kind: "updated", id: before.id, before: fieldsOfRow(before), after };
}

/** «Ripristina» di un aggiornamento: riscrive i valori di prima. */
export async function undoUpdate(
  store: EventTypeStore,
  result: Extract<SaveResult, { kind: "updated" }>,
): Promise<void> {
  await store.updateType(result.id, result.before);
}

// ---------------------------------------------------------------------------
// Eliminazione
// ---------------------------------------------------------------------------

/**
 * Elimina una tipologia solo se non è in uso, rileggendo l'uso dal database
 * subito prima. Rifiuta con TypeInUseError (con l'uso appena letto),
 * UsageUnreadableError se l'uso non si legge, TypeGoneError se non c'è più.
 * Restituisce l'uso letto. «Ripristina» non c'è: reinserire la riga non
 * ridarebbe la tipologia alle righe che l'hanno persa.
 */
export async function deleteEventType(
  store: EventTypeStore,
  type: { id: string },
  coachId: string,
  now: Date,
): Promise<TypeUsage> {
  let read: { name: string | null; data: UsageData };
  try {
    read = await store.loadUsage(type.id, coachId);
  } catch (e) {
    throw new UsageUnreadableError(e);
  }
  if (read.name === null) throw new TypeGoneError();
  const usage = typeUsage({ id: type.id, name: read.name }, read.data, now);
  if (isTypeInUse(usage)) throw new TypeInUseError(usage);
  await store.deleteType(type.id);
  return usage;
}

/** «Ripristina» di una creazione: elimina, con la stessa verifica. */
export function undoCreate(
  store: EventTypeStore,
  row: EventTypeRow,
  coachId: string,
  now: Date,
): Promise<TypeUsage> {
  return deleteEventType(store, row, coachId, now);
}
