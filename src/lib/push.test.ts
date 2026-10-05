// Le notifiche sul telefono (passata 08 del lato cliente): l'iscrizione e le
// notifiche per persona (isPushEnabledFor, forgetPushForUser), con un Supabase
// finto e un browser finto (il service worker, le sue registrazioni,
// l'iscrizione), perché il modulo parla con tutti e due. Dalla 09 anche la
// chiave nuova, l'iscrizione che si rifà quando la chiave cambia e il telefono
// liberato a un'uscita che nessuno ha chiesto.

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

import {
  LEAVING_KEY,
  VAPID_PUBLIC_KEY,
  forgetPushForUser,
  isPushEnabledFor,
  leftOnPurposeRecently,
  markLeaving,
  readLeaving,
  releasePushDevice,
  shouldReleaseOnAuthEvent,
  subscribeToPush,
  subscriptionKeyMatches,
} from "@/lib/push";

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

// ---------------------------------------------------------------------------
// Passata 09: la chiave nuova, l'iscrizione che si rifà quando la chiave
// cambia, il telefono liberato quando la sessione finisce senza che nessuno
// l'abbia chiesto.
// ---------------------------------------------------------------------------

// La chiave pubblica fino alla 08: con la privata salvata nei segreti Apple
// rifiutava ogni notifica (403). La chiave di oggi qui non si scrive: il test
// resta vero anche se un giorno la coppia si rigenera.
const OLD_KEY =
  "BBs68P5VeBxnTmlUz0mkMNJuLe7zMBoptyunIoghZhFpcCvgAV7lh1ydN4f0XJhDRnT5E4lzP0aV_Ac7umIi_R0";
const OLD_ENDPOINT = "https://push.esempio.test/vecchio";
const bytesOf = (key: string) => new Uint8Array(Buffer.from(key, "base64url"));
const bufferOf = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** Un'iscrizione del browser nata con la chiave `key` (null: il browser non la dice; undefined: niente options). */
function keyed(endpoint: string, key: Uint8Array | null | undefined, log: string[] = []) {
  return {
    endpoint,
    options:
      key === undefined
        ? undefined
        : { userVisibleOnly: true, applicationServerKey: key === null ? null : bufferOf(key) },
    toJSON: () => ({ endpoint, keys: { p256dh: "chiave", auth: "segreto" } }),
    unsubscribe: async () => {
      log.push(`unsubscribe:${endpoint}`);
      return true;
    },
  } as unknown as PushSubscription;
}

describe("la chiave pubblica VAPID", () => {
  it("è una chiave P-256 non compressa, diversa da quella di prima", () => {
    const key = bytesOf(VAPID_PUBLIC_KEY);
    expect(VAPID_PUBLIC_KEY).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(key).toHaveLength(65);
    expect(key[0]).toBe(4);
    expect(VAPID_PUBLIC_KEY).not.toBe(OLD_KEY);
  });
});

describe("subscriptionKeyMatches · l'iscrizione è nata con la chiave di oggi?", () => {
  it("sì con la chiave di oggi; no con quella di prima o con una più corta; null se il browser non la dice", () => {
    expect(subscriptionKeyMatches(keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY)))).toBe(true);
    expect(subscriptionKeyMatches(keyed(ENDPOINT, bytesOf(OLD_KEY)))).toBe(false);
    expect(subscriptionKeyMatches(keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY).slice(0, 64)))).toBe(
      false,
    );
    expect(subscriptionKeyMatches(keyed(ENDPOINT, null))).toBeNull();
    expect(subscriptionKeyMatches(keyed(ENDPOINT, undefined))).toBeNull();
  });
});

