// Le regole del dettaglio (passata 04): le sessioni di Giulia del prompt,
// lunedì 28/09/2026 alle 10:40. Date costruite con l'ora locale, come
// client-sessions.test.ts: le stesse attese a Roma, in UTC e a Los Angeles.

import { describe, expect, it } from "vitest";
import type { CreditWindow } from "@/lib/booking-rules";
import { NO_COACH, type BookCoach, type BookOption, type BookState } from "@/lib/client-book";
import {
  LOCKED_TITLE,
  absentHint,
  actionErrorText,
  canRebook,
  cancelSheet,
  cancelToast,
  coachNoteTitle,
  confirmCaption,
  detailPanel,
  detailPlace,
  detailStatus,
  detailWhen,
  freeCancelNote,
  inviteText,
  lockedText,
  moveBlockedText,
  moveButton,
  moveCurrent,
  moveDay,
  moveDays,
  moveNoCreditText,
  moveNoSlotsText,
  moveRule,
  moveToast,
  ratingState,
  ratingToast,
  sessionMinutes,
  starsLabel,
  statusCard,
  tileIcon,
  type DetailBooking,
  type DetailEventType,
} from "@/lib/client-session-detail";
import { sessionName } from "@/lib/client-sessions";
import { dayPart, type ClientSlotDay } from "@/lib/client-slots";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 9, 28, 10, 40);

// ---------------------------------------------------------------------------
// I dati
// ---------------------------------------------------------------------------

const TYPES: DetailEventType[] = [
  {
    id: "pt",
    name: "Sessione PT",
    color: "#D50000",
    location_type: "physical",
    location_address: "Via Verdi 1, Rovigo",
    description: "Allenamento individuale in sala.",
  },
  {
    id: "bia",
    name: "BIA (Bioimpedenziometria)",
    color: "#7986CB",
    location_type: "physical",
    location_address: null,
    description: null,
  },
  {
    id: "call",
    name: "Call di consulenza",
    color: "#039BE5",
    location_type: "online",
    location_address: null,
    description: null,
  },
  {
    id: "test",
    name: "Test Funzionali + Check Tecnico",
    color: "#E67C73",
    location_type: "physical",
    location_address: "   ",
    description: null,
  },
];

const COACH: BookCoach = {
  name: "Nicolò Castello",
  firstName: "Nicolò",
  whatsapp: "https://wa.me/390000000000",
};

const EMAIL = "giulia.b@example.com";

const MOVE_WINDOW: CreditWindow = {
  from: "2026-09-28",
  until: "2026-10-11",
  source: "block",
  blockId: "b3",
  blockNumber: 3,
};

