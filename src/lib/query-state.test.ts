// Le tre regole delle letture (passata 05), sulle forme che TanStack Query v5
// dà a una useQuery: primo caricamento, errore, rilettura dopo «Riprova».

import { describe, expect, it } from "vitest";
import { arrivedRead, failedRead, lostRead, type ReadState } from "@/lib/query-state";

const read = (over: Partial<ReadState>): ReadState => ({
  data: undefined,
  isError: false,
  errorUpdateCount: 0,
  fetchStatus: "idle",
  ...over,
});

/** [persa, fallita, arrivata] */
const verdict = (q: ReadState) => [lostRead(q), failedRead(q), arrivedRead(q)];

describe("lostRead, failedRead, arrivedRead", () => {
  it("senza dati e in errore, ferma: persa, fallita, arrivata", () => {
    expect(verdict(read({ isError: true, errorUpdateCount: 1 }))).toEqual([true, true, true]);
  });

  it("senza dati, riletta dopo un errore («Riprova»): resta persa, fallita e arrivata", () => {
    const retrying = read({ errorUpdateCount: 1, fetchStatus: "fetching" });
    expect(verdict(retrying)).toEqual([true, true, true]);
    // Senza rete la rilettura resta in pausa: lo stesso.
    expect(verdict({ ...retrying, fetchStatus: "paused" })).toEqual([true, true, true]);
  });

  it("il primo caricamento: né persa, né fallita, né arrivata", () => {
    expect(verdict(read({ fetchStatus: "fetching" }))).toEqual([false, false, false]);
  });

  it("coi dati di prima e in errore: non persa, ma fallita e arrivata", () => {
    const stale = read({ data: [], isError: true, errorUpdateCount: 2 });
    expect(verdict(stale)).toEqual([false, true, true]);
  });

  it("coi dati e senza errore: arrivata, e basta", () => {
    expect(verdict(read({ data: [] }))).toEqual([false, false, true]);
    expect(verdict(read({ data: null, fetchStatus: "fetching" }))).toEqual([false, false, true]);
  });
});
