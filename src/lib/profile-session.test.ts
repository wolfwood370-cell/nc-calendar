import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreditUnavailableError, SessionChangedError, removeSession } from "@/lib/cancel-session";
import {
  NO_CREDIT_TO_PUT_BACK,
  canEditTime,
  ignoreOrphan,
  linkOrphan,
  orphanType,
  putBackInAgenda,
  saveProfileSession,
  undoProfileSession,
  undoPutBack,
  unignoreOrphan,
  unlinkFromClient,
  type ProfileSessionInput,
} from "@/lib/profile-session";
import { createClientSession } from "@/lib/session-create";
import { changeSessionOutcome } from "@/lib/session-outcome";
import { snapshotOf } from "@/lib/session-edit";
import { COACH, NOW, TYPES, at, seedDb } from "@/lib/testing/calendar-seed";
import { createMemoryProfile, type MemoryProfile } from "@/lib/testing/memory-profile-store";

/**
 * I dati del Calendario (04). Con `pastBlock`, Marta ha anche un blocco già
 * finito (m0, 24/08–20/09) prima di quello in corso (m1).
 */
function seed(pastBlock = false) {
  const db = seedDb();
  if (!pastBlock) return createMemoryProfile(db);
  db.blocks.unshift({
    id: "m0",
    client_id: "marta",
    start_date: "2026-08-24",
    end_date: "2026-09-20",
    deleted_at: null,
  });
  for (let w = 1; w <= 4; w++) {
    db.allocations.push({
      id: `m0-pt-${w}`,
      block_id: "m0",
      event_type_id: "pt",
      session_type: "PT Session",
      week_number: w,
      quantity_assigned: 2,
      quantity_booked: 0,
      valid_until: null,
      created_at: `2026-08-20T09:0${w}:00Z`,
    });
  }
  return createMemoryProfile(db);
}

/** PT di Marta mercoledì 23/09 alle 10:00 (blocco m1, settimana 1). */
async function martaSession(mem: MemoryProfile = seed()) {
  const { sessionId } = await createClientSession(mem.store, {
    coachId: COACH,
    clientId: "marta",
    clientName: "Marta Conti",
    type: TYPES.pt,
    scheduledAt: at("2026-09-23", "10:00"),
    durationMin: 60,
  });
  return { mem, id: sessionId };
}

async function input(
  mem: MemoryProfile,
  id: string,
  over: Partial<ProfileSessionInput>,
): Promise<ProfileSessionInput> {
  const s = (await mem.store.getEditableSession(id))!;
  return {
    sessionId: id,
    expected: snapshotOf(s),
    status: s.status,
    scheduledAt: s.scheduled_at,
    durationMin: s.duration_min,
    type: TYPES.pt,
    clientName: "Marta Conti",
    notes: s.trainer_notes,
    ...over,
  };
}

const row = (mem: MemoryProfile, id: string) => mem.db.bookings.find((b) => b.id === id)!;

describe("modifica sessione: stato", () => {
  it("Programmata → Svolta con changeSessionOutcome; il credito resta", async () => {
    const { mem, id } = await martaSession();
    expect(mem.booked("m1-pt-1")).toBe(1);
    const r = await saveProfileSession(mem.store, await input(mem, id, { status: "completed" }));
    expect(row(mem, id).status).toBe("completed");
    expect(r.outcome).toEqual({ from: "scheduled", to: "completed" });
    expect(r.edit).toBeNull();
    expect(mem.booked("m1-pt-1")).toBe(1);
    await undoProfileSession(mem.store, r);
    expect(row(mem, id).status).toBe("scheduled");
  });

  it("Assente, poi di nuovo Svolta: sempre lo stesso credito", async () => {
    const { mem, id } = await martaSession();
    await saveProfileSession(mem.store, await input(mem, id, { status: "no_show" }));
    expect(row(mem, id).status).toBe("no_show");
    await saveProfileSession(mem.store, await input(mem, id, { status: "completed" }));
    expect(row(mem, id).status).toBe("completed");
    expect(mem.booked("m1-pt-1")).toBe(1);
  });
});

