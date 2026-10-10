// Le regole di Sessioni (passata 03): le sessioni di Giulia, lunedì 28/09/2026
// alle 10:40. Date costruite con l'ora locale, come client-book.test.ts: le
// stesse attese a Roma, in UTC e a Los Angeles.

import { describe, expect, it } from "vitest";
import { NO_COACH, getBookState, type BookOption, type BookState } from "@/lib/client-book";
import type { ClientBlock, PoolBooking, PoolEventType } from "@/lib/client-credits";
import { sessionsSubtitle } from "@/lib/client-shell";
import {
  attendanceSummary,
  clientAttendance,
  isVisibleSession,
  parseSessionsTab,
  pastGroups,
  sessionRow,
  splitSessions,
  tileText,
  upcomingEmpty,
  upcomingGroups,
  upcomingTabLabel,
  type SessionBooking,
  type SessionEventType,
  type SessionGroup,
  type SessionRowModel,
} from "@/lib/client-sessions";
import type { CreditAllocation } from "@/lib/credits";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 9, 28, 10, 40);

// ---------------------------------------------------------------------------
// I dati
// ---------------------------------------------------------------------------

const TYPES: SessionEventType[] = [
  { id: "pt", name: "Sessione PT", color: "#D50000", location_type: "physical" },
  { id: "bia", name: "BIA (Bioimpedenziometria)", color: "#7986CB", location_type: "physical" },
  {
    id: "test",
    name: "Test Funzionali + Check Tecnico",
    color: "#E67C73",
    location_type: "physical",
  },
  { id: "call", name: "Call di consulenza", color: "#039BE5", location_type: "online" },
];

/** Una sessione del cliente: 60 minuti, senza titolo, non confermata, non eliminata. */
const s = (
  id: string,
  typeId: string | null,
  when: Date,
  status: SessionBooking["status"],
  over: Partial<SessionBooking> = {},
): SessionBooking => ({
  id,
  status,
  scheduled_at: when.toISOString(),
  duration_min: 60,
  client_confirmed_at: null,
  title: null,
  event_type_id: typeId,
  session_type: "PT Session",
  deleted_at: null,
  category: "client_session",
  ...over,
});

const DELETED = "2026-09-26T18:05:00.000Z";

const GIULIA: SessionBooking[] = [
  s("u1", "call", at(2026, 9, 28, 10, 15), "scheduled", { duration_min: 45 }),
  s("u2", "pt", at(2026, 9, 30, 10), "scheduled"),
  s("u3", "pt", at(2026, 9, 30, 11), "scheduled", {
    client_confirmed_at: "2026-09-28T07:00:00.000Z",
  }),
  s("u4", "pt", at(2026, 10, 2, 7, 30), "scheduled"),
  s("u5", "pt", at(2026, 10, 5, 9), "scheduled"),
  s("u6", "test", at(2026, 10, 7, 11), "scheduled", { session_type: "Functional Test" }),
  s("u7", "pt", at(2026, 10, 9, 7, 30), "scheduled", { title: "PT Giulia" }),
  s("u8", "pt", at(2026, 10, 12, 9), "scheduled"),
  s("p1", "pt", at(2026, 9, 28, 9), "scheduled"),
  s("p2", "pt", at(2026, 9, 25, 17), "completed", { title: "PT Giulia" }),
  s("p3", "pt", at(2026, 9, 25, 7, 30), "no_show"),
  s("p4", "pt", at(2026, 9, 23, 11), "completed"),
  s("p5", "pt", at(2026, 9, 21, 9), "completed"),
  s("p6", "bia", at(2026, 9, 18, 7, 30), "completed", { duration_min: 15, session_type: "BIA" }),
  s("p7", "pt", at(2026, 9, 14, 9), "completed"),
  s("p8", "pt", at(2026, 9, 16, 18), "late_cancelled"),
  s("p9", "pt", at(2026, 9, 26, 18), "late_cancelled", { deleted_at: DELETED }),
  s("p10", "pt", at(2026, 10, 10, 9), "cancelled"),
  s("p11", "pt", at(2026, 8, 3, 9), "completed"),
  s("p13", null, at(2026, 9, 22, 15), "completed", {
    title: "Consulenza Giulia",
    category: "consulenza",
  }),
  s("x1", "pt", at(2026, 9, 24, 10), "cancelled", { deleted_at: DELETED }),
];
const SESSION = new Map(GIULIA.map((b) => [b.id, b]));
const row = (id: string, now: Date = NOW): SessionRowModel => {
  const b = SESSION.get(id);
  if (!b) throw new Error(`sessione ${id} assente`);
  return sessionRow(b, TYPES, now);
};
const cells = (r: SessionRowModel) => [r.dow, r.day, r.range, r.type, r.chip];
const ids = (list: readonly SessionBooking[]) => list.map((b) => b.id);
const groups = (list: readonly SessionGroup[]) => list.map((g) => [g.label, ids(g.items)]);

