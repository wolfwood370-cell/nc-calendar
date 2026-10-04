// ----------------------------------------------------------------------------
// La Home, in un file solo (lato cliente, passata 05, audit H1-H7, H9, H10,
// N1, V1, V2, V8, V9, V10)
// ----------------------------------------------------------------------------
// Tutto quello che la Home mostra, sopra gli helper delle passate prima: le
// sessioni della 03 (splitSessions, sessionName), stato, luogo, riquadro e
// azioni del dettaglio della 04 (detailStatus, detailPlace, tileIcon,
// detailPanel), i crediti di Prenota della 02 (le opzioni di getBookState,
// col numero della finestra che ha ancora un giorno prenotabile), il blocco
// della 00 (getClientBlockInfo) e le soglie di booking-rules.ts. La pagina e
// le card non calcolano stati, soglie, date, numeri né testi:
//   - il saluto;
//   - la prossima sessione: quale, quante altre, e la card (chip, giorno,
//     orario, quanto manca in parole, tipo, luogo, azioni, la riga delle 24
//     ore);
//   - nessuna sessione in programma: il primo orario libero fra le tipologie
//     che si prenotano, oppure perché non c'è;
//   - il percorso concluso;
//   - i crediti: intestazione, segmenti del percorso, l'avviso dei crediti da
//     prenotare, una riga per tipologia col numero di Prenota (H1), la barra
//     del blocco della riga e il fondo (Booster o il coach);
//   - la valutazione, i progressi BIA, le sezioni e la chiave della card
//     d'installazione.
// Il coach è un BookCoach (useMyCoach nella pagina, da get_my_coach): senza
// nome i testi dicono «il tuo coach», e senza WhatsApp niente link a vuoto.
// Puro: niente hook, niente rete, niente orologio (il tempo entra come
// parametro, sempre l'ultimo), niente Sentry, niente toast.
// ----------------------------------------------------------------------------

import { addHours, differenceInCalendarDays, format, parseISO, subDays } from "date-fns";
import { it } from "date-fns/locale/it";
import { CLIENT_MIN_NOTICE_HOURS, CLIENT_RESCHEDULE_CUTOFF_HOURS } from "@/lib/booking-rules";
import {
  coachFirstName,
  coachTo,
  typeTint,
  writeOnWhatsApp,
  writeToCoach,
  type BookCoach,
  type BookOption,
  type BookState,
} from "@/lib/client-book";
import { getClientBlockInfo } from "@/lib/client-credits";
import {
  detailPanel,
  detailPlace,
  detailStatus,
  sessionMinutes,
  tileIcon,
  type DetailBooking,
  type DetailEventType,
  type DetailPlace,
  type DetailStatus,
} from "@/lib/client-session-detail";
import { canRate } from "@/lib/client-session-status";
import {
  isVisibleSession,
  sessionName,
  splitSessions,
  type SessionBooking,
} from "@/lib/client-sessions";
import type { ClientSlotDay } from "@/lib/client-slots";
import { blockTiming, toIsoDate } from "@/lib/current-block";
import type { BookingRow } from "@/lib/queries";
import { isValidBlock, type RenewalBlock, type RenewalClient } from "@/lib/renewal";
import {
  formatDayRel,
  formatLongDay,
  formatShortDay,
  formatTimeRange,
  formatUntil,
} from "@/lib/session-time";

/** Quanti giorni prima della fine del blocco compare l'avviso dei crediti da prenotare. */
const WARNING_DAYS = 7;

function startMs(b: Pick<BookingRow, "scheduled_at">): number {
  return new Date(b.scheduled_at).getTime();
}

/** «1 svolta» · «5 svolte». */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** «con il tuo coach» · «con» e il nome. */
function coachWith(coach: BookCoach): string {
  const first = coachFirstName(coach);
  return first ? `con ${first}` : "con il tuo coach";
}

/** «domenica 11 ottobre», da una data YYYY-MM-DD letta come giorno locale. */
function dayText(isoDate: string): string {
  return formatLongDay(parseISO(isoDate.slice(0, 10))).toLowerCase();
}

