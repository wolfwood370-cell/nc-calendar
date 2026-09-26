// ----------------------------------------------------------------------------
// Stato del Calendario nell'URL (audit T4, passata 04)
// ----------------------------------------------------------------------------
// date=YYYY-MM-DD (un giorno qualsiasi del periodo), view=day|week
// (predefinita week), filter=assign|personal, types=<id>,<id>, avail=1,
// event=<id>; new=sessione e client=<id> aprono la creazione e poi si tolgono.
// Un valore malformato si scarta in silenzio (search-params.ts).
// «Da assegnare» e «Personali» sono un solo valore: non possono stare insieme.
// ----------------------------------------------------------------------------

import { addDays, format, parseISO, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { isoDateParam, uuidParam } from "@/lib/search-params";

export type CalendarView = "day" | "week";
export type CalendarFilter = "all" | "assign" | "personal";

export interface CalendarSearch {
  date?: string;
  view?: "day";
  filter?: "assign" | "personal";
  /** Id delle tipologie, separati da virgola. */
  types?: string;
  avail?: 1;
  event?: string;
  new?: "sessione";
  client?: string;
}

/** validateSearch della route: tiene solo i valori validi. */
export function parseCalendarSearch(search: Record<string, unknown>): CalendarSearch {
  const typeIds = typeof search.types === "string" ? search.types.split(",") : [];
  const types = typeIds.map((t) => uuidParam(t.trim())).filter((t): t is string => !!t);
  return {
    date: isoDateParam(search.date),
    view: search.view === "day" ? "day" : undefined,
    filter: search.filter === "assign" || search.filter === "personal" ? search.filter : undefined,
    types: types.length ? types.join(",") : undefined,
    avail: search.avail === 1 || search.avail === "1" ? 1 : undefined,
    event: uuidParam(search.event),
    new: search.new === "sessione" ? "sessione" : undefined,
    client: uuidParam(search.client),
  };
}

/** Lo stato letto dall'URL, con i valori predefiniti. */
export interface CalendarState {
  /** Giorno di riferimento del periodo (mezzanotte locale). */
  anchor: Date;
  view: CalendarView;
  filter: CalendarFilter;
  types: string[];
  avail: boolean;
  event: string | null;
}

export function calendarState(
  s: CalendarSearch,
  today: Date,
  /** Giorno della sessione in `event`, se si conosce: senza `date` il periodo è il suo. */
  eventDay?: string | null,
): CalendarState {
  const day = s.date ?? eventDay ?? null;
  return {
    anchor: day ? parseISO(day) : startOfDay(today),
    view: s.view ?? "week",
    filter: s.filter ?? "all",
    types: s.types ? s.types.split(",") : [],
    avail: s.avail === 1,
    event: s.event ?? null,
  };
}

/** Parametri da scrivere nell'URL per uno stato (i valori predefiniti non si scrivono). */
export function calendarSearchOf(
  st: Pick<CalendarState, "anchor" | "view" | "filter" | "types" | "avail" | "event">,
): CalendarSearch {
  return {
    date: format(st.anchor, "yyyy-MM-dd"),
    view: st.view === "day" ? "day" : undefined,
    filter: st.filter === "all" ? undefined : st.filter,
    types: st.types.length ? st.types.join(",") : undefined,
    avail: st.avail ? 1 : undefined,
    event: st.event ?? undefined,
  };
}

/** Lunedì della settimana di `d`. */
export function mondayOf(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  return addDays(x, dow === 0 ? -6 : 1 - dow);
}

/** Giorni del periodo mostrato: 7 dal lunedì, oppure il giorno solo. */
export function periodDays(anchor: Date, view: CalendarView): Date[] {
  if (view === "day") return [startOfDay(anchor)];
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Frecce ← →: una settimana o un giorno. */
export function shiftAnchor(anchor: Date, view: CalendarView, dir: 1 | -1): Date {
  return addDays(startOfDay(anchor), dir * (view === "week" ? 7 : 1));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «21 – 27 settembre 2026», «28 set – 4 ott 2026», «Venerdì 25 settembre 2026». */
export function periodLabel(days: readonly Date[], view: CalendarView): string {
  const first = days[0]!;
  if (view === "day") return capitalize(format(first, "EEEE d MMMM yyyy", { locale: it }));
  const last = days[days.length - 1]!;
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${format(last, "d MMMM yyyy", { locale: it })}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${format(first, "d MMM", { locale: it })} – ${format(last, "d MMM yyyy", { locale: it })}`;
  }
  return `${format(first, "d MMM yyyy", { locale: it })} – ${format(last, "d MMM yyyy", { locale: it })}`;
}

// ----------------------------------------------------------------------------
// Filtri (audit C2)
// ----------------------------------------------------------------------------

export interface FilterState {
  /** Solo gli eventi da assegnare. */
  assign: boolean;
  /** Solo gli impegni personali. */
  personal: boolean;
  types: string[];
}

export function filterStateOf(filter: CalendarFilter, types: readonly string[]): FilterState {
  return { assign: filter === "assign", personal: filter === "personal", types: [...types] };
}

export function filterOf(f: FilterState): CalendarFilter {
  return f.assign ? "assign" : f.personal ? "personal" : "all";
}

/**
 * Il segmentato «Tutti | Da assegnare | Personali»: una scelta esclude le
 * altre; «Da assegnare» e «Personali» tolgono anche le tipologie scelte.
 */
export function pickFilter(prev: FilterState, next: CalendarFilter): FilterState {
  if (next === "assign") return { assign: true, personal: false, types: [] };
  if (next === "personal") return { assign: false, personal: true, types: [] };
  return { assign: false, personal: false, types: prev.types };
}

/** Chip di una tipologia: la accende o la spegne, e riporta il filtro su «Tutti». */
export function toggleType(prev: FilterState, typeId: string): FilterState {
  const types = prev.types.includes(typeId)
    ? prev.types.filter((t) => t !== typeId)
    : [...prev.types, typeId];
  return { assign: false, personal: false, types };
}

/** C'è qualcosa che nasconde eventi. */
export function filtersActive(f: FilterState): boolean {
  return f.assign || f.personal || f.types.length > 0;
}

/** Dopo aver aperto la creazione, `new` e `client` si tolgono dall'URL. */
export function withoutCreateParams<T extends CalendarSearch>(s: T): T {
  return { ...s, new: undefined, client: undefined };
}