describe("modifica sessione: data e ora con la strada del Calendario", () => {
  it("nuova data con reschedule_booking: il credito segue la settimana", async () => {
    const { mem, id } = await martaSession();
    await saveProfileSession(
      mem.store,
      await input(mem, id, { scheduledAt: at("2026-10-07", "10:00") }),
    );
    expect(mem.rescheduleCalls).toHaveLength(1);
    expect(mem.timeUpdates).toHaveLength(0);
    expect(mem.booked("m1-pt-1")).toBe(0);
    expect(mem.booked("m1-pt-3")).toBe(1);
  });

  it("data e Svolta insieme: prima la data, poi lo stato; «Ripristina» rimette tutto", async () => {
    const { mem, id } = await martaSession();
    const r = await saveProfileSession(
      mem.store,
      await input(mem, id, { scheduledAt: at("2026-09-24", "09:00"), status: "completed" }),
    );
    expect(row(mem, id)).toMatchObject({
      status: "completed",
      scheduled_at: at("2026-09-24", "09:00"),
    });
    await undoProfileSession(mem.store, r);
    expect(row(mem, id)).toMatchObject({
      status: "scheduled",
      scheduled_at: at("2026-09-23", "10:00"),
    });
    expect(mem.booked("m1-pt-1")).toBe(1);
  });

  it("da Svolta a Programmata con una data nuova: prima lo stato, poi la data", async () => {
    const { mem, id } = await martaSession();
    await changeSessionOutcome(mem.store, id, "scheduled", "completed");
    expect(canEditTime("completed", "scheduled")).toBe(true);
    const r = await saveProfileSession(
      mem.store,
      await input(mem, id, { scheduledAt: at("2026-10-07", "10:00"), status: "scheduled" }),
    );
    expect(row(mem, id).status).toBe("scheduled");
    expect(mem.booked("m1-pt-3")).toBe(1);
    await undoProfileSession(mem.store, r);
    expect(row(mem, id)).toMatchObject({
      status: "completed",
      scheduled_at: at("2026-09-23", "10:00"),
    });
    expect(mem.booked("m1-pt-1")).toBe(1);
  });

  it("una sessione svolta che resta svolta non si sposta", async () => {
    const { mem, id } = await martaSession();
    await changeSessionOutcome(mem.store, id, "scheduled", "completed");
    expect(canEditTime("completed", "completed")).toBe(false);
    await expect(
      saveProfileSession(
        mem.store,
        await input(mem, id, { scheduledAt: at("2026-10-07", "10:00") }),
      ),
    ).rejects.toBeInstanceOf(SessionChangedError);
    expect(row(mem, id).scheduled_at).toBe(at("2026-09-23", "10:00"));
  });

  it("se lo stato non si scrive, la data torna com'era", async () => {
    const { mem, id } = await martaSession();
    const store = {
      ...mem.store,
      updateSession: async () => false,
    };
    await expect(
      saveProfileSession(
        store,
        await input(mem, id, { scheduledAt: at("2026-10-07", "10:00"), status: "completed" }),
      ),
    ).rejects.toBeInstanceOf(SessionChangedError);
    expect(row(mem, id)).toMatchObject({
      status: "scheduled",
      scheduled_at: at("2026-09-23", "10:00"),
    });
    expect(mem.booked("m1-pt-1")).toBe(1);
    expect(mem.booked("m1-pt-3")).toBe(0);
  });

  it("una sessione annullata cambia solo le note", async () => {
    expect(canEditTime("cancelled", "cancelled")).toBe(false);
    const { mem, id } = await martaSession();
    await removeSession(mem.store, { sessionId: id, removal: "cancel", now: NOW });
    const r = await saveProfileSession(
      mem.store,
      await input(mem, id, { status: "scheduled", notes: "Recupero la prossima settimana" }),
    );
    expect(r.outcome).toBeNull();
    expect(row(mem, id)).toMatchObject({
      status: "cancelled",
      trainer_notes: "Recupero la prossima settimana",
    });
  });
});

