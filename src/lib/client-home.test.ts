// Le regole della Home (passata 05): le persone del prompt, lunedì 28/09/2026
// alle 10:40. Date costruite con l'ora locale, come client-sessions.test.ts:
// le stesse attese a Roma, in UTC e a Los Angeles. I crediti vengono da
// getBookState, come nella pagina: il numero della Home è quello di Prenota.

import { describe, expect, it } from "vitest";
import {
  NO_COACH,
  getBookState,
  type BookClient,
  type BookCoach,
  type BookOption,
  type BookState,
} from "@/lib/client-book";
import type { ClientBlock, PoolEventType, PoolExtra } from "@/lib/client-credits";
import {
  concludedText,
  concludedWhatsApp,
  creditRows,
  creditsFooter,
  creditsHeader,
  creditsWarning,
  creditsWarningParts,
  creditsWarningText,
  firstFreeSlot,
  homeGreeting,
  homeNext,
  homeNextCard,
  homeRating,
  homeSections,
  installHiddenKey,
  noNextCard,
  othersLabel,
  progressModel,
  progressNote,
  ratingSubtitle,
  type CreditRow,
  type FirstFree,
  type HomeNextCard,
  type HomeNote,
  type HomeSection,
  type ProgressMeasurement,
  type ProgressMetric,
} from "@/lib/client-home";
import type { DetailEventType } from "@/lib/client-session-detail";
import { sessionName } from "@/lib/client-sessions";
import { dayPart, type ClientSlotDay } from "@/lib/client-slots";
import type { CreditAllocation } from "@/lib/credits";
import { toIsoDate } from "@/lib/current-block";
import type { SessionType } from "@/lib/mock-data";
import type { BookingRow } from "@/lib/queries";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 9, 28, 10, 40);

// ---------------------------------------------------------------------------
// Le tipologie, il coach, i Booster
// ---------------------------------------------------------------------------

type HomeType = PoolEventType & DetailEventType;

const type = (id: string, name: string, color: string, over: Partial<HomeType>): HomeType => ({
  id,
  name,
  color,
  duration: 60,
  buffer_minutes: 10,
  base_type: "PT Session",
  location_type: "physical",
  location_address: "Via Roma 12, Bologna",
  client_bookable: true,
  unavailable_message: null,
  description: null,
  ...over,
});
const TYPES: HomeType[] = [
  type("pt", "Personal Training", "#D50000", {}),
  type("bia", "Misurazione BIA", "#7986CB", {
    duration: 15,
    base_type: "BIA",
    location_address: null,
  }),
  type("test", "Test funzionale", "#33B864", {
    base_type: "Functional Test",
    client_bookable: false,
  }),
  type("call", "Consulenza", "#8E24AA", {
    duration: 30,
    buffer_minutes: 0,
    location_type: "online",
    location_address: null,
  }),
];
const BOOSTERS = ["Personal Training"];
const SESSION_TYPE: Record<string, SessionType> = {
  pt: "PT Session",
  bia: "BIA",
  test: "Functional Test",
  call: "PT Session",
};
const typeOf = (id: string | null): HomeType | undefined => TYPES.find((t) => t.id === id);

const COACH: BookCoach = {
  name: "Nicolò Castello",
  firstName: "Nicolò",
  whatsapp: "https://wa.me/393475550123",
};
const WA = "https://wa.me/393475550123";
const MEET = "https://meet.google.com/abc-defg-hij";

// ---------------------------------------------------------------------------
// Sessioni, blocchi, extra, clienti
// ---------------------------------------------------------------------------

/** Una sessione: durata e margine della tipologia (60 e 0 senza). */
const s = (
  id: string,
  typeId: string | null,
  blockId: string | null,
  status: BookingRow["status"],
  when: Date,
  over: Partial<BookingRow> = {},
): BookingRow => {
  const t = typeOf(typeId);
  return {
    id,
    client_id: "cl",
    coach_id: "co",
    block_id: blockId,
    session_type: (typeId && SESSION_TYPE[typeId]) || "PT Session",
    scheduled_at: when.toISOString(),
    status,
    meeting_link: null,
    deleted_at: null,
    event_type_id: typeId,
    notes: null,
    trainer_notes: null,
    google_event_id: null,
    title: null,
    duration_min: t?.duration ?? 60,
    buffer_min: t?.buffer_minutes ?? 0,
    is_personal: false,
    category: "client_session",
    client_confirmed_at: null,
    ...over,
  };
};

const alloc = (
  blockId: string,
  typeId: string,
  assigned: number,
  booked: number,
): CreditAllocation => ({
  block_id: blockId,
  event_type_id: typeId,
  session_type: SESSION_TYPE[typeId] ?? "PT Session",
  quantity_assigned: assigned,
  quantity_booked: booked,
});

const block = (
  id: string,
  seq: number,
  start: string,
  end: string,
  allocations: CreditAllocation[] = [],
  status = "active",
): ClientBlock => ({
  id,
  sequence_order: seq,
  start_date: start,
  end_date: end,
  status,
  allocations,
});

const extra = (typeId: string, quantity: number, booked: number): PoolExtra => ({
  event_type_id: typeId,
  quantity,
  quantity_booked: booked,
  expires_at: "2100-01-01T00:00:00.000Z",
});

const client = (path_type: string, auto_renew_blocks = false): BookClient => ({
  path_type,
  status: "active",
  pack_label: null,
  auto_renew_blocks,
});

interface Person {
  client: BookClient;
  fullName: string | null;
  blocks: ClientBlock[];
  bookings: BookingRow[];
  extras: PoolExtra[];
  feedback: { booking_id: string; rating: number }[];
}

const GIULIA: Person = {
  client: client("fixed"),
  fullName: "Giulia Bianchi",
  blocks: [
    block("b1", 1, "2026-07-20", "2026-08-16", [], "completed"),
    block("b2", 2, "2026-08-17", "2026-09-13", [], "completed"),
    block("b3", 3, "2026-09-14", "2026-10-11", [
      alloc("b3", "pt", 16, 13),
      alloc("b3", "bia", 1, 0),
      alloc("b3", "test", 1, 0),
      alloc("b3", "call", 1, 1),
    ]),
    block("b4", 4, "2026-10-12", "2026-11-08", [
      alloc("b4", "pt", 16, 0),
      alloc("b4", "call", 1, 0),
    ]),
    block("b5", 5, "2026-11-09", "2026-12-06"),
    block("b6", 6, "2026-12-07", "2027-01-03"),
  ],
  bookings: [
    s("g-done-1", "pt", "b3", "completed", at(2026, 9, 15, 9)),
    s("g-done-2", "pt", "b3", "completed", at(2026, 9, 18, 9)),
    s("g-done-3", "pt", "b3", "completed", at(2026, 9, 21, 9)),
    s("g-done-4", "pt", "b3", "completed", at(2026, 9, 25, 9)),
    s("g-done-5", "pt", "b3", "completed", at(2026, 9, 28, 8)),
    s("g-noshow", "pt", "b3", "no_show", at(2026, 9, 22, 9)),
    s("g-next-1", "pt", "b3", "scheduled", at(2026, 9, 30, 10), { google_event_id: "gg1" }),
    s("g-next-2", "pt", "b3", "scheduled", at(2026, 10, 1, 9), { google_event_id: "gg2" }),
    s("g-next-3", "pt", "b3", "scheduled", at(2026, 10, 2, 9), { google_event_id: "gg3" }),
    s("g-next-4", "pt", "b3", "scheduled", at(2026, 10, 5, 9), { google_event_id: "gg4" }),
    s("g-next-5", "pt", "b3", "scheduled", at(2026, 10, 7, 9), { google_event_id: "gg5" }),
    s("g-next-6", "pt", "b3", "scheduled", at(2026, 10, 9, 9), { google_event_id: "gg6" }),
    s("g-next-7", "pt", "b3", "scheduled", at(2026, 10, 10, 9), { google_event_id: "gg7" }),
    s("g-call", "call", "b3", "completed", at(2026, 9, 16, 18)),
    s("g-imported", "pt", null, "completed", at(2026, 9, 27, 11), {
      title: "PT Giulia",
      google_event_id: "imp1",
    }),
    // L'«Elimina» del coach: non si vede e non conta.
    s("g-deleted", "pt", "b3", "scheduled", at(2026, 9, 29, 9), {
      deleted_at: at(2026, 9, 20, 9).toISOString(),
    }),
  ],
  extras: [],
  feedback: [{ booking_id: "g-done-4", rating: 4 }],
};

