// ----------------------------------------------------------------------------
// Calendario su telefono (sotto md) — com'era prima della passata 04
// ----------------------------------------------------------------------------
// Estratto da trainer.calendar.tsx senza cambiare ciò che si vede sul
// telefono: testata con i filtri, riconciliazione Google, sync forzato,
// agenda (MobileAgendaView) e Focus Cliente nello Sheet. La griglia desktop
// e il suo dialog di modifica sono in calendar-desktop.tsx.
// ----------------------------------------------------------------------------

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { CalendarContextPanel } from "@/components/calendar-context-panel";
import { CalendarGcalReview } from "@/components/calendar-gcal-review";
import { CalendarHeader } from "@/components/calendar-header";
import { GcalFullSyncButton } from "@/components/gcal-full-sync-button";
import { sameDay, MobileAgendaView } from "@/components/mobile-calendar-agenda";
import { notifySync, type GcalSync } from "@/hooks/use-gcal-sync";
import { useIsBelowXl } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { isAllDayEvent } from "@/lib/all-day-event";
import { useAuth } from "@/lib/auth";
import {
  useCoachBookings,
  useCoachClients,
  useCoachEventTypes,
  type BookingRow,
} from "@/lib/queries";
import { quickSyncMessage } from "@/lib/gcal-sync-run";
import { queryKeys } from "@/lib/query-keys";
import { isToAssign } from "@/lib/to-assign";

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

export function CalendarMobile({ sync }: { sync: GcalSync }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ from: "/trainer/calendar" });
  const { date } = search;
  const { lastSyncAt, markSynced, runReconcile } = sync;
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(date ? parseISO(date) : new Date()),
  );
  // Audit S4: una notifica apre ?date=… sulla settimana dell'evento, anche
  // quando il Calendario è già aperto.
  useEffect(() => {
    if (!date) return;
    const target = startOfWeek(parseISO(date));
    setWeekStart((prev) => (prev.getTime() === target.getTime() ? prev : target));
  }, [date]);
  // Cambiando settimana a mano `date` non vale più: si toglie dall'URL, così
  // riaprire la stessa notifica riporta di nuovo alla sua settimana.
  const goToWeek = (start: Date) => {
    setWeekStart(start);
    if (date) {
      void navigate({
        to: "/trainer/calendar",
        search: { ...search, date: undefined },
        replace: true,
      });
    }
  };
  const [showAvailability, setShowAvailability] = useState(false);
  const [onlyPersonal, setOnlyPersonal] = useState(false);
  const [onlyToAssign, setOnlyToAssign] = useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());

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

  // «Assegna evento» è montato nel layout /trainer e si apre con ?reviewEventId.
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
  const weekEnd = weekDays[6] ?? weekStart;

  // Per-day buckets, split into `timed` and `allDay`.
  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed: BookingRow[][] = Array.from({ length: 7 }, () => []);
    const allDay: BookingRow[][] = Array.from({ length: 7 }, () => []);
    for (const b of bookings) {
      // Annullate dal coach: restano nello storico (deleted_at vuoto) ma non
      // occupano più la griglia, con o senza credito addebitato.
      if (b.status === "cancelled" || b.status === "late_cancelled") continue;
      const isPersonal = !!b.is_personal;
      // Stesso criterio del badge «Da assegnare» della sidebar (audit V12).
      if (onlyToAssign && !isToAssign(b)) continue;
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

  const totalVisible = useMemo(
    () =>
      timedByDay.reduce((s, day) => s + day.length, 0) +
      allDayByDay.reduce((s, day) => s + day.length, 0),
    [timedByDay, allDayByDay],
  );
  const filtersActive = onlyPersonal || onlyToAssign || selectedTypeIds.size > 0;

  const today = new Date();

  return (
    <div className="-m-6 flex flex-col xl:flex-row min-h-[calc(100vh-3.5rem)] bg-surface">
      <section className="flex-1 flex flex-col min-w-0 p-6">
        <CalendarHeader
          mirroring={false}
          weekRangeLabel={fmtRange(weekStart, weekEnd)}
          onToday={() => goToWeek(startOfWeek(new Date()))}
          onPrevWeek={() => goToWeek(addDays(weekStart, -7))}
          onNextWeek={() => goToWeek(addDays(weekStart, 7))}
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
          onRefresh={async () => {
            qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
            qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
            qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
            // L'esito vero, come «Sincronizza ora» del desktop: con modifiche il
            // messaggio lo dà già runReconcile; senza, quello di
            // quickSyncMessage, anche quando Google non risponde. Prima diceva
            // sempre «Calendario aggiornato» (passata 10 del lato cliente).
            const r = await runReconcile();
            markSynced();
            if (!r.changed) notifySync(quickSyncMessage(r));
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

        {/* Sync forzato sull'intero anno corrente */}
        <GcalFullSyncButton coachId={user?.id} onSynced={markSynced} />

        {/* Mobile agenda view (audit H5) */}
        <MobileAgendaView
          weekDays={weekDays}
          timedByDay={timedByDay}
          allDayByDay={allDayByDay}
          clientsMap={clientsMap}
          eventTypesMap={eventTypesMap}
          today={today}
          focusDate={date}
          isLoading={bookingsQ.isLoading}
          onSelectAssign={(b) => openReview(b.id)}
          onSelectClient={(clientId) => setFocusClientId(clientId)}
        />
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
    </div>
  );
}
