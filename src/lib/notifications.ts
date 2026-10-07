// ----------------------------------------------------------------------------
// Notifiche coach: lettura del payload e testi di «Attività clienti»
// ----------------------------------------------------------------------------
// Il payload jsonb non ha tipi a runtime: le guardie ne controllano la forma
// prima di mostrarlo, così un payload malformato diventa una riga neutra
// «Notifica» invece di rompere la campanella. describeNotification prepara
// i testi della riga desktop e il giorno dell'evento da aprire nel Calendario
// (audit S4), o il cliente di cui aprire il profilo per un acquisto di
// Booster (passata 06). Formati e soglie come in Coach Header.dc.html /
// nc-store.js.
// ----------------------------------------------------------------------------

import { format } from "date-fns";
import { it } from "date-fns/locale";
import type {
  BookingCreatedPayload,
  BookingRescheduledPayload,
  BoosterPurchasedPayload,
  NotificationRow,
} from "@/hooks/use-notifications";
import { toIsoDate } from "@/lib/current-block";

export function isBookingCreatedPayload(
  p: Record<string, unknown>,
): p is Record<string, unknown> & BookingCreatedPayload {
  return (
    typeof (p as { client_name?: unknown }).client_name === "string" &&
    typeof (p as { scheduled_at?: unknown }).scheduled_at === "string" &&
    typeof (p as { session_label?: unknown }).session_label === "string"
  );
}

export function isBookingRescheduledPayload(
  p: Record<string, unknown>,
): p is Record<string, unknown> & BookingRescheduledPayload {
  return (
    typeof (p as { client_name?: unknown }).client_name === "string" &&
    typeof (p as { old_scheduled_at?: unknown }).old_scheduled_at === "string" &&
    typeof (p as { new_scheduled_at?: unknown }).new_scheduled_at === "string"
  );
}

/**
 * L'acquisto di un Booster (stripe-webhook): il cliente, il suo nome, la
 * tipologia e quanti crediti, un intero da 1 in su.
 */
export function isBoosterPurchasedPayload(
  p: Record<string, unknown>,
): p is Record<string, unknown> & BoosterPurchasedPayload {
  const quantity = (p as { quantity?: unknown }).quantity;
  return (
    typeof (p as { client_id?: unknown }).client_id === "string" &&
    typeof (p as { client_name?: unknown }).client_name === "string" &&
    typeof (p as { session_label?: unknown }).session_label === "string" &&
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity >= 1
  );
}

export interface NotificationView {
  kind: "created" | "rescheduled" | "purchase" | "other";
  title: string;
  /** «Cliente · Tipologia»; vuoto se il payload non si legge. */
  body: string;
  /** «mer 30 set · 18:00» oppure «lun 28 set 09:00 → mar 29 set 10:00». */
  when: string | null;
  /** Giorno dell'evento (YYYY-MM-DD; per una sessione spostata il nuovo) da aprire nel Calendario. */
  date: string | null;
  /** Prenotazione da evidenziare nel Calendario. */
  bookingId: string | null;
  /** Solo per un acquisto: il cliente di cui aprire il profilo. */
  clientId?: string;
}

function toDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function withType(clientName: string, sessionLabel: unknown): string {
  return typeof sessionLabel === "string" && sessionLabel
    ? `${clientName} · ${sessionLabel}`
    : clientName;
}

const dayTime = (d: Date) => format(d, "EEE d MMM · HH:mm", { locale: it });
const dayTimeCompact = (d: Date) => format(d, "EEE d MMM HH:mm", { locale: it });

export function describeNotification(
  n: Pick<NotificationRow, "type" | "payload">,
): NotificationView {
  const p = n.payload;
  const bookingId = typeof p.booking_id === "string" ? p.booking_id : null;

  if (n.type === "booking.created" && isBookingCreatedPayload(p)) {
    const at = toDate(p.scheduled_at);
    if (at) {
      return {
        kind: "created",
        title: "Nuova prenotazione",
        body: withType(p.client_name, p.session_label),
        when: dayTime(at),
        date: toIsoDate(at),
        bookingId,
      };
    }
  }

  if (n.type === "booking.rescheduled" && isBookingRescheduledPayload(p)) {
    const from = toDate(p.old_scheduled_at);
    const to = toDate(p.new_scheduled_at);
    if (from && to) {
      return {
        kind: "rescheduled",
        title: "Sessione spostata",
        body: withType(p.client_name, p.session_label),
        when: `${dayTimeCompact(from)} → ${dayTimeCompact(to)}`,
        date: toIsoDate(to),
        bookingId,
      };
    }
  }

  if (n.type === "booster.purchased" && isBoosterPurchasedPayload(p)) {
    return {
      kind: "purchase",
      title: "Acquisto Booster",
      body: `${p.client_name} · +${p.quantity} ${p.session_label}`,
      when: null,
      date: null,
      bookingId: null,
      clientId: p.client_id,
    };
  }

  return { kind: "other", title: "Notifica", body: "", when: null, date: null, bookingId: null };
}

// ----------------------------------------------------------------------------
// Le azioni del coach, per il cliente (lato cliente, passata 08)
// ----------------------------------------------------------------------------
// Le righe le scrivono i trigger del server della 08 in notifications, col
// cliente come destinatario, quando il suo coach gli sposta, annulla o
// inserisce una sessione, o gli aggiunge crediti. Nel payload ci sono i dati
// dei testi com'erano in quel momento (session_label, coach_name), le date in
// ISO (da jsonb arrivano con l'offset) e i numeri. Un payload che non ha la
// forma attesa, o un tipo che il cliente non conosce, dà null: la riga non si
// mostra e non si conta (describeNotification del coach mostra invece
// «Notifica», e il suo test lo fissa). Il blocco nuovo, il percorso nuovo e la
// BIA sono promemoria calcolati (client-notifications.ts), e le assenze non
// notificano (decisione 12 di Nicolò, 30/09/2026).

