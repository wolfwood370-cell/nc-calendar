import { describe, expect, it } from "vitest";
import {
  describeClientNotification,
  describeNotification,
  formatAgo,
  formatUnreadBadge,
  notificationsBellLabel,
} from "@/lib/notifications";

// Date locali costruite con new Date(...), così i test non dipendono dal fuso.
const at = (month: number, day: number, h: number, m = 0) =>
  new Date(2026, month - 1, day, h, m).toISOString();
const BOOKING_ID = "3f2b8c1e-9a4d-4e2f-8b1a-2c3d4e5f6a7b";

describe("describeNotification", () => {
  it("nuova prenotazione", () => {
    expect(
      describeNotification({
        type: "booking.created",
        payload: {
          booking_id: BOOKING_ID,
          client_name: "Chiara Russo",
          session_label: "Personal Training",
          scheduled_at: at(9, 30, 18),
        },
      }),
    ).toEqual({
      kind: "created",
      title: "Nuova prenotazione",
      body: "Chiara Russo · Personal Training",
      when: "mer 30 set · 18:00",
      date: "2026-09-30",
      bookingId: BOOKING_ID,
    });
  });

  it("sessione spostata: vecchio → nuovo orario, apre il giorno nuovo", () => {
    expect(
      describeNotification({
        type: "booking.rescheduled",
        payload: {
          booking_id: BOOKING_ID,
          client_name: "Giulia Bianchi",
          session_label: "Personal Training",
          old_scheduled_at: at(9, 28, 9),
          new_scheduled_at: at(9, 29, 10),
        },
      }),
    ).toMatchObject({
      kind: "rescheduled",
      title: "Sessione spostata",
      body: "Giulia Bianchi · Personal Training",
      when: "lun 28 set 09:00 → mar 29 set 10:00",
      date: "2026-09-29",
      bookingId: BOOKING_ID,
    });
  });

  it("senza booking_id apre comunque il giorno giusto", () => {
    expect(
      describeNotification({
        type: "booking.created",
        payload: { client_name: "Sara Neri", session_label: "BIA", scheduled_at: at(10, 1, 8, 30) },
      }),
    ).toMatchObject({ date: "2026-10-01", bookingId: null });
  });

  it("payload malformato o tipo sconosciuto → riga neutra senza data", () => {
    const neutral = { kind: "other", title: "Notifica", when: null, date: null, bookingId: null };
    expect(describeNotification({ type: "booking.created", payload: {} })).toMatchObject(neutral);
    expect(
      describeNotification({
        type: "booking.created",
        payload: { client_name: "X", session_label: "PT", scheduled_at: "non è una data" },
      }),
    ).toMatchObject(neutral);
    expect(describeNotification({ type: "booking.cancelled", payload: {} })).toMatchObject(neutral);
  });
});

// L'acquisto di un Booster (passata 06): la riga «Acquisto Booster», che apre
// il profilo del cliente; ogni altro payload, o lo stesso con un altro tipo,
// resta la riga neutra di sempre.
describe("describeNotification · acquisto di un Booster", () => {
  const CLIENT_ID = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
  const PAYLOAD = {
    client_id: CLIENT_ID,
    client_name: "Giulia Bianchi",
    quantity: 3,
    session_label: "Sessione PT",
    amount: 99,
    package_type: "pack",
  };
  const NEUTRAL = {
    kind: "other",
    title: "Notifica",
    body: "",
    when: null,
    date: null,
    bookingId: null,
  };

  it("il payload giusto → «Acquisto Booster», col cliente da aprire", () => {
    expect(describeNotification({ type: "booster.purchased", payload: PAYLOAD })).toEqual({
      kind: "purchase",
      title: "Acquisto Booster",
      body: "Giulia Bianchi · +3 Sessione PT",
      when: null,
      date: null,
      bookingId: null,
      clientId: CLIENT_ID,
    });
  });

  it.each<[string, string, Record<string, unknown>]>([
    ["tipoDiverso", "booking.created", PAYLOAD],
    ["quantitaTesto", "booster.purchased", { ...PAYLOAD, quantity: "3" }],
    ["quantitaZero", "booster.purchased", { ...PAYLOAD, quantity: 0 }],
    ["quantitaMezza", "booster.purchased", { ...PAYLOAD, quantity: 1.5 }],
    ["senzaCliente", "booster.purchased", { ...PAYLOAD, client_id: undefined }],
    ["nomeNumero", "booster.purchased", { ...PAYLOAD, client_name: 42 }],
  ])("%s → riga neutra", (_name, type, payload) => {
    expect(describeNotification({ type, payload })).toEqual(NEUTRAL);
  });
});

