// ----------------------------------------------------------------------------
// Nuovo cliente: cosa si scrive (passata 05, audit L1, L4)
// ----------------------------------------------------------------------------
// Le scritture sono quelle di createClientAccount in trainer.clients.index.tsx
// prima della passata 05, spostate qui senza cambiarle:
//   1. funzione edge admin-create-user (email, password, nome, cognome);
//   2. cliente libero: una riga extra_credits per tipologia con sessioni
//      omaggio (scadenza 2100-01-01) e il profilo con path_type free, rinnovo
//      spento, pack_label «Cliente Libero»;
//   3. percorso fisso e abbonamento: N blocchi da 30 giorni da oggi, le
//      allocazioni delle regole «dal blocco X al blocco Y» (settimana 1), e il
//      profilo con path_type, rinnovo automatico (acceso solo per il mensile),
//      pack_label, path_start_date e next_billing_date (solo mensile).
// Se il punto 2 o 3 fallisce, l'account resta e il coach lo sa (come prima).
// Il dialog nuovo chiede «crediti per blocco, uguali per ogni blocco»: qui
// diventano le regole di prima, dal blocco 1 al blocco N.
// ----------------------------------------------------------------------------

import type { SessionType } from "@/lib/mock-data";

export type PathType = "fixed" | "recurring" | "free";

/** Durate del percorso fisso: mesi = blocchi, come DURATION_PRESETS del dialog di prima. */
export const DURATION_MONTHS = [3, 6, 12] as const;
/** Etichetta scritta dalla scorciatoia «PT Pack», come applyPtPackPreset di prima. */
export const PT_PACK_LABEL = "Pacchetto 3 sessioni";
export const FREE_PACK_LABEL = "Cliente Libero";
export const BLOCK_DAYS = 30;
export const MAX_BLOCKS = 36;

export interface CreationRule {
  eventTypeId: string;
  sessionType: SessionType;
  quantityPerBlock: number;
  startBlock: number;
  endBlock: number;
}

/** Ciò che si scrive, in una forma sola per il dialog nuovo e quello del telefono. */
export interface NewClientPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  pathType: PathType;
  totalBlocks: number;
  packLabel: string | null;
  autoRenew: boolean;
  rules: CreationRule[];
  /** Solo cliente libero: sessioni omaggio per tipologia. */
  freeCredits: Array<{ eventTypeId: string; quantity: number }>;
}

// ----------------------------------------------------------------------------
// Dal dialog nuovo al payload
// ----------------------------------------------------------------------------

export interface CreationTypeRef {
  id: string;
  base_type: string;
}

export interface CreationDraft {
  firstName: string;
  lastName: string;
  email: string;
  pathType: PathType;
  /** 3, 6, 12, oppure null per «Personalizzata». */
  months: number | null;
  /** Blocchi con «Personalizzata». */
  customBlocks: number;
  /** Crediti per blocco (fisso e mensile) o sessioni omaggio (libero), per tipologia. */
  credits: Record<string, number>;
  /** Etichetta del pacchetto dalla scorciatoia «PT Pack», altrimenti null. */
  packLabel: string | null;
}

/** Blocchi del percorso: 1 per il mensile, 0 per il libero, i mesi o il numero scelto per il fisso. */
export function blocksOf(d: Pick<CreationDraft, "pathType" | "months" | "customBlocks">): number {
  if (d.pathType === "free") return 0;
  if (d.pathType === "recurring") return 1;
  if (d.months !== null) return d.months;
  return Math.max(1, Math.min(MAX_BLOCKS, Math.floor(d.customBlocks) || 1));
}

/** Il rinnovo automatico si accende solo per l'abbonamento mensile (decisione del 26/09). */
export function autoRenewFor(pathType: PathType): boolean {
  return pathType === "recurring";
}

export function creditsPerBlock(d: Pick<CreationDraft, "credits">): number {
  return Object.values(d.credits).reduce((s, n) => s + Math.max(0, n), 0);
}

export function creationPayload(
  d: CreationDraft,
  types: readonly CreationTypeRef[],
  password: string,
): NewClientPayload {
  const totalBlocks = blocksOf(d);
  const chosen = types
    .map((t) => ({ t, n: Math.max(0, Math.floor(d.credits[t.id] ?? 0)) }))
    .filter((x) => x.n > 0);
  const free = d.pathType === "free";
  return {
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    email: d.email,
    password,
    pathType: d.pathType,
    totalBlocks,
    packLabel: free ? FREE_PACK_LABEL : d.packLabel,
    autoRenew: autoRenewFor(d.pathType),
    rules: free
      ? []
      : chosen.map(({ t, n }) => ({
          eventTypeId: t.id,
          sessionType: t.base_type as SessionType,
          quantityPerBlock: n,
          startBlock: 1,
          endBlock: totalBlocks,
        })),
    freeCredits: free ? chosen.map(({ t, n }) => ({ eventTypeId: t.id, quantity: n })) : [],
  };
}

// ----------------------------------------------------------------------------
// Password
// ----------------------------------------------------------------------------

/**
 * 10 caratteri con maiuscola, minuscola, cifra e simbolo, senza caratteri
 * ambigui: la stessa regola di generateSecurePassword del dialog di prima,
 * con numeri casuali crittografici.
 */
