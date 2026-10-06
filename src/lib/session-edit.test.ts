import { describe, expect, it } from "vitest";
import { CreditUnavailableError, SessionChangedError } from "@/lib/cancel-session";
import { NoCreditError, createClientSession, createCommitment } from "@/lib/session-create";
import {
  TYPE_THEN_DATE_MESSAGE,
  editSession,
  snapshotOf,
  undoEdit,
  type EditInput,
} from "@/lib/session-edit";
import { COACH, TYPES, at, seedDb } from "@/lib/testing/calendar-seed";
import { createMemoryCalendar, type MemoryCalendar } from "@/lib/testing/memory-calendar-store";

const state = (mem: MemoryCalendar) =>
  JSON.stringify({
    allocations: mem.db.allocations.map((a) => [a.id, a.quantity_booked]),
    extras: mem.db.extras.map((e) => [e.id, e.quantity_booked]),
    bookings: mem.db.bookings.map((b) => ({ ...b, end_at: undefined })),
  });

/** Marta: PT mercoledì 23/09 alle 10:00 (settimana 1 del blocco m1). */
async function withMartaSession() {
  const mem = createMemoryCalendar(seedDb());
  const { sessionId } = await createClientSession(mem.store, {
    coachId: COACH,
    clientId: "marta",
    clientName: "Marta Conti",
    type: TYPES.pt,
    scheduledAt: at("2026-09-23", "10:00"),
    durationMin: 60,
  });
  const s = (await mem.store.getEditableSession(sessionId))!;
  return { mem, s, id: sessionId };
}

function input(
  s: Awaited<ReturnType<typeof withMartaSession>>["s"],
  over: Partial<EditInput>,
): EditInput {
  return {
    sessionId: s.id,
    expected: snapshotOf(s),
    scheduledAt: s.scheduled_at,
    durationMin: s.duration_min,
    clientName: "Marta Conti",
    notes: s.trainer_notes,
    ...over,
  };
}

describe("modifica · data e ora", () => {
  it("sessione cliente: passa da reschedule_booking e il credito segue la settimana", async () => {
    const { mem, s } = await withMartaSession();
    expect(mem.booked("m1-pt-1")).toBe(1);
    const r = await editSession(mem.store, input(s, { scheduledAt: at("2026-10-07", "10:00") }));
    expect(mem.rescheduleCalls).toHaveLength(1);
    expect(mem.timeUpdates).toHaveLength(0);
    expect(r.rescheduled).toBe(true);
    expect(mem.booked("m1-pt-1")).toBe(0);
    expect(mem.booked("m1-pt-3")).toBe(1);
  });

  it("impegno: un update, niente reschedule_booking", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { sessionId } = await createCommitment(mem.store, {
      coachId: COACH,
      title: "Dentista",
      scheduledAt: at("2026-09-28", "13:00"),
      durationMin: 60,
    });
    const s = (await mem.store.getEditableSession(sessionId))!;
    await editSession(mem.store, {
      sessionId,
      expected: snapshotOf(s),
      scheduledAt: at("2026-09-28", "15:00"),
      durationMin: 45,
      title: "Commercialista",
    });
    expect(mem.rescheduleCalls).toHaveLength(0);
    expect(mem.timeUpdates).toEqual([sessionId]);
    expect(mem.db.bookings[0]).toMatchObject({ title: "Commercialista", duration_min: 45 });
  });

  it("l'evento Google segue la modifica; se Google non risponde la modifica resta", async () => {
    const { mem, s } = await withMartaSession();
    const r = await editSession(mem.store, input(s, { scheduledAt: at("2026-09-24", "11:00") }));
    expect(r.googleUpdated).toBe(true);
    expect(mem.google.updated.at(-1)).toMatchObject({
      id: s.google_event_id,
      startISO: at("2026-09-24", "11:00"),
      endISO: at("2026-09-24", "12:00"),
    });
    mem.google.failUpdate = true;
    const s2 = (await mem.store.getEditableSession(s.id))!;
    const r2 = await editSession(mem.store, input(s2, { scheduledAt: at("2026-09-24", "12:00") }));
    expect(r2.googleUpdated).toBe(false);
    expect(mem.db.bookings[0]!.scheduled_at).toBe(at("2026-09-24", "12:00"));
  });

  it("una sessione già svolta non si sposta", async () => {
    const { mem, s } = await withMartaSession();
    mem.db.bookings[0]!.status = "completed";
    const fresh = (await mem.store.getEditableSession(s.id))!;
    await expect(
      editSession(mem.store, input(fresh, { scheduledAt: at("2026-09-24", "11:00") })),
    ).rejects.toThrow(SessionChangedError);
    expect(mem.rescheduleCalls).toHaveLength(0);
  });
});

