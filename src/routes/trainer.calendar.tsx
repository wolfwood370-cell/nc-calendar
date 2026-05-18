import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  UserSearch,
  MessageCircle,
  HelpCircle,
  Calendar as CalendarIcon,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { sessionLabel } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import {
  useCoachBookings,
  useCoachClients,
  useCoachEventTypes,
  type BookingRow,
  type ProfileRow,
  type EventTypeRow,
} from "@/lib/queries";
import { invalidateBookingScope, queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth";
import { syncCalendarAwait, reportSyncFailure } from "@/lib/sync-calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/trainer/calendar")({
  component: CalendarPage,
});

const HOUR_HEIGHT = 64; // px
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} ${start.toLocaleDateString("it-IT", { month: "long" })}`;
  }
  return `${start.toLocaleDateString("it-IT", opts)} - ${end.toLocaleDateString("it-IT", opts)}`;
}

interface EventPlacement {
  col: number;
  cols: number;
}

// Lane assignment for overlapping events (Google Calendar style):
// 1. Sort events by start time.
// 2. Walk events; flush a "cluster" whenever the next event starts after the
//    cluster's running end. Within a cluster, every event shares a lane count.
// 3. Greedily place each event in the lowest column whose previous event ended
//    on or before this event's start.
// The result lets renderEvent compute left/width via CSS calc so overlapping
// events sit side-by-side instead of stacking invisibly (audit finding H7).
function layoutDay(
  events: BookingRow[],
  durationMin: (b: BookingRow) => number,
): Map<string, EventPlacement> {
  const result = new Map<string, EventPlacement>();
  const withTimes = events
    .map((b) => {
      const start = new Date(b.scheduled_at).getTime();
      return { b, start, end: start + durationMin(b) * 60_000 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let cluster: typeof withTimes = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const placements: Array<{ id: string; col: number }> = [];
    for (const ev of cluster) {
      let col = laneEnds.findIndex((e) => e <= ev.start);
      if (col === -1) {
        col = laneEnds.length;
        laneEnds.push(ev.end);
      } else {
        laneEnds[col] = ev.end;
      }
      placements.push({ id: ev.b.id, col });
    }
    const cols = laneEnds.length;
    for (const p of placements) result.set(p.id, { col: p.col, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of withTimes) {
    if (ev.start >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();
  return result;
}

// ----------------------------------------------------------------------------
// Mobile Agenda View (audit finding H5)
// ----------------------------------------------------------------------------
// Replaces the 7-column desktop grid on <md screens with a single-day agenda:
//   - horizontal pill scroller for day selection
//   - vertical list of event cards using the Aura Health card shape
// Tapping an event card delegates to the same handlers the desktop grid uses
// (Assign dialog for unassigned events, focus client for certified bookings),
// so the action surface is identical across breakpoints.

interface MobileAgendaViewProps {
  weekDays: Date[];
  bookingsByDay: BookingRow[][];
  clientsMap: Map<string, ProfileRow>;
  eventTypesMap: Map<string, EventTypeRow>;
  today: Date;
  onSelectAssign: (b: BookingRow) => void;
  onSelectClient: (clientId: string) => void;
}

function MobileAgendaView({
  weekDays,
  bookingsByDay,
  clientsMap,
  eventTypesMap,
  today,
  onSelectAssign,
  onSelectClient,
}: MobileAgendaViewProps) {
  // Default to today's index within the visible week; fall back to Monday.
  const todayIdx = useMemo(() => weekDays.findIndex((d) => sameDay(d, today)), [weekDays, today]);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(todayIdx >= 0 ? todayIdx : 0);

  // When the user navigates weeks, keep the selected weekday index — so
  // "Tuesday" stays selected when moving across weeks. If today appears in
  // the new week and the user hasn't manually picked a day yet, prefer today.
  const lastTodayIdxRef = useRef<number>(todayIdx);
  useEffect(() => {
    if (todayIdx !== -1 && todayIdx !== lastTodayIdxRef.current) {
      setSelectedDayIdx(todayIdx);
    }
    lastTodayIdxRef.current = todayIdx;
  }, [todayIdx]);

  const dayBookings = useMemo(() => {
    const list = bookingsByDay[selectedDayIdx] ?? [];
    return [...list].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
  }, [bookingsByDay, selectedDayIdx]);

  return (
    <div className="md:hidden flex-1 flex flex-col gap-4">
      {/* Date scroller */}
      <div className="-mx-2 overflow-x-auto pb-1" aria-label="Selettore giorno">
        <div className="flex items-center gap-2 px-2 w-max">
          {weekDays.map((d, i) => {
            const isActive = i === selectedDayIdx;
            const isToday = sameDay(d, today);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDayIdx(i)}
                className={cn(
                  "shrink-0 min-w-[64px] px-3 py-2 rounded-full flex flex-col items-center gap-0.5 transition-colors",
                  isActive
                    ? "bg-primary-container text-on-primary-container shadow-soft-blue"
                    : "text-outline hover:bg-surface-container active:bg-surface-container-high",
                )}
                aria-pressed={isActive}
                aria-current={isToday ? "date" : undefined}
              >
                <span className="text-label-sm uppercase tracking-wider font-medium">
                  {DAY_LABELS[i]}
                </span>
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    !isActive && isToday && "text-aura-primary",
                  )}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Event list */}
      {dayBookings.length === 0 ? (
        <div className="rounded-[24px] border border-outline-variant/30 bg-white p-6 text-center text-sm text-outline shadow-soft-blue">
          <CalendarIcon className="size-8 mx-auto mb-2 text-outline-variant" />
          Nessun evento programmato per questo giorno.
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Eventi del giorno">
          {dayBookings.map((b) => (
            <li key={b.id}>
              <MobileEventCard
                booking={b}
                clientsMap={clientsMap}
                eventTypesMap={eventTypesMap}
                onSelectAssign={onSelectAssign}
                onSelectClient={onSelectClient}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface MobileEventCardProps {
  booking: BookingRow;
  clientsMap: Map<string, ProfileRow>;
  eventTypesMap: Map<string, EventTypeRow>;
  onSelectAssign: (b: BookingRow) => void;
  onSelectClient: (clientId: string) => void;
}

function MobileEventCard({
  booking: b,
  clientsMap,
  eventTypesMap,
  onSelectAssign,
  onSelectClient,
}: MobileEventCardProps) {
  const d = new Date(b.scheduled_at);
  const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
  const duration = et?.duration ?? 60;

  const isUnassigned = !b.client_id;
  const isExternal = !!b.client_id && b.client_id === b.coach_id;
  const client = b.client_id && !isExternal ? clientsMap.get(b.client_id) : undefined;
  const typeLabel = et?.name ?? (b.session_type ? sessionLabel(b.session_type) : "Sessione");

  const startTime = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const endTime = new Date(d.getTime() + duration * 60_000).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isClickable = !isExternal;
  const handleTap = () => {
    if (isUnassigned) {
      onSelectAssign(b);
    } else if (!isExternal && b.client_id) {
      onSelectClient(b.client_id);
    }
  };

  const title = isUnassigned
    ? "Da assegnare"
    : isExternal
      ? (b.notes ?? "").replace(/^Importato da Google Calendar:\s*/i, "") || "Evento esterno"
      : client?.full_name || "Cliente";
  const subtitle = isExternal ? null : typeLabel;

  return (
    <button
      type="button"
      onClick={isClickable ? handleTap : undefined}
      disabled={!isClickable}
      aria-label={`${title} alle ${startTime}`}
      className={cn(
        "w-full bg-white rounded-[24px] border border-outline-variant/30 shadow-soft-blue p-4 flex items-stretch gap-3 text-left",
        isClickable && "hover:shadow-md active:scale-[0.99] transition-all cursor-pointer",
        !isClickable && "cursor-default",
      )}
    >
      <div className="flex flex-col justify-center items-center min-w-[56px] gap-0.5">
        <span className="text-base font-semibold tabular-nums text-aura-primary">{startTime}</span>
        <span className="text-label-sm tabular-nums text-outline">{endTime}</span>
      </div>
      <div className="w-px bg-outline-variant/30 self-stretch" aria-hidden="true" />
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <h3 className="text-sm font-semibold text-on-surface line-clamp-2">{title}</h3>
        {subtitle && <p className="text-xs text-outline truncate">{subtitle}</p>}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {isUnassigned && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label-sm font-semibold bg-warning-container text-tertiary">
              Assegna
            </span>
          )}
          {isExternal && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label-sm font-medium bg-surface-container text-outline">
              Esterno
            </span>
          )}
          {!isUnassigned && !isExternal && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label-sm font-medium bg-primary-fixed/60 text-on-primary-fixed-variant">
              {sessionLabel(b.session_type)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [mirroring, setMirroring] = useState(false);
  const lastMirrorMonth = useRef<string>("");
  const [showAvailability, setShowAvailability] = useState(false);
  const [onlyPT, setOnlyPT] = useState(false);
  const [onlyToAssign, setOnlyToAssign] = useState(false);

  const bookingsQ = useCoachBookings(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const eventTypesQ = useCoachEventTypes(user?.id);

  const bookings = bookingsQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const eventTypes = eventTypesQ.data ?? [];

  const clientsMap = useMemo(() => {
    const m = new Map<string, (typeof clients)[number]>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);
  const eventTypesMap = useMemo(() => {
    const m = new Map<string, (typeof eventTypes)[number]>();
    eventTypes.forEach((e) => m.set(e.id, e));
    return m;
  }, [eventTypes]);

  // ----- Focus Cliente -----
  const [focusClientId, setFocusClientId] = useState<string | null>(null);
  const focusClient = focusClientId ? (clientsMap.get(focusClientId) ?? null) : null;

  const lastNoteQ = useQuery({
    queryKey: ["last-note", focusClientId],
    enabled: !!focusClientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("scheduled_at, trainer_notes")
        .eq("client_id", focusClientId!)
        .not("trainer_notes", "is", null)
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { scheduled_at: string; trainer_notes: string } | null;
    },
  });

  // ----- Assign dialog -----
  const [assignTarget, setAssignTarget] = useState<BookingRow | null>(null);
  const [assignClientId, setAssignClientId] = useState<string>("");
  const assignBooking = useMutation({
    mutationFn: async (input: { bookingId: string; clientId: string }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ client_id: input.clientId })
        .eq("id", input.bookingId);
      if (error) throw error;
    },
    // M1: optimistic update — patch the bookings cache for the current coach
    // immediately so the calendar reflects the new assignment without
    // waiting for the round-trip + invalidation refetch. The context returns
    // a snapshot used by onError to roll back if the network call fails.
    onMutate: async (vars) => {
      const key = queryKeys.bookings.coach(user?.id);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BookingRow[]>(key);
      qc.setQueryData<BookingRow[]>(key, (old) =>
        (old ?? []).map((b) => (b.id === vars.bookingId ? { ...b, client_id: vars.clientId } : b)),
      );
      setAssignTarget(null);
      setAssignClientId("");
      return { previous, key };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
      toast.error("Errore", { description: e.message });
    },
    onSuccess: (_data, vars) => {
      toast.success("Sessione assegnata");
      invalidateBookingScope(qc, {
        coachId: user?.id ?? null,
        clientId: vars.clientId,
      });
    },
  });

  // ----- Week navigation -----
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  // weekDays is built from `Array.from({ length: 7 }, ...)` so [6] is always
  // defined; the fallback to `weekStart` satisfies noUncheckedIndexedAccess.
  const weekEnd = weekDays[6] ?? weekStart;

  const bookingsByDay = useMemo(() => {
    const map: BookingRow[][] = Array.from({ length: 7 }, () => []);
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const isUnassigned = !b.client_id;
      const isExternal = !!b.client_id && b.client_id === b.coach_id;
      if (onlyToAssign && !isUnassigned) continue;
      if (onlyPT && (isExternal || b.session_type !== "PT Session")) continue;
      const d = new Date(b.scheduled_at);
      for (let i = 0; i < 7; i++) {
        const dayDate = weekDays[i];
        const dayList = map[i];
        if (dayDate && dayList && sameDay(d, dayDate)) {
          dayList.push(b);
          break;
        }
      }
    }
    return map;
  }, [bookings, weekDays, onlyToAssign, onlyPT]);

  const layoutByDay = useMemo(() => {
    const durationOf = (b: BookingRow): number =>
      (b.event_type_id ? eventTypesMap.get(b.event_type_id)?.duration : undefined) ?? 60;
    return bookingsByDay.map((day) => layoutDay(day, durationOf));
  }, [bookingsByDay, eventTypesMap]);

  const totalVisible = useMemo(
    () => bookingsByDay.reduce((s, day) => s + day.length, 0),
    [bookingsByDay],
  );
  const filtersActive = onlyPT || onlyToAssign;

  // ----- Sync flows -----
  // M9: ref-based gates now carry the user.id (or `${user.id}-${monthKey}`)
  // they last fired for, instead of a plain boolean. If the auth user
  // changes without a remount (rare but possible during silent token
  // refresh or a fast logout/login), the gate no longer falsely reports
  // "already synced" for the new user.
  const didFullSyncForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user || didFullSyncForUser.current === user.id) return;
    didFullSyncForUser.current = user.id;
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    setMirroring(true);
    syncCalendarAwait({
      action: "import_history",
      coachId: user.id,
      rangeStartISO: "2026-01-01T00:00:00Z",
      rangeEndISO: future.toISOString(),
    })
      .then(({ data }) => {
        const r = data as {
          ok?: boolean;
          imported?: number;
          updated?: number;
          creditsBooked?: number;
          skipped?: boolean;
        } | null;
        if (r?.skipped) return;
        if (r?.ok) {
          toast.success("Sincronizzazione completata", {
            description: `${r.imported ?? 0} nuovi · ${r.updated ?? 0} aggiornati · ${r.creditsBooked ?? 0} crediti scalati`,
          });
          qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user.id) });
          qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user.id) });
        }
      })
      .catch((e) => {
        console.error("full sync failed", e);
        reportSyncFailure("import_history", e);
      })
      .finally(() => setMirroring(false));
  }, [user, qc]);

  useEffect(() => {
    if (!user) return;
    const monthKey = `${user.id}-${weekStart.getFullYear()}-${weekStart.getMonth()}`;
    if (lastMirrorMonth.current === monthKey) return;
    lastMirrorMonth.current = monthKey;
    const start = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1).toISOString();
    const end = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth() + 1,
      0,
      23,
      59,
      59,
    ).toISOString();
    setMirroring(true);
    syncCalendarAwait({
      action: "mirror_check",
      coachId: user.id,
      rangeStartISO: start,
      rangeEndISO: end,
    })
      .then(({ data }) => {
        const r = data as {
          ok?: boolean;
          cancelled?: number;
          moved?: number;
          remapped?: number;
          imported?: number;
        } | null;
        if (
          r?.ok &&
          ((r.cancelled ?? 0) > 0 ||
            (r.moved ?? 0) > 0 ||
            (r.remapped ?? 0) > 0 ||
            (r.imported ?? 0) > 0)
        ) {
          toast.info("Calendario aggiornato");
          qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user.id) });
          qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user.id) });
        }
      })
      .catch((e) => {
        console.error("mirror_check failed", e);
        reportSyncFailure("mirror_check", e);
      })
      .finally(() => setMirroring(false));
  }, [user, weekStart, qc]);

  // ----- Render helpers -----
  const renderEvent = (b: BookingRow, placement: EventPlacement | undefined) => {
    const d = new Date(b.scheduled_at);
    const hour = d.getHours() + d.getMinutes() / 60;
    if (hour < START_HOUR || hour >= END_HOUR) return null;

    const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
    const duration = et?.duration ?? 60;
    const top = (hour - START_HOUR) * HOUR_HEIGHT;
    const height = Math.max(28, (duration / 60) * HOUR_HEIGHT - 4);

    // Overlap-lane positioning: events that share a time range get split into
    // side-by-side columns instead of stacking on top of each other.
    const cols = placement?.cols ?? 1;
    const col = placement?.col ?? 0;
    const widthPct = 100 / cols;
    const leftPct = col * widthPct;
    const laneStyle = {
      top,
      height,
      left: `calc(${leftPct}% + 4px)`,
      width: `calc(${widthPct}% - 8px)`,
    } as const;

    const isUnassigned = !b.client_id; // To Review
    const isExternal = !!b.client_id && b.client_id === b.coach_id; // Sync senza match
    const client = b.client_id && !isExternal ? clientsMap.get(b.client_id) : undefined;
    const typeLabel = et?.name ?? (b.session_type ? sessionLabel(b.session_type) : "Sessione");
    const safeDuration = duration > 0 ? duration : 60;
    const timeLabel = `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} - ${new Date(d.getTime() + safeDuration * 60000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

    if (isUnassigned) {
      return (
        <button
          key={b.id}
          onClick={() => {
            setAssignTarget(b);
            setAssignClientId("");
          }}
          style={laneStyle}
          className="absolute z-10 border-2 border-dashed border-warning-border bg-warning-container/40 rounded-2xl p-2 flex flex-col items-center justify-center gap-1 text-tertiary hover:bg-warning-container/70 hover:scale-[1.02] transition-all cursor-pointer"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <HelpCircle className="size-3.5 animate-pulse" /> Assegna
          </div>
          <div className="text-[10px] opacity-80">{timeLabel}</div>
        </button>
      );
    }

    if (isExternal) {
      const title =
        (b.notes ?? "").replace(/^Importato da Google Calendar:\s*/i, "") || "Evento esterno";
      return (
        <div
          key={b.id}
          style={laneStyle}
          className="absolute z-10 bg-surface-container-low border border-outline-variant/40 rounded-2xl p-2 cursor-default hover:bg-surface-container transition-colors"
        >
          <h4 className="text-[12px] leading-tight font-medium text-on-surface-variant truncate">
            {title}
          </h4>
          <p className="text-[10px] text-outline mt-0.5">{timeLabel}</p>
        </div>
      );
    }

    // Certified
    return (
      <button
        key={b.id}
        onClick={() => setFocusClientId(b.client_id)}
        style={laneStyle}
        className="absolute z-10 bg-primary-fixed border-l-4 border-aura-primary rounded-2xl p-2 flex flex-col justify-between text-left shadow-sm hover:shadow-md hover:scale-[1.02] hover:z-20 transition-all cursor-pointer"
      >
        <div>
          <h4 className="text-[12px] leading-tight font-semibold text-on-primary-fixed truncate">
            {client?.full_name || "Cliente"} — {typeLabel || "Evento senza titolo"}
          </h4>
          <p className="text-[10px] text-on-primary-fixed-variant mt-0.5">{timeLabel}</p>
        </div>
      </button>
    );
  };

  const today = new Date();

  return (
    <div className="-m-6 flex flex-col xl:flex-row min-h-[calc(100vh-3.5rem)] bg-surface">
      {/* MAIN */}
      <section className="flex-1 flex flex-col min-w-0 p-6">
        {/* Header */}
        <header className="flex flex-col gap-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="font-display text-2xl font-bold text-aura-primary">Calendario Master</h1>
            {mirroring && (
              <div className="flex items-center gap-2 text-xs text-outline rounded-full border border-outline-variant px-3 py-1.5 bg-white">
                <Loader2 className="size-3.5 animate-spin" /> Sincronizzazione…
              </div>
            )}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                className="rounded-full bg-white border-surface-variant"
              >
                Oggi
              </Button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  className="size-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
                  aria-label="Settimana precedente"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-semibold min-w-40 text-center capitalize">
                  {fmtRange(weekStart, weekEnd)}
                </span>
                <button
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="size-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
                  aria-label="Settimana successiva"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <FilterChip active={showAvailability} onClick={() => setShowAvailability((v) => !v)}>
                Mostra Disponibilità
              </FilterChip>
              <FilterChip active={onlyPT} onClick={() => setOnlyPT((v) => !v)}>
                Solo Sessioni PT
              </FilterChip>
              <FilterChip active={onlyToAssign} onClick={() => setOnlyToAssign((v) => !v)}>
                Eventi da Assegnare
              </FilterChip>
              <button
                onClick={() => {
                  qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
                  qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
                  qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
                  toast.success("Calendario aggiornato");
                }}
                className="size-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
                aria-label="Aggiorna"
                title="Aggiorna calendario"
              >
                <RefreshCw className="size-4" />
              </button>
            </div>
          </div>
          {bookingsQ.isError && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4" />
                Errore nel caricamento del calendario.
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bookingsQ.refetch()}
                className="rounded-full bg-white"
              >
                Riprova
              </Button>
            </div>
          )}
          {!bookingsQ.isError && filtersActive && totalVisible === 0 && (
            <div className="rounded-2xl border border-surface-variant bg-white px-4 py-3 text-sm text-outline">
              Nessun evento corrisponde ai filtri attivi.
            </div>
          )}
        </header>

        {/* Mobile agenda view (audit H5) — replaces the 7-column grid below md */}
        <MobileAgendaView
          weekDays={weekDays}
          bookingsByDay={bookingsByDay}
          clientsMap={clientsMap}
          eventTypesMap={eventTypesMap}
          today={today}
          onSelectAssign={(b) => {
            setAssignTarget(b);
            setAssignClientId("");
          }}
          onSelectClient={(clientId) => setFocusClientId(clientId)}
        />

        {/* Grid — desktop only (md and up). Mobile users see MobileAgendaView above. */}
        <div
          className={`hidden md:flex flex-1 bg-white rounded-[32px] shadow-soft-blue border border-surface-container overflow-hidden md:flex-col`}
        >
          {/* Days header */}
          <div className="flex border-b border-surface-container bg-surface sticky top-0 z-20">
            <div className="w-16 shrink-0 border-r border-surface-container" />
            <div className="flex-1 grid grid-cols-7">
              {weekDays.map((d, i) => {
                const isToday = sameDay(d, today);
                return (
                  <div
                    key={i}
                    className={`p-3 text-center border-r border-surface-container last:border-r-0 ${isToday ? "bg-primary-fixed/30" : ""}`}
                  >
                    <div
                      className={`text-[11px] uppercase tracking-wider ${isToday ? "text-aura-primary font-bold" : "text-outline"}`}
                    >
                      {DAY_LABELS[i]}
                    </div>
                    <div
                      className={`text-xl mt-1 ${isToday ? "text-aura-primary font-bold" : "font-semibold"}`}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex relative" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
              {/* Hours */}
              <div className="w-16 shrink-0 border-r border-surface-container bg-surface">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ height: HOUR_HEIGHT }}
                    className="border-b border-surface-container flex items-start justify-center pt-1 text-[11px] text-outline"
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {/* Day columns */}
              <div className="flex-1 grid grid-cols-7 relative">
                {weekDays.map((d, i) => {
                  const isToday = sameDay(d, today);
                  return (
                    <div
                      key={i}
                      className={`relative border-r border-surface-container/60 last:border-r-0 ${isToday ? "bg-primary-fixed/10" : ""}`}
                      style={{ height: HOURS.length * HOUR_HEIGHT }}
                    >
                      {/* hour grid lines */}
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                          className="absolute left-0 right-0 border-b border-surface-container"
                        />
                      ))}
                      {(bookingsByDay[i] ?? []).map((b) =>
                        renderEvent(b, layoutByDay[i]?.get(b.id)),
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTEXT PANEL */}
      <aside className="hidden xl:flex flex-col w-80 border-l border-surface-variant bg-surface sticky top-0 h-screen">
        <div className="p-6 border-b border-surface-variant bg-white/50 backdrop-blur-md">
          <h3 className="text-lg font-bold text-aura-primary flex items-center gap-2">
            <UserSearch className="size-5" /> Focus Cliente
          </h3>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {!focusClientId && (
            <div
              className={`bg-white rounded-[24px] p-6 shadow-soft-blue border border-surface-container-low text-center text-sm text-outline`}
            >
              <CalendarIcon className="size-10 mx-auto mb-3 text-outline-variant" />
              Seleziona una sessione confermata per vedere il dettaglio cliente.
            </div>
          )}

          {focusClientId && !focusClient && clientsQ.isLoading && (
            <div
              className={`bg-white rounded-[24px] p-6 shadow-soft-blue border border-surface-container-low space-y-3`}
            >
              <Skeleton className="size-20 rounded-full mx-auto" />
              <Skeleton className="h-4 w-2/3 mx-auto" />
              <Skeleton className="h-3 w-1/2 mx-auto" />
              <Skeleton className="h-9 w-full rounded-2xl" />
            </div>
          )}

          {focusClientId && !focusClient && !clientsQ.isLoading && (
            <div
              className={`bg-white rounded-[24px] p-6 shadow-soft-blue border border-surface-container-low text-center text-sm text-outline`}
            >
              Cliente non trovato.
            </div>
          )}

          {focusClient && (
            <>
              <div
                className={`bg-white rounded-[24px] p-6 shadow-soft-blue border border-surface-container-low flex flex-col items-center text-center`}
              >
                <div className="size-20 rounded-full bg-primary-fixed text-aura-primary flex items-center justify-center text-2xl font-bold border-4 border-surface mb-3 shadow-sm">
                  {(focusClient.full_name ?? "?")
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((s) => s[0]?.toUpperCase())
                    .join("")}
                </div>
                <h4 className="text-lg font-bold text-on-surface">
                  {focusClient.full_name ?? "Cliente"}
                </h4>
                <p className="text-sm text-on-surface-variant mb-4">{focusClient.email ?? ""}</p>
                <Button
                  asChild
                  variant="secondary"
                  className="w-full bg-surface-container-low text-on-surface hover:bg-surface-container rounded-2xl font-semibold"
                >
                  <Link to="/trainer/clients/$id" params={{ id: focusClient.id }}>
                    Profilo Completo
                  </Link>
                </Button>
              </div>

              <div
                className={`bg-white rounded-[24px] p-4 shadow-soft-blue border border-surface-container-low`}
              >
                {focusClient.phone ? (
                  <a
                    href={`https://wa.me/${focusClient.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-brand-whatsapp/10 text-on-brand-whatsapp border border-brand-whatsapp/30 text-sm font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-brand-whatsapp/20 transition-colors"
                  >
                    <MessageCircle className="size-4" /> Messaggio WhatsApp
                  </a>
                ) : (
                  <button
                    disabled
                    className="w-full bg-surface-container-low text-outline border border-surface-variant text-sm font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed opacity-70"
                  >
                    <MessageCircle className="size-4" /> Numero non disponibile
                  </button>
                )}
              </div>

              <div
                className={`bg-white rounded-[24px] p-5 shadow-soft-blue border border-surface-container-low`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-[11px] uppercase tracking-wider font-bold text-on-surface">
                    Note Ultima Sessione
                  </h5>
                  {lastNoteQ.data?.scheduled_at && (
                    <span className="text-[11px] text-outline">
                      {new Date(lastNoteQ.data.scheduled_at).toLocaleDateString("it-IT", {
                        day: "2-digit",
                        month: "long",
                      })}
                    </span>
                  )}
                </div>
                <div className="bg-surface p-4 rounded-2xl">
                  {lastNoteQ.isLoading ? (
                    <p className="text-sm text-outline">Caricamento…</p>
                  ) : lastNoteQ.data?.trainer_notes ? (
                    <p className="text-sm text-on-surface-variant italic leading-relaxed">
                      "{lastNoteQ.data.trainer_notes}"
                    </p>
                  ) : (
                    <p className="text-sm text-outline italic">Nessuna nota disponibile.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Assign Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna evento a un cliente</DialogTitle>
            <DialogDescription>
              {assignTarget &&
                new Date(assignTarget.scheduled_at).toLocaleString("it-IT", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              {""}
            </DialogDescription>
          </DialogHeader>
          <Select value={assignClientId} onValueChange={setAssignClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona cliente…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name ?? c.email ?? "Cliente"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTarget(null)}>
              Annulla
            </Button>
            <Button
              disabled={!assignClientId || assignBooking.isPending}
              onClick={() =>
                assignTarget &&
                assignBooking.mutate({ bookingId: assignTarget.id, clientId: assignClientId })
              }
            >
              {assignBooking.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Assegna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-aura-primary text-white border-aura-primary"
          : "bg-white text-on-surface-variant border-surface-variant hover:bg-surface-container"
      }`}
    >
      {children}
    </button>
  );
}
