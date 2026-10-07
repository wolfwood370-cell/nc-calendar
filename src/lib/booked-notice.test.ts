// La sessione prenotata dal cliente (passata 12 del lato cliente, nf-022 e
// nf-023): la push apre la sessione e la campanella ha la stessa voce.
// Mercoledì 14 ottobre 2026 alle 10:40, ora locale: le stesse attese a Roma, in
// UTC e a Los Angeles, perché le date dei casi sono costruite in ora locale
// (salvo il confine dei trigger della 08, che è un istante e si scrive in UTC).

import { describe, expect, it } from "vitest";
import type { BookCoach } from "@/lib/client-book";
import {
  clientNotificationList,
  clientReminders,
  coachCreatedBookingIds,
  nextReadIds,
  type ClientReminderInput,
  type ReminderBooking,
} from "@/lib/client-notifications";
import { bookedNotice, clientBookingPath } from "@/lib/notifications";

const NOW = new Date(2026, 9, 14, 10, 40);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const PT = "tipologia-pt";
const EVENT_TYPES = [{ id: PT, name: "Personal Training" }];
const NICOLO: BookCoach = { name: "Nicolò Castello", firstName: "Nicolò", whatsapp: null };
const THU_1110 = new Date(2026, 9, 15, 11, 10);
/** Entro 48 ore il server la scrive già confermata (enforce_client_booking_rules, O3). */
const CONFIRMED = { client_confirmed_at: NOW.toISOString() };

const booking = (
  id: string,
  start: Date,
  created: Date | null,
  over: Partial<ReminderBooking> = {},
): ReminderBooking => ({
  id,
  status: "scheduled",
  scheduled_at: start.toISOString(),
  duration_min: 60,
  client_confirmed_at: null,
  title: null,
  event_type_id: PT,
  session_type: "PT Session",
  category: "client_session",
  created_at: created ? created.toISOString() : (null as unknown as string),
  ...over,
});

const input = (over: Partial<ClientReminderInput> = {}): ClientReminderInput => ({
  clientId: "giulia",
  bookings: [],
  eventTypes: EVENT_TYPES,
  feedback: [],
  book: null,
  pathStartDate: null,
  bia: [],
  coach: NICOLO,
  coachCreated: new Set(),
  ...over,
});

const booked = (i: ClientReminderInput) =>
  clientReminders(i, NOW).filter((r) => r.kind === "booked");

describe("bookedNotice · la voce della push e della campanella", () => {
  it("titolo, testo in ora locale e il dettaglio della sessione", () => {
    expect(bookedNotice({ bookingId: "b-1", label: "Personal Training", start: THU_1110 })).toEqual(
      {
        title: "Sessione prenotata",
        body: "Personal Training · gio 15 ott alle 11:10",
        url: "/client/bookings/b-1",
      },
    );
  });

  it("senza nome della tipologia: «Sessione»", () => {
    expect(bookedNotice({ bookingId: "b-1", label: "  ", start: THU_1110 }).body).toBe(
      "Sessione · gio 15 ott alle 11:10",
    );
  });

  it("l'indirizzo è quello della route del dettaglio, con l'id codificato", () => {
    expect(clientBookingPath("6f1c0a5e-0000-4000-8000-000000000001")).toBe(
      "/client/bookings/6f1c0a5e-0000-4000-8000-000000000001",
    );
    expect(clientBookingPath("a/b c")).toBe("/client/bookings/a%2Fb%20c");
  });
});

describe("coachCreatedBookingIds · le sessioni che il coach racconta già", () => {
  it("solo booking.created_by_coach, con un booking_id stringa", () => {
    const ids = coachCreatedBookingIds([
      { type: "booking.created_by_coach", payload: { booking_id: "c-1" } },
      { type: "booking.moved_by_coach", payload: { booking_id: "c-2" } },
      { type: "booking.created_by_coach", payload: { booking_id: 7 } },
      { type: "booking.created_by_coach", payload: {} },
      { type: "credits.added", payload: { booking_id: "c-3" } },
    ] as never);
    expect([...ids]).toEqual(["c-1"]);
  });
});

