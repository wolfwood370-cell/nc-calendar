// ----------------------------------------------------------------------------
// Integrazioni: stato di Google, caselle e stima (passata 09)
// ----------------------------------------------------------------------------
// Regole pure della pagina Integrazioni desktop, senza rete né orologio
// nascosto.
//   - Il chip dice l'esito dell'ultima misura fatta dalla pagina: la prima
//     lettura degli eventi finita dopo l'apertura, «Sincronizza ora», la
//     completa. Le altre letture (dopo una sincronizzazione, dopo «Importa»,
//     al ritorno sulla finestra) aggiornano gli elenchi, non il chip: una
//     lettura riuscita un secondo dopo coprirebbe una riconciliazione fallita.
//     Gli errori dell'app non cambiano il chip.
//   - «Ultimo aggiornamento» è l'ultima sincronizzazione riuscita da questo
//     browser (gcal_reconcile_ok): da quando Google non risponde non lo sa
//     nessuno.
//   - La stima della completa usa i filtri dei due server sulle sessioni del
//     coach (useCoachBookings).
//   - Eventi solo su Google e riconoscimento dal titolo: le regole del
//     pannello di riconciliazione del telefono (calendar-gcal-review.tsx),
//     che ora le usa da qui.
// ----------------------------------------------------------------------------

import { isAllDayEvent } from "@/lib/all-day-event";
import { fullSyncWindow, type SyncFailure, type SyncOutcome } from "@/lib/gcal-sync-run";
import { formatAgo } from "@/lib/notifications";
import type { BookingRow } from "@/lib/queries";

// ----------------------------------------------------------------------------
// Chip
// ----------------------------------------------------------------------------

export type MeasureKind = "read" | "sync" | "full";

/** Una risposta: letture degli eventi, «Sincronizza ora», completa. `at` è quando è finita. */
export interface GcalMeasure {
  kind: MeasureKind;
  at: number;
  outcome: SyncOutcome;
}

export type GcalChip =
  | { state: "checking" }
  | { state: "unavailable" }
  | { state: "connected" }
  | { state: "error"; reason: Exclude<SyncFailure, "app"> };

/**
 * Lo stato di Google secondo l'ultima misura. Conta solo la prima lettura
 * finita dopo l'apertura, e solo se nessuna sincronizzazione ha già risposto
 * prima; gli errori dell'app non cambiano niente, tranne quando è la prima
 * lettura a darlo e non c'è altro: allora lo stato non è disponibile.
 */
export function gcalChip(measures: readonly GcalMeasure[], openedAt: number): GcalChip {
  const syncs = measures.filter((m) => m.kind !== "read" && m.outcome !== "app");
  const firstSyncAt = Math.min(Infinity, ...syncs.map((m) => m.at));
  const firstRead = measures
    .filter((m) => m.kind === "read" && m.at >= openedAt)
    .sort((a, b) => a.at - b.at)[0];
  const readCounts = firstRead !== undefined && firstRead.at <= firstSyncAt;
  const candidates = readCounts && firstRead.outcome !== "app" ? [firstRead, ...syncs] : [...syncs];
  // A parità d'ora vince la sincronizzazione, che la lettura non la copre.
  let latest: GcalMeasure | undefined;
  for (const m of candidates) {
    if (!latest || m.at > latest.at || (m.at === latest.at && m.kind !== "read")) latest = m;
  }
  if (latest) {
    if (latest.outcome === "ok") return { state: "connected" };
    return { state: "error", reason: latest.outcome === "empty" ? "empty" : "google" };
  }
  if (readCounts && firstRead.outcome === "app") return { state: "unavailable" };
  return { state: "checking" };
}

export function gcalChipLabel(chip: GcalChip): string {
  switch (chip.state) {
    case "checking":
      return "Verifico…";
    case "unavailable":
      return "Stato non disponibile";
    case "connected":
      return "Collegato";
    case "error":
      return "Errore di connessione";
  }
}

/** Titolo del riquadro d'errore: senza «dalle …», perché da quando non lo sappiamo. */
export function gcalErrorTitle(reason: Exclude<SyncFailure, "app">): string {
  return reason === "empty"
    ? "Google Calendar ha risposto senza eventi"
    : "Google Calendar non risponde";
}

