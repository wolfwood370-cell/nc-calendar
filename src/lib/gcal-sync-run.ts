// ----------------------------------------------------------------------------
// Sincronizzazioni con Google Calendar, logica pura (passata 09)
// ----------------------------------------------------------------------------
// La rapida (apertura del Calendario, «Sincronizza ora» del Calendario e di
// Integrazioni) e la completa (dal 1° gennaio), con un esito vero. Niente rete
// né Date.now() nascosti: le due chiamate al server e l'ora entrano come
// parametri (use-gcal-sync.ts passa quelle vere, i test quelle finte).
//   - Un'eccezione vale come ok: false.
//   - Riuscita vuol dire ok e niente skipped: con una lista vuota di Google
//     il server non tocca niente per sicurezza (gcal.functions.ts:428-432),
//     e non è una sincronizzazione riuscita.
//   - «Permesso negato» e «Lettura prenotazioni fallita» sono errori
//     dell'app (gcal.functions.ts:378, :406, :518, :557); tutti gli altri
//     fallimenti valgono come Google che non risponde.
//   - Il ripristino della completa gira a passate da 50 e si ferma quando
//     una passata fallisce, quando non resta niente da trattare o quando una
//     passata non crea niente: gli eventi che falliscono tornerebbero
//     identici alla passata dopo, con le stesse chiamate a Google.
//   - La riconciliazione della completa è una chiamata sola sull'intera
//     finestra: evento e sessione si abbinano solo dentro la stessa finestra,
//     e spezzarla perderebbe gli spostamenti a cavallo.
// ----------------------------------------------------------------------------

import type { gcalReconcileEvents, gcalRepairMissingEvents } from "@/lib/gcal.functions";
import { yearStartISO } from "@/lib/gcal-repair";

export type ReconcileResult = Awaited<ReturnType<typeof gcalReconcileEvents>>;
export type RepairResult = Awaited<ReturnType<typeof gcalRepairMissingEvents>>;

export interface SyncWindow {
  timeMinISO: string;
  timeMaxISO: string;
}

/** Le due chiamate al server; senza finestra la riconciliazione usa la sua (-1h, +16 giorni). */
export interface GcalSyncApi {
  reconcile: (window?: SyncWindow) => Promise<ReconcileResult>;
  repair: () => Promise<RepairResult>;
}

/** Perché una sincronizzazione non è riuscita. */
export type SyncFailure = "app" | "google" | "empty";

/** L'esito di una misura dello stato di Google. */
export type SyncOutcome = "ok" | SyncFailure;

const DAY_MS = 24 * 60 * 60_000;

/** Passate massime del ripristino nella completa, come prima della passata 09. */
export const REPAIR_MAX_PASSES = 20;

/**
 * Sessioni al massimo per passata del ripristino sul server (il `.limit(50)`
 * di gcalRepairMissingEvents).
 */
export const REPAIR_PAGE = 50;

const APP_ERRORS = ["Permesso negato", "Lettura prenotazioni fallita"];

export function isAppError(error: string | undefined | null): boolean {
  return !!error && APP_ERRORS.includes(error);
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : "Errore sconosciuto";
}

async function settle<T extends { ok: boolean; error?: string }>(
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (e) {
    return { ok: false, error: messageOf(e) } as T;
  }
}

/** L'esito della riconciliazione, per il chip e per gcal_reconcile_ok. */
export function reconcileOutcome(pull: ReconcileResult): SyncOutcome {
  if (!pull.ok) return isAppError(pull.error) ? "app" : "google";
  return pull.skipped ? "empty" : "ok";
}

/** La finestra della completa: dal 1° gennaio dell'anno a 90 giorni da adesso. */
export function fullSyncWindow(now: Date): SyncWindow {
  return {
    timeMinISO: yearStartISO(now),
    timeMaxISO: new Date(now.getTime() + 90 * DAY_MS).toISOString(),
  };
}

// ----------------------------------------------------------------------------
// Rapida
// ----------------------------------------------------------------------------

