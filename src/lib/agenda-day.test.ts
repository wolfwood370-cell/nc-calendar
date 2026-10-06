import { describe, expect, it } from "vitest";
import { dayIndexOf, initialAgendaDayIndex } from "./agenda-day";

// La settimana di lunedì 5 ottobre 2026, in ora locale.
const week = Array.from({ length: 7 }, (_, i) => new Date(2026, 9, 5 + i));
const OGGI = new Date(2026, 9, 6, 14, 22); // martedì 6, alle 14:22

describe("il giorno scelto nell'agenda del telefono (passata 10b)", () => {
  it("la data di una notifica vince su oggi: la sessione del 7 apre il 7, non il 6", () => {
    expect(initialAgendaDayIndex(week, "2026-10-07", OGGI)).toBe(2);
  });
  it("senza data, o con una data fuori settimana o illeggibile: oggi, poi il lunedì", () => {
    expect(initialAgendaDayIndex(week, undefined, OGGI)).toBe(1);
    expect(initialAgendaDayIndex(week, "2026-10-20", OGGI)).toBe(1);
    expect(initialAgendaDayIndex(week, "non-una-data", OGGI)).toBe(1);
    expect(initialAgendaDayIndex(week, "2026-10-07", new Date(2026, 9, 20))).toBe(2);
    expect(initialAgendaDayIndex(week, null, new Date(2026, 9, 20))).toBe(0);
  });
  it("dayIndexOf legge il giorno locale, anche la domenica, e -1 fuori settimana", () => {
    expect(dayIndexOf(week, "2026-10-11")).toBe(6);
    expect(dayIndexOf(week, "2026-10-05")).toBe(0);
    expect(dayIndexOf(week, "2026-10-12")).toBe(-1);
    expect(dayIndexOf(week, "")).toBe(-1);
  });
});
