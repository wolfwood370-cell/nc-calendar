import { createFileRoute } from "@tanstack/react-router";
import { AvailabilityMobile } from "@/components/availability-mobile";

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
  component: AvailabilityMobile,
});
