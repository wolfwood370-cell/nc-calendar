// ----------------------------------------------------------------------------
// Le persone della Home (passata 05), per i test delle passate dopo
// ----------------------------------------------------------------------------
// Lo usano solo i test. Lunedì 28/09/2026 alle 10:40, ora locale: le stesse
// attese a Roma, in UTC e a Los Angeles. Sono le nove persone di
// client-home.test.ts (Giulia, Marta, Elena, Davide, Luca, Sara, Giorgio,
// Paola, Nina), con le tipologie, il coach e i costruttori di sessioni,
// blocchi ed extra; client-store-seed.ts ci aggiunge gli acquisti e le
// persone della 06.
// ----------------------------------------------------------------------------

import { NO_COACH, type BookClient, type BookCoach } from "@/lib/client-book";
import type { ClientBlock, PoolEventType, PoolExtra } from "@/lib/client-credits";
import type { DetailEventType } from "@/lib/client-session-detail";
import type { CreditAllocation } from "@/lib/credits";
import type { SessionType } from "@/lib/mock-data";
import type { BookingRow } from "@/lib/queries";

/** Un istante in ora locale (il mese da 1 a 12). */
export const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min);

/** Lunedì 28/09/2026 alle 10:40. */
export const NOW = at(2026, 9, 28, 10, 40);

// ---------------------------------------------------------------------------
// Le tipologie e il coach
// ---------------------------------------------------------------------------

export type HomeType = PoolEventType & DetailEventType;

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

/** pt e call si prenotano dal cliente; test lo prenota il coach. */
export const TYPES: HomeType[] = [
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

export const SESSION_TYPE: Record<string, SessionType> = {
  pt: "PT Session",
  bia: "BIA",
  test: "Functional Test",
  call: "PT Session",
};

export const typeOf = (id: string | null): HomeType | undefined => TYPES.find((t) => t.id === id);

export const WA = "https://wa.me/393475550123";
export const MEET = "https://meet.google.com/abc-defg-hij";

/** Il coach col nome e il link WhatsApp. */
export const COACH: BookCoach = {
  name: "Nicolò Castello",
  firstName: "Nicolò",
  whatsapp: WA,
};

/** Il coach di oggi: nessun dato (get_my_coach è del 02/10/2026). */
export const NOC: BookCoach = NO_COACH;

// ---------------------------------------------------------------------------
// Sessioni, blocchi, extra, clienti
// ---------------------------------------------------------------------------

/** Una sessione: durata e margine della tipologia (60 e 0 senza). */
export const s = (
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

export const alloc = (
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

export const block = (
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

/** Un extra del coach: scade nel 2100. */
export const extra = (typeId: string, quantity: number, booked: number): PoolExtra => ({
  event_type_id: typeId,
  quantity,
  quantity_booked: booked,
  expires_at: "2100-01-01T00:00:00.000Z",
});

export const client = (path_type: string, auto_renew_blocks = false): BookClient => ({
  path_type,
  status: "active",
  pack_label: null,
  auto_renew_blocks,
});

export interface Person {
  client: BookClient;
  fullName: string | null;
  blocks: ClientBlock[];
  bookings: BookingRow[];
  extras: PoolExtra[];
}

/** Le sessioni di useClientBookingsForCredits: deleted_at vuoto, o annullate tardi. */
export const forCredits = (bookings: readonly BookingRow[]) =>
  bookings.filter((b) => !b.deleted_at || b.status === "late_cancelled");

// ---------------------------------------------------------------------------
// Le nove persone
// ---------------------------------------------------------------------------

/** Percorso fisso, blocco 3 di 6 in corso fino all'11/10. */
export const GIULIA: Person = {
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
};

/** Abbonamento col rinnovo, il blocco 4 finisce il 04/10. */
export const MARTA: Person = {
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
};

/** Cliente libera: crediti del coach senza scadenza, nessun blocco. */
export const ELENA: Person = {
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
};

/** Percorso concluso il 06/09. */
export const DAVIDE: Person = {
  client: client("fixed"),
  fullName: "Davide Ferrari",
  blocks: [
    block("d1", 1, "2026-07-13", "2026-08-09", [alloc("d1", "pt", 8, 8)], "completed"),
    block("d2", 2, "2026-08-10", "2026-09-06", [alloc("d2", "pt", 8, 7)], "completed"),
  ],
  bookings: [s("d-done", "pt", "d2", "completed", at(2026, 9, 2, 9))],
  extras: [],
};

export const lucaBlocks = (l2End: string, l3Start: string, l3End: string): ClientBlock[] => [
  block("l1", 1, "2026-08-04", "2026-08-31", [], "completed"),
  block("l2", 2, "2026-09-01", l2End, [alloc("l2", "pt", 8, 6)]),
  block("l3", 3, l3Start, l3End, [alloc("l3", "pt", 8, 0)]),
];

/** Il blocco 2 finisce oggi, e i suoi 2 crediti non si prenotano più (24 ore). */
export const LUCA: Person = {
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
};

/** Un blocco senza allocazioni, e il nome di soli spazi. */
export const SARA: Person = {
  client: client("fixed"),
  fullName: "  ",
  blocks: [block("s1", 1, "2026-09-14", "2026-10-11")],
  bookings: [],
  extras: [],
};

/** Crediti del blocco finiti, il percorso finisce col blocco il 03/10. */
export const GIORGIO: Person = {
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
};

/** Il blocco 2 finisce il 05/10: 7 giorni esatti. */
export const PAOLA: Person = {
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
};

/** Il primo blocco inizia il 05/10. */
export const NINA: Person = {
  client: client("fixed"),
  fullName: "Nina",
  blocks: [block("n1", 1, "2026-10-05", "2026-11-01", [alloc("n1", "pt", 8, 0)])],
  bookings: [],
  extras: [],
};

/** Le nove persone della 05, per nome. */
export const PERSONAS05: Record<string, Person> = {
  Giulia: GIULIA,
  Marta: MARTA,
  Elena: ELENA,
  Davide: DAVIDE,
  Luca: LUCA,
  Sara: SARA,
  Giorgio: GIORGIO,
  Paola: PAOLA,
  Nina: NINA,
};