describe("«Rimetti in agenda»", () => {
  it("annullata col credito restituito: riprende il credito con l'ordine del server", async () => {
    const { mem, id } = await martaSession();
    const removed = await removeSession(mem.store, { sessionId: id, removal: "cancel", now: NOW });
    expect(removed.credit).toBe("refunded");
    expect(mem.booked("m1-pt-1")).toBe(0);
    const r = await putBackInAgenda(mem.store, id);
    expect(row(mem, id).status).toBe("scheduled");
    expect(r.taken).toEqual({ kind: "allocation", id: "m1-pt-1" });
    expect(mem.booked("m1-pt-1")).toBe(1);
    expect(r.googleEventRecreated).toBe(true);
    await undoPutBack(mem.store, r);
    expect(row(mem, id).status).toBe("cancelled");
    expect(mem.booked("m1-pt-1")).toBe(0);
  });

  it("senza capienza lo dice e non rimette niente", async () => {
    const mem = seed();
    mem.put({
      id: "luca-x",
      client_id: "luca",
      block_id: "l1",
      event_type_id: "pt",
      status: "cancelled",
      scheduled_at: at("2026-09-28", "18:00"),
    });
    await expect(putBackInAgenda(mem.store, "luca-x")).rejects.toBeInstanceOf(
      CreditUnavailableError,
    );
    expect(row(mem, "luca-x").status).toBe("cancelled");
    expect(mem.booked("l1-pt")).toBe(4);
    expect(mem.google.created).toEqual([]);
  });

  it("annullata tardi: il credito è già suo, nessun movimento", async () => {
    const mem = seed();
    mem.put({
      id: "late",
      client_id: "marta",
      block_id: "m1",
      event_type_id: "pt",
      status: "late_cancelled",
      scheduled_at: at("2026-09-24", "18:00"),
    });
    const before = JSON.stringify(mem.db.allocations);
    const r = await putBackInAgenda(mem.store, "late");
    expect(r.taken).toBeNull();
    expect(row(mem, "late").status).toBe("scheduled");
    expect(JSON.stringify(mem.db.allocations)).toBe(before);
  });

  it("senza blocco: dagli extra della tipologia, scadenza più vicina", async () => {
    const mem = seed();
    mem.put({
      id: "sara-x",
      client_id: "sara",
      event_type_id: "pt",
      status: "cancelled",
      scheduled_at: at("2026-09-29", "18:00"),
    });
    const r = await putBackInAgenda(mem.store, "sara-x");
    expect(r.taken).toEqual({ kind: "extra", id: "s-pt-soon" });
    expect(mem.extraBooked("s-pt-soon")).toBe(1);
  });

  it("l'evento Google vecchio si toglie, quello nuovo si crea", async () => {
    const mem = seed();
    mem.put({
      id: "g",
      client_id: "marta",
      block_id: "m1",
      event_type_id: "pt",
      status: "late_cancelled",
      google_event_id: "vecchio",
      scheduled_at: at("2026-09-24", "18:00"),
    });
    await putBackInAgenda(mem.store, "g");
    expect(mem.google.deleted).toEqual(["vecchio"]);
    expect(row(mem, "g").google_event_id).toBe("g-g");
  });

  it("una sessione non annullata non si rimette", async () => {
    const { mem, id } = await martaSession();
    await expect(putBackInAgenda(mem.store, id)).rejects.toBeInstanceOf(SessionChangedError);
  });

  describe("senza blocco: solo un extra che vale alla data della sessione (06b)", () => {
    // Le scadenze come le scrive stripe-webhook, la fine di un giorno di Roma:
    // A a fine domenica 4/10, B a fine martedì 3/11. La sessione è di martedì
    // 20/10 alle 9:00, messa così com'è (creata, la prenderebbe il trigger
    // dell'archivio): annullata, oppure in programma per Annulla e Scollega.
    const A04 = "2026-10-04T21:59:59.999Z";
    const B03 = "2026-11-03T22:59:59.999Z";
    const IL20 = "2026-10-20T07:00:00.000Z";
    // L'orologio fermo al 1/10, prima di ogni scadenza dei casi: una regola che
    // guardasse oggi invece della data della sessione cadrebbe anche dopo il 4/10.
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-01T08:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const veraWith = (
      extras: Array<[id: string, expiresAt: string, booked?: number]>,
      status: "cancelled" | "scheduled" = "cancelled",
    ) => {
      const mem = createMemoryProfile({
        types: [TYPES.pt],
        blocks: [],
        allocations: [],
        extras: extras.map(([id, expires_at, booked = 0]) => ({
          id,
          client_id: "vera",
          event_type_id: "pt",
          quantity: 1,
          quantity_booked: booked,
          expires_at,
        })),
        bookings: [],
      });
      mem.put({
        id: "s",
        client_id: "vera",
        coach_id: COACH,
        event_type_id: "pt",
        status,
        scheduled_at: IL20,
      });
      return mem;
    };

    it("A scaduto per quella data, B valido: riprende B", async () => {
      const mem = veraWith([
        ["A", A04],
        ["B", B03],
      ]);
      const r = await putBackInAgenda(mem.store, "s");
      expect(r.taken).toEqual({ kind: "extra", id: "B" });
      expect(row(mem, "s").status).toBe("scheduled");
      expect(mem.extraBooked("A")).toBe(0);
      expect(mem.extraBooked("B")).toBe(1);
    });

    it("il solo A, scaduto per quella data: lo dice e la sessione resta annullata", async () => {
      const mem = veraWith([["A", A04]]);
      const err = await putBackInAgenda(mem.store, "s").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CreditUnavailableError);
      expect((err as Error).message).toBe(NO_CREDIT_TO_PUT_BACK);
      expect(row(mem, "s").status).toBe("cancelled");
      expect(mem.extraBooked("A")).toBe(0);
    });

    it("Annulla e poi Rimetti in agenda: il credito torna a B e si riprende da B", async () => {
      const mem = veraWith(
        [
          ["A", A04, 1],
          ["B", B03, 1],
        ],
        "scheduled",
      );
      const removed = await removeSession(mem.store, {
        sessionId: "s",
        removal: "cancel",
        now: new Date("2026-10-01T08:00:00.000Z"),
      });
      expect(removed.refunded).toEqual({ kind: "extra", id: "B" });
      expect([mem.extraBooked("A"), mem.extraBooked("B")]).toEqual([1, 0]);
      const r = await putBackInAgenda(mem.store, "s");
      expect(r.taken).toEqual({ kind: "extra", id: "B" });
      expect([mem.extraBooked("A"), mem.extraBooked("B")]).toEqual([1, 1]);
    });

    it("«Scollega dal profilo»: il credito torna a B, non ad A scaduto", async () => {
      const mem = veraWith(
        [
          ["A", A04, 1],
          ["B", B03, 1],
        ],
        "scheduled",
      );
      const r = await unlinkFromClient(mem.store, "s", "vera");
      expect(r.creditReturned).toBe(true);
      expect(row(mem, "s").client_id).toBeNull();
      expect([mem.extraBooked("A"), mem.extraBooked("B")]).toEqual([1, 0]);
    });
  });
});