describe("modifica · tipologia", () => {
  it("il credito si sposta: torna quello PT, si prende quello BIA", async () => {
    const { mem, s } = await withMartaSession();
    const r = await editSession(mem.store, input(s, { type: TYPES.bia, durationMin: 30 }));
    expect(mem.booked("m1-pt-1")).toBe(0);
    expect(mem.booked("m1-bia")).toBe(1);
    expect(mem.db.bookings[0]).toMatchObject({
      event_type_id: "bia",
      session_type: "BIA",
      duration_min: 30,
      block_id: "m1",
    });
    expect(r.typeMove).toMatchObject({
      released: { kind: "allocation", id: "m1-pt-1" },
      taken: { kind: "allocation", id: "m1-bia" },
    });
  });

  it("senza credito della tipologia nuova non cambia niente", async () => {
    const { mem, s } = await withMartaSession();
    mem.db.allocations.find((a) => a.id === "m1-bia")!.quantity_booked = 1;
    mem.db.extras.find((e) => e.id === "m-bia-extra")!.quantity_booked = 1;
    const before = state(mem);
    await expect(editSession(mem.store, input(s, { type: TYPES.bia }))).rejects.toThrow(
      new NoCreditError("Marta non ha crediti Misurazione BIA disponibili."),
    );
    expect(state(mem)).toBe(before);
  });

  it("senza credito della tipologia nuova, anche la data resta quella di prima", async () => {
    const { mem, s } = await withMartaSession();
    mem.db.allocations.find((a) => a.id === "m1-bia")!.quantity_booked = 1;
    mem.db.extras.find((e) => e.id === "m-bia-extra")!.quantity_booked = 1;
    const before = state(mem);
    await expect(
      editSession(mem.store, input(s, { type: TYPES.bia, scheduledAt: at("2026-10-07", "10:00") })),
    ).rejects.toThrow(NoCreditError);
    expect(state(mem)).toBe(before);
  });
});

describe("modifica · «Ripristina»", () => {
  it("data, tipologia, durata e note tornano com'erano, crediti compresi", async () => {
    const { mem, s } = await withMartaSession();
    const before = state(mem);
    const r = await editSession(
      mem.store,
      input(s, {
        scheduledAt: at("2026-10-07", "11:00"),
        type: TYPES.bia,
        durationMin: 30,
        notes: "Portare la fascia cardio.",
      }),
    );
    expect(mem.db.bookings[0]).toMatchObject({
      event_type_id: "bia",
      trainer_notes: "Portare la fascia cardio.",
    });
    expect(state(mem)).not.toBe(before);
    await undoEdit(mem.store, r);
    expect(state(mem)).toBe(before);
  });

  it("solo data: il credito torna sulla sua settimana", async () => {
    const { mem, s } = await withMartaSession();
    const before = state(mem);
    const r = await editSession(mem.store, input(s, { scheduledAt: at("2026-10-14", "09:00") }));
    expect(mem.booked("m1-pt-4")).toBe(1);
    await undoEdit(mem.store, r);
    expect(state(mem)).toBe(before);
  });

  it("se nel frattempo la sessione è cambiata, lo dice e non tocca niente", async () => {
    const { mem, s } = await withMartaSession();
    const r = await editSession(
      mem.store,
      input(s, { scheduledAt: at("2026-10-07", "11:00"), type: TYPES.bia }),
    );
    mem.db.bookings[0]!.trainer_notes = "Scritta altrove";
    const before = state(mem);
    await expect(undoEdit(mem.store, r)).rejects.toThrow(SessionChangedError);
    expect(state(mem)).toBe(before);
  });

  it("se il credito di prima è stato usato nel frattempo, la sessione resta com'è", async () => {
    const { mem, s } = await withMartaSession();
    const r = await editSession(mem.store, input(s, { type: TYPES.bia, durationMin: 30 }));
    mem.db.allocations.find((a) => a.id === "m1-pt-1")!.quantity_booked = 2;
    const before = state(mem);
    await expect(undoEdit(mem.store, r)).rejects.toThrow(CreditUnavailableError);
    expect(state(mem)).toBe(before);
  });

  it("la modifica parte da com'era la sessione quando si è aperto il dialog", async () => {
    const { mem, s } = await withMartaSession();
    const stale = input(s, { durationMin: 45 });
    mem.db.bookings[0]!.trainer_notes = "Cambiata altrove";
    await expect(editSession(mem.store, stale)).rejects.toThrow(SessionChangedError);
    expect(mem.db.bookings[0]!.duration_min).toBe(60);
  });
});

