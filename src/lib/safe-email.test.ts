// L'email dell'invito (passata 09 del lato cliente): la regola del server,
// gcalCreate, e dei testi che promettono l'invito.

import { describe, expect, it } from "vitest";
import { inviteEmail, isSafeEmail } from "@/lib/safe-email";

describe("isSafeEmail", () => {
  it("un indirizzo comune passa; spazi, virgolette, a capo e la lunghezza no", () => {
    expect(isSafeEmail("giulia.b@email.it")).toBe(true);
    expect(isSafeEmail(" giulia.b@email.it")).toBe(false);
    expect(isSafeEmail("giulia b@email.it")).toBe(false);
    expect(isSafeEmail('"giulia"@email.it')).toBe(false);
    expect(isSafeEmail("giulia@email.it\nBcc: x@y.it")).toBe(false);
    expect(isSafeEmail("giulia@email")).toBe(false);
    expect(isSafeEmail("")).toBe(false);
    // 254 caratteri passano, 255 no (RFC 5321).
    expect(isSafeEmail(`${"a".repeat(245)}@email.it`)).toBe(true);
    expect(isSafeEmail(`${"a".repeat(246)}@email.it`)).toBe(false);
  });
});

describe("inviteEmail", () => {
  it("toglie gli spazi ai lati, poi la stessa regola", () => {
    expect(inviteEmail(" giulia.b@email.it ")).toBe("giulia.b@email.it");
    expect(inviteEmail("giulia b@email.it")).toBeNull();
    expect(inviteEmail("   ")).toBeNull();
    expect(inviteEmail(null)).toBeNull();
    expect(inviteEmail(undefined)).toBeNull();
  });
});