const { upcoming, past } = splitSessions(GIULIA, NOW);

// ---------------------------------------------------------------------------
// Quali sessioni, e in quale scheda
// ---------------------------------------------------------------------------

describe("isVisibleSession", () => {
  it("nasconde l'«Elimina» del coach e tiene le annullate tardi di cancel_booking", () => {
    expect(GIULIA.filter(isVisibleSession).map((b) => b.id)).not.toContain("x1");
    expect(GIULIA.filter(isVisibleSession)).toHaveLength(GIULIA.length - 1);
    expect(isVisibleSession({ deleted_at: DELETED, status: "late_cancelled" })).toBe(true);
    expect(isVisibleSession({ deleted_at: DELETED, status: "cancelled" })).toBe(false);
    expect(isVisibleSession({ deleted_at: DELETED, status: "completed" })).toBe(false);
    expect(isVisibleSession({ deleted_at: null, status: "cancelled" })).toBe(true);
  });
});

describe("splitSessions", () => {
  it("«In programma»: prenotate, da confermare, confermate e in corso, in ordine di inizio", () => {
    expect(ids(upcoming)).toEqual(["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8"]);
    expect(sessionsSubtitle(upcoming.length)).toBe("8 sessioni in programma");
    expect(upcomingTabLabel(upcoming.length)).toBe("In programma · 8");
    expect(upcomingTabLabel(null)).toBe("In programma");
  });

  it("«Passate»: tutte le altre visibili, dalla più recente, con le annullate future", () => {
    expect(ids(past)).toEqual([
      "p10",
      "p1",
      "p9",
      "p2",
      "p3",
      "p4",
      "p13",
      "p5",
      "p6",
      "p8",
      "p7",
      "p11",
    ]);
  });

  it("ogni sessione visibile sta in una scheda sola", () => {
    const all = [...ids(upcoming), ...ids(past)];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(
      GIULIA.filter(isVisibleSession)
        .map((b) => b.id)
        .sort(),
    );
  });

  it("a parità di inizio, per id", () => {
    const same = at(2026, 10, 1, 9);
    const r = splitSessions(
      [
        s("b", "pt", same, "scheduled"),
        s("a", "pt", same, "scheduled"),
        s("d", "pt", same, "cancelled"),
        s("c", "pt", same, "cancelled"),
      ],
      NOW,
    );
    expect(ids(r.upcoming)).toEqual(["a", "b"]);
    expect(ids(r.past)).toEqual(["c", "d"]);
  });

  it("una svolta registrata prima della fine è fra le passate", () => {
    const early = s("e", "pt", at(2026, 9, 28, 10), "completed");
    expect(ids(splitSessions([early], NOW).past)).toEqual(["e"]);
  });
});

// ---------------------------------------------------------------------------
// I gruppi
// ---------------------------------------------------------------------------

