// ----------------------------------------------------------------------------
// Lettura degli eventi di Google Calendar (passata 09)
// ----------------------------------------------------------------------------
// Spostata da calendar-gcal-review.tsx: la usano il pannello di
// riconciliazione del telefono e Integrazioni desktop, con la stessa chiave.
// Eventi vivi e non giornalieri da 30 giorni fa a 90 avanti
// (gcal.functions.ts:704-749); sola lettura.
//   - Il pannello tiene i suoi 5 minuti di staleTime e i tentativi di default.
//   - fresh (Integrazioni desktop): rilegge all'apertura anche con la cache
//     recente, perché il chip vuole una risposta di adesso, e riprova una
//     volta sola: il QueryClient di router.tsx non ha impostazioni, e coi tre
//     tentativi di default «Verifico…» durerebbe circa sette secondi.
// ----------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { gcalListEventsForReview } from "@/lib/gcal.functions";

export function gcalReviewKey(coachId: string | undefined) {
  return ["gcal-review", coachId] as const;
}

export function useGcalReviewEvents(coachId: string | undefined, opts: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: gcalReviewKey(coachId),
    enabled: !!coachId,
    staleTime: 5 * 60_000,
    ...(opts.fresh ? { refetchOnMount: "always" as const, retry: 1 } : {}),
    queryFn: async () => {
      const r = await gcalListEventsForReview({ data: {} });
      if (!r.ok) throw new Error(r.error);
      return r.events;
    },
  });
}
