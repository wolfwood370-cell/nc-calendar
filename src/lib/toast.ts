// ----------------------------------------------------------------------------
// Toast con «Ripristina» (audit V1)
// ----------------------------------------------------------------------------
// Le conferme che si possono annullare hanno sempre l'azione «Ripristina»:
// «Annulla» resta riservato a chiudere un dialog o ad annullare una sessione.
// ----------------------------------------------------------------------------

import { toast } from "sonner";

/** Quanto resta visibile un toast con «Ripristina»: il tempo di ripensarci. */
export const UNDO_TOAST_DURATION = 8000;

export function toastWithUndo(message: string, onUndo: () => void) {
  return toast.success(message, {
    duration: UNDO_TOAST_DURATION,
    action: { label: "Ripristina", onClick: onUndo },
  });
}
