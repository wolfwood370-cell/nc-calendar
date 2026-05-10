import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, MapPin, Timer, Video, User, CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionLabel, type BookingStatus, type SessionType } from "@/lib/mock-data";
import { generateGoogleCalendarLink } from "@/lib/calendar-utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export const Route = createFileRoute("/client/bookings/$bookingId")({
  component: BookingDetailPage,
});

interface BookingDetail {
  id: string;
  scheduled_at: string;
  status: BookingStatus;
  session_type: SessionType;
  trainer_notes: string | null;
  meeting_link: string | null;
  coach_id: string;
  event_type: {
    name: string;
    duration: number;
    color: string;
    location_type: "physical" | "online";
    location_address: string | null;
  } | null;
  coach: { full_name: string | null } | null;
}

function statusStyle(s: BookingStatus): { bg: string; fg: string; label: string } {
  switch (s) {
    case "completed":
      return { bg: "#E6F4EA", fg: "#0B8043", label: "Completata" };
    case "scheduled":
      return { bg: "#E3F2FD", fg: "#1565C0", label: "Programmata" };
    case "cancelled":
      return { bg: "#FCE8E6", fg: "#C5221F", label: "Cancellata" };
    case "late_cancelled":
      return { bg: "#FCE8E6", fg: "#C5221F", label: "Cancellazione tardiva" };
    case "no_show":
      return { bg: "#FCE8E6", fg: "#C5221F", label: "No Show" };
  }
}

function BookingDetailPage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["booking-detail", bookingId],
    queryFn: async (): Promise<BookingDetail | null> => {
      const { data: booking, error } = await supabase
        .from("bookings")
        .select("id, scheduled_at, status, session_type, trainer_notes, meeting_link, coach_id, event_type_id")
        .eq("id", bookingId)
        .maybeSingle();
      if (error) throw error;
      if (!booking) return null;

      const [etRes, coachRes] = await Promise.all([
        booking.event_type_id
          ? supabase
              .from("event_types")
              .select("name, duration, color, location_type, location_address")
              .eq("id", booking.event_type_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from("profiles").select("full_name").eq("id", booking.coach_id).maybeSingle(),
      ]);

      return {
        ...booking,
        event_type: (etRes.data as BookingDetail["event_type"]) ?? null,
        coach: (coachRes.data as BookingDetail["coach"]) ?? null,
      } as BookingDetail;
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
            <>
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </>
          ) : !q.data ? (
            <p className="text-center text-on-surface-variant py-10">Sessione non trovata.</p>
          ) : (
            <BookingDetailView booking={q.data} />
          )}
        </main>
      </div>
    </div>
  );
}

function BookingDetailView({ booking }: { booking: BookingDetail }) {
  const start = new Date(booking.scheduled_at);
  const duration = booking.event_type?.duration ?? 60;
  const end = new Date(start.getTime() + duration * 60_000);
  const status = statusStyle(booking.status);
  const title = booking.event_type?.name ?? sessionLabel(booking.session_type);
  const dateStr = format(start, "d MMMM yyyy", { locale: it });
  const timeStr = `${format(start, "HH:mm")} - ${format(end, "HH:mm")}`;

  const isOnline = booking.event_type?.location_type === "online";
  const address = booking.event_type?.location_address;
  const mapsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  return (
    <>
      {/* Hero card */}
      <section className="bg-surface-container-lowest rounded-xl p-stack-lg shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-stack-md">
          <div>
            <span
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold mb-stack-sm"
              style={{ backgroundColor: status.bg, color: status.fg }}
            >
              {status.label}
            </span>
            <h1 className="text-2xl font-semibold text-on-surface">{title}</h1>
          </div>
          <div className="space-y-stack-sm mt-stack-sm">
            <div className="flex items-center gap-3 text-on-surface-variant">
              <CalendarDays className="size-5 text-primary shrink-0" />
              <span className="capitalize">{dateStr} • {timeStr}</span>
            </div>

            <div className="flex items-start gap-3 text-on-surface-variant">
              {isOnline ? (
                <Video className="size-5 text-primary shrink-0 mt-0.5" />
              ) : (
                <MapPin className="size-5 text-primary shrink-0 mt-0.5" />
              )}
              {isOnline ? (
                booking.meeting_link ? (
                  <a
                    href={booking.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2"
                  >
                    Sessione Online — Apri videocall
                  </a>
                ) : (
                  <span>Sessione Online</span>
                )
              ) : mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  {address}
                </a>
              ) : (
                <span>Luogo da definire</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Duration */}
      <section className="bg-surface-container-lowest rounded-xl p-stack-md shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex items-center gap-3">
        <Timer className="size-5 text-primary" />
        <p className="text-base text-on-surface">
          Durata: <span className="font-semibold">{duration} min</span>
        </p>
      </section>

      {/* Coach notes */}
      <section className="bg-surface-container-lowest rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden relative border-l-4 border-primary">
        <div className="p-stack-lg">
          <div className="flex items-center gap-3 mb-stack-md">
            <div className="w-10 h-10 rounded-full bg-primary-container text-white grid place-items-center border border-outline-variant">
              <User className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-on-surface">Note del Coach</h2>
              {booking.coach?.full_name && (
                <p className="text-xs text-on-surface-variant">{booking.coach.full_name}</p>
              )}
            </div>
          </div>
          {booking.trainer_notes ? (
            <p className="text-base text-on-surface-variant leading-relaxed whitespace-pre-wrap">
              {booking.trainer_notes}
            </p>
          ) : (
            <p className="text-sm text-on-surface-variant italic">
              Nessuna nota aggiunta per questa sessione.
            </p>
          )}
        </div>
      </section>

      {/* Action button */}
      <div className="pt-stack-lg pb-stack-lg">
        <Link
          to="/client/book"
          className="block w-full py-4 rounded-full border border-outline-variant text-primary font-semibold bg-transparent hover:bg-surface-container-low transition-colors text-center"
        >
          Prenota prossima sessione
        </Link>
      </div>
    </>
  );
}
