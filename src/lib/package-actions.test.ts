import { describe, expect, it } from "vitest";
import {
  PackageInUseError,
  addExtraCredits,
  assignNewPath,
  blockLength,
  canRenew,
  creditsByType,
  formatCredits,
  nextBlockDates,
  renewNote,
  renewPackage,
  undoPackageChange,
  type NewAllocationRow,
  type NewBlockRow,
  type PackageBlock,
  type PackageProfile,
  type PackageStore,
} from "@/lib/package-actions";

const TODAY = "2026-09-25";
const types = [
  { id: "pt", name: "Personal Training", color: "#003e62", base_type: "PT Session" as const },
  { id: "bia", name: "Misurazione BIA", color: "#039be5", base_type: "BIA" as const },
  { id: "test", name: "Test funzionale", color: "#0b8043", base_type: "Functional Test" as const },
];

const block = (
  seq: number,
  start: string,
  end: string,
  over: Partial<PackageBlock> = {},
): PackageBlock => ({
  id: `b${seq}`,
  sequence_order: seq,
  start_date: start,
  end_date: end,
  duration_days: 28,
  grace_days: 7,
  allocations: [
    {
      week_number: 1,
      session_type: "PT Session",
      event_type_id: "pt",
      quantity_assigned: 8,
      quantity_booked: 5,
    },
    {
      week_number: 1,
      session_type: "BIA",
      event_type_id: "bia",
      quantity_assigned: 1,
      quantity_booked: 0,
    },
  ],
  ...over,
});

const profile = (over: Partial<PackageProfile> = {}): PackageProfile => ({
  path_type: "recurring",
  pack_label: null,
  auto_renew: true,
  auto_renew_blocks: true,
  path_start_date: "2026-08-10",
  next_billing_date: null,
  ...over,
});

function memoryPackageStore(init: { blocks: PackageBlock[]; profile: PackageProfile }) {
  const blocks = init.blocks.map((b) => ({
    ...b,
    allocations: b.allocations.map((a) => ({ ...a })),
  }));
  const removed = new Set<string>();
  const insertedBlocks: Array<NewBlockRow & { id: string }> = [];
  const insertedAllocations: Array<
    Omit<NewAllocationRow, "quantity_booked"> & { quantity_booked: number }
  > = [];
  const extras = new Map<
    string,
    { event_type_id: string; quantity: number; quantity_booked: number }
  >();
  let prof = { ...init.profile };
  let n = 0;
  const store: PackageStore = {
    async listBlocks() {
      const added: PackageBlock[] = insertedBlocks
        .filter((b) => !removed.has(b.id))
        .map((b) => ({
          id: b.id,
          sequence_order: b.sequence_order,
          start_date: b.start_date,
          end_date: b.end_date,
          duration_days: b.duration_days,
          grace_days: b.grace_days ?? 7,
          allocations: insertedAllocations.filter((a) => a.block_id === b.id),
        }));
      return [...blocks.filter((b) => !removed.has(b.id)), ...added];
    },
    async getProfile() {
      return { ...prof };
    },
    async insertBlocks(rows) {
      return rows.map((r) => {
        const id = `nuovo-${++n}`;
        insertedBlocks.push({ ...r, id });
        return { id, sequence_order: r.sequence_order };
      });
    },
    async insertAllocations(rows) {
      insertedAllocations.push(...rows);
    },
    async bookedInBlocks(ids) {
      return insertedAllocations
        .filter((a) => ids.includes(a.block_id))
        .reduce((s, a) => s + a.quantity_booked, 0);
    },
    async removeBlocks(ids) {
      ids.forEach((id) => removed.add(id));
    },
    async insertExtraCredit(row) {
      const id = `extra-${++n}`;
      extras.set(id, {
        event_type_id: row.event_type_id,
        quantity: row.quantity,
        quantity_booked: 0,
      });
      return id;
    },
    async extraCreditBooked(id) {
      return extras.get(id)?.quantity_booked ?? null;
    },
    async deleteExtraCredit(id) {
      extras.delete(id);
    },
    async updateProfile(_id, patch) {
      prof = { ...prof, ...patch };
    },
  };
  return {
    store,
    insertedBlocks,
    insertedAllocations,
    extras,
    removed,
    profile: () => prof,
  };
}

describe("nextBlockDates", () => {
  it("dal giorno dopo la fine dell'ultimo blocco, 28 giorni", () => {
    expect(nextBlockDates({ end_date: "2026-10-04" }, TODAY)).toEqual({
      start: "2026-10-05",
      end: "2026-11-01",
    });
  });

  it("senza blocchi parte oggi", () => {
    expect(nextBlockDates(null, TODAY)).toEqual({ start: "2026-09-25", end: "2026-10-22" });
  });
});