/** Un'opzione di Prenota: per canRebook contano la tipologia, lo stato e i crediti. */
const option = (id: string, state: BookOption["state"], count: number): BookOption => ({
  key: id,
  eventTypeId: id,
  sessionType: "PT Session",
  name: id,
  color: null,
  durationMin: 60,
  bufferMin: 15,
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

const STATE: Pick<BookState, "options"> = {
  options: [
    option("pt", "prenotabile", 3),
    option("bia", "coach", 1),
    option("call", "esaurita", 0),
    option("test", "prenotabile", 0),
  ],
};

const MEET = "https://meet.google.com/abc-defg-hij";
const CONFIRMED = "2026-09-28T07:00:00.000Z";
const DELETED = "2026-09-26T18:05:00.000Z";

/** Una sessione di Giulia: 60 minuti, in programma, non confermata, nel blocco b3. */
const s = (
  id: string,
  typeId: string | null,
  when: Date,
  over: Partial<DetailBooking> = {},
): DetailBooking => ({
  id,
  status: "scheduled",
  scheduled_at: when.toISOString(),
  duration_min: 60,
  client_confirmed_at: null,
  title: null,
  event_type_id: typeId,
  session_type: "PT Session",
  deleted_at: null,
  category: "client_session",
  meeting_link: null,
  trainer_notes: null,
  google_event_id: null,
  block_id: "b3",
  buffer_min: 15,
  ...over,
});

const SESSIONS: DetailBooking[] = [
  s("d1", "pt", at(2026, 9, 30, 10), { google_event_id: "g1" }),
  s("d2", "pt", at(2026, 10, 1, 9), { client_confirmed_at: CONFIRMED, google_event_id: "g2" }),
  s("d3", "pt", at(2026, 9, 28, 19, 30)),
  s("d4", "call", at(2026, 9, 28, 11, 30), { duration_min: 45, meeting_link: MEET }),
  s("d4b", "call", at(2026, 9, 28, 11, 50), { duration_min: 45, meeting_link: MEET }),
  s("d5", "call", at(2026, 9, 28, 10, 15), { duration_min: 45, meeting_link: MEET }),
  s("d5b", "call", at(2026, 9, 28, 10, 15), { duration_min: 45 }),
  s("d6", "pt", at(2026, 9, 28, 10)),
  s("d7", "pt", at(2026, 9, 23, 11), { status: "completed" }),
  s("d7b", "pt", at(2026, 9, 11, 9), { status: "completed" }),
  s("d8", "pt", at(2026, 9, 25, 7, 30), { status: "no_show" }),
  s("d9", "pt", at(2026, 10, 10, 9), { status: "cancelled" }),
  s("d10", "pt", at(2026, 9, 26, 18), { status: "late_cancelled", deleted_at: DELETED }),
  s("d12", "pt", at(2026, 9, 28, 9)),
  s("d13", "pt", at(2026, 10, 2, 7, 30), { title: "PT Giulia", google_event_id: "g13" }),
  s("d14", "pt", at(2026, 9, 29, 10, 40)),
  s("d15", "pt", at(2026, 9, 29, 18)),
  s("d16", null, at(2026, 9, 22, 15), {
    status: "completed",
    title: "Consulenza Giulia",
    category: "consulenza",
  }),
  s("d17", "bia", at(2026, 9, 18, 7, 30), {
    status: "completed",
    duration_min: 15,
    session_type: "BIA",
  }),
  s("d18", "pt", at(2026, 9, 28, 11), { meeting_link: MEET }),
  s("d19", "call", at(2026, 9, 25, 9), {
    status: "completed",
    duration_min: 45,
    meeting_link: MEET,
  }),
  s("d20", "pt", at(2026, 9, 29, 0, 30)),
];

const BY_ID = new Map(SESSIONS.map((b) => [b.id, b]));
const session = (id: string): DetailBooking => {
  const b = BY_ID.get(id);
  if (!b) throw new Error(`sessione ${id} assente`);
  return b;
};
const eventType = (id: string): DetailEventType => {
  const t = TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`tipologia ${id} assente`);
  return t;
};
const typeOf = (b: DetailBooking): DetailEventType | undefined =>
  TYPES.find((t) => t.id === b.event_type_id);
const nameOf = (b: DetailBooking) => sessionName(b, typeOf(b));

/**
 * Le azioni e il resto di una sessione, nell'ordine del prompt: pulsanti,
 * card dello stato, invito, valutazione (senza e con un voto), Annulla. Una
 * voce che manca è falsa o nulla.
 */
const facts = (b: DetailBooking): string[] => {
  const place = detailPlace(typeOf(b));
  const panel = detailPanel(b, place?.online ?? false, NOW);
  const out: string[] = [];
  if (panel.join) out.push("join");
  if (panel.confirm) out.push("confirm");
  if (panel.manage) out.push(`manage:${panel.manage}`);
  if (panel.status) {
    const card = statusCard(b, canRebook(b, STATE), NOW);
    out.push(`status:${card.key}`);
    if (card.absent) out.push("absent");
    if (card.rebook) out.push("rebook");
  }
  if (inviteText(b, EMAIL, NOW)) out.push("invito");
  const unrated = ratingState(b, false, NOW);
  const rated = ratingState(b, true, NOW);
  if (unrated.show) out.push("valutazione");
  else if (rated.show) out.push("valutazione:col-voto");
  if (unrated.editable) out.push("modificabile");
  if (panel.manage) {
    const free = cancelSheet(b, nameOf(b), NOW).free;
    out.push(free ? "annulla:gratis" : "annulla:tardi");
  }
  return out;
};

interface Expected {
  day: string;
  time: string;
  facts: string[];
}

const EXPECTED: Record<string, Expected> = {
  d1: {
    day: "Mercoledì 30 settembre",
    time: "10:00–11:00 · 60 min · tra 2 giorni",
    facts: ["confirm", "manage:free", "invito", "annulla:gratis"],
  },
  d2: {
    day: "Giovedì 1 ottobre",
    time: "09:00–10:00 · 60 min · tra 3 giorni",
    facts: ["manage:free", "invito", "annulla:gratis"],
  },
  d3: {
    day: "Oggi, lunedì 28 settembre",
    time: "19:30–20:30 · 60 min · tra 8 ore",
    facts: ["confirm", "manage:locked", "annulla:tardi"],
  },
  d4: {
    day: "Oggi, lunedì 28 settembre",
    time: "11:30–12:15 · 45 min · tra 50 min",
    facts: ["join", "manage:locked", "annulla:tardi"],
  },
  d4b: {
    day: "Oggi, lunedì 28 settembre",
    time: "11:50–12:35 · 45 min · tra 1 ora",
    facts: ["confirm", "manage:locked", "annulla:tardi"],
  },
  d5: {
    day: "Oggi, lunedì 28 settembre",
    time: "10:15–11:00 · 45 min",
    facts: ["join"],
  },
  d5b: {
    day: "Oggi, lunedì 28 settembre",
    time: "10:15–11:00 · 45 min",
    facts: [],
  },
  d6: {
    day: "Oggi, lunedì 28 settembre",
    time: "10:00–11:00 · 60 min",
    facts: [],
  },
  d7: {
    day: "Mercoledì 23 settembre",
    time: "11:00–12:00 · 60 min",
    facts: ["status:done", "rebook", "valutazione", "modificabile"],
  },
  d7b: {
    day: "Venerdì 11 settembre",
    time: "09:00–10:00 · 60 min",
    facts: ["status:done", "rebook", "valutazione:col-voto"],
  },
  d8: {
    day: "Venerdì 25 settembre",
    time: "07:30–08:30 · 60 min",
    facts: ["status:noshow", "absent"],
  },
  d9: {
    day: "Sabato 10 ottobre",
    time: "09:00–10:00 · 60 min",
    facts: ["status:cancelled", "rebook"],
  },
  d10: {
    day: "Sabato 26 settembre",
    time: "18:00–19:00 · 60 min",
    facts: ["status:late", "rebook"],
  },
  d12: {
    day: "Oggi, lunedì 28 settembre",
    time: "09:00–10:00 · 60 min",
    facts: ["status:verify"],
  },
  d13: {
    day: "Venerdì 2 ottobre",
    time: "07:30–08:30 · 60 min · tra 4 giorni",
    facts: ["manage:free", "annulla:gratis"],
  },
  d14: {
    day: "Domani, martedì 29 settembre",
    time: "10:40–11:40 · 60 min · domani",
    facts: ["confirm", "manage:free", "annulla:tardi"],
  },
  d15: {
    day: "Domani, martedì 29 settembre",
    time: "18:00–19:00 · 60 min · domani",
    facts: ["confirm", "manage:free", "annulla:gratis"],
  },
  d16: {
    day: "Martedì 22 settembre",
    time: "15:00–16:00 · 60 min",
    facts: ["status:done", "valutazione:col-voto"],
  },
  d17: {
    day: "Venerdì 18 settembre",
    time: "07:30–07:45 · 15 min",
    facts: ["status:done", "valutazione", "modificabile"],
  },
  d18: {
    day: "Oggi, lunedì 28 settembre",
    time: "11:00–12:00 · 60 min · tra 20 min",
    facts: ["confirm", "manage:locked", "annulla:tardi"],
  },
  d19: {
    day: "Venerdì 25 settembre",
    time: "09:00–09:45 · 45 min",
    facts: ["status:done", "valutazione", "modificabile"],
  },
  d20: {
    day: "Domani, martedì 29 settembre",
    time: "00:30–01:30 · 60 min · domani",
    facts: ["confirm", "manage:locked", "annulla:tardi"],
  },
};

// ---------------------------------------------------------------------------
// Le sessioni, una per una
// ---------------------------------------------------------------------------

describe("il dettaglio di ogni sessione", () => {
  it("ogni sessione ha la sua attesa", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(SESSIONS.map((b) => b.id).sort());
  });

  for (const [id, want] of Object.entries(EXPECTED)) {
    it(`${id}: giorno, orario, azioni, card, invito, valutazione e Annulla`, () => {
      const b = session(id);
      expect(detailWhen(b, NOW)).toEqual({ day: want.day, time: want.time });
      expect(facts(b)).toEqual(want.facts);
    });
  }

  it("mai due pulsanti pieni: entrare e confermare non stanno insieme", () => {
    for (const b of SESSIONS) {
      const panel = detailPanel(b, detailPlace(typeOf(b))?.online ?? false, NOW);
      expect(panel.join && panel.confirm, b.id).toBe(false);
    }
  });

  it("la modificabilità della valutazione non dipende dal voto", () => {
    for (const b of SESSIONS) {
      expect(ratingState(b, true, NOW).editable, b.id).toBe(ratingState(b, false, NOW).editable);
    }
  });
});

