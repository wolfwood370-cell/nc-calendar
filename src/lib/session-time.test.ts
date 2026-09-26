import { describe, expect, it } from "vitest";
import {
  formatLongDay,
  formatShortDate,
  formatShortDay,
  formatTimeRange,
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
