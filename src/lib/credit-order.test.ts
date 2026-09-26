import { describe, expect, it } from "vitest";
import {
  pickConsumeAllocation,
  pickConsumeExtraCredit,
  pickRefundAllocation,
  pickRefundExtraCredit,
  romeDate,
  weekInBlock,
  type CreditSession,
  type OrderedAllocation,
  type OrderedExtraCredit,
} from "@/lib/credit-order";

// Blocco di 4 settimane che inizia lunedì 21/09/2026.
const BLOCK_START = "2026-09-21";

const alloc = (id: string, over: Partial<OrderedAllocation> = {}): OrderedAllocation => ({
  id,
  block_id: "b1",
  event_type_id: "pt",
  session_type: "PT Session",
  week_number: 1,
  quantity_assigned: 1,
  quantity_booked: 1,
  valid_until: null,
  created_at: "2026-09-01T10:00:00Z",
  ...over,
});

/** Sessione PT del blocco b1 il giorno `day` (ore 10:00 a Roma). */
const ptOn = (day: string, over: Partial<CreditSession> = {}): CreditSession => ({
  block_id: "b1",
  event_type_id: "pt",
  session_type: "PT Session",
  scheduled_at: `${day}T08:00:00Z`,
  ...over,
});

describe("romeDate e weekInBlock", () => {
  it("usa la data di Roma, non quella UTC", () => {
    // 22:30 UTC del 27/09 sono le 00:30 del 28/09 a Roma.
    expect(romeDate("2026-09-27T22:30:00Z")).toBe("2026-09-28");
    expect(romeDate("2026-09-27T21:30:00Z")).toBe("2026-09-27");
  });

  it.each([
    ["2026-09-21", 1],
    ["2026-09-27", 1],
    ["2026-09-28", 2],
    ["2026-10-12", 4],
    // Oltre la quarta settimana e prima dell'inizio il server resta tra 1 e 4.
    ["2026-10-30", 4],
    ["2026-09-10", 1],
  ])("sessione del %s → settimana %i", (day, week) => {
    expect(weekInBlock(`${day}T08:00:00Z`, BLOCK_START)).toBe(week);
  });
});

