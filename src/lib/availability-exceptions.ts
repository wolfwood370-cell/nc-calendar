// ----------------------------------------------------------------------------
// Eccezioni della Disponibilità su un periodo (passata 08, D6)
// ----------------------------------------------------------------------------
// Nel database un'eccezione resta una riga per giorno (availability_exceptions
// ha una sola colonna `date`): la leggono così Prenota, le due
// riprogrammazioni e il Calendario (booking-slots.ts, reschedule-slots.ts,
// calendar-time.ts), che non cambiano. Un periodo «Dal … Al …» diventa una
// riga per giorno con gli stessi orari e lo stesso motivo; la pagina rimette
// insieme le righe in periodi.
//   - Date come date di calendario «YYYY-MM-DD», con l'aritmetica dei giorni
//     e non dei millisecondi: il 25/10/2026 in Italia dura 25 ore.
//   - Un gruppo è la serie più lunga di giorni consecutivi con gli stessi
//     orari e lo stesso motivo; i doppioni dello stesso giorno ci stanno
//     dentro e si tolgono insieme.
//   - Sessioni già prenotate in un periodo: sessioni cliente programmate, non
//     ancora cominciate, nel giorno locale e, per una fascia, che la incrociano.
// ----------------------------------------------------------------------------

import { hm, toMinutes } from "@/lib/availability-week";
import type { AvailabilityExceptionRow } from "@/lib/queries";
import { isClientSession, sessionMinutes, type AgendaBooking } from "@/lib/today-agenda";

/** Quello che il modulo «Nuova eccezione» raccoglie. */
export interface ExceptionInput {
  from: string;
  to: string;
  allDay: boolean;
  start: string;
  end: string;
  reason: string;
}

/** Una riga da inserire in availability_exceptions (id solo per «Ripristina»). */
export interface NewExceptionRow {
  id?: string;
  coach_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

export const EXCEPTION_ERRORS = {
  dates: "Scegli le date.",
  past: "La data iniziale è già passata.",
  order: "La data finale è precedente a quella iniziale.",
  tooLong: "Un'eccezione può durare al massimo un anno.",
  hours: "L'ora di fine deve essere successiva a quella di inizio.",
} as const;

/** Un anno sbagliato non scrive migliaia di righe. */
export const MAX_EXCEPTION_DAYS = 366;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Giorno di calendario come istante UTC: nessuna ora legale di mezzo. */
function utcDay(iso: string): number | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return t;
}