// ----------------------------------------------------------------------------
// Il saluto
// ----------------------------------------------------------------------------

/** «Ciao» e la prima parola del nome; senza nome, «Ciao». */
export function homeGreeting(fullName: string | null | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? `Ciao ${first}` : "Ciao";
}

// ----------------------------------------------------------------------------
// La prossima sessione
// ----------------------------------------------------------------------------

/**
 * Le in programma di Sessioni (splitSessions: visibili; prenotate, da
 * confermare, confermate e in corso; per inizio): la prima, e quante altre.
 */
export function homeNext<T extends SessionBooking>(
  bookings: readonly T[],
  now: Date,
): { next: T | null; others: number } {
  const { upcoming } = splitSessions(bookings, now);
  return { next: upcoming[0] ?? null, others: Math.max(0, upcoming.length - 1) };
}

/** La riga in fondo alla card (N1); null senza altre sessioni. */
export function othersLabel(others: number): string | null {
  if (others <= 0) return null;
  return others === 1
    ? "Hai un'altra sessione prenotata"
    : `Hai altre ${others} sessioni prenotate`;
}

/** La riga sotto «Dettagli» quando la sessione non si sposta più (V1). */
export interface HomeNote {
  text: string;
  /** «Scrivi a …» verso il WhatsApp del coach; null senza link. */
  link: { label: string; href: string } | null;
}

export interface HomeNextCard {
  /** Il chip: detailStatus della 04 (etichetta e colori). */
  status: DetailStatus;
  /** «Oggi» · «Domani» · «Mercoledì 30 settembre». */
  day: string;
  /** «10:00–11:00». */
  time: string;
  /** «in corso» · «tra 2 giorni» · «tra 30 min»; null sotto il mezzo minuto (niente testo). */
  until: string | null;
  /** «<tipologia> · 60 min». */
  type: string;
  /** detailPlace della 04; null senza tipologia (niente riga). */
  place: DetailPlace | null;
  /** Il riquadro: il nome per l'icona, la tinta al 10% e il colore dell'icona. */
  tile: { name: string; bg: string; fg: string };
  /** «Entra nella videochiamata», il pulsante pieno. */
  join: boolean;
  /** «Conferma presenza», il pulsante pieno. */
  confirm: boolean;
  /** «Sposta» e «Dettagli» affiancati: da 24 ore in su. */
  move: boolean;
  /** Solo quando non si sposta: in corso, o sotto le 24 ore. */
  note: HomeNote | null;
}

/**
 * La card della prossima sessione. Stato, luogo, riquadro e azioni sono
 * quelli del dettaglio (04), così Home e dettaglio dicono lo stesso; il
 * giorno è relativo («Oggi», non «Oggi, lunedì …») e quanto manca è in
 * parole, mai al secondo (H5). Sotto le 24 ore la riga dice perché non si
 * sposta e, col WhatsApp del coach, il link; senza, la frase dice cosa fare.
 */
export function homeNextCard(
  b: DetailBooking,
  eventType: DetailEventType | null | undefined,
  coach: BookCoach,
  now: Date,
): HomeNextCard {
  const start = new Date(b.scheduled_at);
  const started = start.getTime() <= now.getTime();
  const name = sessionName(b, eventType);
  const place = detailPlace(eventType);
  const color = eventType?.color ?? null;
  const panel = detailPanel(b, place?.online ?? false, now);
  const move = panel.manage === "free";

  let note: HomeNote | null = null;
  if (!move) {
    const lead = started
      ? "La sessione è in corso."
      : `Mancano meno di ${CLIENT_RESCHEDULE_CUTOFF_HOURS} ore: non si può più spostare.`;
    note = coach.whatsapp
      ? { text: lead, link: { label: writeToCoach(coach), href: coach.whatsapp } }
      : {
          text: started ? lead : `${lead} Per un altro orario scrivi ${coachTo(coach)}.`,
          link: null,
        };
  }

  return {
    status: detailStatus(b, now),
    day: formatDayRel(start, now),
    time: formatTimeRange(start, b.duration_min),
    until: started ? "in corso" : formatUntil(start, now),
    type: `${name} · ${sessionMinutes(b)} min`,
    place,
    tile: { name, bg: typeTint(color), fg: tileIcon(color) },
    join: panel.join,
    confirm: panel.confirm,
    move,
    note,
  };
}

