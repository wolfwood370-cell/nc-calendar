import { describe, expect, it } from "vitest";
import { signOutChecked, type SignOutApi } from "@/lib/sign-out";

function fakeAuth(how: "ok" | "error" | "throw") {
  let calls = 0;
  const api: SignOutApi = {
    async signOut() {
      calls += 1;
      if (how === "throw") throw new Error("rete");
      return { error: how === "ok" ? null : new Error("rifiutato") };
    },
  };
  return { api, calls: () => calls };
}

describe("l'uscita dice se è riuscita (passata 11)", () => {
  it("riuscita: true, una chiamata", async () => {
    const { api, calls } = fakeAuth("ok");
    expect(await signOutChecked(api)).toBe(true);
    expect(calls()).toBe(1);
  });

  it("il server non risponde o rifiuta: false, e non lancia", async () => {
    for (const how of ["error", "throw"] as const) {
      await expect(signOutChecked(fakeAuth(how).api)).resolves.toBe(false);
    }
  });
});
