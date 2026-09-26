import { describe, expect, it } from "vitest";
import {
  assignEventToClient,
  blockForDate,
  countAvailableCredits,
  eventTitle,
  guessClientFromTitle,
  guessEventType,
  isAssignable,
  markEventSpecial,
  undoAssign,
  type AssignStore,
  type AssignableEvent,
  type EventLink,
} from "@/lib/assign-event";
import { CreditUnavailableError, SessionChangedError, type CreditRef } from "@/lib/cancel-session";
import type { OrderedAllocation, OrderedExtraCredit } from "@/lib/credit-order";

const COACH = "coach";
const clients = [
  { id: "giulia", full_name: "Giulia Bianchi" },
  { id: "luca-v", full_name: "Luca Verdi" },
  { id: "luca-b", full_name: "Luca Bassi" },
  { id: "sara", full_name: "Sara Neri" },
  { id: "nicolo", full_name: "Nicolò Castello" },
];
const types = [
  { id: "pt", name: "Personal Training", base_type: "PT Session" as const },
  { id: "bia", name: "Misurazione BIA", base_type: "BIA" as const },
  { id: "test", name: "Test funzionale", base_type: "Functional Test" as const },
];

describe("eventTitle", () => {
  it("titolo Google, altrimenti note senza prefisso, altrimenti «Evento»", () => {
    expect(eventTitle({ title: " Allenamento ", notes: null })).toBe("Allenamento");
    expect(eventTitle({ title: null, notes: "Importato da Google Calendar: PT Giulia" })).toBe(
      "PT Giulia",
    );
    expect(eventTitle({ title: "", notes: null })).toBe("Evento");
  });
});

describe("guessClientFromTitle", () => {
  it("nome completo nel titolo", () => {
    expect(guessClientFromTitle("PT Giulia Bianchi", clients)?.id).toBe("giulia");
  });

  it("solo il nome o solo il cognome, se identifica un cliente", () => {
    expect(guessClientFromTitle("Allenamento Sara", clients)?.id).toBe("sara");
    expect(guessClientFromTitle("Valutazione Neri", clients)?.id).toBe("sara");
  });

  it("senza accenti e senza maiuscole", () => {
    expect(guessClientFromTitle("pt nicolo castello", clients)?.id).toBe("nicolo");
  });

  it("nome condiviso da due clienti: nessun suggerimento", () => {
    expect(guessClientFromTitle("PT Luca", clients)).toBeNull();
    expect(guessClientFromTitle("PT Luca Verdi", clients)?.id).toBe("luca-v");
  });

  it("parola intera: «Saranno» non è Sara", () => {
    expect(guessClientFromTitle("Saranno in palestra", clients)).toBeNull();
  });
});

describe("guessEventType", () => {
  it("tipologia nominata nel titolo, altrimenti la prima PT", () => {
    expect(guessEventType("Misurazione BIA Giulia", types)?.id).toBe("bia");
    expect(guessEventType("Commercialista", types)?.id).toBe("pt");
    expect(guessEventType("x", [])).toBeNull();
  });
});

const blocks = [
  { id: "b2", start_date: "2026-08-24", end_date: "2026-09-20" },
  { id: "b3", start_date: "2026-09-21", end_date: "2026-10-18" },
];

describe("blockForDate", () => {
  it("il blocco che contiene la data a Roma", () => {
    expect(blockForDate(blocks, "2026-09-26T06:00:00Z")?.id).toBe("b3");
    // 22:30 UTC del 20/09 è già il 21/09 a Roma.
    expect(blockForDate(blocks, "2026-09-20T22:30:00Z")?.id).toBe("b3");
    expect(blockForDate(blocks, "2026-10-19T08:00:00Z")).toBeNull();
  });
});

