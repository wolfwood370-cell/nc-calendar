// ----------------------------------------------------------------------------
// Integrazioni desktop (passata 09)
// ----------------------------------------------------------------------------
// Brief design_handoff_coach_redesign/passes/09-integrazioni.md, prototipo
// designs/Coach Integrazioni.dc.html. Da md in su; il telefono resta la
// pagina di prima (integrations-mobile.tsx).
//   - Il chip di Google dice l'esito dell'ultima misura fatta da questa
//     pagina (gcalChip in gcal-integration.ts): la lettura degli eventi
//     all'apertura, «Sincronizza ora», la completa. Mai «Collegato» senza
//     una risposta di Google.
//   - All'apertura la pagina legge soltanto; la riconciliazione automatica
//     resta del Calendario (useGcalSync con auto: false).
//   - Una scrittura verso Google alla volta: le azioni della pagina
//     condividono lo stato «occupato». Due ripristini insieme possono creare
//     due eventi per la stessa sessione.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IntegrationsGcalCard } from "@/components/integrations-gcal-card";
import { PageTitle } from "@/components/page-title";
import { gcalReviewKey, useGcalReviewEvents } from "@/hooks/use-gcal-review";
import { notifySync, rememberSyncAttempt, useGcalSync } from "@/hooks/use-gcal-sync";
import { useAuth } from "@/lib/auth";
import { notOnGoogle } from "@/lib/calendar-events";
import {
  gcalChip,
  lastUpdateText,
  readFailureOutcome,
  type GcalMeasure,
} from "@/lib/gcal-integration";
import { quickSyncMessage, quickSyncOutcome } from "@/lib/gcal-sync-run";
import { useCoachBookings } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { countToAssign } from "@/lib/to-assign";
import { cn } from "@/lib/utils";

const CARD =
  "flex min-w-0 flex-col rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]";

/** Quale scrittura verso Google è in corso. */
type Busy = "sync" | "full" | "import" | `repair:${string}` | null;

export function IntegrationsDesktop() {
  const { user } = useAuth();
  const coachId = user?.id;
  const qc = useQueryClient();
  const bookingsQ = useCoachBookings(coachId);
  const reviewQ = useGcalReviewEvents(coachId, { fresh: true });
  const sync = useGcalSync(coachId, { auto: false });
  const { markSynced } = sync;

  const [openedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => new Date(openedAt));
  // gcal_reconcile_ok si legge in un effect (use-gcal-sync.ts): fino ad
  // allora «Ultimo aggiornamento» non dice «mai».
  const [storageRead, setStorageRead] = useState(false);
  useEffect(() => {
    setStorageRead(true);
    // Ogni minuto: l'ora che scorre e l'ultimo successo, anche da altre schede.
    const t = window.setInterval(() => {
      setNow(new Date());
      markSynced();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [markSynced]);

  // ------------------------------------------------------------ misure
  const [measures, setMeasures] = useState<GcalMeasure[]>([]);
  const addMeasure = useCallback((m: GcalMeasure) => {
    setMeasures((prev) =>
      prev.some((x) => x.kind === m.kind && x.at === m.at) ? prev : [...prev, m],
    );
  }, []);
  // Ogni lettura finita è una risposta; quale conta lo decide gcalChip.
  useEffect(() => {
    if (reviewQ.fetchStatus !== "idle") return;
    if (reviewQ.status === "error" && reviewQ.errorUpdatedAt > 0) {
      addMeasure({
        kind: "read",
        at: reviewQ.errorUpdatedAt,
        outcome: readFailureOutcome(reviewQ.error),
      });
    } else if (reviewQ.status === "success" && reviewQ.dataUpdatedAt > 0) {
      addMeasure({ kind: "read", at: reviewQ.dataUpdatedAt, outcome: "ok" });
    }
  }, [
    reviewQ.fetchStatus,
    reviewQ.status,
    reviewQ.error,
    reviewQ.errorUpdatedAt,
    reviewQ.dataUpdatedAt,
    addMeasure,
  ]);
  const chip = useMemo(() => gcalChip(measures, openedAt), [measures, openedAt]);

  // ------------------------------------------------------------ occupato
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef<Busy>(null);
  const exclusive = useCallback(async (what: Exclude<Busy, null>, task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = what;
    setBusy(what);
    try {
      await task();
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, []);

  const refreshAfterSync = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
    // Solo per gli elenchi: una rilettura non è una misura (gcalChip).
    void qc.invalidateQueries({ queryKey: gcalReviewKey(coachId) });
  }, [qc, coachId]);

  // ------------------------------------------------------------ Sincronizza ora
  // Come il Calendario: riconciliazione della finestra di default e
  // ripristino insieme, con la chiave dei tentativi scritta prima.
  async function syncNow() {
    await exclusive("sync", async () => {
      rememberSyncAttempt();
      const r = await sync.runReconcile();
      addMeasure({ kind: "sync", at: Date.now(), outcome: quickSyncOutcome(r) });
      // Con modifiche il messaggio lo dà già runReconcile.
      if (!r.changed) notifySync(quickSyncMessage(r));
      refreshAfterSync();
    });
  }

  // ------------------------------------------------------------ caselle
  const bookings = bookingsQ.data;
  const assignCount = bookings ? countToAssign(bookings) : null;
  const missing = useMemo(() => (bookings ? notOnGoogle(bookings, now) : null), [bookings, now]);

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] min-w-0 bg-surface px-10 pb-12 pt-7 text-on-surface">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex max-w-[680px] flex-col gap-1.5">
          <PageTitle className="m-0">Integrazioni</PageTitle>
          <p className="text-[15px] leading-normal text-on-surface-variant">
            I servizi collegati a NC Calendar sono configurati per tutto lo studio. Qui ne vedi lo
            stato e tieni allineato Google Calendar.
          </p>
        </div>

        <div className="grid max-w-[1200px] grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start gap-5">
          <div className="flex min-w-0 flex-col gap-5">
            <IntegrationsGcalCard
              chip={chip}
              syncing={busy === "sync"}
              disabled={busy !== null}
              onSyncNow={() => void syncNow()}
              lastUpdate={storageRead ? lastUpdateText(sync.lastSyncAt, now) : "—"}
              assignCount={assignCount}
              missingCount={missing ? missing.length : null}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <section className={cn(CARD, "gap-3")} aria-labelledby="stripe-title">
              <div className="flex items-center gap-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#635bff] text-white">
                  <CreditCard className="size-6" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="stripe-title" className="text-xl font-semibold text-on-surface">
                      Pagamenti · Stripe
                    </h2>
                    <span className="rounded-full bg-surface-container px-2.5 py-[3px] text-[11px] font-bold text-on-surface-variant">
                      Gestito dallo studio
                    </span>
                  </div>
                  <p className="text-[13px] text-on-surface-variant">
                    I clienti pagano i Booster online con la carta.
                  </p>
                </div>
              </div>
              <p className="text-[13px] leading-normal text-outline">
                Non serve nessuna azione da parte tua. I crediti acquistati si aggiungono in
                automatico a quelli del cliente.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