// ----------------------------------------------------------------------------
// Nessuna sessione in programma
// ----------------------------------------------------------------------------

/** Il primo orario libero: la tipologia (id e nome) e l'orario. */
export interface FirstFree {
  eventTypeId: string | null;
  name: string;
  iso: string;
  /** «09:00». */
  time: string;
}

/**
 * Il primo orario libero fra le tipologie che si prenotano: per ogni voce il
 * primo giorno con orari e il suo primo orario; vince il più presto,
 * confrontato come tempo, e a pari orario la voce che viene prima. Le voci
 * le costruisce la card, una per opzione prenotabile, coi giorni di
 * getClientSlotDays.
 */
export function firstFreeSlot(
  entries: readonly {
    option: Pick<BookOption, "eventTypeId" | "name">;
    days: readonly ClientSlotDay[];
  }[],
): FirstFree | null {
  let best: FirstFree | null = null;
  let bestMs = Infinity;
  for (const { option, days } of entries) {
    const slot = days.find((d) => d.slots.length > 0)?.slots[0];
    if (!slot) continue;
    const ms = new Date(slot.iso).getTime();
    if (ms < bestMs) {
      bestMs = ms;
      best = { eventTypeId: option.eventTypeId, name: option.name, iso: slot.iso, time: slot.time };
    }
  }
  return best;
}

/**
 * Il testo sotto «Nessuna sessione in programma» e «Prenota una sessione»
 * (book), col primo caso che vale: il primo orario libero; gli orari non
 * letti (mai «Nessun orario libero» per una lettura fallita); nessun orario;
 * solo crediti da prenotare col coach; niente crediti.
 */
export function noNextCard(
  options: readonly Pick<BookOption, "state" | "count">[],
  first: FirstFree | null,
  slotsFailed: boolean,
  coach: BookCoach,
): { text: string; book: boolean; eventTypeId: string | null } {
  const bookable = options.some((o) => o.state === "prenotabile");
  if (bookable && first) {
    const day = formatLongDay(new Date(first.iso)).toLowerCase();
    return {
      text: `Primo orario libero: ${day} alle ${first.time}, ${first.name}.`,
      book: true,
      eventTypeId: first.eventTypeId,
    };
  }
  if (bookable && slotsFailed) {
    return {
      text: "Non siamo riusciti a leggere gli orari liberi: li trovi in Prenota.",
      book: true,
      eventTypeId: null,
    };
  }
  if (bookable) {
    return {
      text: `Nessun orario libero nei prossimi giorni: scrivi ${coachTo(coach)} per trovarne uno.`,
      book: false,
      eventTypeId: null,
    };
  }
  if (options.some((o) => o.state === "coach" && o.count > 0)) {
    return {
      text: `Le sessioni che ti restano si prenotano ${coachWith(coach)}.`,
      book: false,
      eventTypeId: null,
    };
  }
  return {
    text: "Non hai crediti da prenotare in questo momento.",
    book: false,
    eventTypeId: null,
  };
}

// ----------------------------------------------------------------------------
// Il percorso concluso
// ----------------------------------------------------------------------------

/** Il testo della card; endDate è la end_date del blocco di riferimento. */
export function concludedText(endDate: string, coach: BookCoach): string {
  return `L'ultimo blocco si è chiuso ${dayText(endDate)}. Per ripartire scrivi ${coachTo(coach)}: ti proporrà il prossimo percorso.`;
}

/** Il pulsante WhatsApp della card; null senza il link, e il pulsante non c'è. */
export function concludedWhatsApp(coach: BookCoach): { label: string; href: string } | null {
  return coach.whatsapp ? { label: writeOnWhatsApp(coach), href: coach.whatsapp } : null;
}

