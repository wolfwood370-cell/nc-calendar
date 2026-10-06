import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeSession } from "@/lib/cancel-session";
import { notOnGoogle } from "@/lib/calendar-events";
import {
  NoCreditError,
  coachWriteError,
  createClientSession,
  createCommitment,
  loadClientCredits,
  noCreditMessage,
  planSessionCredit,
} from "@/lib/session-create";
import { COACH, NOW, TYPES, at, seedDb } from "@/lib/testing/calendar-seed";
import {
  createMemoryCalendar,
  type MemType,
  type MemoryCalendar,
} from "@/lib/testing/memory-calendar-store";

const pt = TYPES.pt;

async function plan(mem: MemoryCalendar, clientId: string, when: string, type: MemType = pt) {
  return planSessionCredit({
    scheduledAt: when,
    eventTypeId: type.id,
    sessionType: type.base_type,
    ...(await loadClientCredits(mem.store, clientId)),
  });
}

/** Crea e controlla che il credito preso dal «trigger» sia quello previsto dal dialog. */
async function createAndCompare(
  mem: MemoryCalendar,
  clientId: string,
  name: string,
  when: string,
  type: MemType = pt,
) {
  const predicted = await plan(mem, clientId, when, type);
  const before = JSON.parse(JSON.stringify(mem.db));
  const r = await createClientSession(mem.store, {
    coachId: COACH,
    clientId,
    clientName: name,
    type,
    scheduledAt: when,
    durationMin: type.duration,
  });
  const changedAllocs = mem.db.allocations.filter(
    (a) =>
      a.quantity_booked !==
      before.allocations.find((x: { id: string }) => x.id === a.id).quantity_booked,
  );
  const changedExtras = mem.db.extras.filter(
    (e) =>
      e.quantity_booked !==
      before.extras.find((x: { id: string }) => x.id === e.id).quantity_booked,
  );
  return {
    predicted,
    r,
    changedAllocs,
    changedExtras,
    row: mem.db.bookings.find((b) => b.id === r.sessionId)!,
  };
}

describe("creazione · il credito previsto è quello che prende il trigger", () => {
  it("settimana della sessione nel blocco che contiene la data", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { predicted, changedAllocs, row } = await createAndCompare(
      mem,
      "marta",
      "Marta Conti",
      at("2026-10-07", "10:00"),
    );
    expect(predicted).toMatchObject({
      source: "block",
      refBlockId: "m1",
      allocation: { id: "m1-pt-3" },
    });
    expect(changedAllocs.map((a) => [a.id, a.quantity_booked])).toEqual([["m1-pt-3", 1]]);
    expect(row).toMatchObject({
      block_id: "m1",
      status: "scheduled",
      event_type_id: "pt",
      client_id: "marta",
    });
    expect(mem.inserted[0]).toMatchObject({
      block_id: "m1",
      coach_id: COACH,
      category: "client_session",
    });
  });

  it("settimana esaurita: la più vicina, come il server", async () => {
    const db = seedDb();
    db.allocations.find((a) => a.id === "m1-pt-3")!.quantity_booked = 2;
    const mem = createMemoryCalendar(db);
    const { predicted, changedAllocs } = await createAndCompare(
      mem,
      "marta",
      "Marta Conti",
      at("2026-10-07", "10:00"),
    );
    expect(predicted?.source === "block" && predicted.allocation.id).toBe("m1-pt-2");
    expect(changedAllocs.map((a) => a.id)).toEqual(["m1-pt-2"]);
  });

  it("blocco della data esaurito: il credito viene dall'altro blocco e block_id lo segue", async () => {
    const db = seedDb();
    for (const a of db.allocations)
      if (a.block_id === "m1" && a.event_type_id === "pt") a.quantity_booked = 2;
    const mem = createMemoryCalendar(db);
    const { predicted, changedAllocs, row } = await createAndCompare(
      mem,
      "marta",
      "Marta Conti",
      at("2026-10-07", "10:00"),
    );
    expect(predicted?.source === "block" && predicted.allocation.id).toBe("m2-pt-1");
    expect(changedAllocs.map((a) => a.id)).toEqual(["m2-pt-1"]);
    expect(row.block_id).toBe("m2");
  });

  it("blocchi senza capienza: credito extra, con block_id vuoto", async () => {
    const db = seedDb();
    db.allocations.find((a) => a.id === "m1-bia")!.quantity_booked = 1;
    const mem = createMemoryCalendar(db);
    const { predicted, changedExtras, row } = await createAndCompare(
      mem,
      "marta",
      "Marta Conti",
      at("2026-10-01", "09:00"),
      TYPES.bia,
    );
    expect(predicted).toMatchObject({ source: "extra", credit: { id: "m-bia-extra" } });
    expect(changedExtras.map((e) => e.id)).toEqual(["m-bia-extra"]);
    expect(row.block_id).toBeNull();
  });

  it("cliente senza blocchi: l'extra che scade prima fra quelli con residuo", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { predicted, changedExtras } = await createAndCompare(
      mem,
      "sara",
      "Sara Neri",
      at("2026-09-29", "18:00"),
    );
    expect(predicted).toMatchObject({ source: "extra", credit: { id: "s-pt-soon" } });
    expect(changedExtras.map((e) => e.id)).toEqual(["s-pt-soon"]);
  });
});

