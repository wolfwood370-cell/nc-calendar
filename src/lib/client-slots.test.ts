import { describe, expect, it } from "vitest";
import type { CreditWindow } from "@/lib/booking-rules";
import type { BlockedRange } from "@/lib/booking-slots";
import {
  RECOMMENDED_AFTER_SESSIONS,
  RECOMMENDED_COMPACT,
  dayPart,
  getClientSlotDays,
  type ClientSlotInput,
} from "@/lib/client-slots";
import type { AvailabilityExceptionRow, AvailabilityRow } from "@/lib/queries";

// Date in ora locale (come current-block.test.ts): gli stessi risultati con
// TZ=Europe/Rome e con TZ=UTC. Lunedì 28/09/2026 alle 10:40.
const NOW = new Date(2026, 8, 28, 10, 40);
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m);

/** Fasce in tutti i giorni della settimana (1 = lunedì … 7 = domenica). */
const everyDay = (start: string, end: string, days = [1, 2, 3, 4, 5, 6, 7]): AvailabilityRow[] =>
  days.map((d) => ({
    id: `a${d}`,
    coach_id: "coach",
    day_of_week: d,
    start_time: start,
    end_time: end,
  }));

const exception = (
  date: string,
  start: string | null,
  end: string | null,
): AvailabilityExceptionRow => ({
  id: `x-${date}`,
  coach_id: "coach",
  date,
  start_time: start,
  end_time: end,
  reason: "",
});

const win = (
  from: string,
  until: string,
  blockId: string | null = "b3",
  source: CreditWindow["source"] = "block",
): CreditWindow => ({ from, until, source, blockId, blockNumber: blockId ? 3 : null });

/** Una sessione in agenda: durata 60 e margine 10, come le 6 tipologie del backup. */
const session = (start: Date, minutes = 70): BlockedRange => ({
  start: start.getTime(),
  end: start.getTime() + minutes * 60_000,
});

const input = (over: Partial<ClientSlotInput> = {}): ClientSlotInput => ({
  now: NOW,
  durationMin: 60,
  bufferMin: 10,
  availability: everyDay("09:00:00", "20:00:00"),
  exceptions: [],
  busy: [],
  windows: [win("2026-09-01", "2026-12-31")],
  optimization: false,
  ...over,
});

const dayOf = (r: ReturnType<typeof getClientSlotDays>, isoDate: string) => {
  const d = r.days.find((x) => x.isoDate === isoDate);
  if (!d) throw new Error(`giorno ${isoDate} assente`);
  return d;
};
const times = (r: ReturnType<typeof getClientSlotDays>, isoDate: string) =>
  dayOf(r, isoDate).slots.map((s) => s.time);

// Con fasce 9-20 e 70 minuti di candidato la griglia va dalle 9 alle 18.
const FULL_GRID = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

describe("getClientSlotDays · preavviso e orizzonte", () => {
  it("un orario a now + 23:59 è escluso, a now + 24:00 è incluso", () => {
    // Martedì alle 10:00: 23:59 dopo lunedì alle 10:01, 24:00 dopo lunedì alle 10:00.
    expect(times(getClientSlotDays(input({ now: at(9, 28, 10, 1) })), "2026-09-29")[0]).toBe(
      "11:00",
    );
    expect(times(getClientSlotDays(input({ now: at(9, 28, 10, 0) })), "2026-09-29")[0]).toBe(
      "10:00",
    );
  });

  it("l'ultimo giorno è oggi + 14, con i suoi orari", () => {
    const r = getClientSlotDays(input());
    expect(r.days).toHaveLength(15);
    expect(r.days[0]!.isoDate).toBe("2026-09-28");
    expect(r.until).toBe("2026-10-12");
    expect(times(r, "2026-10-12")).toEqual(FULL_GRID);
    expect(r.limitedByCredits).toBe(false);
  });

  it("anche attraverso il cambio dell'ora del 25/10: dal 20/10 si arriva al 03/11", () => {
    const r = getClientSlotDays(input({ now: at(10, 20, 10, 40) }));
    expect(r.days.map((d) => d.isoDate).slice(-3)).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
    expect(r.days).toHaveLength(15);
    expect(times(r, "2026-10-25")).toEqual(FULL_GRID);
    expect(times(r, "2026-11-03")).toEqual(FULL_GRID);
  });

  it("in un altro anno conta `now`, non l'orologio", () => {
    const r = getClientSlotDays(
      input({ now: new Date(2031, 2, 10, 10, 40), windows: [win("2031-01-01", "2031-12-31")] }),
    );
    expect(r.days[0]!.isoDate).toBe("2031-03-10");
    expect(r.until).toBe("2031-03-24");
    expect(times(r, "2031-03-24")).toEqual(FULL_GRID);
  });
});

