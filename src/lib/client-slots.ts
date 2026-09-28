// ----------------------------------------------------------------------------
// Orari del cliente: un generatore solo, per prenotare e per spostare
// (lato cliente, passata 00, audit B1, B2 e V15)
// ----------------------------------------------------------------------------
// getClientSlotDays sta sopra generateSlots (booking-slots.ts) e lo useranno
// Prenota (02), Sposta (04) e il «primo orario libero» della Home (05). I
// giorni vanno da oggi a oggi + 14, e non oltre l'ultima finestra dei crediti
// (getCreditWindows per prenotare, getMoveWindow per spostare: client-credits.ts);
// ogni giorno porta la sua finestra, così la pagina sa con quale credito si
// prenota. Griglia, sessioni in agenda, margine, eccezioni, preavviso e
// consigliati restano di generateSlots. Puro: l'ora entra come parametro.
// ----------------------------------------------------------------------------

import { addDays, format, parseISO, startOfDay } from "date-fns";
import {
  CLIENT_BOOKING_HORIZON_DAYS,
  CLIENT_MIN_NOTICE_HOURS,
  type CreditWindow,
} from "@/lib/booking-rules";
import { generateSlots, jsDowToIso, ymd, type BlockedRange, type Slot } from "@/lib/booking-slots";
import type { AvailabilityExceptionRow, AvailabilityRow } from "@/lib/queries";

export type DayPart = "Mattina" | "Pomeriggio" | "Sera";

/**
 * Perché un giorno non ha orari: studio chiuso (nessuna fascia, o eccezione di
 * tutto il giorno), nessun credito che valga quel giorno, 24 ore di preavviso,
 * oppure tutto occupato.
 */
export type EmptyDayReason = "chiuso" | "crediti" | "preavviso" | "pieno";

export const RECOMMENDED_AFTER_SESSIONS =
  "Subito dopo le altre sessioni della giornata: meno attese per te e per lo studio.";
export const RECOMMENDED_COMPACT = "Tengono compatta la giornata dello studio.";

export interface ClientSlot {
  iso: string;
  /** «11:10» */
  time: string;
  /** Fine della sessione, senza il margine: «12:10». */
  end: string;
  part: DayPart;
  recommended: boolean;
}

export interface ClientSlotDay {
  /** Mezzanotte locale del giorno. */
  date: Date;
  isoDate: string;
  /** In ordine di ora, sempre. */
  slots: ClientSlot[];
  /** null se il giorno ha orari. */
  reason: EmptyDayReason | null;
  /** Perché gli orari consigliati; null se il giorno non ne ha. */
  recommendedReason: string | null;
  /** La finestra dei crediti che contiene il giorno, al massimo una. */
  window: CreditWindow | null;
}

export interface ClientSlotDays {
  /** Da oggi all'ultimo giorno, tutti, anche quelli senza orari. */
  days: ClientSlotDay[];
  /** L'ultimo giorno della fila (YYYY-MM-DD); null senza giorni. */
  until: string | null;
  /** La fila finisce prima di oggi + 14 perché finiscono i crediti, non l'orizzonte. */
  limitedByCredits: boolean;
}

export interface ClientSlotInput {
  now: Date;
  /** Durata e margine della tipologia, in minuti. */
  durationMin: number;
  bufferMin: number;
  availability: readonly AvailabilityRow[];
  exceptions: readonly AvailabilityExceptionRow[];
  /** Sessioni del coach (get_coach_busy) come [inizio, inizio + durata + margine]. */
  busy: readonly BlockedRange[];
  /** Le finestre dei crediti della tipologia, ordinate e senza sovrapposizioni. */
  windows: readonly CreditWindow[];
  /**
   * Inizio della sessione che si sposta: non occupa il suo orario. Si esclude
   * per ora d'inizio perché get_coach_busy non restituisce l'id, e basta: due
   * sessioni dello stesso coach non si sovrappongono.
   */
  exclude?: Date | null;
  /** Orari consigliati (useCoachOptimizationEnabled; il cliente oggi legge sempre true). */
  optimization: boolean;
}

/** Prima delle 13 «Mattina», prima delle 17 «Pomeriggio», poi «Sera». */
export function dayPart(d: Date): DayPart {
  const h = d.getHours();
  if (h < 13) return "Mattina";
  return h < 17 ? "Pomeriggio" : "Sera";
}

const HOUR_MS = 3_600_000;

