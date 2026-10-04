// Le regole dello Store (passata 06): le sedici persone di
// client-store-seed.ts, lunedì 28/09/2026 alle 10:40. Date costruite con l'ora
// locale, come nella 05: le stesse attese a Roma, in UTC e a Los Angeles. Lo
// stato dei crediti viene da getBookState, come nella pagina.

import { describe, expect, it } from "vitest";
import { getBookState, type BookCoach } from "@/lib/client-book";
import {
  STORE_CANCEL_TOAST,
  STORE_DONE_TITLE,
  STORE_FOOTER,
  STORE_LOCK_TITLE,
  STORE_MATCH_WINDOW_MS,
  STORE_PAY_ERRORS,
  STORE_PAY_GENERIC,
  STORE_POLL_FOR_MS,
  STORE_POLL_MS,
  euro,
  findPurchase,
  storeBought,
  storeBoughtVisible,
  storeEmpty,
  storeLock,
  storeOutcome,
  storePayError,
  storeProducts,
  storeSearch,
  storeSummary,
  storeValidity,
  type StoreLockKind,
  type StoreOutcome,
  type StoreProduct,
  type StorePurchase,
  type StoreValidity,
} from "@/lib/client-store";
import { toIsoDate } from "@/lib/current-block";
import { COACH, NOC, NOW, TYPES, WA, at } from "@/lib/testing/client-home-seed";
import {
  ARRIVED,
  ARRIVED_OLD,
  ARRIVED_TEST,
  GIULIA06,
  PACKS,
  PACKS_TIE,
  PACKS_TITLED,
  PERSONAS06,
  inputOf,
  paid,
  persona,
  type StorePersona,
} from "@/lib/testing/client-store-seed";
import { boosterPurchase, boosterRefusal } from "../../supabase/functions/_shared/booster-validity";

const stateOf = (p: StorePersona, coach: BookCoach = NOC) => getBookState(inputOf(p, coach));

// ---------------------------------------------------------------------------
// Le sedici persone
// ---------------------------------------------------------------------------

const RULE = "Le sessioni si prenotano entro quella data.";
const PLUS = "il blocco finisce fra meno di 7 giorni, quindi hanno 30 giorni in più.";

const LIBERO_NOC =
  "Hai crediti senza scadenza fuori da un percorso. Se ti servono altre sessioni, il tuo coach può aggiungerle o proporti un percorso.";
const LIBERO_COACH =
  "Hai crediti senza scadenza fuori da un percorso. Se ti servono altre sessioni, Nicolò può aggiungerle o proporti un percorso.";
const CONCLUSO_NOC =
  "Il tuo percorso è concluso. Per ripartire, il tuo coach ti propone il prossimo percorso: i Booster si aggiungono a quello.";
const CONCLUSO_COACH =
  "Il tuo percorso è concluso. Per ripartire, Nicolò ti propone il prossimo percorso: i Booster si aggiungono a quello.";
const PACCHETTO_NOC =
  "I Booster si aggiungono a un percorso fisso o a un abbonamento. Se ti servono altre sessioni, il tuo coach può aggiungerle o proporti un percorso.";
const PACCHETTO_COACH =
  "I Booster si aggiungono a un percorso fisso o a un abbonamento. Se ti servono altre sessioni, Nicolò può aggiungerle o proporti un percorso.";
const ALTRO_NOC = "Al momento non hai un blocco attivo. Scrivi al tuo coach per continuare.";
const ALTRO_COACH = "Al momento non hai un blocco attivo. Scrivi a Nicolò per continuare.";
/** La card dell'ultima settimana di un percorso che finisce (decisione 14): tipo, senza coach, col coach. */
const lastWeek = (when: string): [StoreLockKind, string, string] => {
  const text = (to: string) =>
    `Il tuo percorso finisce ${when}, e nell'ultima settimana di un percorso i Booster non si acquistano. Per una sessione in più, o per continuare, scrivi ${to}.`;
  return ["fine", text("al tuo coach"), text("a Nicolò")];
};

/** Le tre righe «Dopo l'acquisto…»: singolo, pacchetto, test. */
const after = (single: number, pack: number, test: number): [string, string, string] => {
  const line = (n: number, name: string) =>
    n === 1
      ? `Dopo l'acquisto avrai 1 credito ${name} disponibile.`
      : `Dopo l'acquisto avrai ${n} crediti ${name} disponibili.`;
  return [
    line(single, "Personal Training"),
    line(pack, "Personal Training"),
    line(test, "Test funzionale"),
  ];
};

