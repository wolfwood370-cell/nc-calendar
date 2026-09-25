// ----------------------------------------------------------------------------
// Notifiche coach: lettura del payload e testi di «Attività clienti»
// ----------------------------------------------------------------------------
// Il payload jsonb non ha tipi a runtime: le guardie ne controllano la forma
// prima di mostrarlo, così un payload malformato diventa una riga neutra
// «Notifica» invece di rompere la campanella. describeNotification prepara
// i testi della riga desktop e il giorno dell'evento da aprire nel Calendario
// (audit S4). Formati e soglie come in Coach Header.dc.html / nc-store.js.
// ----------------------------------------------------------------------------

import { format } from "date-fns";
import { it } from "date-fns/locale";
import type {
  BookingCreatedPayload,
  BookingRescheduledPayload,
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

export interface NotificationView {
  kind: "created" | "rescheduled" | "other";
  title: string;
  /** «Cliente · Tipologia»; vuoto se il payload non si legge. */
  body: string;
  /** «mer 30 set · 18:00» oppure «lun 28 set 09:00 → mar 29 set 10:00». */
  when: string | null;
  /** Giorno dell'evento (YYYY-MM-DD; per una sessione spostata il nuovo) da aprire nel Calendario. */
  date: string | null;
  /** Prenotazione da evidenziare nel Calendario. */
  bookingId: string | null;
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

  return { kind: "other", title: "Notifica", body: "", when: null, date: null, bookingId: null };
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
