import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AvailabilityDesktop } from "@/components/availability-desktop";
import { AvailabilityMobile } from "@/components/availability-mobile";
import { useDesktop } from "@/hooks/use-desktop";

export const Route = createFileRoute("/trainer/availability")({
  head: () => ({
    meta: [
      { title: "Disponibilità · NC Calendar" },
      {
        name: "description",
        content: "Imposta orari di lavoro, eccezioni e regole di prenotazione.",
      },
      { property: "og:title", content: "Disponibilità · NC Calendar" },
      {
        property: "og:description",
        content: "Imposta orari di lavoro, eccezioni e regole di prenotazione.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AvailabilityPage,
});

// Sul telefono la pagina resta com'era (availability-mobile.tsx); da md in su
// è quella della passata 08. Se ne monta una sola, come nel Profilo e nelle
// Tipologie: la pagina di prima carica i dati da sé. Con orari non salvati il
// desktop resta montato anche se la finestra si stringe, così la bozza non
// si perde.
function AvailabilityPage() {
  const wide = useDesktop();
  const [holdDesktop, setHoldDesktop] = useState(false);
  if (wide === undefined) return null;
  if (wide || holdDesktop) return <AvailabilityDesktop onHoldChange={setHoldDesktop} />;
  return <AvailabilityMobile />;
}
