// ----------------------------------------------------------------------------
// Sessioni, in un file solo (lato cliente, passata 03, audit N1, T1, T5, H9 e
// V13)
// ----------------------------------------------------------------------------
// Tutto quello che la pagina Sessioni mostra, sopra gli helper della 00
// (getClientSessionStatus, canRate, getAttendance, formatLongDay,
// formatTimeRange):
//   - quali sessioni si vedono (isVisibleSession) e in quale scheda: «In
//     programma» le prenotate, da confermare, confermate e in corso, in ordine
//     di inizio; «Passate» tutte le altre, dalla più recente, annullate future
//     comprese. Ogni sessione visibile sta in una scheda sola;
//   - i gruppi: per settimana di calendario da lunedì (le in programma) e per
//     mese locale (le passate);
//   - la riga (sessionRow): tipologia, giorno, orario, chip, colori, voto e
//     nome accessibile;
//   - la presenza (clientAttendance, e il suo testo attendanceSummary):
//     getAttendance sulle stesse sessioni che conta il coach, importate da
//     Google comprese; il Profilo (07) legge la stessa clientAttendance;
//   - l'etichetta della scheda e il testo della card vuota, coi crediti che
//     Prenota mostra (upcomingEmpty, sopra lo stato di useClientBookState).
// Puro: niente hook, niente rete, niente Sentry; l'ora entra come parametro.
// ----------------------------------------------------------------------------

import { differenceInCalendarWeeks, format, startOfWeek } from "date-fns";
import { it } from "date-fns/locale/it";
import { ATTENDANCE_WEEKS, getAttendance, type Attendance } from "@/lib/attendance";
import { typeColor, typeTint, type BookState } from "@/lib/client-book";
import {
  CLIENT_STATUS_TONE,
  canRate,
  getClientSessionStatus,
  type ClientSessionStatusKey,
} from "@/lib/client-session-status";
import { formatCreditsAgreed } from "@/lib/credits";
import { sessionLabel } from "@/lib/mock-data";
import type { BookingRow, EventTypeRow } from "@/lib/queries";
import { formatLongDay, formatTimeRange } from "@/lib/session-time";

// ----------------------------------------------------------------------------
// La scheda
// ----------------------------------------------------------------------------

/** La scheda della pagina, nel parametro `tab` dell'URL. */
export type SessionsTab = "prossime" | "passate";

/** Solo «prossime» e «passate»; tutto il resto è undefined (la pagina apre su «prossime»). */
export function parseSessionsTab(v: unknown): SessionsTab | undefined {
  return v === "prossime" || v === "passate" ? v : undefined;
}

/** «In programma · 8»; «In programma» con le sessioni non ancora lette (null). */
export function upcomingTabLabel(n: number | null): string {
  return n === null ? "In programma" : `In programma · ${n}`;
}

// ----------------------------------------------------------------------------
// Le sessioni e le due schede
// ----------------------------------------------------------------------------

/** I campi della sessione che servono a Sessioni. */
export type SessionBooking = Pick<
  BookingRow,
  | "id"
  | "status"
  | "scheduled_at"
  | "duration_min"
  | "client_confirmed_at"
  | "title"
  | "event_type_id"
  | "session_type"
  | "deleted_at"
  | "category"
>;

/**
 * Si vede: deleted_at vuoto, oppure un'annullata tardi. cancel_booking scrive
 * deleted_at anche su quelle, e il cliente le deve vedere perché il credito
 * l'ha preso. Le altre con deleted_at sono l'«Elimina» del coach (sessioni
 * inserite per errore) e non ricompaiono. Lo stesso filtro della lettura
 * (useClientBookingsForCredits), scritto anche qui perché si provi coi test.
 */
export function isVisibleSession(b: Pick<SessionBooking, "deleted_at" | "status">): boolean {
  return !b.deleted_at || b.status === "late_cancelled";
}

/** Gli stati delle sessioni in programma: non ancora finite, compresa quella in corso. */
const UPCOMING: ReadonlySet<ClientSessionStatusKey> = new Set([
  "booked",
  "toconfirm",
  "confirmed",
  "now",
]);

function startMs(b: Pick<SessionBooking, "scheduled_at">): number {
  return new Date(b.scheduled_at).getTime();
}

