// ----------------------------------------------------------------------------
// booking-slots — pure slot-generation primitives shared by the booking flow
// and the reschedule sheet
// ----------------------------------------------------------------------------
// Extracted from client.book.tsx so the reschedule sheet
// (client-reschedule-sheet.tsx) can produce the same set of candidate
// slots without forking the logic. Pure functions only — no React, no
// Supabase. Inputs are plain rows + Date primitives; outputs are
// sorted Slot[].
//
// Key invariants:
//   - Slots respect coach availability (weekly_schedule rows) and
//     full-day or partial exceptions (availability_exceptions).
//   - Slots avoid colliding with any blocked range, where each range is
//     [scheduled_at, scheduled_at + duration + buffer].
//   - 24h minimum lead time matches the client_booking_update_guards
//     trigger so the FE doesn't surface slots the DB would reject.
//   - Optimization layer (recommended slots) is opt-in via the
//     `optimization.enabled` flag — leave undefined or false to skip.
// ----------------------------------------------------------------------------

import type { AvailabilityRow, AvailabilityExceptionRow } from "@/lib/queries";

export interface Slot {
  iso: string;
  date: Date;
  recommended?: boolean;
  injected?: boolean;
}

export interface BlockedRange {
  start: number;
  end: number;
}

// day_of_week: 1=Mon ... 7=Sun (Date.getDay() returns 0=Sun..6=Sat).
export function jsDowToIso(d: number): number {
  return d === 0 ? 7 : d;
}

export function parseHM(t: string): { h: number; m: number } {
  const [h = "0", m = "0"] = t.split(":");
  return { h: parseInt(h, 10), m: parseInt(m, 10) };
}

// L5 (originating audit): canonical YYYY-MM-DD key for a Date. Both maps
// used inside generateSlots were previously keyed with two different
// formats, which was internally consistent today but a footgun for the
// next refactor. One helper, one format, matches the DB-side YYYY-MM-DD
// date columns.
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Strict collision check.
 * Collision iff: slotStart < existingEnd AND slotEnd > existingStart
 * (where ends already include duration + buffer).
 */
export function collides(slotStart: number, slotEnd: number, ranges: BlockedRange[]): boolean {
  for (const r of ranges) {
    if (slotStart < r.end && slotEnd > r.start) return true;
  }
  return false;
}

