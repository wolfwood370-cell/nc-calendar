// ----------------------------------------------------------------------------
// Le persone dello Store (passata 06)
// ----------------------------------------------------------------------------
// Lo usano solo i test. Le nove persone della Home (client-home-seed.ts), con
// Giulia che ha i suoi acquisti, più sei persone nuove: il PT Pack in corso e
// finito, l'abbonamento senza rinnovo, i 7 e i 6 giorni alla fine del blocco,
// il cliente archiviato. Poi i pacchetti di booster_packs e le righe del
// ritorno da Stripe. Lunedì 28/09/2026 alle 10:40, ora locale: le stesse
// attese a Roma, in UTC e a Los Angeles. Le scadenze dei Booster sono quelle
// che scrive il pagamento (endOfRomeDay), i crediti del coach scadono nel 2100.
// ----------------------------------------------------------------------------

import type { BookClient, BookCoach, BookStateInput } from "@/lib/client-book";
import type { ClientBlock, PoolExtra } from "@/lib/client-credits";
import type { StorePack, StorePurchase } from "@/lib/client-store";
import type { BookingRow } from "@/lib/queries";
import {
  DAVIDE,
  ELENA,
  GIORGIO,
  GIULIA,
  LUCA,
  MARTA,
  NINA,
  NOW,
  PAOLA,
  SARA,
  TYPES,
  alloc,
  at,
  block,
  client,
  forCredits,
  s,
  type Person,
} from "@/lib/testing/client-home-seed";
import { endOfRomeDay } from "../../../supabase/functions/_shared/booster-validity";

export interface StorePersona {
  name: string;
  client: BookClient;
  blocks: ClientBlock[];
  bookings: BookingRow[];
  /** Le righe di extra_credits del cliente, con le colonne dell'acquisto. */
  extras: StorePurchase[];
}

/** I titoli dei Booster attivi (useActiveShopTitles). */
export const BOOSTER_TITLES = ["Personal Training", "Test funzionale"];

/** Una riga di extra_credits pagata con Stripe. */
export const paid = (
  id: string,
  typeId: string,
  quantity: number,
  booked: number,
  createdAt: Date,
  pricePaid: number | null,
  session: string,
  until: string,
): StorePurchase => ({
  id,
  event_type_id: typeId,
  quantity,
  quantity_booked: booked,
  expires_at: endOfRomeDay(until),
  created_at: createdAt.toISOString(),
  price_paid: pricePaid,
  stripe_payment_id: session,
});

/** I crediti del coach di una persona della 05: nessun pagamento. */
const coachCredits = (name: string, extras: readonly PoolExtra[]): StorePurchase[] =>
  extras.map((e, i) => ({
    ...e,
    id: `${name}-coach-${i + 1}`,
    created_at: at(2026, 9, 1, 9).toISOString(),
    price_paid: null,
    stripe_payment_id: null,
  }));

const fromHome = (name: string, p: Person): StorePersona => ({
  name,
  client: p.client,
  blocks: p.blocks,
  bookings: p.bookings,
  extras: coachCredits(name, p.extras),
});

// ---------------------------------------------------------------------------
// Giulia con i suoi acquisti
// ---------------------------------------------------------------------------

/**
 * 1 PT il 10/09 nel blocco 2; 1 PT il 19/09 e 3 PT il 25/09 alle 18:30 nel
 * blocco 3, tutti e tre usati; più un credito BIA dato dal coach il 20/09,
 * senza pagamento.
 */
