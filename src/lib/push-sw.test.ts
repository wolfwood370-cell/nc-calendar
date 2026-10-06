// Il service worker delle notifiche, public/push-sw.js (passata 08 del lato
// cliente). Il file non è un modulo: si legge e si esegue in un contesto di
// node:vm con un `self` finto, e si chiamano i suoi ascoltatori come farebbe
// il browser.

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync("public/push-sw.js", "utf8");
const ORIGIN = "https://nc-calendar.lovable.app";

interface FakeWindow {
  url: string;
  /** Le chiamate nell'ordine in cui arrivano: "focus" e "navigate". */
  calls: string[];
  focused: number;
  navigatedTo: string[];
  focus: () => Promise<FakeWindow>;
  navigate: (url: string) => Promise<FakeWindow | null>;
}

/**
 * Una finestra dell'app. `focusDenied`: il fuoco rifiuta, come il browser
 * fuori dal tempo concesso dopo il tocco; `uncontrolled`: navigate lancia,
 * come per una finestra che il service worker non controlla; `lands: false`:
 * navigate finisce senza una finestra.
 */
function fakeWindow(
  url: string,
  opts: { focusDenied?: boolean; uncontrolled?: boolean; lands?: boolean } = {},
): FakeWindow {
  const w: FakeWindow = {
    url,
    calls: [],
    focused: 0,
    navigatedTo: [],
    focus: async () => {
      w.calls.push("focus");
      if (opts.focusDenied) throw new Error("Not allowed to focus a window.");
      w.focused += 1;
      return w;
    },
    navigate: async (to: string) => {
      w.calls.push("navigate");
      if (opts.uncontrolled)
        throw new TypeError("This service worker is not the client's active service worker.");
      if (opts.lands === false) return null;
      w.navigatedTo.push(to);
      w.url = to;
      return w;
    },
  };
  return w;
}

function load(windows: FakeWindow[]) {
  const handlers: Record<string, (event: unknown) => void> = {};
  const opened: string[] = [];
  const shown: { title: string; options: unknown }[] = [];
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      handlers[type] = fn;
    },
    registration: {
      showNotification: async (title: string, options: unknown) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => windows,
      // Come il browser: un indirizzo relativo si risolve sull'origine del service worker.
      openWindow: async (url: string) => {
        opened.push(new URL(url, ORIGIN).href);
        return null;
      },
    },
  };
  runInNewContext(SOURCE, { self, URL });
  return { handlers, opened, shown };
}

async function tap(windows: FakeWindow[], data: unknown) {
  const sw = load(windows);
  let closed = false;
  let work: Promise<unknown> = Promise.resolve();
  sw.handlers.notificationclick!({
    notification: { data, close: () => (closed = true) },
    waitUntil: (p: Promise<unknown>) => (work = p),
  });
  await work;
  return { opened: sw.opened, closed };
}

