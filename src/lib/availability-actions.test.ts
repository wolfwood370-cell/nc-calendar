import { describe, expect, it } from "vitest";
import {
  EXCEPTION_REMOVE_INCOMPLETE,
  WEEK_SAVE_INCOMPLETE,
  WeekSaveError,
  WeekSaveIncompleteError,
  addException,
  planWeek,
  removeExceptions,
  restoreExceptions,
  saveWeek,
  slotsOfRows,
} from "@/lib/availability-actions";
import { groupExceptions } from "@/lib/availability-exceptions";
import { weekFromRows, weekSlots, type WeekSlot } from "@/lib/availability-week";
import type { AvailabilityExceptionRow, AvailabilityRow } from "@/lib/queries";
import {
  createMemoryAvailability,
  type MemoryAvailability,
} from "@/lib/testing/memory-availability-store";

const COACH = "coach";

function avail(id: string, dow: number, start: string, end: string): AvailabilityRow {
  return {
    id,
    coach_id: COACH,
    day_of_week: dow,
    start_time: `${start}:00`,
    end_time: `${end}:00`,
  };
}

/** Il backup del 26/09: dal lunedì al venerdì 10-20, il sabato 10-15:30; più un altro coach. */
function seed(): MemoryAvailability {
  return createMemoryAvailability({
    availability: [
      avail("lun", 1, "10:00", "20:00"),
      avail("mar", 2, "10:00", "20:00"),
      avail("mer", 3, "10:00", "20:00"),
      avail("gio", 4, "10:00", "20:00"),
      avail("ven", 5, "10:00", "20:00"),
      avail("sab", 6, "10:00", "15:30"),
      { ...avail("altro", 1, "08:00", "09:00"), coach_id: "altro-coach" },
    ],
    exceptions: [],
  });
}

/** Le righe del coach come chiavi ordinate: giorno, inizio, fine. */
function keysOf(rows: readonly AvailabilityRow[]): string[] {
  return rows
    .filter((r) => r.coach_id === COACH)
    .map((r) => `${r.day_of_week} ${r.start_time.slice(0, 5)}-${r.end_time.slice(0, 5)}`)
    .sort();
}

function keysOfSlots(slots: readonly WeekSlot[]): string[] {
  return slots.map((s) => `${s.day_of_week} ${s.start}-${s.end}`).sort();
}

/** La bozza: lunedì 07-14 e 15-21 al posto di 10-20, il resto come prima. */
function draftMondaySplit(mem: MemoryAvailability): WeekSlot[] {
  const w = weekFromRows(mem.db.availability.filter((r) => r.coach_id === COACH));
  w[1] = {
    active: true,
    ranges: [
      { start: "07:00", end: "14:00" },
      { start: "15:00", end: "21:00" },
    ],
  };
  return weekSlots(w);
}

describe("piano del salvataggio", () => {
  it("le righe uguali restano, le nuove si inseriscono, le vecchie si cancellano", () => {
    const current = [avail("a", 1, "10:00", "20:00"), avail("b", 2, "10:00", "20:00")];
    const plan = planWeek(current, [
      { day_of_week: 1, start: "10:00", end: "20:00" },
      { day_of_week: 2, start: "09:00", end: "20:00" },
    ]);
    expect(plan.keep.map((r) => r.id)).toEqual(["a"]);
    expect(plan.insert).toEqual([{ day_of_week: 2, start: "09:00", end: "20:00" }]);
    expect(plan.remove.map((r) => r.id)).toEqual(["b"]);
  });

  it("doppioni: due righe uguali e una fascia sola, una resta e l'altra va", () => {
    const current = [avail("a", 1, "10:00", "20:00"), avail("a2", 1, "10:00", "20:00")];
    const plan = planWeek(current, [{ day_of_week: 1, start: "10:00", end: "20:00" }]);
    expect(plan.keep.map((r) => r.id)).toEqual(["a"]);
    expect(plan.insert).toEqual([]);
    expect(plan.remove.map((r) => r.id)).toEqual(["a2"]);
  });

  it("piano vuoto: rilegge e non scrive niente", async () => {
    const mem = seed();
    const target = slotsOfRows(mem.db.availability.filter((r) => r.coach_id === COACH));
    const res = await saveWeek(mem.store, COACH, target);
    expect(mem.writes()).toEqual([]);
    expect(mem.requests).toEqual([{ op: "read", table: "trainer_availability" }]);
    expect(res).toMatchObject({ inserted: 0, removed: 0 });
  });
});