describe("getClientSlotDays · finestre dei crediti", () => {
  it("l'ultimo giorno di una finestra ha i suoi orari", () => {
    const r = getClientSlotDays(input({ windows: [win("2026-09-14", "2026-10-04")] }));
    expect(r.until).toBe("2026-10-04");
    expect(times(r, "2026-10-04")).toEqual(FULL_GRID);
  });

  it("due finestre contigue: il giorno dopo la fine della prima porta la seconda", () => {
    const first = win("2026-09-14", "2026-10-04", "b3");
    const second = win("2026-10-05", "2026-11-01", "b4");
    const r = getClientSlotDays(input({ windows: [first, second] }));
    expect(dayOf(r, "2026-10-04").window).toBe(first);
    expect(dayOf(r, "2026-10-05").window).toBe(second);
    expect(times(r, "2026-10-04")).toEqual(FULL_GRID);
    expect(times(r, "2026-10-05")).toEqual(FULL_GRID);
  });

  it("una finestra sola che inizia più avanti: i giorni prima hanno motivo «crediti»", () => {
    const r = getClientSlotDays(input({ windows: [win("2026-10-05", "2026-11-01", "b4")] }));
    const before = r.days.filter((d) => d.isoDate < "2026-10-05");
    expect(before).toHaveLength(7);
    expect(before.every((d) => d.reason === "crediti" && d.slots.length === 0 && !d.window)).toBe(
      true,
    );
    expect(times(r, "2026-10-05")).toEqual(FULL_GRID);
  });

  it("due finestre con un buco in mezzo: i giorni del buco hanno motivo «crediti»", () => {
    const r = getClientSlotDays(
      input({
        windows: [win("2026-09-14", "2026-10-04", "b3"), win("2026-10-07", "2026-11-03", "b4")],
      }),
    );
    expect(dayOf(r, "2026-10-05").reason).toBe("crediti");
    expect(dayOf(r, "2026-10-06").reason).toBe("crediti");
    expect(times(r, "2026-10-07")).toEqual(FULL_GRID);
  });

  it("l'ultima finestra finisce prima di oggi + 14: limitedByCredits; esattamente a oggi + 14: no", () => {
    const short = getClientSlotDays(input({ windows: [win("2026-09-14", "2026-10-11")] }));
    expect(short.limitedByCredits).toBe(true);
    expect(short.until).toBe("2026-10-11");
    expect(short.days).toHaveLength(14);
    const exact = getClientSlotDays(input({ windows: [win("2026-09-14", "2026-10-12")] }));
    expect(exact.limitedByCredits).toBe(false);
    expect(exact.until).toBe("2026-10-12");
  });

  it("nessuna finestra: nessun giorno", () => {
    expect(getClientSlotDays(input({ windows: [] }))).toEqual({
      days: [],
      until: null,
      limitedByCredits: false,
    });
  });
});

