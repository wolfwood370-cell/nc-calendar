// ----------------------------------------------------------------------------
// Ripristino e riconciliazione con Google: la logica senza rete (passata 11)
// ----------------------------------------------------------------------------
// Le funzioni del server (gcal.functions.ts) passano qui le loro chiamate al
// database e a Google, così le regole si provano in vitest senza il server.
//
//   - collectRepairCandidates: le sessioni a cui ridare l'evento, al massimo
//     `want`, scartando i giornalieri. Prima il server ne leggeva 50 e poi
//     scartava i giornalieri: una pagina piena poteva diventare di 47, e la
//     completa la prendeva per l'ultima (gcal-sync-run.ts, `complete`); e i
//     giornalieri, che un evento non lo ricevono mai, restavano in testa a
//     ogni passata. Ora si legge a pagine finché se ne trovano `want` o le
//     sessioni finiscono; `more` dice che il giro si è fermato al tetto di
//     pagine con altre righe da leggere.
//   - writeBackEventId: l'id dell'evento appena creato si scrive solo se la
//     sessione non ne ha già uno (due ripristini da due schede). Chi arriva
//     secondo toglie da Google il proprio evento, in silenzio, e non lo conta
//     come creato. Con un errore della scrittura si rilegge la riga, perché
//     l'errore può essere ambiguo (la risposta persa con la scrittura già
//     fatta): l'id nostro vuol dire scritto; un altro id, che ha vinto un
//     altro; l'id vuoto, che la scrittura non c'è, e il nostro evento si
//     toglie, perché alla passata dopo ne nascerebbe un secondo. Se anche la
//     rilettura fallisce non si toglie niente: una sessione legata a un evento
//     cancellato la riconciliazione la annullerebbe (gcalList legge anche gli
//     eventi cancellati), un doppione no. Prima la scrittura non guardava né
//     l'id già scritto né l'errore.
//   - reconcileWith: gli annullamenti e gli spostamenti trovati su Google.
//     Un annullamento non riuscito si conta fra le sessioni non aggiornate,
//     come uno spostamento non riuscito; prima non lo contava nessuno.
// ----------------------------------------------------------------------------

import { isAllDayEvent } from "@/lib/all-day-event";

/** Quante sessioni tratta una passata del ripristino (REPAIR_PAGE in gcal-sync-run.ts). */
export const REPAIR_WANT = 50;
/**
 * Il ripristino lascia stare le sessioni create da meno di cinque minuti: la
 * prenotazione crea il suo evento da sé (gcalCreateEvent, con l'invito al
 * cliente), e il ripristino partito negli stessi secondi ne creerebbe un
 * secondo, in silenzio (passata 11).
 */
export const REPAIR_MIN_AGE_MS = 5 * 60_000;
/** Righe lette per pagina, e il tetto di pagine di una passata. */
export const REPAIR_SCAN_PAGE = 100;
export const REPAIR_SCAN_MAX_PAGES = 20;

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

export interface Candidates<T> {
  rows: T[];
  /** Il giro si è fermato al tetto di pagine e ci sono altre righe da leggere. */
  more: boolean;
  error: unknown;
}

/**
 * Le prime `want` sessioni non giornaliere, nell'ordine delle pagine.
 * `fetchPage(from, to)` legge le righe da `from` a `to` compresi (il range di
 * PostgREST).
 */
export async function collectRepairCandidates<T extends { scheduled_at: string }>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  want = REPAIR_WANT,
  pageSize = REPAIR_SCAN_PAGE,
  maxPages = REPAIR_SCAN_MAX_PAGES,
): Promise<Candidates<T>> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { rows: [], more: false, error };
    const list = data ?? [];
    for (const r of list) {
      if (isAllDayEvent(r)) continue;
      rows.push(r);
      if (rows.length === want) return { rows, more: false, error: null };
    }
    if (list.length < pageSize) return { rows, more: false, error: null };
  }
  return { rows, more: true, error: null };
}

export type WritebackOutcome = "written" | "taken" | "failed";