describe("creazione · senza credito non si salva", () => {
  it("nessun credito: niente inserimento e il messaggio per il coach", async () => {
    const mem = createMemoryCalendar(seedDb());
    await expect(
      createClientSession(mem.store, {
        coachId: COACH,
        clientId: "luca",
        clientName: "Luca Verdi",
        type: pt,
        scheduledAt: at("2026-09-29", "18:00"),
        durationMin: 60,
      }),
    ).rejects.toThrow(new NoCreditError("Luca non ha crediti Personal Training disponibili."));
    expect(mem.inserted).toHaveLength(0);
    expect(mem.db.bookings).toHaveLength(0);
  });

  it("messaggio col nome di battesimo", () => {
    expect(noCreditMessage("Marta Conti", "Personal Training")).toBe(
      "Marta non ha crediti Personal Training disponibili.",
    );
  });

  it("se il server rifiuta lo stesso, il messaggio è per il coach, non per il cliente", () => {
    const m = coachWriteError({
      code: "P0001",
      message:
        "Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.",
    });
    expect(m).toBe(
      "Il cliente non ha più crediti per questa tipologia: la sessione non è stata salvata.",
    );
    expect(m).not.toMatch(/Booster/);
    expect(coachWriteError({ code: "23P01", message: "exclusion" })).toBe(
      "L'orario si sovrappone a un altro evento: scegline un altro.",
    );
  });

  it("sovrapposizione: il server rifiuta, niente credito scalato", async () => {
    const mem = createMemoryCalendar(seedDb());
    await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "marta",
      clientName: "Marta Conti",
      type: pt,
      scheduledAt: at("2026-10-07", "10:00"),
      durationMin: 60,
    });
    await expect(
      createClientSession(mem.store, {
        coachId: COACH,
        clientId: "sara",
        clientName: "Sara Neri",
        type: pt,
        scheduledAt: at("2026-10-07", "10:30"),
        durationMin: 60,
      }),
    ).rejects.toThrow("L'orario si sovrappone a un altro evento: scegline un altro.");
    expect(mem.extraBooked("s-pt-soon")).toBe(0);
    expect(mem.db.bookings).toHaveLength(1);
  });
});

