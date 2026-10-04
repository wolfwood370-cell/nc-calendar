// ----------------------------------------------------------------------------
// Crediti del cliente: una definizione sola (lato cliente, passata 00, audit H1 e V6)
// ----------------------------------------------------------------------------
// Il blocco di riferimento è clientReferenceBlock (renewal.ts), per tutti e
// due i percorsi: l'id dell'RPC ensure_client_block_state non lo sceglie. Da
// qui:
//   - getNextBlock: il blocco dopo, secondo comesAfter;
//   - getClientPools: una riga per tipologia di un blocco. Il disponibile del
//     blocco è quello che il server scala, quantity_assigned − quantity_booked
//     (getBlockCredits); quello degli extra segue la validità del brief (con
//     crediti e non scaduti), che dal giro del server del 02/10/2026 guarda
//     anche il server: vedi sotto.
//     Svolte, prenotate e perse si contano dalle sessioni attribuite al blocco
//     (block_id), mai per data;
//   - getCreditWindows: i giorni in cui una tipologia si prenota. Ogni credito
//     vale nel suo blocco, e le date del blocco dopo si prenotano coi suoi
//     crediti (decisioni di Nicolò del 28/09/2026). La regola per prenotare sta
//     qui e in nessun'altra funzione; i crediti dei blocchi finiti non contano;
//   - getMoveWindow: i giorni in cui una sessione si sposta, dentro il suo
//     blocco (la regola per spostare);
//   - getClientBlockInfo: piano, blocco e sottotitolo (V6), numerati come il
//     coach (blockChip, client-profile.ts).
// Puri: l'ora entra come parametro, niente rete, niente Sentry. Un'incoerenza
// fra sessioni e quantity_booked si restituisce: la segnala la pagina.
// ----------------------------------------------------------------------------

import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { allocKey } from "@/lib/booking-allocation";
import {
  CLIENT_BOOKING_HORIZON_DAYS,
  CLIENT_RESCHEDULE_WINDOW_DAYS,
  type CreditWindow,
} from "@/lib/booking-rules";
import { getBlockCredits, type CreditAllocation } from "@/lib/credits";
import { blockTiming, toIsoDate } from "@/lib/current-block";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import type { BookingRow, EventTypeRow } from "@/lib/queries";
import {
  clientReferenceBlock,
  comesAfter,
  isValidBlock,
  renewsAutomatically,
  type RenewalBlock,
  type RenewalClient,
} from "@/lib/renewal";
import { formatLongDay } from "@/lib/session-time";

/** Un blocco del cliente con le sue allocazioni, come lo carica useClientBlocks. */
export interface ClientBlock extends RenewalBlock {
  allocations: readonly CreditAllocation[];
}

/**
 * Una sessione del cliente. Per i crediti contano block_id, tipologia e stato;
 * la data no: una sessione conta nel blocco a cui è attribuita.
 */
export type PoolBooking = Pick<
  BookingRow,
  "block_id" | "event_type_id" | "session_type" | "status" | "scheduled_at"
>;

