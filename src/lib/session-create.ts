// ----------------------------------------------------------------------------
// Creazione di sessioni e impegni dal coach (audit C6, passata 04)
// ----------------------------------------------------------------------------
// Nessuna migrazione: il coach può già inserire in bookings (policy «Coach
// manage clients bookings», 20260509204116) e il credito lo scalano i trigger
// BEFORE INSERT che girano anche quando prenota il cliente, come sono dal giro
// del server del 02/10/2026:
//   - validate_booking_block_allocation: con block_id e un cliente, prende un
//     credito della tipologia (o dello stesso session_type) fra i blocchi del
//     cliente che contengono la data, prima quello passato; se nessuno ne ha,
//     block_id torna vuoto e la sessione la paga un extra. Prima
//     sceglieva fra tutti i blocchi del cliente, anche finiti, e
//     pickInsertAllocation (credit-order.ts) seguiva quell'ordine fino alla
//     passata 11 del lato cliente;
//   - validate_booking_extra_credits: senza block_id prende un credito extra
//     della tipologia che vale alla data della sessione; senza credito
//     rifiuta.
// La riga ha la forma di quella del cliente (l'inserimento di
// use-book-confirm.ts):
// block_id del blocco che contiene la data quando lì il trigger troverà un
// credito, altrimenti vuoto per un credito extra. Prima di salvare il dialog
// calcola quale credito userà (planSessionCredit); se non ce n'è nessuno non si
// salva, perché il server rifiuterebbe.
// Dopo l'inserimento si crea l'evento su Google e se ne salva l'id; se Google
// non risponde la sessione resta ed entra fra quelle «non su Google».
// «Ripristina» è l'«Elimina» della 02 (removeSession in cancel-session.ts):
// deleted_at, credito restituito, evento Google tolto.
// ----------------------------------------------------------------------------

import { blockForDate } from "@/lib/assign-event";
import type { SessionStore } from "@/lib/cancel-session";
import {
  pickConsumeExtraCredit,
  pickInsertAllocation,
  type OrderedAllocation,
  type OrderedExtraCredit,
} from "@/lib/credit-order";
import type { SessionType } from "@/lib/mock-data";

/** Blocco del cliente (training_blocks non eliminato). */
export interface ClientBlockLite {
  id: string;
  start_date: string;
  end_date: string;
  /** L'ordine del blocco nel percorso: il trigger lo usa dopo l'inizio (passata 11). */
  sequence_order?: number | null;
}

/** Riga da inserire in bookings. end_at lo ricalcola il trigger delle durate. */
export interface NewSessionRow {
  coach_id: string;
  client_id: string | null;
  block_id: string | null;
  event_type_id: string | null;
  session_type: SessionType;
  scheduled_at: string;
  end_at: string;
  duration_min: number;
  status: "scheduled";
  is_personal: boolean;
  category: "client_session" | "personal";
  title: string | null;
}

/** Letture e scritture della creazione e della modifica (Supabase in app, memoria nei test). */
export interface CalendarStore extends SessionStore {
  listClientBlocks(clientId: string): Promise<ClientBlockLite[]>;
  /** Allocazioni di tutti i blocchi non eliminati del cliente. */
  listClientAllocations(clientId: string): Promise<OrderedAllocation[]>;
  listClientExtraCredits(clientId: string): Promise<OrderedExtraCredit[]>;
  /** Inserisce la sessione; i trigger scalano il credito. Errore mappato per il coach. */
  insertSession(row: NewSessionRow): Promise<{ id: string }>;
}

/** Il cliente non ha crediti per questa tipologia. */
export class NoCreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoCreditError";
  }
}

export type CreditPlan =
  | {
      source: "block";
      /** block_id da scrivere: il blocco che contiene la data. */
      refBlockId: string;
      /** L'allocazione che il trigger scalerà (può stare in un altro blocco). */
      allocation: OrderedAllocation;
    }
  | { source: "extra"; credit: OrderedExtraCredit };

export interface CreditPlanInput {
  scheduledAt: string;
  eventTypeId: string;
  sessionType: SessionType;
  blocks: readonly ClientBlockLite[];
  allocations: readonly OrderedAllocation[];
  extras: readonly OrderedExtraCredit[];
}

/**
 * Il credito che userà la sessione, con le regole dei due trigger:
 *   1. se un blocco contiene la data, quello che validate_booking_block_allocation
 *      sceglierebbe fra i blocchi del cliente che contengono la data, prima
 *      quello passato;
 *   2. altrimenti, o se nei blocchi non c'è capienza, un credito extra della
 *      tipologia che vale alla data (validate_booking_extra_credits);
 *   3. null: nessun credito, il server rifiuterebbe.
 */
