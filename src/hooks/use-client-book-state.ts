// ----------------------------------------------------------------------------
// Lo stato dei crediti del cliente (lato cliente, passata 03, audit H1)
// ----------------------------------------------------------------------------
// getBookState sopra le letture di Prenota: il profilo, i blocchi, le sessioni
// con le annullate tardi (useClientBookingsForCredits), i crediti extra,
// ensure_client_block_state, le tipologie del coach e i titoli dei Booster; la
// rilettura dei blocchi quando l'RPC ne crea uno nuovo; le incoerenze a Sentry
// a letture ferme. Spostato da client.book.tsx così com'era nella passata 02:
// Prenota lo usa com'era, Sessioni per la card vuota, la Home (05) per la card
// dei crediti. Un conteggio solo, invece di una copia per pagina.
// Il Set delle incoerenze già mandate è del modulo: aperta Sessioni e poi
// Prenota, la stessa incoerenza parte una volta sola.
// Oltre a quello che usa Prenota restituisce bookingsQ (le sessioni, per
// Sessioni e la Home) e profileArrived: il profilo è arrivato, coi dati o con
// l'errore, e resta arrivato mentre un profilo in errore si rilegge (TanStack
// Query, rileggendo una lettura senza dati, ne toglie l'errore). Prima coachId
// è nullo anche per chi ha un coach; arrivato con l'errore, lo resta.
// ----------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useCurrentBlock } from "@/hooks/use-current-block";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getBookState,
  reportPoolMismatches,
  type BookClient,
  type BookCoach,
} from "@/lib/client-book";
import {
  useActiveShopTitles,
  useClientBlocks,
  useClientBookingsForCredits,
  useClientExtraCredits,
  useCoachEventTypes,
} from "@/lib/queries";
import { captureMessage } from "@/lib/sentry";

// Le incoerenze dei crediti già mandate a Sentry, per tutta la vita della
// pagina: il ridisegno ogni 30 secondi (useNow) non le rimanda.
const SENT_MISMATCHES = new Set<string>();
const sendMismatch = (message: string) => {
  captureMessage(message, "warning");
};

export function useClientBookState(now: Date, coach: BookCoach) {
  const { user } = useAuth();
  const meId = user?.id;

  // Il profilo con una chiave sua: quella condivisa del profilo (query-keys.ts)
  // la usa la Home con altre colonne, e la cache le mescolerebbe.
  const profileQ = useQuery({
    queryKey: ["client-book", "profile", meId],
    enabled: !!meId,
    queryFn: async () => {
      if (!meId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, phone, coach_id, path_type, status, pack_label, auto_renew_blocks",
        )
        .eq("id", meId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const blocksQ = useClientBlocks(meId);
  const bookingsQ = useClientBookingsForCredits(meId);
  const extrasQ = useClientExtraCredits(meId);
  // ensure_client_block_state: chiude i blocchi finiti e, a chi rinnova, crea
  // il mese dopo. Il blocco di riferimento non lo sceglie lui
  // (clientReferenceBlock, in getBookState).
  const currentBlockQ = useCurrentBlock(meId);
  const coachId = profileQ.data?.coach_id ?? null;
  const eventTypesQ = useCoachEventTypes(coachId);
  const boostersQ = useActiveShopTitles();

  // Il primo giorno del mese nuovo l'RPC crea il blocco nello stesso
  // caricamento: se il suo blocco non c'è fra quelli letti, si rileggono i
  // blocchi una volta prima di decidere, o Prenota direbbe «percorso concluso»
  // a chi ha appena rinnovato.
  const rpcBlockId = currentBlockQ.data?.currentBlockId ?? null;
  const blockMissing =
    rpcBlockId !== null &&
    blocksQ.data !== undefined &&
    !blocksQ.data.some((b) => b.id === rpcBlockId);
  const [refetchedFor, setRefetchedFor] = useState<string | null>(null);
  const refetchBlocks = blocksQ.refetch;
  useEffect(() => {
    if (!blockMissing || rpcBlockId === null || refetchedFor === rpcBlockId) return;
    setRefetchedFor(rpcBlockId);
    void refetchBlocks();
  }, [blockMissing, rpcBlockId, refetchedFor, refetchBlocks]);
  const waitingBlocks = blockMissing && (refetchedFor !== rpcBlockId || blocksQ.isFetching);

  // Arrivata: coi dati o con l'errore. L'RPC in errore conta come arrivata.
  // Persa: in errore e senza dati. Una rilettura fallita in background tiene i
  // dati di prima (TanStack Query) e non toglie la pagina né un foglio aperto.
  const arrived = (q: { data: unknown; isError: boolean }) => q.data !== undefined || q.isError;
  const lost = (q: { data: unknown; isError: boolean }) => q.isError && q.data === undefined;
  const loading =
    !meId ||
    !arrived(profileQ) ||
    !arrived(blocksQ) ||
    !arrived(bookingsQ) ||
    !arrived(extrasQ) ||
    (coachId !== null && !arrived(eventTypesQ)) ||
    !arrived(currentBlockQ) ||
    waitingBlocks;
  const failed =
    lost(profileQ) ||
    lost(blocksQ) ||
    lost(bookingsQ) ||
    lost(extrasQ) ||
    lost(eventTypesQ) ||
    (profileQ.data === null && !profileQ.isFetching);

  const profile = profileQ.data ?? null;
  const client = useMemo<BookClient | null>(
    () =>
      profile
        ? {
            path_type: profile.path_type,
            status: profile.status,
            pack_label: profile.pack_label,
            auto_renew_blocks: profile.auto_renew_blocks,
          }
        : null,
    [profile],
  );

  const state = useMemo(() => {
    if (loading || failed || !client || !blocksQ.data || !bookingsQ.data || !extrasQ.data) {
      return null;
    }
    return getBookState({
      now,
      client,
      blocks: blocksQ.data,
      bookings: bookingsQ.data,
      extras: extrasQ.data,
      eventTypes: eventTypesQ.data ?? [],
      boosterTitles: boostersQ.data ?? [],
      coach,
    });
  }, [
    loading,
    failed,
    client,
    now,
    blocksQ.data,
    bookingsQ.data,
    extrasQ.data,
    eventTypesQ.data,
    boostersQ.data,
    coach,
  ]);

  // Solo a letture ferme: dopo una prenotazione sessioni e blocchi si rileggono
  // con risposte separate, e nel mezzo i due conteggi non coincidono.
  const settled = !bookingsQ.isFetching && !blocksQ.isFetching;
  useEffect(() => {
    if (state && settled) reportPoolMismatches(state.mismatches, sendMismatch, SENT_MISMATCHES);
  }, [state, settled]);

  const retry = () => {
    void profileQ.refetch();
    void blocksQ.refetch();
    void bookingsQ.refetch();
    void extrasQ.refetch();
    void currentBlockQ.refetch();
    if (coachId) void eventTypesQ.refetch();
  };
  const retrying =
    profileQ.isFetching ||
    blocksQ.isFetching ||
    bookingsQ.isFetching ||
    extrasQ.isFetching ||
    eventTypesQ.isFetching ||
    currentBlockQ.isFetching;

  return {
    meId,
    coachId,
    profile,
    profileArrived: arrived(profileQ) || profileQ.errorUpdateCount > 0,
    client,
    blocksQ,
    bookingsQ,
    eventTypesQ,
    loading,
    failed,
    state,
    retry,
    retrying,
  };
}
