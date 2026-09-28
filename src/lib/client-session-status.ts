// ----------------------------------------------------------------------------
// Stati della sessione del cliente, in un posto solo (lato cliente, passata 00,
// audit T1, T5 e O3)
// ----------------------------------------------------------------------------
// Un elenco solo di stati, etichette, righe del dettaglio e icone, più quando
// una sessione si sposta, si annulla senza perdere il credito e si valuta. Le
// soglie sono quelle del server, lette da booking-rules.ts:
//   - spostare: validate_client_booking_update rifiuta se l'inizio è prima di
//     now() + 24 ore, quindi a 24 ore esatte si sposta ancora;
//   - annullare: cancel_booking segna tardivo da now() >= inizio − 24 ore,
//     quindi a 24 ore esatte il credito si perde già.
// La conferma entro 48 ore oggi non la mette nessuno (solo
// confirm_booking_attendance scrive client_confirmed_at, e ogni spostamento la
// azzera): una sessione prenotata a meno di 48 ore risulta «Da confermare»
// finché la migrazione O3 non c'è. Puri: l'ora entra come parametro.
// ----------------------------------------------------------------------------

import { format } from "date-fns";
import {
  CalendarCheck,
  CalendarX,
  CircleCheck,
  Clock,
  Hourglass,
  Timer,
  UserX,
  type LucideIcon,
} from "lucide-react";
import {
  CLIENT_CONFIRM_WINDOW_HOURS,
  CLIENT_FEEDBACK_DAYS,
  CLIENT_FREE_CANCEL_HOURS,
  CLIENT_RESCHEDULE_CUTOFF_HOURS,
} from "@/lib/booking-rules";
import type { BookingRow } from "@/lib/queries";
import { formatLongDay } from "@/lib/session-time";

export type ClientSessionStatusKey =
  | "done"
  | "noshow"
  | "cancelled"
  | "late"
  | "verify"
  | "now"
  | "confirmed"
  | "toconfirm"
  | "booked";

export interface ClientSessionStatus {
  key: ClientSessionStatusKey;
  /** Il chip: «Svolta», «Da confermare»… */
  label: string;
  /** La riga del dettaglio. */
  line: string;
  icon: LucideIcon;
}

/** I campi della sessione che decidono lo stato. */
export type StatusBooking = Pick<
  BookingRow,
  "status" | "scheduled_at" | "duration_min" | "client_confirmed_at"
>;

const HOUR_MS = 3_600_000;

const STATUS: Record<ClientSessionStatusKey, ClientSessionStatus> = {
  done: { key: "done", label: "Svolta", line: "Svolta · credito usato", icon: CircleCheck },
  noshow: {
    key: "noshow",
    label: "Assente",
    line: "Assente · il credito è stato scalato",
    icon: UserX,
  },
  cancelled: {
    key: "cancelled",
    label: "Annullata",
    line: "Annullata · il credito è tornato disponibile",
    icon: CalendarX,
  },
  late: {
    key: "late",
    label: "Annullata tardi",
    line: `Annullata con meno di ${CLIENT_FREE_CANCEL_HOURS} ore · credito scalato`,
    icon: CalendarX,
  },
  verify: {
    key: "verify",
    label: "In verifica",
    line: "In verifica · il coach deve ancora registrarla",
    icon: Hourglass,
  },
  now: { key: "now", label: "In corso", line: "In corso", icon: Timer },
  confirmed: {
    key: "confirmed",
    label: "Confermata",
    line: "Presenza confermata",
    icon: CircleCheck,
  },
  toconfirm: {
    key: "toconfirm",
    label: "Da confermare",
    line: "Conferma la tua presenza",
    icon: Clock,
  },
  booked: { key: "booked", label: "Prenotata", line: "Prenotata", icon: CalendarCheck },
};

/**
 * Fondo e testo di ogni stato, come classi dei token (niente esadecimali).
 * «In corso» e «Prenotata» sono il primario (#005685) al 10% e all'8%: sul
 * bianco il testo fa 9,59:1 e 6,90:1.
 */