describe("countAvailableCredits", () => {
  it("residuo del blocco della data più gli extra della tipologia", () => {
    const withAllocations = blocks.map((b) => ({
      ...b,
      allocations: [
        {
          event_type_id: "pt",
          session_type: "PT Session",
          quantity_assigned: 8,
          quantity_booked: 3,
        },
        { event_type_id: "bia", session_type: "BIA", quantity_assigned: 1, quantity_booked: 0 },
      ],
    }));
    const extras = [
      { event_type_id: "pt", quantity: 3, quantity_booked: 1 },
      { event_type_id: "bia", quantity: 2, quantity_booked: 0 },
    ];
    expect(
      countAvailableCredits({
        blocks: withAllocations,
        extras,
        scheduledAt: "2026-09-26T06:00:00Z",
        type: types[0]!,
      }),
    ).toBe(7);
    // Fuori da ogni blocco restano gli extra.
    expect(
      countAvailableCredits({
        blocks: withAllocations,
        extras,
        scheduledAt: "2026-11-02T08:00:00Z",
        type: types[0]!,
      }),
    ).toBe(2);
  });
});

const event = (over: Partial<AssignableEvent> = {}): AssignableEvent => ({
  id: "e1",
  status: "scheduled",
  deleted_at: null,
  client_id: null,
  coach_id: COACH,
  is_personal: false,
  category: "client_session",
  block_id: null,
  event_type_id: null,
  session_type: "PT Session",
  scheduled_at: "2026-10-07T06:00:00Z",
  title: "Allenamento Sara",
  notes: null,
  ...over,
});

describe("isAssignable", () => {
  it("senza cliente o importato come evento del coach", () => {
    expect(isAssignable(event())).toBe(true);
    expect(isAssignable(event({ client_id: COACH }))).toBe(true);
  });

  it("già assegnato, personale, annullato o con crediti: no", () => {
    expect(isAssignable(event({ client_id: "sara" }))).toBe(false);
    expect(isAssignable(event({ is_personal: true }))).toBe(false);
    expect(isAssignable(event({ status: "cancelled" }))).toBe(false);
    expect(isAssignable(event({ block_id: "b3" }))).toBe(false);
  });
});

function memoryAssignStore(init: {
  event: AssignableEvent;
  allocations?: OrderedAllocation[];
  extras?: Array<OrderedExtraCredit & { client_id: string }>;
}) {
  const ev = { ...init.event };
  const allocations = new Map((init.allocations ?? []).map((a) => [a.id, { ...a }]));
  const extras = new Map((init.extras ?? []).map((e) => [e.id, { ...e }]));
  const special: string[] = [];
  const store: AssignStore = {
    async getEvent() {
      return { ...ev };
    },
    async updateEvent(_id, expected, patch) {
      if (
        ev.client_id !== expected.client_id ||
        ev.block_id !== expected.block_id ||
        ev.is_personal !== expected.is_personal
      ) {
        return false;
      }
      Object.assign(ev, patch);
      return true;
    },
    async listClientBlocks() {
      return blocks;
    },
    async listAllocations(blockId) {
      return [...allocations.values()].filter((a) => a.block_id === blockId);
    },
    async listExtraCredits(clientId, eventTypeId) {
      return [...extras.values()].filter(
        (e) => e.client_id === clientId && e.event_type_id === eventTypeId,
      );
    },
    async moveCredit(ref: CreditRef, delta) {
      const row = ref.kind === "allocation" ? allocations.get(ref.id) : extras.get(ref.id);
      if (!row) return false;
      const cap = "quantity_assigned" in row ? row.quantity_assigned : row.quantity;
      const next = row.quantity_booked + delta;
      if (next < 0 || next > cap) return false;
      row.quantity_booked = next;
      return true;
    },
    async markSpecial(_id, category) {
      special.push(category);
      Object.assign(ev, {
        client_id: null,
        block_id: null,
        event_type_id: null,
        is_personal: true,
        category,
      } satisfies Partial<EventLink>);
    },
  };
  return { store, ev, allocations, extras, special };
}

const weekly = (week: number, booked: number): OrderedAllocation => ({
  id: `pt-sett-${week}`,
  block_id: "b3",
  event_type_id: "pt",
  session_type: "PT Session",
  week_number: week,
  quantity_assigned: 2,
  quantity_booked: booked,
  valid_until: null,
  created_at: `2026-09-2${week}T09:00:00Z`,
});