describe("push-sw.js · il tocco su una notifica", () => {
  it("con l'app aperta altrove, la porta alla pagina della notifica e le dà il fuoco", async () => {
    const w = fakeWindow(`${ORIGIN}/client`);
    const r = await tap([w], { url: "/client/bookings/b1" });
    expect(r.closed).toBe(true);
    expect(w.navigatedTo).toEqual([`${ORIGIN}/client/bookings/b1`]);
    expect(w.focused).toBe(1);
    expect(r.opened).toEqual([]);
  });

  it("prima il fuoco, poi la pagina: il fuoco è concesso solo per poco dopo il tocco", async () => {
    const w = fakeWindow(`${ORIGIN}/client`);
    await tap([w], { url: "/client/bookings/b1" });
    expect(w.calls).toEqual(["focus", "navigate"]);
  });

  it("col fuoco negato la finestra va lo stesso alla pagina, e non se ne apre un'altra", async () => {
    const w = fakeWindow(`${ORIGIN}/client`, { focusDenied: true });
    const r = await tap([w], { url: "/client/bookings/b1" });
    expect(w.calls).toEqual(["focus", "navigate"]);
    expect(w.navigatedTo).toEqual([`${ORIGIN}/client/bookings/b1`]);
    expect(r.opened).toEqual([]);
  });

  it("con l'app già sulla pagina, solo il fuoco", async () => {
    const w = fakeWindow(`${ORIGIN}/client/notifications`);
    const r = await tap([w], { url: "/client/notifications" });
    expect(w.calls).toEqual(["focus"]);
    expect(r.opened).toEqual([]);
  });

  it("con l'app già sulla pagina, il fuoco e un messaggio con l'indirizzo, così l'agenda sceglie di nuovo il giorno (passata 11)", async () => {
    const url = `${ORIGIN}/trainer/calendar?date=2026-10-07&event=b1`;
    const w = fakeWindow(url) as FakeWindow & { postMessage: (m: unknown) => void };
    const sent: unknown[] = [];
    w.postMessage = (m: unknown) => {
      w.calls.push("postMessage");
      sent.push(m);
    };
    const r = await tap([w], { url: "/trainer/calendar?date=2026-10-07&event=b1" });
    expect(w.calls).toEqual(["focus", "postMessage"]);
    expect(sent).toEqual([{ type: "nc-notification-open", url }]);
    expect(w.navigatedTo).toEqual([]);
    expect(r.opened).toEqual([]);
  });

  it("una finestra che non si può spostare: si apre la pagina", async () => {
    const w = fakeWindow(`${ORIGIN}/client`, { uncontrolled: true });
    const r = await tap([w], { url: "/client/bookings/b1" });
    expect(w.navigatedTo).toEqual([]);
    expect(r.opened).toEqual([`${ORIGIN}/client/bookings/b1`]);
  });

  it("la prima finestra non si sposta, la seconda sì: niente finestra nuova", async () => {
    const stuck = fakeWindow(`${ORIGIN}/auth`, { uncontrolled: true });
    const app = fakeWindow(`${ORIGIN}/client`);
    const r = await tap([stuck, app], { url: "/client/bookings/b1" });
    expect(app.navigatedTo).toEqual([`${ORIGIN}/client/bookings/b1`]);
    expect(r.opened).toEqual([]);
  });

  it("navigate che finisce senza finestra: si apre la pagina", async () => {
    const w = fakeWindow(`${ORIGIN}/client`, { lands: false });
    const r = await tap([w], { url: "/client/bookings/b1" });
    expect(r.opened).toEqual([`${ORIGIN}/client/bookings/b1`]);
  });

  it("nessuna finestra: si apre la pagina", async () => {
    const r = await tap([], { url: "/client/bookings/b1" });
    expect(r.closed).toBe(true);
    expect(r.opened).toEqual([`${ORIGIN}/client/bookings/b1`]);
  });

  it("senza indirizzo, o con un indirizzo di un'altra origine, la Home", async () => {
    expect((await tap([], undefined)).opened).toEqual([`${ORIGIN}/`]);
    expect((await tap([], { url: "" })).opened).toEqual([`${ORIGIN}/`]);
    expect((await tap([], { url: 42 })).opened).toEqual([`${ORIGIN}/`]);
    expect((await tap([], { url: "https://esempio.it/x" })).opened).toEqual([`${ORIGIN}/`]);
    const w = fakeWindow(`${ORIGIN}/client`);
    await tap([w], { url: "https://esempio.it/x" });
    expect(w.navigatedTo).toEqual([`${ORIGIN}/`]);
  });

  it("un indirizzo completo della stessa origine vale come quello relativo", async () => {
    const r = await tap([], { url: `${ORIGIN}/client/bookings/b1` });
    expect(r.opened).toEqual([`${ORIGIN}/client/bookings/b1`]);
  });
});

describe("push-sw.js · l'arrivo di una push", () => {
  it("mostra la notifica col titolo, il testo, l'icona e l'indirizzo", async () => {
    const sw = load([]);
    let work: Promise<unknown> = Promise.resolve();
    sw.handlers.push!({
      data: {
        json: () => ({
          title: "Sessione confermata",
          body: "Personal Training · mercoledì 30 settembre alle 10:00",
          url: "/client/bookings/b1",
        }),
      },
      waitUntil: (p: Promise<unknown>) => (work = p),
    });
    await work;
    expect(sw.shown).toEqual([
      {
        title: "Sessione confermata",
        options: {
          body: "Personal Training · mercoledì 30 settembre alle 10:00",
          icon: "/favicon.png",
          badge: "/favicon.png",
          data: { url: "/client/bookings/b1" },
        },
      },
    ]);
  });
});
