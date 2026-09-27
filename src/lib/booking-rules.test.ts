import { describe, expect, it } from "vitest";
import {
  CLIENT_BOOKING_HORIZON_DAYS,
  CLIENT_MIN_NOTICE_HOURS,
  CLIENT_RESCHEDULE_CUTOFF_HOURS,
  CLIENT_RESCHEDULE_WINDOW_DAYS,
  bookingRulesNote,
  horizonLabel,
  noticeLabel,
} from "@/lib/booking-rules";
import { RESCHEDULE_WINDOW_DAYS } from "@/lib/reschedule-slots";

describe("regole di prenotazione", () => {
  it("i numeri che Prenota applica e quelli dello spostamento", () => {
    expect(CLIENT_MIN_NOTICE_HOURS).toBe(0);
    expect(CLIENT_BOOKING_HORIZON_DAYS).toBe(90);
    expect(CLIENT_RESCHEDULE_CUTOFF_HOURS).toBe(24);
    expect(CLIENT_RESCHEDULE_WINDOW_DAYS).toBe(RESCHEDULE_WINDOW_DAYS);
  });

  it("preavviso: 0 dà «Nessuno», 1 ora al singolare", () => {
    expect(noticeLabel(0)).toBe("Nessuno");
    expect(noticeLabel(1)).toBe("1 ora");
    expect(noticeLabel(24)).toBe("24 ore");
  });

  it("anticipo: 90 dà «90 giorni in anticipo», 1 al singolare", () => {
    expect(horizonLabel(90)).toBe("90 giorni in anticipo");
    expect(horizonLabel(1)).toBe("1 giorno in anticipo");
  });

  it("la nota coi numeri veri", () => {
    expect(bookingRulesNote()).toBe(
      "Valgono per tutti i clienti, sempre entro la validità dei loro crediti, e per ora non si cambiano da qui. Una sessione già prenotata il cliente può spostarla fino a 24 ore prima, su un orario dei 14 giorni successivi.",
    );
  });
});