// ----------------------------------------------------------------------------
// I crediti
// ----------------------------------------------------------------------------

export type CreditStep = "done" | "current" | "todo";

export interface CreditsHeader {
  /** «Blocco 3 di 6» · «Blocco 4» · «Cliente libero». */
  chip: string;
  /** Il sottotitolo del blocco della 00; null se non c'è. */
  sub: string | null;
  /** I segmenti del percorso fisso con più blocchi; null altrimenti. */
  steps: { aria: string; steps: CreditStep[] } | null;
}

/**
 * L'intestazione della card, sopra getClientBlockInfo della 00: il chip è
 * il blocco, o il piano; l'abbonamento ha il prefisso «Abbonamento mensile ·
 * » (col sottotitolo in minuscolo); i segmenti solo per il percorso fisso
 * con un numero e più di un blocco valido.
 */
export function creditsHeader(
  client: RenewalClient,
  blocks: readonly RenewalBlock[],
  now: Date,
): CreditsHeader {
  const info = getClientBlockInfo(client, blocks, now);
  const recurring = client.path_type === "recurring";
  const fixed = !recurring && client.path_type !== "free";
  let sub = info.subtitle;
  if (sub !== null && recurring) {
    sub = `${info.plan} · ${sub.charAt(0).toLowerCase()}${sub.slice(1)}`;
  }
  const valid = blocks.filter(isValidBlock);
  const n = info.number;
  const steps =
    fixed && n !== null && valid.length > 1
      ? {
          aria: `Percorso: blocco ${n} di ${valid.length}`,
          steps: valid.map(
            (_, i): CreditStep => (i + 1 < n ? "done" : i + 1 === n ? "current" : "todo"),
          ),
        }
      : null;
  return { chip: info.block ?? info.plan, sub, steps };
}

/**
 * Le parti dell'avviso dei crediti da prenotare, quando tutto insieme: il
 * cliente non è libero, il blocco di riferimento è in corso, alla sua fine
 * mancano al più 7 giorni di calendario, gli resta un giorno prenotabile (la
 * fine non è prima del giorno di oggi + 24 ore) e ha crediti suoi. Gli extra
 * non contano: non scadono col blocco. Nessuna frase sul blocco dopo (V2).
 * Il blocco, quanti crediti suoi restano, l'ultimo giorno (YYYY-MM-DD) e da
 * quando l'avviso vale: 7 giorni di calendario prima della fine, a mezzanotte
 * locale (sottrarre 7 × 24 ore sbaglierebbe l'ora a cavallo del cambio d'ora).
 * Le usa anche la voce «Crediti da usare» delle notifiche (passata 08): la
 * Home e la campanella dicono lo stesso numero.
 */
export function creditsWarningParts(
  client: Pick<RenewalClient, "path_type">,
  state: Pick<BookState, "reference" | "options">,
  now: Date,
): { blockId: string; left: number; end: string; from: Date } | null {
  const ref = state.reference;
  if (client.path_type === "free" || !ref || blockTiming(ref, now) !== "current") return null;
  const end = ref.end_date.slice(0, 10);
  if (differenceInCalendarDays(parseISO(end), now) > WARNING_DAYS) return null;
  if (end < toIsoDate(addHours(now, CLIENT_MIN_NOTICE_HOURS))) return null;
  const left = state.options.reduce((sum, o) => sum + (o.referencePool?.blockAvail ?? 0), 0);
  if (left <= 0) return null;
  return { blockId: ref.id, left, end, from: subDays(parseISO(end), WARNING_DAYS) };
}

/** «3 crediti da prenotare entro domenica 4 ottobre», senza il punto. */
export function creditsWarningText(parts: { left: number; end: string }): string {
  return `${plural(parts.left, "credito", "crediti")} da prenotare entro ${dayText(parts.end)}`;
}

