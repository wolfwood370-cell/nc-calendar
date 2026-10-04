import { describe, expect, it } from "vitest";
import {
  blockNumber,
  getClientBlockInfo,
  getClientPools,
  getCreditWindows,
  getMoveWindow,
  getNextBlock,
  type ClientBlock,
  type ClientPoolsInput,
  type CreditWindowsInput,
  type PoolBooking,
  type PoolEventType,
  type PoolExtra,
} from "@/lib/client-credits";
import type { CreditAllocation } from "@/lib/credits";
import type { SessionType } from "@/lib/mock-data";
import type { RenewalClient } from "@/lib/renewal";

// Lunedì 28/09/2026 alle 10:40, ora locale: lo stesso giorno con TZ=Europe/Rome
// e con TZ=UTC. I 14 giorni arrivano a lunedì 12 ottobre.
const NOW = new Date(2026, 8, 28, 10, 40);

const type = (
  id: string,
  name: string,
  base: SessionType,
  over: Partial<PoolEventType> = {},
): PoolEventType => ({
  id,
  name,
  color: "#005685",
  duration: 60,
  buffer_minutes: 10,
  base_type: base,
  location_type: "physical",
  location_address: "Via Roma 12, Bologna",
  client_bookable: true,
  unavailable_message: null,
  ...over,
});
const PT = type("pt", "Sessione PT", "PT Session");
const TEST = type("test", "Test funzionale", "Functional Test", {
  client_bookable: false,
  unavailable_message: "Si prenota con il coach.",
});
const BIA = type("bia", "BIA", "BIA", { location_type: "online", location_address: null });
// Una seconda tipologia con lo stesso session_type della PT.
const PT_DUO = type("duo", "PT di coppia", "PT Session");
const TYPES = [PT, TEST, BIA, PT_DUO];
const SESSION_TYPE: Record<string, SessionType> = {
  pt: "PT Session",
  test: "Functional Test",
  bia: "BIA",
  duo: "PT Session",
};

const alloc = (
  block: string,
  typeId: string,
  assigned: number,
  booked: number,
): CreditAllocation => ({
  block_id: block,
  event_type_id: typeId,
  session_type: SESSION_TYPE[typeId]!,
  quantity_assigned: assigned,
  quantity_booked: booked,
});

const block = (
  id: string,
  seq: number,
  start: string,
  end: string,
  allocations: CreditAllocation[] = [],
  status = "active",
): ClientBlock => ({
  id,
  sequence_order: seq,
  start_date: start,
  end_date: end,
  status,
  allocations,
});

/** Una sessione del cliente, col deleted_at che cancel_booking scrive. */
const session = (
  blockId: string | null,
  typeId: string,
  status: PoolBooking["status"],
  scheduledAt: string,
  deletedAt: string | null = null,
): PoolBooking & { deleted_at: string | null } => ({
  block_id: blockId,
  event_type_id: typeId,
  session_type: SESSION_TYPE[typeId]!,
  status,
  scheduled_at: scheduledAt,
  deleted_at: deletedAt,
});
const many = (n: number, make: (i: number) => PoolBooking) =>
  Array.from({ length: n }, (_, i) => make(i));

const extra = (typeId: string, quantity: number, booked: number, expires: Date): PoolExtra => ({
  event_type_id: typeId,
  quantity,
  quantity_booked: booked,
  expires_at: expires.toISOString(),
});
// Mezzogiorno locale: la stessa data di calendario con Roma e con UTC.
const NOON = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0);
const COACH_EXTRA = new Date("2100-01-01T00:00:00.000Z");

// Percorso fisso di sei blocchi da 28 giorni: il 3 contiene oggi.
const B1 = block("b1", 1, "2026-07-20", "2026-08-16", [], "completed");
const B2 = block("b2", 2, "2026-08-17", "2026-09-13", [], "completed");
const B3 = block("b3", 3, "2026-09-14", "2026-10-11");
const B4 = block("b4", 4, "2026-10-12", "2026-11-08");
const B5 = block("b5", 5, "2026-11-09", "2026-12-06");
const B6 = block("b6", 6, "2026-12-07", "2027-01-03");
const PATH = [B1, B2, B3, B4, B5, B6];

