import { describe, expect, it } from "vitest";
import {
  estimateFullSync,
  fullSyncBlockedText,
  fullSyncConfirmText,
  fullSyncDescription,
  fullSyncStepView,
  gcalChip,
  gcalChipLabel,
  gcalErrorTitle,
  googleOnlyEvents,
  importPayload,
  lastUpdateText,
  recognizeImport,
  type GcalMeasure,
} from "@/lib/gcal-integration";
import type { BookingRow } from "@/lib/queries";

const NOW = new Date(2026, 8, 25, 10, 40);
const OPENED = NOW.getTime();

const read = (at: number, outcome: GcalMeasure["outcome"]): GcalMeasure => ({
  kind: "read",
  at: OPENED + at,
  outcome,
});
const sync = (at: number, outcome: GcalMeasure["outcome"]): GcalMeasure => ({
  kind: "sync",
  at: OPENED + at,
  outcome,
});

describe("chip di Google Calendar", () => {
  it("nessuna misura: verifico", () => {
    expect(gcalChip([], OPENED)).toEqual({ state: "checking" });
    expect(gcalChipLabel({ state: "checking" })).toBe("Verifico…");
  });

  it("lettura riuscita: collegato; lettura fallita: errore di connessione", () => {
    expect(gcalChip([read(900, "ok")], OPENED)).toEqual({ state: "connected" });
    expect(gcalChipLabel({ state: "connected" })).toBe("Collegato");
    const err = gcalChip([read(900, "google")], OPENED);
    expect(err).toEqual({ state: "error", reason: "google" });
    expect(gcalChipLabel(err)).toBe("Errore di connessione");
  });

  it("una lettura finita prima dell'apertura (la cache) non conta", () => {
    expect(gcalChip([read(-60_000, "ok")], OPENED)).toEqual({ state: "checking" });
  });

  it("vince l'ultima misura", () => {
    // Lettura riuscita, poi «Sincronizza ora» fallita: errore.
    expect(gcalChip([read(900, "ok"), sync(5_000, "google")], OPENED)).toEqual({
      state: "error",
      reason: "google",
    });
    // Lettura fallita, poi «Sincronizza ora» riuscita: collegato.
    expect(gcalChip([read(900, "google"), sync(5_000, "ok")], OPENED)).toEqual({
      state: "connected",
    });
    // La completa conta come «Sincronizza ora».
    expect(
      gcalChip([read(900, "ok"), { kind: "full", at: OPENED + 9_000, outcome: "google" }], OPENED),
    ).toEqual({ state: "error", reason: "google" });
  });

  it("una lettura che non è la prima non conta", () => {
    // «Sincronizza ora» fallita e poi la rilettura automatica riuscita: resta errore.
    expect(gcalChip([read(900, "ok"), sync(5_000, "google"), read(6_000, "ok")], OPENED)).toEqual({
      state: "error",
      reason: "google",
    });
    // Dopo «Importa» o al ritorno sulla finestra: la seconda lettura non cambia niente.
    expect(gcalChip([read(900, "ok"), read(60_000, "google")], OPENED)).toEqual({
      state: "connected",
    });
    // La prima lettura finita dopo una sincronizzazione non conta neanche lei.
    expect(gcalChip([sync(500, "google"), read(900, "ok")], OPENED)).toEqual({
      state: "error",
      reason: "google",
    });
  });

  it("un errore dell'app non cambia il chip", () => {
    expect(gcalChip([read(900, "ok"), sync(5_000, "app")], OPENED)).toEqual({
      state: "connected",
    });
    expect(gcalChip([read(900, "google"), sync(5_000, "app")], OPENED)).toEqual({
      state: "error",
      reason: "google",
    });
    // Un errore dell'app non è una sincronizzazione che ha risposto: la lettura dopo conta.
    expect(gcalChip([sync(500, "app"), read(900, "ok")], OPENED)).toEqual({
      state: "connected",
    });
  });

  it("la prima lettura con un errore dell'app: stato non disponibile, non «Verifico…»", () => {
    const chip = gcalChip([read(900, "app")], OPENED);
    expect(chip).toEqual({ state: "unavailable" });
    expect(gcalChipLabel(chip)).toBe("Stato non disponibile");
    expect(gcalChip([read(900, "app"), sync(5_000, "app")], OPENED)).toEqual({
      state: "unavailable",
    });
    expect(gcalChip([read(900, "app"), sync(5_000, "ok")], OPENED)).toEqual({
      state: "connected",
    });
    expect(fullSyncBlockedText(chip)).toBeNull();
  });

  it("una lista vuota vale come fallimento e dà il suo titolo al riquadro", () => {
    const chip = gcalChip([read(900, "ok"), sync(5_000, "empty")], OPENED);
    expect(chip).toEqual({ state: "error", reason: "empty" });
    expect(gcalChipLabel(chip)).toBe("Errore di connessione");
    expect(gcalErrorTitle("empty")).toBe("Google Calendar ha risposto senza eventi");
    expect(gcalErrorTitle("google")).toBe("Google Calendar non risponde");
    expect(fullSyncBlockedText(chip)).toBe(
      "Impossibile avviare: Google Calendar ha risposto senza eventi.",
    );
    expect(fullSyncBlockedText({ state: "error", reason: "google" })).toBe(
      "Impossibile avviare: Google Calendar non risponde.",
    );
    expect(fullSyncBlockedText({ state: "checking" })).toBeNull();
    expect(fullSyncBlockedText({ state: "connected" })).toBeNull();
  });
});