// Il trigger delle durate com'è dal giro del 02/10/2026 (set_booking_duration_defaults, passata
// 10 del lato cliente): la durata della tipologia vale quando la sessione nasce senza una durata
// sua o cambia tipologia; uno spostamento non la ricalcola.
describe("modifica · la durata (trigger delle durate dal giro del 02/10/2026)", () => {
  it("cambiando tipologia e tenendo 60 minuti, la sessione resta di 60: la durata si scrive dopo la tipologia, e il server non la riporta più a quella della tipologia", async () => {
    const mem = createMemoryCalendar(seedDb());
    // Senza evento Google: per le righe con google_event_id il server la durata non la tocca mai.
    mem.google.failCreate = true;
    const { sessionId } = await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "marta",
      clientName: "Marta Conti",
      type: TYPES.pt,
      scheduledAt: at("2026-09-23", "10:00"),
      durationMin: 60,
    });
    const s = (await mem.store.getEditableSession(sessionId))!;
    expect(s.google_event_id).toBeNull();
    const row = () => mem.db.bookings.find((b) => b.id === sessionId)!;
    await editSession(mem.store, input(s, { type: TYPES.bia, durationMin: 60 }));
    expect(row()).toMatchObject({ event_type_id: "bia", duration_min: 60 });
    // e con un'altra durata scelta nel dialog, quella
    const s2 = (await mem.store.getEditableSession(sessionId))!;
    await editSession(mem.store, input(s2, { type: TYPES.pt, durationMin: 30 }));
    expect(row()).toMatchObject({ event_type_id: "pt", duration_min: 30 });
  });

  it("una sessione creata a 60 minuti di una tipologia da 30 resta di 60, anche spostata", async () => {
    const mem = createMemoryCalendar(seedDb());
    // Senza evento Google, come sopra: così lo spostamento prova che il server la durata non la ricalcola.
    mem.google.failCreate = true;
    const { sessionId } = await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "marta",
      clientName: "Marta Conti",
      type: TYPES.bia,
      scheduledAt: at("2026-09-23", "11:30"),
      durationMin: 60,
    });
    const row = () => mem.db.bookings.find((b) => b.id === sessionId)!;
    expect(row()).toMatchObject({ duration_min: 60, google_event_id: null });
    const s = (await mem.store.getEditableSession(sessionId))!;
    await editSession(mem.store, input(s, { scheduledAt: at("2026-09-24", "11:30") }));
    expect(row()).toMatchObject({ duration_min: 60, scheduled_at: at("2026-09-24", "11:30") });
  });
});

