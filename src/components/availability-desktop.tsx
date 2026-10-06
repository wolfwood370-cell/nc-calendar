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
// Dalla passata 11 del lato cliente bozza, lettura e salvataggio stanno in
// use-availability-draft.ts, e il telefono usa gli stessi.
// ----------------------------------------------------------------------------

import { useBlocker } from "@tanstack/react-router";
import { AlertCircle, Clock, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { CoachPage } from "@/components/coach-page";
import { GcalSyncPill } from "@/components/gcal-sync-pill";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useAvailabilityDraft } from "@/hooks/use-availability-draft";
import { useAuth } from "@/lib/auth";
import { SAVE_BAR_POSITION } from "@/lib/save-bar";
import { useCoachEventTypes } from "@/lib/queries";
import { cn } from "@/lib/utils";

const CARD =
  "flex min-w-0 flex-col rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]";

export function AvailabilityDesktop({
  onHoldChange,
}: {
  /** true finché ci sono orari non salvati: la route tiene montato il desktop. */
  onHoldChange?: (hold: boolean) => void;
}) {
  const { user } = useAuth();
  const meId = user?.id;

  // --------------------------------------------------------------- orario
  const [openedAt] = useState(() => Date.now());
  // «Adesso» avanza: sessioni cominciate e periodi finiti escono da soli.
  const [now, setNow] = useState(() => new Date(openedAt));
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  // La bozza, la lettura fresca e il salvataggio: use-availability-draft.ts,
  // gli stessi del telefono.
  const draft = useAvailabilityDraft(meId);
  const { week, errors, withErrors, dirty, dirtyText, saving, readFailed } = draft;
  const typesQ = useCoachEventTypes(meId);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const edit = draft.edit;
  const save = draft.save;
  const discard = draft.discard;

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
    <CoachPage saveBar>
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
            <h2 id="week-title" className="mb-2 card-title">
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
                <button type="button" onClick={draft.retry} className={dialogSecondaryButton}>
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
            className={cn(
              SAVE_BAR_POSITION,
              "z-40 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#191c1f] py-3.5 pl-5 pr-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.3)]",
            )}
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
    </CoachPage>
  );
}
