import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bell, Plus, History, Clock, Calendar, CalendarPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useClientBlocks, useClientBookings, useCoachEventTypes } from "@/lib/queries";
import { sessionLabel } from "@/lib/mock-data";
import { CircularProgress } from "@/components/circular-progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { generateGoogleCalendarLink } from "@/lib/calendar-utils";

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
  const firstName = fullName.split(" ")[0];
  const coachId = profileQ.data?.coach_id ?? null;

  const blocksQ = useClientBlocks(meId);
  const bookingsQ = useClientBookings(meId);
  const eventTypesQ = useCoachEventTypes(coachId);

  const block = (blocksQ.data ?? []).find((b) => b.status === "active");

  // Aggrega per event_type (o session_type fallback)
  const rings = useMemo(() => {
    if (!block)
      return [] as Array<{
        key: string;
        name: string;
        color: string;
        booked: number;
        assigned: number;
      }>;
    const map = new Map<
      string,
      { name: string; color: string; booked: number; assigned: number }
    >();
    for (const a of block.allocations) {
      const et = a.event_type_id
        ? (eventTypesQ.data ?? []).find((e) => e.id === a.event_type_id)
        : null;
      const key = a.event_type_id ?? a.session_type;
      const cur = map.get(key) ?? {
        name: et?.name ?? sessionLabel(a.session_type),
        color: et?.color ?? "#003e62",
        booked: 0,
        assigned: 0,
      };
      cur.booked += a.quantity_booked;
      cur.assigned += a.quantity_assigned;
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }));
  }, [block, eventTypesQ.data]);

  const nextBooking = useMemo(() => {
    const now = Date.now();
    return (bookingsQ.data ?? [])
      .filter((b) => b.status === "scheduled" && new Date(b.scheduled_at).getTime() > now)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0];
  }, [bookingsQ.data]);

  const nextEventType = nextBooking?.event_type_id
    ? (eventTypesQ.data ?? []).find((e) => e.id === nextBooking.event_type_id)
    : null;

  const isLoading = blocksQ.isLoading || bookingsQ.isLoading || profileQ.isLoading;

  return (
    <div className="max-w-md mx-auto bg-surface min-h-screen">
      {/* Top App Bar */}
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 shadow-[0_8px_30px_rgba(0,0,0,0.04)] z-40">
        <div className="flex justify-between items-center w-full px-margin-mobile py-stack-md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container grid place-items-center border-2 border-surface-container-lowest shadow-sm font-semibold">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold text-[#003e62]">Ciao {firstName}</h1>
          </div>
          <button
            type="button"
            aria-label="Notifiche"
            className="text-[#003e62] hover:bg-surface-container-high transition-colors active:scale-95 duration-200 p-2 rounded-full"
          >
            <Bell className="size-6" />
          </button>
        </div>
      </header>

      <main className="px-margin-mobile pt-stack-md flex flex-col gap-stack-lg">
        {/* Hero: Progressi */}
        <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#003e62]/5 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-lg font-semibold text-on-surface mb-6">I Tuoi Progressi</h2>

          {isLoading ? (
            <div className="flex justify-around">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-24 w-24 rounded-full" />
            </div>
          ) : rings.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">
              Nessun blocco attivo. Il tuo Coach te ne assegnerà uno a breve.
            </p>
          ) : (
            <div className="flex justify-around items-center flex-wrap gap-stack-md">
              {rings.map((r) => (
                <CircularProgress
                  key={r.key}
                  value={r.assigned ? r.booked / r.assigned : 0}
                  display={`${r.booked}/${r.assigned}`}
                  label={r.name}
                  color={r.color}
                />
              ))}
            </div>
          )}
        </section>

        {/* Prossimo Appuntamento */}
        {isLoading ? (
          <Skeleton className="h-40 w-full rounded-[32px]" />
        ) : nextBooking ? (
          <NextAppointmentCard
            bookingId={nextBooking.id}
            date={new Date(nextBooking.scheduled_at)}
            durationMin={nextEventType?.duration ?? 60}
            label={nextEventType?.name ?? sessionLabel(nextBooking.session_type)}
            color={nextEventType?.color ?? "#039BE5"}
            calendarUrl={generateGoogleCalendarLink(
              nextBooking,
              nextEventType
                ? {
                    name: nextEventType.name,
                    duration: nextEventType.duration,
                    location_type: nextEventType.location_type,
                    location_address: nextEventType.location_address,
                  }
                : null,
              fullName,
            )}
          />
        ) : (
          <EmptyAppointment onBook={() => navigate({ to: "/client/book" })} />
        )}

        {/* Quick Actions */}
        <section className="flex flex-col gap-stack-md mt-4">
          <Link
            to="/client/book"
            className="w-full bg-primary-container text-white font-semibold text-base py-4 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:opacity-90 transition active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus className="size-5" />
            Prenota Nuova Sessione
          </Link>
          <a
            href="#storico"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("storico")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="w-full bg-surface-container-high text-on-surface font-semibold text-base py-4 rounded-full hover:bg-surface-container-highest transition-colors active:scale-95 flex items-center justify-center gap-2"
          >
            <History className="size-5" />
            Vedi Storico
          </a>
        </section>

        {/* Storico */}
        <section id="storico" className="pb-8">
          <h3 className="text-lg font-semibold text-on-surface mb-stack-md ml-1">
            Storico Sessioni
          </h3>
          <HistoryList />
        </section>
      </main>
    </div>
  );
}

