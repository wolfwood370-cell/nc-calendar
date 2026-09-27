// ----------------------------------------------------------------------------
// Profilo cliente desktop (passata 06) — regole della pagina
// ----------------------------------------------------------------------------
// Tab nell'URL (tab=panoramica|percorso|sessioni; tab=pacchetto apre il
// dialog Pacchetto sulla panoramica), settimane del percorso «da salvare» e
// protezione all'uscita (K1, K5), interruttore del rinnovo automatico
// (decisione del 26/09), intestazione, riquadro «Pacchetto e percorso»,
// elenchi e filtri delle sessioni (K3), sessioni fuori percorso (K6).
// Le scritture restano negli helper delle passate 02-04 e in profile-session.ts.
// ----------------------------------------------------------------------------

import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { blockForDate } from "@/lib/assign-event";
import { getBlockCredits, type CreditAllocation, type TypeCredits } from "@/lib/credits";
import { findCurrentBlock, resolveCurrentBlock, type BlockDates } from "@/lib/current-block";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import { isValidBlock, type RenewalBlock } from "@/lib/renewal";

// ----------------------------------------------------------------------------
// Tab e URL
// ----------------------------------------------------------------------------

export type ProfileTab = "panoramica" | "percorso" | "sessioni";

export interface ProfileSearch {
  tab?: "percorso" | "sessioni" | "pacchetto";
}

/** validateSearch della route: un valore sconosciuto si scarta. */
export function parseProfileSearch(search: Record<string, unknown>): ProfileSearch {
  const t = search.tab;
  return { tab: t === "percorso" || t === "sessioni" || t === "pacchetto" ? t : undefined };
}

/** Il tab mostrato: tab=pacchetto e i valori mancanti sono la panoramica. */
export function profileTab(s: ProfileSearch): ProfileTab {
  return s.tab === "percorso" || s.tab === "sessioni" ? s.tab : "panoramica";
}

export function opensPackage(s: ProfileSearch): boolean {
  return s.tab === "pacchetto";
}

/** Parametri da scrivere per un tab: la panoramica, predefinita, non si scrive. */
export function profileSearchOf(tab: ProfileTab): ProfileSearch {
  return tab === "panoramica" ? {} : { tab };
}

/**
 * Con modifiche al percorso non salvate, si chiede conferma quando si lascia
 * il Profilo (un'altra pagina, un altro cliente) o il tab Percorso.
 */
export function leavesSchedule(
  current: { pathname: string; search: ProfileSearch },
  next: { pathname: string; search: ProfileSearch },
): boolean {
  if (current.pathname !== next.pathname) return true;
  return profileTab(current.search) !== profileTab(next.search);
}

// ----------------------------------------------------------------------------
// Settimane del percorso (K1, K5)
// ----------------------------------------------------------------------------
// La regola di spostamento è quella di prima (trainer.clients.$id.tsx su
// main, handleWeekDateChange): la data si porta al lunedì, la settimana è
// «spostata» e le successive la seguono di 7 giorni in 7 giorni. Cambiano
// solo il punto di modifica, lo stato «da salvare» e la protezione all'uscita.

export const WEEKS_PER_BLOCK = 4;

export interface WeekRow {
  week_number: number;
  block_number: number;
  /** Lunedì della settimana, YYYY-MM-DD ("" senza data d'inizio). */
  monday_date: string;
  shifted: boolean;
}

function toIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Il lunedì della stessa settimana (mai quello dopo). */
export function mondayOf(d: Date): Date {
  const day = d.getDay();
  return addDays(startOfDay(d), day === 0 ? -6 : 1 - day);
}

/**
 * Le settimane del percorso: quelle salvate in weekly_schedule, le altre
 * contate dalla data d'inizio. `blockCount` blocchi da 4 settimane.
 */
export function buildWeekRows(
  blockCount: number,
  pathStart: string | null,
  saved: ReadonlyArray<Pick<WeekRow, "week_number" | "monday_date" | "shifted">>,
): WeekRow[] {
  const byWeek = new Map(saved.map((r) => [r.week_number, r]));
  const start = pathStart ? parseISO(pathStart) : null;
  return Array.from({ length: blockCount * WEEKS_PER_BLOCK }, (_, i) => {
    const e = byWeek.get(i + 1);
    return {
      week_number: i + 1,
      block_number: Math.floor(i / WEEKS_PER_BLOCK) + 1,
      monday_date: e?.monday_date ?? (start ? toIso(addDays(start, i * 7)) : ""),
      shifted: e?.shifted ?? false,
    };
  });
}

