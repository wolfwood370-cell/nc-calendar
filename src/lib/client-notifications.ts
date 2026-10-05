// ----------------------------------------------------------------------------
// Le notifiche del cliente (lato cliente, passata 08, audit H8 e O3)
// ----------------------------------------------------------------------------
// Due fonti, in una lista sola ordinata dalla più recente:
//   1. i promemoria, calcolati qui dai dati che la cornice legge già: la
//      presenza da confermare (una voce per sessione «Da confermare»), i
//      crediti da usare prima della fine del blocco (gli stessi numeri
//      dell'avviso della Home, creditsWarningParts) oppure quasi finiti (1 o
//      2, i numeri di Prenota), il blocco o il percorso appena iniziato, la
//      misurazione BIA più recente e la valutazione in sospeso (canRate);
//   2. le azioni del coach sulle sessioni e sui crediti del cliente: le righe
//      di notifications che scrivono i trigger del server della 08, lette da
//      describeClientNotification (notifications.ts).
// Blocco, percorso e BIA sono calcolati e non righe del database (il brief le
// voleva righe): un blocco nasce nel database anche settimane prima di
// cominciare (i blocchi di un percorso fisso), e chi lo crea (il coach, il
// rinnovo automatico aperto da una pagina del cliente, il cron) non dice se è
// un rinnovo o un percorso nuovo, mentre dai dati si sa quando comincia. E i
// valori della BIA sono dati di salute, che il cliente legge già dalla sua
// tabella: copiarli in notifications non serve.
// Lo stato «letta»: le righe del database hanno read_at, che si scrive con le
// due RPC di use-notifications.ts; i promemoria un elenco di id in
// localStorage per utente, a cui si aggiunge e basta (nextReadIds). L'id di un
// promemoria contiene le parti che cambiano (l'inizio della sessione, il
// blocco, i crediti, il giorno della misura), così una situazione nuova torna
// non letta.
// Fino alla 07 le voci erano cinque (conferma, sessioni da prenotare, BIA,
// pool esaurito, valutazione), senza tempo e nell'ordine del calcolo; il tocco
// su una le segnava lette tutte, «pool esaurito» lo vedeva anche chi non può
// comprare un Booster, e «entro il 11» leggeva la fine del blocco in UTC.
// Puro: niente hook, niente rete, niente Sentry, niente toast; l'ora entra
// come parametro, sempre l'ultimo.
// ----------------------------------------------------------------------------

import { addMinutes, differenceInCalendarDays, format, parseISO, subHours } from "date-fns";
import type { BiaMeasurement } from "@/hooks/use-bia";
import type { NotificationRow } from "@/hooks/use-notifications";
import type { SessionFeedback } from "@/hooks/use-session-feedback";
import { CLIENT_CONFIRM_WINDOW_HOURS } from "@/lib/booking-rules";
import { coachFirstName, type BookCoach, type BookState } from "@/lib/client-book";
import { creditsWarningParts, creditsWarningText } from "@/lib/client-home";
import { sessionMinutes } from "@/lib/client-session-detail";
import { canRate, getClientSessionStatus } from "@/lib/client-session-status";
import { sessionName, type SessionBooking, type SessionEventType } from "@/lib/client-sessions";
import { blockTiming } from "@/lib/current-block";
import {
  describeClientNotification,
  formatAgo,
  type ClientNotificationView,
} from "@/lib/notifications";
import type { BookingRow } from "@/lib/queries";
import type { RenewalClient } from "@/lib/renewal";
import { formatDayRel, formatLongDay } from "@/lib/session-time";

export type ClientReminderKind =
  | "confirm"
  | "use"
  | "low"
  | "feedback"
  | "bia"
  | "renewed"
  | "path";
export type ClientCoachKind = ClientNotificationView["kind"];
export type ClientNotificationKind = ClientReminderKind | ClientCoachKind;

/** Dove porta una voce: un dato, non una funzione. */
export type ClientNotificationTarget =
  | { to: "/client/bookings/$bookingId"; bookingId: string }
  | { to: "/client/book" }
  | { to: "/client/store" }
  | { to: "/client" };