const MARTA: Person = {
  client: client("recurring", true),
  fullName: "Marta Conti",
  blocks: [
    block("m1", 1, "2026-06-15", "2026-07-12", [], "completed"),
    block("m2", 2, "2026-07-13", "2026-08-09", [], "completed"),
    block("m3", 3, "2026-08-10", "2026-09-06", [], "completed"),
    block("m4", 4, "2026-09-07", "2026-10-04", [alloc("m4", "pt", 8, 5)]),
  ],
  bookings: [
    s("m-done-1", "pt", "m4", "completed", at(2026, 9, 8, 18)),
    s("m-done-2", "pt", "m4", "completed", at(2026, 9, 10, 18)),
    s("m-done-3", "pt", "m4", "completed", at(2026, 9, 12, 10)),
    s("m-next", "pt", "m4", "scheduled", at(2026, 9, 28, 19, 30)),
    s("m-other", "pt", "m4", "scheduled", at(2026, 10, 2, 9), {
      client_confirmed_at: at(2026, 9, 26, 9).toISOString(),
    }),
  ],
  extras: [],
  feedback: [],
};

const ELENA: Person = {
  client: client("free"),
  fullName: "Elena Ricci",
  blocks: [],
  bookings: [
    s("e-next", "call", null, "scheduled", at(2026, 9, 28, 12, 30), { meeting_link: MEET }),
    s("e-pt-1", "pt", null, "scheduled", at(2026, 9, 30, 16)),
    s("e-pt-2", "pt", null, "scheduled", at(2026, 10, 3, 10)),
    s("e-done-1", "pt", null, "completed", at(2026, 9, 26, 10)),
    s("e-done-2", "pt", null, "completed", at(2026, 9, 19, 10)),
  ],
  extras: [extra("pt", 6, 4), extra("call", 1, 1)],
  feedback: [],
};

const DAVIDE: Person = {
  client: client("fixed"),
  fullName: "Davide Ferrari",
  blocks: [
    block("d1", 1, "2026-07-13", "2026-08-09", [alloc("d1", "pt", 8, 8)], "completed"),
    block("d2", 2, "2026-08-10", "2026-09-06", [alloc("d2", "pt", 8, 7)], "completed"),
  ],
  bookings: [s("d-done", "pt", "d2", "completed", at(2026, 9, 2, 9))],
  extras: [],
  feedback: [],
};

const lucaBlocks = (l2End: string, l3Start: string, l3End: string): ClientBlock[] => [
  block("l1", 1, "2026-08-04", "2026-08-31", [], "completed"),
  block("l2", 2, "2026-09-01", l2End, [alloc("l2", "pt", 8, 6)]),
  block("l3", 3, l3Start, l3End, [alloc("l3", "pt", 8, 0)]),
];

// Il blocco 2 finisce oggi, e i suoi 2 crediti non si prenotano più (24 ore).
const LUCA: Person = {
  client: client("fixed"),
  fullName: "Luca",
  blocks: lucaBlocks("2026-09-28", "2026-09-29", "2026-10-26"),
  bookings: [
    s("l-done-1", "pt", "l2", "completed", at(2026, 9, 2, 9)),
    s("l-done-2", "pt", "l2", "completed", at(2026, 9, 7, 9)),
    s("l-done-3", "pt", "l2", "completed", at(2026, 9, 14, 9)),
    s("l-done-4", "pt", "l2", "completed", at(2026, 9, 18, 9)),
    s("l-done-5", "pt", "l2", "completed", at(2026, 9, 23, 9)),
    s("l-today", "pt", "l2", "scheduled", at(2026, 9, 28, 17)),
  ],
  extras: [],
  feedback: [],
};

const SARA: Person = {
  client: client("fixed"),
  fullName: "  ",
  blocks: [block("s1", 1, "2026-09-14", "2026-10-11")],
  bookings: [],
  extras: [],
  feedback: [],
};

const GIORGIO: Person = {
  client: client("fixed"),
  fullName: "Giorgio Neri",
  blocks: [
    block("r1", 1, "2026-09-06", "2026-10-03", [
      alloc("r1", "pt", 4, 4),
      alloc("r1", "test", 1, 1),
      alloc("r1", "bia", 1, 1),
    ]),
  ],
  bookings: [
    s("r-done-1", "pt", "r1", "completed", at(2026, 9, 8, 9)),
    s("r-done-2", "pt", "r1", "completed", at(2026, 9, 15, 9)),
    s("r-done-3", "pt", "r1", "completed", at(2026, 9, 22, 9)),
    // Come la scrive cancel_booking: con deleted_at, e si vede.
    s("r-late", "pt", "r1", "late_cancelled", at(2026, 9, 26, 11), {
      deleted_at: at(2026, 9, 26, 9).toISOString(),
    }),
    s("r-test", "test", "r1", "completed", at(2026, 9, 10, 9)),
    s("r-bia", "bia", "r1", "completed", at(2026, 9, 11, 9)),
    s("r-bia-extra", "bia", null, "scheduled", at(2026, 9, 29, 15)),
  ],
  extras: [extra("bia", 2, 1)],
  feedback: [{ booking_id: "r-done-3", rating: 5 }],
};

const PAOLA: Person = {
  client: client("fixed"),
  fullName: "Paola",
  blocks: [
    block("p1", 1, "2026-08-10", "2026-09-06", [], "completed"),
    block("p2", 2, "2026-09-07", "2026-10-05", [alloc("p2", "pt", 6, 4)]),
  ],
  bookings: [
    s("p-done-1", "pt", "p2", "completed", at(2026, 9, 8, 9)),
    s("p-done-2", "pt", "p2", "completed", at(2026, 9, 15, 9)),
    s("p-done-3", "pt", "p2", "completed", at(2026, 9, 22, 9)),
    s("p-next", "pt", "p2", "scheduled", at(2026, 10, 1, 9)),
  ],
  extras: [],
  feedback: [],
};

