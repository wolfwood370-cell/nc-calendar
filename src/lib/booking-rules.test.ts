import { describe, expect, it } from "vitest";
import {
  CLIENT_BOOKING_HORIZON_DAYS,
  CLIENT_CONFIRM_WINDOW_HOURS,
  CLIENT_FEEDBACK_DAYS,
  CLIENT_FREE_CANCEL_HOURS,
  CLIENT_MIN_NOTICE_HOURS,
  CLIENT_RESCHEDULE_CUTOFF_HOURS,
  CLIENT_RESCHEDULE_WINDOW_DAYS,
  bookingBaseText,
  bookingRulesNote,
  bookingRulesText,
  horizonLabel,
  moveRulesText,
  noticeLabel,
  type BookingTextInput,
  type CreditWindow,
  type RulesBlock,
} from "@/lib/booking-rules";
import { getMoveWindow } from "@/lib/client-credits";
import { RESCHEDULE_WINDOW_DAYS } from "@/lib/reschedule-slots";

describe("regole di prenotazione", () => {
  it("i numeri del cliente, per prenotare, spostare, annullare, confermare e valutare", () => {
    expect(CLIENT_MIN_NOTICE_HOURS).toBe(24);
    expect(CLIENT_BOOKING_HORIZON_DAYS).toBe(14);
    expect(CLIENT_RESCHEDULE_CUTOFF_HOURS).toBe(24);
    expect(CLIENT_RESCHEDULE_WINDOW_DAYS).toBe(CLIENT_BOOKING_HORIZON_DAYS);
    expect(CLIENT_FREE_CANCEL_HOURS).toBe(24);
    expect(CLIENT_CONFIRM_WINDOW_HOURS).toBe(48);
    expect(CLIENT_FEEDBACK_DAYS).toBe(14);
  });

  it("il foglio di riprogrammazione di oggi resta a 14 giorni, ora letti da qui", () => {
    expect(RESCHEDULE_WINDOW_DAYS).toBe(14);
  });

  it("preavviso: 0 dà «Nessuno», 1 ora al singolare, e la card mostra «24 ore»", () => {
    expect(noticeLabel(0)).toBe("Nessuno");
    expect(noticeLabel(1)).toBe("1 ora");
    expect(noticeLabel(CLIENT_MIN_NOTICE_HOURS)).toBe("24 ore");
  });

  it("anticipo: la card mostra «14 giorni in anticipo», 1 al singolare", () => {
    expect(horizonLabel(CLIENT_BOOKING_HORIZON_DAYS)).toBe("14 giorni in anticipo");
    expect(horizonLabel(1)).toBe("1 giorno in anticipo");
  });

  it("la nota della card del coach coi numeri veri", () => {
    expect(bookingRulesNote()).toBe(
      "Valgono per tutti i clienti, per prenotare e per spostare. Ogni credito vale nel suo blocco, e le date del blocco dopo si prenotano coi suoi crediti. Si sposta fino a 24 ore prima; si annulla senza perdere il credito con più di 24 ore di anticipo. Per ora non si cambiano da qui.",
    );
  });
});

// Lunedì 28/09/2026 alle 10:40, ora locale: lo stesso giorno con
// TZ=Europe/Rome e con TZ=UTC. I 14 giorni arrivano a lunedì 12 ottobre.
const NOW = new Date(2026, 8, 28, 10, 40);
const BASE = "Si prenota da 24 ore a 14 giorni prima.";

const block = (id: string, number: number, start: string, end: string): RulesBlock => ({
  id,
  number,
  start_date: start,
  end_date: end,
});
const win = (
  b: RulesBlock | null,
  from: string,
  until: string,
  source: CreditWindow["source"] = "block",
): CreditWindow => ({
  from,
  until,
  source,
  blockId: b?.id ?? null,
  blockNumber: b?.number ?? null,
});
const full = (b: RulesBlock, source: CreditWindow["source"] = "block") =>
  win(b, b.start_date, b.end_date, source);

// Il blocco 3 finisce domenica 11 ottobre; il blocco 4 inizia lunedì 12.
const B3 = block("b3", 3, "2026-09-14", "2026-10-11");
const B4 = block("b4", 4, "2026-10-12", "2026-11-08");

const input = (over: Partial<BookingTextInput>): BookingTextInput => ({
  now: NOW,
  pathType: "fixed",
  renews: false,
  reference: B3,
  next: null,
  windows: [full(B3)],
  ...over,
});