describe("assignEventToClient", () => {
  it("scala il credito dalla settimana della sessione nel blocco della data", async () => {
    const db = memoryAssignStore({
      event: event(),
      allocations: [weekly(1, 0), weekly(2, 0), weekly(3, 0), weekly(4, 0)],
    });
    const r = await assignEventToClient(db.store, {
      eventId: "e1",
      clientId: "sara",
      type: types[0]!,
      useCredit: true,
    });
    expect(r.credit).toEqual({ kind: "allocation", id: "pt-sett-3" });
    expect(db.allocations.get("pt-sett-3")!.quantity_booked).toBe(1);
    expect(db.ev).toMatchObject({
      client_id: "sara",
      event_type_id: "pt",
      block_id: "b3",
      is_personal: false,
      category: "client_session",
    });
  });

  it("blocco senza capienza: scala dagli extra della tipologia", async () => {
    const db = memoryAssignStore({
      event: event(),
      allocations: [weekly(3, 2)],
      extras: [
        {
          id: "extra",
          client_id: "sara",
          event_type_id: "pt",
          quantity: 3,
          quantity_booked: 0,
          expires_at: "2100-01-01T00:00:00Z",
        },
      ],
    });
    const r = await assignEventToClient(db.store, {
      eventId: "e1",
      clientId: "sara",
      type: types[0]!,
      useCredit: true,
    });
    expect(r.credit).toEqual({ kind: "extra", id: "extra" });
    expect(db.ev.block_id).toBeNull();
    expect(db.extras.get("extra")!.quantity_booked).toBe(1);
  });

  it("senza «Scala un credito»: nessun credito, nessun blocco", async () => {
    const db = memoryAssignStore({ event: event(), allocations: [weekly(3, 0)] });
    const r = await assignEventToClient(db.store, {
      eventId: "e1",
      clientId: "sara",
      type: types[0]!,
      useCredit: false,
    });
    expect(r.credit).toBeNull();
    expect(db.ev.block_id).toBeNull();
    expect(db.allocations.get("pt-sett-3")!.quantity_booked).toBe(0);
  });

  it("crediti finiti nel frattempo: non assegna", async () => {
    const db = memoryAssignStore({ event: event(), allocations: [weekly(3, 2)] });
    await expect(
      assignEventToClient(db.store, {
        eventId: "e1",
        clientId: "sara",
        type: types[0]!,
        useCredit: true,
      }),
    ).rejects.toBeInstanceOf(CreditUnavailableError);
    expect(db.ev.client_id).toBeNull();
  });

  it("evento già assegnato: non tocca nulla", async () => {
    const db = memoryAssignStore({ event: event({ client_id: "giulia" }) });
    await expect(
      assignEventToClient(db.store, {
        eventId: "e1",
        clientId: "sara",
        type: types[0]!,
        useCredit: false,
      }),
    ).rejects.toBeInstanceOf(SessionChangedError);
    expect(db.ev.client_id).toBe("giulia");
  });

  it("«Ripristina» rimette l'evento da assegnare e restituisce lo stesso credito", async () => {
    const db = memoryAssignStore({ event: event(), allocations: [weekly(3, 0)] });
    const r = await assignEventToClient(db.store, {
      eventId: "e1",
      clientId: "sara",
      type: types[0]!,
      useCredit: true,
    });
    await undoAssign(db.store, r);
    expect(db.ev).toMatchObject({ client_id: null, event_type_id: null, block_id: null });
    expect(db.allocations.get("pt-sett-3")!.quantity_booked).toBe(0);
  });
});

describe("markEventSpecial", () => {
  it("consulenza con la RPC; «Ripristina» la rimette da assegnare", async () => {
    const db = memoryAssignStore({ event: event({ client_id: COACH }) });
    const r = await markEventSpecial(db.store, "e1", "consulenza");
    expect(db.special).toEqual(["consulenza"]);
    expect(db.ev).toMatchObject({ is_personal: true, category: "consulenza", client_id: null });
    await undoAssign(db.store, r);
    expect(db.ev).toMatchObject({
      is_personal: false,
      category: "client_session",
      client_id: COACH,
    });
  });
});