describe("sessioni fuori percorso", () => {
  it("«Collega» prende il credito dal blocco della data, non da quello in corso", async () => {
    const mem = seed(true);
    mem.put({ id: "gcal", scheduled_at: at("2026-09-18", "17:00"), title: "PT Marta (da Google)" });
    const r = await linkOrphan(mem.store, { eventId: "gcal", clientId: "marta", type: TYPES.pt });
    expect(r.credit).toEqual({ kind: "allocation", id: "m0-pt-4" });
    expect(mem.booked("m0-pt-4")).toBe(1);
    expect(
      mem.db.allocations.filter((a) => a.block_id === "m1").every((a) => a.quantity_booked === 0),
    ).toBe(true);
    expect(row(mem, "gcal")).toMatchObject({
      client_id: "marta",
      block_id: "m0",
      event_type_id: "pt",
    });
  });

  it("senza un blocco per quella data: dagli extra", async () => {
    const mem = seed();
    mem.put({ id: "gcal", scheduled_at: at("2026-09-18", "17:00"), title: "PT Sara" });
    const r = await linkOrphan(mem.store, { eventId: "gcal", clientId: "sara", type: TYPES.pt });
    expect(r.credit).toEqual({ kind: "extra", id: "s-pt-soon" });
    expect(row(mem, "gcal").block_id).toBeNull();
  });

  it("senza credito lo dice e non collega", async () => {
    const mem = seed();
    mem.put({ id: "gcal", scheduled_at: at("2026-09-23", "17:00"), title: "PT Luca" });
    await expect(
      linkOrphan(mem.store, { eventId: "gcal", clientId: "luca", type: TYPES.pt }),
    ).rejects.toBeInstanceOf(CreditUnavailableError);
    expect(row(mem, "gcal").client_id).toBeNull();
  });

  it("la tipologia: quella dell'evento, altrimenti dal titolo", () => {
    const types = Object.values(TYPES);
    const o = { id: "x", scheduled_at: "", title: "Misurazione BIA Marta", notes: null };
    expect(orphanType({ ...o, event_type_id: "test" }, types)?.id).toBe("test");
    expect(orphanType({ ...o, event_type_id: null }, types)?.id).toBe("bia");
  });

  it("«Ignora» mette il cliente in ignored_by_clients; «Ripristina» lo toglie", async () => {
    const mem = seed();
    mem.ignored.set("gcal", ["altro"]);
    await ignoreOrphan(mem.store, "gcal", "marta");
    expect(mem.ignored.get("gcal")).toEqual(["altro", "marta"]);
    await ignoreOrphan(mem.store, "gcal", "marta");
    expect(mem.ignored.get("gcal")).toEqual(["altro", "marta"]);
    await unignoreOrphan(mem.store, "gcal", "marta");
    expect(mem.ignored.get("gcal")).toEqual(["altro"]);
  });

  it("«Scollega dal profilo»: via cliente e blocco, il credito torna", async () => {
    const { mem, id } = await martaSession();
    const r = await unlinkFromClient(mem.store, id, "marta");
    expect(r.creditReturned).toBe(true);
    expect(row(mem, id)).toMatchObject({ client_id: null, block_id: null });
    expect(mem.booked("m1-pt-1")).toBe(0);
    expect(mem.ignored.get(id)).toEqual(["marta"]);
  });
});
