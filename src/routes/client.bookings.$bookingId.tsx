import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, MapPin, Timer, Video, User, CalendarPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionLabel, type BookingStatus, type SessionType } from "@/lib/mock-data";
import { generateGoogleCalendarLink } from "@/lib/calendar-utils";
import { format, differenceInHours } from "date-fns";
import { it } from "date-fns/locale";
import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCancelBooking } from "@/lib/queries";
import { toast } from "sonner";

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
  block_id: string | null;
  event_type_id: string | null;
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
        .select("id, scheduled_at, status, session_type, trainer_notes, meeting_link, coach_id, event_type_id, block_id")
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
  const navigate = useNavigate();
  const cancelMut = useCancelBooking();
  const [confirmFreeOpen, setConfirmFreeOpen] = useState(false);
  const [confirmLateOpen, setConfirmLateOpen] = useState(false);

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

  const isFuture = start.getTime() > Date.now();
  const hoursUntil = differenceInHours(start, new Date());
  const within24h = hoursUntil < 24;
  const canManage = booking.status === "scheduled" && isFuture;

  // Look up an allocation to refund (only used for free cancel).
  async function findAllocationForRefund(): Promise<string | null> {
    if (!booking.block_id) return null;
    const { data } = await supabase
      .from("block_allocations")
      .select("id, event_type_id, session_type, quantity_booked")
      .eq("block_id", booking.block_id);
    const list = (data ?? []) as Array<{ id: string; event_type_id: string | null; session_type: SessionType; quantity_booked: number }>;
    const match =
      list.find((a) => booking.event_type_id && a.event_type_id === booking.event_type_id && a.quantity_booked > 0) ??
      list.find((a) => a.session_type === booking.session_type && a.quantity_booked > 0);
    return match?.id ?? null;
  }

  async function handleFreeCancel() {
    const allocationId = await findAllocationForRefund();
    cancelMut.mutate(
      { id: booking.id, late: false, allocationId },
      {
        onSuccess: () => {
          toast.success("Sessione annullata", { description: "Il credito è stato rimborsato." });
          navigate({ to: "/client" });
        },
        onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
      },
    );
  }

  function handleLateCancel() {
    cancelMut.mutate(
      { id: booking.id, late: true },
      {
        onSuccess: () => {
          toast.warning("Sessione annullata", { description: "Credito perso (cancellazione tardiva)." });
          navigate({ to: "/client" });
        },
        onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
      },
    );
  }

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

      {/* Action buttons */}
      <div className="pt-stack-lg pb-stack-lg space-y-stack-md">
        {canManage && (
          <a
            href={generateGoogleCalendarLink(
              { scheduled_at: booking.scheduled_at },
              booking.event_type,
              booking.coach?.full_name ?? null,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-full bg-primary-container text-white font-semibold shadow-md hover:opacity-90 active:scale-95 transition"
          >
            <CalendarPlus className="size-5" />
            Aggiungi a Google Calendar
          </a>
        )}

        {canManage && !within24h && (
          <>
            <button
              type="button"
              onClick={async () => {
                // riprogramma = annulla con rimborso e vai a prenotazione
                const allocationId = await findAllocationForRefund();
                cancelMut.mutate(
                  { id: booking.id, late: false, allocationId },
                  {
                    onSuccess: () => {
                      toast.success("Credito rimborsato", { description: "Scegli un nuovo orario." });
                      navigate({ to: "/client/book" });
                    },
                    onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
                  },
                );
              }}
              className="block w-full py-4 rounded-full border border-outline-variant text-primary font-semibold bg-transparent hover:bg-surface-container-low transition-colors text-center"
            >
              Riprogramma
            </button>
            <button
              type="button"
              onClick={() => setConfirmFreeOpen(true)}
              className="block w-full py-4 rounded-full bg-surface-container-high text-on-surface font-semibold hover:bg-surface-container-highest transition-colors text-center"
            >
              Cancella
            </button>
          </>
        )}

        {canManage && within24h && (
          <button
            type="button"
            onClick={() => setConfirmLateOpen(true)}
            className="block w-full py-4 rounded-full bg-destructive text-destructive-foreground font-semibold hover:opacity-90 transition-opacity text-center"
          >
            Cancella
          </button>
        )}

        {!canManage && (
          <Link
            to="/client/book"
            className="block w-full py-4 rounded-full border border-outline-variant text-primary font-semibold bg-transparent hover:bg-surface-container-low transition-colors text-center"
          >
            Prenota prossima sessione
          </Link>
        )}
      </div>

      {/* Free cancel dialog */}
      <AlertDialog open={confirmFreeOpen} onOpenChange={setConfirmFreeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annulla sessione</AlertDialogTitle>
            <AlertDialogDescription>
              Annullamento gratuito. Il credito verrà rimborsato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction onClick={handleFreeCancel} disabled={cancelMut.isPending}>
              Conferma annullamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Late cancel dialog */}
      <AlertDialog open={confirmLateOpen} onOpenChange={setConfirmLateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancellazione tardiva</AlertDialogTitle>
            <AlertDialogDescription>
              Mancano meno di 24 ore. L'annullamento comporterà la perdita del credito (sessione erogata).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLateCancel}
              disabled={cancelMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancella comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