describe("blockLength", () => {
  it("dalle date del blocco, estremi inclusi", () => {
    expect(blockLength({ start_date: "2026-09-07", end_date: "2026-10-04" })).toBe(28);
    expect(blockLength({ start_date: "2026-09-01", end_date: "2026-09-30" })).toBe(30);
    expect(blockLength(null)).toBe(28);
  });
});

describe("canRenew e crediti del rinnovo", () => {
  it("non per i clienti liberi né senza blocchi con crediti", () => {
    const blocks = [block(1, "2026-09-07", "2026-10-04")];
    expect(canRenew(profile(), blocks)).toBe(true);
    expect(canRenew(profile({ path_type: "free" }), blocks)).toBe(false);
    expect(canRenew(profile(), [])).toBe(false);
    expect(canRenew(profile(), [block(1, "2026-09-07", "2026-10-04", { allocations: [] })])).toBe(
      false,
    );
  });

  it("elenco per tipologia, con singolare e plurale", () => {
    const rows = creditsByType(block(1, "2026-09-07", "2026-10-04"), types);
    expect(rows.map((r) => [r.type.name, formatCredits(r.qty)])).toEqual([
      ["Personal Training", "8 crediti"],
      ["Misurazione BIA", "1 credito"],
    ]);
  });

  it("nota con i residui del blocco in corso", () => {
    const oct5 = new Date(2026, 9, 5);
    expect(renewNote(oct5, 3)).toBe(
      "Il cliente può prenotare le sessioni del nuovo blocco dal 5 ott 2026. I 3 crediti residui restano validi fino alla fine del blocco in corso.",
    );
    expect(renewNote(oct5, 1)).toContain("Il credito residuo resta valido");
    expect(renewNote(oct5, 0)).toBe(
      "Il cliente può prenotare le sessioni del nuovo blocco dal 5 ott 2026.",
    );
    expect(renewNote(new Date(2027, 0, 11), 0)).toBe(
      "Il cliente può prenotare le sessioni del nuovo blocco dall'11 gen 2027.",
    );
  });
});

describe("renewPackage", () => {
  it("un blocco dopo l'ultimo con le stesse allocazioni, nessun credito prenotato", async () => {
    const db = memoryPackageStore({
      blocks: [block(1, "2026-08-10", "2026-09-06"), block(2, "2026-09-07", "2026-10-04")],
      profile: profile(),
    });
    const change = await renewPackage(db.store, {
      clientId: "marta",
      coachId: "coach",
      today: TODAY,
    });
    expect(db.insertedBlocks).toEqual([
      expect.objectContaining({
        start_date: "2026-10-05",
        end_date: "2026-11-01",
        sequence_order: 3,
        duration_days: 28,
        grace_days: 7,
        coach_id: "coach",
      }),
    ]);
    expect(
      db.insertedAllocations.map((a) => [a.event_type_id, a.quantity_assigned, a.quantity_booked]),
    ).toEqual([
      ["pt", 8, 0],
      ["bia", 1, 0],
    ]);
    expect(change.profileBefore).toBeNull();
    await undoPackageChange(db.store, change);
    expect(db.removed.has("nuovo-1")).toBe(true);
  });

  it("cliente libero: niente rinnovo", async () => {
    const db = memoryPackageStore({ blocks: [], profile: profile({ path_type: "free" }) });
    await expect(
      renewPackage(db.store, { clientId: "sara", coachId: "coach", today: TODAY }),
    ).rejects.toThrow();
  });
});

