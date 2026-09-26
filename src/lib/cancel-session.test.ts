import { describe, expect, it } from "vitest";
import {
  CreditUnavailableError,
  SessionChangedError,
  asksCreditChoice,
  getCancelTiming,
  holdsCredit,
  removeSession,
  restoreSession,
  type CreditRef,
  type SessionStore,
  type StoredSession,
} from "@/lib/cancel-session";
import type { OrderedAllocation, OrderedExtraCredit } from "@/lib/credit-order";

// Ora dei dati di esempio dell'handoff: 25/09/2026 alle 10:40 (Roma, UTC+2).
const NOW = new Date("2026-09-25T08:40:00Z");
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const COACH = "coach";
const CLIENT = "andrea";

// Blocco in corso: dal 21/09 al 18/10, una allocazione PT per settimana.
const BLOCK_START = "2026-09-21";
const weekly = (week: number, over: Partial<OrderedAllocation> = {}): OrderedAllocation => ({
  id: `pt-sett-${week}`,
  block_id: "blocco-3",
  event_type_id: "pt",
  session_type: "PT Session",
  week_number: week,
  quantity_assigned: 2,
  quantity_booked: 1,
  valid_until: null,
  created_at: `2026-09-2${week}T09:00:00Z`,
  ...over,
});

const session = (over: Partial<StoredSession> = {}): StoredSession => ({
  id: "s1",
  status: "scheduled",
  deleted_at: null,
  client_id: CLIENT,
  coach_id: COACH,
  is_personal: false,
  block_id: "blocco-3",
  event_type_id: "pt",
  session_type: "PT Session",
  scheduled_at: hoursFromNow(25),
  google_event_id: "g-old",
  ...over,
});

type ExtraRow = OrderedExtraCredit & { client_id: string };

/** Archivio in memoria con le stesse regole dello store Supabase. */
function memoryStore(init: {
  sessions: StoredSession[];
  allocations?: OrderedAllocation[];
  extras?: ExtraRow[];
  googleEvents?: string[];
  googleDown?: boolean;
}) {
  const sessions = new Map(init.sessions.map((s) => [s.id, { ...s }]));
  const allocations = new Map((init.allocations ?? []).map((a) => [a.id, { ...a }]));
  const extras = new Map((init.extras ?? []).map((e) => [e.id, { ...e }]));
  const google = new Set(init.googleEvents ?? ["g-old"]);
  let created = 0;
  const booked = (ref: CreditRef) =>
    ref.kind === "allocation"
      ? allocations.get(ref.id)?.quantity_booked
      : extras.get(ref.id)?.quantity_booked;

  const store: SessionStore = {
    async getSession(id) {
      const s = sessions.get(id);
      return s ? { ...s } : null;
    },
    async updateSession(id, expected, patch) {
      const s = sessions.get(id);
      if (!s || s.status !== expected.status || (s.deleted_at !== null) !== expected.deleted) {
        return false;
      }
      Object.assign(s, patch);
      return true;
    },
    async listAllocations(blockId) {
      return [...allocations.values()].filter((a) => a.block_id === blockId).map((a) => ({ ...a }));
    },
    async getBlockStart(blockId) {
      return blockId === "blocco-3" ? BLOCK_START : null;
    },
    async listExtraCredits(clientId, eventTypeId) {
      return [...extras.values()]
        .filter((e) => e.client_id === clientId && e.event_type_id === eventTypeId)
        .map((e) => ({ ...e }));
    },
    async moveCredit(ref, delta) {
      const row = ref.kind === "allocation" ? allocations.get(ref.id) : extras.get(ref.id);
      if (!row) return false;
      const cap = "quantity_assigned" in row ? row.quantity_assigned : row.quantity;
      const next = row.quantity_booked + delta;
      if (next < 0 || next > cap) return false;
      row.quantity_booked = next;
      return true;
    },
    async deleteGoogleEvent(id) {
      if (init.googleDown) return false;
      return google.delete(id);
    },
    async createGoogleEvent(sessionId) {
      if (init.googleDown) return false;
      const id = `g-new-${++created}`;
      google.add(id);
      sessions.get(sessionId)!.google_event_id = id;
      return true;
    },
  };
  return { store, sessions, allocations, extras, google, booked };
}

const fourWeeks = () => [1, 2, 3, 4].map((w) => weekly(w));

