// Le notifiche sul telefono (passata 08 del lato cliente): l'iscrizione e le
// notifiche per persona (isPushEnabledFor, forgetPushForUser), con un Supabase
// finto e un browser finto (il service worker, le sue registrazioni,
// l'iscrizione), perché il modulo parla con tutti e due.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface Call {
  op: string;
  filters: [string, string][];
}
const calls: Call[] = [];
let selectResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };
let deleteHangs = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { op: "", filters: [] };
      const chain = {
        select: () => {
          call.op = `select:${table}`;
          return chain;
        },
        delete: () => {
          call.op = `delete:${table}`;
          calls.push(call);
          return chain;
        },
        eq: (column: string, value: string) => {
          call.filters.push([column, value]);
          return chain;
        },
        limit: async () => {
          calls.push(call);
          return selectResult;
        },
        upsert: async (row: unknown, opts: unknown) => {
          call.op = `upsert:${table}`;
          call.filters.push(["row", JSON.stringify(row)], ["opts", JSON.stringify(opts)]);
          calls.push(call);
          return { error: null };
        },
        // La cancellazione si aspetta col then della catena; con la rete ferma non risponde mai.
        then: (resolve: (v: { error: null }) => void) => {
          if (!deleteHangs) resolve({ error: null });
        },
      };
      return chain;
    },
  },
}));

import { forgetPushForUser, isPushEnabledFor, subscribeToPush } from "@/lib/push";

const ENDPOINT = "https://push.esempio.test/abc";
const SUBSCRIPTION = {
  endpoint: ENDPOINT,
  toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: "chiave", auth: "segreto" } }),
};
const ROW_FILTERS: [string, string][] = [
  ["profile_id", "u1"],
  ["endpoint", ENDPOINT],
];

/** Un dispositivo col service worker registrato, iscritto o no. */
function device(sub: { endpoint: string } | null) {
  vi.stubGlobal("window", { PushManager: {}, Notification: {} });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }),
    },
  });
}

beforeEach(() => {
  calls.length = 0;
  selectResult = { data: [], error: null };
  deleteHangs = false;
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

describe("isPushEnabledFor · attive per chi è entrato, su questo dispositivo", () => {
  it("senza iscrizione del dispositivo: no, e niente lettura", async () => {
    device(null);
    expect(await isPushEnabledFor("u1")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("con l'iscrizione e la riga di questa persona: sì, letta per persona e dispositivo", async () => {
    device({ endpoint: ENDPOINT });
    selectResult = { data: [{ id: "r1" }], error: null };
    expect(await isPushEnabledFor("u1")).toBe(true);
    expect(calls).toEqual([{ op: "select:push_subscriptions", filters: ROW_FILTERS }]);
  });

  it("con l'iscrizione ma senza la riga (di un'altra persona, o scrittura fallita): no", async () => {
    device({ endpoint: ENDPOINT });
    expect(await isPushEnabledFor("u1")).toBe(false);
    expect(calls).toEqual([{ op: "select:push_subscriptions", filters: ROW_FILTERS }]);
  });

  it("se la lettura fallisce vale l'iscrizione, come prima", async () => {
    device({ endpoint: ENDPOINT });
    selectResult = { data: null, error: { message: "rete" } };
    expect(await isPushEnabledFor("u1")).toBe(true);
  });
});

describe("forgetPushForUser · all'uscita", () => {
  it("toglie la riga di questa persona per questo dispositivo", async () => {
    device({ endpoint: ENDPOINT });
    await forgetPushForUser("u1");
    expect(calls).toEqual([{ op: "delete:push_subscriptions", filters: ROW_FILTERS }]);
  });

  it("senza iscrizione non scrive niente", async () => {
    device(null);
    await forgetPushForUser("u1");
    expect(calls).toEqual([]);
  });

  it("senza push nel browser non scrive niente e non lancia", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    await expect(forgetPushForUser("u1")).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("con la rete ferma non blocca l'uscita: al più 3 secondi", async () => {
    vi.useFakeTimers();
    device({ endpoint: ENDPOINT });
    deleteHangs = true;
    let done = false;
    const p = forgetPushForUser("u1").then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(["delete:push_subscriptions"]);
  });
});