/** Perché «Avvia» della completa non parte, o null se può partire. */
export function fullSyncBlockedText(chip: GcalChip): string | null {
  if (chip.state !== "error") return null;
  return chip.reason === "empty"
    ? "Impossibile avviare: Google Calendar ha risposto senza eventi."
    : "Impossibile avviare: Google Calendar non risponde.";
}

// ----------------------------------------------------------------------------
// Ultimo aggiornamento
// ----------------------------------------------------------------------------

/** «adesso», «5 ore fa», «ieri»; senza chiave «mai da questo browser». */
export function lastUpdateText(lastOk: number | null, now: Date): string {
  if (lastOk === null) return "mai da questo browser";
  // formatAgo arrotonda: 30 secondi sarebbero «1 min fa».
  if (now.getTime() - lastOk < 60_000) return "adesso";
  return formatAgo(new Date(lastOk).toISOString(), now);
}

// ----------------------------------------------------------------------------
// Stima della completa
// ----------------------------------------------------------------------------

/**
 * Inizio fisso della finestra del ripristino sul server
 * (gcal.functions.ts:525); quella della riconciliazione parte dal 1° gennaio
 * dell'anno in corso. Nel 2026 coincidono.
 */
export const REPAIR_FROM_ISO = "2026-01-01T00:00:00.000Z";

type EstimateBooking = Pick<
  BookingRow,
  "status" | "deleted_at" | "google_event_id" | "is_personal" | "scheduled_at"
>;

export interface FullSyncEstimate {
  /** Le sessioni che la riconciliazione confronta con Google. */
  reconcile: number;
  /** Le sessioni a cui il ripristino ricrea l'evento (M). */
  repair: number;
  total: number;
}

function within(iso: string, fromMs: number, toMs: number): boolean {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms >= fromMs && ms <= toMs;
}

/**
 * Quante sessioni la completa controlla, coi filtri dei due server. È una
 * stima del solo coach: useCoachBookings legge le sue sessioni (al massimo
 * 1000, queries.ts:235), mentre la riconciliazione del server guarda quelle
 * di tutti i coach (gcal.functions.ts:396-403). Con un coach solo coincidono.
 * Le completed con evento non contano: nessuno le confronta.
 */
export function estimateFullSync(
  bookings: readonly EstimateBooking[],
  now: Date,
): FullSyncEstimate {
  const window = fullSyncWindow(now);
  const toMs = Date.parse(window.timeMaxISO);
  const reconcileFrom = Date.parse(window.timeMinISO);
  const repairFrom = Date.parse(REPAIR_FROM_ISO);
  let reconcile = 0;
  let repair = 0;
  for (const b of bookings) {
    if (b.deleted_at) continue;
    // Riconciliazione: scheduled, con evento, nella finestra (gcal.functions.ts:396-403).
    if (
      b.status === "scheduled" &&
      b.google_event_id &&
      within(b.scheduled_at, reconcileFrom, toMs)
    ) {
      reconcile++;
    }
    // Ripristino: sessioni reali, non personali, senza evento, non giornaliere
    // (gcal.functions.ts:535-563: la stessa regola di isAllDayEvent).
    if (
      (b.status === "scheduled" || b.status === "completed" || b.status === "no_show") &&
      !b.is_personal &&
      !b.google_event_id &&
      !isAllDayEvent(b) &&
      within(b.scheduled_at, repairFrom, toMs)
    ) {
      repair++;
    }
  }
  return { reconcile, repair, total: reconcile + repair };
}

// ----------------------------------------------------------------------------
// Testi della completa
// ----------------------------------------------------------------------------

export function fullSyncDescription(now: Date): string {
  return (
    `Ricontrolla le sessioni dal 1° gennaio ${now.getFullYear()} a 90 giorni da oggi: ` +
    "ricrea su Google gli eventi che mancano e, per le sessioni ancora in programma, " +
    "riporta nell'app spostamenti e cancellazioni fatti su Google. Serve solo se noti " +
    "differenze tra i due calendari: di solito ci pensa il Calendario quando lo apri."
  );
}

const CONFIRM_TAIL =
  "Può richiedere qualche minuto e la pagina deve restare aperta fino alla fine.";

