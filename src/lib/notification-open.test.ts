import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_OPEN,
  notificationOpenUrl,
  opensCoachCalendar,
} from "@/lib/notification-open";

describe("la notifica toccata con l'app già sulla sua pagina (passata 11)", () => {
  it("riconosce solo il messaggio del service worker", () => {
    expect(notificationOpenUrl({ type: NOTIFICATION_OPEN, url: "/trainer/calendar" })).toBe(
      "/trainer/calendar",
    );
    expect(notificationOpenUrl({ type: "altro", url: "/x" })).toBeNull();
    expect(notificationOpenUrl({ type: NOTIFICATION_OPEN })).toBeNull();
    expect(notificationOpenUrl(null)).toBeNull();
    expect(notificationOpenUrl("nc-notification-open")).toBeNull();
  });

  it("riguarda il Calendario del coach solo se l'indirizzo è il suo", () => {
    expect(opensCoachCalendar("https://app.it/trainer/calendar?date=2026-10-07&event=b1")).toBe(
      true,
    );
    expect(opensCoachCalendar("/trainer/calendar?date=2026-10-07")).toBe(true);
    expect(opensCoachCalendar("/trainer/calendar/altro")).toBe(false);
    expect(opensCoachCalendar("/client/bookings/b1")).toBe(false);
  });
});
