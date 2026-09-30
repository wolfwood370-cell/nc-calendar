// ----------------------------------------------------------------------------
// Home (lato cliente, passata 05, audit H1-H7, H9, H10, N1, N5, V1, V2, V8,
// V9, V10)
// ----------------------------------------------------------------------------
// In quest'ordine: il percorso concluso, la prossima sessione (o nessuna), i
// crediti, la valutazione, i progressi, l'installazione. Ogni testo, stato,
// numero e condizione viene da client-home.ts, sopra lo stato dei crediti di
// Prenota: il numero della Home è quello di Prenota (H1). La pagina non legge
// niente da sé: profilo, blocchi, sessioni con le annullate tardi, tipologie
// e crediti da useClientBookState.
// Gli stati, nell'ordine: il caricamento (lo scheletro); una lettura persa (la
// card con «Riprova», che resta mentre rilegge); le sezioni di homeSections.
// Il coach è NO_COACH finché non c'è get_my_coach (02/10/2026), come in
// Prenota e nel dettaglio: i testi dicono «il tuo coach», niente WhatsApp.
// ----------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, type ReactNode } from "react";
import { BookRetryCard } from "@/components/book-blocked-card";
import { ClientTabHeader } from "@/components/client-tab-header";
import { HomeConcludedCard, HomeNextCard, HomeNoNextCard } from "@/components/client-home-next";
import { AuraSkeleton } from "@/components/ui/aura-skeleton";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { NO_COACH } from "@/lib/client-book";
import { homeGreeting, homeNext, homeSections } from "@/lib/client-home";
import { clientPageTitle, homeSubtitle } from "@/lib/client-shell";
import type { BookingRow, EventTypeRow } from "@/lib/queries";

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
const NO_EVENT_TYPES: EventTypeRow[] = [];

function ClientHome() {
  const { now } = useClientShell();
  const { coachId, profile, bookingsQ, eventTypesQ, loading, failed, state, retry, retrying } =
    useClientBookState(now, COACH);
  const contentRef = useRef<HTMLDivElement>(null);

  const bookings = bookingsQ.data ?? NO_BOOKINGS;
  const eventTypes = eventTypesQ.data ?? NO_EVENT_TYPES;
  const next = useMemo(() => homeNext(bookings, now), [bookings, now]);
  const sections = useMemo(
    () => (state ? homeSections({ state, hasNext: next.next !== null, hasRating: false }) : []),
    [state, next.next],
  );

  let content: ReactNode;
  if (loading) {
    content = <HomeSkeleton />;
  } else if (failed || !state) {
    content = (
      <BookRetryCard
        title="La Home non si è caricata"
        text="Non siamo riusciti a leggere le tue sessioni e i tuoi crediti. Riprova tra poco."
        onRetry={retry}
        retrying={retrying}
      />
    );
  } else {
    content = sections.map((section) => {
      if (section === "concluded") {
        return (
          <HomeConcludedCard
            key={section}
            endDate={state.reference?.end_date ?? ""}
            coach={COACH}
          />
        );
      }
      if (section === "next" && next.next) {
        return (
          <HomeNextCard
            key={section}
            booking={next.next}
            eventTypes={eventTypes}
            others={next.others}
            coach={COACH}
            clientName={profile?.full_name ?? null}
          />
        );
      }
      if (section === "no-next") {
        return (
          <HomeNoNextCard key={section} options={state.options} coachId={coachId} coach={COACH} />
        );
      }
      return null;
    });
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
