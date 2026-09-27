// ----------------------------------------------------------------------------
// «Eliminare definitivamente <Nome>?» (audit L6, passata 05)
// ----------------------------------------------------------------------------
// Conferma del brief con «Annulla», «Archivia invece» ed «Elimina». Eliminare
// usa il percorso di prima (funzione edge admin-delete-user, che chiama
// admin_delete_client): è l'unica azione della pagina che non si annulla.
// ----------------------------------------------------------------------------

import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  CoachAlertDialog,
  CoachAlertDialogCancel,
  CoachAlertDialogContent,
  CoachAlertDialogDescription,
  CoachAlertDialogTitle,
  dialogDangerButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";

export function DeleteClientDialog({
  client,
  onClose,
  onArchive,
  onDelete,
}: {
  client: { id: string; name: string } | null;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <CoachAlertDialog open={!!client} onOpenChange={(o) => !o && !busy && onClose()}>
      {client && (
        <CoachAlertDialogContent>
          <CoachAlertDialogTitle>Eliminare definitivamente {client.name}?</CoachAlertDialogTitle>
          <CoachAlertDialogDescription className="text-sm leading-normal text-on-surface-variant">
            Vengono eliminati account, profilo, sessioni, blocchi e crediti. L'operazione non si può
            annullare. Se vuoi solo nasconderlo dall'elenco, archivialo.
          </CoachAlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <CoachAlertDialogCancel className={dialogSecondaryButton} disabled={busy}>
              Annulla
            </CoachAlertDialogCancel>
            <button
              type="button"
              disabled={busy}
              onClick={onArchive}
              className="inline-flex h-10 items-center justify-center rounded-full border border-surface-variant px-[18px] text-sm font-semibold text-aura-primary transition-colors hover:border-primary-container disabled:opacity-60"
            >
              Archivia invece
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete();
                } finally {
                  setBusy(false);
                }
              }}
              className={dialogDangerButton}
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Elimina
            </button>
          </div>
        </CoachAlertDialogContent>
      )}
    </CoachAlertDialog>
  );
}