describe("clientReminders · la sessione prenotata", () => {
  it("una voce per la sessione prenotata da poco, col testo della push, il momento della creazione e il dettaglio", () => {
    const created = new Date(NOW.getTime() - 25 * MIN);
    const items = booked(input({ bookings: [booking("b-1", THU_1110, created)] }));
    expect(items).toEqual([
      {
        id: "booked-b-1",
        kind: "booked",
        title: "Sessione prenotata",
        body: "Personal Training · gio 15 ott alle 11:10",
        at: created,
        target: { to: "/client/bookings/$bookingId", bookingId: "b-1" },
      },
    ]);
  });

  it("finché le righe del coach non sono arrivate (null), nessuna voce", () => {
    const b = booking("b-1", THU_1110, new Date(NOW.getTime() - HOUR));
    expect(booked(input({ bookings: [b], coachCreated: null }))).toEqual([]);
  });

  it("una sessione che una riga del coach racconta già non ha la voce", () => {
    const b = booking("b-1", THU_1110, new Date(NOW.getTime() - HOUR));
    expect(booked(input({ bookings: [b], coachCreated: new Set(["b-1"]) }))).toEqual([]);
  });

  it("annullata, già iniziata o creata 7 giorni fa: niente voce; creata 6 giorni e 23 ore fa sì", () => {
    const old = new Date(NOW.getTime() - 7 * DAY);
    const almost = new Date(NOW.getTime() - 7 * DAY + HOUR);
    const items = booked(
      input({
        bookings: [
          booking("annullata", THU_1110, NOW, { status: "cancelled" }),
          booking("tardi", THU_1110, NOW, { status: "late_cancelled" }),
          booking("iniziata", new Date(NOW.getTime() - 10 * MIN), new Date(NOW.getTime() - DAY)),
          booking("vecchia", THU_1110, old),
          booking("senza-data", THU_1110, null),
          booking("recente", THU_1110, almost),
        ],
      }),
    );
    expect(items.map((i) => i.id)).toEqual(["booked-recente"]);
  });

  it("importata da Google (col titolo dell'evento, senza la riga del coach): niente voce", () => {
    const b = booking("imp-1", THU_1110, new Date(NOW.getTime() - HOUR), {
      title: "Allenamento Giulia",
    });
    expect(booked(input({ bookings: [b] }))).toEqual([]);
  });

  it("creata prima dei trigger della 08 (05/10/2026, 12:52 di Roma): niente voce; da quel minuto sì", () => {
    const early = new Date(2026, 9, 8, 10, 40);
    const start = new Date(2026, 9, 9, 18, 0);
    const items = clientReminders(
      input({
        bookings: [
          booking("prima", start, new Date(Date.UTC(2026, 9, 5, 10, 51)), CONFIRMED),
          booking("dopo", start, new Date(Date.UTC(2026, 9, 5, 10, 52)), CONFIRMED),
        ],
      }),
      early,
    ).filter((r) => r.kind === "booked");
    expect(items.map((i) => i.id)).toEqual(["booked-dopo"]);
  });

  it("creata con l'orologio del server pochi secondi avanti: la voce c'è, «adesso»", () => {
    const ahead = new Date(NOW.getTime() + 20_000);
    const reminders = clientReminders(
      input({ bookings: [booking("b-1", THU_1110, ahead, CONFIRMED)] }),
      NOW,
    );
    const list = clientNotificationList(
      { reminders, rows: [], readIds: [], coach: NICOLO, bookingIds: new Set(["b-1"]) },
      NOW,
    );
    expect(list.map((i) => [i.id, i.ago, i.unread])).toEqual([["booked-b-1", "adesso", true]]);
  });
});

describe("clientNotificationList · la sessione prenotata nella campanella", () => {
  it("non letta, in cima per data, porta al dettaglio; letta col tocco", () => {
    const reminders = clientReminders(
      input({
        bookings: [booking("b-1", THU_1110, new Date(NOW.getTime() - 5 * MIN), CONFIRMED)],
      }),
      NOW,
    );
    const rows = [
      {
        id: "r-1",
        type: "credits.added",
        payload: { quantity: 1, session_label: "Sessione PT", coach_name: "Nicolò Castello" },
        read_at: null,
        created_at: new Date(NOW.getTime() - DAY).toISOString(),
      },
    ];
    const list = clientNotificationList(
      { reminders, rows, readIds: [], coach: NICOLO, bookingIds: new Set(["b-1"]) },
      NOW,
    );
    expect(list.map((i) => [i.id, i.title, i.ago, i.unread, i.target])).toEqual([
      [
        "booked-b-1",
        "Sessione prenotata",
        "5 min fa",
        true,
        { to: "/client/bookings/$bookingId", bookingId: "b-1" },
      ],
      ["row-r-1", "Crediti aggiunti", "ieri", true, { to: "/client" }],
    ]);
    expect(list[0]?.aria).toBe(
      "Non letta. Sessione prenotata. Personal Training · gio 15 ott alle 11:10",
    );
    const read = nextReadIds([], reminders, "booked-b-1");
    const after = clientNotificationList(
      { reminders, rows, readIds: read, coach: NICOLO, bookingIds: new Set(["b-1"]) },
      NOW,
    );
    expect(after[0]?.unread).toBe(false);
  });

  it("una sessione inserita dal coach: solo la sua riga, «Nuova sessione in agenda»", () => {
    const rows = [
      {
        id: "r-2",
        type: "booking.created_by_coach",
        payload: {
          booking_id: "b-2",
          session_label: "Sessione PT",
          scheduled_at: THU_1110.toISOString(),
          coach_name: "Nicolò Castello",
          source: "insert",
        },
        read_at: null,
        created_at: new Date(NOW.getTime() - 5 * MIN).toISOString(),
      },
    ];
    const reminders = clientReminders(
      input({
        bookings: [booking("b-2", THU_1110, new Date(NOW.getTime() - 5 * MIN), CONFIRMED)],
        coachCreated: coachCreatedBookingIds(rows),
      }),
      NOW,
    );
    const list = clientNotificationList(
      { reminders, rows, readIds: [], coach: NICOLO, bookingIds: new Set(["b-2"]) },
      NOW,
    );
    expect(list.map((i) => [i.id, i.title])).toEqual([["row-r-2", "Nuova sessione in agenda"]]);
  });
});
