// ----------------------------------------------------------------------------
// Pacchetto — rinnovo, crediti extra, nuovo percorso (passata 02, audit O2)
// ----------------------------------------------------------------------------
// Una sola finestra per rinnovare o cambiare il pacchetto, dalla Panoramica e
// dal Profilo. Le scritture sono quelle di `assignPackage` (prima in
// trainer.clients.$id.tsx) e degli extra_credits, spostate qui per usarle da
// entrambe le pagine:
//   - Rinnova lo stesso: un blocco da 28 giorni dopo l'ultimo, con le stesse
//     allocazioni dell'ultimo blocco (come il rinnovo automatico del server,
//     ensure_client_block_state in 20260827143325);
//   - Crediti extra: una riga extra_credits (senza scadenza, come prima); un
//     cliente senza blocchi diventa «Cliente Libero», come l'assegnazione di
//     prima;
//   - Nuovo percorso: N blocchi (1 per l'abbonamento) accodati dopo l'ultimo,
//     con i crediti per blocco scelti, e il nuovo tipo di percorso sul profilo.
// I blocchi restano in fila: il server li riallinea comunque da
// path_start_date, uno dopo l'altro (repair_blocks_alignment), quindi il primo
// nuovo blocco parte il giorno dopo la fine dell'ultimo.
// «Ripristina» toglie ciò che è stato aggiunto e rimette il profilo com'era,
// solo se nel frattempo nessuno ha prenotato con i nuovi crediti.
// ----------------------------------------------------------------------------

import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { SessionType } from "@/lib/mock-data";

export const BLOCK_DAYS = 28;
export const EXTRA_MIN = 1;
export const EXTRA_MAX = 30;
export const BLOCKS_MIN = 1;
export const BLOCKS_MAX = 24;
export const CREDITS_PER_BLOCK_MAX = 50;
/** Scadenza degli extra assegnati dal coach: di fatto nessuna, come prima. */
export const EXTRA_EXPIRES_AT = "2100-01-01T00:00:00.000Z";

export type PackageMode = "renew" | "extra" | "path";
export type PathType = "fixed" | "recurring" | "free";

export interface PackageAllocation {
  week_number: number;
  session_type: SessionType;
  event_type_id: string | null;
  quantity_assigned: number;
  quantity_booked: number;
}

export interface PackageBlock {
  id: string;
  sequence_order: number;
  start_date: string;
  end_date: string;
  duration_days: number | null;
  grace_days: number | null;
  allocations: PackageAllocation[];
}

export interface PackageProfile {
  path_type: string;
  pack_label: string | null;
  auto_renew: boolean;
  auto_renew_blocks: boolean;
  path_start_date: string | null;
  next_billing_date: string | null;
}

export interface PackageEventType {
  id: string;
  name: string;
  color: string;
  base_type: SessionType;
}

function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Ultimo blocco del percorso (sequence_order più alto). */
export function lastBlock<T extends { sequence_order: number }>(blocks: readonly T[]): T | null {
  return [...blocks].sort((a, b) => b.sequence_order - a.sequence_order)[0] ?? null;
}

/**
 * Date di un nuovo blocco accodato: dal giorno dopo la fine dell'ultimo (oggi
 * se non ce ne sono), per `days` giorni estremi inclusi.
 */
export function nextBlockDates(
  last: { end_date: string } | null,
  today: string,
  days: number = BLOCK_DAYS,
): { start: string; end: string } {
  const start = last ? addDays(parseISO(last.end_date), 1) : parseISO(today);
  return { start: isoDay(start), end: isoDay(addDays(start, days - 1)) };
}

/** Giorni di un blocco dalle sue date (estremi inclusi): il server le tiene coerenti con duration_days. */
export function blockLength(block: { start_date: string; end_date: string } | null): number {
  if (!block) return BLOCK_DAYS;
  const days = differenceInCalendarDays(parseISO(block.end_date), parseISO(block.start_date)) + 1;
  return days > 0 ? days : BLOCK_DAYS;
}

/** Rinnovo possibile: percorso a blocchi con un ultimo blocco che ha crediti da copiare. */
export function canRenew(profile: { path_type: string }, blocks: readonly PackageBlock[]): boolean {
  if (profile.path_type === "free") return false;
  const last = lastBlock(blocks);
  return !!last && last.allocations.some((a) => a.quantity_assigned > 0);
}

/** Crediti per tipologia di un blocco, nell'ordine delle tipologie del coach. */
export function creditsByType(
  block: Pick<PackageBlock, "allocations"> | null,
  types: readonly PackageEventType[],
): Array<{ type: PackageEventType; qty: number }> {
  if (!block) return [];
  return types
    .map((type) => ({
      type,
      qty: block.allocations
        .filter((a) => a.event_type_id === type.id)
        .reduce((n, a) => n + a.quantity_assigned, 0),
    }))
    .filter((r) => r.qty > 0);
}

/** «8 crediti» · «1 credito». */
export function formatCredits(n: number): string {
  return n === 1 ? "1 credito" : `${n} crediti`;
}