/** «3 crediti da prenotare entro domenica 4 ottobre.»: la frase di creditsWarningParts, o null. */
export function creditsWarning(
  client: Pick<RenewalClient, "path_type">,
  state: Pick<BookState, "reference" | "options">,
  now: Date,
): string | null {
  const parts = creditsWarningParts(client, state, now);
  return parts ? `${creditsWarningText(parts)}.` : null;
}

/** L'azione della riga: Prenota, «Come si prenota», «Acquista»; mai «Completo» (H10). */
export type CreditAction =
  | { kind: "book"; eventTypeId: string | null }
  | { kind: "how" }
  | { kind: "buy"; eventTypeId: string };

export interface CreditRow {
  key: string;
  eventTypeId: string | null;
  name: string;
  color: string | null;
  /** «3 disponibili» · «1 disponibile nel blocco 4» · «Esauriti». */
  avail: string;
  tone: "success" | "warning";
  action: CreditAction | null;
  /** Le larghezze della barra: svolte, prenotate, perse, in percentuale del totale. */
  bar: { done: string; booked: string; lost: string };
  /** Le perse: con una riga che ne ha, la legenda dice «Perse». */
  lost: number;
  /** «5 svolte · 7 prenotate · 1 persa · 16 in totale» · «Non ancora usati · 1 in totale». */
  detail: string;
  /** Il nome accessibile della barra. */
  aria: string;
}

/**
 * Una riga per opzione di Prenota, nel loro ordine. Il numero è count, lo
 * stesso di Prenota (H1), e quando è dei crediti del blocco dopo la riga lo
 * dice; la barra, il dettaglio e il nome accessibile raccontano sempre il
 * blocco della riga (il riferimento, o il blocco dopo se la tipologia c'è
 * solo lì), col suo disponibile.
 */
export function creditRows(state: Pick<BookState, "options" | "nextNumber">): CreditRow[] {
  return state.options.flatMap((o): CreditRow[] => {
    const pool = o.referencePool ?? o.nextPool;
    if (!pool) return [];
    const where =
      o.countFromNext && state.nextNumber !== null ? ` nel blocco ${state.nextNumber}` : "";
    const avail =
      o.count > 0 ? `${plural(o.count, "disponibile", "disponibili")}${where}` : "Esauriti";

    let action: CreditAction | null = null;
    if (o.state === "prenotabile" && o.count > 0) {
      action = { kind: "book", eventTypeId: o.eventTypeId };
    } else if (o.state === "coach" && o.count > 0) {
      action = { kind: "how" };
    } else if (o.count === 0 && o.buyBooster && o.eventTypeId) {
      action = { kind: "buy", eventTypeId: o.eventTypeId };
    }

    const total = Math.max(1, pool.total);
    const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
    const parts = [
      pool.done ? plural(pool.done, "svolta", "svolte") : null,
      pool.booked ? plural(pool.booked, "prenotata", "prenotate") : null,
      pool.lost ? plural(pool.lost, "persa", "perse") : null,
      pool.extraUsed ? plural(pool.extraUsed, "extra usato", "extra usati") : null,
    ].filter((p): p is string => p !== null);
    const detail =
      parts.length > 0
        ? `${parts.join(" · ")} · ${pool.total} in totale`
        : `Non ancora usati · ${pool.total} in totale`;
    const used = parts.length > 0 ? `${parts.join(", ")}, ` : "";

    return [
      {
        key: o.key,
        eventTypeId: o.eventTypeId,
        name: o.name,
        color: o.color,
        avail,
        tone: o.count > 0 ? "success" : "warning",
        action,
        bar: { done: pct(pool.done), booked: pct(pool.booked), lost: pct(pool.lost) },
        lost: pool.lost,
        detail,
        aria: `${o.name}: ${used}${plural(pool.avail, "disponibile", "disponibili")} su ${pool.total}`,
      },
    ];
  });
}

/**
 * Il fondo della card: chi compra un Booster lo compra; gli altri scrivono
 * al coach, col link WhatsApp, oppure una frase senza link.
 */
