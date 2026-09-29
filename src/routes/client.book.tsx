// ----------------------------------------------------------------------------
// Prenota (lato cliente, passata 02, audit B1, B3-B7, N4, O1, V15 e D2)
// ----------------------------------------------------------------------------
// Una schermata sola: «Cosa vuoi prenotare?» con tutte le tipologie del
// cliente, «Quando?» con la fila dei giorni che i crediti coprono e la regola
// sotto, gli orari del giorno a gruppi; la barra d'azione con un orario
// scelto, il riepilogo prima di confermare e l'esito dopo, nello stesso foglio.
// Ogni numero e ogni testo viene da client-book.ts (sopra gli helper della 00);
// i giorni da getClientSlotDays, la regola da bookingRulesText. La pagina non
// genera orari e non conta crediti suoi.
// Gli stati, nell'ordine: caricamento; una lettura dei crediti fallita (mai la
// card dei crediti per una lettura fallita); la card di getBookState quando
// non si prenota; la prenotazione. I fogli stanno fuori da quei rami: dopo
// l'ultimo credito la rilettura può mettere la card al posto della
// prenotazione, e l'esito resta aperto finché il cliente non lo chiude.
// ----------------------------------------------------------------------------

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { addDays, parseISO } from "date-fns";
import { Info, MessageCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookActionBar } from "@/components/book-action-bar";
import { BookBlockedCard, BookRetryCard } from "@/components/book-blocked-card";
import { BookConfirmSheet, BookHowSheet, type BookDone } from "@/components/book-sheets";
import { BookTypePicker } from "@/components/book-type-picker";
import { ClientButton } from "@/components/client-button";
import { ClientDayStrip } from "@/components/client-day-strip";
import { ClientSlotGroups } from "@/components/client-slot-groups";
import { ClientTabHeader } from "@/components/client-tab-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useBookConfirm, type BookConfirmType } from "@/hooks/use-book-confirm";
import { useClientShell } from "@/hooks/use-client-shell";
import { useCurrentBlock } from "@/hooks/use-current-block";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  CLIENT_BOOKING_HORIZON_DAYS,
  bookingRulesText,
  type CreditWindow,
} from "@/lib/booking-rules";
import type { BlockedRange } from "@/lib/booking-slots";
import {
  NO_COACH,
  barType,
  barWhen,
  creditLine,
  doneText,
  getBookState,
  howToBook,
  initialOption,
  noSlotsText,
  placeLine,
  reportPoolMismatches,
  rulesBlock,
  summaryRule,
  whenLine,
  withCoachLine,
  writeOnWhatsApp,
  writeToCoach,
  type BookClient,
  type BookOption,
} from "@/lib/client-book";
import { bookSubtitle, clientPageTitle } from "@/lib/client-shell";
import { getClientSlotDays } from "@/lib/client-slots";
import { toIsoDate } from "@/lib/current-block";
import {
  useActiveShopTitles,
  useClientBlocks,
  useClientBookingsForCredits,
  useClientExtraCredits,
  useCoachAvailability,
  useCoachAvailabilityExceptions,
  useCoachEventTypes,
  useCoachOptimizationEnabled,
} from "@/lib/queries";
import { renewsAutomatically } from "@/lib/renewal";
import { captureMessage } from "@/lib/sentry";
import { formatLongDay } from "@/lib/session-time";

// `eventType` (event_types.id) sceglie la tipologia all'apertura, se è
// prenotabile (la Home ci arriva così). Solo un UUID: altro si ignora.
const BOOK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const Route = createFileRoute("/client/book")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Prenota") },
      {
        name: "description",
        content: "Scegli data, orario e tipologia per prenotare la tua prossima sessione.",
      },
      { property: "og:title", content: clientPageTitle("Prenota") },
      {
        property: "og:description",
        content: "Scegli data, orario e tipologia per prenotare la tua prossima sessione.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookFlow,
  validateSearch: (search: Record<string, unknown>): { eventType?: string } => {
    const v = search.eventType;
    return typeof v === "string" && BOOK_UUID_RE.test(v) ? { eventType: v } : {};
  },
});