describe("salvataggio dell'orario", () => {
  it("prima l'inserimento e poi la cancellazione, una richiesta ciascuno, solo il giorno cambiato", async () => {
    const mem = seed();
    const target = draftMondaySplit(mem);
    const res = await saveWeek(mem.store, COACH, target);
    expect(mem.requests.map((r) => `${r.op} ${r.table}`)).toEqual([
      "read trainer_availability",
      "insert trainer_availability",
      "delete trainer_availability",
    ]);
    const [ins, del] = mem.writes();
    expect(ins).toMatchObject({
      rows: [
        { coach_id: COACH, day_of_week: 1, start_time: "07:00:00", end_time: "14:00:00" },
        { coach_id: COACH, day_of_week: 1, start_time: "15:00:00", end_time: "21:00:00" },
      ],
    });
    expect(del).toMatchObject({ ids: ["lun"] });
    expect(keysOf(mem.db.availability)).toEqual(keysOfSlots(target));
    expect(keysOf(res.after)).toEqual(keysOfSlots(target));
    // L'altro coach non si tocca.
    expect(mem.db.availability.some((r) => r.id === "altro")).toBe(true);
  });

  it("rilegge dal database, non dalla cache della pagina", async () => {
    const mem = seed();
    // Nel frattempo, da un altro dispositivo, il sabato è stato tolto.
    mem.db.availability = mem.db.availability.filter((r) => r.id !== "sab");
    const target = draftMondaySplit(mem);
    await saveWeek(mem.store, COACH, [...target, { day_of_week: 6, start: "10:00", end: "15:30" }]);
    expect(keysOf(mem.db.availability)).toContain("6 10:00-15:30");
    expect(mem.writes()[0]).toMatchObject({
      rows: expect.arrayContaining([expect.objectContaining({ day_of_week: 6 })]),
    });
  });

  it("inserimento fallito: righe come prima, nessuna cancellazione, «Salvataggio non riuscito»", async () => {
    const mem = seed();
    const beforeKeys = keysOf(mem.db.availability);
    mem.fail.insert = true;
    const err = await saveWeek(mem.store, COACH, draftMondaySplit(mem)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeekSaveError);
    expect((err as Error).message).toBe("Salvataggio non riuscito: violates check constraint");
    expect(keysOf(mem.db.availability)).toEqual(beforeKeys);
    expect(mem.writes().map((w) => w.op)).toEqual(["insert"]);
  });

  it("lettura fallita: nessuna scrittura", async () => {
    const mem = seed();
    mem.fail.read = true;
    const err = await saveWeek(mem.store, COACH, []).catch((e: unknown) => e);
    expect((err as Error).message).toBe("Salvataggio non riuscito: rete assente");
    expect(mem.writes()).toEqual([]);
    expect(keysOf(mem.db.availability)).toHaveLength(6);
  });

  it("cancellazione fallita: «incompleto» con le righe vere; il salvataggio dopo porta il database alla bozza", async () => {
    const mem = seed();
    const target = draftMondaySplit(mem);
    mem.fail.delete = true;
    const err = await saveWeek(mem.store, COACH, target).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeekSaveIncompleteError);
    expect((err as Error).message).toBe(WEEK_SAVE_INCOMPLETE);
    expect((err as Error).message).toBe(
      "Salvataggio incompleto: gli orari nuovi ci sono, ma quelli vecchi non sono stati tolti. Riprova.",
    );
    // Le righe nuove ci sono e le vecchie pure, e l'errore porta proprio quelle.
    const actual = (err as WeekSaveIncompleteError).actual;
    expect(keysOf(actual)).toEqual(keysOf(mem.db.availability));
    expect(keysOf(actual)).toEqual([...keysOfSlots(target), "1 10:00-20:00"].sort());

    // Stessa bozza, di nuovo: rilegge, non inserisce niente, toglie la vecchia.
    mem.requests.length = 0;
    await saveWeek(mem.store, COACH, target);
    expect(mem.writes()).toEqual([{ op: "delete", table: "trainer_availability", ids: ["lun"] }]);
    expect(keysOf(mem.db.availability)).toEqual(keysOfSlots(target));
  });

  it("cancellate meno righe del previsto: è un errore, non un successo", async () => {
    const mem = seed();
    const w = weekFromRows([]);
    w[7] = { active: true, ranges: [{ start: "09:00", end: "12:00" }] };
    mem.fail.deleteAtMost = 2;
    const err = await saveWeek(mem.store, COACH, weekSlots(w)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeekSaveIncompleteError);
    expect((err as WeekSaveIncompleteError).actual).toHaveLength(5);
  });

  it("se anche la rilettura fallisce, le righe vere si ricavano da quello che è successo", async () => {
    const mem = seed();
    const target = draftMondaySplit(mem);
    mem.fail.delete = true;
    mem.fail.reread = true;
    const err = (await saveWeek(mem.store, COACH, target).catch(
      (e: unknown) => e,
    )) as WeekSaveIncompleteError;
    expect(keysOf(err.actual)).toEqual(keysOf(mem.db.availability));
  });

  it("«Ripristina» riporta esattamente le righe di prima", async () => {
    const mem = seed();
    const original = keysOf(mem.db.availability);
    const res = await saveWeek(mem.store, COACH, draftMondaySplit(mem));
    expect(keysOf(mem.db.availability)).not.toEqual(original);
    await saveWeek(mem.store, COACH, slotsOfRows(res.before));
    expect(keysOf(mem.db.availability)).toEqual(original);
  });

  it("svuotare la settimana cancella tutto con una richiesta sola", async () => {
    const mem = seed();
    await saveWeek(mem.store, COACH, []);
    expect(mem.writes()).toEqual([
      {
        op: "delete",
        table: "trainer_availability",
        ids: ["lun", "mar", "mer", "gio", "ven", "sab"],
      },
    ]);
    expect(keysOf(mem.db.availability)).toEqual([]);
  });
});