/** Fine del giorno locale di una data YYYY-MM-DD. */
function endOfIsoDate(isoDate: string): Date {
  const d = parseISO(isoDate);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Giorni e orari prenotabili di una tipologia. generateSlots si chiama una
 * volta per finestra, da mezzanotte del primo giorno alle 23:59:59.999
 * dell'ultimo e con i giorni che arrivano a oggi + 14 compreso: il suo ciclo
 * confronta la fine della finestra con un giorno che porta l'ora di `now`, e
 * una fine a mezzanotte toglierebbe in silenzio gli orari dell'ultimo giorno.
 */
export function getClientSlotDays(input: ClientSlotInput): ClientSlotDays {
  const { now, durationMin, bufferMin, windows, optimization } = input;
  const none: ClientSlotDays = { days: [], until: null, limitedByCredits: false };
  if (windows.length === 0) return none;

  const today = startOfDay(now);
  const todayIso = ymd(today);
  const horizonIso = ymd(addDays(today, CLIENT_BOOKING_HORIZON_DAYS));
  const lastWindowIso = windows.reduce((m, w) => (w.until > m ? w.until : m), "");
  const lastIso = lastWindowIso < horizonIso ? lastWindowIso : horizonIso;
  if (lastIso < todayIso) return none;

  const availability = [...input.availability];
  const exceptions = [...input.exceptions];
  const excluded = input.exclude ? input.exclude.getTime() : null;
  const busy = input.busy.filter((r) => r.start !== excluded);
  const candidateMinutes = durationMin + bufferMin;

  const slotsByDay = new Map<string, Map<string, Slot>>();
  for (const w of windows) {
    const from = w.from > todayIso ? w.from : todayIso;
    const until = w.until < lastIso ? w.until : lastIso;
    if (from > until) continue;
    const slots = generateSlots(
      CLIENT_BOOKING_HORIZON_DAYS + 1,
      busy,
      availability,
      exceptions,
      candidateMinutes,
      parseISO(from),
      endOfIsoDate(until),
      { enabled: optimization },
      CLIENT_MIN_NOTICE_HOURS,
      now,
    );
    for (const s of slots) {
      const key = ymd(s.date);
      const day = slotsByDay.get(key) ?? new Map<string, Slot>();
      day.set(s.iso, s);
      slotsByDay.set(key, day);
    }
  }

  // generateSlots consiglia gli orari subito dopo le sessioni se il giorno ne
  // ha (una sessione che inizia quel giorno), altrimenti primo, centrale e ultimo.
  const withSessions = new Set(busy.map((r) => ymd(new Date(r.start))));
  const minStart = now.getTime() + CLIENT_MIN_NOTICE_HOURS * HOUR_MS;
  const toClientSlot = (s: Slot): ClientSlot => ({
    iso: s.iso,
    time: format(s.date, "HH:mm"),
    end: format(new Date(s.date.getTime() + durationMin * 60_000), "HH:mm"),
    part: dayPart(s.date),
    recommended: s.recommended === true,
  });

  const days: ClientSlotDay[] = [];
  for (let date = today; ymd(date) <= lastIso; date = addDays(date, 1)) {
    const isoDate = ymd(date);
    const window = windows.find((w) => w.from <= isoDate && isoDate <= w.until) ?? null;
    const slots = [...(slotsByDay.get(isoDate)?.values() ?? [])]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(toClientSlot);
    const recommended = slots.some((s) => s.recommended);
    days.push({
      date,
      isoDate,
      slots,
      reason:
        slots.length > 0
          ? null
          : emptyReason(date, window, availability, exceptions, candidateMinutes, minStart),
      recommendedReason: recommended
        ? withSessions.has(isoDate)
          ? RECOMMENDED_AFTER_SESSIONS
          : RECOMMENDED_COMPACT
        : null,
      window,
    });
  }
  return { days, until: lastIso, limitedByCredits: lastWindowIso < horizonIso };
}

/**
 * Il motivo di un giorno senza orari, in quest'ordine: chiuso, crediti,
 * preavviso (tutti gli orari che le fasce darebbero iniziano prima di
 * now + 24 ore), pieno.
 */
function emptyReason(
  date: Date,
  window: CreditWindow | null,
  availability: AvailabilityRow[],
  exceptions: AvailabilityExceptionRow[],
  candidateMinutes: number,
  minStart: number,
): EmptyDayReason {
  const isoDate = ymd(date);
  const open = availability.some((a) => a.day_of_week === jsDowToIso(date.getDay()));
  const closedAllDay = exceptions.some(
    (ex) => ex.date === isoDate && (!ex.start_time || !ex.end_time),
  );
  if (!open || closedAllDay) return "chiuso";
  if (!window) return "crediti";
  // La griglia delle fasce di quel giorno: generateSlots senza sessioni, senza
  // eccezioni e senza preavviso, con l'ora ferma a mezzanotte.
  const grid = generateSlots(
    1,
    [],
    availability,
    [],
    candidateMinutes,
    date,
    endOfIsoDate(isoDate),
    undefined,
    0,
    date,
  );
  if (grid.length > 0 && grid.every((s) => s.date.getTime() < minStart)) return "preavviso";
  return "pieno";
}
