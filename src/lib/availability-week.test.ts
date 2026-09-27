import { describe, expect, it } from "vitest";
import {
  DAY_ERRORS,
  TIME_OPTIONS,
  addRange,
  changedDays,
  copyDay,
  dirtyLabel,
  emptyWeek,
  estimateText,
  formatHours,
  hoursPerDay,
  previewType,
  removeRange,
  sessionsFit,
  timeOptionsWith,
  toggleDay,
  updateRange,
  weekErrors,
  weekFromRows,
  weekHours,
  weekSlots,
  weekdayTargets,
  type WeekDraft,
} from "@/lib/availability-week";
import type { AvailabilityRow, EventTypeRow } from "@/lib/queries";

/** Le righe del backup del 26/09: dal lunedì al venerdì 10-20, il sabato 10-15:30. */
function backupRows(): AvailabilityRow[] {
  const rows: AvailabilityRow[] = [1, 2, 3, 4, 5].map((d) => ({
    id: `r${d}`,
    coach_id: "coach",
    day_of_week: d,
    start_time: "10:00:00",
    end_time: "20:00:00",
  }));
  rows.push({
    id: "r6",
    coach_id: "coach",
    day_of_week: 6,
    start_time: "10:00:00",
    end_time: "15:30:00",
  });
  return rows;
}

function type(p: Partial<EventTypeRow> & Pick<EventTypeRow, "name">): EventTypeRow {
  return {
    id: p.name,
    coach_id: "coach",
    description: null,
    color: "#003e62",
    duration: 60,
    base_type: "PT Session",
    location_type: "physical",
    buffer_minutes: 10,
    location_address: null,
    client_bookable: true,
    unavailable_message: null,
    ...p,
  };
}

function withRanges(dow: 1 | 2 | 3 | 4 | 5 | 6 | 7, ...ranges: [string, string][]): WeekDraft {
  const w = emptyWeek();
  w[dow] = { active: true, ranges: ranges.map(([start, end]) => ({ start, end })) };
  return w;
}

describe("settimana dalle righe e ritorno", () => {
  it("un giorno è acceso se ha righe; orari in HH:MM e in ordine", () => {
    const w = weekFromRows([
      { day_of_week: 2, start_time: "15:00:00", end_time: "18:00:00" },
      { day_of_week: 2, start_time: "09:00:00", end_time: "12:00:00" },
    ]);
    expect(w[2]).toEqual({
      active: true,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "15:00", end: "18:00" },
      ],
    });
    expect(w[1]).toEqual({ active: false, ranges: [] });
    expect(weekSlots(w)).toEqual([
      { day_of_week: 2, start: "09:00", end: "12:00" },
      { day_of_week: 2, start: "15:00", end: "18:00" },
    ]);
  });

  it("i giorni spenti non si salvano, anche se tengono le fasce", () => {
    const w = toggleDay(withRanges(3, ["09:00", "12:00"]), 3, false);
    expect(w[3].ranges).toHaveLength(1);
    expect(weekSlots(w)).toEqual([]);
  });
});

describe("errori per giorno", () => {
  it("i tre testi del brief", () => {
    const w = emptyWeek();
    w[1] = { active: true, ranges: [] };
    w[2] = { active: true, ranges: [{ start: "12:00", end: "12:00" }] };
    w[3] = {
      active: true,
      ranges: [
        { start: "09:00", end: "12:00" },
        { start: "11:30", end: "14:00" },
      ],
    };
    expect(weekErrors(w)).toEqual({
      1: DAY_ERRORS.empty,
      2: DAY_ERRORS.order,
      3: DAY_ERRORS.overlap,
    });
    expect(DAY_ERRORS).toEqual({
      empty: "Aggiungi almeno una fascia o disattiva il giorno.",
      order: "L'ora di fine deve essere successiva a quella di inizio.",
      overlap: "Le fasce orarie si sovrappongono.",
    });
  });

  it("fasce che si toccano sono valide, anche in disordine", () => {
    expect(weekErrors(withRanges(4, ["12:00", "14:00"], ["10:00", "12:00"]))).toEqual({});
  });

  it("un giorno spento non ha errori", () => {
    const w = emptyWeek();
    w[5] = { active: false, ranges: [{ start: "18:00", end: "09:00" }] };
    expect(weekErrors(w)).toEqual({});
  });
});