export const CLIENT_STATUS_TONE: Record<ClientSessionStatusKey, { bg: string; fg: string }> = {
  done: { bg: "bg-success-soft", fg: "text-success-text" },
  noshow: { bg: "bg-danger-soft", fg: "text-danger-text" },
  cancelled: { bg: "bg-surface-container", fg: "text-on-surface-variant" },
  late: { bg: "bg-warning-soft", fg: "text-warning-text" },
  verify: { bg: "bg-surface-container", fg: "text-on-surface-variant" },
  now: { bg: "bg-primary-container/10", fg: "text-aura-primary" },
  confirmed: { bg: "bg-success-soft", fg: "text-success-text" },
  toconfirm: { bg: "bg-warning-soft", fg: "text-warning-text" },
  booked: { bg: "bg-primary-container/8", fg: "text-primary-container" },
};

function startOf(b: Pick<BookingRow, "scheduled_at">): number {
  return new Date(b.scheduled_at).getTime();
}

/**
 * Lo stato della sessione, valutato in quest'ordine: svolta, assente,
 * annullata, annullata tardi, in verifica (in programma e già finita, T5), in
 * corso, confermata, da confermare (inizio entro 48 ore), prenotata. La fine è
 * inizio + duration_min (60 se manca).
 */
export function getClientSessionStatus(b: StatusBooking, now: Date): ClientSessionStatus {
  if (b.status === "completed") return STATUS.done;
  if (b.status === "no_show") return STATUS.noshow;
  if (b.status === "cancelled") return STATUS.cancelled;
  if (b.status === "late_cancelled") return STATUS.late;
  const start = startOf(b);
  const minutes = b.duration_min && b.duration_min > 0 ? b.duration_min : 60;
  const t = now.getTime();
  if (start + minutes * 60_000 <= t) return STATUS.verify;
  if (start <= t) return STATUS.now;
  if (b.client_confirmed_at) return STATUS.confirmed;
  if (start - t <= CLIENT_CONFIRM_WINDOW_HOURS * HOUR_MS) return STATUS.toconfirm;
  return STATUS.booked;
}

/** In programma e inizio fra almeno 24 ore: a 24:00 esatte si sposta ancora. */
export function canMove(b: Pick<BookingRow, "status" | "scheduled_at">, now: Date): boolean {
  return (
    b.status === "scheduled" &&
    startOf(b) - now.getTime() >= CLIENT_RESCHEDULE_CUTOFF_HOURS * HOUR_MS
  );
}

/** Inizio fra più di 24 ore: a 24:00 esatte cancel_booking fa già pagare il credito. */
export function isFreeCancel(b: Pick<BookingRow, "scheduled_at">, now: Date): boolean {
  return startOf(b) - now.getTime() > CLIENT_FREE_CANCEL_HOURS * HOUR_MS;
}

/**
 * «lunedì 28 settembre alle 10:00»: l'inizio meno 24 ore, il minuto da cui
 * annullare costa il credito. La frase che lo usa dice «prima di», non «fino
 * a»: a quel minuto il server fa già pagare.
 */
export function freeUntilLabel(b: Pick<BookingRow, "scheduled_at">): string {
  const d = new Date(startOf(b) - CLIENT_FREE_CANCEL_HOURS * HOUR_MS);
  return `${formatLongDay(d).toLowerCase()} alle ${format(d, "HH:mm")}`;
}

/**
 * Svolta, creata nell'app e iniziata negli ultimi 14 giorni. «Creata
 * nell'app» vuol dire senza titolo: il titolo lo scrivono l'importazione da
 * Google, gli impegni personali e le sessioni senza cliente, mentre le
 * prenotazioni del cliente e del coach non ne hanno. google_event_id non
 * distingue: ce l'hanno anche le sessioni create nell'app.
 */
export function canRate(
  b: Pick<BookingRow, "status" | "scheduled_at" | "title">,
  now: Date,
): boolean {
  const start = startOf(b);
  const t = now.getTime();
  return (
    b.status === "completed" &&
    b.title == null &&
    start <= t &&
    start >= t - CLIENT_FEEDBACK_DAYS * 24 * HOUR_MS
  );
}
