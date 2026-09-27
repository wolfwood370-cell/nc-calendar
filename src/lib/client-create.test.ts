import { describe, expect, it } from "vitest";
import {
  autoRenewFor,
  blocksOf,
  creationPayload,
  generatePassword,
  PT_PACK_LABEL,
  writeNewClient,
  type ClientCreateStore,
  type CreationDraft,
  type NewAllocationRow,
  type NewBlockRow,
  type NewExtraCreditRow,
  type ProfilePatch,
} from "@/lib/client-create";

const TYPES = [
  { id: "pt", base_type: "PT Session" },
  { id: "bia", base_type: "BIA" },
  { id: "test", base_type: "Functional Test" },
];
// Oggi come nei dati del prototipo; la data locale è quella della VM di prova.
const TODAY = new Date(2026, 8, 25, 10, 40);

function memoryStore(opts: { failUser?: string; failAllocations?: boolean } = {}) {
  const writes = {
    users: [] as Array<{ email: string; password: string; first_name: string; last_name: string }>,
    extras: [] as NewExtraCreditRow[],
    profiles: [] as Array<{ id: string; patch: ProfilePatch }>,
    blocks: [] as Array<NewBlockRow & { id: string }>,
    allocations: [] as NewAllocationRow[],
  };
  const store: ClientCreateStore = {
    async createUser(input) {
      if (opts.failUser) return { error: opts.failUser };
      writes.users.push(input);
      return { userId: "new-user" };
    },
    async insertExtraCredit(row) {
      writes.extras.push(row);
    },
    async updateProfile(id, patch) {
      writes.profiles.push({ id, patch });
    },
    async insertBlocks(rows) {
      const out = rows.map((r) => ({ ...r, id: `blk${r.sequence_order}` }));
      writes.blocks.push(...out);
      return out.map((b) => ({ id: b.id, sequence_order: b.sequence_order, end_date: b.end_date }));
    },
    async insertAllocations(rows) {
      if (opts.failAllocations) throw new Error("permesso negato");
      writes.allocations.push(...rows);
    },
  };
  return { store, writes };
}

const draft = (over: Partial<CreationDraft> = {}): CreationDraft => ({
  firstName: " Giulia ",
  lastName: "Bianchi ",
  email: "Giulia.B@Email.it ",
  pathType: "fixed",
  months: 6,
  customBlocks: 1,
  credits: { pt: 8, bia: 1, test: 0 },
  packLabel: null,
  ...over,
});

describe("durata → blocchi, come il dialog di prima", () => {
  it("3, 6, 12 mesi = 3, 6, 12 blocchi; personalizzata = il numero scelto", () => {
    expect(blocksOf(draft({ months: 3 }))).toBe(3);
    expect(blocksOf(draft({ months: 6 }))).toBe(6);
    expect(blocksOf(draft({ months: 12 }))).toBe(12);
    expect(blocksOf(draft({ months: null, customBlocks: 4 }))).toBe(4);
    expect(blocksOf(draft({ months: null, customBlocks: 99 }))).toBe(36);
  });
  it("mensile 1 blocco, libero nessuno", () => {
    expect(blocksOf(draft({ pathType: "recurring", months: 12 }))).toBe(1);
    expect(blocksOf(draft({ pathType: "free" }))).toBe(0);
  });
});

describe("rinnovo automatico solo per l'abbonamento mensile", () => {
  it("fisso e libero spenti, mensile acceso", () => {
    expect(autoRenewFor("fixed")).toBe(false);
    expect(autoRenewFor("free")).toBe(false);
    expect(autoRenewFor("recurring")).toBe(true);
  });

  it("un percorso fisso nasce senza rinnovo automatico nel profilo scritto", async () => {
    const { store, writes } = memoryStore();
    await writeNewClient(store, "coach", creationPayload(draft(), TYPES, "Pw1!aaaaaa"), TODAY);
    expect(writes.profiles).toHaveLength(1);
    expect(writes.profiles[0]!.patch).toMatchObject({
      path_type: "fixed",
      auto_renew: false,
      auto_renew_blocks: false,
      next_billing_date: null,
    });
  });

  it("un mensile nasce col rinnovo acceso e la prossima fatturazione a 30 giorni", async () => {
    const { store, writes } = memoryStore();
    await writeNewClient(
      store,
      "coach",
      creationPayload(draft({ pathType: "recurring" }), TYPES, "Pw1!aaaaaa"),
      TODAY,
    );
    expect(writes.blocks).toHaveLength(1);
    expect(writes.profiles[0]!.patch).toMatchObject({
      path_type: "recurring",
      auto_renew: true,
      auto_renew_blocks: true,
    });
    expect(writes.profiles[0]!.patch.next_billing_date).toBe(
      new Date(2026, 9, 25, 10, 40).toISOString().slice(0, 10),
    );
  });
});

