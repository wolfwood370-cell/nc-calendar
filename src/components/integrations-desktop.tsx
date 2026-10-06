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
//   - La completa gira nel browser: mentre lavora la navigazione nell'app si
//     ferma, la chiusura della scheda chiede conferma e il desktop resta
//     montato anche se la finestra si stringe, fino a «Chiudi» dell'esito.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CoachPage } from "@/components/coach-page";
import {
  IntegrationsFullSyncCard,
  type FullSyncView,
} from "@/components/integrations-full-sync-card";
import { IntegrationsGcalCard } from "@/components/integrations-gcal-card";
import {
  GoogleOnlyList,
  MissingOnGoogleList,
  type GoogleOnlyRow,
  type MissingRow,
} from "@/components/integrations-gcal-lists";
import { IntegrationsImportDialog } from "@/components/integrations-import-dialog";
import { PageTitle } from "@/components/page-title";
import { gcalReviewKey, useGcalReviewEvents } from "@/hooks/use-gcal-review";
import {
  gcalSyncApi,
  notifySync,
  rememberSyncAttempt,
  rememberSyncOk,
  useGcalSync,
} from "@/hooks/use-gcal-sync";
import { useAuth } from "@/lib/auth";
import { gridMinutes, notOnGoogle } from "@/lib/calendar-events";
import { hasClientCredit } from "@/lib/cancel-session";
import { gcalImportEvent } from "@/lib/gcal.functions";
import {
  estimateFullSync,
  fullSyncBlockedText,
  fullSyncConfirmText,
  fullSyncDescription,
  gcalChip,
  googleOnlyEvents,
  importPayload,
  lastUpdateText,
  readFailureOutcome,
  type GcalMeasure,
  type ImportChoice,
  type ReviewEvent,
} from "@/lib/gcal-integration";
import {
  fullSyncMeasure,
  fullSyncOutcome,
  quickSyncMessage,
  quickSyncOutcome,
  runFullSync,
} from "@/lib/gcal-sync-run";
import { sessionLabel } from "@/lib/mock-data";
import {
  BOOKINGS_FETCH_LIMIT,
  useCoachBookings,
  useCoachClients,
  useCoachEventTypes,
  type BookingRow,
} from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { supabaseSessionStore } from "@/lib/session-store";
import { formatShortDay, formatTimeRange } from "@/lib/session-time";
import { countToAssign } from "@/lib/to-assign";
import { cn, errorMessage } from "@/lib/utils";

const CARD =
  "flex min-w-0 flex-col rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]";

/** Quale scrittura verso Google è in corso. */
type Busy = "sync" | "full" | "import" | `repair:${string}` | null;

