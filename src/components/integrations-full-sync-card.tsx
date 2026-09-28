// ----------------------------------------------------------------------------
// Sincronizzazione completa di Integrazioni desktop (passata 09, C1, I2)
// ----------------------------------------------------------------------------
// Descrizione, dialog di conferma con la stima, le due fasi con numeri veri
// (il ripristino a passate, poi la riconciliazione in una chiamata sola, con
// la barra in attesa: una percentuale sarebbe inventata) e l'esito fino a
// «Chiudi». La logica sta in gcal-sync-run.ts e gcal-integration.ts; lo
// stato e il blocco dell'uscita nella pagina.
// ----------------------------------------------------------------------------

import { CircleAlert, CircleCheck, History } from "lucide-react";
import { useState } from "react";
import {
  CoachAlertDialog,
  CoachAlertDialogCancel,
  CoachAlertDialogContent,
  CoachAlertDialogDescription,
  CoachAlertDialogTitle,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { fullSyncStepView, type FullSyncStep } from "@/lib/gcal-integration";
import type { FullSyncOutcome } from "@/lib/gcal-sync-run";
import { cn } from "@/lib/utils";

export type FullSyncView =
  | { state: "idle" }
  | { state: "running"; step: FullSyncStep }
  | { state: "done"; outcome: FullSyncOutcome };

const OUTCOME_TONE: Record<FullSyncOutcome["tone"], { box: string; title: string }> = {
  success: { box: "bg-success-soft", title: "text-success-text" },
  warning: { box: "border border-warning-line bg-warning-soft", title: "text-warning-text" },
  danger: { box: "border border-danger-line bg-danger-soft", title: "text-danger-text" },
};

export function IntegrationsFullSyncCard({
  view,
  description,
  confirmText,
  disabled,
  onStart,
  onDismiss,
}: {
  view: FullSyncView;
  description: string;
  /** Il testo del dialog di conferma, con la stima. */
  confirmText: string;
  /** Un'altra scrittura verso Google in corso. */
  disabled: boolean;
  /** «Avvia» nel dialog: la pagina decide se parte. */
  onStart: () => void;
  onDismiss: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <section
      aria-labelledby="full-sync-title"
      className="flex min-w-0 flex-col gap-3.5 rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]"
    >
      <h2 id="full-sync-title" className="text-xl font-semibold text-on-surface">
        Sincronizzazione completa
      </h2>
      <p className="text-sm leading-normal text-on-surface-variant">{description}</p>

      {view.state === "idle" && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={disabled}
          className="flex h-10 items-center gap-2 self-start rounded-full bg-aura-primary px-[18px] text-sm font-semibold text-white transition-colors hover:bg-primary-container disabled:bg-outline-variant disabled:hover:bg-outline-variant"
        >
          <History className="size-4" aria-hidden />
          Avvia sincronizzazione completa
        </button>
      )}

      {view.state === "running" && <Progress step={view.step} />}

      {view.state === "done" && (
        <div
          role="status"
          className={cn(
            "flex flex-col gap-2 rounded-[18px] px-4 py-3.5",
            OUTCOME_TONE[view.outcome.tone].box,
          )}
        >
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-bold",
              OUTCOME_TONE[view.outcome.tone].title,
            )}
          >
            {view.outcome.tone === "success" ? (
              <CircleCheck className="size-4 shrink-0" aria-hidden />
            ) : (
              <CircleAlert className="size-4 shrink-0" aria-hidden />
            )}
            {view.outcome.title}
          </p>
          <div className="flex flex-col gap-1 text-[13px] leading-normal text-on-surface">
            {view.outcome.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="self-start text-[13px] font-semibold text-aura-primary hover:text-primary-container"
          >
            Chiudi
          </button>
        </div>
      )}

      <CoachAlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <CoachAlertDialogContent>
          <CoachAlertDialogTitle>Avviare la sincronizzazione completa?</CoachAlertDialogTitle>
          <CoachAlertDialogDescription className="text-sm leading-normal text-on-surface-variant">
            {confirmText}
          </CoachAlertDialogDescription>
          <div className="flex justify-end gap-2">
            <CoachAlertDialogCancel className={dialogSecondaryButton}>
              Annulla
            </CoachAlertDialogCancel>
            <button
              type="button"
              className={dialogPrimaryButton}
              disabled={disabled}
              onClick={() => {
                setConfirmOpen(false);
                onStart();
              }}
            >
              Avvia
            </button>
          </div>
        </CoachAlertDialogContent>
      </CoachAlertDialog>
    </section>
  );
}

function Progress({ step }: { step: FullSyncStep }) {
  const { text, fraction } = fullSyncStepView(step);
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-on-surface">{text}</p>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-container"
        {...(fraction !== null
          ? {
              role: "progressbar",
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": Math.round(fraction * 100),
            }
          : { role: "progressbar", "aria-busy": true })}
        aria-label={text}
      >
        {fraction !== null ? (
          <div
            className="h-full rounded-full bg-aura-primary transition-[width] duration-300"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        ) : (
          <div className="h-full w-full animate-pulse rounded-full bg-aura-primary/40 motion-reduce:animate-none" />
        )}
      </div>
      <p className="text-xs text-warning-text">Tieni aperta questa pagina finché non termina.</p>
    </div>
  );
}
