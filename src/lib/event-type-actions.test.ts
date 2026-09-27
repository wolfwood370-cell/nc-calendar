import { describe, expect, it } from "vitest";
import {
  EventTypeRuleError,
  TypeGoneError,
  TypeInUseError,
  UsageUnreadableError,
  deleteEventType,
  saveEventType,
  setBookable,
  stepEventType,
  undoCreate,
  undoUpdate,
  type EventTypeInput,
} from "@/lib/event-type-actions";
import { deleteModel, typeUsage } from "@/lib/event-type-usage";
import type { EventTypeRow } from "@/lib/queries";
import {
  createMemoryEventTypes,
  type MemTypeDb,
  type MemoryEventTypes,
} from "@/lib/testing/memory-event-type-store";

// Venerdì 25/09/2026 alle 10:40 di Roma, come nell'handoff.
const NOW = new Date("2026-09-25T10:40:00+02:00");
const COACH = "coach";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();

function type(p: Partial<EventTypeRow> & Pick<EventTypeRow, "id" | "name">): EventTypeRow {
  return {
    coach_id: COACH,
    description: null,
    color: "#003e62",
    duration: 60,
    base_type: "PT Session",
    location_type: "physical",
    buffer_minutes: 10,
    location_address: "Via Roma 1",
    client_bookable: true,
    unavailable_message: null,
    ...p,
  };
}

/**
 * Tipologie come nel backup: «Sessione PT» e «Test Funzionali + Check
 * Tecnico» vendute dal negozio; «Misurazione BIA» di 15 minuti con crediti
 * di Marta e nessuna sessione futura; «Free Session» con crediti solo di
 * archiviati e sessioni passate; «Consulenza» mai usata; «Vecchia» non
 * prenotabile con una sessione futura.
 */
function seed(): MemoryEventTypes {
  const db: MemTypeDb = {
    types: [
      type({ id: "pt", name: "Sessione PT" }),
      type({ id: "test", name: "Test Funzionali + Check Tecnico", duration: 45 }),
      type({ id: "bia", name: "Misurazione BIA", duration: 15, buffer_minutes: 0 }),
      type({ id: "free", name: "Free Session" }),
      type({
        id: "cons",
        name: "Consulenza",
        location_type: "online",
        location_address: null,
      }),
      type({
        id: "old",
        name: "Vecchia",
        client_bookable: false,
        unavailable_message: "Scrivimi su WhatsApp.",
      }),
    ],
    bookings: [
      {
        id: "b1",
        client_id: "marta",
        coach_id: COACH,
        status: "scheduled",
        scheduled_at: at("2026-09-28", "09:00"),
        deleted_at: null,
        event_type_id: "pt",
      },
      {
        id: "b2",
        client_id: "luca",
        coach_id: COACH,
        status: "completed",
        scheduled_at: at("2026-06-10", "09:00"),
        deleted_at: null,
        event_type_id: "free",
      },
      {
        id: "b3",
        client_id: "marta",
        coach_id: COACH,
        status: "scheduled",
        scheduled_at: at("2026-10-02", "09:00"),
        deleted_at: null,
        event_type_id: "old",
      },
    ],
    blocks: [
      { id: "m1", client_id: "marta", end_date: "2026-10-18", deleted_at: null },
      { id: "l1", client_id: "luca", end_date: "2026-11-30", deleted_at: null },
    ],
    allocations: [
      { block_id: "m1", event_type_id: "pt", quantity_assigned: 8, quantity_booked: 3 },
      { block_id: "m1", event_type_id: "bia", quantity_assigned: 1, quantity_booked: 0 },
      { block_id: "l1", event_type_id: "free", quantity_assigned: 2, quantity_booked: 0 },
    ],
    extraCredits: [{ client_id: "rita", event_type_id: "free", quantity: 3, quantity_booked: 1 }],
    clients: [
      { id: "marta", coach_id: COACH, status: "active", deleted_at: null },
      { id: "luca", coach_id: COACH, status: "archived", deleted_at: null },
      { id: "rita", coach_id: COACH, status: "archived", deleted_at: null },
    ],
    packs: [
      { event_type_title: "Sessione PT", active: true },
      { event_type_title: "Test Funzionali + Check Tecnico", active: true },
      { event_type_title: "Consulenza", active: false },
    ],
  };
  return createMemoryEventTypes(db);
}