describe("crediti per blocco → regole dal blocco 1 al blocco N", () => {
  it("una regola per tipologia con crediti, dal blocco 1 al blocco N", () => {
    const p = creationPayload(draft(), TYPES, "x");
    expect(p.totalBlocks).toBe(6);
    expect(p.rules).toEqual([
      {
        eventTypeId: "pt",
        sessionType: "PT Session",
        quantityPerBlock: 8,
        startBlock: 1,
        endBlock: 6,
      },
      { eventTypeId: "bia", sessionType: "BIA", quantityPerBlock: 1, startBlock: 1, endBlock: 6 },
    ]);
    expect(p.email).toBe("Giulia.B@Email.it ");
    expect(p.firstName).toBe("Giulia");
    expect(p.lastName).toBe("Bianchi");
  });

  it("la scrittura: N blocchi da 30 giorni e le stesse allocazioni in ognuno", async () => {
    const { store, writes } = memoryStore();
    const r = await writeNewClient(
      store,
      "coach",
      creationPayload(draft(), TYPES, "Pw1!aaaaaa"),
      TODAY,
    );
    expect(r).toEqual({
      ok: true,
      userId: "new-user",
      email: "giulia.b@email.it",
      assignError: null,
    });
    expect(writes.users).toEqual([
      {
        email: "giulia.b@email.it",
        password: "Pw1!aaaaaa",
        first_name: "Giulia",
        last_name: "Bianchi",
      },
    ]);
    expect(writes.blocks.map((b) => [b.sequence_order, b.coach_id, b.client_id, b.status])).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => [n, "coach", "new-user", "active"]),
    );
    const d = (days: number) => {
      const x = new Date(TODAY);
      x.setDate(TODAY.getDate() + days);
      return x.toISOString().slice(0, 10);
    };
    expect(writes.blocks[0]).toMatchObject({ start_date: d(0), end_date: d(29) });
    expect(writes.blocks[5]).toMatchObject({ start_date: d(150), end_date: d(179) });
    expect(writes.allocations).toHaveLength(12);
    for (const b of writes.blocks) {
      const mine = writes.allocations.filter((a) => a.block_id === b.id);
      expect(
        mine.map((a) => [a.event_type_id, a.quantity_assigned, a.week_number, a.quantity_booked]),
      ).toEqual([
        ["pt", 8, 1, 0],
        ["bia", 1, 1, 0],
      ]);
    }
    expect(writes.profiles[0]!.patch.path_start_date).toBe(d(0));
    expect(writes.extras).toEqual([]);
  });

  it("scorciatoia PT Pack: 1 blocco, 3 PT e la sua etichetta", () => {
    const p = creationPayload(
      draft({ months: null, customBlocks: 1, credits: { pt: 3 }, packLabel: PT_PACK_LABEL }),
      TYPES,
      "x",
    );
    expect(p).toMatchObject({
      totalBlocks: 1,
      packLabel: "Pacchetto 3 sessioni",
      autoRenew: false,
    });
    expect(p.rules).toHaveLength(1);
  });

  it("cliente libero: sessioni omaggio come crediti extra, niente blocchi", async () => {
    const { store, writes } = memoryStore();
    await writeNewClient(
      store,
      "coach",
      creationPayload(draft({ pathType: "free", credits: { pt: 2, bia: 0 } }), TYPES, "Pw1!aaaaaa"),
      TODAY,
    );
    expect(writes.blocks).toEqual([]);
    expect(writes.extras).toEqual([
      {
        client_id: "new-user",
        event_type_id: "pt",
        quantity: 2,
        quantity_booked: 0,
        expires_at: "2100-01-01T00:00:00.000Z",
      },
    ]);
    expect(writes.profiles[0]!.patch).toEqual({
      path_type: "free",
      auto_renew: false,
      auto_renew_blocks: false,
      pack_label: "Cliente Libero",
      next_billing_date: null,
    });
  });
});

describe("telefono alla creazione (passata 06)", () => {
  it("scritto nell'aggiornamento del profilo quando c'è", async () => {
    const { store, writes } = memoryStore();
    await writeNewClient(
      store,
      "coach",
      creationPayload(draft({ phone: " +39 340 118 22 09 " }), TYPES, "Pw1!aaaaaa"),
      TODAY,
    );
    expect(writes.profiles).toHaveLength(1);
    expect(writes.profiles[0]!.patch.phone).toBe("+39 340 118 22 09");
    // La funzione edge riceve gli stessi campi di prima.
    expect(Object.keys(writes.users[0]!).sort()).toEqual([
      "email",
      "first_name",
      "last_name",
      "password",
    ]);
  });

  it("anche per il cliente libero", async () => {
    const { store, writes } = memoryStore();
    await writeNewClient(
      store,
      "coach",
      creationPayload(draft({ pathType: "free", phone: "3401182209" }), TYPES, "Pw1!aaaaaa"),
      TODAY,
    );
    expect(writes.profiles[0]!.patch).toMatchObject({ path_type: "free", phone: "3401182209" });
  });

  it("vuoto o assente non si scrive", async () => {
    for (const phone of [undefined, "", "   "]) {
      const { store, writes } = memoryStore();
      await writeNewClient(
        store,
        "coach",
        creationPayload(draft({ phone }), TYPES, "Pw1!aaaaaa"),
        TODAY,
      );
      expect("phone" in writes.profiles[0]!.patch).toBe(false);
    }
  });
});

describe("errori", () => {
  it("se l'account non si crea non si scrive altro", async () => {
    const { store, writes } = memoryStore({ failUser: "Email già registrata." });
    const r = await writeNewClient(store, "coach", creationPayload(draft(), TYPES, "x"), TODAY);
    expect(r).toEqual({ ok: false, error: "Email già registrata." });
    expect(writes.blocks).toEqual([]);
  });
  it("se il percorso non si scrive, l'account resta e il coach lo sa", async () => {
    const { store } = memoryStore({ failAllocations: true });
    const r = await writeNewClient(store, "coach", creationPayload(draft(), TYPES, "x"), TODAY);
    expect(r).toMatchObject({ ok: true, userId: "new-user", assignError: "permesso negato" });
  });
});

describe("password", () => {
  it("10 caratteri con maiuscola, minuscola, cifra e simbolo", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[!@#$%&*]/);
      expect(p).not.toMatch(/[01OIlo]/);
    }
  });
});
