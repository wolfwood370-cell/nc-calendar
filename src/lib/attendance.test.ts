import { subDays, subWeeks } from "date-fns";
import { describe, expect, it } from "vitest";
import { getAttendance, presenceSummary } from "@/lib/attendance";

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

describe("presenceSummary (Profilo desktop, passata 06)", () => {
  const mixed = [
    daysAgo(-3, "scheduled"),
    daysAgo(1, "completed"),
    daysAgo(4, "completed"),
    daysAgo(6, "no_show"),
    daysAgo(9, "late_cancelled"),
    daysAgo(10, "late_cancelled"),
    daysAgo(12, "no_show"),
    daysAgo(15, "cancelled"),
    daysAgo(20, "completed"),
    daysAgo(26, "completed"),
    daysAgo(30, "completed"),
    daysAgo(40, "late_cancelled"),
    daysAgo(70, "no_show"),
  ];

  it("«Assenze (8 sett.)» sono le assenze di getAttendance", () => {
    const p = presenceSummary(mixed, NOW);
    expect(p.absences).toBe(getAttendance(mixed, NOW)!.noShow);
    expect(p.absences).toBe(2);
    expect(p.percent).toBe(getAttendance(mixed, NOW)!.percent);
  });

  it("stessa definizione anche con sole assenze o sole annullate tardi", () => {
    for (const list of [
      [daysAgo(2, "no_show"), daysAgo(3, "no_show")],
      [daysAgo(2, "late_cancelled"), daysAgo(3, "late_cancelled")],
    ]) {
      expect(presenceSummary(list, NOW).absences).toBe(getAttendance(list, NOW)!.noShow);
    }
  });

  it("sessioni a settimana sulle ultime 4 settimane, ultima sessione svolta", () => {
    const p = presenceSummary(mixed, NOW);
    // Svolte negli ultimi 28 giorni: 1, 4, 20, 26 giorni fa.
    expect(p.perWeek).toBe("1,0");
    expect(p.lastCompleted).toBe(subDays(NOW, 1).toISOString());
  });

  it("senza dati: «—» per la presenza, zero assenze", () => {
    expect(presenceSummary([], NOW)).toEqual({
      percent: null,
      absences: 0,
      perWeek: "0,0",
      lastCompleted: null,
    });
  });
});