export interface ClientReminder {
  id: string;
  kind: ClientReminderKind;
  title: string;
  body: string;
  /** Il momento della voce; null solo per i crediti quasi finiti, che non ne hanno uno loro. */
  at: Date | null;
  target: ClientNotificationTarget;
}

export type ReminderBooking = Pick<
  SessionBooking,
  | "id"
  | "status"
  | "scheduled_at"
  | "duration_min"
  | "client_confirmed_at"
  | "title"
  | "event_type_id"
  | "session_type"
  | "category"
> &
  Pick<BookingRow, "created_at">;

export interface ClientReminderInput {
  clientId: string;
  /** Le sessioni della cornice (useClientBookings: deleted_at vuoto). */
  bookings: readonly ReminderBooking[];
  eventTypes: readonly Pick<SessionEventType, "id" | "name">[];
  /**
   * Le valutazioni del cliente; null finché non sono arrivate: allora niente
   * voce della valutazione, che per un attimo comparirebbe anche per una
   * sessione già valutata.
   */
  feedback: readonly Pick<SessionFeedback, "booking_id">[] | null;
  /**
   * Lo stato dei crediti di Prenota (useClientBookState); null finché non c'è:
   * allora niente voci sui crediti, sul blocco e sul percorso.
   */
  book: {
    client: Pick<RenewalClient, "path_type">;
    state: Pick<BookState, "reference" | "referenceNumber" | "options" | "canBuy" | "blocked">;
  } | null;
  /** profiles.path_start_date: il blocco che comincia quel giorno apre un percorso. */
  pathStartDate: string | null;
  /** Le misurazioni BIA in ordine di measured_on, come le dà useBiaMeasurements. */
  bia: readonly Pick<BiaMeasurement, "measured_on" | "weight_kg" | "muscle_kg" | "created_at">[];
  coach: BookCoach;
}

/** Per quanti giorni dall'inizio un blocco, o un percorso, è una notizia (escluso il settimo). */
const NEWS_DAYS = 7;
/** Per quanti giorni dalla registrazione la misurazione BIA più recente è una notizia. */
const BIA_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOf = (b: Pick<ReminderBooking, "scheduled_at">) => new Date(b.scheduled_at).getTime();
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isValid = (d: Date) => Number.isFinite(d.getTime());

/** Il nome della sessione: la tipologia, altrimenti il tipo base (sessionName di Sessioni). */
function nameOf(b: ReminderBooking, eventTypes: ClientReminderInput["eventTypes"]): string {
  const type = b.event_type_id ? eventTypes.find((t) => t.id === b.event_type_id) : undefined;
  return sessionName(b, type);
}

/**
 * Da quando la presenza si chiede: il più recente fra l'inizio meno 48 ore e
 * la creazione della sessione (una sessione prenotata, o inserita dal coach,
 * entro le 48 ore è da confermare da subito).
 */
function confirmSince(b: Pick<ReminderBooking, "created_at">, start: Date): Date {
  const window = subHours(start, CLIENT_CONFIRM_WINDOW_HOURS);
  const created = b.created_at ? new Date(b.created_at) : null;
  return created && isValid(created) && created > window ? created : window;
}

/** «Per continuare parla con Nicolò.» · «Per continuare parla con il tuo coach.» */
function talkToCoach(coach: BookCoach): string {
  return `Per continuare parla con ${coachFirstName(coach) ?? "il tuo coach"}.`;
}

/** Il piano del percorso nuovo. */
function planName(pathType: RenewalClient["path_type"]): string {
  if (pathType === "fixed") return "Percorso fisso";
  if (pathType === "recurring") return "Abbonamento mensile";
  return "Percorso";
}

/** «61,2»: a una cifra decimale, con la virgola, senza zeri in coda («70», «25»). */
function kg(v: number): string {
  return String(Math.round(v * 10) / 10).replace(".", ",");
}

/**
 * La presenza da confermare (O3): una voce per sessione «Da confermare», in
 * ordine d'inizio. L'id porta anche l'inizio: spostata dal coach, la conferma
 * si azzera, l'id cambia e la voce torna non letta.
 */
