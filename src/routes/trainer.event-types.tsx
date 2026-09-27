import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EventTypesDesktop } from "@/components/event-types-desktop";
import { EventTypesMobile } from "@/components/event-types-mobile";
import { useDesktop } from "@/hooks/use-desktop";

export const Route = createFileRoute("/trainer/event-types")({
  head: () => ({
    meta: [
      { title: "Tipologie di sessione · NC Calendar" },
      {
        name: "description",
        content: "Configura durata, colore e regole di prenotazione di ogni tipologia di sessione.",
      },
      { property: "og:title", content: "Tipologie di sessione · NC Calendar" },
      {
        property: "og:description",
        content: "Configura durata, colore e regole di prenotazione di ogni tipologia di sessione.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EventTypesPage,
});

// Sul telefono la pagina resta com'era (event-types-mobile.tsx); da md in su
// è quella della passata 07. Se ne monta una sola, come nel Profilo: la
// pagina di prima carica i dati da sé e i suoi dialog uscirebbero anche da
// una versione nascosta. Con un dialog aperto il desktop resta montato anche
// se la finestra si stringe, così le modifiche non si perdono.
function EventTypesPage() {
  const wide = useDesktop();
  const [holdDesktop, setHoldDesktop] = useState(false);
  if (wide === undefined) return null;
  if (wide || holdDesktop) return <EventTypesDesktop onHoldChange={setHoldDesktop} />;
  return <EventTypesMobile />;
}
