// ----------------------------------------------------------------------------
// Eventi della griglia del Calendario (audit C2, C4, passata 04)
// ----------------------------------------------------------------------------
// Che cos'è un evento, chi passa i filtri, come si presenta il tile.
//   - session: sessione di un cliente;
//   - consulenza: consulenza esterna. È category = "consulenza" (scritta da
//     mark_booking_special, con is_personal = true e senza cliente) oppure un
//     evento importato con il coach come cliente (gcalImportEvent in modalità
//     consulenza, gcal.functions.ts:884-894);
//   - personal: impegno personale del coach;
//   - assign: evento Google senza cliente, lo stesso criterio del badge della
//     sidebar (isToAssign);
//   - allday: evento giornaliero di Google (striscia «Tutto il giorno»).
// Annullate (anche tardi) ed eliminate non stanno in griglia.
// ----------------------------------------------------------------------------

import { isAllDayEvent } from "@/lib/all-day-event";
import type { FilterState } from "@/lib/calendar-search";
import type { BookingStatus } from "@/lib/mock-data";
import { isToAssign } from "@/lib/to-assign";

export type EventKind = "session" | "consulenza" | "personal" | "assign" | "allday";

/** Campi di una riga bookings usati dalla griglia. */
export interface GridBooking {
  id: string;
  client_id: string | null;
  coach_id: string;
  is_personal: boolean;
  category?: string | null;
  status: BookingStatus;
  deleted_at: string | null;
  event_type_id: string | null;
  scheduled_at: string;
  duration_min: number | null;
  google_event_id: string | null;
  title: string | null;
  client_confirmed_at?: string | null;
}

export function eventKind(b: GridBooking): EventKind {
  if (isAllDayEvent(b)) return "allday";
  if (b.category === "consulenza") return "consulenza";
  if (b.is_personal) return "personal";
  if (isToAssign(b)) return "assign";
  if (b.client_id && b.client_id === b.coach_id) return "consulenza";
  return "session";
}

/** In griglia: non annullate, non eliminate. */
export function isOnGrid(b: Pick<GridBooking, "status" | "deleted_at">): boolean {
  return !b.deleted_at && b.status !== "cancelled" && b.status !== "late_cancelled";
}

/**
 * Il filtro: «Da assegnare» mostra solo gli eventi da assegnare, «Personali»
 * solo gli impegni; con tipologie scelte restano le sessioni e le consulenze
 * di quelle tipologie. Gli eventi giornalieri restano sempre visibili.
 */
export function passesFilters(b: GridBooking, f: FilterState): boolean {
  const kind = eventKind(b);
  if (kind === "allday") return !f.assign && !f.personal && f.types.length === 0;
  if (f.assign) return kind === "assign";
  if (f.personal) return kind === "personal";
  if (f.types.length) {
    return (kind === "session" || kind === "consulenza") && !!b.event_type_id
      ? f.types.includes(b.event_type_id)
      : false;
  }
  return true;
}

/** Durata in minuti per la griglia: quella salvata, poi la tipologia, poi 60. */
export function gridMinutes(b: Pick<GridBooking, "duration_min">, typeMinutes?: number | null) {
  if (b.duration_min && b.duration_min > 0) return b.duration_min;
  if (typeMinutes && typeMinutes > 0) return typeMinutes;
  return 60;
}

export type TileVariant = "session" | "done" | "noshow" | "consulenza" | "personal" | "assign";

export interface TileView {
  variant: TileVariant;
  title: string;
  /** Seconda riga: «Personal Training · 10:30», «Assente · 10:30», «Da assegnare · 10:30»… */
  sub: string;
  /** Spunta bianca «Presenza confermata dal cliente». */
  confirmed: boolean;
}

export function tileView(
  b: GridBooking,
  names: { client?: string | null; type?: string | null },
  time: string,
): TileView {
  const kind = eventKind(b);
  if (kind === "assign") {
    return {
      variant: "assign",
      title: b.title?.trim() || "Evento",
      sub: `Da assegnare · ${time}`,
      confirmed: false,
    };
  }
  if (kind === "personal") {
    return {
      variant: "personal",
      title: b.title?.trim() || "Impegno personale",
      sub: `Personale · ${time}`,
      confirmed: false,
    };
  }
  if (kind === "consulenza") {
    return {
      variant: "consulenza",
      title: b.title?.trim() || "Consulenza",
      sub: `Consulenza esterna · ${time}`,
      confirmed: false,
    };
  }
  const title = names.client || "Cliente";
  if (b.status === "no_show")
    return { variant: "noshow", title, sub: `Assente · ${time}`, confirmed: false };
  const sub = `${names.type || "Sessione"} · ${time}`;
  if (b.status === "completed") return { variant: "done", title, sub, confirmed: false };
  return { variant: "session", title, sub, confirmed: !!b.client_confirmed_at };
}