// Il coach nei testi. Il cliente oggi non legge il profilo del coach (nessuna
// policy di profiles glielo dà, e nel backup il coach non ha il telefono):
// nome e WhatsApp arriveranno da get_my_coach, con le migrazioni del 02/10/2026.
// Fino ad allora i testi dicono «il tuo coach» e i pulsanti WhatsApp non ci sono.
const COACH = NO_COACH;

// Le incoerenze dei crediti già mandate a Sentry, per tutta la vita della
// pagina: il ridisegno ogni 30 secondi (useNow) non le rimanda.
const SENT_MISMATCHES = new Set<string>();
const sendMismatch = (message: string) => {
  captureMessage(message, "warning");
};

const NO_OPTIONS: BookOption[] = [];

/**
 * L'orario scelto, con la tipologia, il suo giorno e la finestra dei crediti
 * di quel giorno quando è stato scelto (la finestra vera si rilegge dai giorni).
 */
interface ChosenSlot {
  key: string;
  iso: string;
  time: string;
  end: string;
  day: string;
  window: CreditWindow;
}

interface BusyRow {
  scheduled_at: string;
  duration: number | null;
  buffer_minutes: number | null;
}

function BookFlow() {
  const { user } = useAuth();
  const meId = user?.id;
  const { now } = useClientShell();
  const navigate = useNavigate();
  const eventTypeParam = Route.useSearch({ select: (s) => s.eventType });

  // Il profilo con una chiave sua: ["profile", id] la usano altri con altre colonne.
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
  const availabilityQ = useCoachAvailability(coachId);
  const exceptionsQ = useCoachAvailabilityExceptions(coachId);
  const optimizationQ = useCoachOptimizationEnabled(coachId);
  const boostersQ = useActiveShopTitles();

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
      coach: COACH,
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
  ]);
  const options = state?.options ?? NO_OPTIONS;

  // Solo a letture ferme: dopo una prenotazione sessioni e blocchi si rileggono
  // con risposte separate, e nel mezzo i due conteggi non coincidono.
  const settled = !bookingsQ.isFetching && !blocksQ.isFetching;
  useEffect(() => {
    if (state && settled) reportPoolMismatches(state.mismatches, sendMismatch, SENT_MISMATCHES);
  }, [state, settled]);

  // ---- Le scelte --------------------------------------------------------
  const [typeKey, setTypeKey] = useState<string | null>(null);
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [slot, setSlot] = useState<ChosenSlot | null>(null);
  const [sheet, setSheet] = useState<"confirm" | "how" | null>(null);
  const [howKey, setHowKey] = useState<string | null>(null);
  const [done, setDone] = useState<BookDone | null>(null);
  const [error, setError] = useState<string | null>(null);

  const writeEventType = useCallback(
    (o: BookOption | null) => {
      void navigate({
        to: "/client/book",
        search: o?.eventTypeId ? { eventType: o.eventTypeId } : {},
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  // All'apertura la tipologia di eventType, se è prenotabile; poi quella scelta.
  const initialKey = state ? (initialOption(options, eventTypeParam)?.key ?? null) : null;
  const optionKey = typeKey ?? initialKey;
  const option = options.find((o) => o.key === optionKey) ?? null;
  const bookable = option?.state === "prenotabile" ? option : null;

  useEffect(() => {
    if (typeKey === null && initialKey !== null) setTypeKey(initialKey);
  }, [typeKey, initialKey]);

  // La tipologia scelta non è più prenotabile (ne ha usato l'ultimo credito, o
  // una rilettura): la scelta passa alla prima prenotabile. Col riepilogo o
  // l'esito aperti, alla loro chiusura: un errore resta nel foglio col suo orario.
  useEffect(() => {
    if (!state || sheet === "confirm" || typeKey === null) return;
    if (option?.state === "prenotabile") return;
    const next = initialOption(options);
    setTypeKey(next?.key ?? null);
    setDayIso(null);
    setSlot(null);
    writeEventType(next);
  }, [state, sheet, typeKey, option, options, writeEventType]);

  const chooseType = (o: BookOption) => {
    setTypeKey(o.key);
    setDayIso(null);
    setSlot(null);
    writeEventType(o);
  };
  const explain = (o: BookOption) => {
    setHowKey(o.key);
    setSheet("how");
  };

  // ---- Giorni e orari ---------------------------------------------------
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
  const slotDays = useMemo(() => {
    if (!bookable || !slotsReady || slotsFailed) return null;
    return getClientSlotDays({
      now,
      durationMin: bookable.durationMin,
      bufferMin: bookable.bufferMin,
      availability: availabilityQ.data ?? [],
      exceptions: exceptionsQ.data ?? [],
      busy,
      windows: bookable.windows,
      optimization: optimizationQ.data ?? true,
    });
  }, [
    bookable,
    slotsReady,
    slotsFailed,
    now,
    availabilityQ.data,
    exceptionsQ.data,
    busy,
    optimizationQ.data,
  ]);
  // Il giorno è il primo con orari, e resta finché ne ha: quello mostrato si
  // ricorda, così un giorno prima che si libera non gli passa davanti.
  const days = slotDays?.days ?? [];
  const day =
    days.find((d) => d.isoDate === dayIso && d.slots.length > 0) ??
    days.find((d) => d.slots.length > 0) ??
    null;
  const shownDay = day?.isoDate ?? null;
  useEffect(() => {
    if (shownDay !== null && shownDay !== dayIso) setDayIso(shownDay);
  }, [shownDay, dayIso]);

  // L'orario scelto si toglie quando non c'è più fra gli orari, a foglio chiuso.
  const slotListed =
    slot !== null && slot.key === bookable?.key && !!day?.slots.some((s) => s.iso === slot.iso);
  const confirmOpen = sheet === "confirm" && done === null;
  useEffect(() => {
    if (slot && !slotListed && !confirmOpen) setSlot(null);
  }, [slot, slotListed, confirmOpen]);
  const barSlot = slot && (slotListed || confirmOpen) ? slot : null;

  const pickDay = (isoDate: string) => {
    if (isoDate === day?.isoDate) return;
    setDayIso(isoDate);
    setSlot(null);
  };
  const pickSlot = (iso: string) => {
    const s = day?.slots.find((x) => x.iso === iso);
    if (!bookable || !day?.window || !s) return;
    setSlot({
      key: bookable.key,
      iso: s.iso,
      time: s.time,
      end: s.end,
      day: day.isoDate,
      window: day.window,
    });
  };
  // Il credito si prende dalla finestra di adesso del giorno scelto: dopo una
  // rilettura può essere cambiata (un Booster, crediti aggiunti al blocco).
  const slotWindow =
    slot === null
      ? null
      : ((slot.key === bookable?.key
          ? days.find((d) => d.isoDate === slot.day)?.window
          : undefined) ?? slot.window);

  const rule =
    bookable && state && client
      ? bookingRulesText({
          now,
          pathType: client.path_type,
          renews: renewsAutomatically(client),
          reference: rulesBlock(state.reference, state.referenceNumber),
          next: rulesBlock(state.next, state.nextNumber),
          windows: bookable.windows,
        })
      : "";

  // ---- Riepilogo e prenotazione ----------------------------------------
  const slotOption = slot ? (options.find((o) => o.key === slot.key) ?? null) : null;
  const summary =
    slot && slotOption && slotWindow && state
      ? {
          name: slotOption.name,
          color: slotOption.color,
          durationMin: slotOption.durationMin,
          online: slotOption.location === "online",
          when: whenLine(slot),
          coach: withCoachLine(COACH),
          place: placeLine(slotOption),
          credit: creditLine(slotOption, slotWindow, state),
          rule: summaryRule(slot.iso, now),
        }
      : null;
  const confirmType: BookConfirmType | null = slotOption
    ? {
        eventTypeId: slotOption.eventTypeId,
        sessionType: slotOption.sessionType,
        name: slotOption.name,
        durationMin: slotOption.durationMin,
        location: slotOption.location,
        color: slotOption.color,
        description:
          eventTypesQ.data?.find((t) => t.id === slotOption.eventTypeId)?.description ?? null,
      }
    : null;
  const { confirm, confirming } = useBookConfirm({
    meId,
    coachId,
    meName: profile?.full_name ?? user?.email ?? "Cliente",
    mePhone: profile?.phone ?? null,
    type: confirmType,
    iso: slot?.iso ?? null,
    window: slotWindow,
  });
  // Un riepilogo rimasto senza contenuto si chiude: aperto e vuoto si
  // riaprirebbe da solo alla prossima scelta.
  const hasSummary = summary !== null;
  useEffect(() => {
    if (sheet === "confirm" && done === null && !hasSummary) setSheet(null);
  }, [sheet, done, hasSummary]);

  const openConfirm = () => {
    setDone(null);
    setError(null);
    setSheet("confirm");
  };
  const onConfirm = async () => {
    if (!slot || !slotOption) return;
    setError(null);
    const result = await confirm();
    if (result.ok) {
      setDone({
        bookingId: result.bookingId,
        text: doneText(slotOption.name, slot.iso, COACH, profile?.email ?? null),
      });
      setSlot(null);
    } else {
      setError(result.error);
    }
    // Chiuso con Esc o trascinando mentre confermava: l'esito (o l'errore) si vede lo stesso.
    setSheet("confirm");
  };

  // Chiuso l'esito il focus torna nel contenuto: «Continua» non c'è più.
  const slotsTitleRef = useRef<HTMLHeadingElement>(null);
  const typesTitleRef = useRef<HTMLHeadingElement>(null);
  const cardTitleRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useCallback(
    () => slotsTitleRef.current ?? typesTitleRef.current ?? cardTitleRef.current,
    [],
  );

  const howOption = howKey ? (options.find((o) => o.key === howKey) ?? null) : null;
  const how = howOption && state ? howToBook(howOption, state, COACH) : null;

  // ---- La pagina --------------------------------------------------------
  const subtitle =
    !loading && !failed && client && blocksQ.data
      ? bookSubtitle(client.path_type, blocksQ.data, now)
      : null;

  const retryAll = () => {
    void profileQ.refetch();
    void blocksQ.refetch();
    void bookingsQ.refetch();
    void extrasQ.refetch();
    void currentBlockQ.refetch();
    if (coachId) void eventTypesQ.refetch();
  };
  const retrySlots = () => {
    if (!coachId) return;
    void availabilityQ.refetch();
    void exceptionsQ.refetch();
    void busyQ.refetch();
  };

  let content: ReactNode;
  if (loading) {
    content = <BookSkeleton />;
  } else if (failed || !state) {
    content = (
      <BookRetryCard
        title="Prenota non si è caricata"
        text="Non siamo riusciti a leggere i tuoi crediti. Riprova tra poco."
        onRetry={retryAll}
        retrying={
          profileQ.isFetching ||
          blocksQ.isFetching ||
          bookingsQ.isFetching ||
          extrasQ.isFetching ||
          eventTypesQ.isFetching ||
          currentBlockQ.isFetching
        }
        titleRef={cardTitleRef}
      />
    );
  } else if (state.blocked) {
    content = (
      <BookBlockedCard
        blocked={state.blocked}
        whatsapp={COACH.whatsapp}
        whatsappLabel={writeToCoach(COACH)}
        titleRef={cardTitleRef}
      />
    );
  } else {
    content = (
      <>
        <BookTypePicker
          options={options}
          selectedKey={bookable?.key ?? null}
          onSelect={chooseType}
          onExplain={explain}
          titleRef={typesTitleRef}
        />
        {bookable &&
          (slotsFailed ? (
            <BookRetryCard
              title="Orari non aggiornati"
              text="Non siamo riusciti a leggere gli orari liberi. Riprova tra poco."
              onRetry={retrySlots}
              retrying={availabilityQ.isFetching || exceptionsQ.isFetching || busyQ.isFetching}
            />
          ) : !slotDays ? (
            <SlotsSkeleton />
          ) : (
            <>
              <section className="flex flex-col gap-2.5">
                <h2 className="text-[17px] font-bold">Quando?</h2>
                <ClientDayStrip
                  // Una fila nuova per tipologia: riparte dal giorno scelto
                  // anche se è lo stesso di prima, e la fila era scorsa altrove.
                  key={bookable.key}
                  days={slotDays.days}
                  selectedIso={day?.isoDate ?? null}
                  onSelect={pickDay}
                />
                <p className="flex gap-2 text-[13px] leading-normal text-on-surface-variant">
                  <Info className="mt-px size-4 shrink-0 text-primary-container" aria-hidden />
                  <span>{rule}</span>
                </p>
              </section>
              <section className="flex flex-col gap-3">
                <h2 ref={slotsTitleRef} tabIndex={-1} className="text-[17px] font-bold">
                  {day ? formatLongDay(day.date) : "Orari"}
                </h2>
                {day ? (
                  <ClientSlotGroups
                    day={day}
                    selectedIso={barSlot?.iso ?? null}
                    onSelect={pickSlot}
                  />
                ) : (
                  <div className="flex flex-col gap-2.5 rounded-[18px] border border-surface-variant bg-white px-4 py-3.5">
                    <p className="text-[15px] leading-normal text-on-surface-variant">
                      {noSlotsText(bookable.name, slotDays.until, COACH)}
                    </p>
                    {COACH.whatsapp && (
                      <ClientButton asChild variant="tonal" size="lg" className="self-start">
                        <a href={COACH.whatsapp} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="size-4" aria-hidden />
                          {writeToCoach(COACH)}
                        </a>
                      </ClientButton>
                    )}
                  </div>
                )}
              </section>
            </>
          ))}
      </>
    );
  }

  const barOption = barSlot ? (options.find((o) => o.key === barSlot.key) ?? null) : null;

  return (
    // Una colonna alta almeno quanto lo schermo, meno lo spazio che il layout
    // tiene sotto il contenuto (e da md l'header e il margine sopra): la barra
    // d'azione, ultima, ci si attacca in fondo (book-action-bar.tsx).
    <div className="flex min-h-[calc(100dvh_-_65px_-_max(6px,env(safe-area-inset-bottom))_-_24px)] flex-col md:min-h-[calc(100dvh_-_105px_-_env(safe-area-inset-bottom))]">
      <ClientTabHeader title="Prenota" subtitle={subtitle} />
      <div className="flex flex-col gap-5 px-4 pt-1 pb-6">{content}</div>
      {barSlot && barOption && (
        <BookActionBar type={barType(barOption)} when={barWhen(barSlot)} onContinue={openConfirm} />
      )}
      <BookConfirmSheet
        open={sheet === "confirm"}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        summary={summary}
        done={done}
        error={error}
        confirming={confirming}
        onConfirm={() => void onConfirm()}
        returnFocus={returnFocus}
      />
      <BookHowSheet
        open={sheet === "how"}
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        how={how}
        eventTypeId={howOption?.eventTypeId ?? null}
        whatsappLabel={writeOnWhatsApp(COACH)}
      />
    </div>
  );
}

/** Il caricamento: tre righe di tipologia, la fila dei giorni, una griglia di orari. */
function BookSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-6 w-48" />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-[18px]" />
        ))}
      </div>
      <SlotsSkeleton />
    </div>
  );
}

function SlotsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-[60px] shrink-0 rounded-[18px]" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}