/** Nota del rinnovo con i crediti residui del blocco in corso. */
export function renewNote(firstDay: string, residual: number): string {
  const opens = `Il cliente può prenotare le sessioni del nuovo blocco dal ${firstDay}.`;
  if (residual <= 0) return opens;
  return residual === 1
    ? `${opens} Il credito residuo resta valido fino alla fine del blocco in corso.`
    : `${opens} I ${residual} crediti residui restano validi fino alla fine del blocco in corso.`;
}

// ---------------------------------------------------------------------------
// Scritture
// ---------------------------------------------------------------------------

export interface NewBlockRow {
  client_id: string;
  coach_id: string;
  start_date: string;
  end_date: string;
  status: "active";
  sequence_order: number;
  duration_days: number;
  grace_days?: number;
}

export interface NewAllocationRow {
  block_id: string;
  week_number: number;
  session_type: SessionType;
  event_type_id: string | null;
  quantity_assigned: number;
  quantity_booked: 0;
  valid_until: null;
}

export interface PackageStore {
  listBlocks(clientId: string): Promise<PackageBlock[]>;
  getProfile(clientId: string): Promise<PackageProfile>;
  /** Inserisce i blocchi e ne restituisce id e sequence_order. */
  insertBlocks(rows: NewBlockRow[]): Promise<Array<{ id: string; sequence_order: number }>>;
  insertAllocations(rows: NewAllocationRow[]): Promise<void>;
  /** Crediti già prenotati sulle allocazioni di questi blocchi. */
  bookedInBlocks(blockIds: string[]): Promise<number>;
  /** Toglie i blocchi (deleted_at): spariscono da percorso, crediti e riallineamento. */
  removeBlocks(blockIds: string[]): Promise<void>;
  insertExtraCredit(row: {
    client_id: string;
    event_type_id: string;
    quantity: number;
  }): Promise<string>;
  /** quantity_booked della riga, null se non esiste più. */
  extraCreditBooked(id: string): Promise<number | null>;
  deleteExtraCredit(id: string): Promise<void>;
  updateProfile(clientId: string, patch: Partial<PackageProfile>): Promise<void>;
}

/** Quanto serve a «Ripristina»: cosa è stato aggiunto e il profilo di prima. */
export interface PackageChange {
  clientId: string;
  blockIds: string[];
  extraCreditId: string | null;
  profileBefore: Partial<PackageProfile> | null;
}

export class PackageInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageInUseError";
  }
}

async function appendBlocks(
  store: PackageStore,
  args: {
    clientId: string;
    coachId: string;
    today: string;
    blocks: readonly PackageBlock[];
    count: number;
    durationDays: number;
    graceDays?: number;
    allocationsFor: (blockIndex: number) => Array<Omit<NewAllocationRow, "block_id">>;
  },
): Promise<{ ids: string[]; first: string; last: string }> {
  const prev = lastBlock(args.blocks);
  const seq = prev?.sequence_order ?? 0;
  const rows: NewBlockRow[] = [];
  let tail: { end_date: string } | null = prev;
  for (let i = 0; i < args.count; i++) {
    const { start, end } = nextBlockDates(tail, args.today, args.durationDays);
    rows.push({
      client_id: args.clientId,
      coach_id: args.coachId,
      start_date: start,
      end_date: end,
      status: "active",
      sequence_order: seq + i + 1,
      duration_days: args.durationDays,
      ...(args.graceDays !== undefined ? { grace_days: args.graceDays } : {}),
    });
    tail = { end_date: end };
  }
  const inserted = await store.insertBlocks(rows);
  const ids = inserted.map((b) => b.id);
  const allocations = inserted.flatMap((b) =>
    args.allocationsFor(b.sequence_order - seq - 1).map((a) => ({ ...a, block_id: b.id })),
  );
  try {
    if (allocations.length > 0) await store.insertAllocations(allocations);
  } catch (e) {
    // Senza crediti i blocchi non servono: si tolgono per non lasciarli vuoti.
    await store.removeBlocks(ids);
    throw e;
  }
  return { ids, first: rows[0]!.start_date, last: rows[rows.length - 1]!.end_date };
}

/** Rinnova lo stesso: un blocco dopo l'ultimo, con le stesse allocazioni. */
export async function renewPackage(
  store: PackageStore,
  input: { clientId: string; coachId: string; today: string },
): Promise<PackageChange> {
  const blocks = await store.listBlocks(input.clientId);
  const profile = await store.getProfile(input.clientId);
  if (!canRenew(profile, blocks)) {
    throw new Error("Questo cliente non ha un blocco da rinnovare.");
  }
  const last = lastBlock(blocks)!;
  const added = await appendBlocks(store, {
    ...input,
    blocks,
    count: 1,
    durationDays: last.duration_days ?? blockLength(last),
    graceDays: last.grace_days ?? undefined,
    allocationsFor: () =>
      last.allocations.map((a) => ({
        week_number: a.week_number,
        session_type: a.session_type,
        event_type_id: a.event_type_id,
        quantity_assigned: a.quantity_assigned,
        quantity_booked: 0,
        valid_until: null,
      })),
  });
  return {
    clientId: input.clientId,
    blockIds: added.ids,
    extraCreditId: null,
    profileBefore: null,
  };
}

