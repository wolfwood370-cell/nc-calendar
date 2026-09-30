// ----------------------------------------------------------------------------
// Gli orari del coach, per Prenota e Sposta (lato cliente, passata 04, audit B2)
// ----------------------------------------------------------------------------
// Le letture da cui getClientSlotDays ricava giorni e orari: l'orario
// settimanale del coach, le sue eccezioni, gli orari consigliati e le sessioni
// che lo occupano, da oggi a oggi + 14, come intervalli con durata e margine.
// Spostate da client.book.tsx così com'erano nella passata 02: Prenota le usa
// com'erano, il foglio Sposta (dal dettaglio e, con la 05, dalla Home) per
// offrire gli stessi orari, con la stessa chiave nella cache. I giorni li
// calcola chi usa il hook: dipendono dalla tipologia (Prenota) o dalla
// sessione che si sposta (Sposta).
// ----------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { addDays, parseISO } from "date-fns";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLIENT_BOOKING_HORIZON_DAYS } from "@/lib/booking-rules";
import type { BlockedRange } from "@/lib/booking-slots";
import { toIsoDate } from "@/lib/current-block";
import {
  useCoachAvailability,
  useCoachAvailabilityExceptions,
  useCoachOptimizationEnabled,
} from "@/lib/queries";

interface BusyRow {
  scheduled_at: string;
  duration: number | null;
  buffer_minutes: number | null;
}

export function useCoachSlotInputs(coachId: string | null, now: Date) {
  const availabilityQ = useCoachAvailability(coachId);
  const exceptionsQ = useCoachAvailabilityExceptions(coachId);
  const optimizationQ = useCoachOptimizationEnabled(coachId);

  // Gli occupati del coach da mezzanotte di oggi alla fine di oggi + 14. La
  // chiave comincia con ["coach-busy", coachId]: invalidateBookingScope la
  // rinfresca dopo ogni prenotazione.
  const today = toIsoDate(now);
  const busyQ = useQuery({
    queryKey: ["coach-busy", coachId, "prenota", today],
    enabled: !!coachId,
    // A mezzanotte la chiave cambia: intanto restano gli occupati di prima.
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<BusyRow[]> => {
      if (!coachId) return [];
      const from = parseISO(today);
      const to = addDays(from, CLIENT_BOOKING_HORIZON_DAYS);
      to.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.rpc("get_coach_busy", {
        p_coach_id: coachId,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as BusyRow[];
    },
  });

  const busy = useMemo<BlockedRange[]>(
    () =>
      (busyQ.data ?? []).map((b) => {
        const start = new Date(b.scheduled_at).getTime();
        return { start, end: start + ((b.duration ?? 60) + (b.buffer_minutes ?? 0)) * 60_000 };
      }),
    [busyQ.data],
  );
  const slotsFailed = availabilityQ.isError || exceptionsQ.isError || busyQ.isError;
  // Senza coach non c'è niente da leggere: i giorni vengono chiusi, e basta.
  const slotsReady =
    coachId === null ||
    (availabilityQ.data !== undefined &&
      exceptionsQ.data !== undefined &&
      busyQ.data !== undefined);

  const retrySlots = () => {
    if (!coachId) return;
    void availabilityQ.refetch();
    void exceptionsQ.refetch();
    void busyQ.refetch();
  };
  const retryingSlots = availabilityQ.isFetching || exceptionsQ.isFetching || busyQ.isFetching;

  return {
    availabilityQ,
    exceptionsQ,
    optimizationQ,
    busyQ,
    busy,
    slotsFailed,
    slotsReady,
    retrySlots,
    retryingSlots,
  };
}
