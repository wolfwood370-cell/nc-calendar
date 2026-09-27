import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ClientProfileDesktop } from "@/components/client-profile-desktop";
import { ClientProfileMobile } from "@/components/client-profile-mobile";
import { useDesktop } from "@/hooks/use-desktop";
import { parseProfileSearch } from "@/lib/client-profile";

// Tab del Profilo nell'URL (passata 06, audit K2): tab=percorso|sessioni;
// tab=pacchetto apre il dialog Pacchetto sulla panoramica.
export const Route = createFileRoute("/trainer/clients/$id")({
  validateSearch: parseProfileSearch,
  head: () => ({
    meta: [
      { title: "Profilo cliente · NC Calendar" },
      {
        name: "description",
        content: "Anagrafica, percorsi attivi, crediti e storico appuntamenti del cliente.",
      },
      { property: "og:title", content: "Profilo cliente · NC Calendar" },
      {
        property: "og:description",
        content: "Anagrafica, percorsi attivi, crediti e storico appuntamenti del cliente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientPathPage,
});

// Sul telefono il Profilo resta com'era (client-profile-mobile.tsx); da md in
// su è quello della passata 06. Se ne monta uno solo: la pagina di prima
// carica i dati da sé e i suoi dialog uscirebbero anche da una versione
// nascosta. Con modifiche al percorso non salvate il desktop resta montato
// anche se la finestra si stringe, così non si perdono.
function ClientPathPage() {
  const { id } = Route.useParams();
  const wide = useDesktop();
  const [holdDesktop, setHoldDesktop] = useState(false);
  if (wide === undefined) return null;
  if (wide || holdDesktop) {
    return <ClientProfileDesktop key={id} onDirtyChange={setHoldDesktop} />;
  }
  return <ClientProfileMobile />;
}
