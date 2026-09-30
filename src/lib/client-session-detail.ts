// ----------------------------------------------------------------------------
// Il dettaglio della sessione, in un file solo (lato cliente, passata 04, audit
// D1, D3, D4, O3, O4, B2, H9 e V11)
// ----------------------------------------------------------------------------
// Tutto quello che mostrano il dettaglio e i fogli Sposta e Annulla, sopra gli
// helper delle passate prima: stati e soglie della 00 (client-session-status.ts),
// i formati di session-time.ts, la regola di Sposta (moveRulesText), luogo,
// colori e coach della 02 (client-book.ts), il nome e il contrasto della tinta
// della 03 (client-sessions.ts). La pagina e i fogli non calcolano stati,
// soglie, date né testi:
//   - l'intestazione: lo stato col suo chip, il giorno, l'orario, il luogo e
//     l'icona della tipologia;
//   - le azioni per stato, con al massimo un pulsante pieno (V11): entrare
//     nella videochiamata, confermare la presenza, spostare e annullare (fino
//     a 24 ore prima; dopo, il riquadro «Mancano meno di 24 ore»), e la card
//     delle svolte, assenti, annullate e in verifica;
//   - le informazioni: la nota del coach e l'invito del calendario;
//   - la valutazione, Annulla, Sposta (i giorni di getClientSlotDays senza
//     l'orario in cui la sessione è adesso) e gli errori delle azioni.
// Il coach è quello di BookCoach, oggi NO_COACH: il cliente non ne legge il
// nome finché non c'è get_my_coach (02/10/2026), e i testi dicono «il tuo
// coach». Puro: niente hook, niente rete, niente Sentry; l'ora entra come
// parametro, sempre l'ultimo.
// ----------------------------------------------------------------------------

import { differenceInCalendarDays, format } from "date-fns";
import {
  CLIENT_FREE_CANCEL_HOURS,
  CLIENT_RESCHEDULE_CUTOFF_HOURS,
  moveRulesText,
  type CreditWindow,
} from "@/lib/booking-rules";
import {
  coachFirstName,
  coachSubject,
  coachTo,
  placeLine,
  typeColor,
  type BookCoach,
  type BookState,
  type BookingErrorLike,
} from "@/lib/client-book";
import {
  CLIENT_STATUS_TONE,
  canMove,
  canRate,
  freeUntilLabel,
  getClientSessionStatus,
  isFreeCancel,
  type ClientSessionStatus,
  type ClientSessionStatusKey,
  type StatusBooking,
} from "@/lib/client-session-status";
import { tintContrast } from "@/lib/client-sessions";
import type { ClientSlot, ClientSlotDay } from "@/lib/client-slots";
import type { BookingRow, EventTypeRow } from "@/lib/queries";
import { formatLongDay, formatShortDay, formatTimeRange, formatUntil } from "@/lib/session-time";

/** I campi della sessione che servono al dettaglio e ai fogli. */
export type DetailBooking = Pick<
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
  | "meeting_link"
  | "trainer_notes"
  | "google_event_id"
  | "block_id"
  | "buffer_min"
>;

/** I campi della tipologia che servono al dettaglio. */
export type DetailEventType = Pick<
  EventTypeRow,
  "id" | "name" | "color" | "location_type" | "location_address" | "description"
>;

/** Inizio e durata: il giorno, l'orario, Annulla e Sposta. */
type Timed = Pick<DetailBooking, "scheduled_at" | "duration_min">;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** L'icona della tipologia è un elemento grafico: le basta 3:1 (criterio 1.4.11). */
const MIN_ICON_CONTRAST = 3;

const MAPS_SEARCH = "https://www.google.com/maps/search/?api=1&query=";

/** La durata, come formatTimeRange: duration_min se positiva, altrimenti 60. */
function minutesOf(b: Pick<DetailBooking, "duration_min">): number {
  return b.duration_min && b.duration_min > 0 ? b.duration_min : 60;
}

function startMs(b: Pick<DetailBooking, "scheduled_at">): number {
  return new Date(b.scheduled_at).getTime();
}