describe("modifica · tipologia con scadenze vere (passata 11)", () => {
  /** Marta con due extra BIA: uno scaduto il 30/09 e uno che vale fino al 2100; m1-bia esaurito. */
  function withBiaExtras() {
    const db = seedDb();
    db.allocations.find((a) => a.id === "m1-bia")!.quantity_booked = 1;
    db.extras.find((e) => e.id === "m-bia-extra")!.quantity = 0;
    db.extras.push(
      {
        id: "m-bia-scaduto",
        client_id: "marta",
        event_type_id: "bia",
        quantity: 2,
        quantity_booked: 0,
        expires_at: "2026-09-30T21:59:59.999Z",
      },
      {
        id: "m-bia-valido",
        client_id: "marta",
        event_type_id: "bia",
        quantity: 1,
        quantity_booked: 0,
        expires_at: "2100-01-01T00:00:00Z",
      },
    );
    return db;
  }

  it("verso una tipologia pagata da extra: si prende quello che vale alla data, non quello scaduto", async () => {
    const mem = createMemoryCalendar(withBiaExtras());
    const { sessionId } = await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "marta",
      clientName: "Marta Conti",
      type: TYPES.pt,
      scheduledAt: at("2026-10-07", "10:00"),
      durationMin: 60,
    });
    const s = (await mem.store.getEditableSession(sessionId))!;
    const r = await editSession(mem.store, input(s, { type: TYPES.bia }));
    expect(r.typeMove?.taken).toEqual({ kind: "extra", id: "m-bia-valido" });
    expect(mem.db.extras.find((e) => e.id === "m-bia-scaduto")!.quantity_booked).toBe(0);
    expect(mem.db.extras.find((e) => e.id === "m-bia-valido")!.quantity_booked).toBe(1);
  });

  it("verso una tipologia con il solo extra scaduto: non si salva e niente cambia", async () => {
    const db = withBiaExtras();
    db.extras.find((e) => e.id === "m-bia-valido")!.quantity = 0;
    const mem = createMemoryCalendar(db);
    const { sessionId } = await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "marta",
      clientName: "Marta Conti",
      type: TYPES.pt,
      scheduledAt: at("2026-10-07", "10:00"),
      durationMin: 60,
    });
    const s = (await mem.store.getEditableSession(sessionId))!;
    const before = state(mem);
    await expect(editSession(mem.store, input(s, { type: TYPES.bia }))).rejects.toBeInstanceOf(
      NoCreditError,
    );
    expect(state(mem)).toBe(before);
  });

  it("tipologia e data insieme, con l'extra di prima che scade in mezzo: un messaggio che dice come fare, e niente cambia", async () => {
    // Sara: PT pagata dall'extra che scade il 10/10; la sposti al 20/10 e la fai BIA.
    const db = seedDb();
    db.extras.find((e) => e.id === "s-pt-late")!.quantity = 0;
    db.extras.find((e) => e.id === "s-pt-soon")!.expires_at = "2026-10-10T21:59:59.999Z";
    db.extras.push({
      id: "s-bia",
      client_id: "sara",
      event_type_id: "bia",
      quantity: 1,
      quantity_booked: 0,
      expires_at: "2100-01-01T00:00:00Z",
    });
    const mem = createMemoryCalendar(db);
    const { sessionId } = await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "sara",
      clientName: "Sara",
      type: TYPES.pt,
      scheduledAt: at("2026-10-07", "10:00"),
      durationMin: 60,
    });
    const s = (await mem.store.getEditableSession(sessionId))!;
    const before = state(mem);
    const err = await editSession(
      mem.store,
      input(s, { type: TYPES.bia, scheduledAt: at("2026-10-20", "10:00"), clientName: "Sara" }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoCreditError);
    expect((err as Error).message).toBe(TYPE_THEN_DATE_MESSAGE);
    expect(state(mem)).toBe(before);
  });
});