export function creditsFooter(
  canBuy: boolean,
  coach: BookCoach,
): { kind: "buy" } | { kind: "ask"; text: string; href: string | null } {
  if (canBuy) return { kind: "buy" };
  const text = `Per altri crediti scrivi ${coachTo(coach)}`;
  return coach.whatsapp
    ? { kind: "ask", text, href: coach.whatsapp }
    : { kind: "ask", text: `${text}.`, href: null };
}

// ----------------------------------------------------------------------------
// La valutazione
// ----------------------------------------------------------------------------

/**
 * La sessione da valutare nella Home: null finché le valutazioni non sono
 * lette. Fra le sessioni visibili che si valutano (canRate della 00: svolte,
 * create nell'app, negli ultimi 14 giorni), dalla più recente: quella già
 * mostrata (shownId), col voto e la nota se ci sono, così dopo «Invia
 * valutazione» la card resta invece di sparire alla rilettura; altrimenti la
 * prima senza valutazione.
 */
export function homeRating<
  T extends Pick<BookingRow, "id" | "status" | "scheduled_at" | "title" | "deleted_at">,
>(
  bookings: readonly T[],
  feedback: readonly { booking_id: string; rating: number }[] | undefined,
  shownId: string | null,
  now: Date,
): { booking: T; rating: number | null; note: string | null } | null {
  if (!feedback) return null;
  const rateable = bookings
    .filter((b) => isVisibleSession(b) && canRate(b, now))
    .sort((a, b) => startMs(b) - startMs(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const shown = shownId ? rateable.find((b) => b.id === shownId) : undefined;
  if (shown) {
    const saved = feedback.find((f) => f.booking_id === shown.id);
    return {
      booking: shown,
      rating: saved?.rating ?? null,
      // La colonna note arriva col 02/10: la riga di select("*") la porta solo da lì.
      note: (saved as { note?: string | null } | undefined)?.note ?? null,
    };
  }
  const pending = rateable.find((b) => !feedback.some((f) => f.booking_id === b.id));
  return pending ? { booking: pending, rating: null, note: null } : null;
}

/** Sotto «Com'è andata?»: la sessione e a chi arriva la valutazione. */
export function ratingSubtitle(
  name: string,
  b: Pick<BookingRow, "scheduled_at">,
  coach: BookCoach,
): string {
  const day = formatLongDay(new Date(b.scheduled_at)).toLowerCase();
  return `${name} di ${day}. La valutazione arriva ${coachTo(coach)}.`;
}

// ----------------------------------------------------------------------------
// I progressi
// ----------------------------------------------------------------------------

export type ProgressMetric = "weight" | "muscle" | "fat";

/** Le misure del segmentato, in quest'ordine, con l'unità dopo il numero. */
export const PROGRESS_METRICS: readonly {
  key: ProgressMetric;
  label: string;
  unit: string;
}[] = [
  { key: "weight", label: "Peso", unit: " kg" },
  { key: "muscle", label: "Massa magra", unit: " kg" },
  { key: "fat", label: "Grasso", unit: "%" },
];

const METRIC_FIELD = {
  weight: "weight_kg",
  muscle: "muscle_kg",
  fat: "fat_pct",
} as const;

export interface ProgressMeasurement {
  /** YYYY-MM-DD */
  measured_on: string;
  weight_kg: number;
  muscle_kg: number;
  fat_pct: number;
}

export interface ProgressModel {
  /** L'ultima misurazione: «61,2 kg», «25,9%». */
  value: string;
  /** Dalla prima all'ultima: «−3,0 kg dal 1 mar», «0,0 kg dall'8 mag». */
  delta: string;
  /** La polyline del grafico in un viewBox 320×100: «x,y x,y …». */
  points: string;
  /** L'ultimo punto, il cerchio. */
  last: { x: string; y: string };
  /** Il nome del grafico: «Peso: da 64,2 a 61,2 kg in 6 misurazioni». */
  aria: string;
  /** «dom 1 mar», «mer 23 set». */
  firstDay: string;
  lastDay: string;
}

/** Una cifra decimale, con la virgola. */
function decimal(v: number): string {
  return v.toFixed(1).replace(".", ",");
}

/** «dal 1 mar», «dall'8 mag», «dall'11 mag»: l'articolo segue la pronuncia. */
function sinceDay(isoDate: string): string {
  const d = parseISO(isoDate.slice(0, 10));
  const label = format(d, "d MMM", { locale: it });
  return d.getDate() === 8 || d.getDate() === 11 ? `dall'${label}` : `dal ${label}`;
}

/**
 * Il valore, la variazione e il grafico di una misura, con almeno due
 * misurazioni (in ordine di data, come le dà useBiaMeasurements); null con
 * meno. La variazione si arrotonda prima del segno: 70,04 → 70,0 dice
 * «0,0», non «−0,0». Con tutti i valori uguali la linea sta in basso.
 */
export function progressModel(
  measurements: readonly ProgressMeasurement[],
  metric: ProgressMetric,
): ProgressModel | null {
  const n = measurements.length;
  const firstM = measurements[0];
  const lastM = measurements[n - 1];
  if (n < 2 || !firstM || !lastM) return null;
  const unit = PROGRESS_METRICS.find((m) => m.key === metric)?.unit ?? "";
  const label = PROGRESS_METRICS.find((m) => m.key === metric)?.label ?? "";
  const field = METRIC_FIELD[metric];
  const values = measurements.map((m) => m[field]);
  const first = firstM[field];
  const last = lastM[field];
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const points = values.map((v, i) => ({
    x: (10 + (i / (n - 1)) * 300).toFixed(1),
    y: (84 - ((v - min) / range) * 70).toFixed(1),
  }));
  const diff = Number((last - first).toFixed(1));
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  return {
    value: `${decimal(last)}${unit}`,
    delta: `${sign}${decimal(Math.abs(diff))}${unit} ${sinceDay(firstM.measured_on)}`,
    points: points.map((p) => `${p.x},${p.y}`).join(" "),
    last: points[n - 1] ?? { x: "0", y: "0" },
    aria: `${label}: da ${decimal(first)} a ${decimal(last)}${unit} in ${n} misurazioni`,
    firstDay: formatShortDay(parseISO(firstM.measured_on.slice(0, 10))),
    lastDay: formatShortDay(parseISO(lastM.measured_on.slice(0, 10))),
  };
}

/** In fondo ai progressi. */
export function progressNote(coach: BookCoach): string {
  const first = coachFirstName(coach);
  return first
    ? `Misurazioni BIA registrate da ${first}.`
    : "Misurazioni BIA registrate dal tuo coach.";
}

// ----------------------------------------------------------------------------
// Le sezioni e la card d'installazione
// ----------------------------------------------------------------------------

export type HomeSection = "concluded" | "next" | "no-next" | "credits" | "rating";

/**
 * Le sezioni che dipendono dai crediti, nell'ordine. A percorso concluso la
 * card del percorso (e la prossima sessione, se c'è): niente crediti,
 * «Prenota», Store né valutazione (H7). Altrimenti la prossima sessione o
 * nessuna, i crediti se ci sono opzioni, la valutazione. Progressi e
 * installazione li aggiunge la pagina, indipendenti dalla lettura dei crediti.
 */
export function homeSections(input: {
  state: Pick<BookState, "blocked" | "options">;
  hasNext: boolean;
  hasRating: boolean;
}): HomeSection[] {
  const { state, hasNext, hasRating } = input;
  if (state.blocked?.kind === "concluso") return hasNext ? ["concluded", "next"] : ["concluded"];
  const sections: HomeSection[] = [hasNext ? "next" : "no-next"];
  if (state.options.length > 0) sections.push("credits");
  if (hasRating) sections.push("rating");
  return sections;
}

/** «Non ora» della card d'installazione, per utente, in localStorage. */
export function installHiddenKey(userId: string): string {
  return `nc-home-install-hidden-${userId}`;
}