export const GIULIA06: StorePersona = {
  ...fromHome("Giulia", GIULIA),
  extras: [
    paid("g-buy-b2", "pt", 1, 1, at(2026, 9, 10, 17, 5), 40, "cs_test_giulia10", "2026-10-13"),
    paid("g-buy-19", "pt", 1, 1, at(2026, 9, 19, 11, 20), 40, "cs_test_giulia19", "2026-10-11"),
    paid("g-buy-25", "pt", 3, 3, at(2026, 9, 25, 18, 30), 99, "cs_test_giulia25", "2026-10-11"),
    {
      id: "g-coach-bia",
      event_type_id: "bia",
      quantity: 1,
      quantity_booked: 0,
      expires_at: "2100-01-01T00:00:00.000Z",
      created_at: at(2026, 9, 20, 9).toISOString(),
      price_paid: null,
      stripe_payment_id: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Le persone nuove
// ---------------------------------------------------------------------------

const packClient: BookClient = { ...client("fixed"), pack_label: "Pacchetto 3 sessioni" };

/** PT Pack con il blocco in corso. */
export const PIETRO: StorePersona = {
  name: "Pietro",
  client: packClient,
  blocks: [block("k1", 1, "2026-09-14", "2026-10-11", [alloc("k1", "pt", 3, 1)])],
  bookings: [s("k-done", "pt", "k1", "completed", at(2026, 9, 17, 9))],
  extras: [],
};

/** PT Pack finito il 30/08. */
export const PIETRO_FINITO: StorePersona = {
  name: "Pietro finito",
  client: packClient,
  blocks: [block("kf1", 1, "2026-08-03", "2026-08-30", [alloc("kf1", "pt", 3, 3)], "completed")],
  bookings: [
    s("kf-done-1", "pt", "kf1", "completed", at(2026, 8, 5, 9)),
    s("kf-done-2", "pt", "kf1", "completed", at(2026, 8, 12, 9)),
    s("kf-done-3", "pt", "kf1", "completed", at(2026, 8, 19, 9)),
  ],
  extras: [],
};

/** Abbonamento senza rinnovo: il mese finisce il 01/10 e il dopo non c'è. */
export const RITA: StorePersona = {
  name: "Rita",
  client: client("recurring"),
  blocks: [block("ri1", 1, "2026-09-02", "2026-10-01", [alloc("ri1", "pt", 4, 2)])],
  bookings: [
    s("ri-done-1", "pt", "ri1", "completed", at(2026, 9, 9, 9)),
    s("ri-done-2", "pt", "ri1", "completed", at(2026, 9, 16, 9)),
  ],
  extras: [],
};

/** Percorso fisso, 7 giorni esatti alla fine del blocco, e il blocco dopo c'è. */
export const ANNA: StorePersona = {
  name: "Anna",
  client: client("fixed"),
  blocks: [
    block("an1", 1, "2026-09-08", "2026-10-05", [alloc("an1", "pt", 4, 2)]),
    block("an2", 2, "2026-10-06", "2026-11-02", [alloc("an2", "pt", 4, 0)]),
  ],
  bookings: [
    s("an-done-1", "pt", "an1", "completed", at(2026, 9, 10, 9)),
    s("an-done-2", "pt", "an1", "completed", at(2026, 9, 17, 9)),
  ],
  extras: [],
};

/** Percorso fisso, 6 giorni alla fine del blocco, e il blocco dopo c'è. */
export const BRUNO: StorePersona = {
  name: "Bruno",
  client: client("fixed"),
  blocks: [
    block("br1", 1, "2026-09-07", "2026-10-04", [alloc("br1", "pt", 4, 2)]),
    block("br2", 2, "2026-10-05", "2026-11-01", [alloc("br2", "pt", 4, 0)]),
  ],
  bookings: [
    s("br-done-1", "pt", "br1", "completed", at(2026, 9, 9, 9)),
    s("br-done-2", "pt", "br1", "completed", at(2026, 9, 16, 9)),
  ],
  extras: [],
};

/** Archiviato, con un blocco nelle date di oggi. */
export const CARLO: StorePersona = {
  name: "Carlo",
  client: { ...client("fixed"), status: "archived" },
  blocks: [block("ca1", 1, "2026-09-14", "2026-10-11", [alloc("ca1", "pt", 8, 2)])],
  bookings: [
    s("ca-done-1", "pt", "ca1", "completed", at(2026, 9, 15, 9)),
    s("ca-done-2", "pt", "ca1", "completed", at(2026, 9, 22, 9)),
  ],
  extras: [],
};

/** Le quindici persone, nell'ordine dei test. */
export const PERSONAS06: readonly StorePersona[] = [
  GIULIA06,
  fromHome("Marta", MARTA),
  fromHome("Elena", ELENA),
  fromHome("Davide", DAVIDE),
  fromHome("Luca", LUCA),
  fromHome("Sara", SARA),
  fromHome("Giorgio", GIORGIO),
  fromHome("Paola", PAOLA),
  fromHome("Nina", NINA),
  PIETRO,
  PIETRO_FINITO,
  RITA,
  ANNA,
  BRUNO,
  CARLO,
];

/** Una persona per nome. */
export const persona = (name: string): StorePersona => {
  const p = PERSONAS06.find((x) => x.name === name);
  if (!p) throw new Error(`persona ${name} assente`);
  return p;
};

/** Il BookStateInput di una persona, come lo costruisce useClientBookState. */
export const inputOf = (p: StorePersona, coach: BookCoach, now: Date = NOW): BookStateInput => ({
  now,
  client: p.client,
  blocks: p.blocks,
  bookings: forCredits(p.bookings),
  extras: p.extras,
  eventTypes: TYPES,
  boosterTitles: BOOSTER_TITLES,
  coach,
});

// ---------------------------------------------------------------------------
// I pacchetti
// ---------------------------------------------------------------------------

const pack = (
  package_type: string,
  amount_cents: number,
  quantity: number,
  event_type_title: string,
  over: Partial<StorePack> = {},
): StorePack => ({
  package_type,
  currency: "eur",
  amount_cents,
  quantity,
  event_type_title,
  active: true,
  ...over,
});

/**
 * I tre che si vendono (test, pacchetto e singolo), più uno in dollari, uno
 * spento e uno su una tipologia che il coach non ha.
 */
export const PACKS: StorePack[] = [
  pack("triage", 7500, 1, "Test funzionale"),
  pack("pack", 9900, 3, "Personal Training"),
  pack("single", 4000, 1, "Personal Training"),
  pack("single_usd", 4500, 1, "Personal Training", { currency: "usd" }),
  pack("old", 3500, 1, "Personal Training", { active: false }),
  pack("yoga", 5000, 1, "Yoga"),
];

/** Con title e description: uno vero, uno di soli spazi, una descrizione di soli spazi. */
export const PACKS_TITLED: StorePack[] = [
  pack("single", 4000, 1, "Personal Training", {
    title: "1 sessione Personal Training",
    description: "Per recuperare un allenamento o lavorare su un esercizio.",
  }),
  pack("pack", 9900, 3, "Personal Training", { title: "   ", description: null }),
  pack("triage", 7500, 1, "Test funzionale", { title: null, description: "   " }),
];

/** A pari prezzo per credito nessuno è il più conveniente; da solo nemmeno. */
export const PACKS_TIE: StorePack[] = [
  pack("pt1", 4000, 1, "Personal Training"),
  pack("pt3", 9900, 3, "Personal Training"),
  pack("pt6", 19800, 6, "Personal Training"),
  pack("call3", 10000, 3, "Consulenza"),
];

// ---------------------------------------------------------------------------
// Il ritorno da Stripe
// ---------------------------------------------------------------------------

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** 1 PT arrivato un minuto fa, con la sessione cs_test_new: vale fino all'11/10. */
export const ARRIVED: StorePurchase = paid(
  "x-new",
  "pt",
  1,
  0,
  minutesAgo(1),
  40,
  "cs_test_new",
  "2026-10-11",
);

/** Lo stesso, arrivato 16 minuti fa, con la sessione cs_test_old. */
export const ARRIVED_OLD: StorePurchase = {
  ...ARRIVED,
  id: "x-old",
  created_at: minutesAgo(16).toISOString(),
  stripe_payment_id: "cs_test_old",
};

/** 1 test funzionale arrivato un minuto fa, con la sessione cs_test_triage. */
export const ARRIVED_TEST: StorePurchase = paid(
  "x-test",
  "test",
  1,
  0,
  minutesAgo(1),
  75,
  "cs_test_triage",
  "2026-10-11",
);