export function planSessionCredit(input: CreditPlanInput): CreditPlan | null {
  const ref = blockForDate(input.blocks, input.scheduledAt);
  if (ref) {
    const allocation = pickInsertAllocation(
      {
        block_id: ref.id,
        event_type_id: input.eventTypeId,
        session_type: input.sessionType,
        scheduled_at: input.scheduledAt,
      },
      input.allocations,
      input.blocks,
    );
    if (allocation) return { source: "block", refBlockId: ref.id, allocation };
  }
  const credit = pickConsumeExtraCredit(input.eventTypeId, input.extras, input.scheduledAt);
  return credit ? { source: "extra", credit } : null;
}

/**
 * Messaggio per il coach quando l'inserimento o lo spostamento fallisce lo
 * stesso: i testi dei trigger sono scritti per il cliente («Acquista un
 * Booster per continuare»).
 */
export function coachWriteError(err: { code?: string; message?: string }): string {
  const msg = err.message ?? "";
  if (err.code === "23P01") return "L'orario si sovrappone a un altro evento: scegline un altro.";
  if (/credito|booster/i.test(msg)) {
    return "Il cliente non ha più crediti per questa tipologia: la sessione non è stata salvata.";
  }
  if (err.code === "P0001" && msg) return msg;
  return "Salvataggio non riuscito. Riprova.";
}

/** «Marta non ha crediti Personal Training disponibili.» */
export function noCreditMessage(clientName: string, typeName: string): string {
  const first = clientName.trim().split(/\s+/)[0] || clientName;
  return `${first} non ha crediti ${typeName} disponibili.`;
}

/** Tutti i crediti del cliente, letti una volta per il dialog. */
export interface ClientCredits {
  blocks: ClientBlockLite[];
  allocations: OrderedAllocation[];
  extras: OrderedExtraCredit[];
}

export async function loadClientCredits(
  store: Pick<
    CalendarStore,
    "listClientBlocks" | "listClientAllocations" | "listClientExtraCredits"
  >,
  clientId: string,
): Promise<ClientCredits> {
  const [blocks, allocations, extras] = await Promise.all([
    store.listClientBlocks(clientId),
    store.listClientAllocations(clientId),
    store.listClientExtraCredits(clientId),
  ]);
  return { blocks, allocations, extras };
}

export interface NewClientSession {
  coachId: string;
  clientId: string;
  clientName: string;
  type: { id: string; name: string; base_type: SessionType };
  scheduledAt: string;
  durationMin: number;
}

export interface CreateResult {
  sessionId: string;
  plan: CreditPlan | null;
  googleEventCreated: boolean;
}

function endAt(scheduledAt: string, minutes: number): string {
  return new Date(new Date(scheduledAt).getTime() + minutes * 60_000).toISOString();
}

async function tryCreateGoogleEvent(store: CalendarStore, id: string): Promise<boolean> {
  try {
    return await store.createGoogleEvent(id);
  } catch {
    return false;
  }
}

/** Crea una sessione cliente: niente credito, niente sessione. */
export async function createClientSession(
  store: CalendarStore,
  input: NewClientSession,
): Promise<CreateResult> {
  const credits = await loadClientCredits(store, input.clientId);
  const plan = planSessionCredit({
    scheduledAt: input.scheduledAt,
    eventTypeId: input.type.id,
    sessionType: input.type.base_type,
    ...credits,
  });
  if (!plan) throw new NoCreditError(noCreditMessage(input.clientName, input.type.name));
  const { id } = await store.insertSession({
    coach_id: input.coachId,
    client_id: input.clientId,
    block_id: plan.source === "block" ? plan.refBlockId : null,
    event_type_id: input.type.id,
    session_type: input.type.base_type,
    scheduled_at: input.scheduledAt,
    end_at: endAt(input.scheduledAt, input.durationMin),
    duration_min: input.durationMin,
    status: "scheduled",
    is_personal: false,
    category: "client_session",
    title: null,
  });
  return { sessionId: id, plan, googleEventCreated: await tryCreateGoogleEvent(store, id) };
}

export interface NewCommitment {
  coachId: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
}

/**
 * Crea un impegno personale, come lo salva l'app quando segna un evento
 * «impegno personale» (mark_booking_special: is_personal, category
 * "personal", senza cliente, blocco e tipologia). Nessun credito.
 */
export async function createCommitment(
  store: CalendarStore,
  input: NewCommitment,
): Promise<CreateResult> {
  const { id } = await store.insertSession({
    coach_id: input.coachId,
    client_id: null,
    block_id: null,
    event_type_id: null,
    session_type: "PT Session",
    scheduled_at: input.scheduledAt,
    end_at: endAt(input.scheduledAt, input.durationMin),
    duration_min: input.durationMin,
    status: "scheduled",
    is_personal: true,
    category: "personal",
    title: input.title.trim(),
  });
  return { sessionId: id, plan: null, googleEventCreated: await tryCreateGoogleEvent(store, id) };
}