export function generateSlots(
  daysAhead: number,
  blockedRanges: BlockedRange[],
  availability: AvailabilityRow[],
  exceptions: AvailabilityExceptionRow[],
  candidateMinutes: number, // duration + buffer used to test collision
  rangeStart?: Date,
  rangeEnd?: Date,
  optimization?: { enabled: boolean },
): Slot[] {
  const slots: Slot[] = [];
  const now = new Date();
  const candidateMs = candidateMinutes * 60_000;
  // Pre-index exceptions by YYYY-MM-DD
  const excByDate = new Map<string, AvailabilityExceptionRow[]>();
  for (const ex of exceptions) {
    if (!excByDate.has(ex.date)) excByDate.set(ex.date, []);
    excByDate.get(ex.date)!.push(ex);
  }
  // Pre-index blocked ranges by day (YYYY-MM-DD)
  const rangesByDay = new Map<string, BlockedRange[]>();
  for (const r of blockedRanges) {
    const k = ymd(new Date(r.start));
    if (!rangesByDay.has(k)) rangesByDay.set(k, []);
    rangesByDay.get(k)!.push(r);
  }

  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    if (
      rangeStart &&
      day < new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate())
    )
      continue;
    if (rangeEnd && day > rangeEnd) break;
    const dow = jsDowToIso(day.getDay());
    const dayKey = ymd(day);
    const dayExceptions = excByDate.get(dayKey) ?? [];
    if (dayExceptions.some((ex) => !ex.start_time || !ex.end_time)) continue;
    const blocks = availability.filter((a) => a.day_of_week === dow);
    if (blocks.length === 0) continue;

    const dayRanges = rangesByDay.get(dayKey) ?? [];

    // Build map of working windows in ms for the day.
    interface Win {
      start: number;
      end: number;
    }
    const windows: Win[] = blocks.map((b) => {
      const s = parseHM(b.start_time);
      const e = parseHM(b.end_time);
      const ws = new Date(day);
      ws.setHours(s.h, s.m, 0, 0);
      const we = new Date(day);
      we.setHours(e.h, e.m, 0, 0);
      return { start: ws.getTime(), end: we.getTime() };
    });

    const inWindow = (ms: number, endMs: number) =>
      windows.some((w) => ms >= w.start && endMs <= w.end);

    const inException = (ms: number, endMs: number) =>
      dayExceptions.some((ex) => {
        if (!ex.start_time || !ex.end_time) return false;
        const exS = parseHM(ex.start_time);
        const exE = parseHM(ex.end_time);
        const exStart = new Date(day);
        exStart.setHours(exS.h, exS.m, 0, 0);
        const exEnd = new Date(day);
        exEnd.setHours(exE.h, exE.m, 0, 0);
        return ms < exEnd.getTime() && endMs > exStart.getTime();
      });

    const minLeadMs = 24 * 60 * 60 * 1000;
    const candidates = new Map<number, { injected: boolean }>();

    // 1) Hourly grid candidates from working windows.
    for (const w of windows) {
      const startD = new Date(w.start);
      let mm = startD.getHours() * 60 + startD.getMinutes();
      // round up to next top-of-hour if not already
      if (mm % 60 !== 0) mm = Math.ceil(mm / 60) * 60;
      const endMin = (() => {
        const e = new Date(w.end);
        return e.getHours() * 60 + e.getMinutes();
      })();
      for (; mm + candidateMinutes <= endMin; mm += 60) {
        const slot = new Date(day);
        slot.setHours(Math.floor(mm / 60), mm % 60, 0, 0);
        candidates.set(slot.getTime(), { injected: false });
      }
    }

    // 2) Anchor injection: for each existing booking on this day, inject
    //    a slot at existing_end (so consecutive sessions can be booked
    //    back-to-back without a gap).
    for (const r of dayRanges) {
      const startMs = r.end;
      const endMs = startMs + candidateMs;
      if (!inWindow(startMs, endMs)) continue;
      if (!candidates.has(startMs)) candidates.set(startMs, { injected: true });
    }

    // 3) Filter candidates against strict collision rules.
    const daySlots: Slot[] = [];
    for (const [startMs, meta] of candidates) {
      const endMs = startMs + candidateMs;
      if (startMs - now.getTime() < minLeadMs) continue;
      if (!inWindow(startMs, endMs)) continue;
      if (collides(startMs, endMs, blockedRanges)) continue;
      if (inException(startMs, endMs)) continue;
      daySlots.push({
        iso: new Date(startMs).toISOString(),
        date: new Date(startMs),
        injected: meta.injected,
      });
    }

    // 4) Recommended logic: anchors when no bookings, adjacent (injected)
    //    when bookings exist.
    if (optimization?.enabled && daySlots.length > 0) {
      if (dayRanges.length === 0) {
        daySlots.sort((a, b) => a.date.getTime() - b.date.getTime());
        const lastIdx = daySlots.length - 1;
        const midIdx = Math.floor(lastIdx / 2);
        [0, midIdx, lastIdx].forEach((idx) => {
          const slot = daySlots[idx];
          if (slot) slot.recommended = true;
        });
      } else {
        for (const s of daySlots) if (s.injected) s.recommended = true;
      }
      daySlots.sort((a, b) => {
        const ra = a.recommended ? 0 : 1;
        const rb = b.recommended ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return a.date.getTime() - b.date.getTime();
      });
    } else {
      daySlots.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    slots.push(...daySlots);
  }
  return slots;
}
