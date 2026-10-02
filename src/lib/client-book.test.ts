import { describe, expect, it } from "vitest";
import { bookingRulesText } from "@/lib/booking-rules";
import type { BlockedRange } from "@/lib/booking-slots";
import {
  NO_COACH,
  barType,
  barWhen,
  bookingErrorMessage,
  canBuyBooster,
  confirmsOnBooking,
  creditLine,
  doneText,
  getBookState,
  howToBook,
  initialOption,
  noSlotsText,
  noticeOk,
  placeLine,
  reportPoolMismatches,
  rulesBlock,
  summaryRule,
  whenLine,
  type BookClient,
  type BookCoach,
  type BookMismatch,
  type BookOption,
  type BookState,
  type BookStateInput,
} from "@/lib/client-book";
import type { ClientBlock, PoolBooking, PoolEventType, PoolExtra } from "@/lib/client-credits";
import { getClientSlotDays } from "@/lib/client-slots";
import type { CreditAllocation } from "@/lib/credits";
import type { SessionType } from "@/lib/mock-data";
import type { AvailabilityRow } from "@/lib/queries";
import { renewsAutomatically } from "@/lib/renewal";

// Date in ora locale, come client-credits.test.ts: gli stessi risultati a Roma,
// in UTC e a Los Angeles. Lunedì 28/09/2026 alle 10:40; i 14 giorni arrivano a
// lunedì 12 ottobre.
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 9, 28, 10, 40);

// ---------------------------------------------------------------------------
// I dati: le tipologie del backup e i Booster attivi
// ---------------------------------------------------------------------------

const type = (
  id: string,
  name: string,
  base: SessionType,
  over: Partial<PoolEventType> = {},
): PoolEventType => ({
  id,
  name,
  color: "#039be5",
  duration: 60,
  buffer_minutes: 10,
  base_type: base,
  location_type: "physical",
  location_address: "Via Roma 12, Bologna",
  client_bookable: true,
  unavailable_message: null,
  ...over,
});
const PT = type("pt", "Sessione PT", "PT Session");
// Il messaggio senza punto finale, come nel database.
const BIA = type("bia", "BIA (Bioimpedenziometria)", "BIA", {
  duration: 15,
  client_bookable: false,
  unavailable_message:
    "Per prenotare la BIA è necessario passare in reception per verificare la disponibilità di Michael",
});
const TEST = type("test", "Test Funzionali + Check Tecnico", "Functional Test");
const CALL = type("call", "Call di consulenza", "PT Session", {
  duration: 45,
  location_type: "online",
  location_address: null,
});
const TYPES = [PT, BIA, TEST, CALL];
const BOOSTERS = ["Sessione PT", "Sessione PT", "Test Funzionali + Check Tecnico"];
const SESSION_TYPE: Record<string, SessionType> = {
  pt: "PT Session",
  bia: "BIA",
  test: "Functional Test",
  call: "PT Session",
};