describe("upcomingGroups", () => {
  it("per settimana da lunedì: questa, la prossima, dal lunedì dopo", () => {
    expect(groups(upcomingGroups(upcoming, NOW))).toEqual([
      ["Questa settimana", ["u1", "u2", "u3", "u4"]],
      ["Settimana prossima", ["u5", "u6", "u7"]],
      ["Dal lunedì 12 ottobre", ["u8"]],
    ]);
  });

  // u8 cade di lunedì, e col giorno della sessione al posto del lunedì il
  // gruppo si chiamerebbe allo stesso modo: qui nessuna cade di lunedì.
  it("dalla terza settimana il gruppo prende il lunedì, non il giorno della sessione", () => {
    const list = [
      s("mer", "pt", at(2026, 10, 14, 9), "scheduled"),
      s("sab", "pt", at(2026, 10, 17, 9), "scheduled"),
      s("gio", "pt", at(2026, 10, 22, 9), "scheduled"),
    ];
    expect(groups(upcomingGroups(list, NOW))).toEqual([
      ["Dal lunedì 12 ottobre", ["mer", "sab"]],
      ["Dal lunedì 19 ottobre", ["gio"]],
    ]);
  });

  // A Roma quella settimana dura 167 ore (in UTC e a Los Angeles 168): la
  // prova distingue le settimane di calendario dai millisecondi solo col fuso
  // europeo, per questo i test girano anche a Roma (R5).
  it("al cambio dell'ora di marzo resta una settimana", () => {
    const now = at(2027, 3, 22, 10, 40);
    const list = [
      s("dom", "pt", at(2027, 3, 28, 9), "scheduled"),
      s("lun", "pt", at(2027, 3, 29, 9), "scheduled"),
      s("apr", "pt", at(2027, 4, 5, 9), "scheduled"),
    ];
    expect(groups(upcomingGroups(list, now))).toEqual([
      ["Questa settimana", ["dom"]],
      ["Settimana prossima", ["lun"]],
      ["Dal lunedì 5 aprile", ["apr"]],
    ]);
  });

  it("la domenica sera il lunedì è già la settimana prossima", () => {
    const now = at(2026, 9, 27, 20);
    const list = [
      s("dom", "pt", at(2026, 9, 27, 21), "scheduled"),
      s("lun", "pt", at(2026, 9, 28, 9), "scheduled"),
    ];
    expect(groups(upcomingGroups(list, now))).toEqual([
      ["Questa settimana", ["dom"]],
      ["Settimana prossima", ["lun"]],
    ]);
  });
});

describe("pastGroups", () => {
  it("per mese, dalla più recente", () => {
    const g = pastGroups(past);
    expect(g.map((x) => x.label)).toEqual(["Ottobre 2026", "Settembre 2026", "Agosto 2026"]);
    expect(ids(g[0]!.items)).toEqual(["p10"]);
    expect(g[1]!.items).toHaveLength(10);
    expect(ids(g[2]!.items)).toEqual(["p11"]);
  });

  // In UTC i due mesi coincidono: la prova morde a Roma e a Los Angeles (R6).
  it("il mese è quello locale dell'inizio, non quello della stringa UTC", () => {
    const list = [
      s("ott", "pt", at(2026, 10, 1, 0, 30), "cancelled"),
      s("set", "pt", at(2026, 9, 30, 23, 30), "cancelled"),
    ];
    expect(groups(pastGroups(list))).toEqual([
      ["Ottobre 2026", ["ott"]],
      ["Settembre 2026", ["set"]],
    ]);
  });
});

// ---------------------------------------------------------------------------
// La riga
// ---------------------------------------------------------------------------

