// ----------------------------------------------------------------------------
// Home (lato cliente, passata 05, audit H1-H7, H9, H10, N1, N5, V1, V2, V8,
// V9, V10)
// ----------------------------------------------------------------------------
// In quest'ordine: il percorso concluso, la prossima sessione (o nessuna), i
// crediti, la valutazione, i progressi, l'installazione. Ogni testo, stato,
// numero e condizione viene da client-home.ts, sopra lo stato dei crediti di
// Prenota: il numero della Home è quello di Prenota (H1). La pagina non legge
// niente da sé: profilo, blocchi, sessioni con le annullate tardi, tipologie
// e crediti da useClientBookState, le valutazioni da useClientFeedback, le
// misurazioni da useBiaMeasurements.
// Gli stati, nell'ordine: il caricamento (lo scheletro); una lettura persa (la
// card con «Riprova», che resta mentre rilegge); le sezioni di homeSections.
// Progressi e installazione non dipendono dalla lettura dei crediti.
// Il focus non finisce mai sul body: dopo «Conferma presenza» e dopo lo
// spostamento sul titolo della prossima sessione; dopo «Invia valutazione»
// sul titolo della valutazione, che resta sulla sessione appena valutata
// (shownId) invece di sparire alla rilettura; dopo «Non ora» e «Ho installato
// l'app» sull'ultimo titolo prima della card d'installazione, altrimenti sul
// contenuto; dopo «Riprova» riuscito sul primo titolo.
// Il coach è NO_COACH finché non c'è get_my_coach (02/10/2026), come in
// Prenota e nel dettaglio: i testi dicono «il tuo coach», niente WhatsApp.
// ----------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BookRetryCard } from "@/components/book-blocked-card";
import { HomeCreditsCard } from "@/components/client-home-credits";
import { HomeInstallCard } from "@/components/client-home-install";
import { HomeConcludedCard, HomeNextCard, HomeNoNextCard } from "@/components/client-home-next";
import { HomeProgressCard } from "@/components/client-home-progress";
import { ClientSessionRating } from "@/components/client-session-rating";
import { ClientTabHeader } from "@/components/client-tab-header";
import { AuraSkeleton } from "@/components/ui/aura-skeleton";
import { useBiaMeasurements } from "@/hooks/use-bia";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { useClientFeedback } from "@/hooks/use-session-feedback";
import { NO_COACH } from "@/lib/client-book";
import {
  homeGreeting,
  homeNext,
  homeRating,
  homeSections,
  ratingSubtitle,
} from "@/lib/client-home";
import { sessionName } from "@/lib/client-sessions";
import { clientPageTitle, homeSubtitle } from "@/lib/client-shell";
import type { BlockRow, BookingRow, EventTypeRow } from "@/lib/queries";

export const Route = createFileRoute("/client/")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Home") },
      {
        name: "description",
        content:
          "Le tue sessioni, i crediti disponibili e i prossimi appuntamenti in un colpo d'occhio.",
      },
      { property: "og:title", content: clientPageTitle("Home") },
      {
        property: "og:description",
        content:
          "Le tue sessioni, i crediti disponibili e i prossimi appuntamenti in un colpo d'occhio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientHome,
});

// Il coach nei testi: il cliente oggi non legge il profilo del coach. Nome e
// WhatsApp arriveranno da get_my_coach, con le migrazioni del 02/10/2026.
const COACH = NO_COACH;

const NO_BOOKINGS: BookingRow[] = [];
const NO_BLOCKS: BlockRow[] = [];
const NO_EVENT_TYPES: EventTypeRow[] = [];