export function generatePassword(random: (n: number) => number = cryptoRandom): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[random(s.length)]!;
  const out = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 6; i++) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out.join("");
}

function cryptoRandom(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! % n;
}

// ----------------------------------------------------------------------------
// Scrittura
// ----------------------------------------------------------------------------

export interface NewBlockRow {
  client_id: string;
  coach_id: string;
  start_date: string;
  end_date: string;
  status: "active";
  sequence_order: number;
}

export interface NewAllocationRow {
  block_id: string;
  week_number: number;
  session_type: SessionType;
  event_type_id: string;
  quantity_assigned: number;
  quantity_booked: number;
  valid_until: string | null;
}

export interface NewExtraCreditRow {
  client_id: string;
  event_type_id: string;
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

export interface ProfilePatch {
  path_type: PathType;
  auto_renew: boolean;
  auto_renew_blocks: boolean;
  pack_label: string | null;
  next_billing_date: string | null;
  path_start_date?: string;
}

export interface ClientCreateStore {
  /** admin-create-user; restituisce l'id del nuovo utente o il messaggio d'errore. */
  createUser(input: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }): Promise<{ userId: string } | { error: string }>;
  insertExtraCredit(row: NewExtraCreditRow): Promise<void>;
  updateProfile(id: string, patch: ProfilePatch): Promise<void>;
  insertBlocks(
    rows: NewBlockRow[],
  ): Promise<Array<{ id: string; sequence_order: number; end_date: string }>>;
  insertAllocations(rows: NewAllocationRow[]): Promise<void>;
}

export type CreateClientResult =
  | { ok: false; error: string }
  | {
      ok: true;
      userId: string;
      email: string;
      /** L'account c'è, ma percorso o crediti non sono stati scritti. */
      assignError: string | null;
    };

/** Stessa data di prima: la parte YYYY-MM-DD dell'ISO (UTC) del giorno locale. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function writeNewClient(
  store: ClientCreateStore,
  coachId: string,
  data: NewClientPayload,
  today: Date = new Date(),
): Promise<CreateClientResult> {
  const email = data.email.toLowerCase().trim();
  const created = await store.createUser({
    email,
    password: data.password,
    first_name: data.firstName,
    last_name: data.lastName,
  });
  if ("error" in created) return { ok: false, error: created.error };
  const userId = created.userId;

  try {
    if (data.pathType === "free") {
      // Cliente libero: nessun blocco, solo le sessioni omaggio come crediti extra.
      for (const fc of data.freeCredits) {
        const qty = Math.max(0, fc.quantity);
        if (qty > 0 && fc.eventTypeId) {
          await store.insertExtraCredit({
            client_id: userId,
            event_type_id: fc.eventTypeId,
            quantity: qty,
            quantity_booked: 0,
            expires_at: new Date("2100-01-01T00:00:00Z").toISOString(),
          });
        }
      }
      await store.updateProfile(userId, {
        path_type: "free",
        auto_renew: false,
        auto_renew_blocks: false,
        pack_label: data.packLabel,
        next_billing_date: null,
      });
    } else {
      const blocks: NewBlockRow[] = Array.from({ length: data.totalBlocks }, (_, i) => {
        const start = new Date(today);
        start.setDate(today.getDate() + i * BLOCK_DAYS);
        const end = new Date(today);
        end.setDate(today.getDate() + (i + 1) * BLOCK_DAYS - 1);
        return {
          client_id: userId,
          coach_id: coachId,
          start_date: isoDay(start),
          end_date: isoDay(end),
          status: "active",
          sequence_order: i + 1,
        };
      });
      const inserted = await store.insertBlocks(blocks);
      const blockBySeq = new Map(inserted.map((b) => [b.sequence_order, b]));
      const allocations: NewAllocationRow[] = [];
      for (const rule of data.rules) {
        for (let m = rule.startBlock; m <= rule.endBlock; m++) {
          const b = blockBySeq.get(m);
          if (!b) continue;
          allocations.push({
            block_id: b.id,
            week_number: 1,
            session_type: rule.sessionType,
            event_type_id: rule.eventTypeId,
            quantity_assigned: rule.quantityPerBlock,
            quantity_booked: 0,
            valid_until: null,
          });
        }
      }
      if (allocations.length > 0) await store.insertAllocations(allocations);
      const nextBilling = new Date(today);
      nextBilling.setDate(today.getDate() + BLOCK_DAYS);
      // path_start_date è l'ancora di repair_blocks_alignment ed
      // ensure_client_block_state: oggi, cioè l'inizio del blocco 1.
      await store.updateProfile(userId, {
        path_type: data.pathType,
        auto_renew: data.autoRenew,
        auto_renew_blocks: data.autoRenew,
        pack_label: data.packLabel,
        path_start_date: isoDay(today),
        next_billing_date: data.pathType === "recurring" ? isoDay(nextBilling) : null,
      });
    }
    return { ok: true, userId, email, assignError: null };
  } catch (e) {
    return {
      ok: true,
      userId,
      email,
      assignError: e instanceof Error ? e.message : String(e),
    };
  }
}
