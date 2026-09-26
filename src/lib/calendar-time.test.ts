import { describe, expect, it } from "vitest";
import {
  GRID_START_HOUR,
  HOUR_PX,
  OUTSIDE_AVAILABILITY_WARNING,
  closedRanges,
  defaultStartTime,
  findOverlap,
  isWithinAvailability,
  nowLineOffset,
  overlapWarning,
  timeFromOffset,
  timeOptions,
} from "@/lib/calendar-time";

/** Offset in px dalla cima della griglia per le ore:minuti. */
const px = (h: number, m: number) => ((h * 60 + m - GRID_START_HOUR * 60) / 60) * HOUR_PX;

describe("ora del clic, al quarto d'ora più vicino", () => {
  it.each([
    ["10:00", "10:00"],
    ["10:07", "10:00"],
    ["10:08", "10:15"],
    ["10:37", "10:30"],
    ["10:38", "10:45"],
    ["10:52", "10:45"],
    ["10:53", "11:00"],
  ])("clic alle %s → %s", (at, t) => {
    const [h = 0, m = 0] = at.split(":").map(Number);
    expect(timeFromOffset(px(h, m))).toBe(t);
  });

  it("fra 07:00 e 21:45", () => {
    expect(timeFromOffset(-10)).toBe("07:00");
    expect(timeFromOffset(px(21, 55))).toBe("21:45");
    expect(timeFromOffset(px(22, 0))).toBe("21:45");
  });

  it("ore del select ogni 15 minuti, dalle 07:00 alle 21:45", () => {
    const opts = timeOptions();
    expect([opts[0], opts[1], opts.at(-1), opts.length]).toEqual(["07:00", "07:15", "21:45", 60]);
  });

  it("senza clic, l'ora piena successiva", () => {
    expect(defaultStartTime(new Date(2026, 8, 25, 10, 40))).toBe("11:00");
    expect(defaultStartTime(new Date(2026, 8, 25, 5, 0))).toBe("07:00");
    expect(defaultStartTime(new Date(2026, 8, 25, 23, 0))).toBe("21:00");
  });
});

describe("linea dell'ora corrente", () => {
  const now = new Date(2026, 8, 25, 10, 40);
  it("solo oggi, dentro la griglia", () => {
    expect(nowLineOffset(new Date(2026, 8, 25), now)).toBe(px(10, 40));
    expect(nowLineOffset(new Date(2026, 8, 24), now)).toBeNull();
    expect(nowLineOffset(new Date(2026, 8, 25), new Date(2026, 8, 25, 6, 30))).toBeNull();
  });
});

// Venerdì (5) 09:00–13:00 e 15:00–19:00; nessuna fascia il sabato.
const SLOTS = [
  { day_of_week: 5, start_time: "09:00:00", end_time: "13:00:00" },
  { day_of_week: 5, start_time: "15:00:00", end_time: "19:00:00" },
];
const fri = (h: number, m = 0) => new Date(2026, 8, 25, h, m);

describe("disponibilità ed eccezioni", () => {
  it("dentro una fascia: nessun avviso", () => {
    expect(isWithinAvailability(fri(10), 60, SLOTS, [])).toBe(true);
    expect(isWithinAvailability(fri(12), 60, SLOTS, [])).toBe(true);
  });

  it("fuori o a cavallo della fine: avviso", () => {
    expect(isWithinAvailability(fri(12, 30), 60, SLOTS, [])).toBe(false);
    expect(isWithinAvailability(fri(13, 30), 60, SLOTS, [])).toBe(false);
    expect(isWithinAvailability(new Date(2026, 8, 26, 10), 60, SLOTS, [])).toBe(false);
  });

  it("un'eccezione che tocca la fascia la chiude", () => {
    const exc = [{ date: "2026-09-25", start_time: "10:30:00", end_time: "11:30:00" }];
    expect(isWithinAvailability(fri(10), 60, SLOTS, exc)).toBe(false);
    expect(isWithinAvailability(fri(9), 60, SLOTS, exc)).toBe(true);
    expect(isWithinAvailability(fri(11, 30), 60, SLOTS, exc)).toBe(true);
  });

  it("un'eccezione senza orari chiude tutto il giorno", () => {
    expect(
      isWithinAvailability(fri(10), 60, SLOTS, [
        { date: "2026-09-25", start_time: null, end_time: null },
      ]),
    ).toBe(false);
    expect(
      isWithinAvailability(fri(10), 60, SLOTS, [
        { date: "2026-09-24", start_time: null, end_time: null },
      ]),
    ).toBe(true);
  });

  it("fasce chiuse per il tratteggio, eccezioni comprese", () => {
    expect(closedRanges(fri(0), SLOTS, [])).toEqual([
      [7 * 60, 9 * 60],
      [13 * 60, 15 * 60],
      [19 * 60, 22 * 60],
    ]);
    expect(
      closedRanges(fri(0), SLOTS, [{ date: "2026-09-25", start_time: "10:00", end_time: "11:00" }]),
    ).toContainEqual([600, 660]);
    expect(closedRanges(new Date(2026, 8, 26), SLOTS, [])).toEqual([[7 * 60, 22 * 60]]);
  });

  it("testo dell'avviso", () => {
    expect(OUTSIDE_AVAILABILITY_WARNING).toBe(
      "È fuori dalla tua disponibilità: i clienti non vedono questo orario, ma puoi crearla comunque.",
    );
  });
});

describe("sovrapposizioni", () => {
  const b = (id: string, h: number, m: number, over: Record<string, unknown> = {}) => ({
    id,
    status: "scheduled",
    deleted_at: null,
    scheduled_at: fri(h, m).toISOString(),
    duration_min: 60,
    buffer_min: 0,
    ...over,
  });

  it("il primo evento programmato che si sovrappone", () => {
    const list = [b("a", 9, 0), b("b", 10, 30), b("c", 12, 0)];
    expect(findOverlap(list, fri(10), 60)?.id).toBe("b");
    expect(findOverlap(list, fri(11, 30), 30)).toBeNull();
    expect(overlapWarning("Giulia Bianchi", list[1]!)).toBe(
      "Si sovrappone a Giulia Bianchi (10:30–11:30).",
    );
  });

  it("contano solo programmati e non eliminati, e non la sessione stessa", () => {
    const list = [
      b("done", 10, 0, { status: "completed" }),
      b("del", 10, 0, { deleted_at: "2026-09-20T00:00:00Z" }),
      b("self", 10, 0),
    ];
    expect(findOverlap(list, fri(10), 60, 0, "self")).toBeNull();
  });

  it("il buffer allunga la fascia, come end_at sul server", () => {
    expect(findOverlap([b("a", 11, 0)], fri(10), 60, 0)).toBeNull();
    expect(findOverlap([b("a", 11, 0)], fri(10), 60, 15)?.id).toBe("a");
    expect(findOverlap([b("a", 9, 0, { buffer_min: 15 })], fri(10), 60)?.id).toBe("a");
  });
});