describe("+ Fascia", () => {
  it("un'ora dopo la fine dell'ultima, per tre ore", () => {
    const w = addRange(withRanges(1, ["09:00", "13:00"]), 1);
    expect(w[1].ranges[1]).toEqual({ start: "14:00", end: "17:00" });
  });

  it("parte al massimo alle 21:00 e finisce al massimo alle 22:00", () => {
    expect(addRange(withRanges(1, ["17:00", "20:30"]), 1)[1].ranges[1]).toEqual({
      start: "21:00",
      end: "22:00",
    });
    expect(addRange(withRanges(1, ["15:00", "19:30"]), 1)[1].ranges[1]).toEqual({
      start: "20:30",
      end: "22:00",
    });
    expect(addRange(withRanges(1, ["15:00", "18:00"]), 1)[1].ranges[1]).toEqual({
      start: "19:00",
      end: "22:00",
    });
  });

  it("su un giorno senza fasce 09:00-12:00, e il giorno si accende", () => {
    const w = addRange(emptyWeek(), 6);
    expect(w[6]).toEqual({ active: true, ranges: [{ start: "09:00", end: "12:00" }] });
  });
});

describe("interruttore e cestino", () => {
  it("accendere un giorno vuoto dà 09:00-13:00", () => {
    expect(toggleDay(emptyWeek(), 7, true)[7]).toEqual({
      active: true,
      ranges: [{ start: "09:00", end: "13:00" }],
    });
  });

  it("riaccendere un giorno spento ritrova le sue fasce", () => {
    const off = toggleDay(withRanges(2, ["08:00", "10:00"]), 2, false);
    expect(toggleDay(off, 2, true)[2]).toEqual({
      active: true,
      ranges: [{ start: "08:00", end: "10:00" }],
    });
  });

  it("togliere l'ultima fascia spegne il giorno; togliere una di due no", () => {
    const two = withRanges(3, ["09:00", "12:00"], ["14:00", "18:00"]);
    const one = removeRange(two, 3, 0);
    expect(one[3]).toEqual({ active: true, ranges: [{ start: "14:00", end: "18:00" }] });
    expect(removeRange(one, 3, 0)[3]).toEqual({ active: false, ranges: [] });
  });

  it("cambiare un orario tocca solo quella fascia", () => {
    const w = updateRange(
      withRanges(1, ["09:00", "12:00"], ["14:00", "18:00"]),
      1,
      1,
      "end",
      "19:00",
    );
    expect(w[1].ranges).toEqual([
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "19:00" },
    ]);
  });
});