const row = (mem: MemoryEventTypes, id: string) => mem.db.types.find((t) => t.id === id)!;

function input(t: EventTypeRow, p: Partial<EventTypeInput> = {}): EventTypeInput {
  return {
    name: t.name,
    description: t.description ?? "",
    color: t.color,
    duration: t.duration,
    buffer_minutes: t.buffer_minutes,
    location_type: t.location_type,
    location_address: t.location_address ?? "",
    client_bookable: t.client_bookable,
    unavailable_message: t.unavailable_message ?? "",
    ...p,
  };
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("doveva rifiutare");
}

describe("−/+ della card", () => {
  it("scrive subito solo il campo toccato, col valore del passo", async () => {
    const mem = seed();
    expect(await stepEventType(mem.store, row(mem, "pt"), "duration", 1)).toBe(75);
    expect(await stepEventType(mem.store, row(mem, "pt"), "buffer_minutes", -1)).toBe(5);
    expect(mem.writes).toEqual([
      { op: "update", id: "pt", patch: { duration: 75 } },
      { op: "update", id: "pt", patch: { buffer_minutes: 5 } },
    ]);
  });

  it("al limite non scrive niente", async () => {
    const mem = seed();
    expect(await stepEventType(mem.store, row(mem, "bia"), "duration", -1)).toBeNull();
    expect(await stepEventType(mem.store, row(mem, "bia"), "buffer_minutes", -1)).toBeNull();
    expect(mem.writes).toEqual([]);
  });
});

describe("interruttore «Prenotabile dai clienti»", () => {
  it("scrive solo client_bookable: il messaggio per i clienti resta", async () => {
    const mem = seed();
    await setBookable(mem.store, "old", true);
    expect(mem.writes).toEqual([{ op: "update", id: "old", patch: { client_bookable: true } }]);
    expect(row(mem, "old").unavailable_message).toBe("Scrivimi su WhatsApp.");
    await setBookable(mem.store, "old", false);
    expect(row(mem, "old")).toMatchObject({
      client_bookable: false,
      unavailable_message: "Scrivimi su WhatsApp.",
    });
  });
});

describe("salvataggio del dialog", () => {
  it("rendere prenotabile non cancella il messaggio", async () => {
    const mem = seed();
    const before = { ...row(mem, "old") };
    await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, { client_bookable: true }),
    });
    expect(row(mem, "old")).toMatchObject({
      client_bookable: true,
      unavailable_message: "Scrivimi su WhatsApp.",
    });
  });

  it("testi senza spazi ai lati, vuoti a null, indirizzo solo in studio", async () => {
    const mem = seed();
    const before = { ...row(mem, "pt") };
    await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, {
        description: "  Allenamento in sala. ",
        location_type: "online",
        location_address: "Via Roma 1",
        unavailable_message: "   ",
      }),
    });
    expect(row(mem, "pt")).toMatchObject({
      description: "Allenamento in sala.",
      location_type: "online",
      location_address: null,
      unavailable_message: null,
    });
  });

  it("nome vuoto: rifiutato per chiunque salvi", async () => {
    const mem = seed();
    const before = { ...row(mem, "cons") };
    const e = await rejection(
      saveEventType(mem.store, { coachId: COACH, before, values: input(before, { name: "  " }) }),
    );
    expect(e).toBeInstanceOf(EventTypeRuleError);
    expect((e as Error).message).toBe("Inserisci un nome.");
    expect(mem.writes).toEqual([]);
  });

  it("doppione con maiuscole e spazi diversi, letto dal database", async () => {
    const mem = seed();
    const e = await rejection(
      saveEventType(mem.store, {
        coachId: COACH,
        before: null,
        values: input(type({ id: "x", name: "  misurazione bia " })),
      }),
    );
    expect((e as Error).message).toBe("Esiste già una tipologia con questo nome.");
    // La tipologia stessa non è un doppione.
    const bia = { ...row(mem, "bia") };
    await saveEventType(mem.store, {
      coachId: COACH,
      before: bia,
      values: input(bia, { name: "MISURAZIONE BIA", duration: 30 }),
    });
    expect(row(mem, "bia")).toMatchObject({ name: "MISURAZIONE BIA", duration: 30 });
  });

  it("nome bloccato dal negozio: non si cambia, il resto sì", async () => {
    const mem = seed();
    const before = { ...row(mem, "pt") };
    const e = await rejection(
      saveEventType(mem.store, {
        coachId: COACH,
        before,
        values: input(before, { name: "Personal Training" }),
      }),
    );
    expect((e as Error).message).toBe(
      "Il negozio dei clienti vende questa tipologia cercandola per nome: il nome non si cambia da qui.",
    );
    expect(mem.writes).toEqual([]);
    await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, { buffer_minutes: 15 }),
    });
    expect(row(mem, "pt")).toMatchObject({ name: "Sessione PT", buffer_minutes: 15 });
  });

  it("un pacchetto non attivo non blocca il nome", async () => {
    const mem = seed();
    const before = { ...row(mem, "cons") };
    await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, { name: "Consulenza online" }),
    });
    expect(row(mem, "cons").name).toBe("Consulenza online");
  });

  it("«Ripristina» di una modifica riscrive i valori di prima", async () => {
    const mem = seed();
    const before = { ...row(mem, "bia") };
    const res = await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, { duration: 30, color: "#f6bf26" }),
    });
    if (res.kind !== "updated") throw new Error("atteso un aggiornamento");
    await undoUpdate(mem.store, res);
    expect(row(mem, "bia")).toEqual(before);
  });

  it("«Ripristina» di una creazione la elimina", async () => {
    const mem = seed();
    const res = await saveEventType(mem.store, {
      coachId: COACH,
      before: null,
      values: input(type({ id: "x", name: " Stretching " })),
    });
    if (res.kind !== "created") throw new Error("attesa una creazione");
    expect(res.row.name).toBe("Stretching");
    await undoCreate(mem.store, res.row, COACH, NOW);
    expect(mem.db.types.some((t) => t.name === "Stretching")).toBe(false);
  });
});

