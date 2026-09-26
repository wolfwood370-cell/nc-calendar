import { describe, expect, it } from "vitest";
import {
  calendarSearchOf,
  calendarState,
  filterOf,
  filterStateOf,
  filtersActive,
  parseCalendarSearch,
  periodDays,
  periodLabel,
  pickFilter,
  shiftAnchor,
  toggleType,
  withoutCreateParams,
} from "@/lib/calendar-search";

const NOW = new Date(2026, 8, 25, 10, 40);
const EVT = "0c0a0000-0000-4000-8000-0000000d0001";
const PT = "0c0a0000-0000-4000-8000-00000000e001";
const BIA = "0c0a0000-0000-4000-8000-00000000e002";
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("URL · lettura", () => {
  it("tutti i parametri validi", () => {
    expect(
      parseCalendarSearch({
        date: "2026-10-01",
        view: "day",
        filter: "assign",
        types: `${PT},${BIA}`,
        avail: "1",
        event: EVT,
        new: "sessione",
        client: EVT,
      }),
    ).toEqual({
      date: "2026-10-01",
      view: "day",
      filter: "assign",
      types: `${PT},${BIA}`,
      avail: 1,
      event: EVT,
      new: "sessione",
      client: EVT,
    });
  });

  it("i valori malformati si scartano", () => {
    expect(
      parseCalendarSearch({
        date: "2026-13-40",
        view: "month",
        filter: "assign,personal",
        types: "pt,,x",
        avail: "si",
        event: "42",
        client: "x",
      }),
    ).toEqual({
      date: undefined,
      view: undefined,
      filter: undefined,
      types: undefined,
      avail: undefined,
      event: undefined,
      new: undefined,
      client: undefined,
    });
  });

  it("predefiniti: settimana di oggi, tutti, niente tipologie", () => {
    const st = calendarState({}, NOW);
    expect([ymd(st.anchor), st.view, st.filter, st.types, st.avail, st.event]).toEqual([
      "2026-09-25",
      "week",
      "all",
      [],
      false,
      null,
    ]);
  });
});

describe("URL · scrittura", () => {
  it("andata e ritorno; i valori predefiniti non si scrivono", () => {
    const st = calendarState(
      parseCalendarSearch({
        date: "2026-10-01",
        view: "day",
        filter: "personal",
        avail: "1",
        event: EVT,
      }),
      NOW,
    );
    expect(calendarSearchOf(st)).toEqual({
      date: "2026-10-01",
      view: "day",
      filter: "personal",
      types: undefined,
      avail: 1,
      event: EVT,
    });
    expect(calendarSearchOf(calendarState({}, NOW))).toEqual({
      date: "2026-09-25",
      view: undefined,
      filter: undefined,
      types: undefined,
      avail: undefined,
      event: undefined,
    });
  });

  it("`new` e `client` si tolgono dopo aver aperto la creazione", () => {
    const s = parseCalendarSearch({ date: "2026-10-01", new: "sessione", client: EVT });
    expect(withoutCreateParams(s)).toEqual({ ...s, new: undefined, client: undefined });
  });
});

describe("URL · event apre il periodo giusto", () => {
  it("senza date, il periodo è quello della sessione (link delle notifiche senza data)", () => {
    const st = calendarState({ event: EVT }, NOW, "2026-10-07");
    expect(periodDays(st.anchor, st.view).map(ymd)).toContain("2026-10-07");
    expect(st.event).toBe(EVT);
  });

  it("con date ed event, vince date (link delle notifiche e del giorno vuoto)", () => {
    const st = calendarState({ date: "2026-09-28", event: EVT }, NOW, "2026-09-28");
    expect(periodDays(st.anchor, "week").map(ymd)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });
});

describe("periodo", () => {
  it("settimana dal lunedì, anche partendo da domenica", () => {
    expect(periodDays(new Date(2026, 8, 27), "week").map(ymd)[0]).toBe("2026-09-21");
    expect(periodDays(NOW, "day").map(ymd)).toEqual(["2026-09-25"]);
  });

  it("frecce: una settimana o un giorno", () => {
    expect(ymd(shiftAnchor(NOW, "week", 1))).toBe("2026-10-02");
    expect(ymd(shiftAnchor(NOW, "day", -1))).toBe("2026-09-24");
  });

  it("etichette", () => {
    expect(periodLabel(periodDays(NOW, "week"), "week")).toBe("21 – 27 settembre 2026");
    expect(periodLabel(periodDays(new Date(2026, 9, 1), "week"), "week")).toBe(
      "28 set – 4 ott 2026",
    );
    expect(periodLabel(periodDays(new Date(2026, 11, 30), "week"), "week")).toBe(
      "28 dic 2026 – 3 gen 2027",
    );
    expect(periodLabel(periodDays(NOW, "day"), "day")).toBe("Venerdì 25 settembre 2026");
  });
});

describe("filtri", () => {
  it("«Da assegnare» e «Personali» non stanno mai insieme", () => {
    let f = filterStateOf("all", []);
    f = pickFilter(f, "assign");
    expect([f.assign, f.personal]).toEqual([true, false]);
    f = pickFilter(f, "personal");
    expect([f.assign, f.personal]).toEqual([false, true]);
    expect(filterOf(f)).toBe("personal");
    f = pickFilter(f, "assign");
    expect([f.assign, f.personal]).toEqual([true, false]);
  });

  it("scegliere una tipologia riporta su «Tutti»", () => {
    let f = pickFilter(filterStateOf("all", []), "personal");
    f = toggleType(f, PT);
    expect(filterOf(f)).toBe("all");
    expect(f.types).toEqual([PT]);
    f = toggleType(f, BIA);
    f = toggleType(f, PT);
    expect(f.types).toEqual([BIA]);
  });

  it("«Da assegnare» toglie le tipologie; «Tutti» le tiene", () => {
    const withTypes = toggleType(filterStateOf("all", []), PT);
    expect(pickFilter(withTypes, "all").types).toEqual([PT]);
    expect(pickFilter(withTypes, "assign").types).toEqual([]);
  });

  it("filtri attivi", () => {
    expect(filtersActive(filterStateOf("all", []))).toBe(false);
    expect(filtersActive(filterStateOf("assign", []))).toBe(true);
    expect(filtersActive(filterStateOf("all", [PT]))).toBe(true);
  });
});