const pools = (over: Partial<ClientPoolsInput>) =>
  getClientPools({
    now: NOW,
    pathType: "fixed",
    block: B3,
    bookings: [],
    extras: [],
    eventTypes: TYPES,
    ...over,
  });

describe("getNextBlock · il blocco dopo il riferimento", () => {
  it("contiguo, anche coi blocchi in disordine", () => {
    expect(getNextBlock([B6, B4, B3, B5], B3)?.id).toBe("b4");
  });
  it("dopo un buco", () => {
    const later = block("b4", 4, "2026-10-20", "2026-11-16");
    expect(getNextBlock([B3, later], B3)?.id).toBe("b4");
  });
  it("nessuno dopo l'ultimo, e nessuno senza riferimento", () => {
    expect(getNextBlock(PATH, B6)).toBeNull();
    expect(getNextBlock(PATH, null)).toBeNull();
  });
  it("un blocco annullato si salta", () => {
    const cancelled = block("x", 4, "2026-10-12", "2026-11-08", [], "cancelled");
    const b5 = block("b5", 5, "2026-11-09", "2026-12-06");
    expect(getNextBlock([B3, cancelled, b5], B3)?.id).toBe("b5");
  });
});

describe("getClientPools · una definizione sola del disponibile", () => {
  it("0, 1 e 2 crediti disponibili, per total decrescente", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [
      alloc("b3", "bia", 2, 0),
      alloc("b3", "pt", 8, 8),
      alloc("b3", "test", 3, 2),
    ]);
    const bookings = [
      ...many(5, () => session("b3", "pt", "completed", "2026-09-15T08:00:00Z")),
      ...many(2, () => session("b3", "pt", "scheduled", "2026-10-02T08:00:00Z")),
      session("b3", "pt", "no_show", "2026-09-22T08:00:00Z"),
      ...many(2, () => session("b3", "test", "completed", "2026-09-16T08:00:00Z")),
    ];
    const r = pools({ block: b3, bookings });
    expect(r.rows.map((p) => [p.key, p.total, p.avail])).toEqual([
      ["pt", 8, 0],
      ["test", 3, 1],
      ["bia", 2, 2],
    ]);
    expect(r.rows[0]).toMatchObject({ done: 5, booked: 2, lost: 1, blockAvail: 0 });
    expect(r.mismatches).toEqual([]);
    expect(r.concluded).toBe(false);
  });

  it("la riga porta i campi della tipologia; l'icona no (iconForType)", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "test", 1, 0)]);
    expect(pools({ block: b3 }).rows[0]).toEqual({
      key: "test",
      eventTypeId: "test",
      sessionType: "Functional Test",
      name: "Test funzionale",
      color: "#005685",
      durationMin: 60,
      bufferMin: 10,
      location: "physical",
      address: "Via Roma 12, Bologna",
      bookable: false,
      message: "Si prenota con il coach.",
      total: 1,
      done: 0,
      booked: 0,
      lost: 0,
      extraUsed: 0,
      blockAvail: 1,
      extraAvail: 0,
      avail: 1,
      extraUntil: null,
    });
  });

  it("annullamento tardivo e assenza persi, l'annullamento gratuito restituisce il credito", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 4, 3)]);
    const bookings = [
      session("b3", "pt", "completed", "2026-09-15T08:00:00Z"),
      session("b3", "pt", "late_cancelled", "2026-09-17T08:00:00Z"),
      session("b3", "pt", "no_show", "2026-09-22T08:00:00Z"),
      session("b3", "pt", "cancelled", "2026-09-24T08:00:00Z", "2026-09-20T10:00:00Z"),
    ];
    const r = pools({ block: b3, bookings });
    expect(r.rows[0]).toMatchObject({ done: 1, booked: 0, lost: 2, avail: 1 });
    expect(r.mismatches).toEqual([]);
  });

  it("un'annullata tardi con deleted_at è persa lo stesso: decide lo stato, non deleted_at", () => {
    // cancel_booking scrive deleted_at su tutte e due. Guardia contro un filtro
    // su deleted_at, che perderebbe gli annullamenti tardivi.
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 4, 1)]);
    const late = session(
      "b3",
      "pt",
      "late_cancelled",
      "2026-09-29T08:00:00Z",
      "2026-09-28T20:00:00Z",
    );
    const free = session("b3", "pt", "cancelled", "2026-10-05T08:00:00Z", "2026-09-28T09:00:00Z");
    const r = pools({ block: b3, bookings: [late, free] });
    expect(r.rows[0]).toMatchObject({ lost: 1, booked: 0, avail: 3 });
    expect(r.mismatches).toEqual([]);
  });

  it("una sessione conta nella riga della sua tipologia: se il server ha scalato un'altra tipologia, lo dicono le incoerenze", () => {
    // Due sessioni PT: il server ha scalato la PT (esaurita) e poi la PT di
    // coppia, che ha lo stesso session_type.
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [
      alloc("b3", "pt", 1, 1),
      alloc("b3", "duo", 2, 1),
    ]);
    const bookings = [
      session("b3", "pt", "completed", "2026-09-15T08:00:00Z"),
      session("b3", "pt", "scheduled", "2026-10-02T08:00:00Z"),
    ];
    const r = pools({ block: b3, bookings });
    expect(r.rows.map((p) => [p.key, p.done, p.booked, p.blockAvail])).toEqual([
      ["duo", 0, 0, 1],
      ["pt", 1, 1, 0],
    ]);
    expect(r.mismatches).toEqual([
      { key: "pt", name: "Sessione PT", counted: 2, recorded: 1 },
      { key: "duo", name: "PT di coppia", counted: 0, recorded: 1 },
    ]);
  });

  it("una sessione collegata senza credito (block_id nullo) nelle date del blocco non entra", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 4, 1)]);
    const bookings = [
      session("b3", "pt", "completed", "2026-09-15T08:00:00Z"),
      session(null, "pt", "completed", "2026-09-21T08:00:00Z"),
    ];
    const r = pools({ block: b3, bookings });
    expect(r.rows[0]).toMatchObject({ done: 1, avail: 3 });
    expect(r.mismatches).toEqual([]);
  });

  it("una sessione di un altro blocco non entra, anche se cade nelle sue date", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 4, 0)]);
    const r = pools({
      block: b3,
      bookings: [session("b4", "pt", "scheduled", "2026-10-09T08:00:00Z")],
    });
    expect(r.rows[0]).toMatchObject({ booked: 0, avail: 4 });
  });

  it("Booster sommati nella riga della tipologia, con extraUsed, blockAvail ed extraAvail", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 8, 6)]);
    const bookings = many(6, () => session("b3", "pt", "completed", "2026-09-15T08:00:00Z"));
    const extras = [extra("pt", 3, 1, NOON(2026, 10, 31)), extra("bia", 1, 0, NOON(2026, 10, 31))];
    const r = pools({ block: b3, bookings, extras });
    const pt = r.rows.find((p) => p.key === "pt")!;
    expect(pt).toMatchObject({
      total: 11,
      done: 6,
      extraUsed: 1,
      blockAvail: 2,
      extraAvail: 2,
      avail: 4,
      extraUntil: "2026-10-31",
    });
    expect(pt.total).toBe(pt.done + pt.booked + pt.lost + pt.extraUsed + pt.avail);
    // Un extra di una tipologia che il blocco non ha è una riga sua.
    expect(r.rows.find((p) => p.key === "bia")).toMatchObject({
      total: 1,
      blockAvail: 0,
      extraAvail: 1,
    });
  });

  it("un extra scaduto e uno esaurito non contano", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 4, 0)]);
    const extras = [extra("pt", 2, 0, NOON(2026, 9, 27)), extra("pt", 1, 1, COACH_EXTRA)];
    expect(pools({ block: b3, extras }).rows).toEqual([
      expect.objectContaining({
        key: "pt",
        total: 4,
        extraUsed: 0,
        extraAvail: 0,
        avail: 4,
        extraUntil: null,
      }),
    ]);
  });

  it("sessioni che non coincidono con quantity_booked: l'incoerenza si restituisce e vale quantity_booked", () => {
    const b3 = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 8, 5)]);
    const bookings = many(4, () => session("b3", "pt", "completed", "2026-09-15T08:00:00Z"));
    const r = pools({ block: b3, bookings });
    expect(r.rows[0]).toMatchObject({ done: 4, blockAvail: 3, avail: 3 });
    expect(r.mismatches).toEqual([{ key: "pt", name: "Sessione PT", counted: 4, recorded: 5 }]);
  });

  it("percorso concluso: disponibile 0 per tutte le righe, extra compresi", () => {
    const ended = block(
      "b6",
      6,
      "2026-08-10",
      "2026-09-06",
      [alloc("b6", "pt", 8, 5)],
      "completed",
    );
    const bookings = many(5, () => session("b6", "pt", "completed", "2026-08-20T08:00:00Z"));
    const r = pools({ block: ended, bookings, extras: [extra("pt", 2, 0, COACH_EXTRA)] });
    expect(r.concluded).toBe(true);
    expect(r.rows.every((p) => p.avail === 0 && p.blockAvail === 0 && p.extraAvail === 0)).toBe(
      true,
    );
  });

  it("cliente libero: solo gli extra, senza blocco", () => {
    const r = pools({ pathType: "free", block: null, extras: [extra("pt", 10, 4, COACH_EXTRA)] });
    expect(r.rows).toEqual([
      expect.objectContaining({ key: "pt", total: 10, extraUsed: 4, extraAvail: 6, avail: 6 }),
    ]);
    expect(r.concluded).toBe(false);
  });

  it("cliente libero con un blocco rimasto da un vecchio percorso: il blocco non conta", () => {
    const old = block("b6", 6, "2026-08-10", "2026-09-06", [alloc("b6", "pt", 8, 5)], "completed");
    const r = pools({ pathType: "free", block: old, extras: [extra("pt", 10, 4, COACH_EXTRA)] });
    expect(r.concluded).toBe(false);
    expect(r.rows).toEqual([
      expect.objectContaining({ key: "pt", total: 10, blockAvail: 0, extraAvail: 6, avail: 6 }),
    ]);
  });
});