describe("testi di Prenota", () => {
  it("la frase base legge le costanti", () => {
    expect(bookingBaseText()).toBe(BASE);
  });

  it("a) percorso concluso, o tipologia senza crediti in nessuno dei due blocchi: solo la base", () => {
    const ended = block("b6", 6, "2026-08-10", "2026-09-06");
    expect(bookingRulesText(input({ reference: ended, windows: [] }))).toBe(BASE);
    expect(bookingRulesText(input({ next: B4, windows: [] }))).toBe(BASE);
  });

  it("b) cliente libero: solo la base", () => {
    const free = input({
      pathType: "free",
      reference: null,
      windows: [win(null, "2026-09-28", "2100-01-01", "extra")],
    });
    expect(bookingRulesText(free)).toBe(BASE);
  });

  it("c) il blocco di riferimento non è ancora iniziato: dal suo primo giorno, col suo numero", () => {
    const b4 = block("b4", 4, "2026-10-05", "2026-11-01");
    expect(bookingRulesText(input({ reference: b4, windows: [full(b4)] }))).toBe(
      `${BASE} Si prenota dal primo giorno del blocco 4, lunedì 5 ottobre.`,
    );
  });

  it("d) il blocco 3 ha finito i crediti della tipologia, il blocco 4 li ha entro i 14 giorni", () => {
    expect(bookingRulesText(input({ next: B4, windows: [full(B4)] }))).toBe(
      `${BASE} I crediti del blocco 3 per questa sessione sono finiti: da lunedì 12 ottobre valgono quelli del blocco 4.`,
    );
  });

  it("e) i 14 giorni finiscono prima della fine del blocco: solo la base", () => {
    const long = block("b3", 3, "2026-09-21", "2026-10-18");
    expect(bookingRulesText(input({ reference: long, windows: [full(long)] }))).toBe(BASE);
  });

  it("f) il blocco 4 inizia entro i 14 giorni e ha crediti: fino alla fine del 3, poi il 4", () => {
    expect(bookingRulesText(input({ next: B4, windows: [full(B3), full(B4)] }))).toBe(
      `${BASE} Fino a domenica 11 ottobre valgono i crediti del blocco 3, da lunedì 12 ottobre quelli del blocco 4.`,
    );
  });

  it("f) con un buco fra i blocchi la seconda data è l'inizio del blocco 4, non il giorno dopo la fine del 3", () => {
    // Il blocco 3 finisce domenica 4 ottobre, il 4 inizia mercoledì 7: dentro i 14 giorni.
    const b3 = block("b3", 3, "2026-09-07", "2026-10-04");
    const b4 = block("b4", 4, "2026-10-07", "2026-11-03");
    expect(
      bookingRulesText(input({ reference: b3, next: b4, windows: [full(b3), full(b4)] })),
    ).toBe(
      `${BASE} Fino a domenica 4 ottobre valgono i crediti del blocco 3, da mercoledì 7 ottobre quelli del blocco 4.`,
    );
  });

  it("g) il blocco 4 inizia entro i 14 giorni ma non ha crediti della tipologia", () => {
    expect(bookingRulesText(input({ next: B4 }))).toBe(
      `${BASE} I crediti del blocco 3 valgono fino a domenica 11 ottobre, e nel blocco 4 non ce ne sono per questa sessione.`,
    );
  });

  it("h) il blocco 4 esiste ma inizia oltre i 14 giorni", () => {
    const b4 = block("b4", 4, "2026-10-19", "2026-11-15");
    expect(bookingRulesText(input({ next: b4 }))).toBe(
      `${BASE} I crediti del blocco 3 valgono fino a domenica 11 ottobre: le date successive si aprono con il blocco 4.`,
    );
  });

  it("i) abbonamento col rinnovo automatico, senza blocco dopo", () => {
    expect(bookingRulesText(input({ pathType: "recurring", renews: true }))).toBe(
      `${BASE} I crediti del blocco 3 valgono fino a domenica 11 ottobre: le date successive si aprono con il blocco successivo.`,
    );
  });

  it("j) abbonamento senza rinnovo automatico e senza blocco dopo", () => {
    expect(bookingRulesText(input({ pathType: "recurring", renews: false }))).toBe(
      `${BASE} I crediti del blocco 3 valgono fino a domenica 11 ottobre, quando termina l'abbonamento.`,
    );
  });

  it("k) percorso fisso senza blocco dopo", () => {
    expect(bookingRulesText(input({}))).toBe(
      `${BASE} I crediti del blocco 3 valgono fino a domenica 11 ottobre, fine del percorso.`,
    );
  });

  it("k) in un altro anno: le date vengono da `now`, non dall'orologio", () => {
    const now = new Date(2031, 2, 10, 9, 0);
    const b = block("b9", 9, "2031-02-24", "2031-03-23");
    expect(bookingRulesText(input({ now, reference: b, windows: [full(b)] }))).toBe(
      `${BASE} I crediti del blocco 9 valgono fino a domenica 23 marzo, fine del percorso.`,
    );
  });

  it("un extra che copre i giorni del blocco 4 smentirebbe g): solo la base", () => {
    const windows = [full(B3), full(B4, "extra")];
    expect(bookingRulesText(input({ next: B4, windows }))).toBe(BASE);
  });

  it("crediti che finiscono prima della fine del blocco (un extra che scade prima): solo la base", () => {
    const windows = [win(B3, "2026-09-14", "2026-10-05", "extra")];
    expect(bookingRulesText(input({ windows }))).toBe(BASE);
  });

  it("a) il percorso concluso non ha frase anche se arrivassero finestre", () => {
    const ended = block("b6", 6, "2026-08-10", "2026-09-06");
    expect(bookingRulesText(input({ reference: ended, windows: [full(ended)] }))).toBe(BASE);
  });

  it("f) coi blocchi che si accavallano la seconda data è l'inizio della finestra del blocco 4", () => {
    // Il blocco 4 inizia il 5 ottobre, ma getCreditWindows lo apre dal 12.
    const b4 = block("b4", 4, "2026-10-05", "2026-11-01");
    const windows = [full(B3), win(b4, "2026-10-12", "2026-11-01")];
    expect(bookingRulesText(input({ next: b4, windows }))).toBe(
      `${BASE} Fino a domenica 11 ottobre valgono i crediti del blocco 3, da lunedì 12 ottobre quelli del blocco 4.`,
    );
  });

  it("il blocco di riferimento coperto solo da extra fino alla sua fine: le frasi restano quelle", () => {
    expect(bookingRulesText(input({ next: B4, windows: [full(B3, "extra"), full(B4)] }))).toBe(
      `${BASE} Fino a domenica 11 ottobre valgono i crediti del blocco 3, da lunedì 12 ottobre quelli del blocco 4.`,
    );
    expect(bookingRulesText(input({ windows: [full(B3, "extra")] }))).toBe(
      `${BASE} I crediti del blocco 3 valgono fino a domenica 11 ottobre, fine del percorso.`,
    );
  });
});