describe("formatAgo", () => {
  const NOW = new Date(2026, 8, 25, 10, 40);
  const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

  it.each([
    [0, "adesso"],
    [25, "25 min fa"],
    [59, "59 min fa"],
    [60, "1 ora fa"],
    [3 * 60, "3 ore fa"],
    [26 * 60, "ieri"],
    [4 * 24 * 60, "4 giorni fa"],
  ])("%i minuti fa → «%s»", (m, label) => {
    expect(formatAgo(minutesAgo(m), NOW)).toBe(label);
  });
});

describe("badge e nome della campanella", () => {
  it.each([
    [1, "1"],
    [99, "99"],
    [100, "99+"],
  ])("%i non lette → «%s»", (n, label) => {
    expect(formatUnreadBadge(n)).toBe(label);
  });

  it.each([
    [0, "Notifiche"],
    [1, "Notifiche, 1 non letta"],
    [3, "Notifiche, 3 non lette"],
  ])("%i non lette → «%s»", (n, label) => {
    expect(notificationsBellLabel(n)).toBe(label);
  });
});

// Le azioni del coach per il cliente (passata 08 del lato cliente): le righe
// che scrivono i trigger del server, coi testi del brief; tutto il resto null.
describe("describeClientNotification · le azioni del coach, per il cliente", () => {
  const NICOLO = { coach_name: "Nicolò Castello" };
  const DETAIL = { to: "/client/bookings/$bookingId", bookingId: BOOKING_ID };
  const moved = (payload: Record<string, unknown> = {}) => ({
    type: "booking.moved_by_coach",
    payload: {
      ...NICOLO,
      booking_id: BOOKING_ID,
      session_label: "Personal Training",
      old_scheduled_at: at(10, 5, 9),
      scheduled_at: at(10, 5, 10),
      ...payload,
    },
  });
  const created = (payload: Record<string, unknown> = {}) => ({
    type: "booking.created_by_coach",
    payload: {
      ...NICOLO,
      booking_id: BOOKING_ID,
      session_label: "Personal Training",
      scheduled_at: at(10, 1, 10),
      ...payload,
    },
  });

  it("sessione spostata: prima il vecchio orario, poi il nuovo; apre il dettaglio", () => {
    expect(describeClientNotification(moved(), null)).toEqual({
      kind: "moved",
      title: "Nicolò ha spostato una sessione",
      body: "Personal Training · lun 5 ott 09:00 → lun 5 ott alle 10:00",
      target: DETAIL,
    });
  });

  it("sessione annullata: credito restituito o scalato", () => {
    const row = (charged: boolean) => ({
      type: "booking.cancelled_by_coach",
      payload: {
        ...NICOLO,
        booking_id: BOOKING_ID,
        session_label: "Personal Training",
        scheduled_at: at(10, 9, 7, 30),
        charged,
      },
    });
    expect(describeClientNotification(row(false), null)).toEqual({
      kind: "cancelled",
      title: "Nicolò ha annullato una sessione",
      body: "Personal Training di ven 9 ott alle 07:30 · credito restituito",
      target: DETAIL,
    });
    expect(describeClientNotification(row(true), null)?.body).toBe(
      "Personal Training di ven 9 ott alle 07:30 · credito scalato",
    );
  });

  it("sessione inserita dal coach: «Nuova sessione in agenda», apre il dettaglio", () => {
    expect(describeClientNotification(created(), null)).toEqual({
      kind: "created",
      title: "Nuova sessione in agenda",
      body: "Personal Training · gio 1 ott alle 10:00 · inserita da Nicolò",
      target: DETAIL,
    });
  });

  it("crediti aggiunti: apre la Home", () => {
    const payload = { ...NICOLO, quantity: 1, session_label: "Personal Training" };
    expect(describeClientNotification({ type: "credits.added", payload }, null)).toEqual({
      kind: "credits",
      title: "Crediti aggiunti",
      body: "+1 Personal Training da Nicolò",
      target: { to: "/client" },
    });
  });

  it("blocco, percorso e BIA non arrivano dal database: sono promemoria calcolati", () => {
    const row = (type: string, payload: Record<string, unknown>) =>
      describeClientNotification({ type, payload }, "Nicolò");
    expect(row("block.renewed", { sequence_order: 4 })).toBeNull();
    expect(row("path.created", { path_type: "fixed" })).toBeNull();
    expect(row("bia.recorded", { weight: 61.2, lean_mass: 25.3 })).toBeNull();
  });

  it("il nome è di chi ha agito (coach_name del payload), anche se il coach di adesso è un altro", () => {
    const marco = { coach_name: "  Marco   Rossi " };
    expect(describeClientNotification(created(marco), "Nicolò")?.body).toBe(
      "Personal Training · gio 1 ott alle 10:00 · inserita da Marco",
    );
    expect(describeClientNotification(moved(marco), "Nicolò")?.title).toBe(
      "Marco ha spostato una sessione",
    );
  });

  it("senza coach_name il coach di adesso; senza nessuno dei due, «il tuo coach»", () => {
    const anonymous = { coach_name: undefined };
    expect(describeClientNotification(created(anonymous), "Nicolò")?.body).toBe(
      "Personal Training · gio 1 ott alle 10:00 · inserita da Nicolò",
    );
    expect(describeClientNotification(created(anonymous), null)?.body).toBe(
      "Personal Training · gio 1 ott alle 10:00 · inserita dal tuo coach",
    );
    expect(describeClientNotification(moved({ coach_name: "   " }), null)?.title).toBe(
      "Il tuo coach ha spostato una sessione",
    );
    // Un coach di adesso vuoto vale come nessun coach.
    expect(describeClientNotification(moved(anonymous), "  ")?.title).toBe(
      "Il tuo coach ha spostato una sessione",
    );
    const credits = { type: "credits.added", payload: { quantity: 3, session_label: "BIA" } };
    expect(describeClientNotification(credits, null)?.body).toBe("+3 BIA dal tuo coach");
  });

  it("senza session_label la sessione si chiama «Sessione»", () => {
    expect(describeClientNotification(created({ session_label: "  " }), null)?.body).toBe(
      "Sessione · gio 1 ott alle 10:00 · inserita da Nicolò",
    );
  });

  it("le date di jsonb, con l'offset e i microsecondi, si leggono", () => {
    const withOffset = (iso: string) => iso.replace(".000Z", ".123456+00:00");
    const row = moved({
      old_scheduled_at: withOffset(at(10, 5, 9)),
      scheduled_at: withOffset(at(10, 5, 10)),
    });
    expect(describeClientNotification(row, null)?.body).toBe(
      "Personal Training · lun 5 ott 09:00 → lun 5 ott alle 10:00",
    );
  });

  it.each<[string, string, Record<string, unknown>]>([
    [
      "spostata senza l'orario vecchio",
      "booking.moved_by_coach",
      { booking_id: BOOKING_ID, scheduled_at: at(10, 5, 10) },
    ],
    [
      "spostata con un orario vecchio che non è una data",
      "booking.moved_by_coach",
      { booking_id: BOOKING_ID, old_scheduled_at: "ieri", scheduled_at: at(10, 5, 10) },
    ],
    [
      "annullata con charged stringa",
      "booking.cancelled_by_coach",
      { booking_id: BOOKING_ID, scheduled_at: at(10, 9, 7), charged: "true" },
    ],
    [
      "annullata senza charged",
      "booking.cancelled_by_coach",
      { booking_id: BOOKING_ID, scheduled_at: at(10, 9, 7) },
    ],
    [
      "inserita con un booking_id di soli spazi",
      "booking.created_by_coach",
      { booking_id: "  ", scheduled_at: at(10, 1, 10) },
    ],
    [
      "inserita con un booking_id numero",
      "booking.created_by_coach",
      { booking_id: 7, scheduled_at: at(10, 1, 10) },
    ],
    ["inserita senza orario", "booking.created_by_coach", { booking_id: BOOKING_ID }],
    ["crediti 0", "credits.added", { quantity: 0 }],
    ["crediti 1,5", "credits.added", { quantity: 1.5 }],
    ["crediti «2»", "credits.added", { quantity: "2" }],
    ["assenza", "booking.no_show", { booking_id: BOOKING_ID, scheduled_at: at(9, 28, 9) }],
    [
      "prenotazione, una riga del coach",
      "booking.created",
      {
        booking_id: BOOKING_ID,
        client_name: "Chiara",
        scheduled_at: at(9, 30, 18),
        session_label: "PT",
      },
    ],
    [
      "spostamento, una riga del coach",
      "booking.rescheduled",
      {
        booking_id: BOOKING_ID,
        client_name: "Chiara",
        old_scheduled_at: at(9, 28, 9),
        new_scheduled_at: at(9, 29, 10),
        session_label: "PT",
      },
    ],
    [
      "acquisto di un Booster, una riga del coach",
      "booster.purchased",
      { client_id: "c1", client_name: "Chiara", quantity: 1, session_label: "PT" },
    ],
    ["payload vuoto", "booking.moved_by_coach", {}],
  ])("%s → null", (_name, type, payload) => {
    expect(describeClientNotification({ type, payload }, "Nicolò")).toBeNull();
  });
});