describe("creazione · Google e «Ripristina»", () => {
  it("l'evento Google si crea e il suo id resta sulla sessione", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { r, row } = await createAndCompare(
      mem,
      "marta",
      "Marta Conti",
      at("2026-10-07", "10:00"),
    );
    expect(r.googleEventCreated).toBe(true);
    expect(row.google_event_id).toBe(`g-${r.sessionId}`);
  });

  it("Google non risponde: la sessione resta ed è fra quelle «non su Google»", async () => {
    const mem = createMemoryCalendar(seedDb());
    mem.google.failCreate = true;
    const { r, row } = await createAndCompare(
      mem,
      "marta",
      "Marta Conti",
      at("2026-10-07", "10:00"),
    );
    expect(r.googleEventCreated).toBe(false);
    expect(row.google_event_id).toBeNull();
    expect(
      notOnGoogle(
        mem.db.bookings.map((b) => ({ ...b })),
        NOW,
      ).map((b) => b.id),
    ).toEqual([r.sessionId]);
  });

  it("«Ripristina» elimina la sessione, restituisce il credito e toglie l'evento Google", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { r } = await createAndCompare(mem, "marta", "Marta Conti", at("2026-10-07", "10:00"));
    expect(mem.booked("m1-pt-3")).toBe(1);
    const undo = await removeSession(mem.store, {
      sessionId: r.sessionId,
      removal: "delete",
      now: NOW,
    });
    expect(undo.credit).toBe("refunded");
    expect(mem.booked("m1-pt-3")).toBe(0);
    expect(mem.db.bookings[0]!.deleted_at).not.toBeNull();
    expect(mem.google.deleted).toEqual([`g-${r.sessionId}`]);
  });

  it("impegno personale: nessun credito, is_personal e category personal", async () => {
    const mem = createMemoryCalendar(seedDb());
    const before = JSON.stringify([mem.db.allocations, mem.db.extras]);
    const r = await createCommitment(mem.store, {
      coachId: COACH,
      title: "  Dentista ",
      scheduledAt: at("2026-09-28", "13:00"),
      durationMin: 45,
    });
    expect(JSON.stringify([mem.db.allocations, mem.db.extras])).toBe(before);
    expect(mem.db.bookings[0]).toMatchObject({
      id: r.sessionId,
      client_id: null,
      is_personal: true,
      category: "personal",
      title: "Dentista",
      duration_min: 45,
      block_id: null,
      event_type_id: null,
    });
    expect(r.googleEventCreated).toBe(true);
    const undo = await removeSession(mem.store, {
      sessionId: r.sessionId,
      removal: "delete",
      now: NOW,
    });
    expect(undo.credit).toBe("none");
  });

  it("il server tiene i 60 minuti scelti: dal giro del 02/10/2026 una durata esplicita resta (trigger delle durate, passata 10)", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { row } = await createAndCompare(mem, "marta", "Marta Conti", at("2026-10-01", "09:00"), {
      ...TYPES.bia,
      duration: 60,
    });
    expect(row.duration_min).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// La scadenza degli extra (06b): l'archivio inserisce come il server dopo il
// giro del 02/10/2026, e il dialog prevede lo stesso credito. Vera non ha
// blocchi e ogni suo extra PT ha un credito. Le scadenze come le scrive
// stripe-webhook, alla fine di un giorno di Roma: A04 la domenica 4/10, B03 il
// martedì 3/11 (dopo il cambio dell'ora), A11 la domenica 11/10; IL20 è
// martedì 20/10 alle 9:00.
// ---------------------------------------------------------------------------

const A04 = "2026-10-04T21:59:59.999Z";
const B03 = "2026-11-03T22:59:59.999Z";
const A11 = "2026-10-11T21:59:59.999Z";
const IL20 = "2026-10-20T07:00:00.000Z";
const NEW_EXTRA_REFUSAL = "Il credito extra non vale per questa data: scade prima della sessione.";
const OUT_OF_CREDIT =
  "Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.";
const NOT_SAVED =
  "Il cliente non ha più crediti per questa tipologia: la sessione non è stata salvata.";

type VeraExtra = [id: string, expiresAt: string];

/**
 * L'orologio fermo al 1/10, prima di ogni scadenza dei casi: una regola che
 * guardasse oggi invece della data della sessione cadrebbe anche dopo l'11/10.
 */
function fixClockBeforeExpiries() {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T08:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}

function vera(extras: VeraExtra[]) {
  return createMemoryCalendar({
    types: [pt],
    blocks: [],
    allocations: [],
    extras: extras.map(([id, expires_at]) => ({
      id,
      client_id: "vera",
      event_type_id: "pt",
      quantity: 1,
      quantity_booked: 0,
      expires_at,
    })),
    bookings: [],
  });
}

const usedOf = (mem: MemoryCalendar) =>
  Object.fromEntries(mem.db.extras.map((x) => [x.id, x.quantity_booked]));

/**
 * Una PT di un'ora per Vera, inserita come la scrive il dialog: l'esito (col
 * messaggio per il coach), i crediti usati e, se rifiutata, la frase del trigger.
 */
async function insertPt(when: string, extras: VeraExtra[]) {
  const mem = vera(extras);
  let outcome: string;
  let trigger: string | undefined;
  try {
    await mem.store.insertSession({
      coach_id: COACH,
      client_id: "vera",
      block_id: null,
      event_type_id: "pt",
      session_type: "PT Session",
      scheduled_at: when,
      end_at: new Date(Date.parse(when) + 3_600_000).toISOString(),
      duration_min: 60,
      status: "scheduled",
      is_personal: false,
      category: "client_session",
      title: null,
    });
    outcome = "prenotata";
  } catch (e) {
    outcome = `rifiutata: ${(e as Error).message}`;
    trigger = ((e as Error).cause as Error | undefined)?.message;
  }
  return { outcome, used: usedOf(mem), trigger };
}

describe("archivio · il credito extra paga solo una sessione entro la sua scadenza (06b)", () => {
  fixClockBeforeExpiries();
  const booked = (used: Record<string, number>) => ({ outcome: "prenotata", used });
  // Per il coach le due frasi del trigger sono lo stesso messaggio: la frase
  // si legge a parte, così si vede quale delle due ha detto l'archivio.
  const refused = (used: Record<string, number>, trigger: string) => ({
    outcome: `rifiutata: ${NOT_SAVED}`,
    used,
    trigger,
  });

  it("1 · dentro la scadenza", async () => {
    expect(await insertPt("2026-10-10T07:00:00.000Z", [["A", A11]])).toEqual(booked({ A: 1 }));
  });

  it("2 · l'ultimo giorno alle 23:30 di Roma", async () => {
    expect(await insertPt("2026-10-11T21:30:00.000Z", [["A", A11]])).toEqual(booked({ A: 1 }));
  });

  it("2b · all'istante della scadenza", async () => {
    expect(await insertPt(A11, [["A", A11]])).toEqual(booked({ A: 1 }));
  });

  it("3 · la mezzanotte dopo: rifiutata, niente scalato", async () => {
    expect(await insertPt("2026-10-11T22:00:00.000Z", [["A", A11]])).toEqual(
      refused({ A: 0 }, NEW_EXTRA_REFUSAL),
    );
  });

  it("4 · dopo la scadenza: rifiutata, niente scalato", async () => {
    expect(await insertPt("2026-10-12T07:00:00.000Z", [["A", A11]])).toEqual(
      refused({ A: 0 }, NEW_EXTRA_REFUSAL),
    );
  });

  it("5 · A scaduto per quella data, B valido: scala B", async () => {
    expect(
      await insertPt(IL20, [
        ["A", A04],
        ["B", B03],
      ]),
    ).toEqual(booked({ A: 0, B: 1 }));
  });

  it("6 · nessun extra: rifiutata", async () => {
    expect(await insertPt("2026-10-10T07:00:00.000Z", [])).toEqual(refused({}, OUT_OF_CREDIT));
  });

  it("7 · un extra del coach (2100) vale sempre", async () => {
    expect(await insertPt("2027-05-01T07:00:00.000Z", [["A", "2100-01-01T00:00:00.000Z"]])).toEqual(
      booked({ A: 1 }),
    );
  });

  it("la frase nuova del trigger, per il coach, dice che il cliente non ha crediti", () => {
    expect(coachWriteError({ code: "P0001", message: NEW_EXTRA_REFUSAL })).toBe(NOT_SAVED);
  });
});

describe("creazione · il credito previsto coincide con quello che prende l'archivio (06b)", () => {
  fixClockBeforeExpiries();
  it("A scaduto per quella data, B valido: previsto B, creata con B", async () => {
    const mem = vera([
      ["A", A04],
      ["B", B03],
    ]);
    const { predicted, r, changedExtras } = await createAndCompare(mem, "vera", "Vera Rossi", IL20);
    expect(predicted).toMatchObject({ source: "extra", credit: { id: "B" } });
    expect(r.plan).toMatchObject({ source: "extra", credit: { id: "B" } });
    expect(changedExtras.map((e) => e.id)).toEqual(["B"]);
    expect(usedOf(mem)).toEqual({ A: 0, B: 1 });
  });

  it("il solo A, scaduto per quella data: niente previsto, niente sessione", async () => {
    const mem = vera([["A", A11]]);
    const when = "2026-10-12T07:00:00.000Z";
    expect(await plan(mem, "vera", when)).toBeNull();
    await expect(
      createClientSession(mem.store, {
        coachId: COACH,
        clientId: "vera",
        clientName: "Vera Rossi",
        type: pt,
        scheduledAt: when,
        durationMin: 60,
      }),
    ).rejects.toThrow(new NoCreditError("Vera non ha crediti Personal Training disponibili."));
    expect(mem.inserted).toHaveLength(0);
    expect(usedOf(mem)).toEqual({ A: 0 });
  });

  it("il solo A, valido: previsto A, creata con A", async () => {
    const mem = vera([["A", A11]]);
    const { predicted, r, changedExtras } = await createAndCompare(
      mem,
      "vera",
      "Vera Rossi",
      "2026-10-10T07:00:00.000Z",
    );
    expect(predicted).toMatchObject({ source: "extra", credit: { id: "A" } });
    expect(r.plan).toMatchObject({ source: "extra", credit: { id: "A" } });
    expect(changedExtras.map((e) => e.id)).toEqual(["A"]);
    expect(usedOf(mem)).toEqual({ A: 1 });
  });
});