/** Nuova data della settimana `idx`: lei diventa spostata, le successive la seguono. */
export function moveWeek(rows: readonly WeekRow[], idx: number, date: Date): WeekRow[] {
  const target = rows[idx];
  if (!target) return [...rows];
  const monday = mondayOf(date);
  return rows.map((r, i) => {
    if (i < idx) return r;
    if (i === idx) return { ...r, monday_date: toIso(monday), shifted: true };
    return { ...r, monday_date: toIso(addDays(monday, (i - idx) * 7)) };
  });
}

/** Tutte le settimane dalla data d'inizio, nessuna spostata («Ripristina le date standard»). */
export function regenerateWeeks(rows: readonly WeekRow[], start: Date): WeekRow[] {
  return rows.map((r, i) => ({ ...r, monday_date: toIso(addDays(start, i * 7)), shifted: false }));
}

function sameWeek(a: WeekRow | undefined, b: WeekRow | undefined): boolean {
  return !!a && !!b && a.monday_date === b.monday_date && a.shifted === b.shifted;
}

/** Settimane diverse da quelle salvate (numero di settimana). */
export function changedWeeks(rows: readonly WeekRow[], saved: readonly WeekRow[]): number[] {
  const byWeek = new Map(saved.map((r) => [r.week_number, r]));
  const out = rows.filter((r) => !sameWeek(r, byWeek.get(r.week_number))).map((r) => r.week_number);
  for (const s of saved) {
    if (!rows.some((r) => r.week_number === s.week_number)) out.push(s.week_number);
  }
  return out;
}

export function isScheduleDirty(
  rows: readonly WeekRow[],
  saved: readonly WeekRow[],
  pathStart: string | null,
  savedPathStart: string | null,
): boolean {
  return pathStart !== savedPathStart || changedWeeks(rows, saved).length > 0;
}

/** «1 settimana modificata» · «N settimane modificate»; la data d'inizio conta a parte. */
export function dirtyLabel(weeks: number, startChanged = false): string {
  if (weeks === 0 && startChanged) return "Data d'inizio modificata";
  return weeks === 1 ? "1 settimana modificata" : `${weeks} settimane modificate`;
}

export function hasShiftedWeeks(rows: readonly WeekRow[]): boolean {
  return rows.some((r) => r.shifted);
}

/**
 * Dopo un ricaricamento (per esempio un pacchetto cambiato), le settimane
 * che il coach ha modificato e non ancora salvato restano sue; le altre
 * prendono i valori nuovi del server.
 */
export function rebaseWeeks(
  server: readonly WeekRow[],
  saved: readonly WeekRow[],
  current: readonly WeekRow[],
): WeekRow[] {
  const savedBy = new Map(saved.map((r) => [r.week_number, r]));
  const currentBy = new Map(current.map((r) => [r.week_number, r]));
  return server.map((r) => {
    const mine = currentBy.get(r.week_number);
    return mine && !sameWeek(mine, savedBy.get(r.week_number)) ? mine : r;
  });
}

// ----------------------------------------------------------------------------
// Rinnovo automatico (decisione di Nicolò del 26/09)
// ----------------------------------------------------------------------------
// L'interruttore è degli abbonamenti mensili. Un percorso fisso che ha
// ancora il rinnovo acceso (i clienti di prima: la colonna nasce accesa)
// mostra un avviso con «Spegni»: ensure_client_block_state non guarda il tipo
// di percorso e a fine percorso creerebbe un blocco nuovo
// (20260827143325_…sql:1-100). Sui fissi spenti e sui liberi, niente.

export type RenewalControl = { kind: "toggle"; on: boolean } | { kind: "fixed-on" } | null;

export function renewalControl(
  pathType: string | null,
  autoRenewBlocks: boolean | null,
): RenewalControl {
  if (pathType === "recurring") return { kind: "toggle", on: autoRenewBlocks === true };
  if (pathType === "free") return null;
  return autoRenewBlocks === true ? { kind: "fixed-on" } : null;
}

/** Sotto l'interruttore: quando nasce il blocco nuovo, oppure cosa succede senza. */
export function autoRenewHint(on: boolean, lastBlockEnd: string | null): string {
  if (!on) return "Alla scadenza il cliente non potrà prenotare";
  if (!lastBlockEnd) return "Nuovo blocco alla scadenza";
  return `Nuovo blocco il ${format(addDays(parseISO(lastBlockEnd), 1), "d MMM yyyy", { locale: it })}`;
}

// ----------------------------------------------------------------------------
// Intestazione e «Pacchetto e percorso»
// ----------------------------------------------------------------------------