describe("subscribeToPush · un'iscrizione con un'altra chiave si rifà", () => {
  /**
   * Il browser con un'iscrizione che c'è già (`existing`) e quella che
   * subscribe() crea (`made`). Ogni passo del browser segna anche quante
   * scritture su Supabase c'erano già: l'iscrizione si toglie e si rifà prima
   * della riga nuova.
   */
  function browserWith(existing: PushSubscription | null, made: PushSubscription, log: string[]) {
    const reg = {
      pushManager: {
        getSubscription: async () => existing,
        subscribe: async (opts: { applicationServerKey: ArrayBuffer }) => {
          const same = subscriptionKeyMatches({
            options: { userVisibleOnly: true, applicationServerKey: opts.applicationServerKey },
          });
          log.push(
            `${same ? "subscribe:chiave di oggi" : "subscribe:altra chiave"} (scritture ${calls.length})`,
          );
          return made;
        },
      },
    };
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("Notification", { requestPermission: async () => "granted" });
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg) },
    });
  }
  const upsertOf = (sub: PushSubscription) => ({
    op: "upsert:push_subscriptions",
    filters: [
      ["row", JSON.stringify({ profile_id: "u1", subscription: sub.toJSON() })],
      ["opts", JSON.stringify({ onConflict: "profile_id,endpoint" })],
    ],
  });

  it("con la chiave di prima: la toglie, si iscrive con quella di oggi, scrive la riga nuova e toglie quella vecchia", async () => {
    const log: string[] = [];
    const fresh = keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY), log);
    browserWith(keyed(OLD_ENDPOINT, bytesOf(OLD_KEY), log), fresh, log);
    expect(await subscribeToPush("u1")).toBe(fresh);
    expect(log).toEqual([`unsubscribe:${OLD_ENDPOINT}`, "subscribe:chiave di oggi (scritture 0)"]);
    expect(calls).toEqual([
      upsertOf(fresh),
      {
        op: "delete:push_subscriptions",
        filters: [
          ["profile_id", "u1"],
          ["endpoint", OLD_ENDPOINT],
        ],
      },
    ]);
  });

  it("con la chiave di oggi: la riusa, e non toglie niente", async () => {
    const log: string[] = [];
    const current = keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY), log);
    browserWith(
      current,
      keyed("https://push.esempio.test/altro", bytesOf(VAPID_PUBLIC_KEY), log),
      log,
    );
    expect(await subscribeToPush("u1")).toBe(current);
    expect(log).toEqual([]);
    expect(calls).toEqual([upsertOf(current)]);
  });

  it("se il browser non dice la chiave: si iscrive di nuovo, e con lo stesso endpoint non toglie righe", async () => {
    const log: string[] = [];
    const fresh = keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY), log);
    browserWith(keyed(ENDPOINT, null, log), fresh, log);
    expect(await subscribeToPush("u1")).toBe(fresh);
    expect(log).toEqual([`unsubscribe:${ENDPOINT}`, "subscribe:chiave di oggi (scritture 0)"]);
    expect(calls).toEqual([upsertOf(fresh)]);
  });
});

describe("isPushEnabledFor · la chiave dell'iscrizione", () => {
  it("con un'iscrizione nata con la chiave di prima: no, e niente lettura", async () => {
    device(keyed(ENDPOINT, bytesOf(OLD_KEY)));
    expect(await isPushEnabledFor("u1")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("con la chiave di oggi e la riga di questa persona: sì", async () => {
    device(keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY)));
    selectResult = { data: [{ id: "r1" }], error: null };
    expect(await isPushEnabledFor("u1")).toBe(true);
    expect(calls).toEqual([{ op: "select:push_subscriptions", filters: ROW_FILTERS }]);
  });
});

describe("shouldReleaseOnAuthEvent · solo l'uscita che nessuno ha chiesto", () => {
  it.each([
    ["SIGNED_OUT", false, true],
    ["SIGNED_OUT", true, false],
    ["TOKEN_REFRESHED", false, false],
    ["SIGNED_IN", false, false],
    ["INITIAL_SESSION", false, false],
    ["USER_UPDATED", false, false],
    ["PASSWORD_RECOVERY", false, false],
  ] as const)("%s, uscita chiesta %s: %s", (event, onPurpose, want) => {
    expect(shouldReleaseOnAuthEvent(event, onPurpose)).toBe(want);
  });
});

describe("releasePushDevice · libera il telefono", () => {
  it("toglie l'iscrizione del browser e non scrive sul server", async () => {
    const log: string[] = [];
    device(keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY), log));
    await releasePushDevice();
    expect(log).toEqual([`unsubscribe:${ENDPOINT}`]);
    expect(calls).toEqual([]);
  });

  it("un errore non esce, e senza push nel browser non fa niente", async () => {
    const failing = {
      ...keyed(ENDPOINT, bytesOf(VAPID_PUBLIC_KEY)),
      unsubscribe: async () => {
        throw new Error("rete");
      },
    };
    device(failing);
    await expect(releasePushDevice()).resolves.toBeUndefined();
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    await expect(releasePushDevice()).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });
});

describe("il segno dell'uscita chiesta, letto anche dalle altre schede", () => {
  it("leftOnPurposeRecently: vale per dieci secondi dal segno, e solo per un istante già passato", () => {
    const now = 1_000_000;
    expect(leftOnPurposeRecently(String(now - 5_000), now)).toBe(true);
    expect(leftOnPurposeRecently(String(now), now)).toBe(true);
    expect(leftOnPurposeRecently(String(now - 10_000), now)).toBe(false);
    expect(leftOnPurposeRecently(String(now + 1_000), now)).toBe(false);
    expect(leftOnPurposeRecently(null, now)).toBe(false);
    expect(leftOnPurposeRecently("abc", now)).toBe(false);
  });

  it("markLeaving scrive l'istante e readLeaving lo legge; con lo storage negato nessuno dei due lancia", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (k: string, v: string) => store.set(k, v),
      getItem: (k: string) => store.get(k) ?? null,
    });
    markLeaving(1234);
    expect(store.get(LEAVING_KEY)).toBe("1234");
    expect(readLeaving()).toBe("1234");
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("negato");
      },
      getItem: () => {
        throw new Error("negato");
      },
    });
    expect(() => markLeaving()).not.toThrow();
    expect(readLeaving()).toBeNull();
  });
});
