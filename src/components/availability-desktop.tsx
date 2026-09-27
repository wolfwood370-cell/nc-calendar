// ----------------------------------------------------------------------------
// Disponibilità desktop (passata 08)
// ----------------------------------------------------------------------------
// Da md in su. Il telefono resta la pagina di prima (availability-mobile.tsx).
//   - La bozza della settimana nasce solo da una lettura fatta dopo
//     l'apertura della pagina, non dalla cache. Finché non la modifichi si
//     riallinea alle letture nuove; da quando la modifichi una rilettura in
//     background non la sovrascrive più.
//   - Se la lettura fallisce la card lo dice e non c'è niente da salvare:
//     salvare una settimana vuota cancellerebbe tutti gli orari.
//   - Salvataggio dalla barra in basso con saveWeek (availability-actions.ts):
//     rilegge, scrive solo quello che cambia, prima inserisce e poi cancella.
//   - Uscire con orari non salvati chiede conferma, come nel Profilo.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AvailabilityExceptionsDesktop } from "@/components/availability-exceptions-desktop";
import { AvailabilityPreviewCard, BookingRulesCard } from "@/components/availability-preview-card";
import { AvailabilityWeekCard } from "@/components/availability-week-card";
import {
  CoachAlertDialog,
  CoachAlertDialogCancel,
  CoachAlertDialogContent,
  CoachAlertDialogDescription,
  CoachAlertDialogTitle,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { GcalSyncPill } from "@/components/gcal-sync-pill";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekSaveIncompleteError, saveWeek, slotsOfRows } from "@/lib/availability-actions";
import { supabaseAvailabilityStore } from "@/lib/availability-store";
import {
  changedDays,
  dirtyLabel,
  weekErrors,
  weekFromRows,
  weekSlots,
  type WeekDraft,
} from "@/lib/availability-week";
import { useAuth } from "@/lib/auth";
import { useCoachAvailability, useCoachEventTypes, type AvailabilityRow } from "@/lib/queries";
import { toastWithUndo } from "@/lib/toast";
import { cn, errorMessage } from "@/lib/utils";

const CARD =
  "flex min-w-0 flex-col rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]";

// Una scrittura dell'orario alla volta, anche fra «Ripristina» di un toast e
// «Salva orari» (e fra due montaggi della pagina): saveWeek rilegge e poi
// scrive, e due giri intrecciati lascerebbero nel database le due settimane
// insieme.
let weekWrites: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = weekWrites.then(task, task);
  weekWrites = run.catch(() => undefined);
  return run;
}

function sortRows(rows: readonly AvailabilityRow[]): AvailabilityRow[] {
  return [...rows].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}