/**
 * Sessioni prenotate nell'app che non hanno l'evento su Google: programmate,
 * dal giorno prima in avanti, non giornaliere e non impegni personali (che
 * restano nell'app, come nella riconciliazione di calendar-gcal-review.tsx).
 */
export function notOnGoogle<B extends GridBooking>(bookings: readonly B[], now: Date): B[] {
  const from = now.getTime() - 24 * 3_600_000;
  return bookings
    .filter(
      (b) =>
        b.status === "scheduled" &&
        !b.deleted_at &&
        !b.google_event_id &&
        !b.is_personal &&
        !isAllDayEvent(b) &&
        new Date(b.scheduled_at).getTime() >= from,
    )
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

/** «1 sessione non è su Google», «3 sessioni non sono su Google». */
export function notOnGoogleLabel(n: number): string {
  return n === 1 ? "1 sessione non è su Google" : `${n} sessioni non sono su Google`;
}

// ----------------------------------------------------------------------------
// Pannello dettagli (audit C3)
// ----------------------------------------------------------------------------

export type StatusTone = "neutral" | "warning" | "success" | "danger";

/**
 * Chip di stato: Programmata, Da confermare (iniziata e ancora programmata),
 * Svolta, Assente, Personale; Annullata per le sessioni aperte da un link
 * (notifica di annullamento), che in griglia non stanno.
 */
export function detailsStatus(b: GridBooking, now: Date): { label: string; tone: StatusTone } {
  if (b.status === "cancelled" || b.status === "late_cancelled") {
    return { label: "Annullata", tone: "danger" };
  }
  const kind = eventKind(b);
  if (kind === "personal") return { label: "Personale", tone: "neutral" };
  if (b.status === "completed") return { label: "Svolta", tone: "success" };
  if (b.status === "no_show") return { label: "Assente", tone: "danger" };
  if (kind === "session" && new Date(b.scheduled_at).getTime() <= now.getTime()) {
    return { label: "Da confermare", tone: "warning" };
  }
  return { label: "Programmata", tone: "neutral" };
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Check-in e Assente: sessione cliente programmata, di oggi o già passata. */
export function canCheckIn(b: GridBooking, now: Date): boolean {
  if (eventKind(b) !== "session" || b.status !== "scheduled") return false;
  const start = new Date(b.scheduled_at);
  return start.getTime() <= now.getTime() || sameLocalDay(start, now);
}

/** Per le sessioni future: conferma di presenza del cliente (bookings.client_confirmed_at). */
export function confirmLine(
  b: GridBooking,
  now: Date,
): { label: string; confirmed: boolean } | null {
  if (eventKind(b) !== "session" || b.status !== "scheduled") return null;
  if (new Date(b.scheduled_at).getTime() <= now.getTime()) return null;
  return b.client_confirmed_at
    ? { label: "Presenza confermata dal cliente", confirmed: true }
    : { label: "In attesa di conferma del cliente", confirmed: false };
}

/** https://wa.me/<solo cifre>; null senza un numero. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? `https://wa.me/${digits}` : null;
}

/** La nota del coach dell'ultima sessione già iniziata del cliente. */
export function lastSessionNote<
  B extends Pick<GridBooking, "client_id" | "scheduled_at" | "deleted_at"> & {
    trainer_notes: string | null;
  },
>(bookings: readonly B[], clientId: string, now: Date): string | null {
  const nowMs = now.getTime();
  const last = bookings
    .filter(
      (b) =>
        b.client_id === clientId &&
        !b.deleted_at &&
        !!b.trainer_notes?.trim() &&
        new Date(b.scheduled_at).getTime() <= nowMs,
    )
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())[0];
  return last?.trainer_notes?.trim() ?? null;
}
