// ----------------------------------------------------------------------------
// Orario settimanale e anteprima della Disponibilità (passata 08, D2-D4)
// ----------------------------------------------------------------------------
// Regole pure della pagina desktop: la bozza della settimana nasce dalle
// righe di trainer_availability (una riga per fascia, day_of_week 1 = lunedì
// … 7 = domenica, come booking-slots.ts), si modifica con le funzioni qui
// sotto e torna righe da salvare. Gli orari sono stringhe «HH:MM»: a due
// cifre, si confrontano come testo.
//   - Errori per giorno coi tre testi del brief. Due fasce che si toccano
//     (10:00-12:00 e 12:00-14:00) non si sovrappongono: il database vuole
//     solo la fine dopo l'inizio (trainer_availability_check).
//   - «+ Fascia» e l'interruttore come il prototipo (Coach Disponibilita.dc.html).
//   - «Copia su…» accende i giorni scelti e ne sostituisce le fasce.
//   - Anteprima: ore della bozza e sessioni della tipologia principale, con
//     la sua durata e il suo margine (il margine globale di trainer_settings
//     non entra in nessun calcolo degli slot).
// ----------------------------------------------------------------------------

import { sameName, sortTypesByName } from "@/lib/event-type-rules";
import type { AvailabilityRow, EventTypeRow } from "@/lib/queries";

export type Dow = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TimeRange {
  start: string;
  end: string;
}

export interface DayDraft {
  active: boolean;
  ranges: TimeRange[];
}

export type WeekDraft = Record<Dow, DayDraft>;

/** Una fascia da salvare: giorno e orari «HH:MM». */
export interface WeekSlot {
  day_of_week: Dow;
  start: string;
  end: string;
}

export const WEEK_DAYS: readonly { dow: Dow; label: string; short: string }[] = [
  { dow: 1, label: "Lunedì", short: "Lun" },
  { dow: 2, label: "Martedì", short: "Mar" },
  { dow: 3, label: "Mercoledì", short: "Mer" },
  { dow: 4, label: "Giovedì", short: "Gio" },
  { dow: 5, label: "Venerdì", short: "Ven" },
  { dow: 6, label: "Sabato", short: "Sab" },
  { dow: 7, label: "Domenica", short: "Dom" },
];

export const DAY_ERRORS = {
  empty: "Aggiungi almeno una fascia o disattiva il giorno.",
  order: "L'ora di fine deve essere successiva a quella di inizio.",
  overlap: "Le fasce orarie si sovrappongono.",
} as const;

/** Fascia che l'interruttore mette su un giorno senza fasce. */
export const TOGGLE_RANGE: TimeRange = { start: "09:00", end: "13:00" };
/** Prima fascia di «+ Fascia» su un giorno senza fasce. */
export const FIRST_ADDED_RANGE: TimeRange = { start: "09:00", end: "12:00" };

const OPTIONS_FROM = 6 * 60;
const OPTIONS_TO = 22 * 60;
const LATEST_ADDED_START = 21 * 60;

export function isDow(n: number): n is Dow {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}

/** «09:00:00» → «09:00». */
export function hm(t: string): string {
  return t.slice(0, 5);
}

export function toMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

export function fromMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Orari delle select: dalle 06:00 alle 22:00 ogni 30 minuti. */
export const TIME_OPTIONS: readonly string[] = Array.from(
  { length: (OPTIONS_TO - OPTIONS_FROM) / 30 + 1 },
  (_, i) => fromMinutes(OPTIONS_FROM + i * 30),
);

/**
 * Le opzioni di una select: quelle standard più il valore attuale se è fuori
 * (un orario salvato alle 05:30 resta selezionato, non si perde).
 */
export function timeOptionsWith(current: string): string[] {
  if (!current || TIME_OPTIONS.includes(current)) return [...TIME_OPTIONS];
  return [...TIME_OPTIONS, current].sort();
}

export function emptyWeek(): WeekDraft {
  return {
    1: { active: false, ranges: [] },
    2: { active: false, ranges: [] },
    3: { active: false, ranges: [] },
    4: { active: false, ranges: [] },
    5: { active: false, ranges: [] },
    6: { active: false, ranges: [] },
    7: { active: false, ranges: [] },
  };
}

function byStart(a: TimeRange, b: TimeRange): number {
  return a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
}