type ProfileBlock = RenewalBlock;

function validBlocks<T extends ProfileBlock>(blocks: readonly T[]): T[] {
  return blocks.filter(isValidBlock).sort((a, b) => a.sequence_order - b.sequence_order);
}

/** «Blocco 3 di 6» per il percorso fisso, «Mese 2» per l'abbonamento; come la lista Clienti. */
export function blockChip(
  pathType: string | null,
  blocks: readonly ProfileBlock[],
  now: Date,
): string | null {
  if (pathType === "free") return null;
  const valid = validBlocks(blocks);
  const ref = resolveCurrentBlock(valid, now);
  if (!ref) return null;
  const n = valid.indexOf(ref) + 1;
  return pathType === "recurring" ? `Mese ${n}` : `Blocco ${n} di ${valid.length}`;
}

/** Pulsante principale dell'intestazione. */
export function packageCta(
  pathType: string | null,
  hasBlocks: boolean,
  expiring: boolean,
): "Assegna pacchetto" | "Rinnova pacchetto" | "Gestisci pacchetto" {
  if (pathType === "free" || !hasBlocks) return "Assegna pacchetto";
  return expiring ? "Rinnova pacchetto" : "Gestisci pacchetto";
}

export type SegmentState = "past" | "current" | "future";

export interface PackageSummary {
  /** «Il blocco in corso termina il 18 ott 2026», «A consumo», … */
  expiryLabel: string;
  /** «Blocco 3 di 6», «Abbonamento · mese 2»; null senza blocchi. */
  blockLabel: string | null;
  /** Un segmento per blocco, solo per il percorso fisso. */
  segments: SegmentState[];
  creditsTitle: string;
  /** Crediti per tipologia del blocco di riferimento (vuoto per i liberi). */
  credits: TypeCredits[];
}

function dayLabel(iso: string): string {
  return format(parseISO(iso.slice(0, 10)), "d MMM yyyy", { locale: it });
}

export function packageSummary(
  pathType: string | null,
  blocks: readonly ProfileBlock[],
  allocations: readonly CreditAllocation[],
  now: Date,
): PackageSummary {
  const valid = validBlocks(blocks);
  const ref = pathType === "free" ? null : resolveCurrentBlock(valid, now);
  if (!ref) {
    return {
      expiryLabel: pathType === "free" ? "A consumo" : "",
      blockLabel: null,
      segments: [],
      creditsTitle: "Crediti extra",
      credits: [],
    };
  }
  const n = valid.indexOf(ref) + 1;
  const current = findCurrentBlock(valid, now);
  const today = toIso(now);
  const started = ref.start_date.slice(0, 10) <= today;
  const recurring = pathType === "recurring";
  const expiryLabel = current
    ? `Il blocco in corso termina il ${dayLabel(current.end_date)}`
    : started
      ? `Il percorso è terminato il ${dayLabel(ref.end_date)}`
      : `Il percorso inizia il ${dayLabel(ref.start_date)}`;
  const segments: SegmentState[] = recurring
    ? []
    : valid.map((b, i) => {
        if (!current) return started ? "past" : "future";
        return i < n - 1 ? "past" : i === n - 1 ? "current" : "future";
      });
  return {
    expiryLabel,
    blockLabel: recurring ? `Abbonamento · mese ${n}` : `Blocco ${n} di ${valid.length}`,
    segments,
    creditsTitle: recurring
      ? "Crediti del mese"
      : current
        ? "Crediti del blocco in corso"
        : `Crediti del blocco ${n}`,
    credits: getBlockCredits(ref.id, allocations),
  };
}

// ----------------------------------------------------------------------------
// Sessioni (K3)
// ----------------------------------------------------------------------------

export type StatusTone = "neutral" | "success" | "danger" | "warning" | "muted";

/** Chip di stato del Profilo. */
export function sessionStatus(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case "completed":
      return { label: "Svolta", tone: "success" };
    case "no_show":
      return { label: "Assente", tone: "danger" };
    case "late_cancelled":
      return { label: "Annullata tardi", tone: "warning" };
    case "cancelled":
      return { label: "Annullata", tone: "muted" };
    default:
      return { label: "Programmata", tone: "neutral" };
  }
}

export type SessionFilter = "all" | "scheduled" | "completed" | "no_show" | "cancelled";

export const SESSION_FILTERS: ReadonlyArray<{ value: SessionFilter; label: string }> = [
  { value: "all", label: "Tutte" },
  { value: "scheduled", label: "Programmate" },
  { value: "completed", label: "Svolte" },
  { value: "no_show", label: "Assenze" },
  { value: "cancelled", label: "Annullate" },
];