/** In programma: scheduled e non ancora finita (la fine è inizio + durata). */
function scheduledAhead(
  b: Pick<DetailBooking, "status" | "scheduled_at" | "duration_min">,
  now: Date,
): boolean {
  return b.status === "scheduled" && startMs(b) + minutesOf(b) * MINUTE_MS > now.getTime();
}

// ----------------------------------------------------------------------------
// L'intestazione
// ----------------------------------------------------------------------------

/** Lo stato della 00 (etichetta, riga, icona) coi suoi colori. */
export interface DetailStatus extends ClientSessionStatus {
  /** Classi dei token: il fondo e il testo del chip, e il testo della riga nella card. */
  tone: { bg: string; fg: string };
}

/** Il chip dell'intestazione e la riga della card: getClientSessionStatus e CLIENT_STATUS_TONE. */
export function detailStatus(b: StatusBooking, now: Date): DetailStatus {
  const status = getClientSessionStatus(b, now);
  return { ...status, tone: CLIENT_STATUS_TONE[status.key] };
}

export interface DetailWhen {
  /** «Oggi, lunedì 28 settembre» · «Domani, martedì 29 settembre» · «Mercoledì 30 settembre». */
  day: string;
  /** «10:00–11:00 · 60 min · tra 2 giorni». */
  time: string;
}

/**
 * Il giorno e l'orario dell'intestazione. Oggi e domani in giorni di
 * calendario locali, mai dalla stringa ISO: scheduled_at è in UTC, e il 29
 * settembre alle 00:30 di Roma in UTC è ancora il 28. I minuti così come sono
 * («60 min», non «1h»); quanto manca (formatUntil) solo per le sessioni
 * scheduled non ancora iniziate: un'annullata futura non manca a niente.
 */
export function detailWhen(
  b: Pick<DetailBooking, "status" | "scheduled_at" | "duration_min">,
  now: Date,
): DetailWhen {
  const start = new Date(b.scheduled_at);
  const long = formatLongDay(start);
  const days = differenceInCalendarDays(start, now);
  let day = long;
  if (days === 0) day = `Oggi, ${long.toLowerCase()}`;
  else if (days === 1) day = `Domani, ${long.toLowerCase()}`;
  const parts = [formatTimeRange(start, b.duration_min), `${minutesOf(b)} min`];
  const until = b.status === "scheduled" ? formatUntil(start, now) : null;
  if (until) parts.push(until);
  return { day, time: parts.join(" · ") };
}

export interface DetailPlace {
  online: boolean;
  /** placeLine della 02: «Studio · <indirizzo>», «Studio», «Online · videochiamata Google Meet». */
  text: string;
  /** «Apri in Mappe»: solo in studio, con un indirizzo non vuoto. */
  mapsHref: string | null;
}

/** Il luogo dell'intestazione; null senza tipologia, e la riga non c'è. */
export function detailPlace(
  eventType: Pick<DetailEventType, "location_type" | "location_address"> | null | undefined,
): DetailPlace | null {
  if (!eventType) return null;
  const location = eventType.location_type;
  const text = placeLine({ location, address: eventType.location_address });
  if (!text) return null;
  const online = location === "online";
  const address = eventType.location_address?.trim();
  const mapsHref = !online && address ? `${MAPS_SEARCH}${encodeURIComponent(address)}` : null;
  return { online, text, mapsHref };
}

/**
 * Il colore dell'icona della tipologia sulla sua tinta al 10%: il colore
 * della tipologia se fa almeno 3:1 (tintContrast, la formula della riga di
 * Sessioni), altrimenti il primario. #D50000 e #7986CB restano il loro colore,
 * #E67C73, #039BE5, #33B864 e #F6BF26 passano al primario.
 */
export function tileIcon(color: string | null): string {
  return tintContrast(color) >= MIN_ICON_CONTRAST ? typeColor(color) : "var(--color-aura-primary)";
}

// ----------------------------------------------------------------------------
// Le azioni
// ----------------------------------------------------------------------------

export interface DetailPanel {
  /** «Entra nella videochiamata», il pulsante pieno. */
  join: boolean;
  /** «Conferma presenza», il pulsante pieno. */
  confirm: boolean;
  /** «Sposta» e «Annulla sessione» (free) o il riquadro delle 24 ore (locked); null senza. */
  manage: "free" | "locked" | null;
  /** La card dello stato. */
  status: boolean;
}