export function AvailabilityDesktop({
  onHoldChange,
}: {
  /** true finché ci sono orari non salvati: la route tiene montato il desktop. */
  onHoldChange?: (hold: boolean) => void;
}) {
  const { user } = useAuth();
  const meId = user?.id;
  const qc = useQueryClient();
  const availabilityKey = useMemo(() => ["trainer_availability", meId], [meId]);

  // --------------------------------------------------------------- orario
  const availQ = useCoachAvailability(meId, { fresh: true });
  const [openedAt] = useState(() => Date.now());
  // «Adesso» avanza: sessioni cominciate e periodi finiti escono da soli.
  const [now, setNow] = useState(() => new Date(openedAt));
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  // Solo una lettura fatta dopo l'apertura: la cache può essere vecchia di
  // minuti, e una rilettura fallita lascia in cache il dato di prima.
  const fresh =
    availQ.isFetchedAfterMount && availQ.data !== undefined && availQ.dataUpdatedAt >= openedAt;
  const saved = useMemo(
    () => (fresh && availQ.data ? weekFromRows(availQ.data) : null),
    [fresh, availQ.data],
  );
  // Con una rilettura in corso restano gli scheletri: lo stato d'errore di
  // prima non è ancora la risposta.
  const readFailed = !fresh && availQ.isError && availQ.fetchStatus === "idle";
  const typesQ = useCoachEventTypes(meId);

  const [edits, setEdits] = useState<WeekDraft | null>(null);
  const week = edits ?? saved;
  const errors = useMemo(() => (week ? weekErrors(week) : {}), [week]);
  const withErrors = Object.keys(errors).length > 0;
  const changed = saved && edits ? changedDays(saved, edits) : [];
  const dirty = changed.length > 0;
  const dirtyText = dirtyLabel(changed.length, withErrors);
  // Scritture in corso (salvataggio o «Ripristina»): barra e card ferme.
  const [pending, setPending] = useState(0);
  const saving = pending > 0;
  const savingRef = useRef(false);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  function edit(next: (w: WeekDraft) => WeekDraft) {
    if (!saved) return;
    // Una bozza tornata uguale al salvato torna a seguire le letture nuove.
    setEdits((prev) => {
      const w = next(prev ?? saved);
      return changedDays(saved, w).length === 0 ? null : w;
    });
  }

  function applyRows(rows: readonly AvailabilityRow[]) {
    qc.setQueryData(availabilityKey, sortRows(rows));
  }

  async function track<T>(task: () => Promise<T>): Promise<T> {
    setPending((n) => n + 1);
    try {
      return await oneAtATime(task);
    } finally {
      setPending((n) => n - 1);
    }
  }

  async function undoSave(before: AvailabilityRow[]) {
    if (!meId) return;
    try {
      const res = await track(() => saveWeek(supabaseAvailabilityStore, meId, slotsOfRows(before)));
      applyRows(res.after);
      toast.success("Orari di prima ripristinati.");
    } catch (e) {
      if (e instanceof WeekSaveIncompleteError) applyRows(e.actual);
      toast.error(errorMessage(e));
    } finally {
      void qc.invalidateQueries({ queryKey: availabilityKey });
    }
  }

  async function save(): Promise<boolean> {
    if (!meId || !edits || withErrors || saving || savingRef.current) return false;
    savingRef.current = true;
    try {
      const target = weekSlots(edits);
      const res = await track(() => saveWeek(supabaseAvailabilityStore, meId, target));
      applyRows(res.after);
      setEdits(null);
      toastWithUndo("Orari salvati. I clienti vedono i nuovi slot.", () => {
        void undoSave(res.before);
      });
      return true;
    } catch (e) {
      // Salvataggio a metà: il salvato diventa quello che il database ha
      // davvero, la bozza resta quella da salvare, e il prossimo salvataggio
      // toglie le righe vecchie.
      if (e instanceof WeekSaveIncompleteError) applyRows(e.actual);
      toast.error(errorMessage(e));
      return false;
    } finally {
      savingRef.current = false;
      void qc.invalidateQueries({ queryKey: availabilityKey });
    }
  }

  function discard() {
    setEdits(null);
  }

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => dirtyRef.current && current.pathname !== next.pathname,
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });
  const blocked = blocker.status === "blocked";

  // Il desktop resta montato con orari non salvati, mentre salva e mentre
  // chiede conferma d'uscita, anche se la finestra si stringe.
  useEffect(
    () => onHoldChange?.(dirty || saving || blocked),
    [dirty, saving, blocked, onHoldChange],
  );
  // Un'uscita chiesta mentre si salvava: finito il salvataggio non resta
  // niente da perdere, e la navigazione prosegue.
  useEffect(() => {
    if (blocker.status === "blocked" && !dirty && !saving) blocker.proceed?.();
  }, [blocker, dirty, saving]);

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] min-w-0 bg-surface px-10 pb-[120px] pt-7 text-on-surface">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex max-w-[680px] flex-col gap-1.5">
          <PageTitle className="m-0">Disponibilità</PageTitle>
          <p className="text-[15px] leading-normal text-on-surface-variant">
            Gli orari in cui i clienti possono prenotare. Le sessioni e gli impegni già in
            calendario bloccano gli slot in automatico; un evento creato solo su Google li blocca
            dopo che l'hai importato da Integrazioni.
          </p>
        </div>
        <GcalSyncPill />

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
          <section className={cn(CARD, "gap-1")} aria-labelledby="week-title">
            <h2 id="week-title" className="mb-2 text-xl font-semibold">
              Orario settimanale
            </h2>
            {week ? (
              <AvailabilityWeekCard week={week} errors={errors} disabled={saving} onChange={edit} />
            ) : readFailed ? (
              <div className="flex flex-col items-start gap-3 py-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <AlertCircle className="size-4 text-danger-text" aria-hidden />
                  Non riesco a leggere l'orario settimanale.
                </p>
                <button
                  type="button"
                  onClick={() => void availQ.refetch()}
                  className={dialogSecondaryButton}
                >
                  Riprova
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 py-2" aria-busy="true">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-2xl" />
                ))}
              </div>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-5">
            <AvailabilityPreviewCard
              week={week}
              weekFailed={readFailed}
              types={typesQ.data}
              typesFailed={typesQ.isError && !typesQ.data}
            />
            <BookingRulesCard />
            <AvailabilityExceptionsDesktop coachId={meId} now={now} />
          </div>
        </div>
      </div>

      {/* Barra fissa sulla finestra: in un portal, perché il contenitore
          dell'animazione d'ingresso (.page-enter) ha un transform e un fixed
          dentro di lui scorrerebbe con la pagina. */}
      {dirty &&
        createPortal(
          <div
            role="region"
            aria-label="Modifiche non salvate"
            className="fixed bottom-6 left-[calc(256px+24px)] right-6 z-40 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#191c1f] py-3.5 pl-5 pr-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <Clock className="size-[18px]" aria-hidden />
              {dirtyText}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={saving}
                className="h-[38px] rounded-full border border-white/30 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Annulla modifiche
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || withErrors}
                className="flex h-[38px] items-center gap-2 rounded-full bg-white px-[18px] text-sm font-bold text-aura-primary disabled:bg-white/50"
              >
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Salva orari
              </button>
            </div>
          </div>,
          document.body,
        )}

      <CoachAlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(o) => !o && blocker.status === "blocked" && blocker.reset()}
      >
        <CoachAlertDialogContent>
          <CoachAlertDialogTitle>Salvare gli orari?</CoachAlertDialogTitle>
          <CoachAlertDialogDescription className="text-sm leading-normal text-on-surface-variant">
            Hai modificato l'orario settimanale. Se esci senza salvare le modifiche vanno perse.
          </CoachAlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <CoachAlertDialogCancel className={dialogSecondaryButton}>
              Resta qui
            </CoachAlertDialogCancel>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                discard();
                blocker.proceed?.();
              }}
              className="inline-flex h-10 items-center rounded-full border border-surface-variant px-4 text-sm font-semibold text-danger-text disabled:opacity-60"
            >
              Esci senza salvare
            </button>
            <button
              type="button"
              disabled={saving || withErrors}
              onClick={async () => {
                // Se nel frattempo un salvataggio ha già svuotato la bozza,
                // non resta niente da salvare: si esce.
                if (!dirtyRef.current || (await save())) blocker.proceed?.();
                else blocker.reset?.();
              }}
              className={dialogPrimaryButton}
            >
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Salva ed esci
            </button>
          </div>
        </CoachAlertDialogContent>
      </CoachAlertDialog>
    </div>
  );
}
