import { describe, expect, it } from "vitest";
import {
  agendaChipLabel,
  countAgenda,
  findNextClientSession,
  formatAgendaProgress,
  formatAgendaSubtitle,
  formatRomeLongDay,
  getTodayAgenda,
  greetingFor,
  sessionMinutes,
  type AgendaBooking,
} from "@/lib/today-agenda";

// Ora dei dati di esempio dell'handoff: venerdì 25/09/2026 alle 10:40 di Roma.
const NOW = new Date("2026-09-25T10:40:00+02:00");
const COACH = "coach";

let seq = 0;
/** Sessione cliente alle `hhmm` di Roma del 25/09 (o del giorno `date`). */
function session(
  hhmm: string,
  over: Partial<AgendaBooking> & { date?: string } = {},
): AgendaBooking {
  const { date = "2026-09-25", ...rest } = over;
  seq += 1;
  return {
    id: `b${String(seq).padStart(3, "0")}`,
    client_id: `client-${seq}`,
    coach_id: COACH,
    is_personal: false,
    status: "scheduled",
    scheduled_at: new Date(`${date}T${hhmm}:00+02:00`).toISOString(),
    deleted_at: null,
    duration_min: 60,
    ...rest,
  };
}

/** La giornata del prototipo: 7 sessioni, 1 svolta, 1 da confermare, 1 in corso. */
function prototypeDay(): AgendaBooking[] {
  return [
    session("07:30", { status: "completed" }),
    session("09:00"),
    session("10:30", { duration_min: 30 }),
    session("12:30", { duration_min: 30 }),
    session("15:00", { duration_min: 45 }),
    session("18:00"),
    session("19:30"),
  ];
}

/** Sessioni che non devono entrare nella giornata. */
function distractors(): AgendaBooking[] {
  return [
    session("08:00", { status: "cancelled" }),
    session("08:30", { status: "late_cancelled" }),
    session("11:00", { is_personal: true, client_id: null }),
    session("11:30", { client_id: COACH }),
    session("13:00", { client_id: null }),
    session("14:00", { deleted_at: "2026-09-24T10:00:00Z" }),
    session("09:00", { date: "2026-09-24" }),
    session("09:00", { date: "2026-09-26" }),
    // 00:30 del 26 a Roma è ancora il 25 in UTC: non è di oggi.
    session("00:30", { date: "2026-09-26" }),
  ];
}

describe("getTodayAgenda · chi entra", () => {
  it("con 7 sessioni oggi ne mostra 7 e il sottotitolo dice 7", () => {
    const items = getTodayAgenda([...distractors(), ...prototypeDay()], NOW);
    expect(items).toHaveLength(7);
    expect(formatAgendaSubtitle(formatRomeLongDay(NOW), countAgenda(items))).toBe(
      "Venerdì 25 settembre · 7 sessioni oggi, 1 svolta, 1 da confermare",
    );
    expect(formatAgendaProgress(countAgenda(items))).toBe("1 di 7 svolte");
  });

  it("anche oltre le 5 di prima: 9 sessioni, 9 righe", () => {
    const nine = [...prototypeDay(), session("20:30"), session("21:30")];
    expect(getTodayAgenda(nine, NOW)).toHaveLength(9);
  });

  it("ordina per orario e tiene le 23:30 di Roma", () => {
    const late = session("23:30");
    const items = getTodayAgenda([late, ...prototypeDay()], NOW);
    expect(items.map((i) => i.booking.id).at(-1)).toBe(late.id);
    expect(items.map((i) => i.start)).toEqual([...items.map((i) => i.start)].sort((a, b) => a - b));
  });
});