// ---------------------------------------------------------------------------
// I tre casi che mancavano (verifica della 04): fuori da SESSIONS, che ha
// un'attesa per ogni sessione
// ---------------------------------------------------------------------------

describe("i casi al confine", () => {
  it("la durata nulla o zero vale 60, anche nell'intestazione", () => {
    expect(sessionMinutes({ duration_min: 0 })).toBe(60);
    // duration_min è NOT NULL nel database; il ripiego c'è lo stesso.
    expect(sessionMinutes({ duration_min: null as unknown as number })).toBe(60);
    const zero = s("z1", "pt", at(2026, 9, 30, 10), { duration_min: 0 });
    expect(detailWhen(zero, NOW)).toEqual({
      day: "Mercoledì 30 settembre",
      time: "10:00–11:00 · 60 min · tra 2 giorni",
    });
  });

  it("a un'ora esatta dall'inizio si entra nella videochiamata, non si conferma", () => {
    const call = s("z2", "call", at(2026, 9, 28, 11, 40), { duration_min: 45, meeting_link: MEET });
    const online = detailPlace(eventType("call"))?.online ?? false;
    expect(online).toBe(true);
    expect(detailPanel(call, online, NOW)).toEqual({
      join: true,
      confirm: false,
      manage: "locked",
      status: false,
    });
  });

  it("niente invito per una sessione passata: svolta, o in programma e già finita", () => {
    const done = s("z3", "pt", at(2026, 9, 25, 9), { status: "completed", google_event_id: "g3" });
    const ended = s("z4", "pt", at(2026, 9, 28, 8), { google_event_id: "g4" });
    expect(inviteText(done, EMAIL, NOW)).toBeNull();
    expect(inviteText(ended, EMAIL, NOW)).toBeNull();
  });
});

