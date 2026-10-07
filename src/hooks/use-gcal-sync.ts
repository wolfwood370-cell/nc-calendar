// ----------------------------------------------------------------------------
// Sincronizzazione con Google Calendar (estratta da trainer.calendar.tsx, passata 04)
// ----------------------------------------------------------------------------
// La logica sta in lib/gcal-sync-run.ts (passata 09); qui le chiamate vere al
// server, le chiavi di questo browser e i toast:
//   1. Google -> app (gcalReconcileEvents): allinea le sessioni agli eventi
//      Google (cancellazioni/spostamenti fatti direttamente su Google).
//   2. app -> Google (gcalRepairMissingEvents): RETE DI SICUREZZA. Ricrea
//      gli eventi Google mancanti (booking con google_event_id NULL), p.es.
//      quando la creazione per-booking client-side e' fallita.
// All'apertura del Calendario riconcilia una volta, con throttle (max 1 ogni
// 10 min) per non interrogare Google a ogni navigazione; Integrazioni usa la
// stessa rapida senza l'apertura. Un toast solo se qualcosa è cambiato: chi
// sincronizza a mano dice anche il resto (notifySync).
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { gcalReconcileEvents, gcalRepairMissingEvents } from "@/lib/gcal.functions";
import {
  fullSyncMeasure,
  fullSyncOutcome,
  quickSyncMessage,
  quickSyncNeedsNotice,
  runFullSync,
  runQuickSync,
  type GcalSyncApi,
  type QuickSync,
  type SyncTone,
} from "@/lib/gcal-sync-run";
import { parseSyncStamp } from "@/lib/gcal-sync-status";
import { queryKeys } from "@/lib/query-keys";

/** Il freno dei 10 minuti: conta i tentativi, si scrive prima di riconciliare. */
const LAST_SYNC_KEY = "gcal_reconcile_last";

/**
 * gcal_reconcile_ok: l'ora dell'ultima sincronizzazione riuscita da questo
 * browser (passata 08). La leggono la pillola della Disponibilità,
 * l'etichetta del Calendario e «Ultimo aggiornamento» di Integrazioni.
 * Riuscita vuol dire ok e niente lista vuota di Google (passata 09).
 */
export const LAST_SYNC_OK_KEY = "gcal_reconcile_ok";

/** Le chiamate vere al server; senza finestra la riconciliazione usa la sua. */
export const gcalSyncApi: GcalSyncApi = {
  reconcile: (window) => (window ? gcalReconcileEvents({ data: window }) : gcalReconcileEvents()),
  repair: () => gcalRepairMissingEvents(),
};

export function rememberSyncOk(at: number = Date.now()) {
  try {
    localStorage.setItem(LAST_SYNC_OK_KEY, String(at));
  } catch {
    /* noop */
  }
}

/** L'ultima sincronizzazione riuscita da questo browser, o null. */
export function readSyncOk(): number | null {
  try {
    return parseSyncStamp(localStorage.getItem(LAST_SYNC_OK_KEY));
  } catch {
    return null;
  }
}

export function rememberSyncAttempt(at: number = Date.now()) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(at));
  } catch {
    /* noop */
  }
}

/** Un esito come toast; con `id` sostituisce un toast di caricamento. */
export function notifySync(
  m: { tone: SyncTone; title: string; description?: string },
  id?: string | number,
) {
  const opts = { description: m.description, ...(id !== undefined ? { id } : {}) };
  if (m.tone === "danger") toast.error(m.title, opts);
  else if (m.tone === "warning") toast.warning(m.title, opts);
  else if (m.tone === "success") toast.success(m.title, opts);
  else toast.info(m.title, opts);
}

export interface GcalSync {
  /** Ultima sincronizzazione riuscita da questo browser (gcal_reconcile_ok), null se mai. */
  lastSyncAt: number | null;
  /** Rilegge gcal_reconcile_ok: non inventa un'ora. */
  markSynced: () => void;
  /** La rapida; dice da sé solo quando qualcosa è cambiato. */
  runReconcile: () => Promise<QuickSync>;
}

export interface GcalSyncOptions {
  /** false: niente riconciliazione all'apertura (Integrazioni). */
  auto?: boolean;
}

export function useGcalSync(coachId: string | undefined, opts: GcalSyncOptions = {}): GcalSync {
  const auto = opts.auto ?? true;
  const qc = useQueryClient();
  // Defer localStorage read to useEffect — leggerlo nell'initializer di
  // useState provoca un hydration mismatch quando il valore esiste solo
  // sul client.
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  useEffect(() => {
    setLastSyncAt(readSyncOk());
  }, []);

  const runReconcile = useCallback(async (): Promise<QuickSync> => {
    const r = await runQuickSync(gcalSyncApi);
    if (r.ok) {
      const at = Date.now();
      rememberSyncOk(at);
      setLastSyncAt(at);
    } else {
      console.error("gcalReconcile (calendar) failed", r.failure);
    }
    // Anche con le sole sovrapposizioni (passata 13): nell'app non cambia
    // niente, ma Google e l'app restano diversi e il coach deve saperlo.
    if (quickSyncNeedsNotice(r)) {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
      notifySync(quickSyncMessage(r));
    }
    return r;
  }, [qc, coachId]);

  useEffect(() => {
    if (!auto || !coachId) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_SYNC_KEY) ?? "0");
    } catch {
      /* storage non disponibile: si sincronizza */
    }
    if (Date.now() - last < 10 * 60_000) return;
    rememberSyncAttempt();
    void runReconcile();
  }, [auto, coachId, runReconcile]);

  const markSynced = useCallback(() => setLastSyncAt(readSyncOk()), []);

  return { lastSyncAt, markSynced, runReconcile };
}

/**
 * Sincronizzazione completa del telefono, coi toast: ripristino dal 1°
 * gennaio 2026 e riconciliazione dal 1° gennaio dell'anno a +90 giorni
 * (lib/gcal-sync-run.ts). Il desktop ha la sua in Integrazioni, con fasi e
 * avanzamento, sulla stessa logica.
 */
export function useGcalForceSync(coachId: string | undefined, onSynced?: () => void) {
  const qc = useQueryClient();
  const [forceSyncing, setForceSyncing] = useState(false);
  const runForceSync = useCallback(async () => {
    if (forceSyncing) return;
    setForceSyncing(true);
    const tId = toast.loading("Sincronizzazione completa in corso…", {
      description: "Allineamento dal 1° gennaio con Google Calendar",
    });
    try {
      const r = await runFullSync(gcalSyncApi, { now: new Date(), repairEstimate: 0 });
      if (fullSyncMeasure(r) === "ok") rememberSyncOk();
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
      onSynced?.();
      rememberSyncAttempt();
      const o = fullSyncOutcome(r);
      notifySync({ tone: o.tone, title: o.title, description: o.lines.join(" ") }, tId);
    } catch (e) {
      console.error("forceSync failed", e);
      toast.error("Sincronizzazione fallita", {
        id: tId,
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setForceSyncing(false);
    }
  }, [forceSyncing, qc, coachId, onSynced]);
  return { forceSyncing, runForceSync };
}