export interface WritebackDeps {
  /** L'id dell'evento appena creato. */
  createdId: string;
  /**
   * Scrive l'id solo dove google_event_id è ancora vuoto e restituisce le
   * righe scritte (`.is("google_event_id", null).select("id")`).
   */
  writeIfEmpty: () => Promise<{ data: unknown[] | null; error: unknown }>;
  /** Rilegge google_event_id della sessione (null se è vuoto). */
  readId: () => Promise<{ data: { google_event_id: string | null } | null; error: unknown }>;
  /** Toglie da Google l'evento appena creato, senza avvisare nessuno. */
  deleteCreated: () => Promise<unknown>;
}

/** "kept": scrittura incerta e rilettura fallita, l'evento resta su Google (al peggio un doppione). */
export type WritebackResult = WritebackOutcome | "kept";

async function removeCreated(deps: WritebackDeps): Promise<void> {
  try {
    await deps.deleteCreated();
  } catch {
    // Google non risponde: resta un evento in più, come prima di questa
    // regola. Il chiamante lo scrive nei log.
  }
}

export async function writeBackEventId(deps: WritebackDeps): Promise<WritebackResult> {
  try {
    const { data, error } = await deps.writeIfEmpty();
    if (!error) {
      if ((data ?? []).length > 0) return "written";
      await removeCreated(deps);
      return "taken";
    }
  } catch {
    // come un errore: si rilegge
  }
  // Un errore può essere ambiguo (la risposta persa con la scrittura fatta).
  let current: string | null;
  try {
    const { data, error } = await deps.readId();
    if (error) return "kept";
    current = data?.google_event_id ?? null;
  } catch {
    return "kept";
  }
  if (current === deps.createdId) return "written";
  await removeCreated(deps);
  return current === null ? "failed" : "taken";
}

export interface ReconcileEvent {
  id: string;
  status: string;
  startMs: number | null;
}

export interface ReconcileCounts {
  cancelled: number;
  moved: number;
  /** Sessioni non aggiornate per un errore: spostamenti e annullamenti. */
  conflicts: number;
}

export interface ReconcileDeps {
  cancel: (bookingId: string) => Promise<{ error: unknown }>;
  move: (bookingId: string, newStartISO: string) => Promise<{ error: unknown }>;
  logError?: (what: string, detail: unknown) => void;
}

export async function reconcileWith(
  events: readonly ReconcileEvent[],
  byEventId: ReadonlyMap<string, { id: string; scheduledMs: number }>,
  deps: ReconcileDeps,
): Promise<ReconcileCounts> {
  let cancelled = 0;
  let moved = 0;
  let conflicts = 0;
  for (const ev of events) {
    const booking = byEventId.get(ev.id);
    if (!booking) continue; // evento Google non abbinato a una sessione: niente import
    if (ev.status === "cancelled") {
      const { error } = await deps.cancel(booking.id);
      if (error) {
        deps.logError?.("reconcile_gcal_cancel failed", { id: booking.id, error });
        conflicts++;
      } else {
        cancelled++;
      }
      continue;
    }
    // Spostamento: confronto sugli istanti, tolleranza 60 secondi.
    if (ev.startMs !== null && Number.isFinite(booking.scheduledMs)) {
      if (Math.abs(ev.startMs - booking.scheduledMs) > 60_000) {
        const { error } = await deps.move(booking.id, new Date(ev.startMs).toISOString());
        if (error) {
          deps.logError?.("reconcile_gcal_move failed", { id: booking.id, error });
          conflicts++;
        } else {
          moved++;
        }
      }
    }
  }
  return { cancelled, moved, conflicts };
}

/**
 * Il 1° gennaio dell'anno di `now`, l'inizio della finestra della completa e
 * del ripristino (passata 11: prima il ripristino partiva dal 1° gennaio 2026
 * fisso, e dal 2027 le due finestre non avrebbero più coinciso).
 */
export function yearStartISO(now: Date): string {
  return `${now.getFullYear()}-01-01T00:00:00.000Z`;
}