describe("ultimo aggiornamento", () => {
  it("senza chiave, meno di un minuto, ore, ieri", () => {
    expect(lastUpdateText(null, NOW)).toBe("mai da questo browser");
    expect(lastUpdateText(OPENED - 30_000, NOW)).toBe("adesso");
    expect(lastUpdateText(OPENED - 5 * 3_600_000, NOW)).toBe("5 ore fa");
    expect(lastUpdateText(OPENED - 26 * 3_600_000, NOW)).toBe("ieri");
  });
});

let seq = 0;
function booking(over: Partial<BookingRow>): BookingRow {
  seq++;
  return {
    id: `b${seq}`,
    client_id: "c1",
    coach_id: "coach",
    block_id: null,
    session_type: "PT Session",
    scheduled_at: "2026-09-30T08:00:00+00:00",
    status: "scheduled",
    meeting_link: null,
    deleted_at: null,
    event_type_id: null,
    notes: null,
    trainer_notes: null,
    google_event_id: null,
    title: null,
    duration_min: 60,
    buffer_min: 0,
    is_personal: false,
    ...over,
  };
}

describe("stima della completa", () => {
  it("conta le sessioni coi filtri dei due server", () => {
    const g = (id: string) => ({ google_event_id: id });
    const list = [
      // Riconciliazione: in programma, con evento, nella finestra.
      booking({ ...g("e1"), scheduled_at: "2026-09-30T08:00:00+00:00" }),
      booking({ ...g("e2"), scheduled_at: "2026-03-01T09:00:00+00:00" }),
      booking({ ...g("e3"), is_personal: true, scheduled_at: "2026-10-02T09:00:00+00:00" }),
      // Fuori: completed con evento (nessuno le confronta), prima del 1° gennaio, oltre i 90 giorni.
      booking({ ...g("e4"), status: "completed", scheduled_at: "2026-05-01T09:00:00+00:00" }),
      booking({ ...g("e5"), status: "completed", scheduled_at: "2025-12-01T09:00:00+00:00" }),
      booking({ ...g("e6"), scheduled_at: "2025-12-31T23:00:00+00:00" }),
      booking({ ...g("e7"), scheduled_at: "2027-01-10T09:00:00+00:00" }),
      booking({ ...g("e8"), status: "cancelled" }),
      booking({ ...g("e9"), deleted_at: "2026-09-01T00:00:00+00:00" }),
      // Ripristino: reali, non personali, senza evento, nella finestra.
      booking({ scheduled_at: "2026-10-01T09:00:00+00:00" }),
      booking({ status: "completed", scheduled_at: "2026-04-01T09:00:00+00:00" }),
      booking({ status: "no_show", scheduled_at: "2026-02-01T09:00:00+00:00" }),
      // Fuori: personali, annullate, eliminate, prima del 2026, oltre i 90 giorni, giornaliere.
      booking({ is_personal: true }),
      booking({ status: "cancelled" }),
      booking({ status: "late_cancelled" }),
      booking({ deleted_at: "2026-09-01T00:00:00+00:00" }),
      booking({ scheduled_at: "2025-12-31T10:00:00+00:00" }),
      booking({ scheduled_at: "2027-01-10T09:00:00+00:00" }),
      booking({ scheduled_at: "2026-10-10T00:00:00Z" }),
    ];
    expect(estimateFullSync(list, NOW)).toEqual({ reconcile: 3, repair: 3, total: 6 });
  });

  it("difetto noto: la mezzanotte UTC scritta «+00:00» non è giornaliera, come per il server", () => {
    const list = [booking({ scheduled_at: "2026-10-11T00:00:00+00:00" })];
    expect(estimateFullSync(list, NOW).repair).toBe(1);
    expect(estimateFullSync([booking({ scheduled_at: "2026-10-11T00:00:00Z" })], NOW).repair).toBe(
      0,
    );
  });

  it("i testi del dialog e della card", () => {
    expect(fullSyncConfirmText(37)).toBe(
      "Vengono controllate circa 37 sessioni. Può richiedere qualche minuto e la pagina deve restare aperta fino alla fine.",
    );
    expect(fullSyncConfirmText(1)).toBe(
      "Viene controllata circa 1 sessione. Può richiedere qualche minuto e la pagina deve restare aperta fino alla fine.",
    );
    expect(fullSyncConfirmText(0)).toBe(
      "Non risultano sessioni da controllare dal 1° gennaio: la sincronizzazione finisce in pochi secondi.",
    );
    expect(fullSyncDescription(NOW)).toBe(
      "Ricontrolla le sessioni dal 1° gennaio 2026 a 90 giorni da oggi: ricrea su Google gli eventi che mancano e, per le sessioni ancora in programma, riporta nell'app spostamenti e cancellazioni fatti su Google. Serve solo se noti differenze tra i due calendari: di solito ci pensa il Calendario quando lo apri.",
    );
  });

  it("le fasi: numeri solo se M è maggiore di zero, barra in attesa per la riconciliazione", () => {
    expect(fullSyncStepView({ phase: "repair", done: 30, total: 60 })).toEqual({
      text: "Ricreo su Google gli eventi mancanti: 30 di 60",
      fraction: 0.5,
    });
    expect(fullSyncStepView({ phase: "repair", done: 0, total: 0 })).toEqual({
      text: "Ricreo su Google gli eventi mancanti…",
      fraction: null,
    });
    expect(fullSyncStepView({ phase: "repair", done: 12, total: 10 })).toEqual({
      text: "Ricreo su Google gli eventi mancanti: 12 di 12",
      fraction: 1,
    });
    expect(fullSyncStepView({ phase: "reconcile" })).toEqual({
      text: "Controllo con Google le sessioni in programma…",
      fraction: null,
    });
  });
});

