import { describe, expect, it } from "vitest";
import { countToAssign, formatToAssign, isToAssign } from "@/lib/to-assign";

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

describe("formatToAssign", () => {
  it.each([
    [1, "1 evento da assegnare"],
    [3, "3 eventi da assegnare"],
    [12, "12 eventi da assegnare"],
  ])("%i → «%s»", (n, label) => {
    expect(formatToAssign(n)).toBe(label);
  });
});
