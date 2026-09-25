import { describe, expect, it } from "vitest";
import {
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