const NINA: Person = {
  client: client("fixed"),
  fullName: "Nina",
  blocks: [block("n1", 1, "2026-10-05", "2026-11-01", [alloc("n1", "pt", 8, 0)])],
  bookings: [],
  extras: [],
  feedback: [],
};

// ---------------------------------------------------------------------------
// La Home di una persona, come la compone la pagina
// ---------------------------------------------------------------------------

/** Le sessioni di useClientBookingsForCredits: deleted_at vuoto, o annullate tardi. */
const forCredits = (bookings: readonly BookingRow[]) =>
  bookings.filter((b) => !b.deleted_at || b.status === "late_cancelled");

const home = (p: Person, blocks: ClientBlock[] = p.blocks) => {
  const bookings = forCredits(p.bookings);
  const state = getBookState({
    now: NOW,
    client: p.client,
    blocks,
    bookings,
    extras: p.extras,
    eventTypes: TYPES,
    boosterTitles: BOOSTERS,
    coach: NO_COACH,
  });
  const next = homeNext(bookings, NOW);
  const rating = homeRating(bookings, p.feedback, null, NOW);
  const sections = homeSections({
    state,
    hasNext: next.next !== null,
    hasRating: rating !== null,
  });
  return { bookings, state, next, rating, sections };
};

const optionFacts = (state: BookState) =>
  state.options.map((o) => [o.key, o.state, o.count, o.countFromNext, o.sub]);

/** La card in una riga, nell'ordine del prompt. */
const cardFacts = (c: HomeNextCard): string[] => [
  c.status.label,
  c.day,
  c.time,
  c.until ?? "—",
  c.type,
  c.place ? `${c.place.text}${c.place.online ? " (online)" : ""}` : "luogo nullo",
  `${c.tile.bg} / ${c.tile.fg}`,
  [c.join && "videochiamata", c.confirm && "conferma", c.move && "sposta"]
    .filter(Boolean)
    .join(", "),
  c.note ? c.note.text : "nessuna riga",
];

const actionText = (r: CreditRow): string => {
  if (!r.action) return "nessuna";
  if (r.action.kind === "book") return `Prenota (${r.action.eventTypeId})`;
  if (r.action.kind === "how") return "Come si prenota";
  return `Acquista (${r.action.eventTypeId})`;
};

const rowFacts = (r: CreditRow) => [
  r.name,
  r.avail,
  r.tone,
  actionText(r),
  `${r.bar.done} / ${r.bar.booked} / ${r.bar.lost}`,
  r.detail,
  r.aria,
];

const footerText = (f: ReturnType<typeof creditsFooter>): string => {
  if (f.kind === "buy") return "Acquista un Booster";
  return f.href ? `${f.text} → ${f.href}` : `${f.text} (senza link)`;
};

const BUY = "Acquista un Booster";
const ASK = "Per altri crediti scrivi al tuo coach. (senza link)";
const ASK_COACH = `Per altri crediti scrivi a Nicolò → ${WA}`;
const TO_COACH = " Per un altro orario scrivi al tuo coach.";
const LOCKED = "Mancano meno di 24 ore: non si può più spostare.";
const COACH_NOTE: HomeNote = {
  text: LOCKED,
  link: { label: "Scrivi a Nicolò", href: WA },
};
const PT_ROW = "Studio · Via Roma 12, Bologna";
const PT_TILE = "#D500001a / #D50000";
const CALL_ROW = "Online · videochiamata Google Meet (online)";
const CALL_TILE = "#8E24AA1a / #8E24AA";

interface Want {
  sections: HomeSection[];
  greeting: string;
  options: (string | number | boolean)[][];
  blocked: string | null;
  canBuy: boolean;
  next: string | null;
  others: string | null;
  /** La card senza coach. */
  card?: string[];
  /** La riga della card col coach, dove cambia. */
  coachNote?: HomeNote;
  /** noNextCard(opzioni, null, false, NO_COACH), senza prossima. */
  noNext?: { text: string; book: boolean };
  header: { chip: string; sub: string | null; steps: string[] | null; aria: string | null };
  warning: string | null;
  rows: string[][];
  lost: boolean;
  footer: [string, string];
  /** La sessione da valutare e i due sottotitoli, senza coach e col coach. */
  rating: [string, string, string] | null;
}

