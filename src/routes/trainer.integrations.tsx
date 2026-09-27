import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsDesktop } from "@/components/integrations-desktop";
import { IntegrationsMobile } from "@/components/integrations-mobile";
import { useDesktop } from "@/hooks/use-desktop";

export const Route = createFileRoute("/trainer/integrations")({
  head: () => ({
    meta: [
      { title: "Integrazioni · NC Calendar" },
      {
        name: "description",
        content: "Stato di Google Calendar e sincronizzazione degli appuntamenti.",
      },
      { property: "og:title", content: "Integrazioni · NC Calendar" },
      {
        property: "og:description",
        content: "Stato di Google Calendar e sincronizzazione degli appuntamenti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

// Sul telefono la pagina resta com'era (integrations-mobile.tsx); da md in su
// è quella della passata 09. Se ne monta una sola, come nella Disponibilità:
// la pagina di prima carica i dati da sé.
function IntegrationsPage() {
  const wide = useDesktop();
  if (wide === undefined) return null;
  if (wide) return <IntegrationsDesktop />;
  return <IntegrationsMobile />;
}