interface WantPerson {
  /** storeLock senza coach e col coach: tipo, testo senza nome, testo col nome. */
  lock: [StoreLockKind, string, string] | null;
  validity: StoreValidity | null;
  bought: [string, string][];
  after: [string, string, string] | null;
}

const WANT: Record<string, WantPerson> = {
  Giulia: {
    lock: null,
    validity: {
      blockNumber: 3,
      until: "2026-10-11",
      extended: false,
      expiresAt: "2026-10-11T21:59:59.999Z",
      text: `Si aggiungono ai crediti del blocco 3 e valgono fino a domenica 11 ottobre, come gli altri. ${RULE}`,
      summary: "Valgono fino a domenica 11 ottobre, fine del blocco 3.",
    },
    bought: [
      ["+3 Personal Training", "ven 25 set · 99 €"],
      ["+1 Personal Training", "sab 19 set · 40 €"],
    ],
    after: after(4, 6, 2),
  },
  Marta: {
    lock: null,
    validity: {
      blockNumber: 4,
      until: "2026-11-03",
      extended: true,
      expiresAt: "2026-11-03T22:59:59.999Z",
      text: `Si aggiungono ai crediti del blocco 4 e valgono fino a martedì 3 novembre: ${PLUS} ${RULE}`,
      summary: "Valgono fino a martedì 3 novembre, 30 giorni dopo la fine del blocco 4.",
    },
    bought: [],
    after: after(4, 6, 1),
  },
  Elena: { lock: ["libero", LIBERO_NOC, LIBERO_COACH], validity: null, bought: [], after: null },
  Davide: {
    lock: ["concluso", CONCLUSO_NOC, CONCLUSO_COACH],
    validity: null,
    bought: [],
    after: null,
  },
  Luca: {
    lock: null,
    validity: {
      blockNumber: 2,
      until: "2026-10-28",
      extended: true,
      expiresAt: "2026-10-28T22:59:59.999Z",
      text: `Si aggiungono ai crediti del blocco 2 e valgono fino a mercoledì 28 ottobre: ${PLUS} ${RULE}`,
      summary: "Valgono fino a mercoledì 28 ottobre, 30 giorni dopo la fine del blocco 2.",
    },
    bought: [],
    // Il caso che decide: oggi Prenota conta già i crediti del blocco dopo (8).
    after: after(9, 11, 1),
  },
  Sara: {
    lock: null,
    validity: {
      blockNumber: 1,
      until: "2026-10-11",
      extended: false,
      expiresAt: "2026-10-11T21:59:59.999Z",
      text: `Si aggiungono ai crediti del blocco 1 e valgono fino a domenica 11 ottobre, come gli altri. ${RULE}`,
      summary: "Valgono fino a domenica 11 ottobre, fine del blocco 1.",
    },
    bought: [],
    after: after(1, 3, 1),
  },
  // Il percorso finisce col blocco fra 5 giorni: l'ultima settimana (decisione 14).
  Giorgio: { lock: lastWeek("sabato 3 ottobre"), validity: null, bought: [], after: null },
  Paola: {
    lock: null,
    validity: {
      blockNumber: 2,
      until: "2026-10-05",
      extended: false,
      expiresAt: "2026-10-05T21:59:59.999Z",
      text: `Si aggiungono ai crediti del blocco 2 e valgono fino a lunedì 5 ottobre, come gli altri. ${RULE}`,
      summary: "Valgono fino a lunedì 5 ottobre, fine del blocco 2.",
    },
    bought: [],
    after: after(3, 5, 1),
  },
  Nina: { lock: ["altro", ALTRO_NOC, ALTRO_COACH], validity: null, bought: [], after: null },
  Pietro: {
    lock: ["pacchetto", PACCHETTO_NOC, PACCHETTO_COACH],
    validity: null,
    bought: [],
    after: null,
  },
  "Pietro finito": {
    lock: ["concluso", CONCLUSO_NOC, CONCLUSO_COACH],
    validity: null,
    bought: [],
    after: null,
  },
  // Abbonamento senza rinnovo e senza il mese dopo: il percorso finisce fra 3
  // giorni, l'ultima settimana.
  Rita: { lock: lastWeek("giovedì 1 ottobre"), validity: null, bought: [], after: null },
  Anna: {
    lock: null,
    // 7 giorni esatti alla fine del blocco: niente proroga.
    validity: {
      blockNumber: 1,
      until: "2026-10-05",
      extended: false,
      expiresAt: "2026-10-05T21:59:59.999Z",
      text: `Si aggiungono ai crediti del blocco 1 e valgono fino a lunedì 5 ottobre, come gli altri. ${RULE}`,
      summary: "Valgono fino a lunedì 5 ottobre, fine del blocco 1.",
    },
    bought: [],
    after: after(3, 5, 1),
  },
  Bruno: {
    lock: null,
    validity: {
      blockNumber: 1,
      until: "2026-11-03",
      extended: true,
      expiresAt: "2026-11-03T22:59:59.999Z",
      text: `Si aggiungono ai crediti del blocco 1 e valgono fino a martedì 3 novembre: ${PLUS} ${RULE}`,
      summary: "Valgono fino a martedì 3 novembre, 30 giorni dopo la fine del blocco 1.",
    },
    bought: [],
    after: after(3, 5, 1),
  },
  Carlo: { lock: ["altro", ALTRO_NOC, ALTRO_COACH], validity: null, bought: [], after: null },
  // Oggi è l'ultimo giorno del suo ultimo blocco.
  Vera: { lock: lastWeek("oggi"), validity: null, bought: [], after: null },
};

