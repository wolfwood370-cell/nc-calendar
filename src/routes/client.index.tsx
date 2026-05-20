import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, Plus, Clock, Calendar, ChevronDown, Sparkles } from "lucide-react";
import type { BookingRow, EventTypeRow } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  useClientBlocks,
  useClientBookings,
  useCoachEventTypes,
  useClientExtraCredits,
} from "@/lib/queries";
import { sessionLabel } from "@/lib/mock-data";
import { AuraCardSkeleton } from "@/components/ui/aura-skeleton";
import { AuraProgressRing } from "@/components/ui/aura-progress-ring";
import { JoinVideoCallButton } from "@/components/join-video-call-button";
import { RescheduleDrawer } from "@/components/reschedule-drawer";
// EmptyStateCard arrived from origin/main (PWA onboarding + empty
// states pass). Reused in the "Il Tuo Percorso" zero-state branch
// below — auto-merge applied that branch cleanly, only the import
// list collided with mine. Progress wasn't kept because my pass
// replaced the linear bars with AuraProgressRing entirely.
import { EmptyStateCard } from "@/components/empty-state-card";

export const Route = createFileRoute("/client/")({
  component: ClientHome,
});

function ClientHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const meId = user?.id;

  const profileQ = useQuery({
    queryKey: ["profile", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, coach_id")
        .eq("id", meId!)
        .maybeSingle();
      return data;
    },
  });

  const fullName = profileQ.data?.full_name ?? user?.email ?? "Cliente";
  const firstName = fullName.split(" ")[0] ?? fullName;
  const coachId = profileQ.data?.coach_id ?? null;

  const blocksQ = useClientBlocks(meId);
  const bookingsQ = useClientBookings(meId);
  const eventTypesQ = useCoachEventTypes(coachId);
  const extraCreditsQ = useClientExtraCredits(meId);

  // Aggregate ALL allocations across all blocks, grouped by event_type (or session_type fallback)
  const summary = useMemo(() => {
    const blocks = blocksQ.data ?? [];
    const ets = eventTypesQ.data ?? [];
    const extraCredits = extraCreditsQ.data ?? [];
    const map = new Map<string, { name: string; color: string; used: number; total: number }>();
    // 1. Inizializza i totali (assigned) dai block.allocations di tutti i blocchi
    for (const b of blocks) {
      for (const a of b.allocations) {
        const et = a.event_type_id ? ets.find((e) => e.id === a.event_type_id) : null;
        const key = a.event_type_id ?? a.session_type;
        const cur = map.get(key) ?? {
          name: et?.name ?? sessionLabel(a.session_type),
          color: et?.color ?? "#003e62",
          used: 0,
          total: 0,
        };
        cur.total += a.quantity_assigned;
        map.set(key, cur);
      }
    }

    // 1.5. Aggiungi i totali dagli extra credits attivi
    for (const ec of extraCredits) {
      const et = ets.find((e) => e.id === ec.event_type_id);
      const key = ec.event_type_id;
      const cur = map.get(key) ?? {
        name: et?.name ?? "Extra",
        color: et?.color ?? "#003e62",
        used: 0,
        total: 0,
      };
      cur.total += ec.quantity;
      map.set(key, cur);
    }

    // 2. Calcola i completati in modo dinamico dai bookings
    const completedBookings = (bookingsQ.data ?? []).filter((b) => b.status === "completed");
    for (const b of completedBookings) {
      const key = b.event_type_id ?? b.session_type;
      const cur = map.get(key);
      if (cur) {
        cur.used += 1;
      }
    }

    return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
  }, [blocksQ.data, eventTypesQ.data, bookingsQ.data, extraCreditsQ.data]);

  const nextBooking = useMemo(() => {
    const now = Date.now();
    return (bookingsQ.data ?? [])
      .filter((b) => b.status === "scheduled" && new Date(b.scheduled_at).getTime() > now)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0];
  }, [bookingsQ.data]);

  const nextEventType = nextBooking?.event_type_id
    ? (eventTypesQ.data ?? []).find((e) => e.id === nextBooking.event_type_id)
    : null;

  const recentCompleted = useMemo(() => {
    return (bookingsQ.data ?? [])
      .filter((b) => b.status === "completed")
      .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at))
      .slice(0, 3);
  }, [bookingsQ.data]);

  const isLoading =
    blocksQ.isLoading || bookingsQ.isLoading || profileQ.isLoading || extraCreditsQ.isLoading;

  return (
    <div className="max-w-md mx-auto bg-surface min-h-screen">
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 shadow-[0_8px_30px_rgba(0,0,0,0.04)] z-40">
        <div className="flex justify-between items-center w-full px-margin-mobile py-stack-md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container grid place-items-center border-2 border-surface-container-lowest shadow-sm font-semibold">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold text-aura-primary">Ciao {firstName}</h1>
          </div>
          <button
            type="button"
            aria-label="Notifiche"
            className="text-aura-primary hover:bg-surface-container-high transition-colors active:scale-95 duration-200 p-2 rounded-full"
          >
            <Bell className="size-6" />
          </button>
        </div>
      </header>

      <main className="px-margin-mobile pt-stack-md flex flex-col gap-stack-lg">
        {/* Il Tuo Percorso */}
        <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-xl font-semibold text-on-surface mb-6">Il Tuo Percorso</h2>

          {isLoading ? (
            <div className="flex flex-col gap-4">
              <AuraCardSkeleton className="h-12 flex items-center gap-3 p-3">
                <AuraCardSkeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1" />
              </AuraCardSkeleton>
              <AuraCardSkeleton className="h-12 flex items-center gap-3 p-3">
                <AuraCardSkeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1" />
              </AuraCardSkeleton>
            </div>
          ) : summary.length === 0 ? (
            <EmptyStateCard
              title="Pronto a salire di livello?"
              description="Non hai ancora un percorso attivo. Scegli un Booster o un NC Add-on per iniziare a prenotare le tue sessioni."
              ctaLabel="Esplora gli Add-on"
              ctaTo="/client/store"
            />
          ) : (
            <div className="flex flex-col gap-5">
              {summary.map((row) => {
                const remaining = Math.max(0, row.total - row.used);
                const isLow = row.total > 0 && remaining > 0 && remaining <= 2;
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-4 rounded-[24px] bg-surface-container-low/50 px-4 py-3"
                  >
                    <AuraProgressRing
                      used={row.used}
                      total={row.total}
                      size={72}
                      strokeWidth={7}
                      color={row.color}
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-base font-semibold text-on-surface truncate">
                        {row.name}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {remaining} rimanenti su {row.total}
                      </span>
                      {isLow && (
                        // Soft alerting recharge CTA — pill-shaped per Aura.
                        // Routes to the booster store (Stripe checkout entry).
                        <Link
                          to="/client/store"
                          className="mt-1 inline-flex self-start items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-tertiary-container/20 text-tertiary"
                        >
                          <Sparkles className="size-3.5" />
                          Ricarica Crediti
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Prossimo Appuntamento */}
        <section>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 ml-2">
            Prossimo Appuntamento
          </h3>
          {isLoading ? (
            <Skeleton className="h-32 w-full rounded-[32px]" />
          ) : nextBooking ? (
            <LiveBookingCard
              booking={nextBooking}
              // H3: prefer the per-booking snapshot so a later coach
              // edit to event_types.duration can't relabel an already-
              // booked next session on the client dashboard.
              durationMin={nextBooking.duration_min ?? nextEventType?.duration ?? 60}
              label={nextEventType?.name ?? sessionLabel(nextBooking.session_type)}
              color={nextEventType?.color ?? "#039BE5"}
              coachId={coachId}
            />
          ) : (
            <div className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 border border-outline-variant/30 text-center">
              <p className="text-base font-semibold text-on-surface mb-1">
                Nessuna sessione in programma
              </p>
              <p className="text-sm text-on-surface-variant mb-4">
                Prenota la tua prossima sessione.
              </p>
              <button
                onClick={() => navigate({ to: "/client/book" })}
                className="bg-primary-container text-white font-semibold text-sm py-2.5 px-6 rounded-full active:scale-95 transition"
              >
                Prenota ora
              </button>
            </div>
          )}
        </section>

        {/* Fitness Journey Timeline */}
        <section className="flex flex-col gap-stack-md">
          <h3 className="text-xl font-semibold text-on-surface ml-1">Il Tuo Percorso Recente</h3>
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-[24px]" />
          ) : (
            <SessionTimeline bookings={bookingsQ.data ?? []} eventTypes={eventTypesQ.data ?? []} />
          )}
        </section>

        {/* Quick Action */}
        <section className="flex flex-col gap-stack-md mt-2">
          <Link
            to="/client/book"
            className="w-full bg-primary-container text-white font-semibold text-base py-4 rounded-full shadow-md hover:opacity-90 transition active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus className="size-5" />
            Prenota Nuova Sessione
          </Link>
        </section>
      </main>
    </div>
  );
}

// LiveBookingCard — replaces the previous NextAppointmentCard with a
// time-aware "live state". When the booking is today and starts within
// 60 minutes, the card transitions to a premium primary-container
// background, pulses a live dot next to the time, and surfaces the
// Join button full-width (when the booking carries a Google Meet URL).
// Otherwise it renders the regular Aura white card with the date label.
// In both states a small "Riprogramma" pill opens the RescheduleDrawer
// inline — no navigation, no desktop AlertDialog detour on mobile.
function LiveBookingCard({
  booking,
  durationMin,
  label,
  color,
  coachId,
}: {
  booking: BookingRow;
  durationMin: number;
  label: string;
  color: string;
  coachId: string | null;
}) {
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
        <Link
          to="/client/bookings/$bookingId"
          params={{ bookingId: booking.id }}
          className="block"
        >
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
                    // Pulsing live dot — visible at all times the card
                    // is in live state. Aria-label so screen readers
                    // announce the urgency.
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
              // JoinVideoCallButton variant inverted for the primary-
              // container background. Native Meet URL — see sync-calendar
              // create branch which writes meeting_link via service-role.
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
              className="w-full py-3 rounded-full bg-white/10 text-on-primary-container text-sm font-semibold border border-white/30 active:scale-[0.99] transition-transform"
            >
              Riprogramma
            </button>
          </div>
        )}

        {/* Default-state reschedule pill (smaller, less prominent). */}
        {!isLive && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRescheduleOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface text-xs font-semibold border border-outline-variant/30 active:scale-95 transition-transform"
            >
              Riprogramma
            </button>
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

function statusMeta(status: BookingRow["status"]) {
  switch (status) {
    case "completed":
      return { label: "Completata", cls: "bg-success/10 text-success" };
    case "cancelled":
      return { label: "Annullata", cls: "bg-destructive/10 text-destructive" };
    case "late_cancelled":
      return { label: "Cancellazione tardiva", cls: "bg-destructive/10 text-destructive" };
    case "no_show":
      return { label: "No Show", cls: "bg-destructive/10 text-destructive" };
    default:
      return { label: "In programma", cls: "bg-primary/10 text-primary" };
  }
}

function TimelineCard({
  booking,
  eventTypes,
  compact = false,
}: {
  booking: BookingRow;
  eventTypes: EventTypeRow[];
  compact?: boolean;
}) {
  const et = booking.event_type_id ? eventTypes.find((e) => e.id === booking.event_type_id) : null;
  const typeName = et?.name ?? sessionLabel(booking.session_type);
  const color = et?.color ?? "#003e62";
  const title = booking.title?.trim() || typeName;
  const d = new Date(booking.scheduled_at);
  const dateStr = d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeStr = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const status = statusMeta(booking.status);

  return (
    <Link
      to="/client/bookings/$bookingId"
      params={{ bookingId: booking.id }}
      className={`block bg-surface-container-lowest/60 backdrop-blur-xl rounded-[24px] border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:bg-white/80 transition-colors ${compact ? "p-4" : "p-5"}`}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex flex-col gap-1">
          <p
            className={`font-semibold text-on-surface truncate leading-tight ${compact ? "text-sm" : "text-base"}`}
          >
            {title}
          </p>
          <p className={`text-on-surface-variant ${compact ? "text-xs" : "text-sm"}`}>
            {dateStr} · {timeStr}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {typeName}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${status.cls}`}
          >
            {status.label}
          </span>
        </div>
      </div>
    </Link>
  );
}

function SessionTimeline({
  bookings,
  eventTypes,
}: {
  bookings: BookingRow[];
  eventTypes: EventTypeRow[];
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  const past = useMemo(
    () =>
      bookings
        .filter((b) => new Date(b.scheduled_at).getTime() < Date.now())
        .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)),
    [bookings],
  );

  const recent = past.slice(0, 5);
  const archive = past.slice(5);

  const archiveByMonth = useMemo(() => {
    const groups = new Map<string, BookingRow[]>();
    for (const b of archive) {
      const d = new Date(b.scheduled_at);
      const key = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
      const arr = groups.get(key) ?? [];
      arr.push(b);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [archive]);

  if (past.length === 0) {
    return (
      <div className="bg-surface-container-lowest/60 backdrop-blur-xl rounded-[24px] border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 text-sm text-on-surface-variant text-center">
        Non hai ancora completato nessuna sessione.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-stack-md">
      {/* Vertical timeline */}
      <ol className="relative border-l-2 border-outline-variant/30 pl-6 ml-2 flex flex-col gap-5">
        {recent.map((b) => (
          <li key={b.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[1.95rem] top-4 w-3 h-3 rounded-full bg-primary ring-4 ring-primary/20"
            />
            <TimelineCard booking={b} eventTypes={eventTypes} />
          </li>
        ))}
      </ol>

      {/* Archive */}
      {archive.length > 0 && (
        <div className="flex flex-col gap-stack-md">
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            className="self-center inline-flex items-center gap-2 px-5 py-2 rounded-full border border-outline-variant text-on-surface-variant text-sm font-medium bg-white/40 backdrop-blur hover:bg-white/70 transition-colors"
            aria-expanded={archiveOpen}
          >
            {archiveOpen ? "Nascondi Archivio" : "Visualizza Archivio"}
            <ChevronDown
              className={`size-4 transition-transform ${archiveOpen ? "rotate-180" : ""}`}
            />
          </button>

          {archiveOpen && (
            <div className="flex flex-col gap-stack-md animate-in fade-in slide-in-from-top-1 duration-300">
              {archiveByMonth.map(([month, items]) => (
                <div key={month} className="flex flex-col gap-2">
                  <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider ml-1 capitalize">
                    {month}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {items.map((b) => (
                      <TimelineCard key={b.id} booking={b} eventTypes={eventTypes} compact />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
