// La regola condivisa dei Booster (passata 06): fino a quando valgono, il
// giorno di Roma, la fine del giorno a Roma, il titolo del pacchetto e la
// decisione del pagamento. Le attese sono le stesse a Roma, in UTC e a Los
// Angeles: la regola non usa il fuso del processo. Il caso che lega il
// pagamento allo Store, sulle quindici persone, è in client-store.test.ts.

import { describe, expect, it } from "vitest";
import {
  BOOSTER_EXTENSION_DAYS,
  BOOSTER_SHORT_BLOCK_DAYS,
  boosterPackTitle,
  boosterPathAllowed,
  boosterPurchase,
  boosterValidity,
  endOfRomeDay,
  romeDate,
  type BoosterBlock,
  type BoosterClient,
} from "../../supabase/functions/_shared/booster-validity";

describe("le costanti", () => {
  it("30 giorni in più, sotto i 7 giorni alla fine del blocco", () => {
    expect(BOOSTER_EXTENSION_DAYS).toBe(30);
    expect(BOOSTER_SHORT_BLOCK_DAYS).toBe(7);
  });
});

describe("boosterValidity", () => {
  it.each([
    ["2026-09-28", "2026-10-11", true, "2026-10-11", false],
    // 7 giorni esatti: nessuna proroga.
    ["2026-09-28", "2026-10-05", true, "2026-10-05", false],
    ["2026-09-28", "2026-10-04", true, "2026-11-03", true],
    // Il percorso finisce col blocco (decisione 13).
    ["2026-09-28", "2026-10-04", false, "2026-10-04", false],
    ["2026-09-28", "2026-09-28", true, "2026-10-28", true],
    ["2026-09-28", "2026-09-28", false, "2026-09-28", false],
    // Un blocco già finito non si proroga mai.
    ["2026-09-28", "2026-09-27", true, "2026-09-27", false],
    ["2026-12-28", "2027-01-03", true, "2027-02-02", true],
    // Anno bisestile: il 29 febbraio conta.
    ["2028-02-01", "2028-02-05", true, "2028-03-06", true],
  ])(
    "oggi %s, fine %s, continua %s → %s, proroga %s",
    (today, blockEnd, continues, until, extended) => {
      expect(boosterValidity({ today, blockEnd, continues })).toEqual({ until, extended });
    },
  );
});

describe("romeDate: l'«oggi» del server", () => {
  it.each([
    ["2026-10-10T21:59:59.999Z", "2026-10-10"],
    ["2026-10-10T22:00:00.000Z", "2026-10-11"],
    // L'ultima notte dell'ora legale: dal 25/10 Roma è un'ora avanti, non due.
    ["2026-10-25T22:59:59.999Z", "2026-10-25"],
    ["2026-10-25T23:00:00.000Z", "2026-10-26"],
    ["2026-03-28T22:59:59.999Z", "2026-03-28"],
    ["2026-03-28T23:00:00.000Z", "2026-03-29"],
  ])("%s → %s", (iso, day) => {
    expect(romeDate(new Date(iso))).toBe(day);
  });
});

describe("endOfRomeDay: extra_credits.expires_at", () => {
  it.each([
    ["2026-10-11", "2026-10-11T21:59:59.999Z"],
    ["2026-10-24", "2026-10-24T21:59:59.999Z"],
    // Il giorno del cambio: a fine giornata è già l'ora solare.
    ["2026-10-25", "2026-10-25T22:59:59.999Z"],
    ["2026-10-26", "2026-10-26T22:59:59.999Z"],
    ["2026-03-28", "2026-03-28T22:59:59.999Z"],
    ["2026-03-29", "2026-03-29T21:59:59.999Z"],
    ["2026-11-03", "2026-11-03T22:59:59.999Z"],
    ["2027-01-02", "2027-01-02T22:59:59.999Z"],
  ])("%s → %s", (day, iso) => {
    expect(endOfRomeDay(day)).toBe(iso);
  });

  it("riletta come giorno di Roma, è lo stesso giorno", () => {
    for (const day of ["2026-10-11", "2026-10-25", "2026-03-29", "2027-01-02"]) {
      expect(romeDate(new Date(endOfRomeDay(day)))).toBe(day);
    }
  });
});