const WANT: Record<string, [Person, Want]> = {
  Giulia: [
    GIULIA,
    {
      sections: ["next", "credits", "rating"],
      greeting: "Ciao Giulia",
      options: [
        ["pt", "prenotabile", 3, false, "60 min · 3 disponibili"],
        ["bia", "prenotabile", 1, false, "15 min · 1 disponibile"],
        ["test", "coach", 1, false, "Si prenota con il tuo coach"],
        ["call", "prenotabile", 1, true, "30 min · 1 disponibile"],
      ],
      blocked: null,
      canBuy: true,
      next: "g-next-1",
      others: "Hai altre 6 sessioni prenotate",
      card: [
        "Da confermare",
        "Mercoledì 30 settembre",
        "10:00–11:00",
        "tra 2 giorni",
        "Personal Training · 60 min",
        PT_ROW,
        PT_TILE,
        "conferma, sposta",
        "nessuna riga",
      ],
      header: {
        chip: "Blocco 3 di 6",
        sub: "Valgono fino a domenica 11 ottobre · 13 giorni",
        steps: ["done", "done", "current", "todo", "todo", "todo"],
        aria: "Percorso: blocco 3 di 6",
      },
      warning: null,
      rows: [
        [
          "Personal Training",
          "3 disponibili",
          "success",
          "Prenota (pt)",
          "31.3% / 43.8% / 6.3%",
          "5 svolte · 7 prenotate · 1 persa · 16 in totale",
          "Personal Training: 5 svolte, 7 prenotate, 1 persa, 3 disponibili su 16",
        ],
        [
          "Misurazione BIA",
          "1 disponibile",
          "success",
          "Prenota (bia)",
          "0.0% / 0.0% / 0.0%",
          "Non ancora usati · 1 in totale",
          "Misurazione BIA: 1 disponibile su 1",
        ],
        [
          "Test funzionale",
          "1 disponibile",
          "success",
          "Come si prenota",
          "0.0% / 0.0% / 0.0%",
          "Non ancora usati · 1 in totale",
          "Test funzionale: 1 disponibile su 1",
        ],
        [
          "Consulenza",
          "1 disponibile nel blocco 4",
          "success",
          "Prenota (call)",
          "100.0% / 0.0% / 0.0%",
          "1 svolta · 1 in totale",
          "Consulenza: 1 svolta, 0 disponibili su 1",
        ],
      ],
      lost: true,
      footer: [BUY, BUY],
      rating: [
        "g-done-5",
        "Personal Training di lunedì 28 settembre. La valutazione arriva al tuo coach.",
        "Personal Training di lunedì 28 settembre. La valutazione arriva a Nicolò.",
      ],
    },
  ],
  Marta: [
    MARTA,
    {
      sections: ["next", "credits"],
      greeting: "Ciao Marta",
      options: [["pt", "prenotabile", 3, false, "60 min · 3 disponibili"]],
      blocked: null,
      canBuy: true,
      next: "m-next",
      others: "Hai un'altra sessione prenotata",
      card: [
        "Da confermare",
        "Oggi",
        "19:30–20:30",
        "tra 8 ore",
        "Personal Training · 60 min",
        PT_ROW,
        PT_TILE,
        "conferma",
        LOCKED + TO_COACH,
      ],
      coachNote: COACH_NOTE,
      header: {
        chip: "Blocco 4",
        sub: "Abbonamento mensile · settimana 4 di 4 · si rinnova lunedì 5 ottobre",
        steps: null,
        aria: null,
      },
      warning: "3 crediti da prenotare entro domenica 4 ottobre.",
      rows: [
        [
          "Personal Training",
          "3 disponibili",
          "success",
          "Prenota (pt)",
          "37.5% / 25.0% / 0.0%",
          "3 svolte · 2 prenotate · 8 in totale",
          "Personal Training: 3 svolte, 2 prenotate, 3 disponibili su 8",
        ],
      ],
      lost: false,
      footer: [BUY, BUY],
      rating: null,
    },
  ],
  Elena: [
    ELENA,
    {
      sections: ["next", "credits", "rating"],
      greeting: "Ciao Elena",
      options: [["pt", "prenotabile", 2, false, "60 min · 2 disponibili"]],
      blocked: null,
      canBuy: false,
      next: "e-next",
      others: "Hai altre 2 sessioni prenotate",
      card: [
        "Da confermare",
        "Oggi",
        "12:30–13:00",
        "tra 1 ora",
        "Consulenza · 30 min",
        CALL_ROW,
        CALL_TILE,
        "conferma",
        LOCKED + TO_COACH,
      ],
      coachNote: COACH_NOTE,
      header: { chip: "Cliente libero", sub: "Crediti senza scadenza", steps: null, aria: null },
      warning: null,
      rows: [
        [
          "Personal Training",
          "2 disponibili",
          "success",
          "Prenota (pt)",
          "0.0% / 0.0% / 0.0%",
          "4 extra usati · 6 in totale",
          "Personal Training: 4 extra usati, 2 disponibili su 6",
        ],
      ],
      lost: false,
      footer: [ASK, ASK_COACH],
      rating: [
        "e-done-1",
        "Personal Training di sabato 26 settembre. La valutazione arriva al tuo coach.",
        "Personal Training di sabato 26 settembre. La valutazione arriva a Nicolò.",
      ],
    },
  ],
  Davide: [
    DAVIDE,
    {
      sections: ["concluded"],
      greeting: "Ciao Davide",
      options: [["pt", "esaurita", 0, false, "Crediti esauriti"]],
      blocked: "concluso",
      canBuy: false,
      next: null,
      others: null,
      noNext: { text: "Non hai crediti da prenotare in questo momento.", book: false },
      header: {
        chip: "Blocco 2 di 2",
        sub: "Concluso domenica 6 settembre",
        steps: ["done", "current"],
        aria: "Percorso: blocco 2 di 2",
      },
      warning: null,
      rows: [
        [
          "Personal Training",
          "Esauriti",
          "warning",
          "nessuna",
          "12.5% / 0.0% / 0.0%",
          "1 svolta · 8 in totale",
          "Personal Training: 1 svolta, 0 disponibili su 8",
        ],
      ],
      lost: false,
      footer: [ASK, ASK_COACH],
      rating: null,
    },
  ],
  Luca: [
    LUCA,
    {
      sections: ["next", "credits", "rating"],
      greeting: "Ciao Luca",
      options: [["pt", "prenotabile", 8, true, "60 min · 8 disponibili"]],
      blocked: null,
      canBuy: true,
      next: "l-today",
      others: null,
      card: [
        "Da confermare",
        "Oggi",
        "17:00–18:00",
        "tra 6 ore",
        "Personal Training · 60 min",
        PT_ROW,
        PT_TILE,
        "conferma",
        LOCKED + TO_COACH,
      ],
      coachNote: COACH_NOTE,
      header: {
        chip: "Blocco 2 di 3",
        sub: "Valgono fino a lunedì 28 settembre · ultimo giorno",
        steps: ["done", "current", "todo"],
        aria: "Percorso: blocco 2 di 3",
      },
      warning: null,
      rows: [
        [
          "Personal Training",
          "8 disponibili nel blocco 3",
          "success",
          "Prenota (pt)",
          "62.5% / 12.5% / 0.0%",
          "5 svolte · 1 prenotata · 8 in totale",
          "Personal Training: 5 svolte, 1 prenotata, 2 disponibili su 8",
        ],
      ],
      lost: false,
      footer: [BUY, BUY],
      rating: [
        "l-done-5",
        "Personal Training di mercoledì 23 settembre. La valutazione arriva al tuo coach.",
        "Personal Training di mercoledì 23 settembre. La valutazione arriva a Nicolò.",
      ],
    },
  ],
  Sara: [
    SARA,
    {
      sections: ["no-next"],
      greeting: "Ciao",
      options: [],
      blocked: "nessun-credito",
      canBuy: true,
      next: null,
      others: null,
      noNext: { text: "Non hai crediti da prenotare in questo momento.", book: false },
      header: {
        chip: "Blocco 1 di 1",
        sub: "Valgono fino a domenica 11 ottobre · 13 giorni",
        steps: null,
        aria: null,
      },
      warning: null,
      rows: [],
      lost: false,
      footer: [BUY, BUY],
      rating: null,
    },
  ],
  Giorgio: [
    GIORGIO,
    {
      sections: ["next", "credits", "rating"],
      greeting: "Ciao Giorgio",
      options: [
        ["pt", "esaurita", 0, false, "Crediti esauriti"],
        ["bia", "prenotabile", 1, false, "15 min · 1 disponibile"],
        ["test", "coach", 0, false, "Si prenota con il tuo coach"],
      ],
      blocked: null,
      canBuy: false,
      next: "r-bia-extra",
      others: null,
      card: [
        "Da confermare",
        "Domani",
        "15:00–15:15",
        "domani",
        "Misurazione BIA · 15 min",
        "Studio",
        "#7986CB1a / #7986CB",
        "conferma, sposta",
        "nessuna riga",
      ],
      header: {
        chip: "Blocco 1 di 1",
        sub: "Valgono fino a sabato 3 ottobre · 5 giorni",
        steps: null,
        aria: null,
      },
      warning: null,
      rows: [
        [
          "Personal Training",
          "Esauriti",
          "warning",
          "nessuna",
          "75.0% / 0.0% / 25.0%",
          "3 svolte · 1 persa · 4 in totale",
          "Personal Training: 3 svolte, 1 persa, 0 disponibili su 4",
        ],
        [
          "Misurazione BIA",
          "1 disponibile",
          "success",
          "Prenota (bia)",
          "33.3% / 0.0% / 0.0%",
          "1 svolta · 1 extra usato · 3 in totale",
          "Misurazione BIA: 1 svolta, 1 extra usato, 1 disponibile su 3",
        ],
        [
          "Test funzionale",
          "Esauriti",
          "warning",
          "nessuna",
          "100.0% / 0.0% / 0.0%",
          "1 svolta · 1 in totale",
          "Test funzionale: 1 svolta, 0 disponibili su 1",
        ],
      ],
      lost: true,
      footer: [ASK, ASK_COACH],
      rating: [
        "r-done-2",
        "Personal Training di martedì 15 settembre. La valutazione arriva al tuo coach.",
        "Personal Training di martedì 15 settembre. La valutazione arriva a Nicolò.",
      ],
    },
  ],
  Paola: [
    PAOLA,
    {
      sections: ["next", "credits", "rating"],
      greeting: "Ciao Paola",
      options: [["pt", "prenotabile", 2, false, "60 min · 2 disponibili"]],
      blocked: null,
      canBuy: true,
      next: "p-next",
      others: null,
      card: [
        "Prenotata",
        "Giovedì 1 ottobre",
        "09:00–10:00",
        "tra 3 giorni",
        "Personal Training · 60 min",
        PT_ROW,
        PT_TILE,
        "sposta",
        "nessuna riga",
      ],
      header: {
        chip: "Blocco 2 di 2",
        sub: "Valgono fino a lunedì 5 ottobre · 7 giorni",
        steps: ["done", "current"],
        aria: "Percorso: blocco 2 di 2",
      },
      warning: "2 crediti da prenotare entro lunedì 5 ottobre.",
      rows: [
        [
          "Personal Training",
          "2 disponibili",
          "success",
          "Prenota (pt)",
          "50.0% / 16.7% / 0.0%",
          "3 svolte · 1 prenotata · 6 in totale",
          "Personal Training: 3 svolte, 1 prenotata, 2 disponibili su 6",
        ],
      ],
      lost: false,
      footer: [BUY, BUY],
      rating: [
        "p-done-3",
        "Personal Training di martedì 22 settembre. La valutazione arriva al tuo coach.",
        "Personal Training di martedì 22 settembre. La valutazione arriva a Nicolò.",
      ],
    },
  ],
  Nina: [
    NINA,
    {
      sections: ["no-next", "credits"],
      greeting: "Ciao Nina",
      options: [["pt", "prenotabile", 8, false, "60 min · 8 disponibili"]],
      blocked: null,
      canBuy: false,
      next: null,
      others: null,
      noNext: {
        text: "Nessun orario libero nei prossimi giorni: scrivi al tuo coach per trovarne uno.",
        book: false,
      },
      header: { chip: "Blocco 1 di 1", sub: "Inizia lunedì 5 ottobre", steps: null, aria: null },
      warning: null,
      rows: [
        [
          "Personal Training",
          "8 disponibili",
          "success",
          "Prenota (pt)",
          "0.0% / 0.0% / 0.0%",
          "Non ancora usati · 8 in totale",
          "Personal Training: 8 disponibili su 8",
        ],
      ],
      lost: false,
      footer: [ASK, ASK_COACH],
      rating: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Le persone, una per una
// ---------------------------------------------------------------------------

for (const [who, [person, want]] of Object.entries(WANT)) {
  describe(`la Home di ${who}`, () => {
    const h = home(person);

    it("le sezioni e il saluto", () => {
      expect(h.sections).toEqual(want.sections);
      expect(homeGreeting(person.fullName)).toBe(want.greeting);
    });

    it("le opzioni di Prenota: il numero della Home è il loro", () => {
      expect(optionFacts(h.state)).toEqual(want.options);
      expect(h.state.blocked?.kind ?? null).toBe(want.blocked);
      expect(h.state.canBuy).toBe(want.canBuy);
    });

    it("la prossima sessione, le altre e la card", () => {
      expect(h.next.next?.id ?? null).toBe(want.next);
      expect(othersLabel(h.next.others)).toBe(want.others);
      const next = h.next.next;
      if (!next) {
        expect(want.card).toBeUndefined();
        return;
      }
      const eventType = typeOf(next.event_type_id);
      const card = homeNextCard(next, eventType, NO_COACH, NOW);
      expect(cardFacts(card)).toEqual(want.card);
      expect(card.note?.link ?? null).toBeNull();
      expect(card.tile.name).toBe(sessionName(next, eventType));
      const withCoach = homeNextCard(next, eventType, COACH, NOW);
      expect(withCoach.note).toEqual(want.coachNote ?? null);
    });

    it("senza prossima sessione, e il percorso concluso", () => {
      if (want.noNext) {
        expect(noNextCard(h.state.options, null, false, NO_COACH)).toEqual({
          ...want.noNext,
          eventTypeId: null,
        });
      }
      if (want.blocked === "concluso") {
        const end = h.state.reference?.end_date ?? "";
        expect(concludedText(end, NO_COACH)).toBe(
          "L'ultimo blocco si è chiuso domenica 6 settembre. Per ripartire scrivi al tuo coach: ti proporrà il prossimo percorso.",
        );
        expect(concludedText(end, COACH)).toBe(
          "L'ultimo blocco si è chiuso domenica 6 settembre. Per ripartire scrivi a Nicolò: ti proporrà il prossimo percorso.",
        );
        expect(concludedWhatsApp(NO_COACH)).toBeNull();
        expect(concludedWhatsApp(COACH)).toEqual({
          label: "Scrivi a Nicolò su WhatsApp",
          href: WA,
        });
      }
    });

    it("l'intestazione dei crediti e l'avviso", () => {
      const header = creditsHeader(person.client, person.blocks, NOW);
      expect({
        chip: header.chip,
        sub: header.sub,
        steps: header.steps?.steps ?? null,
        aria: header.steps?.aria ?? null,
      }).toEqual(want.header);
      expect(creditsWarning(person.client, h.state, NOW)).toBe(want.warning);
    });

    it("le righe dei crediti, la legenda e il fondo", () => {
      const rows = creditRows(h.state);
      expect(rows.map(rowFacts)).toEqual(want.rows);
      expect(rows.some((r) => r.lost > 0)).toBe(want.lost);
      expect(rows.some((r) => r.avail.includes("Completo"))).toBe(false);
      expect([
        footerText(creditsFooter(h.state.canBuy, NO_COACH)),
        footerText(creditsFooter(h.state.canBuy, COACH)),
      ]).toEqual(want.footer);
    });

    it("la valutazione", () => {
      const r = h.rating;
      if (!want.rating) {
        expect(r).toBeNull();
        return;
      }
      expect(r?.booking.id).toBe(want.rating[0]);
      expect([r?.rating, r?.note]).toEqual([null, null]);
      if (!r) return;
      const name = sessionName(r.booking, typeOf(r.booking.event_type_id));
      expect(ratingSubtitle(name, r.booking, NO_COACH)).toBe(want.rating[1]);
      expect(ratingSubtitle(name, r.booking, COACH)).toBe(want.rating[2]);
    });
  });
}

// ---------------------------------------------------------------------------
// Le card della prossima sessione, al confine
// ---------------------------------------------------------------------------

const NOTE_24 = LOCKED + TO_COACH;
const CARDS: [BookingRow, string[], HomeNote | null][] = [
  [
    s("n1", "call", null, "scheduled", at(2026, 9, 28, 10, 30), { meeting_link: MEET }),
    ["In corso", "Oggi", "10:30–11:00", "in corso", "Consulenza · 30 min", CALL_ROW, CALL_TILE],
    { text: "La sessione è in corso.", link: { label: "Scrivi a Nicolò", href: WA } },
  ],
  [
    // 60 minuti esatti: si entra.
    s("n2", "call", null, "scheduled", at(2026, 9, 28, 11, 40), { meeting_link: MEET }),
    [
      "Da confermare",
      "Oggi",
      "11:40–12:10",
      "tra 1 ora",
      "Consulenza · 30 min",
      CALL_ROW,
      CALL_TILE,
    ],
    COACH_NOTE,
  ],
  [
    s("n3", "call", null, "scheduled", at(2026, 9, 28, 11, 41), { meeting_link: MEET }),
    [
      "Da confermare",
      "Oggi",
      "11:41–12:11",
      "tra 1 ora",
      "Consulenza · 30 min",
      CALL_ROW,
      CALL_TILE,
    ],
    COACH_NOTE,
  ],
  [
    // 24 ore esatte: si sposta ancora.
    s("n4", "pt", "b3", "scheduled", at(2026, 9, 29, 10, 40)),
    [
      "Da confermare",
      "Domani",
      "10:40–11:40",
      "domani",
      "Personal Training · 60 min",
      PT_ROW,
      PT_TILE,
    ],
    null,
  ],
  [
    s("n5", "pt", "b3", "scheduled", at(2026, 9, 29, 10, 39)),
    [
      "Da confermare",
      "Domani",
      "10:39–11:39",
      "domani",
      "Personal Training · 60 min",
      PT_ROW,
      PT_TILE,
    ],
    COACH_NOTE,
  ],
  [
    s("n6", "pt", "b3", "scheduled", at(2026, 10, 2, 9), {
      client_confirmed_at: at(2026, 9, 27, 9).toISOString(),
    }),
    [
      "Confermata",
      "Venerdì 2 ottobre",
      "09:00–10:00",
      "tra 4 giorni",
      "Personal Training · 60 min",
      PT_ROW,
      PT_TILE,
    ],
    null,
  ],
  [
    s("n7", "pt", "b3", "scheduled", at(2026, 10, 5, 9)),
    [
      "Prenotata",
      "Lunedì 5 ottobre",
      "09:00–10:00",
      "tra 7 giorni",
      "Personal Training · 60 min",
      PT_ROW,
      PT_TILE,
    ],
    null,
  ],
  [
    s("n8", null, null, "scheduled", at(2026, 9, 30, 15), { category: "consulenza" }),
    [
      "Prenotata",
      "Mercoledì 30 settembre",
      "15:00–16:00",
      "tra 2 giorni",
      "Consulenza · 60 min",
      "luogo nullo",
      "#0056851a / #005685",
    ],
    null,
  ],
  [
    s("n9", "pt", "b3", "scheduled", at(2026, 10, 1, 10), { duration_min: 0 }),
    [
      "Prenotata",
      "Giovedì 1 ottobre",
      "10:00–11:00",
      "tra 3 giorni",
      "Personal Training · 60 min",
      PT_ROW,
      PT_TILE,
    ],
    null,
  ],
  [
    s("n10", "call", null, "scheduled", at(2026, 9, 28, 11, 10)),
    [
      "Da confermare",
      "Oggi",
      "11:10–11:40",
      "tra 30 min",
      "Consulenza · 30 min",
      CALL_ROW,
      CALL_TILE,
    ],
    COACH_NOTE,
  ],
];

const CARD_TAIL: Record<string, [string, string]> = {
  n1: ["videochiamata", "La sessione è in corso."],
  n2: ["videochiamata", NOTE_24],
  n3: ["conferma", NOTE_24],
  n4: ["conferma, sposta", "nessuna riga"],
  n5: ["conferma", NOTE_24],
  n6: ["sposta", "nessuna riga"],
  n7: ["sposta", "nessuna riga"],
  n8: ["sposta", "nessuna riga"],
  n9: ["sposta", "nessuna riga"],
  n10: ["conferma", NOTE_24],
};

describe("homeNextCard, al confine", () => {
  for (const [b, head, coachNote] of CARDS) {
    it(`${b.id}: chip, giorno, orario, quanto manca, tipo, luogo, riquadro, azioni, riga`, () => {
      const eventType = typeOf(b.event_type_id);
      const card = homeNextCard(b, eventType, NO_COACH, NOW);
      expect(cardFacts(card)).toEqual([...head, ...(CARD_TAIL[b.id] ?? [])]);
      expect(card.join && card.confirm).toBe(false);
      expect(homeNextCard(b, eventType, COACH, NOW).note).toEqual(coachNote);
    });
  }
});

// ---------------------------------------------------------------------------
// Il primo orario libero e la card senza sessioni
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Un giorno finto di getClientSlotDays, coi suoi orari («09:00»), dall'ora locale. */
const day = (m: number, d: number, hours: readonly string[]): ClientSlotDay => ({
  date: at(2026, m, d),
  isoDate: `2026-${pad(m)}-${pad(d)}`,
  slots: hours.map((time) => {
    const [h = 0, min = 0] = time.split(":").map(Number);
    const start = at(2026, m, d, h, min);
    return {
      iso: start.toISOString(),
      time,
      end: `${pad(h + 1)}:${pad(min)}`,
      part: dayPart(start),
      recommended: false,
    };
  }),
  reason: hours.length > 0 ? null : "pieno",
  recommendedReason: null,
  window: null,
});

const PT_OPT = { eventTypeId: "pt", name: "Personal Training" };
const BIA_OPT = { eventTypeId: "bia", name: "Misurazione BIA" };
const FREE = {
  earliestSecond: [
    { option: PT_OPT, days: [day(9, 29, []), day(10, 1, ["09:00", "10:00"])] },
    { option: BIA_OPT, days: [day(9, 30, ["15:00"])] },
  ],
  tie: [
    { option: PT_OPT, days: [day(10, 1, ["09:00"])] },
    { option: BIA_OPT, days: [day(10, 1, ["09:00"])] },
  ],
  none: [{ option: PT_OPT, days: [day(9, 29, []), day(9, 30, [])] }],
  noType: [{ option: { eventTypeId: null, name: "Sessione PT" }, days: [day(10, 2, ["18:00"])] }],
  ptOnly: [{ option: PT_OPT, days: [day(9, 29, []), day(10, 1, ["09:00", "10:00"])] }],
};

const free = (f: FirstFree | null) =>
  f && [f.eventTypeId, f.name, toIsoDate(new Date(f.iso)), f.time];

describe("firstFreeSlot", () => {
  it("il più presto fra le voci; a pari orario la prima; il primo giorno con orari", () => {
    expect(free(firstFreeSlot(FREE.earliestSecond))).toEqual([
      "bia",
      "Misurazione BIA",
      "2026-09-30",
      "15:00",
    ]);
    expect(free(firstFreeSlot(FREE.tie))).toEqual([
      "pt",
      "Personal Training",
      "2026-10-01",
      "09:00",
    ]);
    expect(firstFreeSlot(FREE.none)).toBeNull();
    expect(free(firstFreeSlot(FREE.noType))).toEqual([null, "Sessione PT", "2026-10-02", "18:00"]);
    expect(free(firstFreeSlot(FREE.ptOnly))).toEqual([
      "pt",
      "Personal Training",
      "2026-10-01",
      "09:00",
    ]);
  });
});

const opt = (state: BookOption["state"], count = 1) => ({ state, count });

describe("noNextCard", () => {
  it("il primo orario libero, anche senza tipologia", () => {
    expect(
      noNextCard(
        [opt("prenotabile"), opt("coach")],
        firstFreeSlot(FREE.earliestSecond),
        false,
        NO_COACH,
      ),
    ).toEqual({
      text: "Primo orario libero: mercoledì 30 settembre alle 15:00, Misurazione BIA.",
      book: true,
      eventTypeId: "bia",
    });
    expect(noNextCard([opt("prenotabile")], firstFreeSlot(FREE.noType), false, NO_COACH)).toEqual({
      text: "Primo orario libero: venerdì 2 ottobre alle 18:00, Sessione PT.",
      book: true,
      eventTypeId: null,
    });
  });

  it("gli orari non letti, e nessun orario libero", () => {
    expect(noNextCard([opt("prenotabile")], null, true, NO_COACH)).toEqual({
      text: "Non siamo riusciti a leggere gli orari liberi: li trovi in Prenota.",
      book: true,
      eventTypeId: null,
    });
    expect(noNextCard([opt("prenotabile")], null, false, NO_COACH)).toEqual({
      text: "Nessun orario libero nei prossimi giorni: scrivi al tuo coach per trovarne uno.",
      book: false,
      eventTypeId: null,
    });
    expect(noNextCard([opt("prenotabile")], null, false, COACH).text).toBe(
      "Nessun orario libero nei prossimi giorni: scrivi a Nicolò per trovarne uno.",
    );
  });

  it("solo crediti da prenotare col coach", () => {
    expect(noNextCard([opt("coach", 1), opt("esaurita", 0)], null, false, NO_COACH)).toEqual({
      text: "Le sessioni che ti restano si prenotano con il tuo coach.",
      book: false,
      eventTypeId: null,
    });
    expect(noNextCard([opt("coach", 2)], null, false, COACH).text).toBe(
      "Le sessioni che ti restano si prenotano con Nicolò.",
    );
    expect(noNextCard([opt("coach", 1)], null, true, NO_COACH).text).toBe(
      "Le sessioni che ti restano si prenotano con il tuo coach.",
    );
  });

  it("niente crediti", () => {
    const none = "Non hai crediti da prenotare in questo momento.";
    expect(noNextCard([opt("coach", 0), opt("esaurita", 0)], null, false, NO_COACH).text).toBe(
      none,
    );
    expect(noNextCard([], null, false, NO_COACH)).toEqual({
      text: none,
      book: false,
      eventTypeId: null,
    });
  });
});

// ---------------------------------------------------------------------------
// I progressi
// ---------------------------------------------------------------------------

const m = (date: string, weight: number, muscle: number, fat: number): ProgressMeasurement => ({
  measured_on: date,
  weight_kg: weight,
  muscle_kg: muscle,
  fat_pct: fat,
});
const BIA_GIULIA = [
  m("2026-03-01", 64.2, 25.1, 27.1),
  m("2026-04-12", 63.5, 25.3, 26.8),
  m("2026-05-24", 62.8, 25.4, 26.5),
  m("2026-07-05", 62.0, 25.6, 26.3),
  m("2026-08-16", 61.6, 25.8, 26.1),
  m("2026-09-23", 61.2, 25.9, 25.9),
];
const BIA_FLAT = [m("2026-05-08", 70.04, 30, 20), m("2026-09-01", 70.0, 30, 20)];
const BIA_ELEVEN = [
  m("2026-05-11", 80, 30, 22),
  m("2026-06-11", 79.5, 30.4, 21.6),
  m("2026-07-11", 80.3, 30.2, 21.9),
];

const model = (list: readonly ProgressMeasurement[], metric: ProgressMetric) => {
  const p = progressModel(list, metric);
  return (
    p && [p.value, p.delta, p.points, `${p.last.x},${p.last.y}`, p.aria, p.firstDay, p.lastDay]
  );
};

describe("progressModel", () => {
  it("Giulia: peso, massa magra, grasso", () => {
    expect(model(BIA_GIULIA, "weight")).toEqual([
      "61,2 kg",
      "−3,0 kg dal 1 mar",
      "10.0,14.0 70.0,30.3 130.0,46.7 190.0,65.3 250.0,74.7 310.0,84.0",
      "310.0,84.0",
      "Peso: da 64,2 a 61,2 kg in 6 misurazioni",
      "dom 1 mar",
      "mer 23 set",
    ]);
    expect(model(BIA_GIULIA, "muscle")).toEqual([
      "25,9 kg",
      "+0,8 kg dal 1 mar",
      "10.0,84.0 70.0,66.5 130.0,57.8 190.0,40.2 250.0,22.7 310.0,14.0",
      "310.0,14.0",
      "Massa magra: da 25,1 a 25,9 kg in 6 misurazioni",
      "dom 1 mar",
      "mer 23 set",
    ]);
    expect(model(BIA_GIULIA, "fat")).toEqual([
      "25,9%",
      "−1,2% dal 1 mar",
      "10.0,14.0 70.0,31.5 130.0,49.0 190.0,60.7 250.0,72.3 310.0,84.0",
      "310.0,84.0",
      "Grasso: da 27,1 a 25,9% in 6 misurazioni",
      "dom 1 mar",
      "mer 23 set",
    ]);
  });

  it("con una misurazione sola, niente", () => {
    expect(progressModel(BIA_GIULIA.slice(-1), "weight")).toBeNull();
  });

  it("«flat»: la variazione arrotondata prima del segno, e i valori tutti uguali", () => {
    expect(model(BIA_FLAT, "weight")).toEqual([
      "70,0 kg",
      "0,0 kg dall'8 mag",
      "10.0,14.0 310.0,84.0",
      "310.0,84.0",
      "Peso: da 70,0 a 70,0 kg in 2 misurazioni",
      "ven 8 mag",
      "mar 1 set",
    ]);
    expect(model(BIA_FLAT, "muscle")).toEqual([
      "30,0 kg",
      "0,0 kg dall'8 mag",
      "10.0,84.0 310.0,84.0",
      "310.0,84.0",
      "Massa magra: da 30,0 a 30,0 kg in 2 misurazioni",
      "ven 8 mag",
      "mar 1 set",
    ]);
  });

  it("«eleven»: dall'11", () => {
    expect(model(BIA_ELEVEN, "weight")).toEqual([
      "80,3 kg",
      "+0,3 kg dall'11 mag",
      "10.0,40.2 160.0,84.0 310.0,14.0",
      "310.0,14.0",
      "Peso: da 80,0 a 80,3 kg in 3 misurazioni",
      "lun 11 mag",
      "sab 11 lug",
    ]);
    expect(model(BIA_ELEVEN, "muscle")).toEqual([
      "30,2 kg",
      "+0,2 kg dall'11 mag",
      "10.0,84.0 160.0,14.0 310.0,49.0",
      "310.0,49.0",
      "Massa magra: da 30,0 a 30,2 kg in 3 misurazioni",
      "lun 11 mag",
      "sab 11 lug",
    ]);
    expect(model(BIA_ELEVEN, "fat")).toEqual([
      "21,9%",
      "−0,1% dall'11 mag",
      "10.0,14.0 160.0,84.0 310.0,31.5",
      "310.0,31.5",
      "Grasso: da 22,0 a 21,9% in 3 misurazioni",
      "lun 11 mag",
      "sab 11 lug",
    ]);
  });

  it("la nota in fondo", () => {
    expect(progressNote(NO_COACH)).toBe("Misurazioni BIA registrate dal tuo coach.");
    expect(progressNote(COACH)).toBe("Misurazioni BIA registrate da Nicolò.");
  });
});

// ---------------------------------------------------------------------------
// La valutazione, le sezioni, Luca al confine, il resto
// ---------------------------------------------------------------------------

describe("homeRating su Giulia", () => {
  const bookings = forCredits(GIULIA.bookings);
  const rated = [...GIULIA.feedback, { booking_id: "g-done-5", rating: 5, note: "Bene" }];
  const pick = (r: ReturnType<typeof homeRating>) => r && [r.booking.id, r.rating, r.note];

  it("«pending»: la più recente senza valutazione", () => {
    expect(pick(homeRating(bookings, GIULIA.feedback, null, NOW))).toEqual([
      "g-done-5",
      null,
      null,
    ]);
  });

  it("«kept»: quella mostrata resta, col voto e la nota appena salvati", () => {
    expect(pick(homeRating(bookings, rated, "g-done-5", NOW))).toEqual(["g-done-5", 5, "Bene"]);
  });

  it("«keptGoneAfterRated»: senza shownId, la prossima da valutare", () => {
    expect(pick(homeRating(bookings, rated, null, NOW))).toEqual(["g-done-3", null, null]);
  });

  it("«notRead»: valutazioni non lette, niente", () => {
    expect(homeRating(bookings, undefined, null, NOW)).toBeNull();
  });

  it("«shownNotRateable»: una mostrata che non si valuta non conta", () => {
    expect(pick(homeRating(bookings, GIULIA.feedback, "g-imported", NOW))).toEqual([
      "g-done-5",
      null,
      null,
    ]);
  });
});

describe("homeSections", () => {
  it("«concludedWithNext»: il percorso concluso e la prossima, niente crediti né valutazione", () => {
    const { state } = home(DAVIDE);
    expect(homeSections({ state, hasNext: true, hasRating: true })).toEqual(["concluded", "next"]);
  });

  it("«noCreditsNoNext»: nessun credito, nessuna prossima, la valutazione", () => {
    const { state } = home(SARA);
    expect(homeSections({ state, hasNext: false, hasRating: true })).toEqual(["no-next", "rating"]);
  });
});

describe("Luca al confine («edge»)", () => {
  // Il blocco 2 finisce domani: domani dopo le 10:40 si prenota ancora.
  const blocks = lucaBlocks("2026-09-29", "2026-09-30", "2026-10-27");
  const { state } = home(LUCA, blocks);

  it("il numero è quello del blocco 2, e l'avviso c'è", () => {
    expect(optionFacts(state)).toEqual([["pt", "prenotabile", 2, false, "60 min · 2 disponibili"]]);
    const [row] = creditRows(state);
    expect([row?.avail, row?.aria]).toEqual([
      "2 disponibili",
      "Personal Training: 5 svolte, 1 prenotata, 2 disponibili su 8",
    ]);
    expect(creditsWarning(LUCA.client, state, NOW)).toBe(
      "2 crediti da prenotare entro martedì 29 settembre.",
    );
  });
});

// Le parti dell'avviso, che usa anche la voce «Crediti da usare» delle
// notifiche (passata 08): la Home e la campanella dicono lo stesso numero.
describe("creditsWarningParts e creditsWarningText", () => {
  it("le parti dell'avviso di Luca al confine, e la frase senza il punto", () => {
    const blocks = lucaBlocks("2026-09-29", "2026-09-30", "2026-10-27");
    const { state } = home(LUCA, blocks);
    const parts = creditsWarningParts(LUCA.client, state, NOW);
    expect(parts).toEqual({ blockId: "l2", left: 2, end: "2026-09-29", from: at(2026, 9, 22) });
    expect(creditsWarningText(parts!)).toBe("2 crediti da prenotare entro martedì 29 settembre");
    expect(creditsWarning(LUCA.client, state, NOW)).toBe(`${creditsWarningText(parts!)}.`);
  });

  it("senza avviso, niente parti", () => {
    expect(creditsWarningParts(LUCA.client, home(LUCA).state, NOW)).toBeNull();
    expect(creditsWarning(LUCA.client, home(LUCA).state, NOW)).toBeNull();
  });

  it("«da quando» sono 7 giorni di calendario, anche a cavallo del cambio d'ora", () => {
    // A Roma l'ora cambia il 25/10: sottraendo 7 × 24 ore alla fine del
    // blocco (il 01/11) si arriverebbe all'una di notte del 25.
    const reference = {
      id: "blocco-autunno",
      status: "active",
      start_date: "2026-10-05",
      end_date: "2026-11-01",
      sequence_order: 2,
      allocations: [],
    } as unknown as BookState["reference"];
    const options = [{ referencePool: { blockAvail: 3 } }] as unknown as BookOption[];
    const parts = creditsWarningParts(
      { path_type: "fixed" },
      { reference, options },
      at(2026, 10, 26, 10),
    );
    expect(parts?.from).toEqual(at(2026, 10, 25));
    expect(parts?.from.getHours()).toBe(0);
    expect(creditsWarningText(parts!)).toBe("3 crediti da prenotare entro domenica 1 novembre");
  });
});

describe("il resto", () => {
  it("othersLabel", () => {
    expect([othersLabel(0), othersLabel(1), othersLabel(5)]).toEqual([
      null,
      "Hai un'altra sessione prenotata",
      "Hai altre 5 sessioni prenotate",
    ]);
  });

  it("homeGreeting", () => {
    expect([homeGreeting("Giulia Bianchi"), homeGreeting("  "), homeGreeting(null)]).toEqual([
      "Ciao Giulia",
      "Ciao",
      "Ciao",
    ]);
  });

  it("installHiddenKey", () => {
    expect(installHiddenKey("u1")).toBe("nc-home-install-hidden-u1");
  });
});