/** «Annullate» comprende le annullate tardi. */
export function inSessionFilter(status: string, f: SessionFilter): boolean {
  if (f === "all") return true;
  if (f === "cancelled") return status === "cancelled" || status === "late_cancelled";
  return status === f;
}

export function sessionFilterCounts(
  bookings: ReadonlyArray<{ status: string }>,
): Record<SessionFilter, number> {
  const out = { all: 0, scheduled: 0, completed: 0, no_show: 0, cancelled: 0 };
  for (const f of SESSION_FILTERS) {
    out[f.value] = bookings.filter((b) => inSessionFilter(b.status, f.value)).length;
  }
  return out;
}

const time = (b: { scheduled_at: string }) => new Date(b.scheduled_at).getTime();

/** Prossime sessioni programmate, dalla più vicina. */
export function upcomingSessions<B extends { status: string; scheduled_at: string }>(
  bookings: readonly B[],
  now: Date,
  limit = 3,
): B[] {
  return bookings
    .filter((b) => b.status === "scheduled" && time(b) > now.getTime())
    .sort((a, b) => time(a) - time(b))
    .slice(0, limit);
}

/** Ultime sessioni già iniziate, dalla più recente. */
export function recentSessions<B extends { scheduled_at: string }>(
  bookings: readonly B[],
  now: Date,
  limit = 5,
): B[] {
  return bookings
    .filter((b) => time(b) <= now.getTime())
    .sort((a, b) => time(b) - time(a))
    .slice(0, limit);
}

/** Nome e colore della tipologia di una sessione o di una riga di crediti. */
export function typeInfo(
  eventTypes: ReadonlyArray<{ id: string; name: string; color: string }>,
  eventTypeId: string | null,
  sessionType: SessionType,
): { name: string; color: string } {
  const t = eventTypeId ? eventTypes.find((e) => e.id === eventTypeId) : undefined;
  return { name: t?.name ?? sessionLabel(sessionType), color: t?.color ?? "#c1c7d0" };
}

/** «Lunedì 21 settembre». */
export function longDay(iso: string): string {
  const s = format(new Date(iso), "EEEE d MMMM", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «oggi», «ieri», «4 giorni fa». */
export function daysAgo(iso: string, now: Date): string {
  const d = differenceInCalendarDays(now, new Date(iso));
  if (d <= 0) return "oggi";
  if (d === 1) return "ieri";
  return `${d} giorni fa`;
}

// ----------------------------------------------------------------------------
// Sessioni fuori percorso (K6)
// ----------------------------------------------------------------------------

/**
 * Testo di «Collega»: il credito viene dal blocco che contiene la data della
 * sessione (come «Assegna evento»), quindi il testo dice quale. Senza un
 * blocco per quella data, dagli extra.
 */
export function orphanLinkLabel(
  blocks: ReadonlyArray<BlockDates & { id: string }>,
  scheduledAt: string,
  now: Date,
): string {
  const b = blockForDate(blocks, scheduledAt);
  if (!b) return "Collega ai crediti extra";
  const current = findCurrentBlock(blocks, now);
  if (current && current.id === b.id) return "Collega al blocco in corso";
  return `Collega al blocco ${b.sequence_order}`;
}

/**
 * Evento senza cliente che appartiene a questo cliente, con la regola di
 * prima (loadOrphans su main): nome, e cognome se c'è, nel titolo o nelle
 * note; esclusi quelli che il coach ha già ignorato per lui. In più si
 * lasciano fuori quelli che «Collega» non potrebbe collegare (annullati,
 * impegni personali, già con un blocco), come in «Assegna evento».
 */
export function isClientOrphan(
  e: {
    title: string | null;
    notes: string | null;
    ignored_by_clients: readonly string[] | null;
    status: string;
    is_personal: boolean;
    block_id: string | null;
  },
  fullName: string,
  clientId: string,
): boolean {
  if ((e.ignored_by_clients ?? []).includes(clientId)) return false;
  if (e.is_personal || e.block_id) return false;
  if (e.status === "cancelled" || e.status === "late_cancelled") return false;
  const parts = fullName.trim().split(/\s+/);
  const first = (parts[0] ?? "").toLowerCase();
  const last = parts.slice(1).join(" ").toLowerCase();
  if (!first) return false;
  const hay = `${e.title ?? ""} ${e.notes ?? ""}`.toLowerCase();
  return last ? hay.includes(first) && hay.includes(last) : hay.includes(first);
}