/**
 * Le azioni del dettaglio, con al massimo un pulsante pieno (V11). «In
 * programma» vuol dire scheduled e non ancora finita:
 *   - join: in programma, online, col link, in corso oppure a non più di
 *     un'ora dall'inizio;
 *   - confirm: in programma, «Da confermare» (00: entro 48 ore, non
 *     confermata) e non join: a un'ora dall'inizio conta entrare;
 *   - manage: per le in programma non ancora iniziate, free finché si sposta
 *     (canMove: fino a 24 ore prima), poi locked;
 *   - status: le altre, cioè svolte, assenti, annullate e in verifica.
 * Senza nessuna delle quattro (in corso in studio, o online senza link) il
 * dettaglio non ha azioni.
 */
export function detailPanel(b: DetailBooking, online: boolean, now: Date): DetailPanel {
  const ahead = scheduledAhead(b, now);
  const untilStart = startMs(b) - now.getTime();
  const join = ahead && online && !!b.meeting_link && untilStart <= HOUR_MS;
  const confirm = ahead && !join && getClientSessionStatus(b, now).key === "toconfirm";
  let manage: DetailPanel["manage"] = null;
  if (ahead && untilStart > 0) manage = canMove(b, now) ? "free" : "locked";
  return { join, confirm, manage, status: !ahead };
}

/** Il titolo del riquadro delle sessioni che non si spostano più. */
export const LOCKED_TITLE = `Mancano meno di ${CLIENT_RESCHEDULE_CUTOFF_HOURS} ore`;

/**
 * Sotto «Annulla sessione»: «prima di», non «fino a», perché a quel minuto
 * cancel_booking fa già pagare il credito (freeUntilLabel).
 */
export function freeCancelNote(b: Pick<DetailBooking, "scheduled_at">): string {
  return `Annullare è gratis prima di ${freeUntilLabel(b)}. Dopo, il credito viene scalato.`;
}

/** Il testo del riquadro delle 24 ore, col nome della tipologia. */
export function lockedText(name: string, coach: BookCoach): string {
  return `La sessione non si può più spostare. Se la annulli, il credito ${name} viene scalato comunque. Per un altro orario scrivi ${coachTo(coach)}.`;
}

/** Sotto «Conferma presenza». Il toast resta quello di useConfirmAttendance. */
export function confirmCaption(coach: BookCoach): string {
  return `${coachSubject(coach)} vede la conferma nel suo calendario.`;
}

export interface StatusCard {
  key: ClientSessionStatusKey;
  /** La riga della 00: «Svolta · credito usato», «Assente · il credito è stato scalato»… */
  line: string;
  /** «Pensi sia un errore?» (absentHint). */
  absent: boolean;
  /** «Prenota di nuovo». */
  rebook: boolean;
}

const REBOOK_KEYS: ReadonlySet<ClientSessionStatusKey> = new Set(["done", "cancelled", "late"]);

/**
 * La card delle sessioni non in programma. «Prenota di nuovo» per le svolte e
 * le annullate, se la tipologia si riprenota (canRebook).
 */
export function statusCard(b: StatusBooking, rebookable: boolean, now: Date): StatusCard {
  const { key, line } = getClientSessionStatus(b, now);
  return { key, line, absent: key === "noshow", rebook: rebookable && REBOOK_KEYS.has(key) };
}

/**
 * La tipologia della sessione si riprenota da Prenota: fra le opzioni dello
 * stato dei crediti (useClientBookState; null finché non c'è) è prenotabile e
 * ha crediti. Quelle col coach o esaurite no.
 */
export function canRebook(
  b: Pick<DetailBooking, "event_type_id">,
  state: Pick<BookState, "options"> | null,
): boolean {
  if (!state || !b.event_type_id) return false;
  return state.options.some(
    (o) => o.eventTypeId === b.event_type_id && o.state === "prenotabile" && o.count > 0,
  );
}

/**
 * Sotto «Assente»: col WhatsApp del coach un link, senza una frase (niente
 * link a vuoto).
 */
export function absentHint(coach: BookCoach): { text: string; href: string | null } {
  if (coach.whatsapp) {
    return { text: `Pensi sia un errore? Scrivi ${coachTo(coach)}`, href: coach.whatsapp };
  }
  return { text: `Pensi sia un errore? Scrivi ${coachTo(coach)}.`, href: null };
}

