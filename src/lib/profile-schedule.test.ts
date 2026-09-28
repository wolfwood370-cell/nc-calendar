// Audit V7, passata 10: il dialog «Modifica sessione» del Profilo spostava
// data e ora senza nessun avviso. Ora ha quelli del Calendario, con le stesse
// parole e la stessa regola (sessionScheduleCheck): la sovrapposizione ferma
// il salvataggio, il fuori disponibilità avvisa soltanto. Gli orari sono
// locali, come nei dialog (localIso), quindi la prova regge in ogni fuso.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OUTSIDE_AVAILABILITY_WARNING,
  localIso,
  sessionScheduleCheck,
  type AvailabilityException,
  type AvailabilitySlot,
} from "@/lib/calendar-time";
import { profileScheduleCheck } from "@/lib/profile-session";

// Lunedì 28/09/2026: disponibilità 9-13; giovedì 1/10 chiuso per un'eccezione.
const SLOTS: AvailabilitySlot[] = [
  { day_of_week: 1, start_time: "09:00", end_time: "13:00" },
  { day_of_week: 4, start_time: "09:00", end_time: "13:00" },
];
const EXCEPTIONS: AvailabilityException[] = [
  { date: "2026-10-01", start_time: null, end_time: null },
];

const booking = (id: string, date: string, time: string, client_id: string | null) => ({
  id,
  status: "scheduled",
  deleted_at: null,
  scheduled_at: localIso(date, time),
  duration_min: 60,
  client_id,
  coach_id: "coach",
  title: client_id ? null : "Dentista",
});

// La sessione del Profilo (lunedì alle 9) e, alle 11, quella di un altro cliente.
const BOOKINGS = [
  booking("me", "2026-09-28", "09:00", "c1"),
  booking("other", "2026-09-28", "11:00", "c2"),
];
const NAMES: Record<string, string> = { c1: "Giulia Bianchi", c2: "Marco Rossi" };

function check(date: string, time: string, timeEditable = true) {
  return profileScheduleCheck({
    timeEditable,
    startIso: localIso(date, time),
    minutes: 60,
    bufferMin: 0,
    sessionId: "me",
    bookings: BOOKINGS,
    slots: SLOTS,
    exceptions: EXCEPTIONS,
    clientName: (id) => NAMES[id],
  });
}

describe("V7 · gli avvisi del dialog del Profilo", () => {
  it("dentro la disponibilità e senza sovrapposizioni: niente", () => {
    expect(check("2026-09-28", "09:00")).toEqual({ overlap: null, warning: null });
  });

  it("fuori dalla disponibilità: l'avviso, e il salvataggio resta possibile", () => {
    const r = check("2026-09-28", "18:00");
    expect(r.warning).toBe(OUTSIDE_AVAILABILITY_WARNING);
    expect(r.overlap).toBeNull();
  });

  it("un giorno chiuso da un'eccezione è fuori disponibilità", () => {
    expect(check("2026-10-01", "10:00").warning).toBe(OUTSIDE_AVAILABILITY_WARNING);
  });

  it("sovrapposta a un'altra sessione: l'avviso col nome, e il salvataggio si ferma", () => {
    const r = check("2026-09-28", "10:30");
    expect(r.overlap?.id).toBe("other");
    expect(r.warning).toBe(
      "Si sovrappone a Marco Rossi (11:00–12:00). Due eventi programmati non possono sovrapporsi: scegli un altro orario.",
    );
  });

  it("una sessione che non si può spostare non ha avvisi", () => {
    expect(check("2026-09-28", "18:00", false)).toEqual({ overlap: null, warning: null });
  });

  it("le stesse parole del Calendario per una sessione cliente", () => {
    for (const [date, time] of [
      ["2026-09-28", "18:00"],
      ["2026-09-28", "10:30"],
      ["2026-10-01", "10:00"],
    ] as const) {
      const calendar = sessionScheduleCheck({
        start: new Date(localIso(date, time)),
        minutes: 60,
        bufferMin: 0,
        excludeId: "me",
        bookings: BOOKINGS,
        checkAvailability: true,
        slots: SLOTS,
        exceptions: EXCEPTIONS,
        clientName: (id) => NAMES[id],
      });
      expect(check(date, time).warning).toBe(calendar.warning);
    }
  });
});

describe("V7 · i due dialog usano la regola condivisa", () => {
  it("il Profilo mostra l'avviso e ferma il salvataggio sulla sovrapposizione", () => {
    const src = readFileSync("src/components/profile-session-dialog.tsx", "utf8");
    expect(src).toMatch(/const schedule = profileScheduleCheck\(/);
    expect(src).toMatch(/<ScheduleWarning text=\{schedule\.warning\} \/>/);
    expect(src).toMatch(/!!schedule\.overlap/);
  });
  it("il Calendario usa sessionScheduleCheck e lo stesso riquadro", () => {
    const src = readFileSync("src/components/session-form-dialog.tsx", "utf8");
    expect(src).toMatch(/sessionScheduleCheck\(\{/);
    expect(src).toMatch(/<ScheduleWarning text=\{warning\} \/>/);
  });
});