describe("detailStatus", () => {
  const CHIPS: Record<string, string[]> = {
    "Da confermare": ["d1", "d3", "d4", "d4b", "d14", "d15", "d18", "d20"],
    Confermata: ["d2"],
    Prenotata: ["d13"],
    "In corso": ["d5", "d5b", "d6"],
    "In verifica": ["d12"],
    Svolta: ["d7", "d7b", "d16", "d17", "d19"],
    Assente: ["d8"],
    Annullata: ["d9"],
    "Annullata tardi": ["d10"],
  };

  it("il chip è lo stato della 00, coi suoi colori", () => {
    for (const [label, ids] of Object.entries(CHIPS)) {
      for (const id of ids) expect(detailStatus(session(id), NOW).label, id).toBe(label);
    }
    expect(Object.values(CHIPS).flat()).toHaveLength(SESSIONS.length);
    expect(detailStatus(session("d2"), NOW).tone.fg).toBe("text-success-text");
    expect(detailStatus(session("d10"), NOW).tone.fg).toBe("text-warning-text");
    expect(detailStatus(session("d8"), NOW).tone).toEqual({
      bg: "bg-danger-soft",
      fg: "text-danger-text",
    });
  });

  it("la riga della card è quella della 00", () => {
    expect(statusCard(session("d7"), true, NOW).line).toBe("Svolta · credito usato");
    expect(statusCard(session("d8"), true, NOW).line).toBe("Assente · il credito è stato scalato");
    expect(statusCard(session("d9"), true, NOW).line).toBe(
      "Annullata · il credito è tornato disponibile",
    );
    expect(statusCard(session("d10"), true, NOW).line).toBe(
      "Annullata con meno di 24 ore · credito scalato",
    );
    expect(statusCard(session("d12"), true, NOW).line).toBe(
      "In verifica · il coach deve ancora registrarla",
    );
  });
});