function confirmReminders(input: ClientReminderInput, now: Date): ClientReminder[] {
  return input.bookings
    .filter((b) => getClientSessionStatus(b, now).key === "toconfirm")
    .sort((a, b) => startOf(a) - startOf(b) || byId(a.id, b.id))
    .map((b): ClientReminder => {
      const start = new Date(b.scheduled_at);
      const day = formatDayRel(start, now).toLowerCase();
      return {
        id: `confirm-${b.id}-${start.getTime()}`,
        kind: "confirm",
        title: "Conferma la tua presenza",
        body: `${nameOf(b, input.eventTypes)} · ${day} alle ${format(start, "HH:mm")}`,
        at: confirmSince(b, start),
        target: { to: "/client/bookings/$bookingId", bookingId: b.id },
      };
    });
}

/**
 * I crediti da usare prima della fine del blocco (le parti dell'avviso della
 * Home), altrimenti, a percorso non concluso, quelli quasi finiti: la somma
 * dei numeri di Prenota è 1 o 2. Il Booster solo a chi lo può comprare; gli
 * altri parlano col coach.
 */
function creditReminder(input: ClientReminderInput, now: Date): ClientReminder | null {
  const { book, clientId } = input;
  if (!book) return null;
  const use = creditsWarningParts(book.client, book.state, now);
  if (use) {
    return {
      id: `use-${clientId}-${use.blockId}-${use.left}`,
      kind: "use",
      title: "Crediti da usare",
      body: creditsWarningText(use),
      at: use.from,
      target: { to: "/client/book" },
    };
  }
  if (book.state.blocked?.kind === "concluso") return null;
  const left = book.state.options.reduce((sum, o) => sum + o.count, 0);
  if (left !== 1 && left !== 2) return null;
  const buy = book.state.canBuy;
  return {
    id: `low-${clientId}-${book.state.reference?.id ?? "libero"}-${left}`,
    kind: "low",
    title: left === 1 ? "Ti resta 1 credito" : "Ti restano 2 crediti",
    body: buy ? "Puoi aggiungerne con un Booster." : talkToCoach(input.coach),
    at: null,
    target: buy ? { to: "/client/store" } : { to: "/client" },
  };
}

/**
 * Il blocco, o il percorso, appena iniziato: il blocco di riferimento è in
 * corso e ha cominciato da 0 a 6 giorni di calendario fa. Apre un percorso se
 * è il primo blocco del cliente o se comincia il giorno di path_start_date;
 * altrimenti è un blocco nuovo, col numero della Home. La data è l'inizio del
 * blocco, a mezzanotte locale.
 */
function blockReminder(input: ClientReminderInput, now: Date): ClientReminder | null {
  const { book, clientId } = input;
  const ref = book?.state.reference;
  if (!book || !ref || blockTiming(ref, now) !== "current") return null;
  const startDay = ref.start_date.slice(0, 10);
  const start = parseISO(startDay);
  const days = differenceInCalendarDays(now, start);
  if (!(days >= 0 && days < NEWS_DAYS)) return null;
  const opensPath = ref.sequence_order === 1 || input.pathStartDate?.slice(0, 10) === startDay;
  if (opensPath) {
    return {
      id: `path-${clientId}-${ref.id}`,
      kind: "path",
      title: "Nuovo percorso",
      body: `${planName(book.client.path_type)} · i crediti sono disponibili`,
      at: start,
      target: { to: "/client" },
    };
  }
  const number = book.state.referenceNumber ?? ref.sequence_order;
  return {
    id: `renewed-${clientId}-${ref.id}`,
    kind: "renewed",
    title: "È iniziato un nuovo blocco",
    body: `Blocco ${number} · i nuovi crediti sono disponibili`,
    at: start,
    target: { to: "/client" },
  };
}

/**
 * La misurazione BIA più recente (l'ultima dell'elenco), se registrata da
 * meno di 14 giorni: la data è la registrazione (created_at), e se non si
 * legge il giorno della misura. La massa è muscle_kg, che la Home chiama
 * «Massa magra».
 */
