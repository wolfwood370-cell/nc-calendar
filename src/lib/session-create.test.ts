import { describe, expect, it } from "vitest";
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

  it("il server tiene la durata della tipologia se si sceglie 60 minuti (trigger delle durate)", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { row } = await createAndCompare(mem, "marta", "Marta Conti", at("2026-10-01", "09:00"), {
      ...TYPES.bia,
      duration: 60,
    });
    expect(row.duration_min).toBe(30);
  });
});