describe("eccezioni", () => {
  function exSeed(rows: AvailabilityExceptionRow[] = []): MemoryAvailability {
    return createMemoryAvailability({ availability: [], exceptions: rows });
  }

  it("una settimana di ferie: un inserimento solo con sette righe, e gli id", async () => {
    const mem = exSeed();
    const rows = await addException(mem.store, COACH, {
      from: "2026-10-12",
      to: "2026-10-18",
      allDay: true,
      start: "09:00",
      end: "13:00",
      reason: " Ferie ",
    });
    expect(mem.writes()).toHaveLength(1);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.id && r.reason === "Ferie" && r.start_time === null)).toBe(true);
    expect(groupExceptions(mem.db.exceptions)).toHaveLength(1);
  });

  it("un'eccezione non valida non scrive niente", async () => {
    const mem = exSeed();
    await expect(
      addException(mem.store, COACH, {
        from: "2026-10-12",
        to: "2026-10-11",
        allDay: true,
        start: "09:00",
        end: "13:00",
        reason: "",
      }),
    ).rejects.toThrow("La data finale è precedente a quella iniziale.");
    expect(mem.writes()).toEqual([]);
  });

  function ex(id: string, date: string): AvailabilityExceptionRow {
    return {
      id,
      coach_id: COACH,
      date,
      start_time: "14:00:00",
      end_time: "18:00:00",
      reason: "Corso",
    };
  }

  it("rimozione di un periodo coi doppioni: tutte le righe, una richiesta; «Ripristina» le rimette uguali", async () => {
    const rows = [ex("a", "2026-10-08"), ex("a2", "2026-10-08"), ex("b", "2026-10-09")];
    const mem = exSeed(rows.map((r) => ({ ...r })));
    const group = groupExceptions(mem.db.exceptions)[0]!;
    const removed = await removeExceptions(mem.store, COACH, group.rows);
    expect(mem.writes()).toEqual([
      { op: "delete", table: "availability_exceptions", ids: ["a", "a2", "b"] },
    ]);
    expect(mem.db.exceptions).toEqual([]);
    await restoreExceptions(mem.store, removed);
    const byId = (a: AvailabilityExceptionRow, b: AvailabilityExceptionRow) =>
      a.id.localeCompare(b.id);
    expect([...mem.db.exceptions].sort(byId)).toEqual([...rows].sort(byId));
  });

  it("«Ripristina» dopo l'aggiunta cancella le righe appena inserite", async () => {
    const mem = exSeed([ex("vecchia", "2026-11-02")]);
    const added = await addException(mem.store, COACH, {
      from: "2026-10-08",
      to: "2026-10-10",
      allDay: false,
      start: "14:00",
      end: "18:00",
      reason: "Corso",
    });
    await removeExceptions(mem.store, COACH, added);
    expect(mem.db.exceptions.map((r) => r.id)).toEqual(["vecchia"]);
  });

  it("tolte meno righe del previsto: errore", async () => {
    const mem = exSeed([ex("a", "2026-10-08"), ex("b", "2026-10-09")]);
    mem.fail.deleteAtMost = 1;
    await expect(removeExceptions(mem.store, COACH, [...mem.db.exceptions])).rejects.toThrow(
      EXCEPTION_REMOVE_INCOMPLETE,
    );
  });
});