function biaReminder(input: ClientReminderInput, now: Date): ClientReminder | null {
  const last = input.bia[input.bia.length - 1];
  if (!last) return null;
  const created = new Date(last.created_at);
  const at = isValid(created) ? created : parseISO(last.measured_on.slice(0, 10));
  if (!isValid(at) || !(now.getTime() - at.getTime() < BIA_DAYS * DAY_MS)) return null;
  const weight = Number(last.weight_kg);
  const muscle = Number(last.muscle_kg);
  if (!Number.isFinite(weight) || !Number.isFinite(muscle)) return null;
  return {
    id: `bia-${last.measured_on}`,
    kind: "bia",
    title: "Nuova misurazione BIA",
    body: `Peso ${kg(weight)} kg · massa magra ${kg(muscle)} kg`,
    at,
    target: { to: "/client" },
  };
}

/**
 * La valutazione in sospeso, solo con le valutazioni arrivate: la più recente
 * fra le sessioni che si valutano (canRate: svolte, senza titolo, negli ultimi
 * 14 giorni) e non ancora valutate. La data è la sua fine.
 */
function feedbackReminder(input: ClientReminderInput, now: Date): ClientReminder | null {
  if (!input.feedback) return null;
  const rated = new Set(input.feedback.map((f) => f.booking_id));
  const pending = input.bookings
    .filter((b) => canRate(b, now) && !rated.has(b.id))
    .sort((a, b) => startOf(b) - startOf(a) || byId(a.id, b.id))[0];
  if (!pending) return null;
  const start = new Date(pending.scheduled_at);
  return {
    id: `fb-${pending.id}`,
    kind: "feedback",
    title: "Com'è andata?",
    body: `Valuta la sessione di ${formatLongDay(start).toLowerCase()}`,
    at: addMinutes(start, sessionMinutes(pending)),
    target: { to: "/client/bookings/$bookingId", bookingId: pending.id },
  };
}

/**
 * I promemoria di adesso, in quest'ordine prima dell'ordinamento della lista:
 * le conferme (per inizio), i crediti da usare oppure quasi finiti, il blocco
 * o il percorso appena iniziato, la BIA, la valutazione.
 */
export function clientReminders(input: ClientReminderInput, now: Date): ClientReminder[] {
  const single = [
    creditReminder(input, now),
    blockReminder(input, now),
    biaReminder(input, now),
    feedbackReminder(input, now),
  ].filter((r): r is ClientReminder => r !== null);
  return [...confirmReminders(input, now), ...single];
}

export interface ClientNotificationItem {
  /** L'id della voce: quello del promemoria, o «row-» e l'id della riga. */
  id: string;
  /** L'id della riga di notifications, per mark_notification_read; null per un promemoria. */
  rowId: string | null;
  kind: ClientNotificationKind;
  title: string;
  body: string;
  /** «adesso», «25 min fa», «ieri»; null per i crediti quasi finiti. */
  ago: string | null;
  unread: boolean;
  target: ClientNotificationTarget;
  /** Il nome accessibile del pulsante: «Non letta. » se non è letta, il titolo come frase, il testo. */
  aria: string;
}

/** «Non letta. » se non è letta, poi il titolo col punto (non dopo «?», «!» o «.») e il testo. */
function ariaOf(unread: boolean, title: string, body: string): string {
  const sentence = /[.?!]$/.test(title) ? title : `${title}.`;
  return `${unread ? "Non letta. " : ""}${sentence} ${body}`;
}

/**
 * La lista della pagina e del badge: i promemoria e le righe del database che
 * si leggono (describeClientNotification; le altre non si mostrano e non si
 * contano), dalla più recente. I crediti quasi finiti, senza un momento loro,
 * stanno in cima, anche sopra una voce con un momento dopo `now` (l'ora della
 * cornice va a passi di 30 secondi, e una riga appena arrivata è più nuova);
 * a parità di momento vale l'id. Una
 * riga che porta al dettaglio di una sessione che non è fra `bookingIds` (gli
 * id delle sessioni della cornice: eliminata, o passata a un altro cliente)
 * porta alla Home, come nel prototipo; con `bookingIds` null (le sessioni non
 * ancora arrivate) resta il dettaglio. Passata 09: `bookingIdsAt` è quando le
 * sessioni sono state lette (dataUpdatedAt); una riga nata dopo tiene il
 * dettaglio anche se la sua sessione non è fra quelle lette (la sessione
 * appena creata dal coach arriva con la rilettura), e così la cornice tiene
 * le sessioni lette anche mentre si rileggono, invece di passare a null.
 */