describe("addExtraCredits", () => {
  it("con un percorso: solo la riga extra, il profilo non cambia", async () => {
    const db = memoryPackageStore({
      blocks: [block(1, "2026-09-07", "2026-10-04")],
      profile: profile(),
    });
    const change = await addExtraCredits(db.store, {
      clientId: "c",
      eventTypeId: "pt",
      quantity: 2,
    });
    expect([...db.extras.values()]).toEqual([
      { event_type_id: "pt", quantity: 2, quantity_booked: 0 },
    ]);
    expect(change.profileBefore).toBeNull();
    expect(db.profile().path_type).toBe("recurring");
  });

  it("senza blocchi il cliente diventa «Cliente Libero»; «Ripristina» toglie tutto", async () => {
    const db = memoryPackageStore({
      blocks: [],
      profile: profile({ path_type: "fixed", auto_renew: false, auto_renew_blocks: false }),
    });
    const change = await addExtraCredits(db.store, {
      clientId: "c",
      eventTypeId: "pt",
      quantity: 40,
    });
    expect([...db.extras.values()][0]?.quantity).toBe(30);
    expect(db.profile()).toMatchObject({ path_type: "free", pack_label: "Cliente Libero" });
    await undoPackageChange(db.store, change);
    expect(db.extras.size).toBe(0);
    expect(db.profile()).toMatchObject({ path_type: "fixed", pack_label: null });
  });

  it("extra già usati: «Ripristina» non li toglie", async () => {
    const db = memoryPackageStore({
      blocks: [block(1, "2026-09-07", "2026-10-04")],
      profile: profile(),
    });
    const change = await addExtraCredits(db.store, {
      clientId: "c",
      eventTypeId: "pt",
      quantity: 3,
    });
    db.extras.get(change.extraCreditId!)!.quantity_booked = 1;
    await expect(undoPackageChange(db.store, change)).rejects.toBeInstanceOf(PackageInUseError);
    expect(db.extras.size).toBe(1);
  });
});

describe("assignNewPath", () => {
  it("percorso fisso: N blocchi in fila dopo l'ultimo, crediti per blocco, profilo aggiornato", async () => {
    const db = memoryPackageStore({
      blocks: [block(1, "2026-09-07", "2026-10-04")],
      profile: profile(),
    });
    await assignNewPath(db.store, {
      clientId: "giulia",
      coachId: "coach",
      today: TODAY,
      pathType: "fixed",
      blocks: 3,
      credits: [
        { eventTypeId: "pt", sessionType: "PT Session", perBlock: 16 },
        { eventTypeId: "bia", sessionType: "BIA", perBlock: 1 },
        { eventTypeId: "test", sessionType: "Functional Test", perBlock: 0 },
      ],
    });
    expect(db.insertedBlocks.map((b) => [b.sequence_order, b.start_date, b.end_date])).toEqual([
      [2, "2026-10-05", "2026-11-01"],
      [3, "2026-11-02", "2026-11-29"],
      [4, "2026-11-30", "2026-12-27"],
    ]);
    expect(db.insertedAllocations).toHaveLength(6);
    expect(new Set(db.insertedAllocations.map((a) => a.event_type_id))).toEqual(
      new Set(["pt", "bia"]),
    );
    expect(db.profile()).toMatchObject({
      path_type: "fixed",
      auto_renew: false,
      auto_renew_blocks: false,
      path_start_date: "2026-08-10",
      next_billing_date: null,
    });
  });

  it("abbonamento: un blocco con rinnovo automatico; senza blocchi l'ancora è il primo nuovo", async () => {
    const db = memoryPackageStore({
      blocks: [],
      profile: profile({ path_type: "free", path_start_date: "2025-01-06", auto_renew: false }),
    });
    const change = await assignNewPath(db.store, {
      clientId: "sara",
      coachId: "coach",
      today: TODAY,
      pathType: "recurring",
      blocks: 6,
      credits: [{ eventTypeId: "pt", sessionType: "PT Session", perBlock: 4 }],
    });
    expect(db.insertedBlocks).toHaveLength(1);
    expect(db.profile()).toMatchObject({
      path_type: "recurring",
      auto_renew: true,
      auto_renew_blocks: true,
      path_start_date: "2026-09-25",
      next_billing_date: "2026-10-22",
    });
    await undoPackageChange(db.store, change);
    expect(db.profile()).toMatchObject({ path_type: "free", path_start_date: "2025-01-06" });
  });

  it("nessun credito: non crea nulla", async () => {
    const db = memoryPackageStore({ blocks: [], profile: profile() });
    await expect(
      assignNewPath(db.store, {
        clientId: "c",
        coachId: "coach",
        today: TODAY,
        pathType: "fixed",
        blocks: 3,
        credits: [{ eventTypeId: "pt", sessionType: "PT Session", perBlock: 0 }],
      }),
    ).rejects.toThrow();
    expect(db.insertedBlocks).toHaveLength(0);
  });

  it("«Ripristina» rifiutato se il cliente ha già prenotato sui nuovi blocchi", async () => {
    const db = memoryPackageStore({
      blocks: [block(1, "2026-09-07", "2026-10-04")],
      profile: profile(),
    });
    const change = await renewPackage(db.store, { clientId: "c", coachId: "coach", today: TODAY });
    db.insertedAllocations[0]!.quantity_booked = 1;
    await expect(undoPackageChange(db.store, change)).rejects.toBeInstanceOf(PackageInUseError);
    expect(db.removed.size).toBe(0);
  });
});