describe("getClientSlotDays · giorni vuoti", () => {
  it("chiuso: nessuna fascia quel giorno, oppure eccezione di tutto il giorno", () => {
    const r = getClientSlotDays(
      input({
        availability: everyDay("09:00:00", "20:00:00", [1, 2, 3, 4, 5, 6]),
        exceptions: [exception("2026-10-01", null, null)],
      }),
    );
    expect(dayOf(r, "2026-10-04").reason).toBe("chiuso"); // domenica
    expect(dayOf(r, "2026-10-01").reason).toBe("chiuso");
    expect(dayOf(r, "2026-10-01").slots).toEqual([]);
  });

  it("eccezione parziale: toglie solo gli orari che la toccano", () => {
    const r = getClientSlotDays(
      input({ exceptions: [exception("2026-10-02", "12:00:00", "15:00:00")] }),
    );
    // 11:00 + 70 minuti arriva alle 12:10: tocca l'eccezione.
    expect(times(r, "2026-10-02")).toEqual(["09:00", "10:00", "15:00", "16:00", "17:00", "18:00"]);
  });

  it("pieno: le fasce ci sono, ma è tutto occupato", () => {
    const r = getClientSlotDays(input({ busy: [session(at(10, 3, 8, 0), 13 * 60)] }));
    expect(dayOf(r, "2026-10-03").reason).toBe("pieno");
  });

  it("oggi è «preavviso»", () => {
    const r = getClientSlotDays(input());
    expect(dayOf(r, "2026-09-28").reason).toBe("preavviso");
    expect(dayOf(r, "2026-09-28").slots).toEqual([]);
  });

  it("domani è «preavviso» se sono le 18:00 e le fasce sono solo al mattino", () => {
    const r = getClientSlotDays(
      input({ now: at(9, 28, 18, 0), availability: everyDay("09:00:00", "13:00:00") }),
    );
    expect(dayOf(r, "2026-09-29").reason).toBe("preavviso");
    expect(times(r, "2026-09-30")).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("un giorno con orari non ha motivo", () => {
    expect(dayOf(getClientSlotDays(input()), "2026-09-30").reason).toBeNull();
  });
});

describe("getClientSlotDays · orari", () => {
  it("un orario alla fine di una sessione in agenda (inizio + durata + margine)", () => {
    const r = getClientSlotDays(input({ busy: [session(at(10, 1, 10, 0))] }));
    expect(times(r, "2026-10-01")).toEqual([
      "11:10",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
    ]);
    expect(dayOf(r, "2026-10-01").slots[0]).toMatchObject({ time: "11:10", end: "12:10" });
  });

  it("consigliati in un giorno vuoto: primo, centrale e ultimo", () => {
    const d = dayOf(getClientSlotDays(input({ optimization: true })), "2026-09-30");
    expect(d.slots.filter((s) => s.recommended).map((s) => s.time)).toEqual([
      "09:00",
      "13:00",
      "18:00",
    ]);
    expect(d.recommendedReason).toBe(RECOMMENDED_COMPACT);
  });

  it("consigliati in un giorno con sessioni: quelli subito dopo, e l'ordine resta per ora", () => {
    const d = dayOf(
      getClientSlotDays(input({ optimization: true, busy: [session(at(10, 1, 10, 0))] })),
      "2026-10-01",
    );
    expect(d.slots.filter((s) => s.recommended).map((s) => s.time)).toEqual(["11:10"]);
    expect(d.recommendedReason).toBe(RECOMMENDED_AFTER_SESSIONS);
    const t = d.slots.map((s) => s.time);
    expect(t).toEqual([...t].sort());
  });

  it("con l'ottimizzazione spenta niente consigliati", () => {
    const d = dayOf(getClientSlotDays(input({ optimization: false })), "2026-09-30");
    expect(d.slots.some((s) => s.recommended)).toBe(false);
    expect(d.recommendedReason).toBeNull();
  });

  it("spostando, la sessione non occupa il suo orario, anche con 10 minuti di margine", () => {
    const moving = at(10, 2, 10, 0);
    const busy = [session(moving)];
    expect(times(getClientSlotDays(input({ busy })), "2026-10-02")).not.toContain("10:00");
    expect(times(getClientSlotDays(input({ busy, exclude: moving })), "2026-10-02")).toEqual(
      FULL_GRID,
    );
  });

  it("la fine è senza margine, e le parti del giorno cambiano alle 13 e alle 17", () => {
    const slots = dayOf(getClientSlotDays(input()), "2026-09-30").slots;
    expect(slots.find((s) => s.time === "12:00")).toMatchObject({ end: "13:00", part: "Mattina" });
    expect(slots.find((s) => s.time === "13:00")?.part).toBe("Pomeriggio");
    expect(slots.find((s) => s.time === "16:00")?.part).toBe("Pomeriggio");
    expect(slots.find((s) => s.time === "17:00")?.part).toBe("Sera");
    expect(dayPart(at(9, 30, 12, 59))).toBe("Mattina");
    expect(dayPart(at(9, 30, 16, 59))).toBe("Pomeriggio");
  });
});
