// ----------------------------------------------------------------------------
// Pure slot-builder per il client-side reschedule flow. Calcola gli slot
// 30-minuti bookable in un giorno, intersecando: regole di availability
// del coach, eccezioni (full-day o fascia), busy ranges del coach RPC,
// ed escludendo il booking corrente che stiamo riprogrammando.
// ----------------------------------------------------------------------------

import type { AvailabilityRow, AvailabilityExceptionRow } from "@/lib/queries";

/** Numero giorni futuri mostrati nel picker reschedule. */
export const RESCHEDULE_WINDOW_DAYS = 14;
/** Passo della griglia slot in minuti (allineamento canonico). */
export const SLOT_STEP_MIN = 30;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * "YYYY-MM-DD" no UTC shift — usato per matching key sulle eccezioni
 * (column `date` di availability_exceptions è date-only locale).
 */
export function toIsoDate(d: Date): string {
  return d.toLocaleDateString("sv-SE");
}

/**
 * Converte day-of-week JS (0=Domenica) in ISO (1=Lunedì, 7=Domenica),
 * formato usato dalle regole availability_rules.day_of_week.
 */
export function jsDowToIso(d: number): number {
  return d === 0 ? 7 : d;
}

/** "HH:MM" o "HH:MM:SS" → minuti da mezzanotte (null se input vuoto/invalid). */
export function parseTimeMin(s: string | null): number | null {
  if (!s) return null;
  const [h, m] = s.split(":");
  if (!h || !m) return null;
  return Number(h) * 60 + Number(m);
}

export interface ReschedulableSlot {
  iso: string;
  date: Date;
}

/**
 * Costruisce gli slot bookable per `day`:
 *   1. Filtra regole availability per dow
 *   2. Skip totale se eccezione full-day per quella data
 *   3. Per ogni regola valida, itera step 30-min entro [start, end]
 *   4. Skip slot bloccati da eccezione partial overlap
 *   5. Skip slot nel passato
 *   6. Skip slot overlap con busy del coach (eccetto il booking corrente
 *      che stiamo riprogrammando — identificato via excludeBookingStart)
 *
 * Restituisce array Slot { iso, date } pronti per la grid.
 */
export function buildSlots(
  day: Date,
  durationMin: number,
  availability: readonly AvailabilityRow[],
  exceptions: readonly AvailabilityExceptionRow[],
  busyRanges: ReadonlyArray<{ start: number; end: number }>,
  excludeBookingStart: number | null,
): ReschedulableSlot[] {
  const dow = jsDowToIso(day.getDay());
  const rules = availability.filter((a) => a.day_of_week === dow);
  if (rules.length === 0) return [];

  const dateOnly = toIsoDate(day);
  const exForDay = exceptions.filter((e) => e.date === dateOnly);
  if (exForDay.some((e) => !e.start_time && !e.end_time)) return [];

  const slots: ReschedulableSlot[] = [];
  const now = Date.now();
  for (const rule of rules) {
    const ruleStart = parseTimeMin(rule.start_time);
    const ruleEnd = parseTimeMin(rule.end_time);
    if (ruleStart === null || ruleEnd === null) continue;
    for (let m = ruleStart; m + durationMin <= ruleEnd; m += SLOT_STEP_MIN) {
      const blockedByException = exForDay.some((e) => {
        const exStart = parseTimeMin(e.start_time);
        const exEnd = parseTimeMin(e.end_time);
        if (exStart === null || exEnd === null) return false;
        return m < exEnd && m + durationMin > exStart;
      });
      if (blockedByException) continue;

      const slotStart = new Date(day);
      slotStart.setHours(0, 0, 0, 0);
      slotStart.setMinutes(m);
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotStartMs + durationMin * 60_000;
      if (slotStartMs < now) continue;

      const blockedByBusy = busyRanges.some(
        (r) =>
          slotStartMs < r.end &&
          slotEndMs > r.start &&
          !(excludeBookingStart !== null && r.start === excludeBookingStart),
      );
      if (blockedByBusy) continue;

      slots.push({ iso: slotStart.toISOString(), date: slotStart });
    }
  }
  return slots;
}