// ----------------------------------------------------------------------------
// Le informazioni
// ----------------------------------------------------------------------------

/**
 * L'invito del calendario: solo per le sessioni in programma create
 * nell'app, con l'evento Google e con l'email del profilo. L'invito lo manda
 * la creazione dell'evento, col cliente invitato all'email del suo profilo
 * (gcal.functions.ts); le sessioni col titolo sono importate da Google o
 * impegni del coach, e lì il cliente non è invitato (la regola di canRate).
 */
export function inviteText(
  b: DetailBooking,
  email: string | null | undefined,
  now: Date,
): string | null {
  const address = email?.trim();
  if (!address || !b.google_event_id || b.title != null || !scheduledAhead(b, now)) return null;
  return `Invito del calendario inviato a ${address}: si aggiorna da solo se la sessione viene spostata o annullata.`;
}

/** Il titolo della nota del coach nella card delle informazioni. */
export function coachNoteTitle(coach: BookCoach): string {
  const first = coachFirstName(coach);
  return first ? `Nota di ${first}` : "Nota del coach";
}

// ----------------------------------------------------------------------------
// La valutazione
// ----------------------------------------------------------------------------

export interface RatingState {
  /** La card: svolta, e valutabile o già valutata. */
  show: boolean;
  /** Le stelle si scelgono: canRate della 00 (entro 14 giorni, creata nell'app). */
  editable: boolean;
}

export function ratingState(
  b: Pick<DetailBooking, "status" | "scheduled_at" | "title">,
  hasFeedback: boolean,
  now: Date,
): RatingState {
  const editable = canRate(b, now);
  return { show: b.status === "completed" && (editable || hasFeedback), editable };
}

/** Il nome di una stella: «1 stella», «4 stelle». */
export function starsLabel(n: number): string {
  return n === 1 ? "1 stella" : `${n} stelle`;
}

/** Il toast dopo il salvataggio. */
export function ratingToast(coach: BookCoach): string {
  return `Grazie: ${coachFirstName(coach) ?? "il tuo coach"} vedrà la tua valutazione.`;
}

// ----------------------------------------------------------------------------
// Annulla
// ----------------------------------------------------------------------------

export interface CancelSheetText {
  /** «Sessione PT · mer 30 set, 10:00–11:00». */
  when: string;
  /** isFreeCancel della 00: più di 24 ore prima (a 24 ore esatte si paga già). */
  free: boolean;
  text: string;
}

export function cancelSheet(b: Timed, name: string, now: Date): CancelSheetText {
  const start = new Date(b.scheduled_at);
  const free = isFreeCancel(b, now);
  return {
    when: `${name} · ${formatShortDay(start)}, ${formatTimeRange(start, b.duration_min)}`,
    free,
    text: free
      ? "Il credito torna disponibile."
      : `Mancano meno di ${CLIENT_FREE_CANCEL_HOURS} ore: il credito ${name} viene scalato comunque.`,
  };
}

export interface DetailToast {
  tone: "success" | "warning";
  text: string;
}

/**
 * Il toast dopo l'annullamento, col was_late del server. Nessun avviso al
 * coach: oggi cancel_booking non ne manda.
 */
export function cancelToast(wasLate: boolean): DetailToast {
  return wasLate
    ? { tone: "warning", text: "Sessione annullata: il credito è stato scalato." }
    : { tone: "success", text: "Sessione annullata: il credito è tornato disponibile." };
}

// ----------------------------------------------------------------------------
// Sposta
// ----------------------------------------------------------------------------

/** Sotto il titolo del foglio: «Ora: mercoledì 30 settembre, 10:00–11:00 · Sessione PT». */
export function moveCurrent(b: Timed, name: string): string {
  const start = new Date(b.scheduled_at);
  return `Ora: ${formatLongDay(start).toLowerCase()}, ${formatTimeRange(start, b.duration_min)} · ${name}`;
}

/** Il foglio aperto quando la sessione non si sposta più. */
export function moveBlockedText(coach: BookCoach): string {
  return `Mancano meno di ${CLIENT_RESCHEDULE_CUTOFF_HOURS} ore all'inizio: la sessione non si può più spostare. Per un altro orario scrivi ${coachTo(coach)}.`;
}