/** Una riga di extra_credits: Booster, o crediti del cliente libero. */
export interface PoolExtra {
  event_type_id: string | null;
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

/** I campi della tipologia che finiscono nella riga. */
export type PoolEventType = Pick<
  EventTypeRow,
  | "id"
  | "name"
  | "color"
  | "duration"
  | "buffer_minutes"
  | "base_type"
  | "location_type"
  | "location_address"
  | "client_bookable"
  | "unavailable_message"
>;

/**
 * I crediti di una tipologia in un blocco. Vale total = done + booked + lost +
 * extraUsed + avail quando le sessioni del blocco coincidono con
 * quantity_booked, salvo a percorso concluso, dove avail è 0.
 */
export interface ClientPool {
  /** allocKey: event_type_id, o `__<session_type>` per le allocazioni senza tipologia. */
  key: string;
  eventTypeId: string | null;
  sessionType: SessionType;
  /** Dalla tipologia; sessionLabel per le allocazioni senza tipologia. L'icona è iconForType(name). */
  name: string;
  color: string | null;
  durationMin: number;
  bufferMin: number;
  location: "physical" | "online" | null;
  address: string | null;
  /** client_bookable */
  bookable: boolean;
  /** unavailable_message */
  message: string | null;
  total: number;
  done: number;
  booked: number;
  /** Assenze e annullamenti tardivi: il credito resta consumato. */
  lost: number;
  /** Crediti extra già impegnati: non sono legati a una sessione del blocco. */
  extraUsed: number;
  /** quantity_assigned − quantity_booked del blocco (getBlockCredits), mai sotto zero. */
  blockAvail: number;
  /** quantity − quantity_booked degli extra validi. */
  extraAvail: number;
  avail: number;
  /** L'ultimo giorno (YYYY-MM-DD) in cui vale un extra della riga; null senza extra. */
  extraUntil: string | null;
}

/** Sessioni del blocco che non coincidono con quantity_booked: la pagina lo segnala a Sentry. */
export interface PoolMismatch {
  key: string;
  name: string;
  /** Sessioni del blocco contate: svolte, prenotate, perse. */
  counted: number;
  /** quantity_booked delle allocazioni. */
  recorded: number;
}

export interface ClientPools {
  /** Per total decrescente. */
  rows: ClientPool[];
  mismatches: PoolMismatch[];
  /** Il blocco è finito: a fine percorso il cliente si ferma finché non rinnova. */
  concluded: boolean;
}

export interface ClientPoolsInput {
  now: Date;
  /** profiles.path_type: il cliente libero non ha blocchi, solo extra. */
  pathType: string | null;
  /** Il blocco di riferimento o il blocco dopo; null per il cliente libero. */
  block: ClientBlock | null;
  /**
   * Le sessioni del cliente, comprese le annullate tardi con deleted_at:
   * cancel_booking lo scrive anche su di loro, e useClientBookings oggi le scarta.
   */
  bookings: readonly PoolBooking[];
  /** I crediti extra del cliente: solo con il blocco di riferimento. */
  extras?: readonly PoolExtra[];
  eventTypes: readonly PoolEventType[];
}

type Bucket = "done" | "booked" | "lost";

function bucketOf(status: PoolBooking["status"]): Bucket | null {
  if (status === "completed") return "done";
  if (status === "scheduled") return "booked";
  if (status === "no_show" || status === "late_cancelled") return "lost";
  return null; // cancelled: il credito è tornato
}

/** Una riga per tipologia del blocco, più gli extra validi (Booster sommati al totale). */
export function getClientPools(input: ClientPoolsInput): ClientPools {
  const { now, bookings } = input;
  const block = input.pathType === "free" ? null : input.block;
  const concluded = block !== null && blockTiming(block, now) === "past";
  const types = new Map(input.eventTypes.map((t) => [t.id, t]));
  const rows = new Map<string, ClientPool>();

  const nameOf = (eventTypeId: string | null, sessionType: SessionType, extra = false) => {
    const t = eventTypeId ? types.get(eventTypeId) : undefined;
    if (t) return t.name;
    return extra ? "Sessione extra" : sessionLabel(sessionType);
  };
  const rowFor = (
    key: string,
    eventTypeId: string | null,
    sessionType: SessionType,
    extra = false,
  ) => {
    const existing = rows.get(key);
    if (existing) return existing;
    const t = eventTypeId ? types.get(eventTypeId) : undefined;
    const row: ClientPool = {
      key,
      eventTypeId,
      sessionType: t?.base_type ?? sessionType,
      name: nameOf(eventTypeId, sessionType, extra),
      color: t?.color ?? null,
      durationMin: t?.duration ?? 60,
      bufferMin: t?.buffer_minutes ?? 0,
      location: t?.location_type ?? null,
      address: t?.location_address ?? null,
      bookable: t?.client_bookable ?? true,
      message: t?.unavailable_message ?? null,
      total: 0,
      done: 0,
      booked: 0,
      lost: 0,
      extraUsed: 0,
      blockAvail: 0,
      extraAvail: 0,
      avail: 0,
      extraUntil: null,
    };
    rows.set(key, row);
    return row;
  };

  // Il blocco: il residuo è quello del server (getBlockCredits).
  const recorded = new Map<string, number>();
  const counted = new Map<string, { n: number; name: string }>();
  if (block) {
    for (const c of getBlockCredits(block.id, block.allocations)) {
      const row = rowFor(c.key, c.eventTypeId, c.sessionType);
      row.total += c.assigned;
      row.blockAvail = c.left;
      recorded.set(c.key, c.booked);
    }
    // Le sessioni attribuite al blocco, non quelle che cadono nelle sue date,
    // ognuna nella riga della sua tipologia (allocKey). Il server può scalare
    // un'allocazione di un'altra tipologia con lo stesso session_type, quando
    // quella della sessione è esaurita o manca (validate_booking_block_allocation,
    // 20260827143053_…sql:41-51): allora contate e registrate non coincidono, e
    // lo dicono le incoerenze.
    for (const b of bookings) {
      if (b.block_id !== block.id) continue;
      const bucket = bucketOf(b.status);
      if (!bucket) continue;
      const key = allocKey(b.event_type_id, b.session_type);
      const seen = counted.get(key);
      counted.set(key, {
        n: (seen?.n ?? 0) + 1,
        name: seen?.name ?? nameOf(b.event_type_id, b.session_type),
      });
      const row = recorded.has(key) ? rows.get(key) : undefined;
      if (row) row[bucket] += 1;
    }
  }

  const mismatches: PoolMismatch[] = [];
  for (const key of new Set([...recorded.keys(), ...counted.keys()])) {
    const c = counted.get(key)?.n ?? 0;
    const r = recorded.get(key) ?? 0;
    if (c !== r) {
      const name = rows.get(key)?.name ?? counted.get(key)?.name ?? key;
      mismatches.push({ key, name, counted: c, recorded: r });
    }
  }

  // Gli extra valgono se hanno ancora crediti e non sono scaduti, come dice il
  // brief; senza tipologia non si prenotano (validate_booking_extra_credits la
  // vuole). Dal giro del server del 02/10/2026 anche il server scala solo un
  // extra che vale alla data della sessione (expires_at >= scheduled_at), il
  // più vicino a scadere: uno scaduto non si consuma più (decisioni 10 e 13).
  for (const e of input.extras ?? []) {
    const left = e.quantity - e.quantity_booked;
    if (!e.event_type_id || left <= 0) continue;
    const expires = new Date(e.expires_at);
    if (expires.getTime() <= now.getTime()) continue;
    const row = rowFor(e.event_type_id, e.event_type_id, "PT Session", true);
    row.total += e.quantity;
    row.extraUsed += e.quantity_booked;
    row.extraAvail += left;
    const until = toIsoDate(expires);
    if (!row.extraUntil || until > row.extraUntil) row.extraUntil = until;
  }

  for (const row of rows.values()) {
    if (concluded) {
      row.blockAvail = 0;
      row.extraAvail = 0;
    }
    row.avail = row.blockAvail + row.extraAvail;
  }
  return {
    rows: [...rows.values()].sort((a, b) => b.total - a.total),
    mismatches,
    concluded,
  };
}

/** Il numero del blocco come lo conta il coach (blockChip): la posizione fra i validi per sequence_order. */
export function blockNumber(blocks: readonly RenewalBlock[], block: RenewalBlock): number | null {
  const valid = blocks.filter(isValidBlock).sort((a, b) => a.sequence_order - b.sequence_order);
  const i = valid.findIndex((b) => b.id === block.id);
  return i >= 0 ? i + 1 : null;
}

/** Il primo blocco valido che viene dopo il riferimento secondo comesAfter; null se non c'è. */
export function getNextBlock<T extends RenewalBlock>(
  blocks: readonly T[],
  reference: RenewalBlock | null,
): T | null {
  if (!reference) return null;
  let next: T | null = null;
  for (const b of blocks) {
    if (!isValidBlock(b) || b.id === reference.id || !comesAfter(b, reference)) continue;
    if (next === null || comesAfter(next, b)) next = b;
  }
  return next;
}

export interface CreditWindowsInput {
  now: Date;
  pathType: string | null;
  /** Tutti i blocchi del cliente: servono per i numeri. */
  blocks: readonly RenewalBlock[];
  /** clientReferenceBlock e le sue righe (getClientPools, con gli extra). */
  reference: RenewalBlock | null;
  referencePools: readonly ClientPool[];
  /** getNextBlock e le sue righe (getClientPools, senza extra). */
  next: RenewalBlock | null;
  nextPools: readonly ClientPool[];
  /** La chiave della tipologia (allocKey). */
  key: string;
}

/**
 * I giorni in cui una tipologia si prenota, e con quale credito: finestre
 * ordinate e senza sovrapposizioni.
 *   - percorso concluso: nessuna;
 *   - il blocco di riferimento, dal suo inizio alla sua fine, se ha crediti suoi;
 *   - il blocco dopo, dal suo inizio alla sua fine, se inizia entro oggi + 14
 *     e ha crediti suoi della tipologia;
 *   - gli extra, mai oltre la loro scadenza: per il cliente libero da oggi;
 *     per un percorso solo sui giorni di quei due blocchi che nessuna finestra
 *     di blocco copre, quindi mai dopo la fine dell'ultimo blocco che esiste
 *     (un extra del coach scade nel 2100).
 */
export function getCreditWindows(input: CreditWindowsInput): CreditWindow[] {
  const { now, blocks, reference: ref, next, key } = input;
  const today = toIsoDate(now);
  const refRow = input.referencePools.find((p) => p.key === key);
  const extraAvail = refRow?.extraAvail ?? 0;
  const extraUntil = refRow?.extraUntil ?? null;
  const hasExtra = extraAvail > 0 && extraUntil !== null && extraUntil >= today;

  if (input.pathType === "free") {
    return hasExtra
      ? [{ from: today, until: extraUntil, source: "extra", blockId: null, blockNumber: null }]
      : [];
  }
  if (!ref || blockTiming(ref, now) === "past") return [];

  const horizon = toIsoDate(addDays(now, CLIENT_BOOKING_HORIZON_DAYS));
  const nextRow = input.nextPools.find((p) => p.key === key);
  const segments: Array<{ block: RenewalBlock; own: boolean }> = [
    { block: ref, own: (refRow?.blockAvail ?? 0) > 0 },
  ];
  if (next && isValidBlock(next) && next.start_date.slice(0, 10) <= horizon) {
    segments.push({ block: next, own: (nextRow?.blockAvail ?? 0) > 0 });
  }

  const windows: CreditWindow[] = [];
  for (const { block, own } of segments) {
    const from = block.start_date.slice(0, 10);
    const end = block.end_date.slice(0, 10);
    const base = { blockId: block.id, blockNumber: blockNumber(blocks, block) };
    if (own) {
      windows.push({ from, until: end, source: "block", ...base });
    } else if (hasExtra) {
      const until = end < extraUntil ? end : extraUntil;
      if (from <= until) windows.push({ from, until, source: "extra", ...base });
    }
  }
  return withoutOverlaps(windows);
}

/** Ordina e, se due blocchi si accavallano, fa partire la finestra dopo il giorno dopo la prima. */
function withoutOverlaps(windows: CreditWindow[]): CreditWindow[] {
  const out: CreditWindow[] = [];
  for (const w of [...windows].sort((a, b) => a.from.localeCompare(b.from))) {
    const prev = out[out.length - 1];
    const from =
      prev && w.from <= prev.until ? toIsoDate(addDays(parseISO(prev.until), 1)) : w.from;
    if (from <= w.until) out.push({ ...w, from });
  }
  return out;
}

/**
 * I giorni in cui una sessione si sposta. Con block_id solo dentro il suo
 * blocco, da oggi (o dal suo inizio) alla sua fine, qualunque sia il residuo:
 * il credito la sessione lo ha già impegnato. Mai nel blocco dopo: un credito
 * non passa di blocco nemmeno spostando. Senza block_id (pagata con un extra,
 * o collegata senza credito) nessun limite di blocco: da oggi a oggi + 14.
 * null se il blocco non c'è fra i blocchi, o è già finito.
 * È la regola voluta; il server oggi può rifiutare. reschedule_booking
 * riprende il credito fra tutti i blocchi del cliente, valid_until più vicino
 * per primo (20260827143053_…sql:214-231), e riscrive block_id (:253-255), che
 * validate_client_booking_update vieta al cliente (20260607191854_…sql:20):
 * con crediti della tipologia in un blocco precedente lo spostamento fallisce.
 * E una sessione senza block_id e senza un extra impegnato non la sposta
 * (:257-285). La correzione del server è del 02/10/2026.
 */
export function getMoveWindow(
  session: Pick<BookingRow, "block_id">,
  blocks: readonly RenewalBlock[],
  now: Date,
): CreditWindow | null {
  const today = toIsoDate(now);
  if (!session.block_id) {
    const until = toIsoDate(addDays(now, CLIENT_RESCHEDULE_WINDOW_DAYS));
    return { from: today, until, source: "extra", blockId: null, blockNumber: null };
  }
  const block = blocks.find((b) => b.id === session.block_id);
  if (!block) return null;
  const start = block.start_date.slice(0, 10);
  const from = start > today ? start : today;
  const until = block.end_date.slice(0, 10);
  if (from > until) return null;
  return {
    from,
    until,
    source: "block",
    blockId: block.id,
    blockNumber: blockNumber(blocks, block),
  };
}

export interface ClientBlockInfo<T extends RenewalBlock = RenewalBlock> {
  /** «Percorso fisso» · «Abbonamento mensile» · «Cliente libero». */
  plan: string;
  /** «Blocco 3 di 6» per il percorso fisso, «Blocco 4» per l'abbonamento; null senza blocco. */
  block: string | null;
  /** Il sottotitolo della card; null per un percorso senza blocchi. */
  subtitle: string | null;
  /** Il numero del blocco di riferimento, come blockChip. */
  number: number | null;
  /** Il blocco di riferimento (clientReferenceBlock). */
  reference: T | null;
}

function dayText(d: Date): string {
  return formatLongDay(d).toLowerCase();
}

function planLabel(pathType: string | null): string {
  if (pathType === "recurring") return "Abbonamento mensile";
  if (pathType === "free") return "Cliente libero";
  return "Percorso fisso";
}

/**
 * Le etichette del percorso sul blocco di riferimento, che calcola lei con
 * clientReferenceBlock: la numerazione vuole comunque tutti i blocchi. Il
 * coach, per l'abbonamento, scrive «Mese 4»; qui vale il brief, «Blocco 4».
 */
export function getClientBlockInfo<T extends RenewalBlock>(
  client: RenewalClient,
  blocks: readonly T[],
  now: Date,
): ClientBlockInfo<T> {
  const plan = planLabel(client.path_type);
  if (client.path_type === "free") {
    return { plan, block: null, subtitle: "Crediti senza scadenza", number: null, reference: null };
  }
  const ref = clientReferenceBlock(blocks, now);
  if (!ref) return { plan, block: null, subtitle: null, number: null, reference: null };

  const recurring = client.path_type === "recurring";
  const n = blockNumber(blocks, ref) ?? 1;
  const total = blocks.filter(isValidBlock).length;
  const start = parseISO(ref.start_date.slice(0, 10));
  const end = parseISO(ref.end_date.slice(0, 10));
  const timing = blockTiming(ref, now);

  let subtitle: string;
  if (timing === "past") {
    subtitle = `Concluso ${dayText(end)}`;
  } else if (timing === "future") {
    subtitle = `Inizia ${dayText(start)}`;
  } else if (recurring) {
    const week = Math.min(4, Math.max(1, Math.floor(differenceInCalendarDays(now, start) / 7) + 1));
    subtitle = renewsAutomatically(client)
      ? `Settimana ${week} di 4 · si rinnova ${dayText(addDays(end, 1))}`
      : `Settimana ${week} di 4 · termina ${dayText(end)}`;
  } else {
    const left = differenceInCalendarDays(end, now);
    const tail =
      left === 0 ? "ultimo giorno" : left === 1 ? "domani l'ultimo giorno" : `${left} giorni`;
    subtitle = `Valgono fino a ${dayText(end)} · ${tail}`;
  }
  return {
    plan,
    block: recurring ? `Blocco ${n}` : `Blocco ${n} di ${total}`,
    subtitle,
    number: n,
    reference: ref,
  };
}