/** La settimana salvata: un giorno è acceso se ha almeno una riga. */
export function weekFromRows(
  rows: readonly Pick<AvailabilityRow, "day_of_week" | "start_time" | "end_time">[],
): WeekDraft {
  const w = emptyWeek();
  for (const r of rows) {
    if (!isDow(r.day_of_week)) continue;
    const day = w[r.day_of_week];
    day.active = true;
    day.ranges.push({ start: hm(r.start_time), end: hm(r.end_time) });
  }
  for (const d of WEEK_DAYS) w[d.dow].ranges.sort(byStart);
  return w;
}

/** Le fasce da salvare: solo i giorni accesi. */
export function weekSlots(week: WeekDraft): WeekSlot[] {
  const out: WeekSlot[] = [];
  for (const d of WEEK_DAYS) {
    const day = week[d.dow];
    if (!day.active) continue;
    for (const r of [...day.ranges].sort(byStart)) {
      out.push({ day_of_week: d.dow, start: r.start, end: r.end });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Errori
// ---------------------------------------------------------------------------

export function dayError(day: DayDraft): string | null {
  if (!day.active) return null;
  if (day.ranges.length === 0) return DAY_ERRORS.empty;
  if (day.ranges.some((r) => toMinutes(r.end) <= toMinutes(r.start))) return DAY_ERRORS.order;
  const sorted = [...day.ranges].sort(byStart);
  for (let i = 1; i < sorted.length; i++) {
    if (toMinutes(sorted[i]!.start) < toMinutes(sorted[i - 1]!.end)) return DAY_ERRORS.overlap;
  }
  return null;
}

export function weekErrors(week: WeekDraft): Partial<Record<Dow, string>> {
  const out: Partial<Record<Dow, string>> = {};
  for (const d of WEEK_DAYS) {
    const e = dayError(week[d.dow]);
    if (e) out[d.dow] = e;
  }
  return out;
}

export function hasErrors(week: WeekDraft): boolean {
  return Object.keys(weekErrors(week)).length > 0;
}

// ---------------------------------------------------------------------------
// Modifiche della bozza (ognuna restituisce una settimana nuova)
// ---------------------------------------------------------------------------

function withDay(week: WeekDraft, dow: Dow, day: DayDraft): WeekDraft {
  return { ...week, [dow]: day };
}

/** Accendere un giorno senza fasce dà 09:00-13:00; spegnerlo tiene le fasce. */
export function toggleDay(week: WeekDraft, dow: Dow, active: boolean): WeekDraft {
  const day = week[dow];
  const ranges = active && day.ranges.length === 0 ? [{ ...TOGGLE_RANGE }] : day.ranges;
  return withDay(week, dow, { active, ranges });
}

/**
 * «+ Fascia»: parte un'ora dopo la fine dell'ultima (al massimo alle 21:00)
 * e dura tre ore (al massimo fino alle 22:00); su un giorno senza fasce
 * 09:00-12:00.
 */
export function addRange(week: WeekDraft, dow: Dow): WeekDraft {
  const day = week[dow];
  const last = day.ranges[day.ranges.length - 1];
  let next: TimeRange;
  if (!last) {
    next = { ...FIRST_ADDED_RANGE };
  } else {
    const start = Math.min(LATEST_ADDED_START, toMinutes(last.end) + 60);
    next = { start: fromMinutes(start), end: fromMinutes(Math.min(OPTIONS_TO, start + 180)) };
  }
  return withDay(week, dow, { active: true, ranges: [...day.ranges, next] });
}

export function updateRange(
  week: WeekDraft,
  dow: Dow,
  index: number,
  field: keyof TimeRange,
  value: string,
): WeekDraft {
  const day = week[dow];
  const ranges = day.ranges.map((r, i) => (i === index ? { ...r, [field]: value } : r));
  return withDay(week, dow, { ...day, ranges });
}

/** Togliere l'ultima fascia spegne il giorno. */
export function removeRange(week: WeekDraft, dow: Dow, index: number): WeekDraft {
  const day = week[dow];
  const ranges = day.ranges.filter((_, i) => i !== index);
  return withDay(week, dow, { active: ranges.length > 0, ranges });
}

/** «Copia su…»: accende i giorni scelti e ne sostituisce le fasce con quelle della sorgente. */
export function copyDay(week: WeekDraft, source: Dow, targets: readonly Dow[]): WeekDraft {
  const ranges = week[source].ranges;
  const next = { ...week };
  for (const t of targets) {
    if (t === source) continue;
    next[t] = { active: true, ranges: ranges.map((r) => ({ ...r })) };
  }
  return next;
}

/** «Lun–Ven»: dal lunedì al venerdì tranne la sorgente. */
export function weekdayTargets(source: Dow): Dow[] {
  return ([1, 2, 3, 4, 5] as const).filter((d) => d !== source);
}

// ---------------------------------------------------------------------------
// Modifiche non salvate
// ---------------------------------------------------------------------------

/** Quello che il giorno rende prenotabile: niente se è spento o senza fasce. */
function effective(day: DayDraft): string {
  if (!day.active || day.ranges.length === 0) return "";
  return [...day.ranges]
    .sort(byStart)
    .map((r) => `${r.start}-${r.end}`)
    .join(",");
}

/** I giorni in cui la bozza è diversa da quello che è salvato. */
export function changedDays(saved: WeekDraft, draft: WeekDraft): Dow[] {
  return WEEK_DAYS.map((d) => d.dow).filter((d) => effective(saved[d]) !== effective(draft[d]));
}

/** Testo della barra in basso. */
export function dirtyLabel(changed: number, withErrors: boolean): string {
  if (withErrors) return "Correggi gli orari evidenziati per salvare";
  return changed === 1 ? "1 giorno modificato" : `${changed} giorni modificati`;
}

// ---------------------------------------------------------------------------
// Anteprima (D2)
// ---------------------------------------------------------------------------

/** Le fasce valide dei giorni accesi, in minuti. */
function validMinutes(day: DayDraft): number[] {
  if (!day.active) return [];
  return day.ranges.map((r) => toMinutes(r.end) - toMinutes(r.start)).filter((m) => m > 0);
}

/** Ore della bozza per giorno, da lunedì a domenica. */
export function hoursPerDay(week: WeekDraft): { dow: Dow; short: string; hours: number }[] {
  return WEEK_DAYS.map((d) => ({
    dow: d.dow,
    short: d.short,
    hours: validMinutes(week[d.dow]).reduce((s, m) => s + m, 0) / 60,
  }));
}

export function weekHours(week: WeekDraft): number {
  return hoursPerDay(week).reduce((s, d) => s + d.hours, 0);
}

/** Un decimale e la virgola: «55,5», «70». */
export function formatHours(hours: number): string {
  return String(Math.round(hours * 10) / 10).replace(".", ",");
}

export const MAIN_TYPE_NAME = "Sessione PT";

/**
 * La tipologia dell'anteprima: quella chiamata «Sessione PT»; se manca, la
 * prima prenotabile dai clienti in ordine di nome; altrimenti nessuna.
 */
export function previewType<T extends Pick<EventTypeRow, "name" | "client_bookable">>(
  types: readonly T[],
): T | null {
  const sorted = sortTypesByName(types);
  return (
    sorted.find((t) => sameName(t.name, MAIN_TYPE_NAME)) ??
    sorted.find((t) => t.client_bookable) ??
    null
  );
}

/** Sessioni che entrano, fascia per fascia: floor(minuti / (durata + margine)). */
export function sessionsFit(
  week: WeekDraft,
  type: Pick<EventTypeRow, "duration" | "buffer_minutes">,
): number {
  const step = type.duration + Math.max(0, type.buffer_minutes);
  if (!(step > 0)) return 0;
  let n = 0;
  for (const d of WEEK_DAYS) {
    for (const m of validMinutes(week[d.dow])) n += Math.floor(m / step);
  }
  return n;
}

export function estimateText(
  sessions: number,
  type: Pick<EventTypeRow, "name" | "duration" | "buffer_minutes">,
): string {
  if (sessions === 0) {
    return `Con questi orari non entra nessuna sessione della tipologia «${type.name}».`;
  }
  const size =
    type.buffer_minutes > 0
      ? `${type.duration} min + ${type.buffer_minutes} min di margine`
      : `${type.duration} min, senza margine`;
  const count = sessions === 1 ? "1 sessione" : `${sessions} sessioni`;
  return `Circa ${count} della tipologia «${type.name}» (${size}), prima di contare quelle già prenotate.`;
}

export const ESTIMATE_UNREADABLE =
  "Stima delle sessioni non disponibile: non riesco a leggere le tipologie.";
