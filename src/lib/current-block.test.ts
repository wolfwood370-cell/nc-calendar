import { describe, expect, it } from "vitest";
import { findCurrentBlock, resolveCurrentBlock, toIsoDate } from "@/lib/current-block";

/** Data locale: at(2026, 9, 25) = 25 settembre 2026 alle 10:40. */
const at = (y: number, m: number, d: number, h = 10, min = 40) => new Date(y, m - 1, d, h, min);

const BLOCKS = [
  { id: "b2", sequence_order: 2, start_date: "2026-09-21", end_date: "2026-10-18" },
  { id: "b1", sequence_order: 1, start_date: "2026-08-24", end_date: "2026-09-20" },
  { id: "b3", sequence_order: 3, start_date: "2026-10-19", end_date: "2026-11-15" },
];

describe("toIsoDate", () => {
  it("usa la data di calendario locale", () => {
    expect(toIsoDate(at(2026, 9, 25, 0, 5))).toBe("2026-09-25");
    expect(toIsoDate(at(2026, 9, 25, 23, 59))).toBe("2026-09-25");
  });
});

describe("findCurrentBlock", () => {
  it("trova il blocco che contiene oggi", () => {
    expect(findCurrentBlock(BLOCKS, at(2026, 9, 25))?.id).toBe("b2");
  });

  it("include il primo e l'ultimo giorno del blocco", () => {
    expect(findCurrentBlock(BLOCKS, at(2026, 9, 21, 0, 0))?.id).toBe("b2");
    expect(findCurrentBlock(BLOCKS, at(2026, 10, 18, 23, 59))?.id).toBe("b2");
    expect(findCurrentBlock(BLOCKS, at(2026, 9, 20, 23, 59))?.id).toBe("b1");
  });

  it("restituisce null prima dell'inizio, a percorso finito e senza blocchi", () => {
    expect(findCurrentBlock(BLOCKS, at(2026, 8, 1))).toBeNull();
    expect(findCurrentBlock(BLOCKS, at(2026, 12, 1))).toBeNull();
    expect(findCurrentBlock([], at(2026, 9, 25))).toBeNull();
  });

  it("a parità vince il sequence_order più basso", () => {
    const overlapping = [
      { id: "dopo", sequence_order: 5, start_date: "2026-09-21", end_date: "2026-10-18" },
      { id: "prima", sequence_order: 4, start_date: "2026-09-14", end_date: "2026-10-11" },
    ];
    expect(findCurrentBlock(overlapping, at(2026, 9, 25))?.id).toBe("prima");
  });
});

describe("resolveCurrentBlock", () => {
  it("preferisce il blocco in corso", () => {
    expect(resolveCurrentBlock(BLOCKS, at(2026, 9, 25))?.id).toBe("b2");
  });

  it("prima dell'inizio del percorso restituisce il primo blocco", () => {
    expect(resolveCurrentBlock(BLOCKS, at(2026, 8, 1))?.id).toBe("b1");
  });

  it("tra due blocchi non contigui restituisce il prossimo", () => {
    const withGap = [
      { id: "a", sequence_order: 1, start_date: "2026-08-24", end_date: "2026-09-20" },
      { id: "b", sequence_order: 2, start_date: "2026-09-28", end_date: "2026-10-25" },
    ];
    expect(resolveCurrentBlock(withGap, at(2026, 9, 25))?.id).toBe("b");
  });

  it("a percorso finito restituisce l'ultimo blocco", () => {
    expect(resolveCurrentBlock(BLOCKS, at(2026, 12, 1))?.id).toBe("b3");
  });

  it("restituisce null senza blocchi", () => {
    expect(resolveCurrentBlock([], at(2026, 9, 25))).toBeNull();
  });
});
