import { describe, expect, it } from "vitest";
import { countToAssign, formatToAssign, isToAssign, listToAssign } from "@/lib/to-assign";

const googleEvent = { client_id: null, is_personal: false, status: "scheduled" as const };

describe("isToAssign", () => {
  it("evento Google senza cliente → da assegnare", () => {
    expect(isToAssign(googleEvent)).toBe(true);
  });

  it("sessione con cliente, impegno personale o evento annullato → no", () => {
    expect(isToAssign({ ...googleEvent, client_id: "c1" })).toBe(false);
    expect(isToAssign({ ...googleEvent, is_personal: true })).toBe(false);
    expect(isToAssign({ ...googleEvent, status: "cancelled" })).toBe(false);
  });
});

describe("countToAssign", () => {
  it("conta solo gli eventi da assegnare", () => {
    expect(
      countToAssign([
        googleEvent,
        googleEvent,
        { ...googleEvent, client_id: "c1" },
        { ...googleEvent, status: "cancelled" },
      ]),
    ).toBe(2);
  });

  it("0 finché i dati non ci sono", () => {
    expect(countToAssign(undefined)).toBe(0);
    expect(countToAssign([])).toBe(0);
  });
});

describe("listToAssign (card «Da assegnare» della Panoramica)", () => {
  const event = (id: string, when: string, over: Record<string, unknown> = {}) => ({
    ...googleEvent,
    id,
    scheduled_at: new Date(when).toISOString(),
    ...over,
  });
  // 6 eventi da assegnare, uno già svolto e uno passato con assenza, più
  // quattro righe che non lo sono.
  const bookings = [
    event("e6", "2026-10-02T09:00:00+02:00"),
    event("e1", "2026-09-20T08:00:00+02:00", { status: "completed" }),
    event("x1", "2026-09-26T08:00:00+02:00", { client_id: "c1" }),
    event("e4", "2026-09-29T17:30:00+02:00"),
    event("e2", "2026-09-22T18:00:00+02:00", { status: "no_show" }),
    event("x2", "2026-09-27T08:00:00+02:00", { is_personal: true }),
    event("e5", "2026-09-30T07:00:00+02:00"),
    event("x3", "2026-09-28T08:00:00+02:00", { status: "cancelled" }),
    event("e3", "2026-09-28T08:00:00+02:00"),
    event("x4", "2026-09-28T09:00:00+02:00", { client_id: "c2" }),
  ];

  it("con 6 eventi la card ne elenca 6: lo stesso numero del badge", () => {
    const list = listToAssign(bookings);
    expect(list).toHaveLength(6);
    expect(list.length).toBe(countToAssign(bookings));
  });

  it("in ordine di data, dal più vecchio", () => {
    expect(listToAssign(bookings).map((b) => b.id)).toEqual(["e1", "e2", "e3", "e4", "e5", "e6"]);
  });

  it("vuota finché i dati non ci sono", () => {
    expect(listToAssign(undefined)).toEqual([]);
  });
});

describe("formatToAssign", () => {
  it.each([
    [1, "1 evento da assegnare"],
    [3, "3 eventi da assegnare"],
    [12, "12 eventi da assegnare"],
  ])("%i → «%s»", (n, label) => {
    expect(formatToAssign(n)).toBe(label);
  });
});
