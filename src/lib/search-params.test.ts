import { describe, expect, it } from "vitest";
import { isoDateParam, uuidParam } from "@/lib/search-params";

describe("uuidParam", () => {
  it("accetta un UUID", () => {
    const id = "3f2b8c1e-9a4d-4e2f-8b1a-2c3d4e5f6a7b";
    expect(uuidParam(id)).toBe(id);
  });

  it.each([["b21"], [""], [123], [null], [undefined]])("scarta %j", (value) => {
    expect(uuidParam(value)).toBeUndefined();
  });
});

describe("isoDateParam", () => {
  it("accetta una data YYYY-MM-DD", () => {
    expect(isoDateParam("2026-09-30")).toBe("2026-09-30");
  });

  it.each([["2026-02-31"], ["2026-9-30"], ["30/09/2026"], ["2026-09-30T10:00"], [20260930]])(
    "scarta %j",
    (value) => {
      expect(isoDateParam(value)).toBeUndefined();
    },
  );
});
