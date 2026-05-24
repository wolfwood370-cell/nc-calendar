import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuraCardSkeleton, AuraLineSkeleton } from "@/components/ui/aura-skeleton";
import {
  ClientBookingDetailView,
  type ClientBookingDetail,
} from "@/components/client-booking-detail-view";

export const Route = createFileRoute("/client/bookings/$bookingId")({
  component: BookingDetailPage,
});

function BookingDetailPage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["booking-detail", bookingId],
    queryFn: async (): Promise<ClientBookingDetail | null> => {
      const { data: booking, error } = await supabase
        .from("bookings")
        .select(
          "id, scheduled_at, status, session_type, trainer_notes, meeting_link, coach_id, client_id, event_type_id, block_id, duration_min, google_event_id",
        )
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      if (!booking) return null;

      const [etRes, coachRes] = await Promise.all([
        booking.event_type_id
          ? supabase
              .from("event_types")
              .select("name, description, duration, color, location_type, location_address")
              .eq("id", booking.event_type_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("profiles").select("full_name").eq("id", booking.coach_id).maybeSingle(),
      ]);

      return {
        ...booking,
        event_type: (etRes.data as ClientBookingDetail["event_type"]) ?? null,
        coach: (coachRes.data as ClientBookingDetail["coach"]) ?? null,
      } as ClientBookingDetail;
    },
  });

  return (
    <div className="bg-surface min-h-screen text-on-surface">
      <div className="max-w-md mx-auto relative pb-24">
        <header className="flex items-center px-margin-mobile py-stack-md sticky top-0 bg-surface/80 backdrop-blur-xl z-10">
          <button
            type="button"
            onClick={() => navigate({ to: "/client" })}
            aria-label="Indietro"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest shadow-[0_4px_12px_rgba(0,0,0,0.05)] text-primary"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="ml-3 font-semibold text-base">Dettaglio Sessione</h1>
        </header>

        <main className="px-margin-mobile space-y-gutter">
          {q.isLoading ? (
            // Audit 2026-05-22 M4: Aura skeletons (rounded-[32px]) match
            // the resolved hero/duration/coach-notes card shapes below
            // so the layout doesn't reflow when data hydrates.
            <>
              <AuraCardSkeleton className="h-40 flex flex-col gap-4 p-4">
                <AuraLineSkeleton className="w-2/3" />
                <AuraLineSkeleton className="w-1/2 h-3" />
              </AuraCardSkeleton>
              <AuraCardSkeleton className="h-16 flex items-center gap-3 p-4">
                <AuraLineSkeleton className="w-1/3" />
              </AuraCardSkeleton>
              <AuraCardSkeleton className="h-32 flex flex-col gap-3 p-4">
                <AuraLineSkeleton className="w-3/4" />
                <AuraLineSkeleton className="w-full h-3" />
                <AuraLineSkeleton className="w-5/6 h-3" />
              </AuraCardSkeleton>
            </>
          ) : !q.data ? (
            <p className="text-center text-on-surface-variant py-10">Sessione non trovata.</p>
          ) : (
            <ClientBookingDetailView booking={q.data} />
          )}
        </main>
      </div>
    </div>
  );
}