describe("pickRefundAllocation · ordine del server", () => {
  it("vince l'allocazione che scade prima, le senza scadenza per ultime", () => {
    const allocations = [
      alloc("senza-scadenza"),
      alloc("scade-20-ott", { valid_until: "2026-10-20" }),
      alloc("scade-6-ott", { valid_until: "2026-10-06", created_at: "2026-09-02T10:00:00Z" }),
    ];
    expect(pickRefundAllocation(ptOn("2026-09-23"), allocations, BLOCK_START)?.id).toBe(
      "scade-6-ott",
    );
  });

  it("a parità di scadenza, prima la stessa tipologia", () => {
    const allocations = [
      alloc("altro-pt", { event_type_id: "pt-duo" }),
      alloc("stesso-pt", { created_at: "2026-09-05T10:00:00Z" }),
    ];
    expect(pickRefundAllocation(ptOn("2026-09-23"), allocations, BLOCK_START)?.id).toBe(
      "stesso-pt",
    );
  });

  it("poi la settimana della sessione, poi la più vicina", () => {
    const allocations = [1, 2, 3, 4].map((w) =>
      alloc(`sett-${w}`, { week_number: w, created_at: `2026-09-0${w}T10:00:00Z` }),
    );
    // 07/10 è nella terza settimana del blocco.
    expect(pickRefundAllocation(ptOn("2026-10-07"), allocations, BLOCK_START)?.id).toBe("sett-3");
    const senzaTerza = allocations.filter((a) => a.id !== "sett-3");
    // Settimane 2 e 4 sono alla stessa distanza: vince quella creata prima.
    expect(pickRefundAllocation(ptOn("2026-10-07"), senzaTerza, BLOCK_START)?.id).toBe("sett-2");
  });

  it("infine l'allocazione creata prima", () => {
    const allocations = [
      alloc("dopo", { created_at: "2026-09-10T10:00:00Z" }),
      alloc("prima", { created_at: "2026-09-01T09:00:00Z" }),
    ];
    expect(pickRefundAllocation(ptOn("2026-09-23"), allocations, BLOCK_START)?.id).toBe("prima");
  });

  it("solo allocazioni del blocco della sessione, dello stesso gruppo e con crediti impegnati", () => {
    const allocations = [
      alloc("altro-blocco", { block_id: "b2" }),
      alloc("bia", { event_type_id: "bia", session_type: "BIA" }),
      alloc("vuota", { quantity_booked: 0 }),
      alloc("giusta", { created_at: "2026-09-20T10:00:00Z" }),
    ];
    expect(pickRefundAllocation(ptOn("2026-09-23"), allocations, BLOCK_START)?.id).toBe("giusta");
  });

  it("allocazione senza tipologia con lo stesso session_type: ammessa, ma dopo la tipologia uguale", () => {
    const legacy = alloc("legacy", { event_type_id: null });
    expect(pickRefundAllocation(ptOn("2026-09-23"), [legacy], BLOCK_START)?.id).toBe("legacy");
    const typed = alloc("tipologia", { created_at: "2026-09-20T10:00:00Z" });
    expect(pickRefundAllocation(ptOn("2026-09-23"), [legacy, typed], BLOCK_START)?.id).toBe(
      "tipologia",
    );
  });

  it("senza blocco o senza allocazioni utili → null", () => {
    expect(pickRefundAllocation(ptOn("2026-09-23", { block_id: null }), [alloc("a")], null)).toBe(
      null,
    );
    expect(pickRefundAllocation(ptOn("2026-09-23"), [], BLOCK_START)).toBeNull();
  });

  it("senza data d'inizio del blocco la settimana non conta", () => {
    const allocations = [
      alloc("sett-1", { week_number: 1, created_at: "2026-09-01T10:00:00Z" }),
      alloc("sett-3", { week_number: 3, created_at: "2026-09-03T10:00:00Z" }),
    ];
    expect(pickRefundAllocation(ptOn("2026-10-07"), allocations, null)?.id).toBe("sett-1");
  });
});

describe("pickConsumeAllocation", () => {
  it("stesso ordine, ma solo allocazioni con capienza", () => {
    const allocations = [1, 2, 3].map((w) =>
      alloc(`sett-${w}`, {
        week_number: w,
        quantity_assigned: 2,
        quantity_booked: w === 2 ? 2 : 0,
        created_at: `2026-09-0${w}T10:00:00Z`,
      }),
    );
    // 30/09 è nella seconda settimana, piena: vince la più vicina creata prima.
    expect(pickConsumeAllocation(ptOn("2026-09-30"), allocations, BLOCK_START)?.id).toBe("sett-1");
    expect(
      pickConsumeAllocation(
        ptOn("2026-09-30"),
        allocations.map((a) => ({ ...a, quantity_booked: 2 })),
        BLOCK_START,
      ),
    ).toBeNull();
  });
});

describe("crediti extra", () => {
  const credit = (id: string, over: Partial<OrderedExtraCredit> = {}): OrderedExtraCredit => ({
    id,
    event_type_id: "pt",
    quantity: 3,
    quantity_booked: 1,
    expires_at: "2100-01-01T00:00:00Z",
    ...over,
  });

  it("restituisce alla tipologia giusta con la scadenza più vicina", () => {
    const credits = [
      credit("lontano"),
      credit("vicino", { expires_at: "2027-01-01T00:00:00Z" }),
      credit("bia", { event_type_id: "bia", expires_at: "2026-10-01T00:00:00Z" }),
      credit("nulla-da-restituire", { quantity_booked: 0, expires_at: "2026-11-01T00:00:00Z" }),
    ];
    expect(pickRefundExtraCredit("pt", credits)?.id).toBe("vicino");
  });

  it("scala dalla scadenza più vicina con residuo", () => {
    const credits = [
      credit("lontano"),
      credit("vicino-esaurito", { quantity_booked: 3, expires_at: "2027-01-01T00:00:00Z" }),
    ];
    expect(pickConsumeExtraCredit("pt", credits)?.id).toBe("lontano");
    expect(pickConsumeExtraCredit(null, credits)).toBeNull();
  });
});
