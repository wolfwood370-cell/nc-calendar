// ----------------------------------------------------------------------------
// useMyCoach — il coach del cliente (lato cliente, passata 07, audit H6)
// ----------------------------------------------------------------------------
// get_my_coach (giro del server del 02/10/2026) restituisce nome, telefono ed
// email del coach di chi chiama: nessuna policy di profiles dà al cliente la
// riga del suo coach, e get_coach_for dà solo l'id. Da qui il coach dei testi
// di tutte le pagine del cliente (bookCoach: Home, Prenota, Sessioni, Booster,
// il dettaglio della sessione) e la riga per la card «Il tuo coach» del
// Profilo. Un hook solo, con una chiave sola: con una lettura per pagina Home e
// Profilo potrebbero nominare due coach diversi a cache diverse.
// Le pagine non aspettano il coach: finché non arriva, o se la funzione non
// risponde (un database senza la migrazione: 404 PGRST202; un errore di rete),
// il coach è NO_COACH e i testi dicono «il tuo coach», come prima. L'errore va
// a Sentry una volta per pagina caricata (il segno sta nel modulo), e mai
// nella pagina.
// ----------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { BookCoach } from "@/lib/client-book";
import { bookCoach, type MyCoachRow } from "@/lib/coach-contacts";
import { captureMessage } from "@/lib/sentry";

// I tipi generati non hanno la funzione finché Lovable non li rigenera dopo la
// migrazione: la chiamata rilassata di use-restore-booking.ts.
interface RelaxedRpc {
  rpc: (
    fn: "get_my_coach",
  ) => Promise<{ data: MyCoachRow[] | null; error: { code?: string; message: string } | null }>;
}
const sb = supabase as unknown as RelaxedRpc;

// Segnalato a Sentry: una volta per pagina caricata, qualunque pagina legga il coach.
let reported = false;

export interface MyCoach {
  /** Il coach dei testi: NO_COACH finché la riga non arriva, o senza riga. */
  coach: BookCoach;
  /** La riga di get_my_coach, per la card del Profilo; null senza. */
  row: MyCoachRow | null;
}

export function useMyCoach(): MyCoach {
  const { user } = useAuth();
  const meId = user?.id;
  const q = useQuery({
    queryKey: ["get_my_coach", meId],
    enabled: !!meId,
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async (): Promise<MyCoachRow | null> => {
      const { data, error } = await sb.rpc("get_my_coach");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const failed = q.isError;
  useEffect(() => {
    if (!failed || reported) return;
    reported = true;
    captureMessage(
      "get_my_coach non risponde: i testi del cliente dicono «il tuo coach»",
      "warning",
    );
  }, [failed]);

  const row = q.data ?? null;
  // Lo stesso oggetto fra un disegno e l'altro: le pagine lo mettono nelle
  // dipendenze dei loro useMemo.
  const coach = useMemo(() => bookCoach(row), [row]);
  return { coach, row };
}