describe("sessionRow", () => {
  it("in programma: giorno, orario, tipologia e stato della 00", () => {
    expect(cells(row("u1"))).toEqual([
      "lun",
      "28",
      "10:15–11:00",
      "Call di consulenza · online",
      "In corso",
    ]);
    expect(row("u1").tile?.fg).toBe("var(--color-aura-primary)");
    expect(row("u1").ariaLabel).toBe(
      "Lunedì 28 settembre, 10:15–11:00, Call di consulenza, online, in corso",
    );

    expect(cells(row("u2"))).toEqual(["mer", "30", "10:00–11:00", "Sessione PT", "Da confermare"]);
    expect(row("u2").tile).toEqual({ bg: "#D500001a", fg: "#D50000" });
    expect(row("u2").chipTone).toEqual({ bg: "bg-warning-soft", fg: "text-warning-text" });
    expect(row("u2").ariaLabel).toBe(
      "Mercoledì 30 settembre, 10:00–11:00, Sessione PT, da confermare",
    );

    expect(row("u3").chip).toBe("Confermata");
    expect(row("u4").chip).toBe("Prenotata");

    expect(row("u6").type).toBe("Test Funzionali + Check Tecnico");
    expect(row("u6").chip).toBe("Prenotata");
    expect(row("u6").tile?.fg).toBe("var(--color-aura-primary)");
    expect(row("u6").ariaLabel).toBe(
      "Mercoledì 7 ottobre, 11:00–12:00, Test Funzionali + Check Tecnico, prenotata",
    );
  });

  it("il nome è quello della tipologia, mai il titolo dell'evento Google", () => {
    expect(row("u7").type).toBe("Sessione PT");
    expect(row("u7").chip).toBe("Prenotata");
    expect(row("u7").ariaLabel).not.toContain("Giulia");
    expect(row("p2").type).toBe("Sessione PT");
  });

  it("passate: in verifica, svolta, assente, annullate", () => {
    expect(row("p1").chip).toBe("In verifica");
    expect(row("p2").chip).toBe("Svolta");
    expect(row("p3").chip).toBe("Assente");
    expect(row("p7").chip).toBe("Svolta");

    for (const id of ["p8", "p9"]) {
      expect(row(id).chip).toBe("Annullata tardi");
      expect(row(id).tile).toBeNull();
    }
    expect(row("p10").chip).toBe("Annullata");
    expect(row("p10").tile).toBeNull();
    expect(row("p10").ariaLabel.startsWith("Sabato 10 ottobre, ")).toBe(true);
  });

  it("le svolte recenti: il chip dello stato, senza valutazione né stelle (passata 14)", () => {
    expect(row("p4").chip).toBe("Svolta");
    expect(row("p4").ariaLabel).toBe("Mercoledì 23 settembre, 11:00–12:00, Sessione PT, svolta");
    expect(Object.keys(row("p4"))).not.toContain("rating");

    expect(cells(row("p6"))).toEqual([
      "ven",
      "18",
      "07:30–07:45",
      "BIA (Bioimpedenziometria)",
      "Svolta",
    ]);
    expect(row("p6").chipTone).toEqual({ bg: "bg-success-soft", fg: "text-success-text" });
    expect(row("p6").tile?.fg).toBe("var(--color-aura-primary)");
    expect(row("p6").ariaLabel).toBe(
      "Venerdì 18 settembre, 07:30–07:45, BIA (Bioimpedenziometria), svolta",
    );
  });

  it("la consulenza senza tipologia", () => {
    expect(row("p13").type).toBe("Consulenza");
    expect(row("p13").chip).toBe("Svolta");
    expect(row("p13").tile?.fg).toBe("#005685");
  });

  it("senza tipologia né consulenza, l'etichetta del tipo di sessione", () => {
    const loose = s("z", "sparita", at(2026, 9, 24, 9), "completed", {
      session_type: "Functional Test",
    });
    expect(sessionRow(loose, TYPES, NOW).type).toBe("Test funzionale");
    expect(sessionRow(loose, TYPES, NOW).tile?.fg).toBe("#005685");
  });
});

describe("tileText", () => {
  it("il colore della tipologia solo se sulla sua tinta fa almeno 4,5:1", () => {
    expect(tileText("#D50000")).toBe("#D50000");
    expect(tileText("#7986CB")).toBe("var(--color-aura-primary)");
    expect(tileText("#E67C73")).toBe("var(--color-aura-primary)");
    expect(tileText("#039BE5")).toBe("var(--color-aura-primary)");
    expect(tileText("#33B864")).toBe("var(--color-aura-primary)");
    expect(tileText("#F6BF26")).toBe("var(--color-aura-primary)");
    expect(tileText(null)).toBe("#005685");
  });
});

// ---------------------------------------------------------------------------
// La presenza
// ---------------------------------------------------------------------------

describe("attendanceSummary", () => {
  it("le stesse sessioni del coach: deleted_at vuoto, importate comprese", () => {
    expect(attendanceSummary(GIULIA, NOW)).toEqual({
      title: "Presenza 75% nelle ultime 8 settimane",
      sub: "6 sessioni svolte · 1 assenza · 1 annullata tardi",
    });
  });

  it("null senza sessioni concluse nel periodo", () => {
    expect(attendanceSummary([s("solo", "pt", at(2026, 10, 1, 9), "scheduled")], NOW)).toBeNull();
    expect(attendanceSummary([], NOW)).toBeNull();
  });

  it("le annullate tardi solo se ci sono, al plurale", () => {
    const two = [
      s("a", "pt", at(2026, 9, 1, 9), "completed"),
      s("b", "pt", at(2026, 9, 2, 9), "no_show"),
      s("c", "pt", at(2026, 9, 3, 9), "no_show"),
      s("d", "pt", at(2026, 9, 4, 9), "late_cancelled"),
      s("e", "pt", at(2026, 9, 5, 9), "late_cancelled"),
    ];
    expect(attendanceSummary(two, NOW)?.sub).toBe(
      "1 sessione svolta · 2 assenze · 2 annullate tardi",
    );
  });
});

