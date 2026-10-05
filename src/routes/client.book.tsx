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
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { useCoachSlotInputs } from "@/hooks/use-coach-slot-inputs";
import { useMyCoach } from "@/hooks/use-my-coach";
import { useAuth } from "@/lib/auth";
import { bookingRulesText, type CreditWindow } from "@/lib/booking-rules";
import {
  barType,
  barWhen,
  creditLine,
  doneText,
  howToBook,
  initialOption,
  noSlotsText,
  placeLine,
  rulesBlock,
  summaryRule,
  whenLine,
  withCoachLine,
  writeOnWhatsApp,
  writeToCoach,
  type BookOption,
} from "@/lib/client-book";
import { bookSubtitle, clientPageTitle } from "@/lib/client-shell";
import { getClientSlotDays } from "@/lib/client-slots";
import { CARD_TITLE } from "@/lib/client-type";
import { focusIfLost } from "@/lib/focus";
import { renewsAutomatically } from "@/lib/renewal";
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

function BookFlow() {
  const { user } = useAuth();
  const { now } = useClientShell();
  // Il coach dei testi (get_my_coach): senza nome «il tuo coach», e i pulsanti
  // WhatsApp solo col link (il coach di oggi, senza telefono, non ne ha).
  const { coach } = useMyCoach();
  const navigate = useNavigate();
  const eventTypeParam = Route.useSearch({ select: (s) => s.eventType });

  // Lo stato dei crediti e le sue letture: lo stesso hook di Sessioni.
  const {
    meId,
    coachId,
    profile,
    client,
    blocksQ,
    eventTypesQ,
    loading,
    failed,
    state,
    retry,
    retrying,
  } = useClientBookState(now, coach);
  // Gli orari del coach e le loro letture: lo stesso hook di Sposta.
  const {
    availabilityQ,
    exceptionsQ,
    optimizationQ,
    busy,
    slotsFailed,
    slotsReady,
    retrySlots,
    retryingSlots,
  } = useCoachSlotInputs(coachId, now);

  const options = state?.options ?? NO_OPTIONS;

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
          coach: withCoachLine(coach),
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
        text: doneText(slotOption.name, slot.iso, coach, profile?.email ?? null),
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
  const contentRef = useRef<HTMLDivElement>(null);
  const returnFocus = useCallback(
    () => slotsTitleRef.current ?? typesTitleRef.current ?? cardTitleRef.current,
    [],
  );

  // «Riprova» (passata 09, come la Home e Sessioni): riuscito, la card lascia
  // il posto alle sezioni e il pulsante che aveva il focus sparisce con lei: il
  // focus va sul contenitore mentre le sezioni si preparano, poi sul primo
  // titolo; fallito di nuovo, sul titolo della card, che lo annuncia. Solo se
  // il focus si era perso o era ancora nella card: chi intanto è andato
  // altrove resta dov'è.
  const retried = useRef(false);
  const onRetry = () => {
    retried.current = true;
    retry();
  };
  const showRetry = !loading && (failed || !state);
  useEffect(() => {
    const root = contentRef.current;
    if (!retried.current || !root) return;
    if (showRetry) {
      if (retrying) return;
      retried.current = false;
      const title = cardTitleRef.current;
      focusIfLost(title, root, title?.parentElement);
      return;
    }
    if (loading) {
      focusIfLost(root, root);
      return;
    }
    retried.current = false;
    focusIfLost(typesTitleRef.current ?? cardTitleRef.current ?? root, root);
  }, [showRetry, loading, retrying]);
  // Lo stesso per «Orari non aggiornati»: tornati gli orari, il titolo del
  // giorno; fallita di nuovo la lettura, il titolo della card.
  const slotsCardTitleRef = useRef<HTMLHeadingElement>(null);
  const retriedSlots = useRef(false);
  const onRetrySlots = () => {
    retriedSlots.current = true;
    retrySlots();
  };
  const slotsShown = !slotsFailed && slotDays !== null;
  useEffect(() => {
    if (!retriedSlots.current || retryingSlots) return;
    const root = contentRef.current;
    if (slotsFailed) {
      retriedSlots.current = false;
      const title = slotsCardTitleRef.current;
      focusIfLost(title, root, title?.parentElement);
      return;
    }
    if (!slotsShown) return;
    retriedSlots.current = false;
    focusIfLost(slotsTitleRef.current ?? typesTitleRef.current, root);
  }, [retryingSlots, slotsFailed, slotsShown]);

  const howOption = howKey ? (options.find((o) => o.key === howKey) ?? null) : null;
  const how = howOption && state ? howToBook(howOption, state, coach) : null;

  // ---- La pagina --------------------------------------------------------
  const subtitle =
    !loading && !failed && client && blocksQ.data
      ? bookSubtitle(client.path_type, blocksQ.data, now)
      : null;

  let content: ReactNode;
  if (loading) {
    content = <BookSkeleton />;
  } else if (failed || !state) {
    content = (
      <BookRetryCard
        title="Prenota non si è caricata"
        text="Non siamo riusciti a leggere i tuoi crediti. Riprova tra poco."
        onRetry={onRetry}
        retrying={retrying}
        titleRef={cardTitleRef}
      />
    );
  } else if (state.blocked) {
    content = (
      <BookBlockedCard
        blocked={state.blocked}
        whatsapp={coach.whatsapp}
        whatsappLabel={writeToCoach(coach)}
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
              onRetry={onRetrySlots}
              retrying={retryingSlots}
              titleRef={slotsCardTitleRef}
            />
          ) : !slotDays ? (
            <SlotsSkeleton />
          ) : (
            <>
              <section className="flex flex-col gap-2.5">
                <h2 className={CARD_TITLE}>Quando?</h2>
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
                <h2 ref={slotsTitleRef} tabIndex={-1} className={CARD_TITLE}>
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
                      {noSlotsText(bookable.name, slotDays.until, coach)}
                    </p>
                    {coach.whatsapp && (
                      <ClientButton asChild variant="tonal" size="lg" className="self-start">
                        <a href={coach.whatsapp} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="size-4" aria-hidden />
                          {writeToCoach(coach)}
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
      <div
        ref={contentRef}
        tabIndex={-1}
        className="flex flex-col gap-5 px-4 pt-1 pb-6 outline-none"
      >
        {content}
      </div>
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
        whatsappLabel={writeOnWhatsApp(coach)}
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
