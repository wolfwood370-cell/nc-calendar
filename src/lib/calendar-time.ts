// ----------------------------------------------------------------------------
// Tempo nel Calendario: griglia, ora del clic, avvisi (passata 04, C5, C6)
// ----------------------------------------------------------------------------
// Griglia dalle 07:00 alle 22:00, righe da 48px. Il clic su uno spazio vuoto
// apre «Nuova sessione» con l'ora arrotondata al quarto d'ora più vicino, fra
// 07:00 e 21:45. Gli avvisi della creazione non bloccano, tranne quando il
// server rifiuterebbe comunque (sovrapposizione con un evento programmato:
// vincolo bookings_no_overlap_per_coach).
// Disponibilità: trainer_availability (day_of_week 1 = lunedì … 7 = domenica,
// jsDowToIso in booking-slots.ts) meno availability_exceptions (senza orari =
// tutto il giorno), in ora locale come le fasce che vedono i clienti.
// ----------------------------------------------------------------------------

import { format } from "date-fns";

export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 22;
export const HOUR_PX = 48;
export const GRID_HEIGHT_PX = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_PX;
/** Ultimo orario d'inizio proponibile. */
export const LAST_START_MINUTES = 21 * 60 + 45;
export const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const;

function hm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** «HH:MM» → minuti dalla mezzanotte («09:00:00» va bene). */
export function toMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

/** Le ore del select, ogni 15 minuti: 07:00 … 21:45. */
export function timeOptions(): string[] {
  const out: string[] = [];
  for (let m = GRID_START_HOUR * 60; m <= LAST_START_MINUTES; m += 15) out.push(hm(m));
  return out;
}

/**
 * Ora del clic su una colonna: `offsetPx` dall'alto della griglia, arrotondata
 * al quarto d'ora più vicino, fra 07:00 e 21:45.
 */
export function timeFromOffset(offsetPx: number): string {
  const minutes = GRID_START_HOUR * 60 + (offsetPx / HOUR_PX) * 60;
  const rounded = Math.round(minutes / 15) * 15;
  return hm(Math.min(LAST_START_MINUTES, Math.max(GRID_START_HOUR * 60, rounded)));
}

/** Ora proposta senza un clic («Nuovo»): l'ora piena successiva, fra 07:00 e 21:00. */
export function defaultStartTime(now: Date): string {
  const h = Math.min(21, Math.max(GRID_START_HOUR, now.getHours() + 1));
  return hm(h * 60);
}

/** Posizione verticale di un orario nella griglia, in px (fuori griglia si taglia). */
export function offsetOf(d: Date): number {
  const minutes = d.getHours() * 60 + d.getMinutes() - GRID_START_HOUR * 60;
  return (minutes / 60) * HOUR_PX;
}

/** Linea dell'ora corrente: solo oggi e fra 07:00 e 22:00. */
export function nowLineOffset(day: Date, now: Date): number | null {
  if (format(day, "yyyy-MM-dd") !== format(now, "yyyy-MM-dd")) return null;
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < GRID_START_HOUR * 60 || minutes > GRID_END_HOUR * 60) return null;
  return offsetOf(now);
}

/** «HH:MM» locale di un istante (il select dell'ora del form). */
export function localTime(d: Date): string {
  return hm(d.getHours() * 60 + d.getMinutes());
}

/** YYYY-MM-DD locale di un istante (il campo data del form). */
export function localDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Data e ora locali del form → istante ISO. */
export function localIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

// ----------------------------------------------------------------------------
// Disponibilità ed eccezioni
// ----------------------------------------------------------------------------