describe("canRebook", () => {
  it("solo le tipologie prenotabili con crediti", () => {
    expect(canRebook(session("d7"), STATE)).toBe(true);
    expect(canRebook(session("d17"), STATE)).toBe(false);
    expect(canRebook(session("d19"), STATE)).toBe(false);
    expect(canRebook({ event_type_id: "test" }, STATE)).toBe(false);
    expect(canRebook(session("d16"), STATE)).toBe(false);
    expect(canRebook(session("d7"), null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Il nome, il luogo, l'icona
// ---------------------------------------------------------------------------

describe("sessionName", () => {
  it("il nome della tipologia, mai il titolo dell'evento Google", () => {
    expect(nameOf(session("d13"))).toBe("Sessione PT");
    expect(nameOf(session("d16"))).toBe("Consulenza");
    expect(nameOf(session("d17"))).toBe("BIA (Bioimpedenziometria)");
  });
});

describe("detailPlace", () => {
  it("lo studio con «Apri in Mappe» solo con un indirizzo; online senza", () => {
    expect(detailPlace(eventType("pt"))).toEqual({
      online: false,
      text: "Studio · Via Verdi 1, Rovigo",
      mapsHref: "https://www.google.com/maps/search/?api=1&query=Via%20Verdi%201%2C%20Rovigo",
    });
    expect(detailPlace(eventType("bia"))).toEqual({
      online: false,
      text: "Studio",
      mapsHref: null,
    });
    expect(detailPlace(eventType("call"))).toEqual({
      online: true,
      text: "Online · videochiamata Google Meet",
      mapsHref: null,
    });
    expect(detailPlace(eventType("test"))).toEqual({
      online: false,
      text: "Studio",
      mapsHref: null,
    });
    expect(detailPlace(null)).toBeNull();
    expect(detailPlace(typeOf(session("d16")))).toBeNull();
  });
});

describe("tileIcon", () => {
  it("il colore della tipologia se sulla sua tinta fa almeno 3:1, altrimenti il primario", () => {
    expect(tileIcon("#D50000")).toBe("#D50000");
    expect(tileIcon("#7986CB")).toBe("#7986CB");
    expect(tileIcon("#E67C73")).toBe("var(--color-aura-primary)");
    expect(tileIcon("#039BE5")).toBe("var(--color-aura-primary)");
    expect(tileIcon("#33B864")).toBe("var(--color-aura-primary)");
    expect(tileIcon("#F6BF26")).toBe("var(--color-aura-primary)");
    expect(tileIcon(null)).toBe("#005685");
  });
});

// ---------------------------------------------------------------------------
// I testi
// ---------------------------------------------------------------------------

describe("i testi del dettaglio", () => {
  it("Annulla gratis «prima di», e il riquadro delle 24 ore", () => {
    expect(freeCancelNote(session("d1"))).toBe(
      "Annullare è gratis prima di martedì 29 settembre alle 10:00. Dopo, il credito viene scalato.",
    );
    expect(LOCKED_TITLE).toBe("Mancano meno di 24 ore");
    expect(lockedText("Sessione PT", COACH)).toBe(
      "La sessione non si può più spostare. Se la annulli, il credito Sessione PT viene scalato comunque. Per un altro orario scrivi a Nicolò.",
    );
    expect(lockedText("Sessione PT", NO_COACH)).toBe(
      "La sessione non si può più spostare. Se la annulli, il credito Sessione PT viene scalato comunque. Per un altro orario scrivi al tuo coach.",
    );
  });

  it("il coach col nome, o «il tuo coach»", () => {
    expect(confirmCaption(COACH)).toBe("Nicolò vede la conferma nel suo calendario.");
    expect(confirmCaption(NO_COACH)).toBe("Il tuo coach vede la conferma nel suo calendario.");
    expect(absentHint(COACH)).toEqual({
      text: "Pensi sia un errore? Scrivi a Nicolò",
      href: "https://wa.me/390000000000",
    });
    expect(absentHint(NO_COACH)).toEqual({
      text: "Pensi sia un errore? Scrivi al tuo coach.",
      href: null,
    });
    expect(coachNoteTitle(COACH)).toBe("Nota di Nicolò");
    expect(coachNoteTitle(NO_COACH)).toBe("Nota del coach");
    expect(ratingToast(COACH)).toBe("Grazie: Nicolò vedrà la tua valutazione.");
    expect(ratingToast(NO_COACH)).toBe("Grazie: il tuo coach vedrà la tua valutazione.");
  });

  it("l'invito solo con l'evento Google, senza titolo e con l'email", () => {
    expect(inviteText(session("d1"), EMAIL, NOW)).toBe(
      "Invito del calendario inviato a giulia.b@example.com: si aggiorna da solo se la sessione viene spostata o annullata.",
    );
    expect(inviteText(session("d1"), null, NOW)).toBeNull();
    expect(inviteText(session("d1"), "   ", NOW)).toBeNull();
    expect(inviteText(session("d13"), EMAIL, NOW)).toBeNull();
    expect(inviteText(session("d3"), EMAIL, NOW)).toBeNull();
  });

  it("le stelle e i toast dell'annullamento", () => {
    expect(starsLabel(1)).toBe("1 stella");
    expect(starsLabel(4)).toBe("4 stelle");
    expect(cancelToast(false)).toEqual({
      tone: "success",
      text: "Sessione annullata: il credito è tornato disponibile.",
    });
    expect(cancelToast(true)).toEqual({
      tone: "warning",
      text: "Sessione annullata: il credito è stato scalato.",
    });
  });
});

// ---------------------------------------------------------------------------
// Annulla
// ---------------------------------------------------------------------------

describe("cancelSheet", () => {
  it("gratis con più di 24 ore; a 24 ore esatte si sposta ancora, ma annullare costa", () => {
    expect(cancelSheet(session("d1"), "Sessione PT", NOW)).toEqual({
      when: "Sessione PT · mer 30 set, 10:00–11:00",
      free: true,
      text: "Il credito torna disponibile.",
    });
    expect(cancelSheet(session("d14"), "Sessione PT", NOW)).toEqual({
      when: "Sessione PT · mar 29 set, 10:40–11:40",
      free: false,
      text: "Mancano meno di 24 ore: il credito Sessione PT viene scalato comunque.",
    });
  });
});

// ---------------------------------------------------------------------------
// Sposta
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Un giorno di Sposta coi suoi orari («09:00»), da 60 minuti e senza consigliati. */
const slotDay = (m: number, d: number, hours: readonly string[]): ClientSlotDay => ({
  date: at(2026, m, d),
  isoDate: `2026-${pad(m)}-${pad(d)}`,
  slots: hours.map((time) => {
    const [h = 0, min = 0] = time.split(":").map(Number);
    const start = at(2026, m, d, h, min);
    return {
      iso: start.toISOString(),
      time,
      end: `${pad(h + 1)}:${pad(min)}`,
      part: dayPart(start),
      recommended: false,
    };
  }),
  reason: hours.length > 0 ? null : "pieno",
  recommendedReason: null,
  window: MOVE_WINDOW,
});

const times = (days: readonly ClientSlotDay[]) =>
  days.map((d) => [d.isoDate, d.slots.map((x) => x.time)]);

describe("i testi di Sposta", () => {
  it("l'orario di adesso, le 24 ore, nessun orario, la regola", () => {
    expect(moveCurrent(session("d1"), "Sessione PT")).toBe(
      "Ora: mercoledì 30 settembre, 10:00–11:00 · Sessione PT",
    );
    expect(moveBlockedText(NO_COACH)).toBe(
      "Mancano meno di 24 ore all'inizio: la sessione non si può più spostare. Per un altro orario scrivi al tuo coach.",
    );
    expect(moveNoSlotsText(COACH)).toBe(
      "Nessun orario libero nei prossimi giorni. Per trovarne uno scrivi a Nicolò.",
    );
    expect(moveRule(MOVE_WINDOW, NO_COACH, NOW)).toBe(
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni e non oltre domenica 11 ottobre, fine del blocco. Il tuo coach riceve un avviso.",
    );
    expect(moveRule(MOVE_WINDOW, COACH, NOW)).toBe(
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni e non oltre domenica 11 ottobre, fine del blocco. Nicolò riceve un avviso.",
    );
    expect(moveRule(null, NO_COACH, NOW)).toBe(
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni. Il tuo coach riceve un avviso.",
    );
  });

  it("il pulsante e il toast", () => {
    const slot = { iso: at(2026, 9, 29, 11, 10).toISOString(), time: "11:10" };
    expect(moveButton(null)).toBe("Scegli un nuovo orario");
    expect(moveButton(slot)).toBe("Sposta a mar 29 set, 11:10");
    expect(moveToast(slot.iso, COACH)).toBe(
      "Spostata a mar 29 set alle 11:10. Nicolò riceve un avviso.",
    );
    expect(moveToast(slot.iso, NO_COACH)).toBe(
      "Spostata a mar 29 set alle 11:10. Il tuo coach riceve un avviso.",
    );
  });
});

describe("moveDays", () => {
  it("toglie l'orario di adesso, confrontato come tempo anche nella forma del database", () => {
    const d1 = session("d1");
    const stored = { ...d1, scheduled_at: d1.scheduled_at.replace(".000Z", "+00:00") };
    expect(stored.scheduled_at.endsWith("+00:00")).toBe(true);
    const days = [slotDay(9, 30, ["09:00", "10:00", "11:10"]), slotDay(10, 1, ["10:00"])];
    expect(times(moveDays(days, stored))).toEqual([
      ["2026-09-30", ["09:00", "11:10"]],
      ["2026-10-01", ["10:00"]],
    ]);
  });

  it("un giorno rimasto senza orari è pieno", () => {
    const [day] = moveDays([slotDay(9, 30, ["10:00"])], session("d1"));
    expect(day?.slots).toEqual([]);
    expect(day?.reason).toBe("pieno");
  });
});

describe("moveDay", () => {
  it("il giorno scelto se ha orari, altrimenti il primo con orari, altrimenti null", () => {
    const empty = slotDay(9, 30, []);
    const days = [empty, slotDay(10, 1, ["09:00", "10:00"]), slotDay(10, 2, ["09:00"])];
    expect(moveDay(days, "2026-10-02")?.isoDate).toBe("2026-10-02");
    expect(moveDay(days, "2026-09-30")?.isoDate).toBe("2026-10-01");
    expect(moveDay(days, null)?.isoDate).toBe("2026-10-01");
    expect(moveDay([empty, slotDay(10, 1, [])], null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gli errori
// ---------------------------------------------------------------------------

describe("actionErrorText", () => {
  const taken = { code: "23P01", message: "conflicting key value violates exclusion constraint" };
  const credit = { code: "P0001", message: "Credito non disponibile per questa tipologia." };
  const other = { code: "XX", message: "boom" };

  it("l'orario occupato", () => {
    expect(actionErrorText(taken, "move")).toBe(
      "Questo orario non è più libero: scegline un altro.",
    );
    expect(actionErrorText(taken, "undo-move")).toBe("L'orario di prima non è più libero.");
    expect(actionErrorText(taken, "restore")).toBe(
      "L'orario non è più libero: la sessione resta annullata.",
    );
  });

  it("il messaggio del server così com'è", () => {
    for (const action of ["move", "undo-move", "restore"] as const) {
      expect(actionErrorText(credit, action)).toBe("Credito non disponibile per questa tipologia.");
    }
  });

  it("il testo di ripiego", () => {
    expect(actionErrorText(other, "move")).toBe(
      "Non siamo riusciti a spostare la sessione. Riprova tra poco.",
    );
    expect(actionErrorText(null, "move")).toBe(
      "Non siamo riusciti a spostare la sessione. Riprova tra poco.",
    );
    expect(actionErrorText(other, "undo-move")).toBe(
      "Non siamo riusciti a riportarla all'orario di prima.",
    );
    expect(actionErrorText(undefined, "restore")).toBe(
      "Non siamo riusciti a ripristinare la sessione.",
    );
  });
});

// Passata 09: Sposta senza un credito che regga lo spostamento.
describe("Sposta senza credito (passata 09)", () => {
  it("moveNoCreditText: col coach e senza", () => {
    expect(moveNoCreditText(COACH)).toBe(
      "Questa sessione non si può spostare dall'app. Per un altro orario scrivi a Nicolò.",
    );
    expect(moveNoCreditText(NO_COACH)).toBe(
      "Questa sessione non si può spostare dall'app. Per un altro orario scrivi al tuo coach.",
    );
  });
});
