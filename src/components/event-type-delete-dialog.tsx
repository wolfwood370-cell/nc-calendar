// ----------------------------------------------------------------------------
// «Eliminare «<Nome>»?», desktop (passata 07, audit E4)
// ----------------------------------------------------------------------------
// Dice quello che il database fa davvero: eliminare una tipologia la toglie a
// sessioni, allocazioni e crediti extra (ON DELETE SET NULL). Una tipologia
// in uso non si elimina: il dialog lo spiega e offre di renderla non
// prenotabile. «Elimina» rilegge l'uso dal database prima di cancellare
// (deleteEventType); se nel frattempo è in uso, il dialog si aggiorna con
// l'uso appena letto. Dopo l'eliminazione nessun «Ripristina».
// ----------------------------------------------------------------------------

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  CoachAlertDialog,
  CoachAlertDialogCancel,
  CoachAlertDialogContent,
  CoachAlertDialogDescription,
  CoachAlertDialogTitle,
  dialogDangerButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TypeGoneError,
  TypeInUseError,
  UsageUnreadableError,
  deleteEventType,
  type EventTypeStore,
} from "@/lib/event-type-actions";
import { USAGE_UNREADABLE, deleteModel, type TypeUsage } from "@/lib/event-type-usage";
import type { EventTypeRow } from "@/lib/queries";
import { errorMessage } from "@/lib/utils";
import type { CardUsage } from "@/components/event-type-card";

const OUTLINE_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-surface-variant px-4 text-sm font-semibold text-aura-primary transition-colors hover:border-primary-container disabled:opacity-60";

export function EventTypeDeleteDialog({
  type,
  usage,
  coachId,
  store,
  onClose,
  onRetryUsage,
  onMakeNotBookable,
  onDeleted,
  onGone,
}: {
  /** null = chiuso. */
  type: EventTypeRow | null;
  /** L'uso che la pagina conosce. */
  usage: CardUsage;
  coachId: string;
  store: EventTypeStore;
  onClose: () => void;
  onRetryUsage: () => void;
  onMakeNotBookable: (type: EventTypeRow) => Promise<void>;
  onDeleted: (type: EventTypeRow) => void;
  onGone: (type: EventTypeRow) => void;
}) {
  return (
    <CoachAlertDialog open={!!type} onOpenChange={(open) => !open && onClose()}>
      {type && (
        <DeleteBody
          key={type.id}
          type={type}
          usage={usage}
          coachId={coachId}
          store={store}
          onClose={onClose}
          onRetryUsage={onRetryUsage}
          onMakeNotBookable={onMakeNotBookable}
          onDeleted={onDeleted}
          onGone={onGone}
        />
      )}
    </CoachAlertDialog>
  );
}

function DeleteBody({
  type,
  usage,
  coachId,
  store,
  onClose,
  onRetryUsage,
  onMakeNotBookable,
  onDeleted,
  onGone,
}: {
  type: EventTypeRow;
  usage: CardUsage;
  coachId: string;
  store: EventTypeStore;
  onClose: () => void;
  onRetryUsage: () => void;
  onMakeNotBookable: (type: EventTypeRow) => Promise<void>;
  onDeleted: (type: EventTypeRow) => void;
  onGone: (type: EventTypeRow) => void;
}) {
  // L'uso riletto dal database vale più di quello della pagina.
  const [fresh, setFresh] = useState<TypeUsage | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const known = fresh ?? (typeof usage === "object" ? usage : null);
  const model = known ? deleteModel(type, known) : null;

  const remove = async () => {
    setBusy(true);
    setUnreadable(false);
    try {
      await deleteEventType(store, type, coachId, new Date());
      onDeleted(type);
      onClose();
    } catch (e) {
      if (e instanceof TypeInUseError) setFresh(e.usage);
      else if (e instanceof UsageUnreadableError) setUnreadable(true);
      else if (e instanceof TypeGoneError) {
        onGone(type);
        onClose();
      } else toast.error("Tipologia non eliminata.", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const makeNotBookable = async () => {
    setBusy(true);
    try {
      await onMakeNotBookable(type);
      onClose();
    } catch (e) {
      toast.error("Modifica non salvata.", { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoachAlertDialogContent>
      <CoachAlertDialogTitle>Eliminare «{type.name}»?</CoachAlertDialogTitle>
      <CoachAlertDialogDescription asChild>
        <div className="flex flex-col gap-2 text-sm leading-normal text-on-surface-variant">
          {model ? (
            model.lines.map((line) => <p key={line}>{line}</p>)
          ) : usage === "loading" ? (
            <>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </>
          ) : (
            <p>{USAGE_UNREADABLE}</p>
          )}
          {unreadable && <p className="font-semibold text-danger-text">{USAGE_UNREADABLE}</p>}
        </div>
      </CoachAlertDialogDescription>
      <div className="flex flex-wrap justify-end gap-2">
        {model?.kind === "in-use" && !model.canMakeNotBookable ? (
          <CoachAlertDialogCancel className={dialogSecondaryButton}>Chiudi</CoachAlertDialogCancel>
        ) : (
          <CoachAlertDialogCancel className={dialogSecondaryButton} disabled={busy}>
            Annulla
          </CoachAlertDialogCancel>
        )}
        {model?.kind === "in-use" && model.canMakeNotBookable && (
          <button
            type="button"
            className={OUTLINE_BUTTON}
            disabled={busy}
            onClick={() => void makeNotBookable()}
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Rendi non prenotabile
          </button>
        )}
        {model?.kind === "free" && (
          <AlertDialogPrimitive.Action asChild>
            <button
              type="button"
              className={dialogDangerButton}
              disabled={busy}
              onClick={(e) => {
                // Il dialog si chiude solo a eliminazione riuscita.
                e.preventDefault();
                void remove();
              }}
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Elimina
            </button>
          </AlertDialogPrimitive.Action>
        )}
        {!model && usage === "error" && (
          <button type="button" className={OUTLINE_BUTTON} onClick={onRetryUsage}>
            Riprova
          </button>
        )}
      </div>
    </CoachAlertDialogContent>
  );
}