/** Crediti extra di una tipologia; un cliente senza blocchi diventa «Cliente Libero». */
export async function addExtraCredits(
  store: PackageStore,
  input: { clientId: string; eventTypeId: string; quantity: number },
): Promise<PackageChange> {
  const quantity = Math.min(EXTRA_MAX, Math.max(EXTRA_MIN, Math.round(input.quantity)));
  const [blocks, profile] = await Promise.all([
    store.listBlocks(input.clientId),
    store.getProfile(input.clientId),
  ]);
  const id = await store.insertExtraCredit({
    client_id: input.clientId,
    event_type_id: input.eventTypeId,
    quantity,
  });
  let profileBefore: Partial<PackageProfile> | null = null;
  if (blocks.length === 0 && profile.path_type !== "free") {
    profileBefore = {
      path_type: profile.path_type,
      pack_label: profile.pack_label,
      auto_renew: profile.auto_renew,
      auto_renew_blocks: profile.auto_renew_blocks,
      next_billing_date: profile.next_billing_date,
    };
    await store.updateProfile(input.clientId, {
      path_type: "free",
      pack_label: profile.pack_label ?? "Cliente Libero",
      auto_renew: false,
      auto_renew_blocks: false,
      next_billing_date: null,
    });
  }
  return { clientId: input.clientId, blockIds: [], extraCreditId: id, profileBefore };
}

/** Nuovo percorso: blocchi accodati con i crediti per blocco e il nuovo tipo di percorso. */
export async function assignNewPath(
  store: PackageStore,
  input: {
    clientId: string;
    coachId: string;
    today: string;
    pathType: "fixed" | "recurring";
    /** Blocchi del percorso fisso; l'abbonamento ne crea uno, poi si rinnova da solo. */
    blocks: number;
    /** Crediti per blocco, per tipologia (solo quelli > 0). */
    credits: Array<{ eventTypeId: string; sessionType: SessionType; perBlock: number }>;
  },
): Promise<PackageChange> {
  const rules = input.credits.filter((c) => c.perBlock > 0);
  if (rules.length === 0) throw new Error("Imposta almeno un credito per blocco.");
  const count =
    input.pathType === "recurring" ? 1 : Math.min(BLOCKS_MAX, Math.max(BLOCKS_MIN, input.blocks));
  const [blocks, profile] = await Promise.all([
    store.listBlocks(input.clientId),
    store.getProfile(input.clientId),
  ]);
  const added = await appendBlocks(store, {
    clientId: input.clientId,
    coachId: input.coachId,
    today: input.today,
    blocks,
    count,
    durationDays: BLOCK_DAYS,
    allocationsFor: () =>
      rules.map((r) => ({
        week_number: 1,
        session_type: r.sessionType,
        event_type_id: r.eventTypeId,
        quantity_assigned: Math.min(CREDITS_PER_BLOCK_MAX, r.perBlock),
        quantity_booked: 0,
        valid_until: null,
      })),
  });

  const recurring = input.pathType === "recurring";
  // path_start_date è l'ancora da cui il server rimette in fila i blocchi: si
  // tiene quella che c'è; senza blocchi precedenti parte dal primo nuovo.
  const earliest = [...blocks].sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const anchor =
    blocks.length === 0
      ? added.first
      : (profile.path_start_date ?? earliest?.start_date ?? added.first);
  const profileBefore: Partial<PackageProfile> = {
    path_type: profile.path_type,
    pack_label: profile.pack_label,
    auto_renew: profile.auto_renew,
    auto_renew_blocks: profile.auto_renew_blocks,
    path_start_date: profile.path_start_date,
    next_billing_date: profile.next_billing_date,
  };
  try {
    await store.updateProfile(input.clientId, {
      path_type: input.pathType,
      pack_label: null,
      auto_renew: recurring,
      auto_renew_blocks: recurring,
      path_start_date: anchor,
      next_billing_date: recurring ? added.last : null,
    });
  } catch (e) {
    await store.removeBlocks(added.ids);
    throw e;
  }
  return { clientId: input.clientId, blockIds: added.ids, extraCreditId: null, profileBefore };
}

/** «Ripristina»: toglie blocchi ed extra aggiunti e rimette il profilo com'era. */
export async function undoPackageChange(store: PackageStore, change: PackageChange): Promise<void> {
  if (change.blockIds.length > 0 && (await store.bookedInBlocks(change.blockIds)) > 0) {
    throw new PackageInUseError(
      "Il cliente ha già prenotato con i nuovi crediti: il pacchetto resta com'è.",
    );
  }
  if (change.extraCreditId) {
    const booked = await store.extraCreditBooked(change.extraCreditId);
    if (booked !== null && booked > 0) {
      throw new PackageInUseError(
        "Il cliente ha già usato i crediti extra: il pacchetto resta com'è.",
      );
    }
  }
  if (change.blockIds.length > 0) await store.removeBlocks(change.blockIds);
  if (change.extraCreditId) await store.deleteExtraCredit(change.extraCreditId);
  if (change.profileBefore) await store.updateProfile(change.clientId, change.profileBefore);
}