describe("getCancelTiming · la soglia delle 24 ore", () => {
  it.each([
    [25, "early", false],
    [24.02, "early", false],
    [24, "late", true],
    [23, "late", true],
    [0.5, "late", true],
    [0, "started", true],
    [-2, "started", true],
  ] as const)("a %s ore dall'inizio → %s (chiede: %s)", (hours, timing, asks) => {
    const t = getCancelTiming(hoursFromNow(hours), NOW);
    expect(t).toBe(timing);
    expect(asksCreditChoice(t)).toBe(asks);
  });
});

describe("removeSession · annulla", () => {
  it("25 ore: nessuna scelta, credito restituito anche se arriva «Addebita»", async () => {
    const db = memoryStore({ sessions: [session()], allocations: fourWeeks() });
    const r = await removeSession(db.store, {
      sessionId: "s1",
      removal: "cancel",
      choice: "charge",
      now: NOW,
    });
    expect(r.status).toBe("cancelled");
    expect(r.credit).toBe("refunded");
    // 26/09 è nella prima settimana del blocco.
    expect(r.refunded).toEqual({ kind: "allocation", id: "pt-sett-1" });
    expect(db.allocations.get("pt-sett-1")!.quantity_booked).toBe(0);
    const s = db.sessions.get("s1")!;
    expect(s.status).toBe("cancelled");
    expect(s.deleted_at).toBeNull();
    expect(db.google.has("g-old")).toBe(false);
    expect(r.googleEventDeleted).toBe(true);
  });

  it("23 ore e «Restituisci»: cancelled e credito restituito", async () => {
    const db = memoryStore({
      sessions: [session({ scheduled_at: hoursFromNow(23) })],
      allocations: fourWeeks(),
    });
    const r = await removeSession(db.store, {
      sessionId: "s1",
      removal: "cancel",
      choice: "refund",
      now: NOW,
    });
    expect(r.status).toBe("cancelled");
    expect(r.credit).toBe("refunded");
    expect(db.allocations.get("pt-sett-1")!.quantity_booked).toBe(0);
  });

  it("23 ore e «Addebita»: late_cancelled, il credito resta usato, l'evento Google si toglie", async () => {
    const db = memoryStore({
      sessions: [session({ scheduled_at: hoursFromNow(23) })],
      allocations: fourWeeks(),
    });
    const r = await removeSession(db.store, {
      sessionId: "s1",
      removal: "cancel",
      choice: "charge",
      now: NOW,
    });
    expect(r.status).toBe("late_cancelled");
    expect(r.credit).toBe("charged");
    expect(r.refunded).toBeNull();
    expect([...db.allocations.values()].map((a) => a.quantity_booked)).toEqual([1, 1, 1, 1]);
    expect(db.sessions.get("s1")!.deleted_at).toBeNull();
    expect(db.google.has("g-old")).toBe(false);
  });

  it("sessione già iniziata: la scelta vale come a 23 ore (predefinita «Restituisci»)", async () => {
    const db = memoryStore({
      sessions: [session({ scheduled_at: hoursFromNow(-1) })],
      allocations: fourWeeks(),
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    expect(r.status).toBe("cancelled");
    expect(r.credit).toBe("refunded");
  });

  it("stessa tipologia, due allocazioni: vince quella che scade prima", async () => {
    const db = memoryStore({
      sessions: [session()],
      allocations: [
        weekly(1, { id: "scade-20-ott", valid_until: "2026-10-20" }),
        weekly(1, {
          id: "scade-6-ott",
          valid_until: "2026-10-06",
          created_at: "2026-09-24T09:00:00Z",
        }),
      ],
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    expect(r.refunded).toEqual({ kind: "allocation", id: "scade-6-ott" });
    expect(db.allocations.get("scade-6-ott")!.quantity_booked).toBe(0);
    expect(db.allocations.get("scade-20-ott")!.quantity_booked).toBe(1);
  });

  it("prova rossa: con più settimane nello stesso blocco il credito torna alla settimana della sessione, non alla prima trovata", async () => {
    // Sessione di mercoledì 7 ottobre: terza settimana del blocco.
    const s = session({ scheduled_at: "2026-10-07T08:00:00Z" });
    const allocations = fourWeeks();
    // Il `find` di prima (saveBookingEdit) prendeva la prima allocazione del
    // blocco con la stessa tipologia e almeno un credito impegnato.
    const legacyFind = allocations.find(
      (a) =>
        a.block_id === s.block_id && a.event_type_id === s.event_type_id && a.quantity_booked > 0,
    );
    expect(legacyFind?.id).toBe("pt-sett-1");

    const db = memoryStore({ sessions: [s], allocations });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    expect(r.refunded).toEqual({ kind: "allocation", id: "pt-sett-3" });
    expect([...db.allocations.values()].map((a) => [a.id, a.quantity_booked])).toEqual([
      ["pt-sett-1", 1],
      ["pt-sett-2", 1],
      ["pt-sett-3", 0],
      ["pt-sett-4", 1],
    ]);
  });

  it("sessione senza blocco: il credito torna all'extra della tipologia che scade prima", async () => {
    const db = memoryStore({
      sessions: [session({ block_id: null })],
      extras: [
        {
          id: "extra-2100",
          client_id: CLIENT,
          event_type_id: "pt",
          quantity: 3,
          quantity_booked: 1,
          expires_at: "2100-01-01T00:00:00Z",
        },
        {
          id: "extra-2027",
          client_id: CLIENT,
          event_type_id: "pt",
          quantity: 3,
          quantity_booked: 2,
          expires_at: "2027-01-01T00:00:00Z",
        },
        {
          id: "extra-bia",
          client_id: CLIENT,
          event_type_id: "bia",
          quantity: 1,
          quantity_booked: 1,
          expires_at: "2026-10-01T00:00:00Z",
        },
      ],
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    expect(r.refunded).toEqual({ kind: "extra", id: "extra-2027" });
    expect(db.extras.get("extra-2027")!.quantity_booked).toBe(1);
    expect(db.extras.get("extra-2100")!.quantity_booked).toBe(1);
    expect(db.extras.get("extra-bia")!.quantity_booked).toBe(1);
  });

  it("nessun credito impegnato da restituire: annulla lo stesso e lo dice («none»)", async () => {
    const db = memoryStore({
      sessions: [session()],
      allocations: fourWeeks().map((a) => ({ ...a, quantity_booked: 0 })),
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    expect(r.status).toBe("cancelled");
    expect(r.credit).toBe("none");
    expect(r.refunded).toBeNull();
  });

  it("sessione già annullata: non tocca nulla", async () => {
    const db = memoryStore({
      sessions: [session({ status: "cancelled" })],
      allocations: fourWeeks(),
    });
    await expect(
      removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW }),
    ).rejects.toBeInstanceOf(SessionChangedError);
    expect([...db.allocations.values()].map((a) => a.quantity_booked)).toEqual([1, 1, 1, 1]);
    expect(db.google.has("g-old")).toBe(true);
  });

  it("sessione cambiata tra lettura e scrittura: non restituisce il credito e non tocca Google", async () => {
    const db = memoryStore({ sessions: [session()], allocations: fourWeeks() });
    const store: SessionStore = { ...db.store, updateSession: async () => false };
    await expect(
      removeSession(store, { sessionId: "s1", removal: "cancel", now: NOW }),
    ).rejects.toBeInstanceOf(SessionChangedError);
    expect([...db.allocations.values()].map((a) => a.quantity_booked)).toEqual([1, 1, 1, 1]);
    expect(db.google.has("g-old")).toBe(true);
  });

  it("Google non risponde: annulla lo stesso e lo segnala", async () => {
    const db = memoryStore({ sessions: [session()], allocations: fourWeeks(), googleDown: true });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    expect(r.status).toBe("cancelled");
    expect(r.googleEventDeleted).toBe(false);
  });
});

describe("removeSession · elimina", () => {
  it("sessione inserita per errore: deleted_at, credito restituito, evento tolto", async () => {
    const db = memoryStore({
      sessions: [session({ scheduled_at: hoursFromNow(3) })],
      allocations: fourWeeks(),
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "delete", now: NOW });
    expect(r.status).toBe("cancelled");
    expect(r.deletedAt).toBe(NOW.toISOString());
    expect(r.credit).toBe("refunded");
    expect(db.sessions.get("s1")!.deleted_at).toBe(NOW.toISOString());
    expect(db.google.has("g-old")).toBe(false);
  });

  it("sessione già annullata con credito restituito: il credito non torna due volte", async () => {
    const db = memoryStore({
      sessions: [session({ status: "cancelled" })],
      allocations: fourWeeks(),
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "delete", now: NOW });
    expect(r.credit).toBe("none");
    expect([...db.allocations.values()].map((a) => a.quantity_booked)).toEqual([1, 1, 1, 1]);
  });

  it("sessione annullata tardi (credito addebitato): eliminandola il credito torna", async () => {
    const db = memoryStore({
      sessions: [session({ status: "late_cancelled" })],
      allocations: fourWeeks(),
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "delete", now: NOW });
    expect(r.credit).toBe("refunded");
    expect(db.allocations.get("pt-sett-1")!.quantity_booked).toBe(0);
  });

  it("impegno personale: nessun credito", async () => {
    const db = memoryStore({
      sessions: [
        session({ client_id: null, is_personal: true, block_id: null, event_type_id: null }),
      ],
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "delete", now: NOW });
    expect(r.credit).toBe("none");
    expect(db.google.has("g-old")).toBe(false);
  });
});

describe("restoreSession · «Ripristina»", () => {
  it("dopo «Restituisci»: scheduled, stesso credito scalato di nuovo, evento Google ricreato con il nuovo id", async () => {
    const s = session({ scheduled_at: "2026-10-07T08:00:00Z" });
    const db = memoryStore({ sessions: [s], allocations: fourWeeks() });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    const restored = await restoreSession(db.store, r);
    expect(restored.googleEventRecreated).toBe(true);
    const back = db.sessions.get("s1")!;
    expect(back.status).toBe("scheduled");
    expect(back.deleted_at).toBeNull();
    expect(back.google_event_id).toBe("g-new-1");
    expect(db.google.has("g-new-1")).toBe(true);
    expect([...db.allocations.values()].map((a) => a.quantity_booked)).toEqual([1, 1, 1, 1]);
  });

  it("dopo «Addebita»: scheduled, nessun movimento di crediti, evento ricreato", async () => {
    const db = memoryStore({
      sessions: [session({ scheduled_at: hoursFromNow(5) })],
      allocations: fourWeeks(),
    });
    const r = await removeSession(db.store, {
      sessionId: "s1",
      removal: "cancel",
      choice: "charge",
      now: NOW,
    });
    await restoreSession(db.store, r);
    expect(db.sessions.get("s1")!.status).toBe("scheduled");
    expect(db.sessions.get("s1")!.google_event_id).toBe("g-new-1");
    expect([...db.allocations.values()].map((a) => a.quantity_booked)).toEqual([1, 1, 1, 1]);
  });

  it("dopo «Elimina»: deleted_at torna vuoto e il credito torna impegnato", async () => {
    const db = memoryStore({ sessions: [session()], allocations: fourWeeks() });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "delete", now: NOW });
    await restoreSession(db.store, r);
    const back = db.sessions.get("s1")!;
    expect(back.status).toBe("scheduled");
    expect(back.deleted_at).toBeNull();
    expect(db.allocations.get("pt-sett-1")!.quantity_booked).toBe(1);
  });

  it("se Google non aveva tolto l'evento, non ne crea un doppione e tiene l'id", async () => {
    const db = memoryStore({ sessions: [session()], allocations: fourWeeks(), googleDown: true });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    const restored = await restoreSession(db.store, r);
    expect(restored.googleEventRecreated).toBeNull();
    expect(db.sessions.get("s1")!.google_event_id).toBe("g-old");
  });

  it("credito usato nel frattempo: la sessione resta annullata, nessun credito in più o in meno", async () => {
    const db = memoryStore({
      sessions: [session()],
      allocations: [weekly(1, { quantity_assigned: 1 })],
    });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    // Un'altra prenotazione prende il credito appena restituito.
    db.allocations.get("pt-sett-1")!.quantity_booked = 1;
    await expect(restoreSession(db.store, r)).rejects.toBeInstanceOf(CreditUnavailableError);
    const s = db.sessions.get("s1")!;
    expect(s.status).toBe("cancelled");
    expect(s.google_event_id).toBe("g-old");
    expect(db.allocations.get("pt-sett-1")!.quantity_booked).toBe(1);
  });

  it("sessione cambiata dopo l'annullamento: non ripristina", async () => {
    const db = memoryStore({ sessions: [session()], allocations: fourWeeks() });
    const r = await removeSession(db.store, { sessionId: "s1", removal: "cancel", now: NOW });
    db.sessions.get("s1")!.status = "scheduled";
    await expect(restoreSession(db.store, r)).rejects.toBeInstanceOf(SessionChangedError);
    expect(db.allocations.get("pt-sett-1")!.quantity_booked).toBe(0);
  });
});

describe("holdsCredit", () => {
  it("il credito è impegnato finché la sessione non è annullata con rimborso", () => {
    expect(["scheduled", "completed", "no_show", "late_cancelled"].every(holdsCredit)).toBe(true);
    expect(holdsCredit("cancelled")).toBe(false);
  });
});
