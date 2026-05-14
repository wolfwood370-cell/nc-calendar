import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bell, Plus, Clock, Calendar, Check, ChevronDown } from "lucide-react";
import type { BookingRow, EventTypeRow } from "@/lib/queries";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useClientBlocks, useClientBookings, useCoachEventTypes, useClientExtraCredits } from "@/lib/queries";
import { sessionLabel } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

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
  const extraCreditsQ = useClientExtraCredits(meId);

  // Aggregate ALL allocations across all blocks, grouped by event_type (or session_type fallback)
  const summary = useMemo(() => {
    const blocks = blocksQ.data ?? [];
    const ets = eventTypesQ.data ?? [];
    const extraCredits = extraCreditsQ.data ?? [];
    const map = new Map<
      string,
      { name: string; color: string; used: number; total: number }
    >();
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

    return [...map.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total);
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

  const isLoading = blocksQ.isLoading || bookingsQ.isLoading || profileQ.isLoading || extraCreditsQ.isLoading;

  return (
    <div className="max-w-md mx-auto bg-surface min-h-screen">
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
        {/* Il Tuo Percorso */}
        <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-xl font-semibold text-on-surface mb-6">Il Tuo Percorso</h2>

          {isLoading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : summary.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              Nessun percorso attivo. Contatta il tuo coach.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {summary.map((row) => {
                const pct = row.total > 0 ? Math.min(100, (row.used / row.total) * 100) : 0;
                const remaining = Math.max(0, row.total - row.used);
                return (
                  <div key={row.key} className="flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-semibold text-on-surface">{row.name}</span>
                      <span className="text-base font-semibold" style={{ color: row.color }}>
                        {row.used} / {row.total}
                      </span>
                    </div>
                    <div className="h-3 w-full bg-primary-container/20 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: row.color }}
                      />
                    </div>
                    <div className="text-xs text-on-surface-variant/70">
                      Fatte: {row.used} • Rimanenti: {remaining}
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
            <NextAppointmentCard
              bookingId={nextBooking.id}
              date={new Date(nextBooking.scheduled_at)}
              durationMin={nextEventType?.duration ?? 60}
              label={nextEventType?.name ?? sessionLabel(nextBooking.session_type)}
              color={nextEventType?.color ?? "#039BE5"}
              isBooster={isBoosterBooking(nextBooking)}
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
            <SessionTimeline
              bookings={bookingsQ.data ?? []}
              eventTypes={eventTypesQ.data ?? []}
            />
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

function NextAppointmentCard({
  bookingId,
  date,
  durationMin,
  label,
  color,
}: {
  bookingId: string;
  date: Date;
  durationMin: number;
  label: string;
  color: string;
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
  else dayLabel = date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });

  return (
    <Link
      to="/client/bookings/$bookingId"
      params={{ bookingId }}
      className="block bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 border border-outline-variant/30 hover:bg-surface-container-low transition-colors"
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex gap-4 items-center min-w-0">
          <div
            className="w-16 h-16 shrink-0 rounded-full grid place-items-center"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            <Calendar className="size-8" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <h4 className="text-2xl font-semibold text-on-surface capitalize leading-tight truncate">
              {dayLabel}
            </h4>
            <div className="flex items-center gap-2 text-on-surface-variant">
              <Clock className="size-[18px]" />
              <span className="text-base">
                {startStr} - {endStr}
              </span>
            </div>
          </div>
        </div>
        <span
          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold shrink-0"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {label}
        </span>
      </div>
    </Link>
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
  const et = booking.event_type_id
    ? eventTypes.find((e) => e.id === booking.event_type_id)
    : null;
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
                      <TimelineCard
                        key={b.id}
                        booking={b}
                        eventTypes={eventTypes}
                        compact
                      />
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
