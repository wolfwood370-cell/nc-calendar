// ----------------------------------------------------------------------------
// Toast con «Ripristina» (audit V1)
// ----------------------------------------------------------------------------
// Le conferme che si possono annullare hanno sempre l'azione «Ripristina»:
// «Annulla» resta riservato a chiudere un dialog o ad annullare una sessione.
// ----------------------------------------------------------------------------

import { toast } from "sonner";

/**
 * Quanto resta visibile un toast con un'azione, «Ripristina» o un'altra
 * («Collega senza credito»): il tempo di ripensarci (README, V1: 8 s).
 */
export const UNDO_TOAST_DURATION = 8000;

/**
 * Il toast con «Ripristina» per 8 secondi. Il tono sceglie l'icona: "success"
 * (quello di sempre) o "warning", con la stessa durata e la stessa azione
 * (l'annullamento tardivo del cliente, passata 04).
 */
export function toastWithUndo(
  message: string,
  onUndo: () => void,
  tone: "success" | "warning" = "success",
) {
  const options = {
    duration: UNDO_TOAST_DURATION,
    action: { label: "Ripristina", onClick: onUndo },
  };
  return tone === "warning" ? toast.warning(message, options) : toast.success(message, options);
}
