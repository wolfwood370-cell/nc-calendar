// Le notifiche sul telefono (passata 08 del lato cliente): l'iscrizione, con
// un Supabase finto e un browser finto (il service worker, le sue
// registrazioni, l'iscrizione), perché il modulo parla con tutti e due.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Call {
  op: string;
  filters: [string, string][];
}
const calls: Call[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { op: "", filters: [] };
      const chain = {
        upsert: async (row: unknown, opts: unknown) => {
          call.op = `upsert:${table}`;
          call.filters.push(["row", JSON.stringify(row)], ["opts", JSON.stringify(opts)]);
          calls.push(call);
          return { error: null };
        },
      };
      return chain;
    },
  },
}));

import { subscribeToPush } from "@/lib/push";

const ENDPOINT = "https://push.esempio.test/abc";
const SUBSCRIPTION = {
  endpoint: ENDPOINT,
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "chiave", auth: "segreto" } }),
};

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("subscribeToPush · aspetta il service worker attivo", () => {
  /** Il browser: `ready` dà la registrazione attiva, getRegistration() anche una in installazione. */
  function browser(ready: Promise<unknown>, registration: unknown) {
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("Notification", { requestPermission: async () => "granted" });
    vi.stubGlobal("atob", (s: string) => Buffer.from(s, "base64").toString("binary"));
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: async () => registration, ready },
    });
  }

  it("iscrive con la registrazione di ready, non con quella ancora in installazione", async () => {
    const used: string[] = [];
    const active = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => {
          used.push("attiva");
          return SUBSCRIPTION;
        },
      },
    };
    const installing = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => {
          used.push("in installazione");
          throw new Error("Subscribing for push requires an active service worker");
        },
      },
    };
    browser(Promise.resolve(active), installing);
    const sub = await subscribeToPush("u1");
    expect(sub).toBe(SUBSCRIPTION);
    expect(used).toEqual(["attiva"]);
    expect(calls).toEqual([
      {
        op: "upsert:push_subscriptions",
        filters: [
          ["row", JSON.stringify({ profile_id: "u1", subscription: SUBSCRIPTION.toJSON() })],
          ["opts", JSON.stringify({ onConflict: "profile_id,endpoint" })],
        ],
      },
    ]);
  });

  it("senza un service worker attivo entro 10 secondi: «Service worker non disponibile», e nessuna scrittura", async () => {
    vi.useFakeTimers();
    browser(new Promise(() => {}), null);
    let message: string | null = null;
    const p = subscribeToPush("u1").catch((e: Error) => (message = e.message));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(message).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(message).toBe("Service worker non disponibile");
    expect(calls).toEqual([]);
  });

  it("col permesso negato si ferma prima del service worker", async () => {
    browser(Promise.resolve(null), null);
    vi.stubGlobal("Notification", { requestPermission: async () => "denied" });
    await expect(subscribeToPush("u1")).rejects.toThrow("Permesso negato");
    expect(calls).toEqual([]);
  });
});