function ClientHome() {
  const { now } = useClientShell();
  const {
    meId,
    coachId,
    profile,
    client,
    blocksQ,
    bookingsQ,
    eventTypesQ,
    loading,
    failed,
    state,
    retry,
    retrying,
  } = useClientBookState(now, COACH);
  const feedbackQ = useClientFeedback(meId);
  const biaQ = useBiaMeasurements(meId);
  const contentRef = useRef<HTMLDivElement>(null);
  // La sessione della valutazione mostrata: resta dopo «Invia valutazione».
  const [shownId, setShownId] = useState<string | null>(null);

  const blocks = blocksQ.data ?? NO_BLOCKS;
  const bookings = bookingsQ.data ?? NO_BOOKINGS;
  const eventTypes = eventTypesQ.data ?? NO_EVENT_TYPES;
  const typeOf = (b: BookingRow) => eventTypes.find((t) => t.id === b.event_type_id) ?? null;

  const next = useMemo(() => homeNext(bookings, now), [bookings, now]);
  const rating = useMemo(
    () => homeRating(bookings, feedbackQ.data, shownId, now),
    [bookings, feedbackQ.data, shownId, now],
  );
  const ratedId = rating?.booking.id ?? null;
  useEffect(() => {
    if (ratedId !== null && ratedId !== shownId) setShownId(ratedId);
  }, [ratedId, shownId]);
  const sections = useMemo(
    () =>
      state ? homeSections({ state, hasNext: next.next !== null, hasRating: rating !== null }) : [],
    [state, next.next, rating],
  );

  // Dove va il focus quando la card d'installazione sparisce: l'ultimo titolo
  // prima di lei, altrimenti il contenuto.
  const beforeInstall = () => {
    const root = contentRef.current;
    if (!root) return null;
    const titles = Array.from(root.querySelectorAll<HTMLElement>("h2")).filter(
      (h) => !h.closest("[data-home-install]"),
    );
    return titles[titles.length - 1] ?? root;
  };

  // «Riprova» riuscito: la card lascia il posto allo scheletro e poi alle
  // sezioni, e il pulsante che aveva il focus sparisce con lei. Il focus va
  // sul contenuto e, a sezioni pronte, sul primo titolo.
  const retried = useRef(false);
  const onRetry = () => {
    retried.current = true;
    retry();
  };
  const showRetry = !loading && (failed || !state);
  useEffect(() => {
    const root = contentRef.current;
    if (!retried.current || showRetry || !root) return;
    const active = document.activeElement;
    const lost = !active || active === document.body || active === root;
    if (loading) {
      if (lost) root.focus({ preventScroll: true });
      return;
    }
    retried.current = false;
    if (lost) (root.querySelector<HTMLElement>("h2") ?? root).focus({ preventScroll: true });
  }, [showRetry, loading]);

  const section = (key: string): ReactNode => {
    if (!state) return null;
    if (key === "concluded") {
      return (
        <HomeConcludedCard key={key} endDate={state.reference?.end_date ?? ""} coach={COACH} />
      );
    }
    if (key === "next" && next.next) {
      return (
        <HomeNextCard
          key={key}
          booking={next.next}
          eventTypes={eventTypes}
          others={next.others}
          coach={COACH}
          clientName={profile?.full_name ?? null}
        />
      );
    }
    if (key === "no-next") {
      return <HomeNoNextCard key={key} options={state.options} coachId={coachId} coach={COACH} />;
    }
    if (key === "credits" && client) {
      return (
        <HomeCreditsCard key={key} client={client} blocks={blocks} state={state} coach={COACH} />
      );
    }
    if (key === "rating" && rating && meId) {
      const b = rating.booking;
      return (
        <ClientSessionRating
          key={b.id}
          bookingId={b.id}
          clientId={meId}
          rating={rating.rating}
          note={rating.note}
          editable
          coach={COACH}
          layout="home"
          subtitle={ratingSubtitle(sessionName(b, typeOf(b)), b, COACH)}
        />
      );
    }
    return null;
  };

  let content: ReactNode;
  if (loading) {
    content = <HomeSkeleton />;
  } else if (showRetry) {
    content = (
      <BookRetryCard
        title="La Home non si è caricata"
        text="Non siamo riusciti a leggere le tue sessioni e i tuoi crediti. Riprova tra poco."
        onRetry={onRetry}
        retrying={retrying}
      />
    );
  } else {
    content = sections.map(section);
  }

  return (
    <div>
      <ClientTabHeader title={homeGreeting(profile?.full_name)} subtitle={homeSubtitle(now)} />
      <div
        ref={contentRef}
        tabIndex={-1}
        className="flex flex-col gap-4 px-4 pt-1 pb-6 outline-none"
      >
        {content}
        {biaQ.data && <HomeProgressCard measurements={biaQ.data} coach={COACH} />}
        {meId && <HomeInstallCard userId={meId} returnFocus={beforeInstall} />}
      </div>
    </div>
  );
}

/** Il caricamento: due card alte quanto la prossima sessione e i crediti. */
function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <AuraSkeleton className="h-[236px] rounded-[24px]" />
      <AuraSkeleton className="h-[320px] rounded-[24px]" />
    </div>
  );
}