function isoOfUtc(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isIsoDate(s: string): boolean {
  return utcDay(s) !== null;
}

/** «2026-10-24» + 1 = «2026-10-25», con l'aritmetica del calendario. */
export function addDaysIso(iso: string, days: number): string {
  const t = utcDay(iso);
  if (t === null) throw new Error(`Data non valida: ${iso}`);
  const d = new Date(t);
  return isoOfUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

/** Giorni da «from» a «to» compresi (0 o meno se «to» viene prima). */
export function dayCount(from: string, to: string): number {
  const a = utcDay(from);
  const b = utcDay(to);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** Tutti i giorni del periodo, compresi gli estremi. */
export function periodDates(from: string, to: string): string[] {
  const n = dayCount(from, to);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDaysIso(from, i));
}

/** Il giorno locale di un istante, «YYYY-MM-DD». */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Validazione e righe
// ---------------------------------------------------------------------------

/** Cosa non va in un'eccezione, a prescindere dal giorno di oggi. */
export function exceptionInputError(input: ExceptionInput): string | null {
  if (!isIsoDate(input.from) || !isIsoDate(input.to)) return EXCEPTION_ERRORS.dates;
  if (input.to < input.from) return EXCEPTION_ERRORS.order;
  if (dayCount(input.from, input.to) > MAX_EXCEPTION_DAYS) return EXCEPTION_ERRORS.tooLong;
  if (!input.allDay && toMinutes(input.end) <= toMinutes(input.start)) {
    return EXCEPTION_ERRORS.hours;
  }
  return null;
}

/** L'errore del modulo desktop: in più, «Dal» non può essere prima di oggi. */
export function exceptionFormError(input: ExceptionInput, today: string): string | null {
  if (!isIsoDate(input.from) || !isIsoDate(input.to)) return EXCEPTION_ERRORS.dates;
  if (input.from < today) return EXCEPTION_ERRORS.past;
  return exceptionInputError(input);
}

/** Una riga per giorno, con gli stessi orari e lo stesso motivo (senza spazi ai lati). */
export function exceptionRows(coachId: string, input: ExceptionInput): NewExceptionRow[] {
  const err = exceptionInputError(input);
  if (err) throw new Error(err);
  const reason = input.reason.trim();
  return periodDates(input.from, input.to).map((date) => ({
    coach_id: coachId,
    date,
    start_time: input.allDay ? null : `${input.start}:00`,
    end_time: input.allDay ? null : `${input.end}:00`,
    reason,
  }));
}

/** Valori iniziali del modulo: da oggi + 7 allo stesso giorno, tutto il giorno, 09:00-13:00. */
export function newExceptionInput(today: string): ExceptionInput {
  const day = addDaysIso(today, 7);
  return { from: day, to: day, allDay: true, start: "09:00", end: "13:00", reason: "" };
}

/** Spostare «Dal» dopo «Al» sposta anche «Al». */
export function withFrom(input: ExceptionInput, from: string): ExceptionInput {
  return { ...input, from, to: from > input.to ? from : input.to };
}

// ---------------------------------------------------------------------------
// Periodi
// ---------------------------------------------------------------------------

export interface ExceptionGroup {
  from: string;
  to: string;
  allDay: boolean;
  /** «HH:MM», null se tutto il giorno. */
  start: string | null;
  end: string | null;
  reason: string;
  /** Tutte le righe del periodo, doppioni compresi. */
  rows: AvailabilityExceptionRow[];
}

type ExRow = Pick<AvailabilityExceptionRow, "date" | "start_time" | "end_time" | "reason">;

/** Tutto il giorno se manca un orario, come booking-slots.ts e calendar-time.ts. */
function isAllDay(r: ExRow): boolean {
  return !r.start_time || !r.end_time;
}

function signature(r: ExRow): string {
  const hours = isAllDay(r) ? "" : `${hm(r.start_time!)}-${hm(r.end_time!)}`;
  return `${hours}|${(r.reason ?? "").trim()}`;
}

/** Le righe raggruppate in periodi, in ordine di data e di ora. */
export function groupExceptions(rows: readonly AvailabilityExceptionRow[]): ExceptionGroup[] {
  const sorted = [...rows].sort(
    (a, b) => signature(a).localeCompare(signature(b)) || a.date.localeCompare(b.date),
  );
  const groups: ExceptionGroup[] = [];
  let cur: ExceptionGroup | null = null;
  let curSig = "";
  for (const r of sorted) {
    const sig = signature(r);
    const continues =
      cur !== null && sig === curSig && (r.date === cur.to || r.date === addDaysIso(cur.to, 1));
    if (cur && continues) {
      cur.to = r.date;
      cur.rows.push(r);
      continue;
    }
    const allDay = isAllDay(r);
    cur = {
      from: r.date,
      to: r.date,
      allDay,
      start: allDay ? null : hm(r.start_time!),
      end: allDay ? null : hm(r.end_time!),
      reason: (r.reason ?? "").trim(),
      rows: [r],
    };
    curSig = sig;
    groups.push(cur);
  }
  return groups.sort(
    (a, b) =>
      a.from.localeCompare(b.from) ||
      (a.start ?? "").localeCompare(b.start ?? "") ||
      a.to.localeCompare(b.to) ||
      a.reason.localeCompare(b.reason),
  );
}

/** I periodi che finiscono oggi o dopo, anche quelli cominciati prima. */
export function upcomingGroups(groups: readonly ExceptionGroup[], today: string): ExceptionGroup[] {
  return groups.filter((g) => g.to >= today);
}

const MONTHS = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];
const WEEKDAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

function dateParts(iso: string) {
  const t = utcDay(iso);
  if (t === null) throw new Error(`Data non valida: ${iso}`);
  const d = new Date(t);
  return {
    y: d.getUTCFullYear(),
    month: MONTHS[d.getUTCMonth()]!,
    m: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: WEEKDAYS[d.getUTCDay()]!,
  };
}

/**
 * «Giovedì 8 ottobre», «8 – 10 ottobre», «30 ottobre – 2 novembre». L'anno
 * solo se il periodo non sta tutto nell'anno in corso: una volta in fondo se
 * le due date sono dello stesso anno, su tutte e due se no.
 */
export function periodLabel(from: string, to: string, currentYear: number): string {
  const a = dateParts(from);
  const b = dateParts(to);
  if (from === to) {
    return `${a.weekday} ${a.day} ${a.month}${a.y === currentYear ? "" : ` ${a.y}`}`;
  }
  if (a.y !== b.y) return `${a.day} ${a.month} ${a.y} – ${b.day} ${b.month} ${b.y}`;
  const year = a.y === currentYear ? "" : ` ${a.y}`;
  if (a.m === b.m) return `${a.day} – ${b.day} ${b.month}${year}`;
  return `${a.day} ${a.month} – ${b.day} ${b.month}${year}`;
}

/** «Tutto il giorno · Ferie», «14:00–18:00 · Corso»; senza motivo solo la prima parte. */
export function groupDetail(
  g: Pick<ExceptionGroup, "allDay" | "start" | "end" | "reason">,
): string {
  const hours = g.allDay ? "Tutto il giorno" : `${g.start}–${g.end}`;
  return g.reason ? `${hours} · ${g.reason}` : hours;
}

export function removeExceptionLabel(label: string): string {
  return `Rimuovi l'eccezione: ${label}`;
}

// ---------------------------------------------------------------------------
// Sessioni già prenotate nel periodo
// ---------------------------------------------------------------------------

export interface PeriodWindow {
  from: string;
  to: string;
  allDay: boolean;
  start: string | null;
  end: string | null;
}

/**
 * Le sessioni cliente programmate, non eliminate e non ancora cominciate che
 * cadono nel periodo (giorno locale) e, per una fascia, la incrociano:
 * [inizio, inizio + durata) contro [dalle, alle). In ordine di orario.
 */
export function bookedInPeriod<B extends AgendaBooking>(
  bookings: readonly B[],
  period: PeriodWindow,
  now: Date,
): B[] {
  const out: B[] = [];
  for (const b of bookings) {
    if (b.status !== "scheduled" || b.deleted_at || !isClientSession(b)) continue;
    const start = new Date(b.scheduled_at);
    if (!(start.getTime() > now.getTime())) continue;
    const day = localIsoDate(start);
    if (day < period.from || day > period.to) continue;
    if (!period.allDay) {
      const s = toMinutes(period.start ?? "00:00");
      const e = toMinutes(period.end ?? "00:00");
      const bandStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, s);
      const bandEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, e);
      const end = start.getTime() + sessionMinutes(b) * 60_000;
      if (!(start.getTime() < bandEnd.getTime() && end > bandStart.getTime())) continue;
    }
    out.push(b);
  }
  return out.sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );
}

/** Avviso della riga dell'elenco. */
export function clashText(n: number): string {
  return n === 1
    ? "1 sessione già prenotata in questo periodo: spostala"
    : `${n} sessioni già prenotate in questo periodo: spostale`;
}

/** Avviso del modulo prima di aggiungere. */
export function formClashText(n: number): string {
  const count = n === 1 ? "1 sessione già prenotata" : `${n} sessioni già prenotate`;
  return `Attenzione: ${count} in questo periodo. Resteranno in calendario finché non le sposti.`;
}

export const BOOKINGS_UNREADABLE = "Non riesco a leggere le sessioni già prenotate.";
