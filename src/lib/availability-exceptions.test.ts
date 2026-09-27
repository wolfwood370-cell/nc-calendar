import { describe, expect, it } from "vitest";
import {
  EXCEPTION_ERRORS,
  MAX_EXCEPTION_DAYS,
  addDaysIso,
  bookedInPeriod,
  clashText,
  exceptionFormError,
  exceptionInputError,
  exceptionRows,
  formClashText,
  groupDetail,
  groupExceptions,
  newExceptionInput,
  periodDates,
  periodLabel,
  removeExceptionLabel,
  upcomingGroups,
  withFrom,
  type ExceptionInput,
} from "@/lib/availability-exceptions";
import type { AvailabilityExceptionRow } from "@/lib/queries";
import type { AgendaBooking } from "@/lib/today-agenda";

// Venerdì 25/09/2026 alle 10:40, ora locale della macchina: i test valgono
// con qualsiasi fuso (le date sono stringhe, gli orari costruiti in locale).
const NOW = new Date(2026, 8, 25, 10, 40);
const TODAY = "2026-09-25";
const COACH = "coach";

function input(p: Partial<ExceptionInput>): ExceptionInput {
  return {
    from: "2026-10-08",
    to: "2026-10-08",
    allDay: true,
    start: "09:00",
    end: "13:00",
    reason: "",
    ...p,
  };
}

let seq = 0;
function row(date: string, p: Partial<AvailabilityExceptionRow> = {}): AvailabilityExceptionRow {
  seq += 1;
  return {
    id: `x${seq}`,
    coach_id: COACH,
    date,
    start_time: null,
    end_time: null,
    reason: "Ferie",
    ...p,
  };
}