function NextAppointmentCard({
  bookingId,
  date,
  durationMin,
  label,
  color,
  calendarUrl,
}: {
  bookingId: string;
  date: Date;
  durationMin: number;
  label: string;
  color: string;
  calendarUrl: string;
}) {
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
  else
    dayLabel = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  const isFuture = date.getTime() > Date.now();

  return (
    <Link
      to="/client/bookings/$bookingId"
      params={{ bookingId }}
      className="block bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 hover:bg-surface-container-low transition-colors"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-on-surface">Prossimo Appuntamento</h3>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shrink-0"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h4 className="text-2xl font-semibold text-on-surface capitalize leading-tight">
          {dayLabel}
        </h4>
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Clock className="size-[18px]" />
          <span className="text-base">
            {startStr} - {endStr}
          </span>
        </div>
      </div>
      {isFuture && (
        <div className="mt-6 pt-4 border-t border-surface-container-high flex justify-end">
          <a
            href={calendarUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary border border-primary px-6 py-2 rounded-full hover:bg-primary/5 active:scale-95 transition-all"
          >
            <CalendarPlus className="size-4" />
            Aggiungi al Calendario
          </a>
        </div>
      )}
    </Link>
  );
}

function EmptyAppointment({ onBook }: { onBook: () => void }) {
  return (
    <div className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30">
      <h3 className="text-lg font-semibold text-on-surface mb-6">Prossimo Appuntamento</h3>
      <div className="text-center flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-surface-container-high grid place-items-center text-on-surface-variant">
          <CalendarPlus className="size-6" />
        </div>
        <div>
          <p className="text-base font-semibold text-on-surface">Nessuna sessione in programma</p>
          <p className="text-sm text-on-surface-variant">
            Prenota la tua prossima sessione per iniziare.
          </p>
        </div>
        <Button
          onClick={onBook}
          className="rounded-full font-semibold text-base py-4 px-8 h-auto shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
        >
          Prenota ora
        </Button>
      </div>
    </div>
  );
}

function HistoryList() {
  const { user } = useAuth();
  const bookingsQ = useClientBookings(user?.id);
  const past = useMemo(
    () =>
      (bookingsQ.data ?? [])
        .filter((b) => new Date(b.scheduled_at).getTime() < Date.now())
        .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at))
        .slice(0, 10),
    [bookingsQ.data],
  );
  if (bookingsQ.isLoading) return <Skeleton className="h-24 w-full rounded-[1rem]" />;
  if (past.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-[1rem] p-5 text-base text-on-surface-variant text-center border border-outline-variant/20">
        Nessuna sessione passata.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {past.map((b) => {
        const d = new Date(b.scheduled_at);
        const statusLabel =
          b.status === "completed"
            ? "Completata"
            : b.status === "cancelled"
              ? "Annullata"
              : b.status === "late_cancelled"
                ? "Cancellazione tardiva"
                : b.status === "no_show"
                  ? "No Show"
                  : "In programma";
        const statusClass =
          b.status === "completed"
            ? "bg-success/10 text-success"
            : b.status === "cancelled" || b.status === "late_cancelled" || b.status === "no_show"
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary";
        return (
          <Link
            key={b.id}
            to="/client/bookings/$bookingId"
            params={{ bookingId: b.id }}
            className="bg-surface-container-lowest rounded-[1.25rem] p-5 border border-outline-variant/20 flex items-center justify-between gap-4 hover:bg-surface-container-low transition-colors active:scale-[0.99]"
          >
            <div className="min-w-0 flex flex-col gap-1">
              <p className="text-lg font-semibold text-on-surface truncate">
                {sessionLabel(b.session_type)}
              </p>
              <p className="text-base text-on-surface-variant">
                {d.toLocaleDateString("it-IT", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold shrink-0 ${statusClass}`}
            >
              {statusLabel}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