describe("boosterPackTitle", () => {
  it("il titolo del pacchetto dopo il trim, altrimenti crediti e tipologia", () => {
    expect(boosterPackTitle({ title: null, quantity: 1, event_type_title: "Sessione PT" })).toBe(
      "1 credito Sessione PT",
    );
    expect(boosterPackTitle({ title: "  ", quantity: 3, event_type_title: "Sessione PT" })).toBe(
      "3 crediti Sessione PT",
    );
    expect(
      boosterPackTitle({ title: " 3 sessioni PT ", quantity: 3, event_type_title: "Sessione PT" }),
    ).toBe("3 sessioni PT");
    expect(
      boosterPackTitle({ quantity: 1, event_type_title: "Test Funzionali + Check Tecnico" }),
    ).toBe("1 credito Test Funzionali + Check Tecnico");
  });
});

// ---------------------------------------------------------------------------
// La decisione del pagamento
// ---------------------------------------------------------------------------

const FIXED: BoosterClient = {
  path_type: "fixed",
  status: "active",
  pack_label: null,
  auto_renew_blocks: false,
};
const RECURRING: BoosterClient = { ...FIXED, path_type: "recurring" };

const blk = (
  id: string,
  seq: number,
  start: string,
  end: string,
  status = "active",
): BoosterBlock => ({ id, sequence_order: seq, start_date: start, end_date: end, status });

describe("boosterPathAllowed", () => {
  it("fisso senza PT Pack e abbonamento, anche con pack_label: sì", () => {
    expect(boosterPathAllowed(FIXED)).toBe(true);
    expect(boosterPathAllowed({ ...RECURRING, pack_label: "Programmazione mensile" })).toBe(true);
  });

  it("PT Pack, libero, senza percorso, archiviato: no", () => {
    expect(boosterPathAllowed({ ...FIXED, pack_label: "Pacchetto 3 sessioni" })).toBe(false);
    expect(boosterPathAllowed({ ...FIXED, path_type: "free" })).toBe(false);
    expect(boosterPathAllowed({ ...FIXED, path_type: null })).toBe(false);
    expect(boosterPathAllowed({ ...FIXED, status: "archived" })).toBe(false);
    expect(boosterPathAllowed({ ...RECURRING, status: "archived" })).toBe(false);
  });
});