/** Le quattro azioni del coach che arrivano al cliente dal database. */
export type ClientCoachNotificationKind = "moved" | "cancelled" | "created" | "credits";

export interface ClientNotificationView {
  kind: ClientCoachNotificationKind;
  title: string;
  body: string;
  /** Il dettaglio della sessione per le tre azioni sulle sessioni, la Home per i crediti. */
  target: { to: "/client/bookings/$bookingId"; bookingId: string } | { to: "/client" };
}

/** Una stringa non vuota, senza gli spazi attorno; altrimenti null. */
function filled(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Una data ISO che si legge; altrimenti null. */
function isoDate(v: unknown): Date | null {
  return typeof v === "string" ? toDate(v) : null;
}

/** «lun 5 ott», in ora locale. */
const clientDay = (d: Date) => format(d, "EEE d MMM", { locale: it });
/** «09:00», in ora locale. */
const clientTime = (d: Date) => format(d, "HH:mm");

/**
 * Titolo, testo e destinazione di una riga di notifications per il cliente
 * (i testi del brief della 08); null se il tipo non è uno dei quattro o se il
 * payload non ha la forma attesa. Il nome è il primo nome di chi ha agito (la
 * prima parola di coach_name), altrimenti `coachFirst` (il coach di adesso),
 * altrimenti «Il tuo coach» a inizio frase e «dal tuo coach» dentro.
 */
export function describeClientNotification(
  n: Pick<NotificationRow, "type" | "payload">,
  coachFirst: string | null,
): ClientNotificationView | null {
  const p = n.payload;
  const first = filled(p.coach_name)?.split(/\s+/)[0] ?? filled(coachFirst);
  const by = first ? `da ${first}` : "dal tuo coach";
  const label = filled(p.session_label) ?? "Sessione";

  if (n.type === "credits.added") {
    const quantity = p.quantity;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) return null;
    return {
      kind: "credits",
      title: "Crediti aggiunti",
      body: `+${quantity} ${label} ${by}`,
      target: { to: "/client" },
    };
  }

  if (
    n.type !== "booking.moved_by_coach" &&
    n.type !== "booking.cancelled_by_coach" &&
    n.type !== "booking.created_by_coach"
  ) {
    return null;
  }
  const bookingId = filled(p.booking_id);
  const start = isoDate(p.scheduled_at);
  if (!bookingId || !start) return null;
  const target = { to: "/client/bookings/$bookingId" as const, bookingId };
  const when = `${clientDay(start)} alle ${clientTime(start)}`;
  const subject = first ?? "Il tuo coach";

  if (n.type === "booking.moved_by_coach") {
    const before = isoDate(p.old_scheduled_at);
    if (!before) return null;
    return {
      kind: "moved",
      title: `${subject} ha spostato una sessione`,
      body: `${label} · ${clientDay(before)} ${clientTime(before)} → ${when}`,
      target,
    };
  }
  if (n.type === "booking.cancelled_by_coach") {
    if (typeof p.charged !== "boolean") return null;
    return {
      kind: "cancelled",
      title: `${subject} ha annullato una sessione`,
      body: `${label} di ${when} · ${p.charged ? "credito scalato" : "credito restituito"}`,
      target,
    };
  }
  return {
    kind: "created",
    title: "Nuova sessione in agenda",
    body: `${label} · ${when} · inserita ${by}`,
    target,
  };
}

/** Il dettaglio di una sessione del cliente, come indirizzo (la push lo apre). */
export function clientBookingPath(bookingId: string): string {
  return `/client/bookings/${encodeURIComponent(bookingId)}`;
}

/**
 * La sessione prenotata dal cliente (passata 12 del lato cliente, nf-022 e
 * nf-023): la stessa voce nella push che arriva al telefono e nella
 * campanella. Il testo è quello delle azioni del coach, «Sessione PT · mar 29
 * set alle 11:10», in ora locale; l'indirizzo è il dettaglio della sessione.
 * Fino alla 11 la push diceva «Prenotazione confermata» e apriva la Home
 * (url "/client"), e la campanella non la mostrava: «confermata» si
 * confondeva con «Conferma la tua presenza», che per una sessione oltre le 48
 * ore arriva dopo.
 */
export function bookedNotice(b: { bookingId: string; label: string; start: Date }): {
  title: string;
  body: string;
  url: string;
} {
  return {
    title: "Sessione prenotata",
    body: `${filled(b.label) ?? "Sessione"} · ${clientDay(b.start)} alle ${clientTime(b.start)}`,
    url: clientBookingPath(b.bookingId),
  };
}

/** «adesso», «25 min fa», «1 ora fa», «3 ore fa», «ieri», «4 giorni fa». */
export function formatAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 ora fa" : `${hours} ore fa`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ieri" : `${days} giorni fa`;
}

/** Numero nel badge della campanella: oltre 99 diventa «99+». */
export function formatUnreadBadge(unread: number): string {
  return unread > 99 ? "99+" : String(unread);
}

/** Nome accessibile della campanella. */
export function notificationsBellLabel(unread: number): string {
  if (unread <= 0) return "Notifiche";
  return unread === 1 ? "Notifiche, 1 non letta" : `Notifiche, ${unread} non lette`;
}