describe("salvataggio: solo i campi cambiati", () => {
  it("scrive solo quello che il dialog ha cambiato", async () => {
    const mem = seed();
    const before = { ...row(mem, "cons") };
    await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, { color: "#f6bf26" }),
    });
    expect(mem.writes).toEqual([{ op: "update", id: "cons", patch: { color: "#f6bf26" } }]);
  });

  it("un dialog aperto su valori vecchi non riscrive i −/+ né l'interruttore usati nel frattempo", async () => {
    const mem = seed();
    const stale = { ...row(mem, "pt") }; // il dialog si apre con durata 60, prenotabile
    await stepEventType(mem.store, row(mem, "pt"), "duration", 1); // 75
    await setBookable(mem.store, "pt", false);
    await saveEventType(mem.store, {
      coachId: COACH,
      before: stale,
      values: input(stale, { color: "#0b8043" }),
    });
    expect(row(mem, "pt")).toMatchObject({
      duration: 75,
      client_bookable: false,
      color: "#0b8043",
    });
  });

  it("«Ripristina» riporta solo i campi del salvataggio, non le scritture venute dopo", async () => {
    const mem = seed();
    const before = { ...row(mem, "pt") };
    const res = await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, { color: "#0b8043" }),
    });
    if (res.kind !== "updated") throw new Error("atteso un aggiornamento");
    await stepEventType(mem.store, row(mem, "pt"), "duration", 1);
    await undoUpdate(mem.store, res);
    expect(row(mem, "pt")).toMatchObject({ color: "#003e62", duration: 75 });
  });

  it("niente cambiato: nessuna scrittura", async () => {
    const mem = seed();
    const before = { ...row(mem, "bia") };
    const res = await saveEventType(mem.store, { coachId: COACH, before, values: input(before) });
    expect(res).toEqual({ kind: "updated", id: "bia", before: {}, after: {} });
    expect(mem.writes).toEqual([]);
  });

  it("un doppione esatto già nel database non blocca chi lascia il nome com'è", async () => {
    const mem = seed();
    mem.db.types.push(type({ id: "pt2", name: "Sessione PT" }));
    const before = { ...row(mem, "pt") };
    await saveEventType(mem.store, {
      coachId: COACH,
      before,
      values: input(before, { buffer_minutes: 15 }),
    });
    expect(row(mem, "pt").buffer_minutes).toBe(15);
  });
});

