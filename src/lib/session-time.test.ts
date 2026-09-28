import { describe, expect, it } from "vitest";
import {
  formatDayRel,
  formatDuration,
  formatLongDay,
  formatShortDate,
  formatShortDay,
  formatTimeRange,
  formatUntil,
  shortDateWithArticle,
} from "@/lib/session-time";

describe("formati dei dialog", () => {
  const d = new Date(2026, 9, 1, 10, 0);

  it("giorno lungo, giorno breve, data breve", () => {
    expect(formatLongDay(d)).toBe("Giovedì 1 ottobre");
    expect(formatShortDay(new Date(2026, 8, 26))).toBe("sab 26 set");
    expect(formatShortDate(new Date(2026, 9, 5))).toBe("5 ott 2026");
  });

  it("orario con la durata, 60 minuti se manca", () => {
    expect(formatTimeRange(d, 45)).toBe("10:00–10:45");
    expect(formatTimeRange(d, null)).toBe("10:00–11:00");
    expect(formatTimeRange(d, 0)).toBe("10:00–11:00");
  });
});

describe("shortDateWithArticle", () => {
  it("articolo come si pronuncia il giorno", () => {
    expect(shortDateWithArticle(new Date(2026, 9, 5))).toBe("il 5 ott 2026");
    expect(shortDateWithArticle(new Date(2026, 9, 8))).toBe("l'8 ott 2026");
    expect(shortDateWithArticle(new Date(2027, 0, 11))).toBe("l'11 gen 2027");
    expect(shortDateWithArticle(new Date(2026, 9, 18))).toBe("il 18 ott 2026");
  });

  it("il primo del mese si scrive 1°", () => {
    expect(shortDateWithArticle(new Date(2026, 9, 1))).toBe("il 1° ott 2026");
    expect(shortDateWithArticle(new Date(2026, 9, 1), "da")).toBe("dal 1° ott 2026");
  });

  it("con «da»", () => {
    expect(shortDateWithArticle(new Date(2026, 9, 5), "da")).toBe("dal 5 ott 2026");
    expect(shortDateWithArticle(new Date(2026, 9, 8), "da")).toBe("dall'8 ott 2026");
    expect(shortDateWithArticle(new Date(2027, 0, 11), "da")).toBe("dall'11 gen 2027");
  });
});

describe("durata", () => {
  it("«30m», «1h», «1h 30m», come il prototipo", () => {
    expect(formatDuration(15)).toBe("15m");
    expect(formatDuration(30)).toBe("30m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(135)).toBe("2h 15m");
  });
});

// Ora locale: gli stessi giorni con TZ=Europe/Rome e con TZ=UTC.
const NOW = new Date(2026, 8, 28, 10, 40);
const at = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m);

describe("formatUntil · quanto manca, come il prototipo", () => {
  it("sotto l'ora «tra N min», a 60 minuti «tra 1 ora»", () => {
    expect(formatUntil(at(28, 11, 39), NOW)).toBe("tra 59 min");
    expect(formatUntil(at(28, 11, 40), NOW)).toBe("tra 1 ora");
  });

  it("nello stesso giorno le ore arrotondate per difetto", () => {
    expect(formatUntil(at(28, 12, 40), NOW)).toBe("tra 2 ore");
    expect(formatUntil(at(28, 13, 39), NOW)).toBe("tra 2 ore");
  });

  it("il giorno dopo «domani», poi giorni di calendario", () => {
    expect(formatUntil(at(29, 9, 0), NOW)).toBe("domani");
    expect(formatUntil(new Date(2026, 9, 1, 10, 0), NOW)).toBe("tra 3 giorni");
    // 26 ore, ma due giorni di calendario.
    expect(formatUntil(at(30, 1, 0), at(28, 23, 0))).toBe("tra 2 giorni");
  });

  it("sotto l'ora vince «tra N min», anche dopo la mezzanotte", () => {
    expect(formatUntil(at(29, 0, 10), at(28, 23, 30))).toBe("tra 40 min");
  });

  it("già iniziata: niente", () => {
    expect(formatUntil(NOW, NOW)).toBeNull();
    expect(formatUntil(at(28, 10, 0), NOW)).toBeNull();
  });

  it("in un altro anno conta `now`, non l'orologio", () => {
    expect(formatUntil(new Date(2031, 2, 12, 9, 0), new Date(2031, 2, 10, 18, 0))).toBe(
      "tra 2 giorni",
    );
  });
});

describe("formatDayRel · Oggi, Domani, Ieri", () => {
  it("i quattro casi, a giorni di calendario", () => {
    expect(formatDayRel(at(28, 23, 59), NOW)).toBe("Oggi");
    expect(formatDayRel(at(29, 0, 0), NOW)).toBe("Domani");
    expect(formatDayRel(at(27, 8, 0), NOW)).toBe("Ieri");
    expect(formatDayRel(at(30, 10, 0), NOW)).toBe("Mercoledì 30 settembre");
  });
});