describe("Copia su…", () => {
  it("accende le destinazioni, ne sostituisce le fasce, non tocca la sorgente", () => {
    const w = emptyWeek();
    w[1] = {
      active: true,
      ranges: [
        { start: "07:00", end: "14:00" },
        { start: "15:00", end: "21:00" },
      ],
    };
    w[2] = { active: true, ranges: [{ start: "10:00", end: "11:00" }] };
    // Mercoledì spento con una fascia vecchia: va acceso e sostituito.
    w[3] = { active: false, ranges: [{ start: "18:00", end: "20:00" }] };
    const out = copyDay(w, 1, [2, 3, 7]);
    for (const d of [2, 3, 7] as const) expect(out[d]).toEqual(w[1]);
    expect(out[1]).toEqual(w[1]);
    expect(out[4]).toEqual(w[4]);
    // Copie indipendenti: cambiare la destinazione non cambia la sorgente.
    expect(out[2].ranges).not.toBe(out[1].ranges);
    expect(out[2].ranges[0]).not.toBe(out[1].ranges[0]);
  });

  it("Lun–Ven è dal lunedì al venerdì senza la sorgente", () => {
    expect(weekdayTargets(3)).toEqual([1, 2, 4, 5]);
    expect(weekdayTargets(6)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("modifiche non salvate", () => {
  const saved = weekFromRows(backupRows());

  it("conta i giorni cambiati", () => {
    expect(changedDays(saved, saved)).toEqual([]);
    let w = updateRange(saved, 1, 0, "end", "19:00");
    expect(changedDays(saved, w)).toEqual([1]);
    w = toggleDay(w, 7, true);
    w = toggleDay(w, 6, false);
    expect(changedDays(saved, w)).toEqual([1, 6, 7]);
    expect(dirtyLabel(1, false)).toBe("1 giorno modificato");
    expect(dirtyLabel(3, false)).toBe("3 giorni modificati");
    expect(dirtyLabel(3, true)).toBe("Correggi gli orari evidenziati per salvare");
  });

  it("stesse fasce in un altro ordine, o un giorno spento che tiene le fasce: nessuna modifica", () => {
    const a = withRanges(2, ["09:00", "12:00"], ["14:00", "18:00"]);
    const b = withRanges(2, ["14:00", "18:00"], ["09:00", "12:00"]);
    expect(changedDays(a, b)).toEqual([]);
    const off = toggleDay(withRanges(5, ["09:00", "12:00"]), 5, false);
    expect(changedDays(emptyWeek(), off)).toEqual([]);
  });
});

describe("opzioni degli orari", () => {
  it("dalle 06:00 alle 22:00 ogni 30 minuti", () => {
    expect(TIME_OPTIONS[0]).toBe("06:00");
    expect(TIME_OPTIONS[TIME_OPTIONS.length - 1]).toBe("22:00");
    expect(TIME_OPTIONS).toHaveLength(33);
  });

  it("un valore salvato fuori da 06:00-22:00 compare fra le opzioni, al suo posto", () => {
    const early = timeOptionsWith("05:30");
    expect(early[0]).toBe("05:30");
    expect(early).toHaveLength(34);
    const late = timeOptionsWith("22:45");
    expect(late[late.length - 1]).toBe("22:45");
    expect(timeOptionsWith("10:15")).toContain("10:15");
    expect(timeOptionsWith("10:00")).toHaveLength(33);
  });
});

describe("anteprima", () => {
  const types = [
    type({ name: "Misurazione BIA", duration: 15, buffer_minutes: 10 }),
    type({ name: "Sessione PT", duration: 60, buffer_minutes: 10 }),
  ];

  it("coi dati del backup: 55,5 ore e circa 44 sessioni di Sessione PT", () => {
    const w = weekFromRows(backupRows());
    expect(formatHours(weekHours(w))).toBe("55,5");
    const pt = previewType(types)!;
    expect(pt.name).toBe("Sessione PT");
    expect(sessionsFit(w, pt)).toBe(44);
    expect(estimateText(44, pt)).toBe(
      "Circa 44 sessioni della tipologia «Sessione PT» (60 min + 10 min di margine), prima di contare quelle già prenotate.",
    );
    expect(hoursPerDay(w).map((d) => d.hours)).toEqual([10, 10, 10, 10, 10, 5.5, 0]);
  });

  it("ore intere senza virgola; fasce sbagliate e giorni spenti non contano", () => {
    const w = withRanges(1, ["07:00", "14:00"], ["16:00", "15:00"]);
    w[2] = { active: false, ranges: [{ start: "07:00", end: "21:00" }] };
    expect(formatHours(weekHours(w))).toBe("7");
    expect(formatHours(70)).toBe("70");
  });

  it("margine 0, singolare e zero", () => {
    const bia = type({ name: "Misurazione BIA", duration: 30, buffer_minutes: 0 });
    expect(sessionsFit(withRanges(1, ["09:00", "10:00"]), bia)).toBe(2);
    expect(estimateText(2, bia)).toBe(
      "Circa 2 sessioni della tipologia «Misurazione BIA» (30 min, senza margine), prima di contare quelle già prenotate.",
    );
    const pt = type({ name: "Sessione PT" });
    expect(sessionsFit(withRanges(1, ["09:00", "10:30"]), pt)).toBe(1);
    expect(estimateText(1, pt)).toBe(
      "Circa 1 sessione della tipologia «Sessione PT» (60 min + 10 min di margine), prima di contare quelle già prenotate.",
    );
    expect(sessionsFit(withRanges(1, ["09:00", "10:00"]), pt)).toBe(0);
    expect(estimateText(0, pt)).toBe(
      "Con questi orari non entra nessuna sessione della tipologia «Sessione PT».",
    );
  });

  it("la tipologia di riserva: la prima prenotabile in ordine di nome, poi nessuna", () => {
    const others = [
      type({ name: "Test funzionale", client_bookable: true }),
      type({ name: "Consulenza", client_bookable: false }),
      type({ name: "Misurazione BIA", client_bookable: true }),
    ];
    expect(previewType(others)?.name).toBe("Misurazione BIA");
    expect(previewType([type({ name: " sessione pt ", client_bookable: false })])?.name).toBe(
      " sessione pt ",
    );
    expect(previewType([type({ name: "Consulenza", client_bookable: false })])).toBeNull();
    expect(previewType([])).toBeNull();
  });
});
