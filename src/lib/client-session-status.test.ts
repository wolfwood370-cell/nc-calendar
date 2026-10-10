import {
  CalendarCheck,
  CalendarX,
  CircleCheck,
  Clock,
  Hourglass,
  Timer,
  UserX,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  CLIENT_STATUS_TONE,
  canMove,
  freeUntilLabel,
  getClientSessionStatus,
  isFreeCancel,
  type StatusBooking,
} from "@/lib/client-session-status";
import type { BookingRow } from "@/lib/queries";

// Giovedì 1 ottobre 2026 alle 10:00, ora locale (uguale con Roma e con UTC).
const START = new Date(2026, 9, 1, 10, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const before = (ms: number) => new Date(START.getTime() - ms);
const after = (ms: number) => new Date(START.getTime() + ms);

type TestBooking = StatusBooking & Pick<BookingRow, "title">;
const booking = (over: Partial<TestBooking> = {}): TestBooking => ({
  status: "scheduled",
  scheduled_at: START.toISOString(),
  duration_min: 60,
  client_confirmed_at: null,
  title: null,
  ...over,
});

describe("getClientSessionStatus · un elenco solo di stati", () => {
  it("gli stati finali, con etichetta, riga del dettaglio e icona", () => {
    const at = before(3 * DAY);
    expect(getClientSessionStatus(booking({ status: "completed" }), at)).toEqual({
      key: "done",
      label: "Svolta",
      line: "Svolta · credito usato",
      icon: CircleCheck,
    });
    expect(getClientSessionStatus(booking({ status: "no_show" }), at)).toEqual({
      key: "noshow",
      label: "Assente",
      line: "Assente · il credito è stato scalato",
      icon: UserX,
    });
    expect(getClientSessionStatus(booking({ status: "cancelled" }), at)).toEqual({
      key: "cancelled",
      label: "Annullata",
      line: "Annullata · il credito è tornato disponibile",
      icon: CalendarX,
    });
    expect(getClientSessionStatus(booking({ status: "late_cancelled" }), at)).toEqual({
      key: "late",
      label: "Annullata tardi",
      line: "Annullata con meno di 24 ore · credito scalato",
      icon: CalendarX,
    });
  });

  it("in programma e già finita: in verifica; iniziata e non finita: in corso", () => {
    expect(getClientSessionStatus(booking(), after(60 * MIN))).toMatchObject({
      key: "verify",
      label: "In verifica",
      line: "In verifica · il coach deve ancora registrarla",
      icon: Hourglass,
    });
    expect(getClientSessionStatus(booking(), after(59 * MIN))).toMatchObject({
      key: "now",
      label: "In corso",
      icon: Timer,
    });
    expect(getClientSessionStatus(booking(), START).key).toBe("now");
    // La fine è inizio + duration_min.
    expect(getClientSessionStatus(booking({ duration_min: 90 }), after(89 * MIN)).key).toBe("now");
  });

  it("confermata, da confermare, prenotata", () => {
    expect(
      getClientSessionStatus(
        booking({ client_confirmed_at: "2026-09-29T08:00:00Z" }),
        before(3 * DAY),
      ),
    ).toMatchObject({
      key: "confirmed",
      label: "Confermata",
      line: "Presenza confermata",
      icon: CircleCheck,
    });
    expect(getClientSessionStatus(booking(), before(47 * HOUR + 59 * MIN))).toMatchObject({
      key: "toconfirm",
      label: "Da confermare",
      line: "Conferma la tua presenza",
      icon: Clock,
    });
    expect(getClientSessionStatus(booking(), before(48 * HOUR)).key).toBe("toconfirm");
    expect(getClientSessionStatus(booking(), before(48 * HOUR + MIN))).toMatchObject({
      key: "booked",
      label: "Prenotata",
      line: "Prenotata",
      icon: CalendarCheck,
    });
  });

  it("in un altro anno conta `now`, non l'orologio", () => {
    const b = booking({ scheduled_at: new Date(2031, 2, 10, 10, 0).toISOString() });
    expect(getClientSessionStatus(b, new Date(2031, 2, 10, 12, 0)).key).toBe("verify");
  });

  it("ogni stato ha fondo e testo come classi dei token", () => {
    expect(CLIENT_STATUS_TONE.done).toEqual({ bg: "bg-success-soft", fg: "text-success-text" });
    expect(CLIENT_STATUS_TONE.now).toEqual({
      bg: "bg-primary-container/10",
      fg: "text-aura-primary",
    });
    expect(CLIENT_STATUS_TONE.booked).toEqual({
      bg: "bg-primary-container/8",
      fg: "text-primary-container",
    });
    for (const tone of Object.values(CLIENT_STATUS_TONE)) {
      expect(tone.bg).toMatch(/^bg-[a-z-]+(\/\d+)?$/);
      expect(tone.fg).toMatch(/^text-[a-z-]+$/);
    }
  });
});

describe("spostare e annullare", () => {
  it("canMove: a 23:59 no, a 24:00 sì; solo se in programma", () => {
    expect(canMove(booking(), before(23 * HOUR + 59 * MIN))).toBe(false);
    expect(canMove(booking(), before(24 * HOUR))).toBe(true);
    expect(canMove(booking({ status: "cancelled" }), before(3 * DAY))).toBe(false);
  });

  it("isFreeCancel: a 24:00 no (cancel_booking fa già pagare), a 24:01 sì", () => {
    expect(isFreeCancel(booking(), before(24 * HOUR))).toBe(false);
    expect(isFreeCancel(booking(), before(24 * HOUR + MIN))).toBe(true);
  });

  it("freeUntilLabel: l'inizio meno 24 ore", () => {
    expect(freeUntilLabel(booking())).toBe("mercoledì 30 settembre alle 10:00");
  });
});
