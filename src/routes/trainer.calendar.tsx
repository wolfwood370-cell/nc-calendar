import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsBelowXl } from "@/hooks/use-mobile";
import { useGcalWatchRenewal } from "@/hooks/use-gcal-watch-renewal";
import { FocusClientPanel } from "@/components/focus-client-panel";
import { FilterChip } from "@/components/filter-chip";
import { layoutDay, type EventPlacement } from "@/lib/calendar-layout";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  UserSearch,
  MessageCircle,
  HelpCircle,
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
import { queryKeys } from "@/lib/query-keys";
import { useAuth } from "@/lib/auth";
import {
  syncCalendarAwait,
  reportSyncFailure,
  shouldSkipAutoSync,
  markAutoSyncDone,
} from "@/lib/sync-calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DAY_LABELS,
  isAllDayEvent,
  IMPORT_PREFIX,
  AllDayPill,
  personalBlockTitle,
  sameDay,
  MobileAgendaView,
} from "@/components/mobile-calendar-agenda";

export const Route = createFileRoute("/trainer/calendar")({
  component: CalendarPage,
});

const HOUR_HEIGHT = 64; // px
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

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
function fmtRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} ${start.toLocaleDateString("it-IT", { month: "long" })}`;
  }
  return `${start.toLocaleDateString("it-IT", opts)} - ${end.toLocaleDateString("it-IT", opts)}`;
}

function CalendarPage() {
  const { user } = useAuth();
  // BUG-7 fix: ensure the Google push notification channel doesn't
  // silently die after its ~7-day TTL. The hook is a no-op when
  // channel is fresh + when Google isn't connected.
  useGcalWatchRenewal(user?.id ?? null);
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
  // H5 follow-up: render the focus panel inside a Sheet when the viewport
  // can't host the sticky aside (anything below the xl breakpoint).
  const isBelowXl = useIsBelowXl();

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

  // ----- Review dialog opening helper (P4) -----
  // The actual dialog lives in the /trainer layout and reads its target
  // from the URL search param. Calendar tiles just navigate with the
  // booking id, the dialog opens automatically. Same param works from
  // Dashboard, Mobile views, deep links shared via chat, etc.
  const navigate = useNavigate();
  const openReview = (bookingId: string) => {
    navigate({
      to: "/trainer/calendar",
      search: (prev: Record<string, unknown>) => ({ ...prev, reviewEventId: bookingId }),
    });
  };

  // ----- Week navigation -----
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  // weekDays is built from `Array.from({ length: 7 }, ...)` so [6] is always
  // defined; the fallback to `weekStart` satisfies noUncheckedIndexedAccess.
  const weekEnd = weekDays[6] ?? weekStart;

  // Per-day buckets, split into `timed` (rendered inside the hour grid /
  // overlap lanes) and `allDay` (rendered above the grid in a dedicated
  // strip). All-day events have scheduled_at at midnight UTC and would
  // otherwise be filtered by the START_HOUR=7 guard in renderEvent — so
  // they need their own pipeline to ever appear on the calendar.
  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed: BookingRow[][] = Array.from({ length: 7 }, () => []);
    const allDay: BookingRow[][] = Array.from({ length: 7 }, () => []);
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      // Personal blocks are their own category — never "unassigned" (no
      // client to pick), never "external" (the coach owns them), never PT.
      const isPersonal = !!b.is_personal;
      const isUnassigned = !isPersonal && !b.client_id;
      const isExternal = !isPersonal && !!b.client_id && b.client_id === b.coach_id;
      if (onlyToAssign && !isUnassigned) continue;
      if (onlyPT && (isExternal || isPersonal || b.session_type !== "PT Session")) continue;
      const d = new Date(b.scheduled_at);
      for (let i = 0; i < 7; i++) {
        const dayDate = weekDays[i];
        if (dayDate && sameDay(d, dayDate)) {
          if (isAllDayEvent(b)) {
            allDay[i]!.push(b);
          } else {
            timed[i]!.push(b);
          }
          break;
        }
      }
    }
    return { timedByDay: timed, allDayByDay: allDay };
  }, [bookings, weekDays, onlyToAssign, onlyPT]);

  const layoutByDay = useMemo(() => {
    // H3: per-booking snapshot wins so changing an event type's duration
    // can't shift past sessions' overlap layout. All-day events are
    // excluded by the timed/allDay split above so they never enter
    // the overlap-lane calculation (where a 24h span would force every
    // sibling event into a one-pixel column).
    const durationOf = (b: BookingRow): number =>
      b.duration_min ??
      (b.event_type_id ? eventTypesMap.get(b.event_type_id)?.duration : undefined) ??
      60;
    return timedByDay.map((day) => layoutDay(day, durationOf));
  }, [timedByDay, eventTypesMap]);

  const totalVisible = useMemo(
    () =>
      timedByDay.reduce((s, day) => s + day.length, 0) +
      allDayByDay.reduce((s, day) => s + day.length, 0),
    [timedByDay, allDayByDay],
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
    // P1 (sync throttle): if another tab / earlier visit auto-synced
    // within the last 10 minutes, skip this call. Coaches who bounce
    // between routes were burning Google API quota on every mount.
    // The manual "Sincronizza ora" button explicitly bypasses this gate
    // and resets the timestamp, so it can always force a fresh sweep.
    if (shouldSkipAutoSync()) return;
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    setMirroring(true);
    syncCalendarAwait({
      action: "import_history",
      coachId: user.id,
      // Server-side computes the *actual* timeMin (P2): the earlier of
      // Jan 1 of the current year or the earliest active training_block
      // start_date. The hint we send is just the upper bound the
      // frontend wants visible; if a coach has clients starting in 2025
      // the server will widen it for us.
      rangeStartISO: new Date(new Date().getFullYear(), 0, 1).toISOString(),
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
          markAutoSyncDone();
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
    // P1 throttle also gates mirror_check — the per-month gate already
    // limits this, but a coach who paginates back-and-forth between
    // months would still re-trigger. The shared 10-minute window
    // collapses that into a single Google API call per visit cluster.
    if (shouldSkipAutoSync()) return;
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
        markAutoSyncDone();
      })
      .catch((e) => {
        console.error("mirror_check failed", e);
        reportSyncFailure("mirror_check", e);
      })
      .finally(() => setMirroring(false));
  }, [user, weekStart, qc]);

  // ----- Realtime: react to Google Calendar webhook pushes.
  // The /api/public/webhooks/gcal-watch endpoint bumps
  // `gcal_sync_signals.last_notification_at` (a Realtime-safe table that
  // intentionally contains no tokens; see migration
  // 20260523100000_gcal_sync_signals_realtime_safe.sql for why we split
  // it out from integration_settings).
  //
  // Note on the dropped bookings subscription: the audit 2026-05-22
  // security hardening pulled `public.bookings` out of the
  // supabase_realtime publication to prevent any-channel cross-coach
  // schedule leakage. The previous cross-tab/cross-device sync via
  // postgres_changes on bookings is therefore dormant — local mutations
  // (cancel, reschedule, mark_personal) still optimistically patch the
  // cache via React Query, and webhook-driven changes get reconciled
  // via the signal handler below. Multi-tab parity for direct UI
  // mutations is a documented follow-up.
  useEffect(() => {
    if (!user) return;
    const coachId = user.id;
    let lastNotificationSeen = 0;

    const channel = supabase
      .channel(`trainer-calendar-${coachId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gcal_sync_signals",
          filter: `coach_id=eq.${coachId}`,
        },
        (payload) => {
          const ts = (payload.new as { last_notification_at?: string | null })
            ?.last_notification_at;
          if (!ts) return;
          const t = new Date(ts).getTime();
          if (!Number.isFinite(t) || t <= lastNotificationSeen) return;
          lastNotificationSeen = t;
          // Background sync — silent, no toast on success; failure
          // surfaces via reportSyncFailure as usual. import_history is
          // idempotent and runs through the user-scoped Google OAuth
          // (no service-role impersonation of the user's calendar).
          const future = new Date();
          future.setFullYear(future.getFullYear() + 2);
          syncCalendarAwait({
            action: "import_history",
            coachId,
            rangeStartISO: new Date(new Date().getFullYear(), 0, 1).toISOString(),
            rangeEndISO: future.toISOString(),
          })
            .then(() => {
              qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
              qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
            })
            .catch((e) => {
              console.error("webhook-triggered sync failed", e);
              reportSyncFailure("import_history", e);
            });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);

  // ----- Render helpers -----
  const renderEvent = (b: BookingRow, placement: EventPlacement | undefined) => {
    // Safety net: timedByDay already excludes all-day events, but a
    // pre-existing booking with a midnight scheduled_at that's also
    // outside Google's start.date marker could slip in. Bail before
    // the hour-grid math so it never renders at the top edge.
    if (isAllDayEvent(b)) return null;
    const d = new Date(b.scheduled_at);
    const hour = d.getHours() + d.getMinutes() / 60;
    if (hour < START_HOUR || hour >= END_HOUR) return null;

    const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
    // H3: same snapshot-wins rule for the grid; otherwise the height of a
    // past session would change when the coach edits the event type.
    const duration = b.duration_min ?? et?.duration ?? 60;
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

    // Personal Block first: an is_personal=true row should not be
    // re-classified as unassigned/external even if old data has
    // client_id=coach_id from before the migration.
    const isPersonal = !!b.is_personal;
    const isUnassigned = !isPersonal && !b.client_id; // To Review
    const isExternal = !isPersonal && !!b.client_id && b.client_id === b.coach_id; // Sync senza match
    const client =
      !isPersonal && b.client_id && !isExternal ? clientsMap.get(b.client_id) : undefined;
    const typeLabel = et?.name ?? (b.session_type ? sessionLabel(b.session_type) : "Sessione");
    const safeDuration = duration > 0 ? duration : 60;
    const timeLabel = `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} - ${new Date(d.getTime() + safeDuration * 60000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

    if (isPersonal) {
      // personalBlockTitle (top of file) prefers the original Google event
      // title (b.title), then falls back to notes — never produces an
      // empty string, so the heading is always readable.
      const title = personalBlockTitle(b);
      return (
        <div
          key={b.id}
          style={laneStyle}
          // Aura neutral container — muted enough to read as "blocked
          // time" while still distinct from the surface-container-low
          // used for external Google events.
          className="absolute z-10 bg-surface-container-high border border-outline-variant/40 rounded-2xl p-2 cursor-default"
          aria-label={`Impegno personale: ${title}`}
        >
          <h4 className="text-[12px] leading-tight font-semibold text-on-surface truncate">
            {title}
          </h4>
          <p className="text-[10px] text-outline mt-0.5">Personale · {timeLabel}</p>
        </div>
      );
    }

    if (isUnassigned) {
      return (
        <button
          key={b.id}
          onClick={() => openReview(b.id)}
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
      const title = (b.notes ?? "").replace(IMPORT_PREFIX, "") || "Evento esterno";
      return (
        <button
          key={b.id}
          onClick={() => openReview(b.id)}
          style={laneStyle}
          className="absolute z-10 bg-surface-container-low border border-outline-variant/40 rounded-2xl p-2 text-left hover:bg-surface-container transition-colors cursor-pointer"
          aria-label={`Evento esterno: ${title} — assegna o segna come impegno personale`}
        >
          <h4 className="text-[12px] leading-tight font-medium text-on-surface-variant truncate">
            {title}
          </h4>
          <p className="text-[10px] text-outline mt-0.5">{timeLabel}</p>
        </button>
      );
    }

    // Certified — colora l'evento secondo il tipo di evento
    const eventColor = et?.color || "#003e62";
    return (
      <button
        key={b.id}
        onClick={() => setFocusClientId(b.client_id)}
        style={{
          ...laneStyle,
          backgroundColor: `color-mix(in oklab, ${eventColor} 18%, white)`,
          borderLeft: `4px solid ${eventColor}`,
        }}
        className="absolute z-10 rounded-2xl p-2 flex flex-col justify-between text-left shadow-sm hover:shadow-md hover:scale-[1.02] hover:z-20 transition-all cursor-pointer"
      >
        <div>
          <h4
            className="text-[12px] leading-tight font-semibold truncate"
            style={{ color: `color-mix(in oklab, ${eventColor} 75%, black)` }}
          >
            {client?.full_name || "Cliente"} — {typeLabel || "Evento senza titolo"}
          </h4>
          <p
            className="text-[10px] mt-0.5"
            style={{ color: `color-mix(in oklab, ${eventColor} 65%, black)` }}
          >
            {timeLabel}
          </p>
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
          timedByDay={timedByDay}
          allDayByDay={allDayByDay}
          clientsMap={clientsMap}
          eventTypesMap={eventTypesMap}
          today={today}
          isLoading={bookingsQ.isLoading}
          onSelectAssign={(b) => openReview(b.id)}
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

          {/* All-day strip — only renders when at least one day in the
              week has all-day events. Sits between the day header and
              the hour grid so Google birthdays/anniversaries are always
              visible without competing for vertical space against timed
              sessions in the lanes below. */}
          {allDayByDay.some((d) => d.length > 0) && (
            <div
              className="flex border-b border-surface-container bg-surface/60"
              aria-label="Eventi giornalieri"
            >
              <div className="w-16 shrink-0 border-r border-surface-container flex items-center justify-center">
                <span className="text-[10px] uppercase tracking-wider text-outline">
                  Tutto il dì
                </span>
              </div>
              <div className="flex-1 grid grid-cols-7">
                {weekDays.map((_, i) => {
                  const items = allDayByDay[i] ?? [];
                  return (
                    <div
                      key={i}
                      className="border-r border-surface-container last:border-r-0 px-1.5 py-1.5 flex flex-col gap-1 min-h-[36px]"
                    >
                      {items.map((b) => (
                        <AllDayPill key={b.id} booking={b} compact />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                      {(timedByDay[i] ?? []).map((b) => renderEvent(b, layoutByDay[i]?.get(b.id)))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTEXT PANEL — desktop only (xl+); the same content renders inside
          a Sheet below xl, see <Sheet> further down. */}
      <aside className="hidden xl:flex flex-col w-80 border-l border-surface-variant bg-surface sticky top-0 h-screen">
        <div className="p-6 border-b border-surface-variant bg-white/50 backdrop-blur-md">
          <h3 className="text-lg font-bold text-aura-primary flex items-center gap-2">
            <UserSearch className="size-5" /> Focus Cliente
          </h3>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <FocusClientPanel
            focusClient={focusClient}
            focusClientId={focusClientId}
            isLoading={clientsQ.isLoading}
            lastNote={lastNoteQ.data ?? null}
            isLoadingNote={lastNoteQ.isLoading}
          />
        </div>
      </aside>

      {/* MOBILE SHEET — only active below xl. Shows the same focus-client
          content as the desktop aside; closing the Sheet clears
          focusClientId so reopening starts clean. */}
      <Sheet
        open={isBelowXl && !!focusClientId}
        onOpenChange={(open) => {
          if (!open) setFocusClientId(null);
        }}
      >
        <SheetContent
          side="right"
          className="bg-surface-container-lowest w-full sm:max-w-md rounded-l-[32px] border-l-0 p-0 flex flex-col gap-0"
        >
          <SheetHeader className="p-6 border-b border-outline-variant/30 bg-surface-container-lowest/80 backdrop-blur-md text-left space-y-0">
            <SheetTitle className="text-lg font-bold text-aura-primary flex items-center gap-2">
              <UserSearch className="size-5" /> Focus Cliente
            </SheetTitle>
          </SheetHeader>
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <FocusClientPanel
              focusClient={focusClient}
              focusClientId={focusClientId}
              isLoading={clientsQ.isLoading}
              lastNote={lastNoteQ.data ?? null}
              isLoadingNote={lastNoteQ.isLoading}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* The Assign / Personal / Consulenza dialog is now mounted globally
          in the /trainer layout (src/routes/trainer.tsx) and driven by the
          ?reviewEventId search param. openReview() above just navigates
          with that param; closing clears it. */}
    </div>
  );
}

