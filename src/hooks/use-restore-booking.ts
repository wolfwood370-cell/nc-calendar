// ----------------------------------------------------------------------------
// «Ripristina» dopo un annullamento (lato cliente, passata 04, audit D1)
// ----------------------------------------------------------------------------
// Il toast dell'annullamento ha «Ripristina» per 8 secondi: qui la chiamata.
// L'RPC restore_booking arriva col giro del server del 02/10/2026: finché nel
// database non c'è, PostgREST risponde che la funzione non esiste e il toast
// dice «Non siamo riusciti a ripristinare la sessione.». Il contratto con cui
// la chiama l'app:
//   restore_booking(p_booking_id uuid) RETURNS TABLE(status booking_status)
//   - la chiama il cliente della sessione (o il suo coach, o un admin);
//   - riesce se la sessione è cancelled o late_cancelled, annullata da al più
//     10 minuti (orologio del server), e il suo orario è ancora libero per il
//     coach;
//   - la riporta a scheduled com'era (conferma compresa), con deleted_at e
//     google_event_id nulli: l'evento Google l'ha cancellato l'annullamento;
//   - da un annullamento gratuito riprende il credito, con la stessa logica
//     del consumo; da uno tardivo il credito era già scalato, e resta così;
//   - errori: P0001 «Non si può più ripristinare.» (fuori tempo o stato
//     sbagliato), 23P01 (l'orario è occupato), 42501 «Permesso negato.».
// Dieci minuti, e non gli 8 secondi del toast: un margine per la rete lenta.
// Riuscita, l'evento Google si ricrea come in Prenota (use-book-confirm.ts),
// senza aspettarlo.
// ----------------------------------------------------------------------------

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { actionErrorText } from "@/lib/client-session-detail";
import { toGoogleColorId } from "@/lib/gcal-colors";
import { gcalCreateEvent } from "@/lib/gcal.functions";
import { invalidateBookingScope, queryKeys } from "@/lib/query-keys";

// I tipi generati non hanno l'RPC finché Lovable non li rigenera dopo la
// migrazione: la chiamata rilassata di use-current-block.ts.
interface RestoreRow {
  status: string;
}
interface RelaxedRpc {
  rpc: (
    fn: "restore_booking",
    args: { p_booking_id: string },
  ) => Promise<{ data: RestoreRow[] | null; error: { code?: string; message: string } | null }>;
}
const sb = supabase as unknown as RelaxedRpc;

/** La sessione da ripristinare, coi campi dell'evento Google che si ricrea. */
export interface RestoreBookingInput {
  bookingId: string;
  coachId: string;
  clientId: string | null;
  /** L'inizio (scheduled_at) e la durata in minuti. */
  scheduledAt: string;
  durationMin: number;
  /** Il nome della tipologia (sessionName) e quello del cliente: il titolo dell'evento. */
  name: string;
  clientName: string;
  /** La tipologia: il colore, se è online (la stanza di Meet) e la descrizione. */
  color: string | null;
  online: boolean;
  description: string | null;
}

/**
 * L'evento di Google Calendar, come lo crea Prenota: l'invito arriva
 * all'email del cliente, e la funzione server scrive sulla riga il nuovo
 * google_event_id. Senza aspettarlo e con l'errore in console: l'evento è a
 * valle della riga. Quando risponde ok si rilegge il dettaglio, e l'invito
 * torna a vedersi.
 */
function recreateEvent(input: RestoreBookingInput, onCreated: () => void) {
  const minutes = input.durationMin > 0 ? input.durationMin : 60;
  const start = new Date(input.scheduledAt);
  const end = new Date(start.getTime() + minutes * 60_000);
  void (async () => {
    try {
      const result = await gcalCreateEvent({
        data: {
          bookingId: input.bookingId,
          summary: `${input.name} — ${input.clientName}`,
          description: input.description ?? undefined,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
          requestMeet: input.online,
          isOnline: input.online,
          colorId: toGoogleColorId(input.color),
        },
      });
      if (result.ok) onCreated();
      else console.error("gcalCreateEvent failed", result.error);
    } catch (e) {
      console.error("gcalCreateEvent failed", e);
    }
  })();
}

/**
 * «Ripristina» dell'annullamento. Riuscito: l'evento Google, le sessioni e i
 * crediti (invalidateBookingScope, che dalla passata 09 rilegge anche i
 * dettagli), il dettaglio di nuovo dopo l'evento Google (refreshDetail) e
 * «Sessione ripristinata.». Fallito: il toast d'avviso con actionErrorText, e
 * la sessione resta annullata.
 */
export function useRestoreBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RestoreBookingInput) => {
      const { error } = await sb.rpc("restore_booking", { p_booking_id: input.bookingId });
      if (error) throw error;
    },
    onSuccess: (_d, input) => {
      const refreshDetail = () => {
        void qc.invalidateQueries({ queryKey: queryKeys.bookings.detail(input.bookingId) });
      };
      recreateEvent(input, refreshDetail);
      invalidateBookingScope(qc, { coachId: input.coachId, clientId: input.clientId });
      refreshDetail();
      toast.success("Sessione ripristinata.");
    },
    onError: (err) => {
      toast.warning(actionErrorText(err, "restore"));
    },
  });
}
