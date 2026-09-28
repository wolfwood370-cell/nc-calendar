import { createFileRoute } from "@tanstack/react-router";
import { clientPageTitle } from "@/lib/client-shell";

const DESCRIPTION = "I promemoria sulle tue sessioni e sui tuoi crediti.";

export const Route = createFileRoute("/client/notifications")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Notifiche") },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: clientPageTitle("Notifiche") },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ClientNotificationsPage,
});

function ClientNotificationsPage() {
  return null;
}
