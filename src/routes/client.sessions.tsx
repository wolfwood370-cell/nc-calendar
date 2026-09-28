import { createFileRoute } from "@tanstack/react-router";
import { clientPageTitle } from "@/lib/client-shell";

const DESCRIPTION = "Le tue sessioni, in programma e passate.";

export const Route = createFileRoute("/client/sessions")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Sessioni") },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: clientPageTitle("Sessioni") },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ClientSessionsPage,
});

function ClientSessionsPage() {
  return null;
}