/** Nessun giorno con orari. */
export function moveNoSlotsText(coach: BookCoach): string {
  return `Nessun orario libero nei prossimi giorni. Per trovarne uno scrivi ${coachTo(coach)}.`;
}

/** La regola sotto gli orari: moveRulesText con la finestra di getMoveWindow. */
export function moveRule(window: CreditWindow | null, coach: BookCoach, now: Date): string {
  return moveRulesText({ now, window, coachName: coachFirstName(coach) });
}

/**
 * I giorni di getClientSlotDays senza l'orario in cui la sessione è adesso:
 * `exclude` lo libera, e spostarla lì non è uno spostamento. Lo stesso istante,
 * confrontato come tempo: scheduled_at arriva dal database nella forma
 * +00:00, gli orari in quella di toISOString. Gli altri orari che il suo
 * intervallo teneva occupati restano.
 */
export function moveDays(
  days: readonly ClientSlotDay[],
  b: Pick<DetailBooking, "scheduled_at">,
): ClientSlotDay[] {
  const current = startMs(b);
  return days.map((day): ClientSlotDay => {
    const slots = day.slots.filter((s) => new Date(s.iso).getTime() !== current);
    if (slots.length === day.slots.length) return day;
    const recommended = slots.some((s) => s.recommended);
    return {
      ...day,
      slots,
      reason: slots.length > 0 ? null : "pieno",
      recommendedReason: recommended ? day.recommendedReason : null,
    };
  });
}

/** Il giorno scelto se ha orari, altrimenti il primo con orari, altrimenti null. */
export function moveDay(
  days: readonly ClientSlotDay[],
  chosenIso: string | null,
): ClientSlotDay | null {
  return (
    days.find((d) => d.isoDate === chosenIso && d.slots.length > 0) ??
    days.find((d) => d.slots.length > 0) ??
    null
  );
}

/** Il pulsante principale del foglio: «Scegli un nuovo orario», «Sposta a mar 29 set, 11:10». */
export function moveButton(slot: Pick<ClientSlot, "iso" | "time"> | null): string {
  if (!slot) return "Scegli un nuovo orario";
  return `Sposta a ${formatShortDay(new Date(slot.iso))}, ${slot.time}`;
}

/** Il toast dopo lo spostamento: l'avviso al coach lo manda useRescheduleBooking. */
export function moveToast(iso: string, coach: BookCoach): string {
  const d = new Date(iso);
  return `Spostata a ${formatShortDay(d)} alle ${format(d, "HH:mm")}. ${coachSubject(coach)} riceve un avviso.`;
}

// ----------------------------------------------------------------------------
// Gli errori delle azioni
// ----------------------------------------------------------------------------

/** Lo spostamento, il suo «Ripristina» e il «Ripristina» dell'annullamento. */
export type DetailAction = "move" | "undo-move" | "restore";

const TAKEN_TEXT: Record<DetailAction, string> = {
  move: "Questo orario non è più libero: scegline un altro.",
  "undo-move": "L'orario di prima non è più libero.",
  restore: "L'orario non è più libero: la sessione resta annullata.",
};

const FAILED_TEXT: Record<DetailAction, string> = {
  move: "Non siamo riusciti a spostare la sessione. Riprova tra poco.",
  "undo-move": "Non siamo riusciti a riportarla all'orario di prima.",
  restore: "Non siamo riusciti a ripristinare la sessione.",
};

/**
 * L'errore di un'azione, detto al cliente. 23P01: il vincolo di
 * sovrapposizione del coach, l'orario è occupato. P0001 con un messaggio: il
 * messaggio del server così com'è (è italiano, e per lo spostamento con
 * crediti in un blocco precedente è l'unica spiegazione). Il resto, il testo
 * di ripiego.
 */
export function actionErrorText(
  err: BookingErrorLike | null | undefined,
  action: DetailAction,
): string {
  if (err?.code === "23P01") return TAKEN_TEXT[action];
  const message = err?.message?.trim();
  if (err?.code === "P0001" && message) return message;
  return FAILED_TEXT[action];
}
