import { subDays, subWeeks } from "date-fns";
import { describe, expect, it } from "vitest";
import { getAttendance } from "@/lib/attendance";

const NOW = new Date(2026, 8, 25, 10, 40);
const daysAgo = (days: number, status: string) => ({
  status,
  scheduled_at: subDays(NOW, days).toISOString(),
});

describe("getAttendance", () => {
  it("restituisce null senza sessioni concluse", () => {
    expect(getAttendance([], NOW)).toBeNull();
    expect(
      getAttendance(
        [daysAgo(3, "scheduled"), daysAgo(5, "cancelled"), daysAgo(-2, "scheduled")],
        NOW,
      ),
    ).toBeNull();
  });

  it("svolte / (svolte + assenze)", () => {
    const bookings = [
      daysAgo(2, "completed"),
      daysAgo(9, "completed"),
      daysAgo(16, "completed"),
      daysAgo(23, "no_show"),
    ];
    expect(getAttendance(bookings, NOW)).toEqual({
      percent: 75,
      completed: 3,
      noShow: 1,
      lateCancelled: 0,
    });
  });

  it("le cancellazioni tardive contano come mancate, quelle in tempo no", () => {
    const bookings = [
      daysAgo(2, "completed"),
      daysAgo(4, "completed"),
      daysAgo(6, "late_cancelled"),
      daysAgo(8, "no_show"),
      daysAgo(10, "cancelled"),
    ];
    expect(getAttendance(bookings, NOW)?.percent).toBe(50);
  });

  it("considera solo le ultime 8 settimane", () => {
    const edge = { status: "no_show", scheduled_at: subWeeks(NOW, 8).toISOString() };
    const bookings = [
      daysAgo(1, "completed"),
      edge,
      daysAgo(57, "no_show"),
      daysAgo(90, "no_show"),
    ];
    expect(getAttendance(bookings, NOW)).toEqual({
      percent: 50,
      completed: 1,
      noShow: 1,
      lateCancelled: 0,
    });
  });

  it("ignora le sessioni future e le date non valide", () => {
    const bookings = [
      daysAgo(1, "completed"),
      daysAgo(-1, "no_show"),
      { status: "no_show", scheduled_at: "non-una-data" },
    ];
    expect(getAttendance(bookings, NOW)?.percent).toBe(100);
  });

  it("arrotonda all'intero", () => {
    const bookings = [daysAgo(1, "completed"), daysAgo(2, "completed"), daysAgo(3, "no_show")];
    expect(getAttendance(bookings, NOW)?.percent).toBe(67);
  });
});