describe("eliminazione", () => {
  it("in uso per sessioni future: rifiutata, niente cancellato", async () => {
    const mem = seed();
    const e = await rejection(deleteEventType(mem.store, { id: "old" }, COACH, NOW));
    expect(e).toBeInstanceOf(TypeInUseError);
    expect((e as TypeInUseError).usage.futureSessions).toBe(1);
    expect(mem.writes).toEqual([]);
  });

  it("in uso per i crediti, senza sessioni future: rifiutata", async () => {
    const mem = seed();
    const e = await rejection(deleteEventType(mem.store, { id: "bia" }, COACH, NOW));
    expect(e).toBeInstanceOf(TypeInUseError);
    expect((e as TypeInUseError).usage).toMatchObject({ futureSessions: 0, clientsWithCredits: 1 });
    expect(mem.writes).toEqual([]);
  });

  it("in uso per il negozio: rifiutata", async () => {
    const mem = seed();
    const e = await rejection(deleteEventType(mem.store, { id: "test" }, COACH, NOW));
    expect(e).toBeInstanceOf(TypeInUseError);
    expect((e as TypeInUseError).usage).toMatchObject({
      futureSessions: 0,
      clientsWithCredits: 0,
      soldInShop: true,
    });
    expect(mem.writes).toEqual([]);
  });

  it("non in uso, con sessioni passate e crediti di archiviati: si elimina e le righe perdono la tipologia", async () => {
    const mem = seed();
    const usage = await deleteEventType(mem.store, { id: "free" }, COACH, NOW);
    expect(usage).toMatchObject({ pastSessions: 1, archivedClientsWithCredits: 2 });
    expect(deleteModel({ client_bookable: true }, usage)).toEqual({
      kind: "free",
      lines: [
        "Non ci sono sessioni future né clienti con crediti di questo tipo.",
        "Le sessioni passate restano nello storico, senza più questa tipologia.",
        "I crediti rimasti a 2 clienti archiviati perderebbero la tipologia.",
      ],
    });
    expect(mem.writes).toEqual([{ op: "delete", id: "free" }]);
    expect(mem.db.bookings.find((b) => b.id === "b2")!.event_type_id).toBeNull();
    expect(mem.db.allocations.find((a) => a.block_id === "l1")!.event_type_id).toBeNull();
    expect(mem.db.extraCredits[0]!.event_type_id).toBeNull();
  });

  it("mai usata: si elimina", async () => {
    const mem = seed();
    await deleteEventType(mem.store, { id: "cons" }, COACH, NOW);
    expect(mem.writes).toEqual([{ op: "delete", id: "cons" }]);
  });

  it("già non prenotabile e in uso: il dialog lo dice e non offre niente", async () => {
    const mem = seed();
    const e = (await rejection(
      deleteEventType(mem.store, { id: "old" }, COACH, NOW),
    )) as TypeInUseError;
    const model = deleteModel(row(mem, "old"), e.usage);
    expect(model).toMatchObject({ kind: "in-use", canMakeNotBookable: false });
    expect(model.lines[2]).toBe(
      "È già non prenotabile: i clienti non possono prenotarla dall'app.",
    );
  });

  it("uso non leggibile: non si elimina", async () => {
    const mem = seed();
    mem.failUsage = true;
    const e = await rejection(deleteEventType(mem.store, { id: "cons" }, COACH, NOW));
    expect(e).toBeInstanceOf(UsageUnreadableError);
    expect((e as Error).message).toBe("Non riesco a leggere l'uso di questa tipologia: riprova.");
    expect(mem.writes).toEqual([]);
  });

  it("rilegge dal database: in uso nel frattempo, rifiutata anche se la pagina la dava libera", async () => {
    const mem = seed();
    const pageSaw = typeUsage(
      { id: "cons", name: "Consulenza" },
      { bookings: [], blocks: [], extraCredits: [], clients: [], shopTitles: [] },
      NOW,
    );
    expect(deleteModel(row(mem, "cons"), pageSaw).kind).toBe("free");
    mem.db.bookings.push({
      id: "b9",
      client_id: "marta",
      coach_id: COACH,
      status: "scheduled",
      scheduled_at: at("2026-09-30", "18:00"),
      deleted_at: null,
      event_type_id: "cons",
    });
    const e = await rejection(deleteEventType(mem.store, { id: "cons" }, COACH, NOW));
    expect(e).toBeInstanceOf(TypeInUseError);
    expect(mem.writes).toEqual([]);
  });

  it("già eliminata altrove", async () => {
    const mem = seed();
    const e = await rejection(deleteEventType(mem.store, { id: "nessuna" }, COACH, NOW));
    expect(e).toBeInstanceOf(TypeGoneError);
  });
});