function byId(a: Pick<SessionBooking, "id">, b: Pick<SessionBooking, "id">): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Le visibili nelle due schede. `upcoming`: prenotate, da confermare,
 * confermate e in corso (la regola di upcomingCount), in ordine di inizio;
 * `past`: tutte le altre, dalla più recente, comprese le annullate future e le
 * svolte registrate prima della fine. A parità di inizio, per id.
 */
export function splitSessions<T extends SessionBooking>(
  bookings: readonly T[],
  now: Date,
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const b of bookings) {
    if (!isVisibleSession(b)) continue;
    if (UPCOMING.has(getClientSessionStatus(b, now).key)) upcoming.push(b);
    else past.push(b);
  }
  upcoming.sort((a, b) => startMs(a) - startMs(b) || byId(a, b));
  past.sort((a, b) => startMs(b) - startMs(a) || byId(a, b));
  return { upcoming, past };
}

// ----------------------------------------------------------------------------
// I gruppi
// ----------------------------------------------------------------------------

export interface SessionGroup<T = SessionBooking> {
  key: string;
  /** «Questa settimana» · «Settimana prossima» · «Dal lunedì 12 ottobre» · «Settembre 2026». */
  label: string;
  items: T[];
}

function pushGrouped<T>(groups: SessionGroup<T>[], key: string, label: string, item: T): void {
  const group = groups.find((g) => g.key === key);
  if (group) group.items.push(item);
  else groups.push({ key, label, items: [item] });
}

/**
 * Le in programma per settimana di calendario, da lunedì: 0 (o meno)
 * «Questa settimana», 1 «Settimana prossima», da 2 «Dal lunedì 12 ottobre».
 * Settimane di calendario e non millisecondi: quella del cambio dell'ora di
 * marzo dura 167 ore. I gruppi nell'ordine delle sessioni.
 */
export function upcomingGroups<T extends Pick<SessionBooking, "scheduled_at">>(
  upcoming: readonly T[],
  now: Date,
): SessionGroup<T>[] {
  const groups: SessionGroup<T>[] = [];
  for (const b of upcoming) {
    const start = new Date(b.scheduled_at);
    const weeks = differenceInCalendarWeeks(start, now, { weekStartsOn: 1 });
    if (weeks <= 0) pushGrouped(groups, "questa", "Questa settimana", b);
    else if (weeks === 1) pushGrouped(groups, "prossima", "Settimana prossima", b);
    else {
      const monday = startOfWeek(start, { weekStartsOn: 1 });
      pushGrouped(
        groups,
        `dal-${format(monday, "yyyy-MM-dd")}`,
        `Dal ${formatLongDay(monday).toLowerCase()}`,
        b,
      );
    }
  }
  return groups;
}

/**
 * Le passate per mese locale dell'inizio, «Settembre 2026». Mai dalla stringa
 * ISO: scheduled_at è in UTC, e l'1 ottobre alle 00:30 di Roma è il 30
 * settembre in UTC.
 */
export function pastGroups<T extends Pick<SessionBooking, "scheduled_at">>(
  past: readonly T[],
): SessionGroup<T>[] {
  const groups: SessionGroup<T>[] = [];
  for (const b of past) {
    const start = new Date(b.scheduled_at);
    const month = format(start, "LLLL yyyy", { locale: it });
    pushGrouped(
      groups,
      format(start, "yyyy-MM"),
      month.charAt(0).toUpperCase() + month.slice(1),
      b,
    );
  }
  return groups;
}

// ----------------------------------------------------------------------------
// La riga
// ----------------------------------------------------------------------------

/** I campi della tipologia che servono alla riga. */
export type SessionEventType = Pick<EventTypeRow, "id" | "name" | "color" | "location_type">;

export interface SessionRowModel {
  id: string;
  /** «mer» */
  dow: string;
  /** «30» */
  day: string;
  /** «10:00–11:00» */
  range: string;
  /** «Sessione PT», «Call di consulenza · online» */
  type: string;
  /** «Da valutare» o l'etichetta dello stato della 00. */
  chip: string;
  /** Classi dei token per il chip. */
  chipTone: { bg: string; fg: string };
  /** Fondo e testo del riquadro della data; null per le annullate (il componente usa i token). */
  tile: { bg: string; fg: string } | null;
  /** «5 su 5»; null senza voto. */
  rating: string | null;
  /** Il nome accessibile del pulsante. */
  ariaLabel: string;
}