describe("un periodo è una riga per giorno", () => {
  it("un giorno dà una riga", () => {
    expect(exceptionRows(COACH, input({ reason: "  Ferie " }))).toEqual([
      {
        coach_id: COACH,
        date: "2026-10-08",
        start_time: null,
        end_time: null,
        reason: "Ferie",
      },
    ]);
  });

  it("dall'8 al 10 ottobre tre righe, stessi orari e stesso motivo", () => {
    const rows = exceptionRows(
      COACH,
      input({ to: "2026-10-10", allDay: false, start: "14:00", end: "18:00", reason: "Corso" }),
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
    for (const r of rows) {
      expect(r).toMatchObject({ start_time: "14:00:00", end_time: "18:00:00", reason: "Corso" });
    }
  });

  it("dal 24 al 26 ottobre 2026 (il 25 in Italia dura 25 ore): 24, 25 e 26", () => {
    expect(periodDates("2026-10-24", "2026-10-26")).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
    ]);
    expect(
      exceptionRows(COACH, input({ from: "2026-10-24", to: "2026-10-26" })).map((r) => r.date),
    ).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
    // Anche il passaggio all'ora legale, e fine mese e fine anno.
    expect(periodDates("2027-03-27", "2027-03-29")).toEqual([
      "2027-03-27",
      "2027-03-28",
      "2027-03-29",
    ]);
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("al massimo un anno", () => {
    expect(MAX_EXCEPTION_DAYS).toBe(366);
    const year = input({ from: "2026-10-01", to: "2027-10-01" });
    expect(periodDates(year.from, year.to)).toHaveLength(366);
    expect(exceptionInputError(year)).toBeNull();
    const tooLong = input({ from: "2026-10-01", to: "2027-10-02" });
    expect(exceptionInputError(tooLong)).toBe("Un'eccezione può durare al massimo un anno.");
    expect(() => exceptionRows(COACH, tooLong)).toThrow(EXCEPTION_ERRORS.tooLong);
  });
});

describe("validazione del modulo", () => {
  it("i testi del brief e il limite", () => {
    expect(exceptionFormError(input({ from: "" }), TODAY)).toBe("Scegli le date.");
    expect(exceptionFormError(input({ to: "" }), TODAY)).toBe("Scegli le date.");
    expect(exceptionFormError(input({ to: "2026-10-07" }), TODAY)).toBe(
      "La data finale è precedente a quella iniziale.",
    );
    expect(exceptionFormError(input({ allDay: false, start: "13:00", end: "13:00" }), TODAY)).toBe(
      "L'ora di fine deve essere successiva a quella di inizio.",
    );
    // Tutto il giorno: gli orari non contano.
    expect(exceptionFormError(input({ start: "13:00", end: "09:00" }), TODAY)).toBeNull();
    expect(exceptionFormError(input({}), TODAY)).toBeNull();
  });

  it("«Dal» non prima di oggi; oggi va bene", () => {
    expect(exceptionFormError(input({ from: "2026-09-24", to: "2026-09-26" }), TODAY)).toBe(
      EXCEPTION_ERRORS.past,
    );
    expect(exceptionFormError(input({ from: TODAY, to: TODAY }), TODAY)).toBeNull();
  });

  it("date impossibili sono date mancanti", () => {
    expect(exceptionInputError(input({ from: "2026-02-30", to: "2026-03-01" }))).toBe(
      EXCEPTION_ERRORS.dates,
    );
  });

  it("valori iniziali e «Dal» che sposta «Al»", () => {
    const x = newExceptionInput(TODAY);
    expect(x).toEqual({
      from: "2026-10-02",
      to: "2026-10-02",
      allDay: true,
      start: "09:00",
      end: "13:00",
      reason: "",
    });
    expect(withFrom(x, "2026-10-05")).toMatchObject({ from: "2026-10-05", to: "2026-10-05" });
    const long = { ...x, to: "2026-10-09" };
    expect(withFrom(long, "2026-10-05")).toMatchObject({ from: "2026-10-05", to: "2026-10-09" });
  });
});

describe("periodi nella pagina", () => {
  it("giorni vicini uguali: un periodo solo", () => {
    const g = groupExceptions([row("2026-10-10"), row("2026-10-08"), row("2026-10-09")]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ from: "2026-10-08", to: "2026-10-10", allDay: true });
    expect(g[0]!.rows).toHaveLength(3);
  });

  it("un buco: due periodi", () => {
    const g = groupExceptions([row("2026-10-08"), row("2026-10-10")]);
    expect(g.map((x) => [x.from, x.to])).toEqual([
      ["2026-10-08", "2026-10-08"],
      ["2026-10-10", "2026-10-10"],
    ]);
  });

  it("motivo diverso: due periodi", () => {
    const g = groupExceptions([row("2026-10-08"), row("2026-10-09", { reason: "Corso" })]);
    expect(g).toHaveLength(2);
    expect(g.map((x) => x.reason)).toEqual(["Ferie", "Corso"]);
  });

  it("orari diversi lo stesso giorno: due periodi, in ordine di ora", () => {
    const g = groupExceptions([
      row("2026-10-08", { start_time: "14:00:00", end_time: "18:00:00" }),
      row("2026-10-08", { start_time: "09:00:00", end_time: "11:00:00" }),
    ]);
    expect(g.map((x) => x.start)).toEqual(["09:00", "14:00"]);
  });

  it("doppioni nello stesso giorno: un periodo con tutte le righe", () => {
    const a = row("2026-10-08");
    const b = row("2026-10-08");
    const c = row("2026-10-09");
    const g = groupExceptions([a, b, c]);
    expect(g).toHaveLength(1);
    expect(g[0]!.rows.map((r) => r.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it("cominciato ieri e ancora in corso: dentro; finito ieri: fuori", () => {
    const g = groupExceptions([
      row("2026-09-23", { reason: "Finito" }),
      row("2026-09-24", { reason: "Finito" }),
      row("2026-09-24", { reason: "In corso" }),
      row("2026-09-25", { reason: "In corso" }),
      row("2026-09-26", { reason: "In corso" }),
    ]);
    expect(upcomingGroups(g, TODAY).map((x) => x.reason)).toEqual(["In corso"]);
  });
});

describe("etichette", () => {
  it("un giorno, stesso mese, due mesi", () => {
    expect(periodLabel("2026-10-08", "2026-10-08", 2026)).toBe("Giovedì 8 ottobre");
    expect(periodLabel("2026-10-08", "2026-10-10", 2026)).toBe("8 – 10 ottobre");
    expect(periodLabel("2026-10-30", "2026-11-02", 2026)).toBe("30 ottobre – 2 novembre");
  });

  it("l'anno solo fuori dall'anno in corso", () => {
    expect(periodLabel("2027-01-05", "2027-01-07", 2026)).toBe("5 – 7 gennaio 2027");
    expect(periodLabel("2027-01-30", "2027-02-02", 2026)).toBe("30 gennaio – 2 febbraio 2027");
    expect(periodLabel("2026-12-30", "2027-01-02", 2026)).toBe("30 dicembre 2026 – 2 gennaio 2027");
    expect(periodLabel("2027-01-05", "2027-01-05", 2026)).toBe("Martedì 5 gennaio 2027");
  });

  it("dettaglio e cestino", () => {
    expect(groupDetail({ allDay: true, start: null, end: null, reason: "Ferie" })).toBe(
      "Tutto il giorno · Ferie",
    );
    expect(groupDetail({ allDay: false, start: "14:00", end: "18:00", reason: "Corso" })).toBe(
      "14:00–18:00 · Corso",
    );
    expect(groupDetail({ allDay: true, start: null, end: null, reason: "" })).toBe(
      "Tutto il giorno",
    );
    expect(removeExceptionLabel("8 – 10 ottobre")).toBe("Rimuovi l'eccezione: 8 – 10 ottobre");
  });
});

describe("sessioni già prenotate nel periodo", () => {
  function booking(
    id: string,
    at: Date,
    p: Partial<AgendaBooking> = {},
  ): AgendaBooking & { id: string } {
    return {
      id,
      client_id: "marta",
      coach_id: COACH,
      is_personal: false,
      status: "scheduled",
      scheduled_at: at.toISOString(),
      deleted_at: null,
      duration_min: 60,
      ...p,
    };
  }

  const list = [
    booking("gio-14", new Date(2026, 9, 8, 14, 0)),
    booking("ven-9", new Date(2026, 9, 9, 9, 0)),
    booking("ven-13", new Date(2026, 9, 9, 13, 0)),
    booking("fuori", new Date(2026, 9, 11, 10, 0)),
    booking("personale", new Date(2026, 9, 8, 10, 0), { is_personal: true }),
    booking("annullata", new Date(2026, 9, 8, 11, 0), { status: "cancelled" }),
    booking("senza-cliente", new Date(2026, 9, 8, 12, 0), { client_id: null }),
    booking("coach-cliente", new Date(2026, 9, 8, 12, 0), { client_id: COACH }),
    booking("eliminata", new Date(2026, 9, 8, 16, 0), { deleted_at: "2026-09-20T10:00:00Z" }),
  ];

  const ids = (from: string, to: string, allDay: boolean, start?: string, end?: string) =>
    bookedInPeriod(list, { from, to, allDay, start: start ?? null, end: end ?? null }, NOW).map(
      (b) => b.id,
    );

  it("tutto il giorno: le sessioni cliente del periodo, in ordine", () => {
    expect(ids("2026-10-08", "2026-10-10", true)).toEqual(["gio-14", "ven-9", "ven-13"]);
  });

  it("fascia che incrocia: dentro; fascia che tocca senza incrociare: fuori", () => {
    // 10:00-13:00: ven-9 (9-10) la tocca alle 10, ven-13 comincia alle 13: fuori.
    expect(ids("2026-10-08", "2026-10-10", false, "10:00", "13:00")).toEqual([]);
    // 09:30-13:30: ven-9 finisce alle 10 (incrocia), ven-13 comincia alle 13 (incrocia).
    expect(ids("2026-10-08", "2026-10-10", false, "09:30", "13:30")).toEqual(["ven-9", "ven-13"]);
    expect(ids("2026-10-08", "2026-10-08", false, "14:30", "18:00")).toEqual(["gio-14"]);
  });

  it("impegni personali, annullate, senza cliente, eliminate: fuori", () => {
    expect(ids("2026-10-08", "2026-10-08", true)).toEqual(["gio-14"]);
  });

  it("già cominciate: fuori", () => {
    const started = [
      booking("in-corso", new Date(2026, 8, 25, 10, 0)),
      booking("dopo", new Date(2026, 8, 25, 11, 0)),
    ];
    expect(
      bookedInPeriod(
        started,
        { from: TODAY, to: TODAY, allDay: true, start: null, end: null },
        NOW,
      ).map((b) => b.id),
    ).toEqual(["dopo"]);
  });

  it("testi dell'avviso", () => {
    expect(clashText(1)).toBe("1 sessione già prenotata in questo periodo: spostala");
    expect(clashText(3)).toBe("3 sessioni già prenotate in questo periodo: spostale");
    expect(formClashText(1)).toBe(
      "Attenzione: 1 sessione già prenotata in questo periodo. Resteranno in calendario finché non le sposti.",
    );
    expect(formClashText(2)).toBe(
      "Attenzione: 2 sessioni già prenotate in questo periodo. Resteranno in calendario finché non le sposti.",
    );
  });
});
