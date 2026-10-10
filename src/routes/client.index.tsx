// ----------------------------------------------------------------------------
// Home (lato cliente, passata 05, audit H1-H7, H10, N1, N5, V1, V2, V8, V9,
// V10)
// ----------------------------------------------------------------------------
// In quest'ordine: il percorso concluso, la prossima sessione (o nessuna), i
// crediti, i progressi, l'installazione. Ogni testo, stato, numero e
// condizione viene da client-home.ts, sopra lo stato dei crediti di Prenota:
// il numero della Home è quello di Prenota (H1). La pagina non legge niente da
// sé: profilo, blocchi, sessioni con le annullate tardi, tipologie e crediti
// da useClientBookState, le misurazioni da useBiaMeasurements.
// Gli stati, nell'ordine: il caricamento (lo scheletro); una lettura persa (la
// card con «Riprova», che resta mentre rilegge); le sezioni di homeSections.
// Progressi e installazione non dipendono dalla lettura dei crediti.
// Il focus non finisce mai sul body: dopo «Conferma presenza» e dopo lo
// spostamento sul titolo della prossima sessione; dopo «Non ora» e «Ho
// installato l'app» sull'ultimo titolo prima della card d'installazione,
// altrimenti sul contenuto; dopo «Riprova» riuscito sul primo titolo.
// Il coach viene da useMyCoach (get_my_coach), come in Prenota e nel
// dettaglio: finché non arriva, o senza nome, i testi dicono «il tuo coach»,
// e i pulsanti WhatsApp ci sono solo col link.
// ----------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { BookRetryCard } from "@/components/book-blocked-card";
import { HomeCreditsCard } from "@/components/client-home-credits";
import { HomeInstallCard } from "@/components/client-home-install";
import { HomeConcludedCard, HomeNextCard, HomeNoNextCard } from "@/components/client-home-next";
import { HomeProgressCard } from "@/components/client-home-progress";
import { ClientTabHeader } from "@/components/client-tab-header";
import { AuraSkeleton } from "@/components/ui/aura-skeleton";
import { useBiaMeasurements } from "@/hooks/use-bia";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { useMyCoach } from "@/hooks/use-my-coach";
import { homeGreeting, homeNext, homeSections } from "@/lib/client-home";
import { clientPageTitle, homeSubtitle } from "@/lib/client-shell";
import type { BlockRow, BookingRow, EventTypeRow } from "@/lib/queries";

// La parola del lato cliente è «sessione» (passata 09, il brief).
const DESCRIPTION = "Le tue prossime sessioni e i crediti disponibili in un colpo d'occhio.";

export const Route = createFileRoute("/client/")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Home") },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: clientPageTitle("Home") },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientHome,
});

const NO_BOOKINGS: BookingRow[] = [];
const NO_BLOCKS: BlockRow[] = [];
const NO_EVENT_TYPES: EventTypeRow[] = [];

function ClientHome() {
  const { now } = useClientShell();
  // Il coach dei testi (get_my_coach): senza nome «il tuo coach».
  const { coach } = useMyCoach();
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
  } = useClientBookState(now, coach);
  const biaQ = useBiaMeasurements(meId);
  const contentRef = useRef<HTMLDivElement>(null);

  const blocks = blocksQ.data ?? NO_BLOCKS;
  const bookings = bookingsQ.data ?? NO_BOOKINGS;
  const eventTypes = eventTypesQ.data ?? NO_EVENT_TYPES;

  const next = useMemo(() => homeNext(bookings, now), [bookings, now]);
  const sections = useMemo(
    () => (state ? homeSections({ state, hasNext: next.next !== null }) : []),
    [state, next.next],
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
        <HomeConcludedCard key={key} endDate={state.reference?.end_date ?? ""} coach={coach} />
      );
    }
    if (key === "next" && next.next) {
      return (
        <HomeNextCard
          key={key}
          booking={next.next}
          eventTypes={eventTypes}
          others={next.others}
          coach={coach}
          clientName={profile?.full_name ?? null}
        />
      );
    }
    if (key === "no-next") {
      return <HomeNoNextCard key={key} options={state.options} coachId={coachId} coach={coach} />;
    }
    if (key === "credits" && client) {
      return (
        <HomeCreditsCard key={key} client={client} blocks={blocks} state={state} coach={coach} />
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
        {biaQ.data && <HomeProgressCard measurements={biaQ.data} coach={coach} />}
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
