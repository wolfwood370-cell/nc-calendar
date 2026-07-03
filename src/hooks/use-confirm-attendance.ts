// ----------------------------------------------------------------------------
// use-confirm-attendance — "Conferma presenza" del cliente (design handoff)
// ----------------------------------------------------------------------------
// Chiama la RPC confirm_booking_attendance (migrazione 20260703090000):
// security definer che setta bookings.client_confirmed_at SOLO sui booking
// del chiamante ancora `scheduled`. Il coach vede la spunta ✓ su calendario
// e liste. La riprogrammazione azzera la conferma (trigger DB).
// ----------------------------------------------------------------------------

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { isMissingMigration } from "@/hooks/use-bia";

export function useConfirmAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; clientId: string | null | undefined }) => {
      const { data, error } = await supabase.rpc("confirm_booking_attendance", {
        p_booking_id: input.bookingId,
      });
      if (error) {
        if (isMissingMigration(error)) {
          throw new Error("Funzione non ancora attiva: applica prima la migrazione del redesign.");
        }
        throw new Error(error.message);
      }
      if (!data) throw new Error("Conferma non riuscita: la sessione non è più confermabile.");
    },
    onSuccess: (_d, input) => {
      toast.success("Presenza confermata", {
        description: "Il tuo coach vedrà la conferma sul calendario.",
      });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.client(input.clientId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.detail(input.bookingId) });
    },
    onError: (e: Error) => {
      toast.error("Impossibile confermare", { description: e.message });
    },
  });
}