const RATING_TONE = { bg: "bg-rating-soft", fg: "text-rating-text" };

// Il contrasto WCAG, con la formula di luminance in event-colors.ts (lì è
// privata). La tinta al 10% (#rrggbb1a, alfa 26/255) è composta sul bianco
// della riga, canale per canale e arrotondata come la dipinge il browser. Il
// dettaglio (passata 04) usa lo stesso contrasto per l'icona della tipologia,
// con la soglia degli elementi grafici.
const MIN_TEXT_CONTRAST = 4.5;
const TINT_ALPHA = 0x1a / 255;

type Rgb = readonly [number, number, number];

function channels(hex: string): Rgb {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** La tinta al 10% dipinta sul bianco. */
function tintOnWhite([r, g, b]: Rgb): Rgb {
  const mix = (v: number) => Math.round(v * TINT_ALPHA + 255 * (1 - TINT_ALPHA));
  return [mix(r), mix(g), mix(b)];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Il contrasto fra il colore della tipologia (typeColor) e la sua tinta al
 * 10% dipinta sul bianco: #D50000 4,55, #7986CB 3,11, #039BE5 2,75, e 6,69
 * senza colore (#005685).
 */
export function tintContrast(color: string | null): number {
  const rgb = channels(typeColor(color));
  const a = luminance(rgb);
  const b = luminance(tintOnWhite(rgb));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Il testo del riquadro della data: il colore della tipologia se sulla sua
 * tinta fa almeno 4,5:1 (il testo del giorno è 12 px), altrimenti il
 * primario. I colori delle tipologie sono quelli di Google Calendar: fra
 * quelli del backup resta solo #D50000 (4,55), e #005685 senza colore (6,69).
 */
export function tileText(color: string | null): string {
  return tintContrast(color) >= MIN_TEXT_CONTRAST ? typeColor(color) : "var(--color-aura-primary)";
}

/**
 * Il nome della sessione: quello della tipologia; senza (o con un id che non
 * c'è fra quelle lette) «Consulenza» per le consulenze, altrimenti
 * sessionLabel. Mai il titolo: è quello dell'evento nel calendario Google del
 * coach, spesso col nome del cliente. Lo usano la riga e il dettaglio (04).
 */
export function sessionName(
  b: Pick<SessionBooking, "category" | "session_type">,
  eventType: Pick<SessionEventType, "name"> | null | undefined,
): string {
  if (eventType) return eventType.name;
  return b.category === "consulenza" ? "Consulenza" : sessionLabel(b.session_type);
}

/**
 * La riga di una sessione. `ratings`: dall'id della sessione al voto; null =
 * valutazioni non lette (in caricamento o in errore), e allora niente «Da
 * valutare» né stelle. Il nome è sessionName.
 */
export function sessionRow(
  b: SessionBooking,
  eventTypes: readonly SessionEventType[],
  ratings: ReadonlyMap<string, number> | null,
  now: Date,
): SessionRowModel {
  const start = new Date(b.scheduled_at);
  const eventType = b.event_type_id ? eventTypes.find((t) => t.id === b.event_type_id) : undefined;
  const name = sessionName(b, eventType);
  const online = eventType?.location_type === "online";
  const range = formatTimeRange(start, b.duration_min);

  const status = getClientSessionStatus(b, now);
  const toRate = ratings !== null && canRate(b, now) && !ratings.has(b.id);
  const vote = ratings?.get(b.id);
  const rating = vote === undefined ? null : `${vote} su 5`;
  const cancelled = status.key === "cancelled" || status.key === "late";
  const color = eventType?.color ?? null;

  const aria = [formatLongDay(start), range, name];
  if (online) aria.push("online");
  aria.push(toRate ? "da valutare" : status.label.toLowerCase());
  if (rating) aria.push(`valutata ${rating}`);

  return {
    id: b.id,
    dow: format(start, "EEE", { locale: it }),
    day: format(start, "d"),
    range,
    type: online ? `${name} · online` : name,
    chip: toRate ? "Da valutare" : status.label,
    chipTone: toRate ? RATING_TONE : CLIENT_STATUS_TONE[status.key],
    tile: cancelled ? null : { bg: typeTint(color), fg: tileText(color) },
    rating,
    ariaLabel: aria.join(", "),
  };
}

/** Le valutazioni del cliente come le vuole sessionRow; null finché non ci sono. */
export function ratingsById(
  feedback: readonly { booking_id: string; rating: number }[] | undefined,
): ReadonlyMap<string, number> | null {
  return feedback ? new Map(feedback.map((f) => [f.booking_id, f.rating])) : null;
}

// ----------------------------------------------------------------------------
// La presenza
// ----------------------------------------------------------------------------

/**
 * La presenza del cliente: getAttendance sulle sessioni con deleted_at vuoto,
 * importate da Google comprese, le stesse del Profilo del coach e della lista
 * Clienti (il cliente ha un coach solo). L'annullata tardi di cancel_booking,
 * che ha deleted_at, si vede nell'elenco ma qui non conta, come per il coach.
 * La leggono Sessioni (attendanceSummary) e il Profilo del cliente (passata
 * 07): il filtro sta in un posto solo, così le due pagine dicono lo stesso
 * numero. null senza sessioni concluse nel periodo.
 */
export function clientAttendance(
  bookings: readonly Pick<SessionBooking, "status" | "scheduled_at" | "deleted_at">[],
  now: Date,
): Attendance | null {
  return getAttendance(
    bookings.filter((b) => !b.deleted_at),
    now,
  );
}

/**
 * «Presenza 75% nelle ultime 8 settimane» · «6 sessioni svolte · 1 assenza ·
 * 1 annullata tardi» (le annullate tardi solo se ce ne sono); null senza
 * sessioni concluse nel periodo (clientAttendance). Le annullate tardi stanno
 * al denominatore di getAttendance: senza dirle, i numeri sotto la percentuale
 * non tornano.
 */
export function attendanceSummary(
  bookings: readonly Pick<SessionBooking, "status" | "scheduled_at" | "deleted_at">[],
  now: Date,
): { title: string; sub: string } | null {
  const att = clientAttendance(bookings, now);
  if (!att) return null;
  const parts = [
    att.completed === 1 ? "1 sessione svolta" : `${att.completed} sessioni svolte`,
    att.noShow === 1 ? "1 assenza" : `${att.noShow} assenze`,
  ];
  if (att.lateCancelled > 0) {
    parts.push(
      att.lateCancelled === 1 ? "1 annullata tardi" : `${att.lateCancelled} annullate tardi`,
    );
  }
  return {
    title: `Presenza ${att.percent}% nelle ultime ${ATTENDANCE_WEEKS} settimane`,
    sub: parts.join(" · "),
  };
}

// ----------------------------------------------------------------------------
// La card vuota di «In programma»
// ----------------------------------------------------------------------------

/**
 * Il testo sotto «Nessuna sessione in programma» e se c'è «Prenota una
 * sessione». Con lo stato dei crediti (useClientBookState): N = 0 se Prenota
 * non si apre (blocked), altrimenti la somma dei crediti delle tipologie che
 * si prenotano; N > 0 → «Hai 6 crediti disponibili: scegli giorno e orario.»
 * col pulsante, N = 0 → «Non hai crediti da prenotare in questo momento.»
 * senza. Senza stato: niente testo, e il pulsante solo con la lettura fallita
 * (`failed`): mai «Non hai crediti» per una lettura che non è arrivata. Le
 * tipologie col coach non contano: da Prenota quei crediti non si usano.
 */
export function upcomingEmpty(
  state: Pick<BookState, "options" | "blocked"> | null,
  failed: boolean,
): { text: string | null; book: boolean } {
  if (!state) return { text: null, book: failed };
  const n = state.blocked
    ? 0
    : state.options.reduce((sum, o) => (o.state === "prenotabile" ? sum + o.count : sum), 0);
  if (n > 0) {
    return {
      text: `Hai ${formatCreditsAgreed(n, null, ["disponibile", "disponibili"])}: scegli giorno e orario.`,
      book: true,
    };
  }
  return { text: "Non hai crediti da prenotare in questo momento.", book: false };
}
