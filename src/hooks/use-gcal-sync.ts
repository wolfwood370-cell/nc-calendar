// ----------------------------------------------------------------------------
// Sincronizzazione con Google Calendar (estratta da trainer.calendar.tsx, passata 04)
// ----------------------------------------------------------------------------
// Stesso comportamento di prima, spostato qui perché ora la usano il
// Calendario (desktop e mobile) e Integrazioni:
//   1. Google -> app (gcalReconcileEvents): allinea le sessioni agli eventi
//      Google (cancellazioni/spostamenti fatti direttamente su Google).
//   2. app -> Google (gcalRepairMissingEvents): RETE DI SICUREZZA. Ricrea
//      gli eventi Google mancanti (booking con google_event_id NULL), p.es.
//      quando la creazione per-booking client-side e' fallita. Idempotente,
//      tutto derivato server-side. Mostra un toast solo se qualcosa e' cambiato.
// All'apertura riconcilia una volta, con throttle (max 1 ogni 10 min) per non
// interrogare Google a ogni navigazione.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { gcalReconcileEvents, gcalRepairMissingEvents } from "@/lib/gcal.functions";
import { queryKeys } from "@/lib/query-keys";

const LAST_SYNC_KEY = "gcal_reconcile_last";

export interface GcalSync {
  /** Ultima sincronizzazione nota (localStorage), null se mai. */
  lastSyncAt: number | null;
  markSynced: () => void;
  /** true se qualcosa è cambiato. */
  runReconcile: () => Promise<boolean>;
}

export function useGcalSync(coachId: string | undefined): GcalSync {
  const qc = useQueryClient();
  // Defer localStorage read to useEffect — leggerlo nell'initializer di
  // useState provoca un hydration mismatch quando il valore esiste solo
  // sul client.
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    if (raw) setLastSyncAt(Number(raw));
  }, []);

  const runReconcile = useCallback(async (): Promise<boolean> => {
    try {
      const [pull, push] = await Promise.all([gcalReconcileEvents(), gcalRepairMissingEvents()]);
      const changed =
        (pull.ok && ((pull.cancelled ?? 0) > 0 || (pull.moved ?? 0) > 0)) ||
        (push.ok && (push.created ?? 0) > 0);
      if (changed) {
        qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
        qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
        const parts: string[] = [];
        if (pull.ok && pull.cancelled) parts.push(`${pull.cancelled} annullata/e`);
        if (pull.ok && pull.moved) parts.push(`${pull.moved} spostata/e`);
        if (push.ok && push.created) parts.push(`${push.created} aggiunta/e su Google`);
        toast.info("Sincronizzato con Google Calendar", { description: parts.join(" · ") });
      }
      return changed;
    } catch (e) {
      console.error("gcalReconcile (calendar) failed", e);
      return false;
    }
  }, [qc, coachId]);

  useEffect(() => {
    if (!coachId) return;
    const last = Number(localStorage.getItem(LAST_SYNC_KEY) ?? "0");
    if (Date.now() - last < 10 * 60_000) return;
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    void runReconcile();
  }, [coachId, runReconcile]);

  const markSynced = useCallback(() => setLastSyncAt(Date.now()), []);

  return { lastSyncAt, markSynced, runReconcile };
}

/**
 * Forza sync completo dal 1° gennaio dell'anno corrente -> +90g.
 * Allinea TUTTE le sessioni storiche dell'anno con lo stato attuale del
 * Google Calendar condiviso (spostamenti / annullamenti fatti su Google).
 * Esegue anche il repair DB->Google per ricreare eventuali eventi mancanti.
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
      const yearStart = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
      const yearMax = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString();
      // Repair (DB -> Google) gira a passate da 50 finché non resta nulla.
      let totalCreated = 0;
      let safety = 20;
      while (safety-- > 0) {
        const r = await gcalRepairMissingEvents();
        if (!r.ok) break;
        totalCreated += r.created ?? 0;
        if ((r.total ?? 0) === 0) break;
      }
      // Reconcile (Google -> DB) sull'intero range annuale, in un colpo.
      const pull = await gcalReconcileEvents({
        data: { timeMinISO: yearStart, timeMaxISO: yearMax },
      });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
      onSynced?.();
      try {
        localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      } catch {
        /* noop */
      }
      const parts: string[] = [];
      if (pull.ok && (pull.cancelled ?? 0) > 0) parts.push(`${pull.cancelled} annullate`);
      if (pull.ok && (pull.moved ?? 0) > 0) parts.push(`${pull.moved} spostate`);
      if (totalCreated > 0) parts.push(`${totalCreated} create su Google`);
      toast.success("Sincronizzazione completata", {
        id: tId,
        description: parts.length ? parts.join(" · ") : "Tutto già allineato",
      });
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