/** Il testo del dialog di conferma; null quando le sessioni non si sono ancora lette. */
export function fullSyncConfirmText(total: number | null): string {
  if (total === null) return CONFIRM_TAIL;
  if (total === 0) {
    return "Non risultano sessioni da controllare dal 1° gennaio: la sincronizzazione finisce in pochi secondi.";
  }
  if (total === 1) return `Viene controllata circa 1 sessione. ${CONFIRM_TAIL}`;
  return `Vengono controllate circa ${total} sessioni. ${CONFIRM_TAIL}`;
}

export type FullSyncStep =
  | { phase: "repair"; done: number; total: number }
  | { phase: "reconcile" };

/** La fase in corso e la barra: una frazione, o null per la barra in attesa. */
export function fullSyncStepView(step: FullSyncStep): { text: string; fraction: number | null } {
  if (step.phase === "reconcile") {
    return { text: "Controllo con Google le sessioni in programma…", fraction: null };
  }
  if (step.total <= 0) return { text: "Ricreo su Google gli eventi mancanti…", fraction: null };
  // M è una stima: se il server ne trova di più, il totale segue i fatti.
  const total = Math.max(step.total, step.done);
  return {
    text: `Ricreo su Google gli eventi mancanti: ${step.done} di ${total}`,
    fraction: step.done / total,
  };
}

// ----------------------------------------------------------------------------
// Eventi solo su Google e importazione
// ----------------------------------------------------------------------------

export interface ReviewEvent {
  id: string;
  summary: string;
  startMs: number | null;
  endMs: number | null;
}

/** Eventi della lettura che non sono l'evento di nessuna sessione, in ordine di data. */
export function googleOnlyEvents<E extends ReviewEvent>(
  events: readonly E[],
  bookings: readonly Pick<BookingRow, "google_event_id">[],
): E[] {
  const booked = new Set(bookings.map((b) => b.google_event_id).filter(Boolean) as string[]);
  return events
    .filter((e) => !booked.has(e.id))
    .sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity) || a.id.localeCompare(b.id));
}

export type ImportMode = "client" | "consulenza" | "personal";

export interface ImportChoice {
  mode: ImportMode;
  clientId: string;
  eventTypeId: string;
}

/**
 * Riconoscimento dal titolo di Google (es. «Test Funzionali + Check Tecnico
 * (Marco Golinelli)»): la tipologia e il cliente il cui nome compare nel
 * titolo, il più lungo vince («PT-Pack» batte «PT»). Con un cliente la
 * modalità è «cliente», altrimenti consulenza: gli eventi non assegnabili
 * sono di norma consulenze o appuntamenti esterni.
 */
export function recognizeImport(
  summary: string | null | undefined,
  eventTypes: readonly { id: string; name: string | null }[],
  clients: readonly { id: string; full_name: string | null }[],
): ImportChoice {
  const s = (summary ?? "").toLowerCase();
  let eventTypeId = "";
  let bestEt = 0;
  for (const et of eventTypes) {
    const n = (et.name ?? "").toLowerCase().trim();
    if (n && s.includes(n) && n.length > bestEt) {
      eventTypeId = et.id;
      bestEt = n.length;
    }
  }
  let clientId = "";
  let bestC = 0;
  for (const c of clients) {
    const n = (c.full_name ?? "").toLowerCase().trim();
    if (n && s.includes(n) && n.length > bestC) {
      clientId = c.id;
      bestC = n.length;
    }
  }
  return { mode: clientId ? "client" : "consulenza", clientId, eventTypeId };
}

/** Quello che gcalImportEvent riceve: lo stesso dal telefono e dal desktop. */
export interface ImportPayload {
  googleEventId: string;
  summary?: string;
  startISO: string;
  endISO?: string;
  mode: ImportMode;
  clientId?: string;
  eventTypeId?: string;
}

export function importPayload(
  target: ReviewEvent,
  choice: ImportChoice,
  nowMs: number,
): ImportPayload {
  return {
    googleEventId: target.id,
    summary: target.summary || undefined,
    startISO: new Date(target.startMs ?? nowMs).toISOString(),
    endISO: target.endMs ? new Date(target.endMs).toISOString() : undefined,
    mode: choice.mode,
    clientId: choice.mode === "client" ? choice.clientId : undefined,
    eventTypeId: choice.mode === "client" && choice.eventTypeId ? choice.eventTypeId : undefined,
  };
}
