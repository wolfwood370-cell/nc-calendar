// ----------------------------------------------------------------------------
// Lo stato dei crediti del cliente (lato cliente, passata 03, audit H1)
// ----------------------------------------------------------------------------
// getBookState sopra le letture di Prenota: il profilo, i blocchi, le sessioni
// con le annullate tardi (useClientBookingsForCredits), i crediti extra,
// ensure_client_block_state, le tipologie del coach e i titoli dei Booster in
// vendita (sellablePackTitles sui pacchetti dello Store, dalla passata 09); la
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
// Per lo Store (06) restituisce anche extrasQ (gli acquisti, che rilegge
// mentre aspetta il webhook) e input, l'ingresso da cui viene state.
// ----------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentBlock } from "@/hooks/use-current-block";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getBookState,
  reportPoolMismatches,
  type BookClient,
  type BookCoach,
  type BookStateInput,
} from "@/lib/client-book";
import { sellablePackTitles } from "@/lib/client-store";
import {
  useBoosterPacks,
  useClientBlocks,
  useClientBookingsForCredits,
  useClientExtraCredits,
  useCoachEventTypes,
} from "@/lib/queries";
import { arrivedRead, lostRead } from "@/lib/query-state";
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

  // Il profilo con una chiave sua: la cornice (use-client-shell.ts) lo legge
  // con altre colonne, e una chiave in comune le mescolerebbe nella cache.
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
  // «Acquista» solo per le tipologie con un pacchetto che lo Store vende
  // (passata 09): gli stessi pacchetti e lo stesso filtro dello Store, non
  // tutti i titoli attivi (useActiveShopTitles resta per il coach).
  const packsQ = useBoosterPacks();
  const boosterTitles = useMemo(() => sellablePackTitles(packsQ.data ?? []), [packsQ.data]);

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

  // Arrivata: coi dati o con l'errore, e lo resta mentre una lettura fallita
  // si rilegge (arrivedRead). L'RPC in errore conta come arrivata. Persa:
  // senza dati, in errore o riletta dopo un errore (lostRead): con «Riprova»
  // resta la card dell'errore, mai lo scheletro. Una rilettura fallita in
  // background tiene i dati di prima (TanStack Query) e non toglie la pagina
  // né un foglio aperto.
  const loading =
    !meId ||
    !arrivedRead(profileQ) ||
    !arrivedRead(blocksQ) ||
    !arrivedRead(bookingsQ) ||
    !arrivedRead(extrasQ) ||
    (coachId !== null && !arrivedRead(eventTypesQ)) ||
    !arrivedRead(currentBlockQ) ||
    waitingBlocks;
  const failed =
    lostRead(profileQ) ||
    lostRead(blocksQ) ||
    lostRead(bookingsQ) ||
    lostRead(extrasQ) ||
    lostRead(eventTypesQ) ||
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

  // L'ingresso di getBookState, restituito anche da solo: lo Store (06) lo usa
  // per il riepilogo e per l'esito del pagamento, invece di ricostruirlo.
  const input = useMemo<BookStateInput | null>(() => {
    if (loading || failed || !client || !blocksQ.data || !bookingsQ.data || !extrasQ.data) {
      return null;
    }
    return {
      now,
      client,
      blocks: blocksQ.data,
      bookings: bookingsQ.data,
      extras: extrasQ.data,
      eventTypes: eventTypesQ.data ?? [],
      boosterTitles,
      coach,
    };
  }, [
    loading,
    failed,
    client,
    now,
    blocksQ.data,
    bookingsQ.data,
    extrasQ.data,
    eventTypesQ.data,
    boosterTitles,
    coach,
  ]);
  const state = useMemo(() => (input ? getBookState(input) : null), [input]);

  // Solo a letture ferme: dopo una prenotazione sessioni e blocchi si rileggono
  // con risposte separate, e nel mezzo i due conteggi non coincidono.
  const settled = !bookingsQ.isFetching && !blocksQ.isFetching;
  useEffect(() => {
    if (state && settled) reportPoolMismatches(state.mismatches, sendMismatch, SENT_MISMATCHES);
  }, [state, settled]);

  // Stabile fra un disegno e l'altro (passata 09): la cornice lo mette fra le
  // dipendenze del suo «Riprova», e uno nuovo a ogni disegno rifaceva il
  // contesto della cornice per tutte le pagine. refetch di TanStack Query non
  // cambia fra un disegno e l'altro. Rilegge anche i pacchetti dello Store.
  const refetchProfile = profileQ.refetch;
  const refetchBlocksAll = blocksQ.refetch;
  const refetchBookings = bookingsQ.refetch;
  const refetchExtras = extrasQ.refetch;
  const refetchCurrent = currentBlockQ.refetch;
  const refetchTypes = eventTypesQ.refetch;
  const refetchPacks = packsQ.refetch;
  const retry = useCallback(() => {
    void refetchProfile();
    void refetchBlocksAll();
    void refetchBookings();
    void refetchExtras();
    void refetchCurrent();
    void refetchPacks();
    if (coachId) void refetchTypes();
  }, [
    refetchProfile,
    refetchBlocksAll,
    refetchBookings,
    refetchExtras,
    refetchCurrent,
    refetchPacks,
    refetchTypes,
    coachId,
  ]);
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
    profileArrived: arrivedRead(profileQ),
    client,
    blocksQ,
    bookingsQ,
    eventTypesQ,
    extrasQ,
    loading,
    failed,
    state,
    input,
    retry,
    retrying,
  };
}
