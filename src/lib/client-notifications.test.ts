import { describe, expect, it } from "vitest";
import {
  clientNotificationsReadKey,
  clientReminderItems,
  parseReadIds,
  unreadCount,
  type ClientReminderInput,
  type ReminderBlock,
  type ReminderBooking,
} from "@/lib/client-notifications";

// Lunedì 28 settembre 2026 alle 10:40, ora locale (uguale con Roma e con UTC).
const NOW = new Date(2026, 8, 28, 10, 40);
const MIN = 60_000;
const HOUR = 60 * MIN;
const PT = "tipologia-pt";
const BIA = "tipologia-bia";
const EVENT_TYPES = [
  { id: PT, name: "Personal Training" },
  { id: BIA, name: "Misurazione BIA" },
];

const session = (id: string, at: Date, over: Partial<ReminderBooking> = {}): ReminderBooking => ({
  id,
  status: "scheduled",
  scheduled_at: at.toISOString(),
  duration_min: 60,
  client_confirmed_at: null,
  event_type_id: PT,
  session_type: "PT Session",
  ...over,
});
const inHours = (h: number, base = NOW) => new Date(base.getTime() + h * HOUR);

// Il blocco 3 di Giulia, dal 14/09 all'11/10: 8 PT (3 prenotati) e 1 BIA già usata.
const BLOCK_3: ReminderBlock = {
  id: "blocco-3",
  status: "active",
  start_date: "2026-09-14",
  end_date: "2026-10-11",
  sequence_order: 3,
  allocations: [
    { event_type_id: PT, session_type: "PT Session", quantity_assigned: 8, quantity_booked: 3 },
    { event_type_id: BIA, session_type: "BIA", quantity_assigned: 1, quantity_booked: 1 },
  ],
};
const OTHER_BLOCKS: ReminderBlock[] = [
  {
    ...BLOCK_3,
    id: "blocco-2",
    start_date: "2026-08-17",
    end_date: "2026-09-13",
    sequence_order: 2,
  },
  {
    ...BLOCK_3,
    id: "blocco-4",
    start_date: "2026-10-12",
    end_date: "2026-11-08",
    sequence_order: 4,
  },
];

const input = (over: Partial<ClientReminderInput> = {}): ClientReminderInput => ({
  now: NOW,
  bookings: [],
  blocks: [],
  eventTypes: EVENT_TYPES,
  bia: [],
  feedback: [],
  ...over,
});