export function clientNotificationList(
  input: {
    reminders: readonly ClientReminder[];
    rows: readonly Pick<NotificationRow, "id" | "type" | "payload" | "read_at" | "created_at">[];
    readIds: readonly string[];
    coach: BookCoach;
    bookingIds: ReadonlySet<string> | null;
    bookingIdsAt?: number | null;
  },
  now: Date,
): ClientNotificationItem[] {
  const read = new Set(input.readIds);
  const coachFirst = coachFirstName(input.coach);
  const entries: { t: number; item: ClientNotificationItem }[] = [];

  for (const r of input.reminders) {
    const at = r.at && isValid(r.at) ? r.at : null;
    const unread = !read.has(r.id);
    entries.push({
      t: at ? at.getTime() : Number.POSITIVE_INFINITY,
      item: {
        id: r.id,
        rowId: null,
        kind: r.kind,
        title: r.title,
        body: r.body,
        ago: at ? formatAgo(at.toISOString(), now) : null,
        unread,
        target: r.target,
        aria: ariaOf(unread, r.title, r.body),
      },
    });
  }

  for (const row of input.rows) {
    const view = describeClientNotification(row, coachFirst);
    if (!view) continue;
    const created = new Date(row.created_at);
    const unread = row.read_at == null;
    const after =
      input.bookingIdsAt != null && isValid(created) && created.getTime() > input.bookingIdsAt;
    const gone =
      view.target.to === "/client/bookings/$bookingId" &&
      input.bookingIds !== null &&
      !input.bookingIds.has(view.target.bookingId) &&
      !after;
    entries.push({
      t: isValid(created) ? created.getTime() : now.getTime(),
      item: {
        id: `row-${row.id}`,
        rowId: row.id,
        kind: view.kind,
        title: view.title,
        body: view.body,
        ago: formatAgo(row.created_at, now),
        unread,
        target: gone ? { to: "/client" } : view.target,
        aria: ariaOf(unread, view.title, view.body),
      },
    });
  }

  entries.sort((a, b) => b.t - a.t || byId(a.item.id, b.item.id));
  return entries.map((e) => e.item);
}

/** La chiave di localStorage dei promemoria letti, per utente (la stessa di prima). */
export function clientNotificationsReadKey(userId: string): string {
  return `nc-client-notif-read-${userId}`;
}

/** Gli id letti, com'è lo storage: JSON rotto, vuoto o di un'altra forma vuol dire nessuno. */
export function parseReadIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Quanti id letti si tengono al più: oltre, escono i più vecchi. */
export const READ_IDS_CAP = 200;

/**
 * Gli id da salvare dopo un tocco (`mark`: l'id del promemoria) o dopo «Segna
 * tutte come lette» (`mark` = "all": i promemoria di adesso). Si aggiunge e
 * basta: con la regola di prima (tenere solo i promemoria di adesso) un
 * promemoria che mancava solo perché la sua lettura non era ancora arrivata
 * (lo stato dei crediti, le valutazioni) tornava non letto. Un id già
 * presente va in fondo, una volta sola; oltre READ_IDS_CAP escono i primi, i
 * più vecchi, che sono di situazioni finite (una sessione passata, un blocco
 * chiuso).
 */
export function nextReadIds(
  readIds: readonly string[],
  reminders: readonly Pick<ClientReminder, "id">[],
  mark: string | "all",
): string[] {
  const add = new Set(mark === "all" ? reminders.map((r) => r.id) : [mark]);
  const kept = [...new Set(readIds)].filter((id) => !add.has(id));
  return [...kept, ...add].slice(-READ_IDS_CAP);
}

/** Le voci non lette: il badge della campanella e «3 da leggere». */
export function unreadCount(items: readonly Pick<ClientNotificationItem, "unread">[]): number {
  return items.filter((i) => i.unread).length;
}

/** «3 da leggere» · «Tutte lette». */
export function notificationsSummary(unread: number): string {
  return unread > 0 ? `${unread} da leggere` : "Tutte lette";
}

/** Il testo della pagina vuota, col coach o «il tuo coach». */
export function emptyNotificationsText(coach: BookCoach): string {
  return `Qui arrivano i promemoria e gli avvisi quando ${coachFirstName(coach) ?? "il tuo coach"} cambia una sessione.`;
}