export interface QuickSync {
  /** Tutte e due le chiamate riuscite, e la riconciliazione non saltata. */
  ok: boolean;
  failure: SyncFailure | null;
  /** Dalla riconciliazione, solo se è riuscita. */
  cancelled: number;
  moved: number;
  conflicts: number;
  /** Dal ripristino, solo se è riuscito. */
  created: number;
  notCreated: number;
  /** Qualcosa è cambiato nell'app o su Google. */
  changed: boolean;
}

export function quickSyncOf(pull: ReconcileResult, push: RepairResult): QuickSync {
  const pullDone = pull.ok && !pull.skipped;
  const cancelled = pullDone ? (pull.cancelled ?? 0) : 0;
  const moved = pullDone ? (pull.moved ?? 0) : 0;
  const conflicts = pullDone ? (pull.conflicts ?? 0) : 0;
  const created = push.ok ? (push.created ?? 0) : 0;
  const notCreated = push.ok ? (push.failed ?? 0) : 0;
  let failure: SyncFailure | null = null;
  if ((!pull.ok && isAppError(pull.error)) || (!push.ok && isAppError(push.error))) {
    failure = "app";
  } else if (!pull.ok || !push.ok) {
    failure = "google";
  } else if (pull.skipped) {
    failure = "empty";
  }
  return {
    ok: failure === null,
    failure,
    cancelled,
    moved,
    conflicts,
    created,
    notCreated,
    changed: cancelled + moved + created > 0,
  };
}

/** Riconciliazione sulla finestra di default e ripristino, insieme. */
export async function runQuickSync(api: GcalSyncApi): Promise<QuickSync> {
  const [pull, push] = await Promise.all([settle(() => api.reconcile()), settle(api.repair)]);
  return quickSyncOf(pull, push);
}

/** L'esito della rapida come misura dello stato di Google. */
export function quickSyncOutcome(r: QuickSync): SyncOutcome {
  return r.failure ?? "ok";
}

// ----------------------------------------------------------------------------
// Testi
// ----------------------------------------------------------------------------

export type SyncTone = "info" | "success" | "warning" | "danger";