export function IntegrationsDesktop({
  onHoldChange,
}: {
  /** true dall'avvio della completa a «Chiudi»: la route tiene montato il desktop. */
  onHoldChange?: (hold: boolean) => void;
}) {
  const { user } = useAuth();
  const coachId = user?.id;
  const qc = useQueryClient();
  const bookingsQ = useCoachBookings(coachId);
  const clientsQ = useCoachClients(coachId);
  const typesQ = useCoachEventTypes(coachId);
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
  // Una lettura si riconosce dalla sua ora (l'effetto qui sotto la rivede a
  // ogni render); ogni sincronizzazione è una misura sua, anche se finisce
  // nello stesso millisecondo di un'altra: a parità d'ora vince l'ultima.
  const addMeasure = useCallback((m: GcalMeasure) => {
    setMeasures((prev) =>
      m.kind === "read" && prev.some((x) => x.kind === "read" && x.at === m.at)
        ? prev
        : [...prev, m],
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
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const eventTypes = useMemo(() => typesQ.data ?? [], [typesQ.data]);
  const assignCount = bookings ? countToAssign(bookings) : null;
  const missing = useMemo(() => (bookings ? notOnGoogle(bookings, now) : null), [bookings, now]);

  // Come il Calendario (calendar-desktop.tsx): «Cliente · Tipologia», «giorno · ora».
  const missingRows: MissingRow[] = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const typeById = new Map(eventTypes.map((t) => [t.id, t]));
    const typeName = (b: BookingRow) =>
      (b.event_type_id ? typeById.get(b.event_type_id)?.name : undefined) ??
      sessionLabel(b.session_type);
    const clientName = (id: string | null) => {
      const c = id ? clientById.get(id) : undefined;
      return c?.full_name ?? c?.email ?? "Cliente";
    };
    return (missing ?? []).map((b) => {
      const start = new Date(b.scheduled_at);
      const type = b.event_type_id ? typeById.get(b.event_type_id) : undefined;
      return {
        id: b.id,
        name: hasClientCredit(b)
          ? `${clientName(b.client_id)} · ${typeName(b)}`
          : b.title?.trim() || typeName(b),
        when: `${formatShortDay(start)} · ${formatTimeRange(start, gridMinutes(b, type?.duration))}`,
      };
    });
  }, [missing, clients, eventTypes]);

  // Eventi della lettura che non sono di nessuna sessione, a sessioni lette.
  const googleOnly = useMemo(
    () => (bookings && reviewQ.data ? googleOnlyEvents(reviewQ.data, bookings) : []),
    [bookings, reviewQ.data],
  );
  const googleOnlyRows: GoogleOnlyRow[] = googleOnly.map((e) => ({
    id: e.id,
    title: e.summary || "(senza titolo)",
    when: eventWhen(e),
  }));

  // ------------------------------------------------------------ Ricrea su Google
  // Come il Calendario, senza «Ripristina». createGoogleEvent manda l'invito al cliente.
  async function repair(id: string) {
    await exclusive(`repair:${id}`, async () => {
      try {
        const ok = await supabaseSessionStore.createGoogleEvent(id);
        if (ok) toast.success("Evento ricreato su Google Calendar.");
        else toast.error("Non è stato possibile ricrearlo su Google Calendar. Riprova.");
      } catch {
        toast.error("Non è stato possibile ricrearlo su Google Calendar. Riprova.");
      } finally {
        void qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      }
    });
  }

  // ------------------------------------------------------------ completa
  const [full, setFull] = useState<FullSyncView>({ state: "idle" });
  // Le sessioni lette arrivano al tetto: la stima può essere per difetto (passata 11).
  const truncated = !!bookings && bookings.length >= BOOKINGS_FETCH_LIMIT;
  const estimate = bookings ? estimateFullSync(bookings, now, truncated) : null;

  async function startFull() {
    const refused = fullSyncBlockedText(chip);
    if (refused) {
      toast.warning(refused);
      return;
    }
    await exclusive("full", async () => {
      const startedAt = new Date();
      // M: la parte del ripristino della stima, per «X di M».
      const m = bookings ? estimateFullSync(bookings, startedAt).repair : 0;
      setFull({ state: "running", step: { phase: "repair", done: 0, total: m } });
      const r = await runFullSync(gcalSyncApi, {
        now: startedAt,
        repairEstimate: m,
        onProgress: (step) => setFull({ state: "running", step }),
      });
      const measure = fullSyncMeasure(r);
      if (measure === "ok") rememberSyncOk();
      markSynced();
      rememberSyncAttempt();
      addMeasure({ kind: "full", at: Date.now(), outcome: measure });
      refreshAfterSync();
      setFull({ state: "done", outcome: fullSyncOutcome(r) });
    });
  }

  const running = full.state === "running";
  const runningRef = useRef(running);
  runningRef.current = running;
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (!runningRef.current || current.pathname === next.pathname) return false;
      toast.warning("Attendi la fine della sincronizzazione completa.", { id: "full-sync-wait" });
      return true;
    },
    enableBeforeUnload: () => runningRef.current,
  });
  const hold = full.state !== "idle";
  useEffect(() => onHoldChange?.(hold), [hold, onHoldChange]);

  // ------------------------------------------------------------ Importa
  const [importTarget, setImportTarget] = useState<ReviewEvent | null>(null);
  async function confirmImport(choice: ImportChoice) {
    const target = importTarget;
    if (!target) return;
    if (choice.mode === "client" && !choice.clientId) {
      toast.error("Seleziona un cliente.");
      return;
    }
    await exclusive("import", async () => {
      try {
        const r = await gcalImportEvent({ data: importPayload(target, choice, Date.now()) });
        if (!r.ok) {
          toast.error("Importazione non riuscita", { description: r.error });
          return;
        }
        toast.success(
          r.alreadyImported ? "L'evento era già nell'app." : "Evento importato nell'app.",
        );
        setImportTarget(null);
        void qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
        void qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
        void qc.invalidateQueries({ queryKey: gcalReviewKey(coachId) });
      } catch (e) {
        toast.error("Importazione non riuscita", { description: errorMessage(e) });
      }
    });
  }

  return (
    <CoachPage>
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
            >
              <MissingOnGoogleList
                rows={missingRows}
                busyId={busy?.startsWith("repair:") ? busy.slice("repair:".length) : null}
                disabled={busy !== null}
                onRepair={(id) => void repair(id)}
              />
              <GoogleOnlyList
                rows={googleOnlyRows}
                disabled={busy !== null}
                onImport={(id) => setImportTarget(googleOnly.find((e) => e.id === id) ?? null)}
              />
            </IntegrationsGcalCard>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <IntegrationsFullSyncCard
              view={full}
              description={fullSyncDescription(now)}
              confirmText={fullSyncConfirmText(
                estimate ? estimate.total : null,
                estimate?.partial ?? false,
              )}
              disabled={busy !== null}
              onStart={() => void startFull()}
              onDismiss={() => setFull({ state: "idle" })}
            />
            <section className={cn(CARD, "gap-3")} aria-labelledby="stripe-title">
              <div className="flex items-center gap-3.5">
                <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#635bff] text-white">
                  <CreditCard className="size-6" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="stripe-title" className="card-title text-on-surface">
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

      <IntegrationsImportDialog
        target={importTarget}
        when={importTarget ? eventWhen(importTarget) : ""}
        clients={clients}
        eventTypes={eventTypes}
        submitting={busy === "import"}
        disabled={busy !== null && busy !== "import"}
        onConfirm={(choice) => void confirmImport(choice)}
        onClose={() => setImportTarget(null)}
      />
    </CoachPage>
  );
}

/** «ven 25 set · 10:00–11:00» di un evento di Google. */
function eventWhen(e: ReviewEvent): string {
  if (e.startMs === null) return "—";
  const start = new Date(e.startMs);
  const minutes = e.endMs !== null ? Math.round((e.endMs - e.startMs) / 60_000) : null;
  return `${formatShortDay(start)} · ${formatTimeRange(start, minutes)}`;
}
