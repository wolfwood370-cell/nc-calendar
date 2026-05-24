import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Calendar, Clock } from "lucide-react";
import type { BookingRow } from "@/lib/queries";
import { JoinVideoCallButton } from "@/components/join-video-call-button";
import { RescheduleDrawer } from "@/components/reschedule-drawer";

export interface ClientLiveBookingCardProps {
  /** Booking da renderizzare come "next session" card. */
  booking: BookingRow;
  /** Durata risolta upstream (snapshot + fallback eventType + 60min). */
  durationMin: number;
  /** Label tipo sessione (es. "PT", "Triage"). */
  label: string;
  /** Color hex del tipo evento per styling background/badge. */
  color: string;
  /** ID del coach (passato al RescheduleDrawer per la query slot). */
  coachId: string | null;
}

/**
 * Card "Prossima sessione" del dashboard cliente. Auto-detect dello stato
 * "live" (≤60 min all'inizio fino a fine sessione) — la card cambia layout
 * + colori e mostra il bottone Join videocall. Aggiornamento real-time via
 * 30s ticker che ri-renderizza il componente al confine 60-min.
 *
 * Estratto da client.index.tsx (era function inline).
 */
export function ClientLiveBookingCard({
  booking,
  durationMin,
  label,
  color,
  coachId,
}: ClientLiveBookingCardProps) {
  const date = new Date(booking.scheduled_at);
  const end = new Date(date.getTime() + durationMin * 60_000);
  const startStr = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const endStr = end.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  let dayLabel: string;
  if (sameDay(date, today)) dayLabel = "Oggi";
  else if (sameDay(date, tomorrow)) dayLabel = "Domani";
  else dayLabel = date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });

  // Live-state computation. The card auto-flips at the 60-minute mark
  // even while the dashboard is open — a 30s tick re-renders it.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const minutesUntil = Math.round((date.getTime() - now) / 60_000);
  const isLive = sameDay(date, today) && minutesUntil <= 60 && minutesUntil >= -durationMin;
  const meetingLink = booking.meeting_link?.trim() || null;
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  // 24h reschedule lockout. The server-side trigger
  // z_trg_validate_client_booking_update (migration 20260522100000) is the
  // source of truth; this UI guard mirrors it so the button visibly
  // disables before the user wastes a tap.
  const canReschedule = minutesUntil >= 60 * 24;

  return (
    <>
      <div
        className={
          isLive
            ? "rounded-[32px] shadow-[0_12px_32px_rgba(0,86,133,0.18)] p-6 bg-primary-container text-on-primary-container relative overflow-hidden transition-colors"
            : "rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 bg-surface-container-lowest border border-outline-variant/30 transition-colors"
        }
      >
        {/* Top row: avatar / day + time / type chip */}
        <Link to="/client/bookings/$bookingId" params={{ bookingId: booking.id }} className="block">
          <div className="flex justify-between items-start gap-2">
            <div className="flex gap-4 items-center min-w-0">
              <div
                className="w-16 h-16 shrink-0 rounded-full grid place-items-center"
                style={
                  isLive
                    ? { backgroundColor: "rgba(255,255,255,0.18)", color: "white" }
                    : { backgroundColor: `${color}1a`, color }
                }
              >
                <Calendar className="size-8" />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <h4
                  className={
                    isLive
                      ? "text-2xl font-semibold capitalize leading-tight truncate text-on-primary-container"
                      : "text-2xl font-semibold text-on-surface capitalize leading-tight truncate"
                  }
                >
                  {dayLabel}
                </h4>
                <div
                  className={
                    isLive
                      ? "flex items-center gap-2 text-on-primary-container/90"
                      : "flex items-center gap-2 text-on-surface-variant"
                  }
                >
                  {isLive ? (
                    <span
                      aria-label="Sessione in arrivo"
                      className="relative inline-flex size-2.5 shrink-0"
                    >
                      <span className="absolute inset-0 rounded-full bg-white/70 animate-ping" />
                      <span className="relative inline-flex size-2.5 rounded-full bg-white" />
                    </span>
                  ) : (
                    <Clock className="size-[18px]" />
                  )}
                  <span className="text-base font-semibold tabular-nums">
                    {startStr} - {endStr}
                  </span>
                </div>
              </div>
            </div>
            <span
              className={
                isLive
                  ? "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shrink-0 bg-white/20 text-on-primary-container"
                  : "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shrink-0"
              }
              style={isLive ? undefined : { backgroundColor: `${color}1a`, color }}
            >
              {label}
            </span>
          </div>
        </Link>

        {/* Live-state action region: full-width Join button + secondary
            Riprogramma pill. Hidden in the default state to keep the
            card compact. */}
        {isLive && (
          <div className="mt-5 flex flex-col gap-2">
            {meetingLink ? (
              <a
                href={meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-4 px-6 rounded-full bg-white text-primary text-md font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] transition-transform"
              >
                🎥 Partecipa alla Videochiamata
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => setRescheduleOpen(true)}
              disabled={!canReschedule}
              aria-disabled={!canReschedule}
              title={
                canReschedule ? undefined : "Le modifiche si bloccano 24 ore prima dell'inizio."
              }
              className="w-full py-3 rounded-full bg-white/10 text-on-primary-container text-sm font-semibold border border-white/30 active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Riprogramma
            </button>
            {!canReschedule && (
              <p className="text-[11px] text-on-primary-container/80 text-center px-2">
                Le modifiche si bloccano 24 ore prima dell'inizio.
              </p>
            )}
          </div>
        )}

        {/* Default-state reschedule pill (smaller, less prominent). */}
        {!isLive && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => setRescheduleOpen(true)}
              disabled={!canReschedule}
              aria-disabled={!canReschedule}
              title={
                canReschedule ? undefined : "Le modifiche si bloccano 24 ore prima dell'inizio."
              }
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface text-xs font-semibold border border-outline-variant/30 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Riprogramma
            </button>
            {!canReschedule && (
              <span className="text-[11px] text-on-surface-variant">Bloccata 24h prima</span>
            )}
            {meetingLink && <JoinVideoCallButton url={meetingLink} size="sm" variant="outline" />}
          </div>
        )}
      </div>

      <RescheduleDrawer
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        booking={booking}
        coachId={coachId}
        durationMin={durationMin}
      />
    </>
  );
}