export interface SyncMessage {
  tone: SyncTone;
  title: string;
  description?: string;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function createdText(n: number): string {
  return plural(n, "evento ricreato", "eventi ricreati");
}

function notCreatedText(n: number): string {
  return plural(n, "evento non ricreato", "eventi non ricreati");
}

function conflictsText(n: number): string {
  return plural(n, "sessione non aggiornata", "sessioni non aggiornate");
}

/** «2 spostate su Google · 1 annullata su Google · 3 eventi ricreati su Google · …». */
function quickParts(r: QuickSync): string[] {
  const parts: string[] = [];
  if (r.moved > 0) parts.push(`${plural(r.moved, "spostata", "spostate")} su Google`);
  if (r.cancelled > 0) parts.push(`${plural(r.cancelled, "annullata", "annullate")} su Google`);
  if (r.created > 0) parts.push(`${createdText(r.created)} su Google`);
  if (r.notCreated > 0) parts.push(notCreatedText(r.notCreated));
  if (r.conflicts > 0) parts.push(conflictsText(r.conflicts));
  return parts;
}

export const APP_ERROR_TEXT =
  "Non riesco a leggere le sessioni dell'app. Riprova tra qualche minuto.";
export const GOOGLE_DOWN_TEXT = "Google Calendar non risponde. Riprova tra qualche minuto.";
export const GOOGLE_EMPTY_TEXT =
  "Google Calendar ha risposto senza eventi: per sicurezza nell'app non è cambiato niente.";

/** Il messaggio della rapida: sotto, sempre quello che è comunque successo. */
export function quickSyncMessage(r: QuickSync): SyncMessage {
  const parts = quickParts(r);
  const description = parts.length > 0 ? parts.join(" · ") : undefined;
  if (r.failure === "app") return { tone: "warning", title: APP_ERROR_TEXT, description };
  if (r.failure === "google") return { tone: "warning", title: GOOGLE_DOWN_TEXT, description };
  if (r.failure === "empty") return { tone: "warning", title: GOOGLE_EMPTY_TEXT, description };
  if (!description) return { tone: "info", title: "Sincronizzato: nessuna differenza trovata." };
  const problems = r.notCreated + r.conflicts > 0;
  return {
    tone: problems ? "warning" : "success",
    title: "Sincronizzato con Google Calendar.",
    description,
  };
}

// ----------------------------------------------------------------------------
// Completa
// ----------------------------------------------------------------------------

export type FullSyncProgress =
  | { phase: "repair"; done: number; total: number }
  | { phase: "reconcile" };

export type RepairStop = "done" | "no-progress" | "failure" | "limit";

export interface FullSync {
  repair: {
    ok: boolean;
    error?: string;
    passes: number;
    created: number;
    /** Le sessioni che nell'ultima passata non hanno avuto l'evento. */
    notCreated: number;
    stop: RepairStop;
    /**
     * Tutte le sessioni senza evento sono state tentate: false se una passata
     * è fallita, dopo le 20 passate, o se l'ultima passata era piena e non ha
     * creato niente (le più vecchie non le ha provate nessuno).
     */
    complete: boolean;
  };
  reconcile: ReconcileResult;
}

export interface FullSyncOptions {
  now: Date;
  /** La parte del ripristino della stima (M): 0 se non si sa. */
  repairEstimate: number;
  onProgress?: (p: FullSyncProgress) => void;
}

export async function runFullSync(api: GcalSyncApi, opts: FullSyncOptions): Promise<FullSync> {
  const window = fullSyncWindow(opts.now);
  const report = (p: FullSyncProgress) => opts.onProgress?.(p);
  const total = Math.max(0, opts.repairEstimate);

  // Ripristino (app -> Google) a passate da 50. Chi fallisce resta senza
  // evento e torna in testa alla passata dopo (il server le prende dalle più
  // recenti), quindi quelle dell'ultima passata sono le non ricreate.
  let passes = 0;
  let created = 0;
  let notCreated = 0;
  let lastTotal = 0;
  // La passata si è fermata al tetto di pagine con altre sessioni da leggere
  // (`more`, passata 11): non è l'ultima anche se ne ha trattate meno di 50.
  let lastMore = false;
  let stop: RepairStop = "limit";
  let repairError: string | undefined;
  report({ phase: "repair", done: 0, total });
  while (passes < REPAIR_MAX_PASSES) {
    const r = await settle(api.repair);
    passes++;
    if (!r.ok) {
      stop = "failure";
      repairError = r.error;
      break;
    }
    created += r.created ?? 0;
    notCreated = r.failed ?? 0;
    lastTotal = r.total ?? 0;
    lastMore = r.more === true;
    report({ phase: "repair", done: created + notCreated, total });
    if ((r.total ?? 0) === 0) {
      stop = lastMore ? "no-progress" : "done";
      break;
    }
    if ((r.created ?? 0) === 0) {
      stop = "no-progress";
      break;
    }
  }

  // Riconciliazione (Google -> app) sull'intera finestra, in un colpo.
  report({ phase: "reconcile" });
  const reconcile = await settle(() => api.reconcile(window));

  return {
    repair: {
      ok: stop !== "failure",
      ...(repairError !== undefined ? { error: repairError } : {}),
      passes,
      created,
      notCreated,
      stop,
      complete:
        !lastMore && (stop === "done" || (stop === "no-progress" && lastTotal < REPAIR_PAGE)),
    },
    reconcile,
  };
}

export type FullSyncCase = "app" | "google" | "empty" | "partial" | "problems" | "done";

export interface FullSyncOutcome {
  kind: FullSyncCase;
  tone: "danger" | "warning" | "success";
  title: string;
  /** Frasi del corpo, in ordine. */
  lines: string[];
}

/** «Su Google risultavano 2 spostate e 1 annullata, e l'app le ha allineate, tranne …». */
function differencesText(moved: number, cancelled: number): string {
  const n = moved + cancelled;
  if (n === 0) return "Nessuna differenza con Google.";
  const what: string[] = [];
  if (moved > 0) what.push(plural(moved, "spostata", "spostate"));
  if (cancelled > 0) what.push(plural(cancelled, "annullata", "annullate"));
  const head = `Su Google ${n === 1 ? "risultava" : "risultavano"} ${what.join(" e ")}`;
  if (moved === 0) return `${head}, e l'app ${n === 1 ? "l'ha aggiornata" : "le ha aggiornate"}.`;
  // Il server conta come spostata anche una sessione che si sovrapporrebbe a
  // un'altra e resta dov'era (reconcile_gcal_move esce senza errore).
  const done = n === 1 ? "l'ha allineata" : "le ha allineate";
  const unless =
    moved === 1
      ? "tranne se lo spostamento finirebbe sopra un'altra sessione: in quel caso resta all'orario di prima"
      : "tranne gli spostamenti che finirebbero sopra un'altra sessione: quelli restano all'orario di prima";
  return `${head}, e l'app ${done}, ${unless}.`;
}

function summaryLines(r: FullSync): string[] {
  const pull = r.reconcile;
  const lines: string[] = [];
  if (typeof pull.checked === "number") {
    lines.push(
      pull.checked === 1
        ? "Controllata 1 sessione in programma dal 1° gennaio."
        : `Controllate ${pull.checked} sessioni in programma dal 1° gennaio.`,
    );
  }
  lines.push(differencesText(pull.moved ?? 0, pull.cancelled ?? 0));
  if (r.repair.created > 0) lines.push(`${createdText(r.repair.created)} su Google.`);
  else if (r.repair.complete && r.repair.notCreated === 0)
    lines.push("Nessun evento da ricreare su Google.");
  else lines.push("Nessun evento ricreato su Google.");
  if (r.repair.notCreated > 0)
    lines.push(`${notCreatedText(r.repair.notCreated)}: riprova più tardi.`);
  const conflicts = pull.conflicts ?? 0;
  if (conflicts > 0) lines.push(`${conflictsText(conflicts)} per un errore: riprova più tardi.`);
  return lines;
}

function meanwhile(created: number): string[] {
  if (created === 0) return [];
  return [
    created === 1
      ? "Nel frattempo 1 evento è stato ricreato su Google."
      : `Nel frattempo ${created} eventi sono stati ricreati su Google.`,
  ];
}

/** L'esito della completa; vince il primo caso che vale. */
export function fullSyncOutcome(r: FullSync): FullSyncOutcome {
  const failed = "Sincronizzazione non riuscita";
  const pull = reconcileOutcome(r.reconcile);
  if (pull === "app") {
    return {
      kind: "app",
      tone: "danger",
      title: failed,
      lines: ["Non riesco a leggere le sessioni dell'app.", "Riprova più tardi."],
    };
  }
  if (pull === "google") {
    return {
      kind: "google",
      tone: "danger",
      title: failed,
      lines: [
        "Google Calendar non risponde: spostamenti e cancellazioni fatti su Google non sono stati controllati.",
        ...meanwhile(r.repair.created),
        "Riprova più tardi.",
      ],
    };
  }
  if (pull === "empty") {
    return {
      kind: "empty",
      tone: "danger",
      title: failed,
      lines: [
        "Google Calendar ha risposto senza eventi: per sicurezza nell'app non è cambiato niente.",
        ...meanwhile(r.repair.created),
        "Riprova più tardi.",
      ],
    };
  }
  // Anche le 20 passate finite, o una passata piena che non crea niente,
  // lasciano il ripristino a metà: non si sa quante ne restano.
  if (!r.repair.complete) {
    return {
      kind: "partial",
      tone: "warning",
      title: "Sincronizzazione completata in parte",
      lines: [
        "Non è stato possibile ricreare su Google tutti gli eventi mancanti.",
        ...summaryLines(r),
      ],
    };
  }
  const problems = r.repair.notCreated + (r.reconcile.conflicts ?? 0) > 0;
  if (problems) {
    return {
      kind: "problems",
      tone: "warning",
      title: "Sincronizzazione completata con qualche problema",
      lines: summaryLines(r),
    };
  }
  return {
    kind: "done",
    tone: "success",
    title: "Sincronizzazione completata",
    lines: summaryLines(r),
  };
}

/** Quello che la completa ha misurato di Google: l'esito della riconciliazione. */
export function fullSyncMeasure(r: FullSync): SyncOutcome {
  return reconcileOutcome(r.reconcile);
}
