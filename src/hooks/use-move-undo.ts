// ----------------------------------------------------------------------------
// «Ripristina» dello spostamento (lato cliente, passata 05)
// ----------------------------------------------------------------------------
// Il toast dopo uno spostamento, con «Ripristina» per 8 secondi, in un posto
// solo per il dettaglio della sessione (04) e la Home (05). «Ripristina»
// riporta la sessione all'orario di prima con useRescheduleBooking, che
// sposta anche l'evento Google e avvisa di nuovo il coach.
// Tutto quello che serve entra come argomento: fra lo spostamento e
// «Ripristina» la Home cambia la sua prossima sessione, e una chiusura sulla
// sessione del momento sposterebbe quella sbagliata. mutateAsync e non
// mutate: TanStack Query v5 non chiama le callback di mutate a componente
// smontato, la promessa invece arriva, e con lei il toast, anche se nel
// frattempo la pagina è cambiata.
// ----------------------------------------------------------------------------

import { toast } from "sonner";
import type { BookCoach } from "@/lib/client-book";
import { actionErrorText, moveToast } from "@/lib/client-session-detail";
import { useRescheduleBooking } from "@/lib/queries";
import { toastWithUndo } from "@/lib/toast";

/** La sessione appena spostata. */
export interface MovedSession {
  bookingId: string;
  /** sessionName: nell'avviso al coach. */
  name: string;
  /** Il nome del cliente (profiles.full_name), per l'avviso al coach; null senza. */
  clientName: string | null;
  /** L'inizio di prima e quello nuovo, ISO. */
  fromIso: string;
  toIso: string;
}

/**
 * Restituisce la funzione da chiamare a spostamento riuscito: lascia il
 * toast «Spostata a …» con «Ripristina». Riportata la sessione, onRefresh
 * (la rilettura di chi la mostra), onRestored (passata 09: chi la mostra
 * rimette il focus, che col toast chiuso finiva sul body) e «Sessione
 * riportata all'orario di prima.»; se non riesce, il motivo (actionErrorText).
 */
export function useMoveUndo(coach: BookCoach, onRefresh?: () => void, onRestored?: () => void) {
  const reschedule = useRescheduleBooking();
  return (move: MovedSession) => {
    const moveBack = () => {
      reschedule
        .mutateAsync({
          bookingId: move.bookingId,
          newScheduledISO: move.fromIso,
          oldScheduledISO: move.toIso,
          sessionLabel: move.name,
          clientName: move.clientName ?? undefined,
        })
        .then(() => {
          onRefresh?.();
          onRestored?.();
          toast.success("Sessione riportata all'orario di prima.");
        })
        .catch((err) => toast.warning(actionErrorText(err, "undo-move")));
    };
    toastWithUndo(moveToast(move.toIso, coach), moveBack);
  };
}
