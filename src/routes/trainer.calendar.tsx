import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useIsBelowXl } from "@/hooks/use-mobile";
import { CalendarHeader } from "@/components/calendar-header";
import { CalendarDaysHeader } from "@/components/calendar-days-header";
import { CalendarAllDayStrip } from "@/components/calendar-all-day-strip";
import { CalendarEventTile } from "@/components/calendar-event-tile";
import { CalendarContextPanel } from "@/components/calendar-context-panel";
import { CalendarGcalReview } from "@/components/calendar-gcal-review";
import { CalendarEventEditDialog } from "@/components/calendar-event-edit-dialog";
import { layoutDay } from "@/lib/calendar-layout";
import { MessageCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { gcalReconcileEvents, gcalRepairMissingEvents } from "@/lib/gcal.functions";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  isAllDayEvent,
  sameDay,
  MobileAgendaView,
} from "@/components/mobile-calendar-agenda";

export const Route = createFileRoute("/trainer/calendar")({
  component: CalendarPage,
});

const HOUR_HEIGHT = 44; // px — vista compatta
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
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [showAvailability, setShowAvailability] = useState(false);
  const [onlyPersonal, setOnlyPersonal] = useState(false);
  const [onlyToAssign, setOnlyToAssign] = useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());
  // Defer localStorage read to useEffect — leggerlo nell'initializer di
  // useState provoca un hydration mismatch quando il valore esiste solo
  // sul client.
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem("gcal_reconcile_last");
    if (raw) setLastSyncAt(Number(raw));
  }, []);
  const [editBookingId, setEditBookingId] = useState<string | null>(null);


  const bookingsQ = useCoachBookings(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const eventTypesQ = useCoachEventTypes(user?.id);

  // Sincronizzazione bidirezionale con Google Calendar, in 2 direzioni:
  //   1. Google -> app (gcalReconcileEvents): allinea le sessioni agli eventi
  //      Google (cancellazioni/spostamenti fatti direttamente su Google).
  //   2. app -> Google (gcalRepairMissingEvents): RETE DI SICUREZZA. Ricrea
  //      gli eventi Google mancanti (booking con google_event_id NULL), p.es.
  //      quando la creazione per-booking client-side e' fallita. Idempotente,
  //      tutto derivato server-side. Cosi' il calendario Google si riallinea
  //      da solo a ogni apertura, senza dipendere dal singolo flusso di
  //      prenotazione. Mostra un toast solo se qualcosa e' cambiato.
  const runReconcile = useCallback(async () => {
    try {
      const [pull, push] = await Promise.all([
        gcalReconcileEvents(),
        gcalRepairMissingEvents(),
      ]);
      const changed =
        (pull.ok && ((pull.cancelled ?? 0) > 0 || (pull.moved ?? 0) > 0)) ||
        (push.ok && (push.created ?? 0) > 0);
      if (changed) {
        qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
        qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
        const parts: string[] = [];
        if (pull.ok && pull.cancelled) parts.push(`${pull.cancelled} annullata/e`);
        if (pull.ok && pull.moved) parts.push(`${pull.moved} spostata/e`);
        if (push.ok && push.created) parts.push(`${push.created} aggiunta/e su Google`);
        toast.info("Sincronizzato con Google Calendar", { description: parts.join(" · ") });
      }
    } catch (e) {
      console.error("gcalReconcile (calendar) failed", e);
    }
  }, [qc, user?.id]);

  // Al mount: riconcilia una volta, con throttle (max 1 ogni 10 min) per non
  // interrogare Google a ogni navigazione.
  useEffect(() => {
    if (!user) return;
    const KEY = "gcal_reconcile_last";
    const last = Number(localStorage.getItem(KEY) ?? "0");
    if (Date.now() - last < 10 * 60_000) return;
    localStorage.setItem(KEY, String(Date.now()));
    void runReconcile();
  }, [user, runReconcile]);

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
      const isPersonal = !!b.is_personal;
      const isUnassigned = !isPersonal && !b.client_id;
      if (onlyToAssign && !isUnassigned) continue;
      if (onlyPersonal && !isPersonal) continue;
      if (selectedTypeIds.size > 0) {
        if (!b.event_type_id || !selectedTypeIds.has(b.event_type_id)) continue;
      }
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
  }, [bookings, weekDays, onlyToAssign, onlyPersonal, selectedTypeIds]);


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
  const filtersActive = onlyPersonal || onlyToAssign || selectedTypeIds.size > 0;
  const editingBooking = useMemo(
    () => (editBookingId ? bookings.find((b) => b.id === editBookingId) ?? null : null),
    [editBookingId, bookings],
  );

  // ----- Render helpers -----
  const today = new Date();

  return (
    <div className="-m-6 flex flex-col xl:flex-row min-h-[calc(100vh-3.5rem)] bg-surface">
      {/* MAIN */}
      <section className="flex-1 flex flex-col min-w-0 p-6">
        {/* Header */}
        <CalendarHeader
          mirroring={false}
          weekRangeLabel={fmtRange(weekStart, weekEnd)}
          onToday={() => setWeekStart(startOfWeek(new Date()))}
          onPrevWeek={() => setWeekStart(addDays(weekStart, -7))}
          onNextWeek={() => setWeekStart(addDays(weekStart, 7))}
          showAvailability={showAvailability}
          onToggleAvailability={() => setShowAvailability((v) => !v)}
          onlyPersonal={onlyPersonal}
          onTogglePersonal={() => setOnlyPersonal((v) => !v)}
          onlyToAssign={onlyToAssign}
          onToggleOnlyToAssign={() => setOnlyToAssign((v) => !v)}
          eventTypes={eventTypes}
          selectedTypeIds={selectedTypeIds}
          onToggleType={(id) =>
            setSelectedTypeIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onClearTypes={() => setSelectedTypeIds(new Set())}
          onRefresh={() => {
            qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
            qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
            qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
            void runReconcile();
            setLastSyncAt(Date.now());
            toast.success("Calendario aggiornato");
          }}
          lastSyncAt={lastSyncAt}
          hasBookingsError={bookingsQ.isError}
          onRetryBookings={() => bookingsQ.refetch()}
          filtersActive={filtersActive}
          totalVisible={totalVisible}
        />


        {/* Riconciliazione bidirezionale Google <-> app (sola lettura) */}
        <CalendarGcalReview
          coachId={user?.id}
          bookings={bookings}
          clientsMap={clientsMap}
          eventTypesMap={eventTypesMap}
        />

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
          <CalendarDaysHeader weekDays={weekDays} today={today} />

          {/* All-day strip — Google birthdays/anniversaries sopra il time grid. */}
          <CalendarAllDayStrip weekDays={weekDays} allDayByDay={allDayByDay} />

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
                      key={d.toISOString()}
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
                      {(timedByDay[i] ?? []).map((b) => {
                        const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
                        const isPersonal = !!b.is_personal;
                        const isExternal =
                          !isPersonal && !!b.client_id && b.client_id === b.coach_id;
                        const client =
                          !isPersonal && b.client_id && !isExternal
                            ? clientsMap.get(b.client_id)
                            : undefined;
                        return (
                          <CalendarEventTile
                            key={b.id}
                            booking={b}
                            placement={layoutByDay[i]?.get(b.id)}
                            eventType={et}
                            client={client}
                            hourHeight={HOUR_HEIGHT}
                            startHour={START_HOUR}
                            endHour={END_HOUR}
                            onOpenReview={openReview}
                            onFocusClient={setFocusClientId}
                            onEdit={(id) => setEditBookingId(id)}
                            onCancel={async (id) => {
                              const { error } = await supabase
                                .from("bookings")
                                .update({ status: "cancelled" })
                                .eq("id", id);
                              if (error) {
                                toast.error("Errore", { description: error.message });
                              } else {
                                toast.success("Evento annullato");
                                qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
                              }
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <CalendarContextPanel
        focusClient={focusClient}
        focusClientId={focusClientId}
        isClientsLoading={clientsQ.isLoading}
        lastNote={lastNoteQ.data ?? null}
        isNoteLoading={lastNoteQ.isLoading}
        isBelowXl={isBelowXl}
        onCloseFocus={() => setFocusClientId(null)}
      />

      {/* The Assign / Personal / Consulenza dialog is now mounted globally
          in the /trainer layout (src/routes/trainer.tsx) and driven by the
          ?reviewEventId search param. openReview() above just navigates
          with that param; closing clears it. */}
    </div>
  );
}