describe("clientReminderItems · le voci di oggi, fuori dalla Home", () => {
  it("le cinque voci, con id, testi, destinazioni e l'ordine di prima", () => {
    const A = session("A", inHours(30)); // martedì 29 alle 16:40, non confermata
    const C = session("C", inHours(72)); // giovedì 1 ottobre, oltre le 48 ore
    const svolta = session("S", new Date(2026, 8, 21, 10, 0), { status: "completed" });
    const items = clientReminderItems(
      input({
        bookings: [C, svolta, A],
        blocks: [...OTHER_BLOCKS, BLOCK_3],
        bia: [
          { measured_on: "2026-09-10", weight_kg: 61.2, muscle_kg: 25.3 },
          { measured_on: "2026-09-24", weight_kg: 61, muscle_kg: 25.4 },
        ],
      }),
    );
    expect(items).toEqual([
      {
        id: "confirm-A",
        kind: "confirm",
        title: "Conferma la tua presenza",
        sub: "Personal Training · martedì 29 alle 16:40",
        target: { to: "/client/bookings/$bookingId", bookingId: "A" },
      },
      {
        // 9 posti, 1 svolta e 2 prenotate nelle date del blocco.
        id: "block-open-blocco-3-6",
        kind: "block",
        title: "Sessioni da prenotare",
        sub: "Hai 6 sessioni da prenotare entro il 11 ottobre",
        target: { to: "/client/book" },
      },
      {
        id: "bia-2026-09-24",
        kind: "bia",
        title: "Nuova misurazione BIA",
        sub: "Peso 61 kg · massa 25.4 kg",
        target: null,
      },
      {
        id: `credit-${BIA}`,
        kind: "credit",
        title: "Pool Misurazione BIA esaurito",
        sub: "Acquista un Booster per prenotare ancora",
        target: { to: "/client/store" },
      },
      {
        id: "fb-S",
        kind: "feedback",
        title: "Com'è andata?",
        sub: "Lascia un feedback sulla sessione del 21 set",
        target: null,
      },
    ]);
  });

  it("la sessione fra 30 ore, non confermata, chiede la conferma", () => {
    const items = clientReminderItems(input({ bookings: [session("A", inHours(30))] }));
    expect(items.map((i) => i.id)).toEqual(["confirm-A"]);
  });

  it("una non confermata fra 72 ore, da sola (è la prossima), no: non è ancora «Da confermare»", () => {
    const items = clientReminderItems(input({ bookings: [session("C", inHours(72))] }));
    expect(items).toEqual([]);
  });

  it("una confermata fra 30 ore no", () => {
    const B = session("B", inHours(30), { client_confirmed_at: inHours(-2).toISOString() });
    expect(clientReminderItems(input({ bookings: [B] }))).toEqual([]);
  });

  it("una voce per ogni sessione da confermare, in ordine d'inizio, col nome della sua tipologia", () => {
    // Mercoledì 30 alle 9:00 e alle 10:00: 46 ore e 20 minuti, 47 ore e 20 minuti.
    const pt = session("pt", new Date(2026, 8, 30, 9, 0));
    const bia = session("bia", inHours(30), { event_type_id: BIA, session_type: "BIA" });
    const senzaTipologia = session("n", new Date(2026, 8, 30, 10, 0), { event_type_id: null });
    const items = clientReminderItems(input({ bookings: [senzaTipologia, pt, bia] }));
    expect(items.map((i) => [i.id, i.sub])).toEqual([
      ["confirm-bia", "Misurazione BIA · martedì 29 alle 16:40"],
      ["confirm-pt", "Personal Training · mercoledì 30 alle 09:00"],
      ["confirm-n", "Sessione PT · mercoledì 30 alle 10:00"],
    ]);
  });

  it("valutata o più vecchia di 14 giorni: niente valutazione", () => {
    const valutata = session("V", new Date(2026, 8, 25, 10, 0), { status: "completed" });
    const vecchia = session("O", new Date(2026, 8, 13, 10, 0), { status: "completed" });
    const items = clientReminderItems(
      input({ bookings: [valutata, vecchia], feedback: [{ booking_id: "V" }] }),
    );
    expect(items).toEqual([]);
  });

  it("nel 2031, con l'ora data e non con l'orologio", () => {
    const now = new Date(2031, 8, 29, 10, 40); // lunedì
    const blocks: ReminderBlock[] = [
      {
        ...BLOCK_3,
        id: "b-agosto",
        start_date: "2031-08-18",
        end_date: "2031-09-14",
        sequence_order: 1,
      },
      {
        ...BLOCK_3,
        id: "b-settembre",
        start_date: "2031-09-15",
        end_date: "2031-10-12",
        sequence_order: 2,
      },
    ];
    const A = session("A", inHours(30, now));
    const items = clientReminderItems(input({ now, bookings: [A], blocks }));
    expect(items.map((i) => [i.id, i.sub])).toEqual([
      ["confirm-A", "Personal Training · martedì 30 alle 16:40"],
      ["block-open-b-settembre-8", "Hai 8 sessioni da prenotare entro il 12 ottobre"],
      [`credit-${BIA}`, "Acquista un Booster per prenotare ancora"],
    ]);
  });
});

describe("lo stato «letta»", () => {
  const items = [{ id: "confirm-A" }, { id: "block-open-blocco-3-6" }];

  it("la chiave per utente è quella di prima", () => {
    expect(clientNotificationsReadKey("u1")).toBe("nc-client-notif-read-u1");
  });

  it("le non lette sono le voci il cui id non sta nell'elenco", () => {
    expect(unreadCount(items, parseReadIds('["confirm-A"]'))).toBe(1);
    expect(unreadCount(items, parseReadIds('["confirm-A","block-open-blocco-3-6"]'))).toBe(0);
    expect(unreadCount(items, parseReadIds(null))).toBe(2);
  });

  it("un JSON rotto, o di un'altra forma, conta tutte le voci come non lette", () => {
    expect(parseReadIds("[rotto")).toEqual([]);
    expect(unreadCount(items, parseReadIds("[rotto"))).toBe(2);
    expect(parseReadIds('{"confirm-A":true}')).toEqual([]);
    expect(parseReadIds('["confirm-A", 3, null]')).toEqual(["confirm-A"]);
  });
});
