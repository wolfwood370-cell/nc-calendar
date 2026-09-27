import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsMobile } from "@/components/integrations-mobile";

export const Route = createFileRoute("/trainer/integrations")({
  head: () => ({
    meta: [
      { title: "Integrazioni · NC Calendar" },
      {
        name: "description",
        content: "Collega Google Calendar e gestisci la sincronizzazione degli appuntamenti.",
      },
      { property: "og:title", content: "Integrazioni · NC Calendar" },
      {
        property: "og:description",
        content: "Collega Google Calendar e gestisci la sincronizzazione degli appuntamenti.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IntegrationsPage,
});

// Sul telefono la pagina resta com'era (integrations-mobile.tsx).
function IntegrationsPage() {
  return <IntegrationsMobile />;
}