const alloc = (
  block: string,
  typeId: string,
  assigned: number,
  booked: number,
): CreditAllocation => ({
  block_id: block,
  event_type_id: typeId,
  session_type: SESSION_TYPE[typeId]!,
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

/** Una sessione del cliente, col deleted_at che cancel_booking scrive. */
const session = (
  blockId: string | null,
  typeId: string,
  status: PoolBooking["status"],
  when: Date,
  deletedAt: string | null = null,
): PoolBooking & { deleted_at: string | null } => ({
  block_id: blockId,
  event_type_id: typeId,
  session_type: SESSION_TYPE[typeId]!,
  status,
  scheduled_at: when.toISOString(),
  deleted_at: deletedAt,
});

// Un extra del coach: scade nel 2100 (a mezzanotte UTC, il 31/12/2099 a Los Angeles).
const extra = (typeId: string, quantity: number, booked: number): PoolExtra => ({
  event_type_id: typeId,
  quantity,
  quantity_booked: booked,
  expires_at: "2100-01-01T00:00:00.000Z",
});

const NICOLO: BookCoach = {
  name: "Nicolò Castello",
  firstName: "Nicolò",
  whatsapp: "https://wa.me/393475550123",
};

// ---------------------------------------------------------------------------
// Giulia: percorso fisso di sei blocchi, il 3 in corso
// ---------------------------------------------------------------------------

const GIULIA: BookClient = {
  path_type: "fixed",
  status: "active",
  pack_label: null,
  auto_renew_blocks: false,
};
const B3_ALLOC = [
  alloc("b3", "pt", 8, 5),
  alloc("b3", "bia", 1, 0),
  alloc("b3", "test", 1, 1),
  alloc("b3", "call", 1, 1),
];
const B4_ALLOC = [alloc("b4", "pt", 8, 0), alloc("b4", "test", 1, 0)];
const giuliaBlocks = (b3 = B3_ALLOC, b4 = B4_ALLOC): ClientBlock[] => [
  block("b1", 1, "2026-07-20", "2026-08-16", [], "completed"),
  block("b2", 2, "2026-08-17", "2026-09-13", [], "completed"),
  block("b3", 3, "2026-09-14", "2026-10-11", b3),
  block("b4", 4, "2026-10-12", "2026-11-08", b4),
  block("b5", 5, "2026-11-09", "2026-12-06"),
  block("b6", 6, "2026-12-07", "2027-01-03"),
];
const PT_DONE = [
  session("b3", "pt", "completed", at(2026, 9, 15, 9)),
  session("b3", "pt", "completed", at(2026, 9, 18, 9)),
];
const PT_NO_SHOW = session("b3", "pt", "no_show", at(2026, 9, 22, 9));
const PT_BOOKED = [
  session("b3", "pt", "scheduled", at(2026, 10, 1, 9)),
  session("b3", "pt", "scheduled", at(2026, 10, 2, 9)),
];
const OTHERS_DONE = [
  session("b3", "test", "completed", at(2026, 9, 21, 9)),
  session("b3", "call", "completed", at(2026, 9, 16, 9)),
];
const GIULIA_SESSIONS = [...PT_DONE, PT_NO_SHOW, ...PT_BOOKED, ...OTHERS_DONE];

const giulia = (over: Partial<BookStateInput> = {}): BookState =>
  getBookState({
    now: NOW,
    client: GIULIA,
    blocks: giuliaBlocks(),
    bookings: GIULIA_SESSIONS,
    extras: [],
    eventTypes: TYPES,
    boosterTitles: BOOSTERS,
    coach: NO_COACH,
    ...over,
  });

const option = (s: BookState, id: string): BookOption => {
  const o = s.options.find((x) => x.eventTypeId === id);
  if (!o) throw new Error(`opzione ${id} assente`);
  return o;
};
const rows = (s: BookState) => s.options.map((o) => [o.eventTypeId, o.state, o.sub]);

// Gli orari del coach (§4.2): da lunedì a sabato 9-13 e 15-20, domenica
// chiuso; occupati il 29/09 alle 10:00 e alle 18:30 (60 minuti più 10 di
// margine) e il 30/09 tutto il giorno.
const weekdays = (start: string, end: string): AvailabilityRow[] =>
  [1, 2, 3, 4, 5, 6].map((d) => ({
    id: `a${d}-${start}`,
    coach_id: "coach",
    day_of_week: d,
    start_time: start,
    end_time: end,
  }));
const AVAILABILITY = [...weekdays("09:00:00", "13:00:00"), ...weekdays("15:00:00", "20:00:00")];
const busy = (start: Date, minutes: number): BlockedRange => ({
  start: start.getTime(),
  end: start.getTime() + minutes * 60_000,
});
const BUSY = [
  busy(at(2026, 9, 29, 10), 70),
  busy(at(2026, 9, 29, 18, 30), 70),
  busy(at(2026, 9, 30, 9), 240),
  busy(at(2026, 9, 30, 15), 300),
];
const daysOf = (o: BookOption) =>
  getClientSlotDays({
    now: NOW,
    durationMin: o.durationMin,
    bufferMin: o.bufferMin,
    availability: AVAILABILITY,
    exceptions: [],
    busy: BUSY,
    windows: o.windows,
    optimization: true,
  });
/** L'orario `time` del giorno `isoDate`, con la finestra di quel giorno. */
const pick = (o: BookOption, isoDate: string, time: string) => {
  const day = daysOf(o).days.find((d) => d.isoDate === isoDate);
  const slot = day?.slots.find((s) => s.time === time);
  if (!day?.window || !slot) throw new Error(`${isoDate} ${time} non prenotabile`);
  return { slot, window: day.window };
};

const rule = (s: BookState, client: BookClient, o: BookOption, now = NOW) =>
  bookingRulesText({
    now,
    pathType: client.path_type,
    renews: renewsAutomatically(client),
    reference: rulesBlock(s.reference, s.referenceNumber),
    next: rulesBlock(s.next, s.nextNumber),
    windows: o.windows,
  });

describe("getBookState · Giulia, blocco 3 di 6", () => {
  const s = giulia();

  it("riferimento il blocco 3, dopo il 4; compra Booster; niente card, nessuna incoerenza", () => {
    expect([s.reference?.id, s.referenceNumber, s.next?.id, s.nextNumber]).toEqual([
      "b3",
      3,
      "b4",
      4,
    ]);
    expect(s.canBuy).toBe(true);
    expect(s.blocked).toBeNull();
    expect(s.mismatches).toEqual([]);
  });

  it("tutte le tipologie, nell'ordine di getClientPools, ognuna col suo motivo", () => {
    expect(rows(s)).toEqual([
      ["pt", "prenotabile", "60 min · 3 disponibili"],
      ["bia", "coach", "Si prenota con il tuo coach"],
      ["test", "prenotabile", "60 min · 1 disponibile"],
      ["call", "esaurita", "Crediti esauriti"],
    ]);
    expect(option(s, "bia").count).toBe(1);
    expect(option(s, "call").buyBooster).toBe(false);
  });

  it("la PT ha una finestra per blocco; il test, finito nel 3, solo quella del 4", () => {
    expect(option(s, "pt").windows).toEqual([
      { from: "2026-09-14", until: "2026-10-11", source: "block", blockId: "b3", blockNumber: 3 },
      { from: "2026-10-12", until: "2026-11-08", source: "block", blockId: "b4", blockNumber: 4 },
    ]);
    expect(option(s, "test").windows).toEqual([
      { from: "2026-10-12", until: "2026-11-08", source: "block", blockId: "b4", blockNumber: 4 },
    ]);
    // Il numero è il credito che userà, quello del blocco 4, non «0 disponibili».
    expect(option(s, "test").count).toBe(1);
    expect(option(s, "test").countFromNext).toBe(true);
    expect(option(s, "pt").countFromNext).toBe(false);
  });

  it("initialOption: eventType se prenotabile, altrimenti la prima prenotabile", () => {
    expect(initialOption(s.options)?.eventTypeId).toBe("pt");
    expect(initialOption(s.options, "test")?.eventTypeId).toBe("test");
    expect(initialOption(s.options, "call")?.eventTypeId).toBe("pt");
    expect(initialOption(s.options, "bia")?.eventTypeId).toBe("pt");
    expect(initialOption(s.options, null)?.eventTypeId).toBe("pt");
  });

  it("Come si prenota: la BIA col coach, col punto finale e il suo credito", () => {
    expect(howToBook(option(s, "bia"), s, NO_COACH)).toEqual({
      title: "BIA (Bioimpedenziometria)",
      text: "Per prenotare la BIA è necessario passare in reception per verificare la disponibilità di Michael. Hai 1 credito disponibile.",
      buy: false,
      whatsapp: null,
    });
  });

  it("Come si prenota: la call esaurita, senza Booster di quella tipologia", () => {
    expect(howToBook(option(s, "call"), s, NO_COACH)).toEqual({
      title: "Crediti Call di consulenza esauriti",
      text: "Hai usato tutti i crediti Call di consulenza del blocco 3. Per altre sessioni scrivi al tuo coach.",
      buy: false,
      whatsapp: null,
    });
  });

  it("col coach: il nome nei testi e il WhatsApp", () => {
    const withCoach = giulia({ coach: NICOLO });
    expect(option(withCoach, "bia").sub).toBe("Si prenota con Nicolò");
    expect(howToBook(option(withCoach, "bia"), withCoach, NICOLO).whatsapp).toBe(
      "https://wa.me/393475550123",
    );
    expect(howToBook(option(withCoach, "call"), withCoach, NICOLO).text).toBe(
      "Hai usato tutti i crediti Call di consulenza del blocco 3. Per altre sessioni scrivi a Nicolò.",
    );
  });
});

describe("i testi di Giulia", () => {
  const s = giulia();
  // Dentro i test, così un orario che manca fa cadere il suo test e non il file.
  const pt = () => option(s, "pt");
  const test = () => option(s, "test");
  const tue = () => pick(pt(), "2026-09-29", "11:10");
  const mon = () => pick(pt(), "2026-10-12", "09:00");
  const testMon = () => pick(test(), "2026-10-12", "09:00");

  it("la regola sotto la fila: f) per la PT, d) per il test", () => {
    expect(rule(s, GIULIA, pt())).toBe(
      "Si prenota da 24 ore a 14 giorni prima. Fino a domenica 11 ottobre valgono i crediti del blocco 3, da lunedì 12 ottobre quelli del blocco 4.",
    );
    expect(rule(s, GIULIA, test())).toBe(
      "Si prenota da 24 ore a 14 giorni prima. I crediti del blocco 3 per questa sessione sono finiti: da lunedì 12 ottobre valgono quelli del blocco 4.",
    );
  });

  it("la finestra del giorno: il 29/09 il blocco 3, il 12/10 il blocco 4", () => {
    expect([tue().window.blockId, mon().window.blockId, testMon().window.blockId]).toEqual([
      "b3",
      "b4",
      "b4",
    ]);
  });

  it("la barra", () => {
    expect(barType(pt())).toBe("Sessione PT · 60 min");
    expect(barWhen(tue().slot)).toBe("mar 29 set · 11:10–12:10");
  });

  it("il riepilogo: quando, dove, credito", () => {
    expect(whenLine(tue().slot)).toBe("Martedì 29 settembre, 11:10–12:10");
    expect(placeLine(pt())).toBe("Studio · Via Roma 12, Bologna");
    expect(placeLine(option(s, "call"))).toBe("Online · videochiamata Google Meet");
    expect(placeLine({ location: "physical", address: null })).toBe("Studio");
    expect(placeLine({ location: null, address: null })).toBeNull();
    expect(creditLine(pt(), tue().window, s)).toBe(
      "Userai 1 credito Sessione PT: ne resteranno 2.",
    );
    expect(creditLine(pt(), mon().window, s)).toBe(
      "Userai 1 credito Sessione PT del blocco 4: ne resteranno 7.",
    );
    expect(creditLine(test(), testMon().window, s)).toBe(
      "Userai 1 credito Test Funzionali + Check Tecnico del blocco 4: non ne resteranno altri.",
    );
  });

  it("la regola del riepilogo: «prima di», e la presenza entro 48 ore", () => {
    expect(summaryRule(tue().slot.iso, NOW)).toBe(
      "Puoi spostarla o annullarla gratis prima di lunedì 28 settembre alle 11:10. La presenza risulta già confermata.",
    );
    expect(summaryRule(mon().slot.iso, NOW)).toBe(
      "Puoi spostarla o annullarla gratis prima di domenica 11 ottobre alle 09:00. Ti chiederemo di confermare la presenza 48 ore prima.",
    );
  });

  it("l'esito, con e senza email, e col coach", () => {
    expect(doneText("Sessione PT", tue().slot.iso, NO_COACH, "giulia.b@email.it")).toBe(
      "Sessione PT, martedì 29 settembre alle 11:10. Il tuo coach la vede subito nel calendario; l'invito di Google Calendar arriva a giulia.b@email.it.",
    );
    expect(doneText("Sessione PT", tue().slot.iso, NO_COACH, null)).toBe(
      "Sessione PT, martedì 29 settembre alle 11:10. Il tuo coach la vede subito nel calendario.",
    );
    expect(doneText("Sessione PT", tue().slot.iso, NICOLO, "giulia.b@email.it")).toBe(
      "Sessione PT, martedì 29 settembre alle 11:10. Nicolò la vede subito nel calendario; l'invito di Google Calendar arriva a giulia.b@email.it.",
    );
  });

  it("il giorno senza orari", () => {
    expect(noSlotsText("Sessione PT", daysOf(pt()).until, NO_COACH)).toBe(
      "Nessun orario libero per Sessione PT fino a lunedì 12 ottobre. Il tuo coach può proporti un orario.",
    );
    expect(noSlotsText("Sessione PT", "2026-10-12", NICOLO)).toBe(
      "Nessun orario libero per Sessione PT fino a lunedì 12 ottobre. Nicolò può proporti un orario.",
    );
  });
});

describe("getBookState · Marta, abbonamento col rinnovo acceso", () => {
  const MARTA: BookClient = {
    path_type: "recurring",
    status: "active",
    pack_label: null,
    auto_renew_blocks: true,
  };
  const blocks = [
    block("m1", 1, "2026-06-15", "2026-07-12", [], "completed"),
    block("m2", 2, "2026-07-13", "2026-08-09", [], "completed"),
    block("m3", 3, "2026-08-10", "2026-09-06", [], "completed"),
    block("m4", 4, "2026-09-07", "2026-10-04", [
      alloc("m4", "pt", 8, 6),
      alloc("m4", "test", 1, 1),
    ]),
  ];
  const bookings = [
    ...[8, 11, 15, 18].map((d) => session("m4", "pt", "completed", at(2026, 9, d, 9))),
    session("m4", "pt", "scheduled", at(2026, 9, 28, 19, 30)),
    session("m4", "pt", "scheduled", at(2026, 9, 30, 9)),
    session("m4", "test", "completed", at(2026, 9, 14, 9)),
  ];
  const s = giulia({ client: MARTA, blocks, bookings });

  it("la PT con 2 crediti, il test esaurito col Booster", () => {
    expect(rows(s)).toEqual([
      ["pt", "prenotabile", "60 min · 2 disponibili"],
      ["test", "esaurita", "Crediti esauriti"],
    ]);
    expect(option(s, "test").buyBooster).toBe(true);
    expect(howToBook(option(s, "test"), s, NO_COACH)).toEqual({
      title: "Crediti Test Funzionali + Check Tecnico esauriti",
      text: "Hai usato tutti i crediti Test Funzionali + Check Tecnico del blocco 4. Puoi aggiungerne con un Booster oppure chiedere al tuo coach.",
      buy: true,
      whatsapp: null,
    });
    expect(s.mismatches).toEqual([]);
  });

  it("la regola i): il blocco finisce il 4 ottobre, il successivo lo crea il rinnovo", () => {
    expect(rule(s, MARTA, option(s, "pt"))).toBe(
      "Si prenota da 24 ore a 14 giorni prima. I crediti del blocco 4 valgono fino a domenica 4 ottobre: le date successive si aprono con il blocco successivo.",
    );
  });
});

describe("getBookState · Luca, il blocco 2 finisce oggi", () => {
  // I 2 crediti del blocco 2 non si prenotano più (24 ore): il numero è quello
  // del blocco 3, lo stesso del riepilogo.
  const lucaBlocks = (l2End: string, l3Start: string, l3End: string): ClientBlock[] => [
    block("l1", 1, "2026-08-04", "2026-08-31", [], "completed"),
    block("l2", 2, "2026-09-01", l2End, [alloc("l2", "pt", 8, 6)]),
    block("l3", 3, l3Start, l3End, [alloc("l3", "pt", 8, 0)]),
  ];
  const bookings = [
    ...[2, 7, 14, 18, 23].map((d) => session("l2", "pt", "completed", at(2026, 9, d, 9))),
    session("l2", "pt", "scheduled", at(2026, 9, 28, 17)),
  ];

  it("il numero dal blocco 3, come il riepilogo dello stesso orario", () => {
    const s = giulia({ blocks: lucaBlocks("2026-09-28", "2026-09-29", "2026-10-26"), bookings });
    const pt = option(s, "pt");
    expect([pt.state, pt.count, pt.countFromNext, pt.sub]).toEqual([
      "prenotabile",
      8,
      true,
      "60 min · 8 disponibili",
    ]);
    expect(pt.windows).toEqual([
      { from: "2026-09-01", until: "2026-09-28", source: "block", blockId: "l2", blockNumber: 2 },
      { from: "2026-09-29", until: "2026-10-26", source: "block", blockId: "l3", blockNumber: 3 },
    ]);
    expect(creditLine(pt, pt.windows[1]!, s)).toBe(
      "Userai 1 credito Sessione PT del blocco 3: ne resteranno 7.",
    );
  });

  it("al confine: il blocco 2 finisce domani, e domani dopo le 10:40 si prenota ancora", () => {
    const s = giulia({ blocks: lucaBlocks("2026-09-29", "2026-09-30", "2026-10-27"), bookings });
    const pt = option(s, "pt");
    expect([pt.state, pt.count, pt.countFromNext, pt.sub]).toEqual([
      "prenotabile",
      2,
      false,
      "60 min · 2 disponibili",
    ]);
  });
});

describe("getBookState · Davide, percorso concluso", () => {
  it("la card a), senza Booster", () => {
    const blocks = [
      block("d1", 1, "2026-03-23", "2026-04-19", [], "completed"),
      block("d2", 2, "2026-04-20", "2026-05-17", [], "completed"),
      block("d3", 3, "2026-05-18", "2026-06-14", [], "completed"),
      block("d4", 4, "2026-06-15", "2026-07-12", [], "completed"),
      block("d5", 5, "2026-07-13", "2026-08-09", [], "completed"),
      block("d6", 6, "2026-08-10", "2026-09-06", [alloc("d6", "pt", 8, 8)], "completed"),
    ];
    const s = giulia({ blocks, bookings: [] });
    expect(s.reference?.id).toBe("d6");
    expect(s.blocked).toEqual({
      kind: "concluso",
      title: "Il tuo percorso è concluso",
      text: "Per prenotare nuove sessioni serve un nuovo percorso: scrivi al tuo coach, te lo propone lui.",
      buy: false,
    });
  });
});

describe("getBookState · Elena, cliente libera", () => {
  const ELENA: BookClient = { path_type: "free", status: "active", pack_label: null };
  const s = giulia({
    client: ELENA,
    blocks: [],
    bookings: [],
    extras: [extra("pt", 5, 1), extra("call", 1, 0)],
  });

  it("i crediti extra, da oggi; niente Booster", () => {
    expect(rows(s)).toEqual([
      ["pt", "prenotabile", "60 min · 4 disponibili"],
      ["call", "prenotabile", "45 min · 1 disponibile"],
    ]);
    const w = option(s, "pt").windows;
    expect(w.map((x) => [x.from, x.source, x.blockId])).toEqual([["2026-09-28", "extra", null]]);
    expect(s.reference).toBeNull();
    expect(s.canBuy).toBe(false);
    expect(s.blocked).toBeNull();
  });

  it("la frase base e il credito", () => {
    const pt = option(s, "pt");
    expect(rule(s, ELENA, pt)).toBe("Si prenota da 24 ore a 14 giorni prima.");
    expect(creditLine(pt, pt.windows[0]!, s)).toBe(
      "Userai 1 credito Sessione PT: ne resteranno 3.",
    );
  });
});

describe("getBookState · varianti di Giulia", () => {
  const usedPt = [alloc("b3", "pt", 8, 8), alloc("b3", "bia", 1, 0)];

  it("PT esaurita ma BIA col coach con un credito: niente card, la PT col Booster", () => {
    const s = giulia({ blocks: giuliaBlocks(usedPt, []), bookings: [] });
    expect(s.blocked).toBeNull();
    expect(rows(s)).toEqual([
      ["pt", "esaurita", "Crediti esauriti"],
      ["bia", "coach", "Si prenota con il tuo coach"],
    ]);
    expect(option(s, "pt").buyBooster).toBe(true);
  });

  it("con un extra PT: prenotabile coi due blocchi pagati dall'extra", () => {
    const s = giulia({
      blocks: giuliaBlocks(usedPt, []),
      bookings: [],
      extras: [extra("pt", 2, 0)],
    });
    const pt = option(s, "pt");
    expect(pt.state).toBe("prenotabile");
    expect(pt.sub).toBe("60 min · 2 disponibili");
    expect(pt.windows).toEqual([
      { from: "2026-09-14", until: "2026-10-11", source: "extra", blockId: "b3", blockNumber: 3 },
      { from: "2026-10-12", until: "2026-11-08", source: "extra", blockId: "b4", blockNumber: 4 },
    ]);
    // La finestra extra sui giorni del blocco 4 la paga l'extra, non il blocco 4.
    const mon = pick(pt, "2026-10-12", "09:00");
    expect(creditLine(pt, mon.window, s)).toBe("Userai 1 credito Sessione PT: ne resterà 1.");
  });

  it("anche la BIA usata: la card c), col Booster", () => {
    const b3 = [alloc("b3", "pt", 8, 8), alloc("b3", "bia", 1, 1)];
    const s = giulia({ blocks: giuliaBlocks(b3, []), bookings: [] });
    expect(s.blocked).toEqual({
      kind: "crediti-usati",
      title: "Hai usato tutti i crediti",
      text: "Puoi aggiungere un Booster al blocco in corso, oppure chiedere al tuo coach di anticipare il prossimo.",
      buy: true,
    });
  });

  it("lo stesso con un PT Pack: niente Booster, né nella card né nel foglio", () => {
    const b3 = [alloc("b3", "pt", 8, 8), alloc("b3", "bia", 1, 1)];
    const s = giulia({
      client: { ...GIULIA, pack_label: "PT Pack" },
      blocks: giuliaBlocks(b3, []),
      bookings: [],
    });
    expect(s.canBuy).toBe(false);
    expect(s.blocked?.text).toBe("Per continuare scrivi al tuo coach.");
    expect(s.blocked?.buy).toBe(false);
    expect(howToBook(option(s, "pt"), s, NO_COACH).text).toBe(
      "Hai usato tutti i crediti Sessione PT del blocco 3. Per altre sessioni scrivi al tuo coach.",
    );
  });

  it("nessuna allocazione nel 3 e nel 4: la card b)", () => {
    const s = giulia({ blocks: giuliaBlocks([], []), bookings: [] });
    expect(s.options).toEqual([]);
    expect(s.blocked).toEqual({
      kind: "nessun-credito",
      title: "Nessun credito da prenotare",
      text: "Per prenotare nuove sessioni serve un nuovo percorso: scrivi al tuo coach, te lo propone lui.",
      buy: false,
    });
  });

  it("le sessioni del 3 senza l'assente: un'incoerenza sulla PT", () => {
    const s = giulia({ bookings: [...PT_DONE, ...PT_BOOKED, ...OTHERS_DONE] });
    expect(s.mismatches).toEqual([
      { key: "pt", name: "Sessione PT", counted: 4, recorded: 5, blockId: "b3" },
    ]);
  });

  it("l'assente sostituita da un'annullata tardi con deleted_at: nessuna incoerenza", () => {
    const late = session("b3", "pt", "late_cancelled", at(2026, 9, 22, 9), "2026-09-21T10:00:00Z");
    const s = giulia({ bookings: [...PT_DONE, late, ...PT_BOOKED, ...OTHERS_DONE] });
    expect(s.mismatches).toEqual([]);
    expect(option(s, "pt").sub).toBe("60 min · 3 disponibili");
  });

  it("nel 4 anche la call e la BIA: la call si prenota coi crediti del 4, la BIA resta col coach", () => {
    const b4 = [...B4_ALLOC, alloc("b4", "call", 2, 0), alloc("b4", "bia", 1, 0)];
    const s = giulia({ blocks: giuliaBlocks(B3_ALLOC, b4) });
    expect(option(s, "call").state).toBe("prenotabile");
    expect(option(s, "call").sub).toBe("45 min · 2 disponibili");
    expect(option(s, "bia").state).toBe("coach");
  });

  it("il 20/09 il blocco 4 è oltre i 14 giorni: test esaurito col Booster, PT solo nel 3", () => {
    const s = giulia({ now: at(2026, 9, 20, 10, 40) });
    expect(option(s, "test").state).toBe("esaurita");
    expect(option(s, "test").buyBooster).toBe(true);
    expect(option(s, "pt").windows.map((w) => w.blockId)).toEqual(["b3"]);
  });

  it("una tipologia che c'è solo nel blocco 4, oltre i 14 giorni, non compare", () => {
    const b4 = [...B4_ALLOC, alloc("b4", "call", 2, 0)];
    const s = giulia({
      now: at(2026, 9, 20, 10, 40),
      blocks: giuliaBlocks(
        B3_ALLOC.filter((a) => a.event_type_id !== "call"),
        b4,
      ),
    });
    expect(s.options.map((o) => o.eventTypeId)).toEqual(["pt", "bia", "test"]);
  });
});

describe("getBookState · in un altro anno conta `now`, non l'orologio", () => {
  it("nel 2031, col secondo blocco finito il 7 settembre: percorso concluso", () => {
    const blocks = [
      block("y1", 1, "2031-07-14", "2031-08-10", [alloc("y1", "pt", 8, 8)]),
      block("y2", 2, "2031-08-11", "2031-09-07", [alloc("y2", "pt", 8, 3)]),
    ];
    const s = giulia({ now: at(2031, 9, 29, 10, 40), blocks, bookings: [] });
    expect(s.reference?.id).toBe("y2");
    expect(s.blocked?.kind).toBe("concluso");
  });
});

describe("le soglie", () => {
  const plus = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

  it("preavviso: a 24:00 si prenota, a 23:59 no", () => {
    expect(noticeOk(plus(24 * 60), NOW)).toBe(true);
    expect(noticeOk(plus(24 * 60 - 1), NOW)).toBe(false);
  });

  it("presenza confermata entro 48 ore comprese", () => {
    expect(confirmsOnBooking(plus(48 * 60 - 1), NOW)).toBe(true);
    expect(confirmsOnBooking(plus(48 * 60), NOW)).toBe(true);
    expect(confirmsOnBooking(plus(48 * 60 + 1), NOW)).toBe(false);
  });
});

describe("bookingErrorMessage", () => {
  const msg = (code: string | null, message: string | null) =>
    bookingErrorMessage({ code, message }, "Sessione PT");

  it("orario occupato", () => {
    expect(
      msg("23P01", 'conflicting key value violates exclusion constraint "bookings_no_overlap"'),
    ).toBe("Questo orario non è più libero: scegline un altro.");
  });

  it("i tre messaggi dei crediti", () => {
    for (const m of [
      "Credito di blocco non disponibile per questa tipologia.",
      "Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.",
      "Credito esaurito: nessun tipo sessione specificato per la prenotazione.",
    ]) {
      expect(msg("P0001", m)).toBe("Non hai crediti disponibili per Sessione PT.");
    }
  });

  it("un P0001 che non parla di crediti, col suo messaggio", () => {
    expect(msg("P0001", "Blocco di allenamento non trovato.")).toBe(
      "Blocco di allenamento non trovato.",
    );
  });

  it("l'extra che scade prima della sessione (dal giro del server del 02/10): la sua frase, com'è", () => {
    // Il cliente ha crediti, ma non per quella data: la frase lo dice già.
    expect(
      msg("P0001", "Il credito extra non vale per questa data: scade prima della sessione."),
    ).toBe("Il credito extra non vale per questa data: scade prima della sessione.");
  });

  it("senza errore o senza messaggio", () => {
    expect(bookingErrorMessage(null, "Sessione PT")).toBe("Prenotazione non riuscita: riprova.");
    expect(msg("XX000", null)).toBe("Prenotazione non riuscita: riprova.");
  });
});

describe("canBuyBooster", () => {
  const client = (over: Partial<BookClient>): BookClient => ({ ...GIULIA, ...over });

  it("fisso sì, fisso con PT Pack no, abbonamento anche con pack_label sì", () => {
    expect(canBuyBooster(client({}), true, false)).toBe(true);
    expect(canBuyBooster(client({ pack_label: "PT Pack" }), true, false)).toBe(false);
    expect(
      canBuyBooster(client({ path_type: "recurring", pack_label: "Mensile" }), true, false),
    ).toBe(true);
  });

  it("libero, archiviato, senza blocco attivo: no", () => {
    expect(canBuyBooster(client({ path_type: "free" }), true, false)).toBe(false);
    expect(canBuyBooster(client({ status: "archived" }), true, false)).toBe(false);
    expect(canBuyBooster(client({}), false, false)).toBe(false);
  });

  it("nell'ultima settimana di un percorso che finisce: no (decisione 14)", () => {
    expect(canBuyBooster(client({}), true, true)).toBe(false);
  });

  // Il blocco deve essere in corso oggi: un blocco che deve iniziare è
  // «active» da quando esiste, e uno finito lo resta finché
  // ensure_client_block_state non lo chiude.
  const canBuyWith = (blocks: ClientBlock[], who: BookClient = GIULIA) =>
    getBookState({
      now: NOW,
      client: who,
      blocks,
      bookings: [],
      extras: [],
      eventTypes: TYPES,
      boosterTitles: BOOSTERS,
      coach: NO_COACH,
    }).canBuy;
  // Oggi è l'ultimo giorno di questo blocco.
  const z1 = block("z1", 1, "2026-09-01", "2026-09-28", [alloc("z1", "pt", 8, 6)]);

  it("con getBookState: solo un blocco che inizia fra 7 giorni, no", () => {
    expect(
      canBuyWith([block("f1", 1, "2026-10-05", "2026-11-01", [alloc("f1", "pt", 8, 0)])]),
    ).toBe(false);
  });

  it("con getBookState: l'ultimo blocco è finito ieri ed è ancora active, no", () => {
    expect(
      canBuyWith([block("y1", 1, "2026-08-31", "2026-09-27", [alloc("y1", "pt", 8, 6)])]),
    ).toBe(false);
  });

  it("con getBookState: il blocco in corso, sì", () => {
    expect(canBuyWith(giuliaBlocks())).toBe(true);
  });

  it("con getBookState: l'ultimo giorno di un percorso che finisce, no (decisione 14)", () => {
    expect(canBuyWith([z1])).toBe(false);
  });

  it("con getBookState: l'ultimo giorno col blocco dopo, sì", () => {
    expect(
      canBuyWith([z1, block("z2", 2, "2026-09-29", "2026-10-26", [alloc("z2", "pt", 8, 0)])]),
    ).toBe(true);
  });

  it("con getBookState: l'ultimo giorno di un abbonamento col rinnovo, sì", () => {
    expect(canBuyWith([z1], { ...GIULIA, path_type: "recurring", auto_renew_blocks: true })).toBe(
      true,
    );
  });
});

describe("reportPoolMismatches", () => {
  const pt: BookMismatch = {
    key: "pt",
    name: "Sessione PT",
    counted: 4,
    recorded: 5,
    blockId: "b3",
  };

  it("una volta per ogni insieme diverso, niente senza incoerenze", () => {
    const sent: string[] = [];
    const seen = new Set<string>();
    const send = (m: string) => sent.push(m);
    reportPoolMismatches([pt], send, seen);
    reportPoolMismatches([{ ...pt }], send, seen);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Sessione PT");
    reportPoolMismatches([{ ...pt, counted: 3 }], send, seen);
    expect(sent).toHaveLength(2);
    reportPoolMismatches([], send, seen);
    expect(sent).toHaveLength(2);
  });
});
