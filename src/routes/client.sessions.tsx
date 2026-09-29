import { createFileRoute } from "@tanstack/react-router";
import { AuraCardSkeleton } from "@/components/ui/aura-skeleton";
import { ClientSessionTimeline } from "@/components/client-session-timeline";
import { ClientTabHeader } from "@/components/client-tab-header";
import { useClientShell } from "@/hooks/use-client-shell";
import { clientPageTitle, sessionsSubtitle, upcomingCount } from "@/lib/client-shell";

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

/**
 * Segnaposto della passata 01: l'intestazione di scheda col conto delle
 * sessioni in programma e, sotto, l'elenco di prima (ClientSessionTimeline,
 * come nella Home). La passata 03 la sostituisce. L'elenco mostra solo le
 * sessioni passate, il sottotitolo conta quelle in programma.
 */
function ClientSessionsPage() {
  const { bookings, bookingsLoading, eventTypes, now } = useClientShell();
  return (
    <div className="bg-surface min-h-screen">
      <ClientTabHeader
        title="Sessioni"
        subtitle={bookingsLoading ? null : sessionsSubtitle(upcomingCount(bookings, now))}
      />
      <div className="px-margin-mobile pt-stack-md flex flex-col gap-stack-md">
        {bookingsLoading ? (
          <AuraCardSkeleton className="h-40" />
        ) : (
          <ClientSessionTimeline bookings={bookings} eventTypes={eventTypes} />
        )}
      </div>
    </div>
  );
}