describe("eventi solo su Google", () => {
  it("fuori quelli abbinati a una sessione, dentro gli altri, in ordine di data", () => {
    const ev = (id: string, startMs: number | null) => ({ id, summary: id, startMs, endMs: null });
    const events = [ev("matched", 1_000), ev("late", 9_000), ev("none", null), ev("early", 2_000)];
    const list = googleOnlyEvents(events, [
      booking({ google_event_id: "matched" }),
      booking({ google_event_id: null }),
    ]);
    expect(list.map((e) => e.id)).toEqual(["early", "late", "none"]);
  });
});

describe("importazione", () => {
  const types = [
    { id: "pt", name: "PT" },
    { id: "pack", name: "PT-Pack" },
    { id: "blank", name: null },
  ];
  const clients = [
    { id: "m", full_name: "Marco" },
    { id: "mg", full_name: "Marco Golinelli" },
    { id: "x", full_name: null },
  ];

  it("la tipologia e il cliente più lunghi vincono; un cliente dà la modalità cliente", () => {
    expect(recognizeImport("PT-Pack (Marco Golinelli)", types, clients)).toEqual({
      mode: "client",
      clientId: "mg",
      eventTypeId: "pack",
    });
    expect(recognizeImport("Prima chiamata", types, clients)).toEqual({
      mode: "consulenza",
      clientId: "",
      eventTypeId: "",
    });
    expect(recognizeImport(null, types, clients).mode).toBe("consulenza");
  });

  it("il payload è quello che mandava il pannello del telefono", () => {
    const target = { id: "g1", summary: "PT", startMs: 1_000_000, endMs: 4_600_000 };
    expect(importPayload(target, { mode: "client", clientId: "c", eventTypeId: "t" }, 5)).toEqual({
      googleEventId: "g1",
      summary: "PT",
      startISO: new Date(1_000_000).toISOString(),
      endISO: new Date(4_600_000).toISOString(),
      mode: "client",
      clientId: "c",
      eventTypeId: "t",
    });
    const bare = { id: "g2", summary: "", startMs: null, endMs: null };
    expect(importPayload(bare, { mode: "personal", clientId: "c", eventTypeId: "t" }, 5)).toEqual({
      googleEventId: "g2",
      summary: undefined,
      startISO: new Date(5).toISOString(),
      endISO: undefined,
      mode: "personal",
      clientId: undefined,
      eventTypeId: undefined,
    });
    expect(
      importPayload(target, { mode: "client", clientId: "c", eventTypeId: "" }, 5).eventTypeId,
    ).toBeUndefined();
  });
});