describe("modifica · tipologia e data insieme, senza la via dei due salvataggi (passata 11)", () => {
  it("la tipologia nuova ha credito solo alla data nuova: l'errore dello spostamento, non il consiglio", async () => {
    const db = seedDb();
    // PT di Marta il 7/10 pagata da un extra PT che scade il 10/10 (i PT di m1 esauriti); la BIA solo in m2.
    for (const a of db.allocations)
      if (a.block_id === "m1" && a.event_type_id === "pt") a.quantity_booked = 2;
    db.extras.push({
      id: "m-pt-presto",
      client_id: "marta",
      event_type_id: "pt",
      quantity: 1,
      quantity_booked: 0,
      expires_at: "2026-10-10T21:59:59.999Z",
    });
    db.allocations.find((a) => a.id === "m1-bia")!.quantity_booked = 1;
    db.extras.find((e) => e.id === "m-bia-extra")!.quantity = 0;
    db.allocations.push({
      id: "m2-bia",
      block_id: "m2",
      event_type_id: "bia",
      session_type: "BIA",
      week_number: 1,
      quantity_assigned: 1,
      quantity_booked: 0,
      valid_until: null,
      created_at: "2026-10-18T09:05:00Z",
    });
    const mem = createMemoryCalendar(db);
    const { sessionId } = await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "marta",
      clientName: "Marta Conti",
      type: TYPES.pt,
      scheduledAt: at("2026-10-07", "10:00"),
      durationMin: 60,
    });
    const s = (await mem.store.getEditableSession(sessionId))!;
    expect(s.block_id).toBeNull();
    const before = state(mem);
    const err = await editSession(
      mem.store,
      input(s, { type: TYPES.bia, scheduledAt: at("2026-10-20", "10:00") }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toBe(TYPE_THEN_DATE_MESSAGE);
    expect((err as Error).message).toMatch(/credit/i);
    expect(state(mem)).toBe(before);
  });
});

describe("«Ripristina» e la durata (passata 11)", () => {
  it("una BIA tenuta a 60, cambiata in PT e ripristinata, torna BIA di 60 minuti, non di 30", async () => {
    const mem = createMemoryCalendar(seedDb());
    // Senza evento Google: il trigger delle durate guarda solo le righe con google_event_id vuoto.
    mem.google.failCreate = true;
    const { sessionId } = await createClientSession(mem.store, {
      coachId: COACH,
      clientId: "marta",
      clientName: "Marta Conti",
      type: TYPES.bia,
      scheduledAt: at("2026-09-23", "10:00"),
      durationMin: 30,
    });
    let s = (await mem.store.getEditableSession(sessionId))!;
    // Il coach la tiene a 60 minuti.
    await editSession(mem.store, input(s, { durationMin: 60 }));
    s = (await mem.store.getEditableSession(sessionId))!;
    expect(s.duration_min).toBe(60);
    const r = await editSession(mem.store, input(s, { type: TYPES.pt }));
    expect(mem.db.bookings[0]).toMatchObject({ event_type_id: "pt", duration_min: 60 });
    await undoEdit(mem.store, r);
    expect(mem.db.bookings[0]).toMatchObject({ event_type_id: "bia", duration_min: 60 });
  });

  it("l'archivio dei test fa come il trigger anche coi valori nulli", async () => {
    const mem = createMemoryCalendar(seedDb());
    const { sessionId } = await createCommitment(mem.store, {
      coachId: COACH,
      title: "Dentista",
      scheduledAt: at("2026-09-28", "13:00"),
      durationMin: 60,
    });
    const b = mem.db.bookings.find((x) => x.id === sessionId)!;
    (b as unknown as { buffer_min: number | null }).buffer_min = null;
    (b as unknown as { duration_min: number | null }).duration_min = null;
    const s = (await mem.store.getEditableSession(sessionId))!;
    await mem.store.updateSessionFields(
      sessionId,
      { status: s.status },
      { title: "Commercialista" },
    );
    // Senza tipologia: durata 60 e margine 0, come le COALESCE in fondo al trigger.
    expect(b.duration_min).toBe(60);
    expect(b.buffer_min).toBe(0);
    expect(Date.parse(b.end_at) - Date.parse(b.scheduled_at)).toBe(60 * 60_000);
  });
});
