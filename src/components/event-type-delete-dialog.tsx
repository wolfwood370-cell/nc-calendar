// ----------------------------------------------------------------------------
// «Eliminare «<Nome>»?», desktop (passata 07, audit E4)
// ----------------------------------------------------------------------------
// Dice quello che il database fa davvero: eliminare una tipologia la toglie a
// sessioni, allocazioni e crediti extra (ON DELETE SET NULL). Il testo viene
// dall'uso letto dal database all'apertura (store.loadUsage, righe della sola
// tipologia), non dai dati della pagina, che delle sessioni hanno solo le
// 1.000 più recenti. Una tipologia in uso non si elimina: il dialog lo spiega
// e offre di renderla non prenotabile. «Elimina» rilegge l'uso un'altra volta
// subito prima di cancellare (deleteEventType); se nel frattempo è in uso, il
// dialog mostra l'uso appena letto. Dopo l'eliminazione nessun «Ripristina».
// ----------------------------------------------------------------------------

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { USAGE_UNREADABLE, deleteModel, typeUsage, type TypeUsage } from "@/lib/event-type-usage";
import type { EventTypeRow } from "@/lib/queries";
import { errorMessage } from "@/lib/utils";

const OUTLINE_BUTTON =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-surface-variant px-4 text-sm font-semibold text-aura-primary transition-colors hover:border-primary-container disabled:opacity-60";

interface DeleteDialogProps {
  /** null = chiuso. */
  type: EventTypeRow | null;
  coachId: string;
  store: EventTypeStore;
  onClose: () => void;
  onMakeNotBookable: (type: EventTypeRow) => Promise<void>;
  onDeleted: (type: EventTypeRow) => void;
  onGone: (type: EventTypeRow) => void;
}

export function EventTypeDeleteDialog(props: DeleteDialogProps) {
  const { type, onClose } = props;
  return (
    <CoachAlertDialog open={!!type} onOpenChange={(open) => !open && onClose()}>
      {type && <DeleteBody key={type.id} {...props} type={type} />}
    </CoachAlertDialog>
  );
}

function DeleteBody({
  type,
  coachId,
  store,
  onClose,
  onMakeNotBookable,
  onDeleted,
  onGone,
}: DeleteDialogProps & { type: EventTypeRow }) {
  const [usage, setUsage] = useState<TypeUsage | null>(null);
  const [gone, setGone] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  // L'uso dal database, all'apertura e a ogni «Riprova».
  useEffect(() => {
    let alive = true;
    setUnreadable(false);
    store
      .loadUsage(type.id, coachId)
      .then((read) => {
        if (!alive) return;
        if (read.name === null) setGone(true);
        else setUsage(typeUsage({ id: type.id, name: read.name }, read.data, new Date()));
      })
      .catch(() => alive && setUnreadable(true));
    return () => {
      alive = false;
    };
  }, [type.id, coachId, store, attempt]);

  const model = usage ? deleteModel(type, usage) : null;

  const remove = async () => {
    setBusy(true);
    setUnreadable(false);
    try {
      await deleteEventType(store, type, coachId, new Date());
      onDeleted(type);
      onClose();
    } catch (e) {
      if (e instanceof TypeInUseError) setUsage(e.usage);
      else if (e instanceof UsageUnreadableError) setUnreadable(true);
      else if (e instanceof TypeGoneError) setGone(true);
      else toast.error("Tipologia non eliminata.", { description: errorMessage(e) });
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
    <CoachAlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
      <CoachAlertDialogTitle>Eliminare «{type.name}»?</CoachAlertDialogTitle>
      <CoachAlertDialogDescription asChild>
        <div className="flex flex-col gap-2 text-sm leading-normal text-on-surface-variant">
          {gone ? (
            <p>Questa tipologia non esiste più: l'ha eliminata qualcun altro.</p>
          ) : model ? (
            model.lines.map((line) => <p key={line}>{line}</p>)
          ) : unreadable ? null : (
            <>
              <Skeleton className="h-4 w-full" aria-label="Uso in caricamento" />
              <Skeleton className="h-4 w-2/3" />
            </>
          )}
          {unreadable && (
            <p role="alert" className="font-semibold text-danger-text">
              {USAGE_UNREADABLE}
            </p>
          )}
        </div>
      </CoachAlertDialogDescription>
      <div className="flex flex-wrap justify-end gap-2">
        {gone ? (
          <CoachAlertDialogCancel className={dialogSecondaryButton} onClick={() => onGone(type)}>
            Chiudi
          </CoachAlertDialogCancel>
        ) : model?.kind === "in-use" && !model.canMakeNotBookable ? (
          <CoachAlertDialogCancel className={dialogSecondaryButton}>Chiudi</CoachAlertDialogCancel>
        ) : (
          <CoachAlertDialogCancel className={dialogSecondaryButton} disabled={busy}>
            Annulla
          </CoachAlertDialogCancel>
        )}
        {!gone && model?.kind === "in-use" && model.canMakeNotBookable && (
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
        {!gone && model?.kind === "free" && (
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
        {!gone && !model && unreadable && (
          <button type="button" className={OUTLINE_BUTTON} onClick={() => setAttempt((n) => n + 1)}>
            Riprova
          </button>
        )}
      </div>
    </CoachAlertDialogContent>
  );
}