describe("getCreditWindows · dove vale ogni credito", () => {
  const row = (
    key: string,
    blockAvail: number,
    extraAvail = 0,
    extraUntil: string | null = null,
  ) => ({
    ...pools({ block: block("x", 1, "2026-09-14", "2026-10-11", [alloc("x", key, 1, 0)]) })
      .rows[0]!,
    key,
    blockAvail,
    extraAvail,
    avail: blockAvail + extraAvail,
    extraUntil,
  });
  const windows = (over: Partial<CreditWindowsInput>) =>
    getCreditWindows({
      now: NOW,
      pathType: "fixed",
      blocks: PATH,
      reference: B3,
      referencePools: [row("pt", 2)],
      next: B4,
      nextPools: [row("pt", 8)],
      key: "pt",
      ...over,
    });

  it("due blocchi contigui con crediti: il blocco dopo si prenota coi suoi", () => {
    expect(windows({})).toEqual([
      { from: "2026-09-14", until: "2026-10-11", source: "block", blockId: "b3", blockNumber: 3 },
      { from: "2026-10-12", until: "2026-11-08", source: "block", blockId: "b4", blockNumber: 4 },
    ]);
  });

  it("blocco di riferimento esaurito, blocco dopo con crediti", () => {
    expect(windows({ referencePools: [row("pt", 0)] })).toEqual([
      { from: "2026-10-12", until: "2026-11-08", source: "block", blockId: "b4", blockNumber: 4 },
    ]);
  });

  it("il blocco dopo senza crediti della tipologia non apre niente", () => {
    expect(windows({ nextPools: [row("bia", 2)] }).map((w) => w.blockId)).toEqual(["b3"]);
    expect(windows({ nextPools: [row("pt", 0)] }).map((w) => w.blockId)).toEqual(["b3"]);
  });

  it("il blocco dopo che inizia oltre oggi + 14 non apre niente", () => {
    const late = block("b4", 4, "2026-10-19", "2026-11-15");
    expect(windows({ next: late, blocks: [B3, late] }).map((w) => w.blockId)).toEqual(["b3"]);
  });

  it("blocchi che si accavallano: la finestra del blocco dopo parte il giorno dopo la fine del primo", () => {
    const b4 = block("b4", 4, "2026-10-05", "2026-11-01");
    expect(windows({ blocks: [B3, b4], reference: B3, next: b4 })).toEqual([
      { from: "2026-09-14", until: "2026-10-11", source: "block", blockId: "b3", blockNumber: 1 },
      { from: "2026-10-12", until: "2026-11-01", source: "block", blockId: "b4", blockNumber: 2 },
    ]);
  });

  it("buco fra i blocchi: le finestre restano separate", () => {
    const b3 = block("b3", 3, "2026-09-07", "2026-10-04");
    const b4 = block("b4", 4, "2026-10-07", "2026-11-03");
    expect(windows({ blocks: [b3, b4], reference: b3, next: b4 })).toEqual([
      { from: "2026-09-07", until: "2026-10-04", source: "block", blockId: "b3", blockNumber: 1 },
      { from: "2026-10-07", until: "2026-11-03", source: "block", blockId: "b4", blockNumber: 2 },
    ]);
  });

  it("un extra copre solo i giorni che nessun blocco copre, e non oltre l'ultimo blocco", () => {
    // Crediti del 3 per la tipologia, nessuno nel 4: l'extra del coach (scade nel
    // 2100) apre i giorni del 4 e si ferma alla sua fine.
    const refPools = [row("pt", 2, 2, "2100-01-01")];
    expect(windows({ referencePools: refPools, nextPools: [] })).toEqual([
      { from: "2026-09-14", until: "2026-10-11", source: "block", blockId: "b3", blockNumber: 3 },
      { from: "2026-10-12", until: "2026-11-08", source: "extra", blockId: "b4", blockNumber: 4 },
    ]);
    // Blocco 3 esaurito e nessun blocco dopo: l'extra vale nei giorni del 3.
    expect(windows({ referencePools: [row("pt", 0, 2, "2100-01-01")], next: null })).toEqual([
      { from: "2026-09-14", until: "2026-10-11", source: "extra", blockId: "b3", blockNumber: 3 },
    ]);
    // Un Booster che scade prima della fine del blocco si ferma alla sua scadenza.
    expect(windows({ referencePools: [row("pt", 0, 1, "2026-10-05")], next: null })).toEqual([
      { from: "2026-09-14", until: "2026-10-05", source: "extra", blockId: "b3", blockNumber: 3 },
    ]);
  });

  it("cliente libero: da oggi alla scadenza degli extra", () => {
    expect(
      windows({
        pathType: "free",
        blocks: [],
        reference: null,
        next: null,
        referencePools: [row("pt", 0, 6, "2100-01-01")],
        nextPools: [],
      }),
    ).toEqual([
      {
        from: "2026-09-28",
        until: "2100-01-01",
        source: "extra",
        blockId: null,
        blockNumber: null,
      },
    ]);
  });

  it("percorso concluso: nessuna finestra, nemmeno con gli extra", () => {
    const ended = block("b6", 6, "2026-08-10", "2026-09-06");
    expect(
      windows({ reference: ended, next: null, referencePools: [row("pt", 3, 2, "2100-01-01")] }),
    ).toEqual([]);
  });

  it("in un altro anno conta `now`, non l'orologio", () => {
    const a = block("a", 1, "2031-03-03", "2031-03-30");
    const b = block("b", 2, "2031-03-31", "2031-04-27");
    expect(
      windows({ now: new Date(2031, 2, 20, 9, 0), blocks: [a, b], reference: a, next: b }).map(
        (w) => w.blockId,
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("getMoveWindow · dove si sposta una sessione", () => {
  it("l'ultimo credito della tipologia è già impegnato dalla sessione: la finestra c'è, e si ferma al suo blocco", () => {
    const full = block("b3", 3, "2026-09-14", "2026-10-11", [alloc("b3", "pt", 8, 8)]);
    expect(getMoveWindow({ block_id: "b3" }, [B1, B2, full, B4, B5, B6], NOW)).toEqual({
      from: "2026-09-28",
      until: "2026-10-11",
      source: "block",
      blockId: "b3",
      blockNumber: 3,
    });
  });

  it("una sessione prenotata in anticipo nel blocco dopo: dall'inizio di quel blocco", () => {
    expect(getMoveWindow({ block_id: "b4" }, PATH, NOW)).toEqual({
      from: "2026-10-12",
      until: "2026-11-08",
      source: "block",
      blockId: "b4",
      blockNumber: 4,
    });
  });

  it("una sessione senza blocco: da oggi a oggi + 14", () => {
    expect(getMoveWindow({ block_id: null }, PATH, NOW)).toEqual({
      from: "2026-09-28",
      until: "2026-10-12",
      source: "extra",
      blockId: null,
      blockNumber: null,
    });
  });

  it("un blocco che non c'è, o già finito: nessuna finestra", () => {
    expect(getMoveWindow({ block_id: "altro" }, PATH, NOW)).toBeNull();
    expect(getMoveWindow({ block_id: "b2" }, PATH, NOW)).toBeNull();
  });
});

describe("getClientBlockInfo · piano, blocco e sottotitolo", () => {
  const client = (path: string, autoRenew = false): RenewalClient => ({
    status: "active",
    path_type: path,
    auto_renew_blocks: autoRenew,
  });
  // Abbonamento coi due mesi dopo già creati: il 1 contiene oggi e finisce domenica 4 ottobre.
  const M1 = block("m1", 1, "2026-09-07", "2026-10-04");
  const M2 = block("m2", 2, "2026-10-05", "2026-11-01");
  const M3 = block("m3", 3, "2026-11-02", "2026-11-29");

  it("abbonato coi mesi dopo già creati: numero e settimana del mese in corso, non dell'ultimo creato", () => {
    expect(getClientBlockInfo(client("recurring", true), [M1, M2, M3], NOW)).toMatchObject({
      plan: "Abbonamento mensile",
      block: "Blocco 1",
      subtitle: "Settimana 4 di 4 · si rinnova lunedì 5 ottobre",
      number: 1,
      reference: M1,
    });
  });

  it("abbonamento senza rinnovo automatico: termina", () => {
    expect(getClientBlockInfo(client("recurring"), [M1], NOW).subtitle).toBe(
      "Settimana 4 di 4 · termina domenica 4 ottobre",
    );
  });

  it("percorso fisso: «Blocco 3 di 6», e i giorni che restano", () => {
    expect(getClientBlockInfo(client("fixed"), PATH, NOW)).toMatchObject({
      plan: "Percorso fisso",
      block: "Blocco 3 di 6",
      subtitle: "Valgono fino a domenica 11 ottobre · 13 giorni",
    });
  });

  it("i confini a 0, 1 e 2 giorni", () => {
    const sub = (d: number) =>
      getClientBlockInfo(client("fixed"), PATH, new Date(2026, 9, d, 9, 0)).subtitle;
    expect(sub(11)).toBe("Valgono fino a domenica 11 ottobre · ultimo giorno");
    expect(sub(10)).toBe("Valgono fino a domenica 11 ottobre · domani l'ultimo giorno");
    expect(sub(9)).toBe("Valgono fino a domenica 11 ottobre · 2 giorni");
  });

  it("cliente libero, percorso concluso, blocco non ancora iniziato", () => {
    expect(getClientBlockInfo(client("free"), [], NOW)).toEqual({
      plan: "Cliente libero",
      block: null,
      subtitle: "Crediti senza scadenza",
      number: null,
      reference: null,
    });
    const ended = [
      block("a", 1, "2026-07-13", "2026-08-09"),
      block("b", 2, "2026-08-10", "2026-09-06"),
    ];
    expect(getClientBlockInfo(client("fixed"), ended, NOW)).toMatchObject({
      block: "Blocco 2 di 2",
      subtitle: "Concluso domenica 6 settembre",
    });
    const starting = [block("a", 1, "2026-10-05", "2026-11-01")];
    expect(getClientBlockInfo(client("fixed"), starting, NOW).subtitle).toBe(
      "Inizia lunedì 5 ottobre",
    );
  });

  it("i numeri contano i soli blocchi validi, come blockChip del coach", () => {
    const withCancelled = [
      block("a", 1, "2026-08-17", "2026-09-13"),
      block("x", 2, "2026-08-31", "2026-09-27", [], "cancelled"),
      block("b", 3, "2026-09-14", "2026-10-11"),
    ];
    expect(getClientBlockInfo(client("fixed"), withCancelled, NOW).block).toBe("Blocco 2 di 2");
    expect(blockNumber(withCancelled, withCancelled[1]!)).toBeNull();
  });
});