export interface AvailabilitySlot {
  /** 1 = lunedì … 7 = domenica. */
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface AvailabilityException {
  /** YYYY-MM-DD */
  date: string;
  /** null = tutto il giorno. */
  start_time: string | null;
  end_time: string | null;
}

function isoDow(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

/** Fasce chiuse di un giorno dentro la griglia, in minuti: fuori orario ed eccezioni. */
export function closedRanges(
  day: Date,
  slots: readonly AvailabilitySlot[],
  exceptions: readonly AvailabilityException[],
): Array<[number, number]> {
  const start = GRID_START_HOUR * 60;
  const end = GRID_END_HOUR * 60;
  const open = slots
    .filter((s) => s.day_of_week === isoDow(day))
    .map((s) => [toMinutes(s.start_time), toMinutes(s.end_time)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const closed: Array<[number, number]> = [];
  let cur = start;
  for (const [a, b] of open) {
    if (a > cur) closed.push([cur, Math.min(a, end)]);
    cur = Math.max(cur, b);
  }
  if (cur < end) closed.push([cur, end]);
  const key = format(day, "yyyy-MM-dd");
  for (const x of exceptions) {
    if (x.date !== key) continue;
    if (!x.start_time || !x.end_time) closed.push([start, end]);
    else {
      const a = Math.max(start, toMinutes(x.start_time));
      const b = Math.min(end, toMinutes(x.end_time));
      if (b > a) closed.push([a, b]);
    }
  }
  return closed.filter(([a, b]) => b > a);
}

/**
 * La fascia sta tutta dentro un orario di disponibilità e non tocca
 * un'eccezione: è quello che i clienti possono prenotare.
 */
export function isWithinAvailability(
  start: Date,
  minutes: number,
  slots: readonly AvailabilitySlot[],
  exceptions: readonly AvailabilityException[],
): boolean {
  const s = start.getHours() * 60 + start.getMinutes();
  const e = s + minutes;
  const key = format(start, "yyyy-MM-dd");
  const blocked = exceptions.some(
    (x) =>
      x.date === key &&
      (!x.start_time || !x.end_time || (s < toMinutes(x.end_time) && e > toMinutes(x.start_time))),
  );
  if (blocked) return false;
  return slots.some(
    (x) =>
      x.day_of_week === isoDow(start) && s >= toMinutes(x.start_time) && e <= toMinutes(x.end_time),
  );
}

export const OUTSIDE_AVAILABILITY_WARNING =
  "È fuori dalla tua disponibilità: i clienti non vedono questo orario, ma puoi crearla comunque.";

// ----------------------------------------------------------------------------
// Sovrapposizioni
// ----------------------------------------------------------------------------

export interface OverlapCandidate {
  id: string;
  status: string;
  deleted_at: string | null;
  scheduled_at: string;
  duration_min: number | null;
  buffer_min?: number | null;
}

/**
 * Il primo evento del coach che si sovrappone alla fascia [start, start +
 * minuti + buffer). Contano solo gli eventi programmati e non eliminati:
 * sono quelli del vincolo bookings_no_overlap_per_coach, che confronta
 * scheduled_at–end_at (durata più buffer) con '[)'.
 */
export function findOverlap<B extends OverlapCandidate>(
  bookings: readonly B[],
  start: Date,
  minutes: number,
  bufferMin = 0,
  excludeId?: string | null,
): B | null {
  const s = start.getTime();
  const e = s + (minutes + bufferMin) * 60_000;
  return (
    bookings
      .filter((b) => b.id !== excludeId && b.status === "scheduled" && !b.deleted_at)
      .filter((b) => {
        const bs = new Date(b.scheduled_at).getTime();
        const be = bs + ((b.duration_min || 60) + (b.buffer_min || 0)) * 60_000;
        return bs < e && be > s;
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ??
    null
  );
}

/** «Si sovrappone a Giulia Bianchi (10:30–11:30).» */
export function overlapWarning(
  name: string,
  b: Pick<OverlapCandidate, "scheduled_at" | "duration_min">,
) {
  const s = new Date(b.scheduled_at);
  const e = new Date(s.getTime() + (b.duration_min || 60) * 60_000);
  return `Si sovrappone a ${name} (${format(s, "HH:mm")}–${format(e, "HH:mm")}).`;
}

/**
 * Chi c'è nell'evento sovrapposto: il cliente, oppure il titolo di un
 * impegno o di un evento senza cliente.
 */
export function overlapName(
  b: { client_id: string | null; coach_id: string | null; title?: string | null },
  clientName: (id: string) => string | null | undefined,
): string {
  return b.client_id && b.client_id !== b.coach_id
    ? (clientName(b.client_id) ?? "un cliente")
    : b.title?.trim() || "un evento";
}

/**
 * L'avviso di data e ora dei dialog delle sessioni, uguale nel Calendario e
 * nel Profilo (V7): la sovrapposizione, che il vincolo
 * bookings_no_overlap_per_coach vieta e che quindi ferma il salvataggio;
 * altrimenti il fuori disponibilità, che resta un avviso.
 */
export function scheduleWarning(
  overlap: {
    name: string;
    booking: Pick<OverlapCandidate, "scheduled_at" | "duration_min">;
  } | null,
  outside: boolean,
): string | null {
  if (overlap) {
    return `${overlapWarning(overlap.name, overlap.booking)} Due eventi programmati non possono sovrapporsi: scegli un altro orario.`;
  }
  return outside ? OUTSIDE_AVAILABILITY_WARNING : null;
}

/**
 * Il controllo di data e ora dei dialog delle sessioni (V7), per il
 * Calendario e per il Profilo: l'evento che si sovrappone, che ferma il
 * salvataggio, e il testo dell'avviso. Il fuori disponibilità si controlla
 * con `checkAvailability`: il Calendario solo per le sessioni coi clienti,
 * come il prototipo; il Profilo sempre, perché ha solo quelle.
 */
export function sessionScheduleCheck<
  B extends OverlapCandidate & {
    client_id: string | null;
    coach_id: string | null;
    title?: string | null;
  },
>(args: {
  start: Date | null;
  minutes: number;
  bufferMin: number;
  excludeId?: string | null;
  bookings: readonly B[];
  checkAvailability: boolean;
  slots: readonly AvailabilitySlot[];
  exceptions: readonly AvailabilityException[];
  clientName: (id: string) => string | null | undefined;
}): { overlap: B | null; warning: string | null } {
  const { start } = args;
  if (!start || Number.isNaN(start.getTime())) return { overlap: null, warning: null };
  const overlap = findOverlap(args.bookings, start, args.minutes, args.bufferMin, args.excludeId);
  const outside =
    args.checkAvailability &&
    !isWithinAvailability(start, args.minutes, args.slots, args.exceptions);
  return {
    overlap,
    warning: scheduleWarning(
      overlap ? { name: overlapName(overlap, args.clientName), booking: overlap } : null,
      outside,
    ),
  };
}
