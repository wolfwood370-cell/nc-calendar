import { describe, expect, it } from "vitest";
import {
  formatCreditsLeft,
  formatCreditsOf,
  getBlockCredits,
  getCurrentBlockCredits,
  sumCredits,
  type CreditAllocation,
} from "@/lib/credits";

describe("formatCreditsLeft", () => {
  it.each([
    [0, "Crediti esauriti"],
    [1, "1 credito rimasto"],
    [2, "2 crediti rimasti"],
    [3, "3 crediti rimasti"],
    [-1, "Crediti esauriti"],
  ])("%i → «%s»", (n, text) => {
    expect(formatCreditsLeft(n)).toBe(text);
  });
});

describe("formatCreditsOf", () => {
  it.each([
    [6, 13, "6 di 13 rimasti"],
    [1, 1, "1 di 1 rimasto"],
    [1, 5, "1 di 5 rimasto"],
    [0, 5, "0 di 5 rimasti"],
    [-2, 5, "0 di 5 rimasti"],
  ])("%i su %i → «%s»", (left, total, text) => {
    expect(formatCreditsOf(left, total)).toBe(text);
  });
});

const alloc = (
  block_id: string,
  event_type_id: string | null,
  quantity_assigned: number,
  quantity_booked: number,
): CreditAllocation => ({
  block_id,
  event_type_id,
  session_type: "PT Session",
  quantity_assigned,
  quantity_booked,
});

describe("getBlockCredits", () => {
  it("somma le settimane della stessa tipologia", () => {
    const rows = getBlockCredits("b2", [alloc("b2", "pt", 2, 2), alloc("b2", "pt", 2, 1)]);
    expect(rows).toEqual([
      {
        key: "pt",
        eventTypeId: "pt",
        sessionType: "PT Session",
        assigned: 4,
        booked: 3,
        left: 1,
      },
    ]);
  });

  it("ignora le allocazioni degli altri blocchi", () => {
    const rows = getBlockCredits("b2", [alloc("b1", "pt", 8, 0), alloc("b2", "bia", 1, 0)]);
    expect(rows.map((r) => [r.key, r.left])).toEqual([["bia", 1]]);
  });

  it("usa session_type come chiave per le allocazioni senza tipologia", () => {
    const [row] = getBlockCredits("b2", [alloc("b2", null, 3, 1)]);
    expect(row?.key).toBe("__PT Session");
    expect(row?.left).toBe(2);
  });

  it("non scende sotto zero", () => {
    const [row] = getBlockCredits("b2", [alloc("b2", "pt", 2, 3)]);
    expect(row?.left).toBe(0);
  });
});

describe("getCurrentBlockCredits", () => {
  const blocks = [
    { id: "b1", sequence_order: 1, start_date: "2026-08-24", end_date: "2026-09-20" },
    { id: "b2", sequence_order: 2, start_date: "2026-09-21", end_date: "2026-10-18" },
  ];
  const allocations = [alloc("b1", "pt", 8, 8), alloc("b2", "pt", 8, 5), alloc("b2", "bia", 1, 0)];

  it("conta solo il blocco in corso", () => {
    const rows = getCurrentBlockCredits(blocks, allocations, new Date(2026, 8, 25, 10, 40));
    expect(rows.map((r) => [r.key, r.assigned, r.booked, r.left])).toEqual([
      ["pt", 8, 5, 3],
      ["bia", 1, 0, 1],
    ]);
  });

  it("è vuoto se oggi nessun blocco è in corso", () => {
    expect(getCurrentBlockCredits(blocks, allocations, new Date(2026, 11, 1))).toEqual([]);
  });
});

describe("sumCredits", () => {
  it("somma assegnati, prenotati e residui", () => {
    const rows = getBlockCredits("b2", [alloc("b2", "pt", 8, 5), alloc("b2", "bia", 2, 2)]);
    expect(sumCredits(rows)).toEqual({ assigned: 10, booked: 7, left: 3 });
    expect(sumCredits([])).toEqual({ assigned: 0, booked: 0, left: 0 });
  });
});
