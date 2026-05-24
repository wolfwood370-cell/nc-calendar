import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { format, differenceInHours } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, MapPin, Timer, Video, User, CalendarPlus, Info } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { sessionLabel, type BookingStatus, type SessionType } from "@/lib/mock-data";
import { generateGoogleCalendarLink } from "@/lib/calendar-utils";
import { useCancelBooking } from "@/lib/queries";
import { errorMessage } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { ClientRescheduleSheet } from "@/components/client-reschedule-sheet";

export interface ClientBookingDetail {
  id: string;
  scheduled_at: string;
  status: BookingStatus;
  session_type: SessionType;
  trainer_notes: string | null;
  meeting_link: string | null;
  coach_id: string;
  client_id: string | null;
  block_id: string | null;
  event_type_id: string | null;
  google_event_id: string | null;
  /** H3: per-booking snapshot, see queries.ts BookingRow. */
  duration_min: number;
  event_type: {
    name: string;
    description: string | null;
    duration: number;
    color: string;
    location_type: "physical" | "online";
    location_address: string | null;
  } | null;
  coach: { full_name: string | null } | null;
}

// Background/foreground reference design tokens defined in src/styles.css so
// the status badge color palette is centralized and themable.
function statusStyle(s: BookingStatus): { bg: string; fg: string; label: string } {
  switch (s) {
    case "completed":
      return {
        bg: "var(--color-status-success-bg)",
        fg: "var(--color-on-status-success)",
        label: "Completata",
      };
    case "scheduled":
      return {
        bg: "var(--color-status-info-bg)",
        fg: "var(--color-on-status-info)",
        label: "Programmata",
      };
    case "cancelled":
      return {
        bg: "var(--color-status-error-bg)",
        fg: "var(--color-on-status-error)",
        label: "Cancellata",
      };
    case "late_cancelled":
      return {
        bg: "var(--color-status-error-bg)",
        fg: "var(--color-on-status-error)",
        label: "Cancellazione tardiva",
      };
    case "no_show":
      return {
        bg: "var(--color-status-error-bg)",
        fg: "var(--color-on-status-error)",
        label: "No Show",
      };
  }
}

export interface ClientBookingDetailViewProps {
  booking: ClientBookingDetail;
}

/**
 * Body completo della pagina dettaglio booking client (escluso loading/error
 * state e back-header che restano nel route parent):
 *
 *   - Hero card: status badge + title + date/time + location
 *   - Duration card
 *   - Session description (se presente)
 *   - Coach notes card
 *   - Action buttons: Add to GCal / Riprogramma / Cancella (free/late variant)
 *   - 2 AlertDialog conferme (free / late cancellation)
 *   - ClientRescheduleSheet
 *
 * Estratto da client.bookings.$bookingId.tsx (era function BookingDetailView
 * inline). statusStyle helper trasportato qui dentro perché usato solo
 * dalla view.
 */
export function ClientBookingDetailView({ booking }: ClientBookingDetailViewProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const cancelMut = useCancelBooking();
  const [confirmFreeOpen, setConfirmFreeOpen] = useState(false);
  const [confirmLateOpen, setConfirmLateOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const start = new Date(booking.scheduled_at);
  // H3: prefer the per-booking snapshot — the event_type join is the
  // legacy fallback for very old bookings inserted before the duration
  // denormalization trigger (migration 20260518120000) shipped.
  const duration = booking.duration_min ?? booking.event_type?.duration ?? 60;
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
  // within24h is now purely a UX hint — the server-side cancel_booking RPC
  // is the authority on whether the cancellation counts as late (M3).
  const hoursUntil = differenceInHours(start, new Date());
  const within24h = hoursUntil < 24;
  const canManage = booking.status === "scheduled" && isFuture;

  function showCancelToast(wasLate: boolean) {
    if (wasLate) {
      toast.warning("Sessione annullata", {
        description: "Credito perso (cancellazione tardiva).",
      });
    } else {
      toast.success("Sessione annullata", { description: "Il credito è stato rimborsato." });
    }
  }

  function handleFreeCancel() {
    cancelMut.mutate(
      { id: booking.id },
      {
        onSuccess: (result) => {
          showCancelToast(result.wasLate);
          navigate({ to: "/client" });
        },
        onError: (e: unknown) => toast.error("Errore", { description: errorMessage(e) }),
      },
    );
  }

  function handleLateCancel() {
    cancelMut.mutate(
      { id: booking.id },
      {
        onSuccess: (result) => {
          showCancelToast(result.wasLate);
          navigate({ to: "/client" });
        },
        onError: (e: unknown) => toast.error("Errore", { description: errorMessage(e) }),
      },
    );
  }

  return (
    <>
      {/* Hero card */}
      <section className="bg-surface-container-lowest rounded-[32px] p-stack-lg shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
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
              <span className="capitalize">
                {dateStr} • {timeStr}
              </span>
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
      <section className="bg-surface-container-lowest rounded-[32px] p-stack-md shadow-[0_8px_30px_rgba(0,0,0,0.04)] flex items-center gap-3">
        <Timer className="size-5 text-primary" />
        <p className="text-base text-on-surface">
          Durata: <span className="font-semibold">{duration} min</span>
        </p>
      </section>

      {/* Session description */}
      {booking.event_type?.description && (
        <section className="rounded-2xl bg-white/40 backdrop-blur-xl border border-white/30 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg">
          <div className="flex items-center gap-3 mb-stack-sm">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary grid place-items-center">
              <Info className="size-4" />
            </div>
            <h2 className="text-sm font-semibold text-on-surface">
              Cosa aspettarti da questa sessione
            </h2>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap">
            {booking.event_type.description}
          </p>
        </section>
      )}

      {/* Coach notes */}
      <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden relative border-l-4 border-primary">
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
              onClick={() => setRescheduleOpen(true)}
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
              Mancano meno di 24 ore. L'annullamento comporterà la perdita del credito (sessione
              erogata).
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

      {/* Reschedule sheet (athlete-driven UPDATE flow; coach is notified). */}
      <ClientRescheduleSheet
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        booking={{
          id: booking.id,
          scheduled_at: booking.scheduled_at,
          coach_id: booking.coach_id,
          client_id: booking.client_id,
          duration_min: duration,
          google_event_id: booking.google_event_id,
          session_label: title,
        }}
        clientName={
          (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "Cliente"
        }
      />
    </>
  );
}
