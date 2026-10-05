// ----------------------------------------------------------------------------
// ClientCancelSheet — il foglio Annulla (lato cliente, passata 04, audit D1)
// ----------------------------------------------------------------------------
// La conferma dell'annullamento, un alertdialog: la sessione e la regola del
// credito (cancelSheet: gratis con più di 24 ore, poi il credito si perde),
// «Annulla sessione» distruttivo pieno e «Tienila». La sessione e la regola
// sono la descrizione del foglio: chi usa un lettore di schermo le sente
// all'apertura. L'annullamento è useCancelBooking, che cancella anche
// l'evento Google; riuscito, la pagina resta sulla sessione col was_late del
// server (onCancelled). Fallito, il toast d'errore col messaggio del server,
// e il foglio resta aperto.
// ----------------------------------------------------------------------------

import { toast } from "sonner";
import { ClientButton } from "@/components/client-button";
import { ClientSheet } from "@/components/client-sheet";
import { useClientShell } from "@/hooks/use-client-shell";
import { cancelSheet, type DetailBooking } from "@/lib/client-session-detail";
import { useCancelBooking } from "@/lib/queries";
import { cn, errorMessage } from "@/lib/utils";

const RULE_BOX = "mt-3.5 block rounded-[14px] px-3.5 py-3";
const RULE_FREE = "bg-surface text-on-surface-variant";
const RULE_LATE = "bg-warning-soft text-warning-ink";

export interface ClientCancelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: Pick<DetailBooking, "id" | "scheduled_at" | "duration_min">;
  /** sessionName. */
  name: string;
  /** Annullata, col was_late del server: true se il credito è stato scalato. */
  onCancelled: (wasLate: boolean) => void;
  /** Dove va il focus alla chiusura, se il pulsante che ha aperto il foglio non c'è più. */
  returnFocus?: () => HTMLElement | null | undefined;
}

export function ClientCancelSheet({
  open,
  onOpenChange,
  booking,
  name,
  onCancelled,
  returnFocus,
}: ClientCancelSheetProps) {
  const { now } = useClientShell();
  const cancel = useCancelBooking();
  const info = cancelSheet(booking, name, now);

  const onCancel = () => {
    cancel.mutate(
      { id: booking.id },
      {
        onSuccess: (result) => onCancelled(result.wasLate),
        onError: (e) => toast.error("Annullamento non riuscito", { description: errorMessage(e) }),
      },
    );
  };

  return (
    <ClientSheet
      open={open}
      onOpenChange={onOpenChange}
      role="alertdialog"
      title="Annullare la sessione?"
      description={
        <>
          <span className="block font-semibold text-on-surface">{info.when}</span>
          <span className={cn(RULE_BOX, info.free ? RULE_FREE : RULE_LATE)}>{info.text}</span>
        </>
      }
      returnFocus={returnFocus}
    >
      <ClientButton variant="danger" fullWidth busy={cancel.isPending} onClick={onCancel}>
        Annulla sessione
      </ClientButton>
      <ClientButton
        variant="text"
        fullWidth
        busy={cancel.isPending}
        onClick={() => onOpenChange(false)}
      >
        Tienila
      </ClientButton>
    </ClientSheet>
  );
}