describe("testi di Sposta · leggono la finestra di getMoveWindow", () => {
  const moveBlock = (id: string, seq: number, start: string, end: string) => ({
    id,
    sequence_order: seq,
    start_date: start,
    end_date: end,
  });
  const B3_MOVE = moveBlock("b3", 3, "2026-09-14", "2026-10-11");
  const B4_MOVE = moveBlock("b4", 4, "2026-10-12", "2026-11-08");
  const LONG = moveBlock("b3", 3, "2026-09-21", "2026-10-18");
  const windowOf = (b: ReturnType<typeof moveBlock> | null) =>
    getMoveWindow({ block_id: b?.id ?? null }, b ? [b] : [], NOW);

  it("la fine del blocco cade entro i 14 giorni: non oltre la fine del blocco", () => {
    expect(moveRulesText({ now: NOW, window: windowOf(B3_MOVE), coachName: "Marco" })).toBe(
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni e non oltre domenica 11 ottobre, fine del blocco. Marco riceve un avviso.",
    );
  });

  it("la fine del blocco è oltre i 14 giorni, o la sessione non ha blocco", () => {
    const text =
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni. Marco riceve un avviso.";
    expect(moveRulesText({ now: NOW, window: windowOf(LONG), coachName: "Marco" })).toBe(text);
    expect(moveRulesText({ now: NOW, window: windowOf(null), coachName: "Marco" })).toBe(text);
  });

  it("il blocco della sessione non è ancora iniziato: non prima del suo inizio", () => {
    expect(moveRulesText({ now: NOW, window: windowOf(B4_MOVE), coachName: "Marco" })).toBe(
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni e non prima di lunedì 12 ottobre, inizio del blocco. Marco riceve un avviso.",
    );
  });

  it("senza il nome del coach: «Il tuo coach riceve un avviso.»", () => {
    expect(moveRulesText({ now: NOW, window: windowOf(B3_MOVE) })).toBe(
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni e non oltre domenica 11 ottobre, fine del blocco. Il tuo coach riceve un avviso.",
    );
    expect(moveRulesText({ now: NOW, window: windowOf(null), coachName: " " })).toBe(
      "Si sposta fino a 24 ore prima, su un orario entro 14 giorni. Il tuo coach riceve un avviso.",
    );
  });
});