describe("clientAttendance · la presenza di Sessioni e del Profilo", () => {
  it("getAttendance sulle sessioni con deleted_at vuoto: la stessa di attendanceSummary", () => {
    const att = clientAttendance(GIULIA, NOW);
    expect(att).toEqual({ percent: 75, completed: 6, noShow: 1, lateCancelled: 1 });
    expect(attendanceSummary(GIULIA, NOW)?.title).toBe(
      `Presenza ${att?.percent}% nelle ultime 8 settimane`,
    );
  });

  it("null senza sessioni concluse nel periodo", () => {
    expect(clientAttendance([], NOW)).toBeNull();
    expect(clientAttendance([s("solo", "pt", at(2026, 10, 1, 9), "scheduled")], NOW)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Un altro anno: con l'orologio vero gli stati sarebbero altri
// ---------------------------------------------------------------------------

describe("l'ora è quella del parametro", () => {
  it("lunedì 29/09/2031 alle 10:40", () => {
    const now = at(2031, 9, 29, 10, 40);
    const list = [
      s("y1", "pt", at(2031, 9, 30, 10), "scheduled"),
      s("y3", "pt", at(2031, 9, 29, 9), "scheduled"),
      s("y2", "pt", at(2031, 9, 26, 10), "completed"),
    ];
    const split = splitSessions(list, now);
    expect(groups(upcomingGroups(split.upcoming, now))).toEqual([["Questa settimana", ["y1"]]]);
    expect(ids(split.past)).toEqual(["y3", "y2"]);
    expect(sessionRow(list[1]!, TYPES, now).chip).toBe("In verifica");
    expect(sessionRow(list[2]!, TYPES, now).chip).toBe("Svolta");
    expect(attendanceSummary(list, now)).toEqual({
      title: "Presenza 100% nelle ultime 8 settimane",
      sub: "1 sessione svolta · 0 assenze",
    });
  });
});

// ---------------------------------------------------------------------------
// La scheda nell'URL
// ---------------------------------------------------------------------------

describe("parseSessionsTab", () => {
  it("solo «prossime» e «passate»", () => {
    expect(parseSessionsTab("passate")).toBe("passate");
    expect(parseSessionsTab("prossime")).toBe("prossime");
    expect(parseSessionsTab("xyz")).toBeUndefined();
    expect(parseSessionsTab(undefined)).toBeUndefined();
    expect(parseSessionsTab(1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// La card vuota
// ---------------------------------------------------------------------------

const opt = (state: BookOption["state"], count: number): BookOption => ({
  key: `${state}-${count}`,
  eventTypeId: null,
  sessionType: "PT Session",
  name: "Sessione PT",
  color: null,
  durationMin: 60,
  bufferMin: 10,
  location: "physical",
  address: null,
  message: null,
  state,
  count,
  countFromNext: false,
  sub: "",
  windows: [],
  buyBooster: false,
  referencePool: null,
  nextPool: null,
});
const withOptions = (
  options: BookOption[],
  blocked: BookState["blocked"] = null,
): Pick<BookState, "options" | "blocked"> => ({ options, blocked });

describe("upcomingEmpty", () => {
  it("conta solo i crediti delle tipologie che si prenotano", () => {
    expect(
      upcomingEmpty(
        withOptions([
          opt("prenotabile", 3),
          opt("coach", 1),
          opt("prenotabile", 1),
          opt("esaurita", 0),
        ]),
        false,
      ),
    ).toEqual({ text: "Hai 4 crediti disponibili: scegli giorno e orario.", book: true });
    expect(upcomingEmpty(withOptions([opt("coach", 1)]), false)).toEqual({
      text: "Non hai crediti da prenotare in questo momento.",
      book: false,
    });
    expect(upcomingEmpty(withOptions([opt("prenotabile", 1)]), false)).toEqual({
      text: "Hai 1 credito disponibile: scegli giorno e orario.",
      book: true,
    });
  });

  it("con Prenota che non si apre, nessun credito", () => {
    const blocked = {
      kind: "concluso" as const,
      title: "Il tuo percorso è concluso",
      text: "",
      buy: false,
    };
    expect(upcomingEmpty(withOptions([opt("prenotabile", 2)], blocked), false)).toEqual({
      text: "Non hai crediti da prenotare in questo momento.",
      book: false,
    });
  });

  it("senza stato niente frase: il pulsante solo con la lettura fallita", () => {
    expect(upcomingEmpty(null, true)).toEqual({ text: null, book: true });
    expect(upcomingEmpty(null, false)).toEqual({ text: null, book: false });
  });

  // Giulia della 02 (client-book.test.ts): il numero che dice Prenota.
  it("sullo stato di getBookState, i crediti che Prenota mostra", () => {
    const type = (id: string, name: string, over: Partial<PoolEventType> = {}): PoolEventType => ({
      id,
      name,
      color: "#039be5",
      duration: 60,
      buffer_minutes: 10,
      base_type: "PT Session",
      location_type: "physical",
      location_address: null,
      client_bookable: true,
      unavailable_message: null,
      ...over,
    });
    const types = [
      type("pt", "Sessione PT"),
      type("bia", "BIA (Bioimpedenziometria)", { base_type: "BIA", client_bookable: false }),
      type("test", "Test Funzionali + Check Tecnico", { base_type: "Functional Test" }),
      type("call", "Call di consulenza", { duration: 45, location_type: "online" }),
    ];
    const sessionType = (id: string) =>
      id === "bia" ? "BIA" : id === "test" ? "Functional Test" : "PT Session";
    const alloc = (block: string, id: string, assigned: number, booked: number) =>
      ({
        block_id: block,
        event_type_id: id,
        session_type: sessionType(id),
        quantity_assigned: assigned,
        quantity_booked: booked,
      }) satisfies CreditAllocation;
    const blocks = (ptBooked: number): ClientBlock[] => [
      block("b1", 1, "2026-07-20", "2026-08-16", [], "completed"),
      block("b2", 2, "2026-08-17", "2026-09-13", [], "completed"),
      block("b3", 3, "2026-09-14", "2026-10-11", [
        alloc("b3", "pt", 8, ptBooked),
        alloc("b3", "bia", 1, 0),
        alloc("b3", "test", 1, 1),
        alloc("b3", "call", 1, 1),
      ]),
      block("b4", 4, "2026-10-12", "2026-11-08", [
        alloc("b4", "pt", 8, 0),
        alloc("b4", "test", 1, 0),
      ]),
      block("b5", 5, "2026-11-09", "2026-12-06"),
      block("b6", 6, "2026-12-07", "2027-01-03"),
    ];
    function block(
      id: string,
      seq: number,
      start: string,
      end: string,
      allocations: CreditAllocation[] = [],
      status = "active",
    ): ClientBlock {
      return { id, sequence_order: seq, start_date: start, end_date: end, status, allocations };
    }
    const session = (id: string, status: PoolBooking["status"], when: Date): PoolBooking => ({
      block_id: "b3",
      event_type_id: id,
      session_type: sessionType(id),
      status,
      scheduled_at: when.toISOString(),
    });
    const done = [
      session("pt", "completed", at(2026, 9, 15, 9)),
      session("pt", "completed", at(2026, 9, 18, 9)),
      session("pt", "no_show", at(2026, 9, 22, 9)),
      session("test", "completed", at(2026, 9, 21, 9)),
      session("call", "completed", at(2026, 9, 16, 9)),
    ];
    const booked = [
      session("pt", "scheduled", at(2026, 10, 1, 9)),
      session("pt", "scheduled", at(2026, 10, 2, 9)),
    ];
    const state = (ptBooked: number, bookings: PoolBooking[]) =>
      getBookState({
        now: NOW,
        client: { path_type: "fixed", status: "active", pack_label: null },
        blocks: blocks(ptBooked),
        bookings,
        extras: [],
        eventTypes: types,
        boosterTitles: [],
        coach: NO_COACH,
      });

    expect(upcomingEmpty(state(5, [...done, ...booked]), false).text).toBe(
      "Hai 4 crediti disponibili: scegli giorno e orario.",
    );
    expect(upcomingEmpty(state(3, done), false)).toEqual({
      text: "Hai 6 crediti disponibili: scegli giorno e orario.",
      book: true,
    });
  });
});