describe("getTodayAgenda · stato della riga", () => {
  it("tutti e sei gli stati sulla giornata del prototipo", () => {
    const day = [...prototypeDay(), session("16:00", { status: "no_show" })];
    const items = getTodayAgenda(day, NOW);
    expect(items.map((i) => [new Date(i.start).toISOString().slice(11, 16), i.phase])).toEqual([
      ["05:30", "done"],
      ["07:00", "toconfirm"],
      ["08:30", "now"],
      ["10:30", "next"],
      ["13:00", "later"],
      ["14:00", "noshow"],
      ["16:00", "later"],
      ["17:30", "later"],
    ]);
    expect(items.map(agendaChipLabel)).toEqual([
      "Svolta",
      "Da confermare",
      "In corso",
      "Prossima",
      null,
      "Assente",
      null,
      null,
    ]);
  });

  it("confine fra In corso e Da confermare: la fine della sessione", () => {
    const s = session("10:00", { duration_min: 45 });
    const at = (iso: string) => getTodayAgenda([s], new Date(iso))[0]!.phase;
    expect(at("2026-09-25T10:44:59+02:00")).toBe("now");
    expect(at("2026-09-25T10:45:00+02:00")).toBe("toconfirm");
    expect(at("2026-09-25T10:00:00+02:00")).toBe("now");
    expect(at("2026-09-25T09:59:59+02:00")).toBe("next");
  });

  it("Prossima a 90 minuti dice «tra 90 min», a 91 no", () => {
    const [at90] = getTodayAgenda([session("12:10")], NOW);
    const [at91] = getTodayAgenda([session("12:11")], NOW);
    expect(agendaChipLabel(at90!)).toBe("Prossima · tra 90 min");
    expect(agendaChipLabel(at91!)).toBe("Prossima");
  });

  it("Prossima a 75 minuti: «tra 75 min»", () => {
    const [item] = getTodayAgenda([session("11:55")], NOW);
    expect(agendaChipLabel(item!)).toBe("Prossima · tra 75 min");
  });

  it("una sola Prossima, anche con due sessioni alla stessa ora", () => {
    const items = getTodayAgenda([session("12:00"), session("12:00"), session("14:00")], NOW);
    expect(items.map((i) => i.phase)).toEqual(["next", "later", "later"]);
  });

  it("una svolta in anticipo non toglie la Prossima a quella dopo", () => {
    const items = getTodayAgenda(
      [session("12:00", { status: "completed" }), session("14:00")],
      NOW,
    );
    expect(items.map((i) => i.phase)).toEqual(["done", "next"]);
  });
});

describe("durata", () => {
  it("della sessione, poi della tipologia, poi 60 minuti", () => {
    expect(sessionMinutes({ duration_min: 45 }, 30)).toBe(45);
    expect(sessionMinutes({ duration_min: null }, 30)).toBe(30);
    expect(sessionMinutes({ duration_min: null }, null)).toBe(60);
    expect(sessionMinutes({ duration_min: 0 }, undefined)).toBe(60);
  });

  it("decide la fine: 10:00 senza durata, tipologia di 30 minuti, alle 10:40 è da confermare", () => {
    const s = session("10:00", { duration_min: null });
    expect(getTodayAgenda([s], NOW, () => 30)[0]!.phase).toBe("toconfirm");
    expect(getTodayAgenda([s], NOW, () => null)[0]!.phase).toBe("now");
  });
});

describe("testi", () => {
  it("le parti a zero si omettono", () => {
    expect(formatAgendaSubtitle("Sabato 26 settembre", { total: 1, done: 0, toConfirm: 0 })).toBe(
      "Sabato 26 settembre · 1 sessione oggi",
    );
    expect(formatAgendaSubtitle("Sabato 26 settembre", { total: 3, done: 2, toConfirm: 0 })).toBe(
      "Sabato 26 settembre · 3 sessioni oggi, 2 svolte",
    );
    expect(formatAgendaSubtitle("Domenica 27 settembre", { total: 0, done: 0, toConfirm: 0 })).toBe(
      "Domenica 27 settembre · nessuna sessione oggi",
    );
    expect(formatAgendaProgress({ total: 0, done: 0, toConfirm: 0 })).toBe("");
    expect(formatAgendaProgress({ total: 1, done: 1, toConfirm: 0 })).toBe("1 di 1 svolta");
  });

  it("saluto con l'ora di Roma", () => {
    expect(greetingFor(new Date("2026-09-25T12:59:00+02:00"))).toBe("Buongiorno");
    expect(greetingFor(new Date("2026-09-25T13:00:00+02:00"))).toBe("Buon pomeriggio");
    expect(greetingFor(new Date("2026-09-25T17:59:00+02:00"))).toBe("Buon pomeriggio");
    expect(greetingFor(new Date("2026-09-25T18:00:00+02:00"))).toBe("Buonasera");
  });

  it("giorno lungo con l'ora di Roma", () => {
    expect(formatRomeLongDay(NOW)).toBe("Venerdì 25 settembre");
    // 23:30 UTC del 27 è già lunedì 28 a Roma.
    expect(formatRomeLongDay(new Date("2026-09-27T23:30:00Z"))).toBe("Lunedì 28 settembre");
  });
});

describe("findNextClientSession (giorno vuoto)", () => {
  it("la prima sessione cliente programmata dopo adesso", () => {
    const sunday = new Date("2026-09-27T10:00:00+02:00");
    const monday = session("07:30", { date: "2026-09-28" });
    const list = [
      session("09:00", { date: "2026-09-25" }),
      session("08:00", { date: "2026-09-28", status: "cancelled" }),
      session("07:00", { date: "2026-09-28", is_personal: true, client_id: null }),
      session("07:15", { date: "2026-09-28", client_id: null }),
      session("09:00", { date: "2026-09-28" }),
      monday,
    ];
    expect(findNextClientSession(list, sunday)?.id).toBe(monday.id);
    expect(findNextClientSession([], sunday)).toBeNull();
  });
});