describe("le sedici persone", () => {
  it("ci sono tutte, una volta", () => {
    expect(PERSONAS06.map((p) => p.name).sort()).toEqual(Object.keys(WANT).sort());
  });
});

for (const p of PERSONAS06) {
  const want = WANT[p.name]!;
  describe(`lo Store di ${p.name}`, () => {
    const state = stateOf(p);

    it("chi non compra: la card, col suo motivo", () => {
      const lock = storeLock(p.client, state, NOC, NOW);
      const withCoach = storeLock(p.client, stateOf(p, COACH), COACH, NOW);
      if (!want.lock) {
        expect(lock).toBeNull();
        expect(withCoach).toBeNull();
        expect(state.canBuy).toBe(true);
        return;
      }
      expect(state.canBuy).toBe(false);
      expect(lock).toEqual({
        kind: want.lock[0],
        title: STORE_LOCK_TITLE,
        text: want.lock[1],
        whatsapp: null,
      });
      expect(withCoach).toEqual({
        kind: want.lock[0],
        title: STORE_LOCK_TITLE,
        text: want.lock[2],
        whatsapp: { label: "Scrivi a Nicolò su WhatsApp", href: WA },
      });
    });

    it("fino a quando valgono", () => {
      expect(storeValidity(p.client, state, NOW)).toEqual(want.validity);
    });

    it("gli acquisti del blocco", () => {
      expect(storeBought(p.extras, TYPES, state).map((r) => [r.label, r.meta])).toEqual(
        want.bought,
      );
    });

    it("i riepiloghi: singolo, pacchetto, test", () => {
      const validity = storeValidity(p.client, state, NOW);
      if (!validity) {
        expect(want.after).toBeNull();
        return;
      }
      const products = storeProducts(PACKS, TYPES, NOC, null);
      const summaries = products.map((product) => storeSummary(product, validity, inputOf(p, NOC)));
      expect(summaries).toEqual([
        {
          title: "1 credito Personal Training",
          price: "40 €",
          valid: validity.summary,
          after: want.after?.[0],
          pay: "Paga 40 € con Stripe",
        },
        {
          title: "3 crediti Personal Training",
          price: "99 €",
          valid: validity.summary,
          after: want.after?.[1],
          pay: "Paga 99 € con Stripe",
        },
        {
          title: "1 credito Test funzionale",
          price: "75 €",
          valid: validity.summary,
          after: want.after?.[2],
          pay: "Paga 75 € con Stripe",
        },
      ]);
    });

    it("il pagamento decide come lo Store", () => {
      const validity = storeValidity(p.client, state, NOW);
      const purchase = boosterPurchase(p.client, p.blocks, toIsoDate(NOW));
      // La card dell'ultima settimana e il rifiuto «fine» del pagamento vanno insieme.
      const refusal = boosterRefusal(p.client, p.blocks, toIsoDate(NOW));
      expect(refusal === "fine").toBe(want.lock?.[0] === "fine");
      if (!validity) {
        expect(purchase).toBeNull();
        return;
      }
      expect(purchase).toEqual({
        blockId: state.reference?.id,
        until: validity.until,
        extended: validity.extended,
        expiresAt: validity.expiresAt,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// I prodotti
// ---------------------------------------------------------------------------

const SINGLE: StoreProduct = {
  key: "single",
  eventTypeId: "pt",
  typeName: "Personal Training",
  quantity: 1,
  amountCents: 4000,
  title: "1 credito Personal Training",
  description: null,
  meta: "60 min a sessione",
  price: "40 €",
  per: "1 credito",
  best: false,
  highlighted: false,
  color: "#D50000",
  bookable: true,
};
const PACK: StoreProduct = {
  ...SINGLE,
  key: "pack",
  quantity: 3,
  amountCents: 9900,
  title: "3 crediti Personal Training",
  price: "99 €",
  per: "33 € a sessione",
  best: true,
};
const TRIAGE: StoreProduct = {
  key: "triage",
  eventTypeId: "test",
  typeName: "Test funzionale",
  quantity: 1,
  amountCents: 7500,
  title: "1 credito Test funzionale",
  description: null,
  meta: "60 min a sessione · si prenota con il tuo coach",
  price: "75 €",
  per: "1 credito",
  best: false,
  highlighted: false,
  color: "#33B864",
  bookable: false,
};

describe("euro", () => {
  it.each([
    [4000, "40 €"],
    [9900, "99 €"],
    [3990, "39,90 €"],
    [3333, "33,33 €"],
    [100050, "1000,50 €"],
    [5, "0,05 €"],
  ])("%i centesimi → «%s»", (cents, label) => {
    expect(euro(cents)).toBe(label);
  });
});

describe("storeProducts", () => {
  it("solo i pacchetti attivi, in euro, di una tipologia del coach; il pacchetto è il più conveniente", () => {
    expect(storeProducts(PACKS, TYPES, NOC, null)).toEqual([SINGLE, PACK, TRIAGE]);
  });

  it("con la tipologia di type: in testa e in evidenza", () => {
    expect(storeProducts(PACKS, TYPES, NOC, "test").map((p) => [p.key, p.highlighted])).toEqual([
      ["triage", true],
      ["single", false],
      ["pack", false],
    ]);
    expect(storeProducts(PACKS, TYPES, NOC, "pt").map((p) => [p.key, p.highlighted])).toEqual([
      ["single", true],
      ["pack", true],
      ["triage", false],
    ]);
    expect(
      storeProducts(PACKS, TYPES, NOC, "4b9c2f5e-0d1a-4c3b-9e8f-7a6b5c4d3e2f").map((p) => [
        p.key,
        p.highlighted,
      ]),
    ).toEqual([
      ["single", false],
      ["pack", false],
      ["triage", false],
    ]);
  });

  it("col coach: la tipologia che prenota lui dice il suo nome", () => {
    expect(storeProducts(PACKS, TYPES, COACH, null).map((p) => p.meta)).toEqual([
      "60 min a sessione",
      "60 min a sessione",
      "60 min a sessione · si prenota con Nicolò",
    ]);
  });

  it("titolo e descrizione da booster_packs, dopo il trim", () => {
    expect(
      storeProducts(PACKS_TITLED, TYPES, NOC, null).map((p) => [p.key, p.title, p.description]),
    ).toEqual([
      [
        "single",
        "1 sessione Personal Training",
        "Per recuperare un allenamento o lavorare su un esercizio.",
      ],
      ["pack", "3 crediti Personal Training", null],
      ["triage", "1 credito Test funzionale", null],
    ]);
  });

  it("a pari prezzo per credito nessuno è il più conveniente, e da solo nemmeno", () => {
    expect(
      storeProducts(PACKS_TIE, TYPES, NOC, null).map((p) => [p.key, p.per, p.best, p.title]),
    ).toEqual([
      ["call3", "33,33 € a sessione", false, "3 crediti Consulenza"],
      ["pt1", "1 credito", false, "1 credito Personal Training"],
      ["pt3", "33 € a sessione", false, "3 crediti Personal Training"],
      ["pt6", "33 € a sessione", false, "6 crediti Personal Training"],
    ]);
  });

  it("senza pacchetti nessun prodotto, e il testo al loro posto", () => {
    expect(storeProducts([], TYPES, NOC, null)).toEqual([]);
    expect(storeEmpty(NOC)).toBe(
      "Al momento non ci sono Booster da acquistare. Per altre sessioni scrivi al tuo coach.",
    );
    expect(storeEmpty(COACH)).toBe(
      "Al momento non ci sono Booster da acquistare. Per altre sessioni scrivi a Nicolò.",
    );
  });

  it("due tipologie con lo stesso nome: vale la prima, come nel pagamento", () => {
    const pt2 = { ...TYPES[0]!, id: "pt2", color: "#039BE5" };
    expect(
      storeProducts(PACKS, [...TYPES, pt2], NOC, null).map((p) => [p.key, p.eventTypeId]),
    ).toEqual([
      ["single", "pt"],
      ["pack", "pt"],
      ["triage", "test"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Gli acquisti del blocco
// ---------------------------------------------------------------------------

describe("storeBought", () => {
  const giulia = stateOf(GIULIA06);
  const rows = (extras: StorePurchase[]) =>
    storeBought(extras, TYPES, giulia).map((r) => [r.id, r.label, r.meta]);

  it("i pagamenti del blocco in corso, dal più recente: niente blocco 2, niente coach", () => {
    expect(rows(GIULIA06.extras)).toEqual([
      ["g-buy-25", "+3 Personal Training", "ven 25 set · 99 €"],
      ["g-buy-19", "+1 Personal Training", "sab 19 set · 40 €"],
    ]);
  });

  it("un acquisto di oggi senza prezzo va in testa, senza prezzo", () => {
    expect(rows([...GIULIA06.extras, { ...ARRIVED, price_paid: null }])).toEqual([
      ["x-new", "+1 Personal Training", "lun 28 set"],
      ["g-buy-25", "+3 Personal Training", "ven 25 set · 99 €"],
      ["g-buy-19", "+1 Personal Training", "sab 19 set · 40 €"],
    ]);
  });

  it("una tipologia che il coach non ha più: solo i crediti", () => {
    const zzz = { ...ARRIVED, id: "x-zzz", event_type_id: "zzz", quantity: 2 };
    expect(rows([zzz])).toEqual([["x-zzz", "+2 crediti", "lun 28 set · 40 €"]]);
    expect(rows([{ ...zzz, quantity: 1 }])).toEqual([["x-zzz", "+1 credito", "lun 28 set · 40 €"]]);
  });

  it("senza blocco di riferimento nessuna riga", () => {
    expect(storeBought(GIULIA06.extras, TYPES, { reference: null })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Con quale card restano gli acquisti (06b)
// ---------------------------------------------------------------------------

describe("storeBoughtVisible", () => {
  /** Come la pagina: la card, le righe e se la lista si vede. */
  const page = (p: StorePersona) => {
    const state = stateOf(p);
    const lock = storeLock(p.client, state, NOC, NOW);
    const bought = storeBought(p.extras, TYPES, state);
    return {
      lock: lock?.kind ?? null,
      bought: bought.map((r) => [r.label, r.meta]),
      visible: storeBoughtVisible(lock, bought),
    };
  };

  it("delle sedici persone solo Giulia ha la lista, con le sue due righe", () => {
    expect(PERSONAS06.filter((p) => page(p).visible).map((p) => p.name)).toEqual(["Giulia"]);
    expect(page(GIULIA06)).toEqual({
      lock: null,
      bought: [
        ["+3 Personal Training", "ven 25 set · 99 €"],
        ["+1 Personal Training", "sab 19 set · 40 €"],
      ],
      visible: true,
    });
  });

  it("Giorgio, Rita e Vera: la card dell'ultima settimana, nessun acquisto, niente lista", () => {
    for (const name of ["Giorgio", "Rita", "Vera"]) {
      expect(page(persona(name))).toEqual({ lock: "fine", bought: [], visible: false });
    }
  });

  it("l'ultima settimana con un Booster comprato nel blocco: la lista sotto la card", () => {
    const giorgio = persona("Giorgio");
    const bought = paid(
      "r-buy-25",
      "pt",
      1,
      0,
      at(2026, 9, 25, 18, 30),
      40,
      "cs_test_giorgio25",
      "2026-10-03",
    );
    expect(page({ ...giorgio, extras: [...giorgio.extras, bought] })).toEqual({
      lock: "fine",
      bought: [["+1 Personal Training", "ven 25 set · 40 €"]],
      visible: true,
    });
  });

  it("il percorso concluso con un Booster comprato nell'ultimo blocco: solo la card", () => {
    const davide = persona("Davide");
    const bought = paid(
      "d-buy-20",
      "pt",
      1,
      1,
      at(2026, 8, 20, 10, 0),
      40,
      "cs_test_davide20",
      "2026-09-06",
    );
    expect(page({ ...davide, extras: [...davide.extras, bought] })).toEqual({
      lock: "concluso",
      bought: [["+1 Personal Training", "gio 20 ago · 40 €"]],
      visible: false,
    });
  });

  it("senza righe mai; con le righe senza card e sotto «fine», non sotto le altre card", () => {
    const rows = storeBought(GIULIA06.extras, TYPES, stateOf(GIULIA06));
    expect(rows).toHaveLength(2);
    expect(storeBoughtVisible(null, [])).toBe(false);
    expect(storeBoughtVisible({ kind: "fine" }, [])).toBe(false);
    expect(storeBoughtVisible(null, rows)).toBe(true);
    expect(storeBoughtVisible({ kind: "fine" }, rows)).toBe(true);
    for (const kind of ["concluso", "libero", "pacchetto", "altro"] as const) {
      expect(storeBoughtVisible({ kind }, rows)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Il ritorno da Stripe
// ---------------------------------------------------------------------------

describe("le costanti dello Store", () => {
  it("i tempi e i testi fissi", () => {
    expect([STORE_POLL_MS, STORE_POLL_FOR_MS, STORE_MATCH_WINDOW_MS]).toEqual([
      2000, 20_000, 900_000,
    ]);
    expect(STORE_CANCEL_TOAST).toBe("Pagamento non completato: nessun addebito.");
    expect(STORE_FOOTER).toBe(
      "Il pagamento avviene sulla pagina sicura di Stripe. I crediti compaiono appena il pagamento è completato.",
    );
    expect(STORE_DONE_TITLE).toBe("Pagamento completato");
    expect(STORE_LOCK_TITLE).toBe("I Booster si aggiungono a un percorso");
  });
});

describe("findPurchase", () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
  const row = (id: string, createdAt: string, session: string | null = `cs_test_${id}`) => ({
    ...ARRIVED,
    id,
    created_at: createdAt,
    stripe_payment_id: session,
  });

  it("con la sessione, solo la sua riga, anche vecchia", () => {
    expect(findPurchase([ARRIVED, ARRIVED_OLD], "cs_test_old", "pt", NOW)?.id).toBe("x-old");
    expect(findPurchase([ARRIVED], "cs_test_altro", "pt", NOW)).toBeNull();
  });

  it("senza sessione: il pagamento più recente della tipologia negli ultimi 15 minuti", () => {
    const edge = row("edge", ago(STORE_MATCH_WINDOW_MS));
    const out = row("out", ago(STORE_MATCH_WINDOW_MS + 1));
    const later = row("later", new Date(NOW.getTime() + 1).toISOString());
    expect(findPurchase([edge, out, later], null, "pt", NOW)?.id).toBe("edge");
    expect(findPurchase([out, later], null, "pt", NOW)).toBeNull();
    expect(findPurchase([edge, ARRIVED], null, "pt", NOW)?.id).toBe("x-new");
    expect(findPurchase([ARRIVED, edge], null, "pt", NOW)?.id).toBe("x-new");
  });

  it("senza sessione: non un credito del coach, non un'altra tipologia", () => {
    expect(findPurchase([row("coach", ago(60_000), null)], null, "pt", NOW)).toBeNull();
    expect(findPurchase([ARRIVED], null, "test", NOW)).toBeNull();
  });

  it("senza sessione e senza tipologia, niente", () => {
    expect(findPurchase([ARRIVED], null, null, NOW)).toBeNull();
  });
});

describe("storeOutcome", () => {
  const outcome = (
    p: StorePersona,
    rows: StorePurchase[],
    session: string | null,
    typeId: string | null,
    elapsedMs = 0,
    coach: BookCoach = NOC,
  ): StoreOutcome => {
    const extras = [...p.extras, ...rows];
    return storeOutcome({
      purchases: extras,
      session,
      typeId,
      elapsedMs,
      input: inputOf({ ...p, extras }, coach),
      coach,
    });
  };
  const WAITING: StoreOutcome = {
    kind: "waiting",
    text: "Pagamento ricevuto: i crediti arrivano tra qualche secondo.",
  };
  const PT_ARRIVED = (n: number, purchaseId = "x-new"): StoreOutcome => ({
    kind: "arrived",
    purchaseId,
    text: `+1 credito Personal Training. Ora ne hai ${n} disponibili. Il tuo coach vede l'acquisto nelle notifiche.`,
    action: { kind: "book", eventTypeId: "pt" },
  });

  it("senza la riga: in attesa fino a 20 secondi, poi in ritardo", () => {
    expect(outcome(GIULIA06, [], "cs_test_new", "pt", 0)).toEqual(WAITING);
    expect(outcome(GIULIA06, [], "cs_test_new", "pt", 19_999)).toEqual(WAITING);
    expect(outcome(GIULIA06, [], "cs_test_new", "pt", 20_000)).toEqual({
      kind: "late",
      text: "I crediti non sono ancora arrivati. Se non compaiono entro qualche minuto scrivi al tuo coach.",
    });
    expect(outcome(GIULIA06, [], "cs_test_new", "pt", 20_000, COACH)).toEqual({
      kind: "late",
      text: "I crediti non sono ancora arrivati. Se non compaiono entro qualche minuto scrivi a Nicolò.",
    });
  });

  it("con la riga e la sua sessione: arrivata, e il conto del riepilogo", () => {
    expect(outcome(GIULIA06, [ARRIVED], "cs_test_new", "pt")).toEqual(PT_ARRIVED(4));
    expect(outcome(GIULIA06, [ARRIVED], "cs_test_new", "pt", 20_000)).toEqual(PT_ARRIVED(4));
    expect(outcome(GIULIA06, [ARRIVED], "cs_test_new", "pt", 0, COACH)).toEqual({
      kind: "arrived",
      purchaseId: "x-new",
      text: "+1 credito Personal Training. Ora ne hai 4 disponibili. Nicolò vede l'acquisto nelle notifiche.",
      action: { kind: "book", eventTypeId: "pt" },
    });
  });

  it("la riga arrivata non si conta due volte, anche se la lettura non l'ha ancora", () => {
    const extras = [...GIULIA06.extras, ARRIVED];
    expect(
      storeOutcome({
        purchases: extras,
        session: "cs_test_new",
        typeId: "pt",
        elapsedMs: 0,
        input: inputOf(GIULIA06, NOC),
        coach: NOC,
      }),
    ).toEqual(PT_ARRIVED(4));
  });

  it("senza sessione ma con la tipologia: arrivata", () => {
    expect(outcome(GIULIA06, [ARRIVED], null, "pt")).toEqual(PT_ARRIVED(4));
  });

  it("con una sessione diversa: in attesa", () => {
    expect(outcome(GIULIA06, [ARRIVED], "cs_test_altra", "pt")).toEqual(WAITING);
  });

  it("16 minuti fa: senza sessione in attesa, con la sua sessione arrivata", () => {
    expect(outcome(GIULIA06, [ARRIVED_OLD], null, "pt")).toEqual(WAITING);
    expect(outcome(GIULIA06, [ARRIVED_OLD], "cs_test_old", "pt")).toEqual(PT_ARRIVED(4, "x-old"));
  });

  it("senza sessione e senza tipologia: in attesa", () => {
    expect(outcome(GIULIA06, [ARRIVED], null, null)).toEqual(WAITING);
  });

  it("il test funzionale, che si prenota col coach", () => {
    expect(outcome(GIULIA06, [ARRIVED_TEST], "cs_test_triage", "test")).toEqual({
      kind: "arrived",
      purchaseId: "x-test",
      text: "+1 credito Test funzionale. Ora ne hai 2 disponibili. Il tuo coach vede l'acquisto nelle notifiche.",
      action: { kind: "none" },
    });
    expect(outcome(GIULIA06, [ARRIVED_TEST], "cs_test_triage", "test", 0, COACH)).toEqual({
      kind: "arrived",
      purchaseId: "x-test",
      text: "+1 credito Test funzionale. Ora ne hai 2 disponibili. Nicolò vede l'acquisto nelle notifiche.",
      action: { kind: "whatsapp", label: "Scrivi a Nicolò per fissarlo", href: WA },
    });
  });

  it("Luca, l'ultimo giorno del blocco 2: come il suo riepilogo", () => {
    const luca = paid(
      "x-luca",
      "pt",
      1,
      0,
      at(2026, 9, 28, 10, 39),
      40,
      "cs_test_luca",
      "2026-10-28",
    );
    expect(outcome(persona("Luca"), [luca], "cs_test_luca", "pt")).toEqual(PT_ARRIVED(9, "x-luca"));
  });

  it("una tipologia che il coach non ha più", () => {
    const zzz = {
      ...ARRIVED,
      id: "x-zzz",
      event_type_id: "zzz",
      quantity: 2,
      stripe_payment_id: "cs_test_zzz",
    };
    expect(outcome(GIULIA06, [zzz], "cs_test_zzz", "zzz")).toEqual({
      kind: "arrived",
      purchaseId: "x-zzz",
      text: "+2 crediti. Ora ne hai 2 disponibili. Il tuo coach vede l'acquisto nelle notifiche.",
      action: { kind: "none" },
    });
  });
});

// ---------------------------------------------------------------------------
// Gli errori del pagamento
// ---------------------------------------------------------------------------

describe("storePayError", () => {
  const LAST_WEEK_PAY =
    "Nell'ultima settimana del percorso i Booster non si acquistano: per una sessione in più scrivi al tuo coach.";

  it("le frasi del pagamento per il cliente restano", () => {
    expect(STORE_PAY_ERRORS).toEqual([
      "Troppe richieste, riprova tra qualche minuto.",
      "Pacchetto non valido.",
      "Tipologia di sessione non disponibile per questo coach.",
      "Al momento non puoi acquistare Booster: serve un blocco in corso.",
      LAST_WEEK_PAY,
      "Errore durante la creazione del checkout. Riprova più tardi.",
    ]);
    for (const m of STORE_PAY_ERRORS) expect(storePayError(m)).toBe(m);
    expect(storePayError("  Pacchetto non valido.  ")).toBe("Pacchetto non valido.");
  });

  it("il rifiuto dell'ultima settimana (decisione 14) resta com'è", () => {
    expect(storePayError(LAST_WEEK_PAY)).toBe(LAST_WEEK_PAY);
  });

  it("tutto il resto diventa il testo generico", () => {
    expect(STORE_PAY_GENERIC).toBe("Il pagamento non è partito. Riprova tra qualche minuto.");
    for (const m of [
      "Nessun percorso attivo trovato. Devi avere un abbonamento in corso per acquistare i Booster.",
      "Invalid or missing package_type",
      "Edge Function returned a non-2xx status code",
      "Nessun coach assegnato.",
      "Errore lettura pacchetto.",
      "Permesso negato",
      "Currency non supportata",
      "Payload troppo grande",
      "",
      null,
      undefined,
    ]) {
      expect(storePayError(m)).toBe(STORE_PAY_GENERIC);
    }
  });
});

// ---------------------------------------------------------------------------
// I parametri dell'indirizzo
// ---------------------------------------------------------------------------

describe("storeSearch", () => {
  const UUID = "8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  it("i tre parametri buoni passano", () => {
    expect(storeSearch({ type: UUID, booster: "success", session: "cs_test_a1B2c3" })).toEqual({
      type: UUID,
      booster: "success",
      session: "cs_test_a1B2c3",
    });
    expect(storeSearch({ type: UUID.toUpperCase(), booster: "cancel" })).toEqual({
      type: UUID.toUpperCase(),
      booster: "cancel",
    });
    expect(storeSearch({ booster: "ok", session: "cs_live_Z9" })).toEqual({
      session: "cs_live_Z9",
    });
  });

  it("gli altri valori non entrano", () => {
    expect(storeSearch({ type: "pt" })).toEqual({});
    expect(storeSearch({ session: 123, type: 5, booster: true })).toEqual({});
    expect(storeSearch({ booster: "SUCCESS" })).toEqual({});
    for (const session of [
      "cs_test_",
      "cs_test_a1-b2",
      "https://evil.example/cs_test_a1",
      "cs_prod_a1",
      `cs_test_${"a".repeat(256)}`,
    ]) {
      expect(storeSearch({ session })).toEqual({});
    }
  });
});