describe("boosterPurchase", () => {
  const TODAY = "2026-09-28";
  const buy = (blockId: string, until: string, extended: boolean) => ({
    blockId,
    until,
    extended,
    expiresAt: endOfRomeDay(until),
  });

  it.each<[string, BoosterClient, BoosterBlock[], ReturnType<typeof buy> | null]>([
    [
      "annullato in corso",
      FIXED,
      [
        blk("x1", 1, "2026-09-14", "2026-10-11", "cancelled"),
        blk("x2", 2, "2026-09-21", "2026-10-18"),
      ],
      buy("x2", "2026-10-18", false),
    ],
    [
      "dopo annullato",
      FIXED,
      [
        blk("b1", 1, "2026-09-07", "2026-10-04"),
        blk("b2", 2, "2026-10-05", "2026-11-01", "cancelled"),
      ],
      buy("b1", "2026-10-04", false),
    ],
    [
      "dopo con lo stesso numero",
      FIXED,
      [blk("c2", 1, "2026-10-05", "2026-11-01"), blk("c1", 1, "2026-09-07", "2026-10-04")],
      buy("c1", "2026-11-03", true),
    ],
    [
      "dopo completato",
      FIXED,
      [
        blk("e1", 1, "2026-09-07", "2026-10-04"),
        blk("e2", 2, "2026-10-05", "2026-11-01", "completed"),
      ],
      buy("e1", "2026-11-03", true),
    ],
    [
      "abbonamento col rinnovo, senza il dopo",
      { ...RECURRING, auto_renew_blocks: true },
      [blk("d1", 1, "2026-09-07", "2026-10-04")],
      buy("d1", "2026-11-03", true),
    ],
    [
      "abbonamento senza rinnovo",
      RECURRING,
      [blk("d1", 1, "2026-09-07", "2026-10-04")],
      buy("d1", "2026-10-04", false),
    ],
    [
      "fisso col rinnovo acceso",
      { ...FIXED, auto_renew_blocks: true },
      [blk("f1", 1, "2026-09-07", "2026-10-04")],
      buy("f1", "2026-10-04", false),
    ],
    [
      "finisce oggi",
      FIXED,
      [blk("g1", 1, "2026-09-01", "2026-09-28"), blk("g2", 2, "2026-09-29", "2026-10-26")],
      buy("g1", "2026-10-28", true),
    ],
    [
      "finito ieri",
      FIXED,
      [blk("h1", 1, "2026-08-31", "2026-09-27"), blk("h2", 2, "2026-10-05", "2026-11-01")],
      null,
    ],
    [
      "PT Pack",
      { ...FIXED, pack_label: "Pacchetto 3 sessioni" },
      [blk("k1", 1, "2026-09-14", "2026-10-11")],
      null,
    ],
    [
      "abbonamento con etichetta",
      { ...RECURRING, pack_label: "Programmazione mensile", auto_renew_blocks: true },
      [blk("m1", 1, "2026-09-14", "2026-10-11")],
      buy("m1", "2026-10-11", false),
    ],
    [
      "cliente archiviato",
      { ...FIXED, status: "archived" },
      [blk("a1", 1, "2026-09-14", "2026-10-11")],
      null,
    ],
    ["libero", { ...FIXED, path_type: "free" }, [blk("l1", 1, "2026-09-14", "2026-10-11")], null],
    [
      "stesso numero, sovrapposti",
      FIXED,
      [blk("p1", 1, "2026-09-01", "2026-10-31"), blk("p2", 1, "2026-09-14", "2026-10-11")],
      buy("p2", "2026-10-11", false),
    ],
  ])("%s", (_name, client, blocks, want) => {
    expect(boosterPurchase(client, blocks, TODAY)).toEqual(want);
  });

  it("le scadenze: l'ultimo istante del giorno a Roma, d'estate e d'inverno", () => {
    expect(
      boosterPurchase(FIXED, [blk("x2", 2, "2026-09-21", "2026-10-18")], TODAY)?.expiresAt,
    ).toBe("2026-10-18T21:59:59.999Z");
    expect(
      boosterPurchase(
        FIXED,
        [blk("g1", 1, "2026-09-01", "2026-09-28"), blk("g2", 2, "2026-09-29", "2026-10-26")],
        TODAY,
      )?.expiresAt,
    ).toBe("2026-10-28T22:59:59.999Z");
  });

  it("inverno: la proroga attraversa l'anno", () => {
    expect(
      boosterPurchase(
        FIXED,
        [blk("w1", 1, "2026-12-14", "2027-01-10"), blk("w2", 2, "2027-01-11", "2027-02-07")],
        "2027-01-05",
      ),
    ).toEqual({
      blockId: "w1",
      until: "2027-02-09",
      extended: true,
      expiresAt: "2027-02-09T22:59:59.999Z",
    });
  });

  it("le date coi minuti dopo il giorno contano per i primi 10 caratteri", () => {
    expect(
      boosterPurchase(FIXED, [blk("t1", 1, "2026-09-14T00:00:00", "2026-10-11T00:00:00")], TODAY),
    ).toEqual(buy("t1", "2026-10-11", false));
  });
});
