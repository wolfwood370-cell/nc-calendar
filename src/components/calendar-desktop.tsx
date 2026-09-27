// ----------------------------------------------------------------------------
// Calendario desktop del coach (passata 04 del redesign)
// ----------------------------------------------------------------------------
// Brief design_handoff_coach_redesign/passes/04-calendario.md, prototipo
// designs/Coach Calendario.dc.html. Il telefono (sotto md) resta com'era:
// calendar-mobile.tsx.
//   - Stato nell'URL (T4): date, view, filter, types, avail, event;
//     new=sessione e client=<id> aprono la creazione e poi si tolgono.
//   - Testata con una sola sincronizzazione (C1) e filtri esclusivi (C2).
//   - Griglia settimana/giorno con la linea dell'ora (C4, C5); il clic su
//     uno spazio vuoto apre «Nuova sessione» (C6).
//   - Pannello dettagli al clic su un evento (C3), mai vuoto; Esc e ✕ lo
//     chiudono. Gli eventi da assegnare aprono «Assegna evento».
// ----------------------------------------------------------------------------

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import type { AllDayItem } from "@/components/calendar-all-day-strip";
import { CalendarDetailsPanel, type PanelCredit } from "@/components/calendar-details-panel";
import { CalendarGrid, type GridItem } from "@/components/calendar-grid";
import { CalendarToolbar, type MissingOnGoogle } from "@/components/calendar-toolbar";
import { PackageDialog } from "@/components/package-dialog";
import { SessionCancelDialog } from "@/components/session-cancel-dialog";
import { SessionFormDialog, type SessionFormInit } from "@/components/session-form-dialog";
import { notifySync, type GcalSync } from "@/hooks/use-gcal-sync";
import { useAuth } from "@/lib/auth";
import {
  eventKind,
  canCheckIn,
  confirmLine,
  detailsStatus,
  gridMinutes,
  isOnGrid,
  lastSessionNote,
  notOnGoogle,
  passesFilters,
  tileView,
  whatsappUrl,
} from "@/lib/calendar-events";
import { layoutDay } from "@/lib/calendar-layout";
import {
  calendarState,
  filterOf,
  filterStateOf,
  filtersActive,
  periodDays,
  periodLabel,
  pickFilter,
  shiftAnchor,
  toggleType,
  withoutCreateParams,
  type CalendarFilter,
  type CalendarSearch,
  type CalendarView,
  type FilterState,
} from "@/lib/calendar-search";
import {
  closedRanges,
  defaultStartTime,
  GRID_START_HOUR,
  localDate,
  localTime,
} from "@/lib/calendar-time";
import { hasClientCredit, type SessionRemoval } from "@/lib/cancel-session";
import { clientPlanLabel } from "@/lib/client-search";
import { formatCreditsOf, getCurrentBlockCredits } from "@/lib/credits";
import { quickSyncMessage } from "@/lib/gcal-sync-run";
import { sessionLabel } from "@/lib/mock-data";
import { formatAgo } from "@/lib/notifications";
import {
  useCoachAvailability,
  useCoachAvailabilityExceptions,
  useCoachBlocks,
  useCoachBookings,
  useCoachClients,
  useCoachEventTypes,
  type BookingRow,
} from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { FALLBACK_TYPE_COLOR } from "@/lib/service-distribution";
import {
  changeSessionOutcome,
  outcomeMessage,
  withOutcome,
  type SessionOutcome,
} from "@/lib/session-outcome";
import { supabaseSessionStore } from "@/lib/session-store";
import { formatLongDay, formatShortDay, formatTimeRange } from "@/lib/session-time";
import { countToAssign } from "@/lib/to-assign";
import { toastWithUndo } from "@/lib/toast";

/** Consulenza esterna senza tipologia (il viola del prototipo). */
const CONSULENZA_COLOR = "#8e24aa";
/** Quadratino degli impegni personali nel pannello. */
const PERSONAL_COLOR = "#9aa0a6";
const CLOCK_TICK_MS = 30_000;
const LAST_SYNC_KEY = "gcal_reconcile_last";

/** L'ora che scorre: linea dell'ora corrente e stati senza ricaricare. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Il desktop è montato anche sul telefono (nascosto): tastiera e `new` solo da md in su. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

/** «sincronizzato 4 min fa»: dall'ultima sincronizzazione riuscita (gcal_reconcile_ok). */
function syncLabel(lastSyncAt: number | null, now: Date): string {
  if (!lastSyncAt) return "non ancora sincronizzato";
  if (now.getTime() - lastSyncAt < 60_000) return "sincronizzato ora";
  return `sincronizzato ${formatAgo(new Date(lastSyncAt).toISOString(), now)}`;
}

/** Le frecce non cambiano periodo quando il focus è in un campo o su un segmentato. */
function arrowsBelongToTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest("input, textarea, select, [data-segmented], [role='radiogroup']")) return true;
  const role = target.getAttribute("role");
  return role === "radio" || role === "slider" || role === "tab" || role === "option";
}

function anyDialogOpen(): boolean {
  return !!document.querySelector(
    "[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']",
  );
}

export function CalendarDesktop({ sync }: { sync: GcalSync }) {
  const { user } = useAuth();
  const coachId = user?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ from: "/trainer/calendar" });
  const now = useNow();
  const isDesktop = useIsDesktop();

  const bookingsQ = useCoachBookings(coachId);
  const clientsQ = useCoachClients(coachId);
  const eventTypesQ = useCoachEventTypes(coachId);
  const blocksQ = useCoachBlocks(coachId);
  const availabilityQ = useCoachAvailability(coachId);
  const exceptionsQ = useCoachAvailabilityExceptions(coachId);

  const bookings = useMemo(() => bookingsQ.data ?? [], [bookingsQ.data]);
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const eventTypes = useMemo(() => eventTypesQ.data ?? [], [eventTypesQ.data]);
  const blocks = useMemo(() => blocksQ.data ?? [], [blocksQ.data]);
  const availability = useMemo(() => availabilityQ.data ?? [], [availabilityQ.data]);
  const exceptions = useMemo(() => exceptionsQ.data ?? [], [exceptionsQ.data]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const typeById = useMemo(() => new Map(eventTypes.map((t) => [t.id, t])), [eventTypes]);

  // ----- Stato dall'URL -----
  const eventBooking = search.event ? (bookings.find((b) => b.id === search.event) ?? null) : null;
  const eventDay = eventBooking ? format(new Date(eventBooking.scheduled_at), "yyyy-MM-dd") : null;
  const todayKey = format(now, "yyyy-MM-dd");
  const st = calendarState(search, now, eventDay);
  const anchorKey = format(st.anchor, "yyyy-MM-dd");
  const days = useMemo(
    () => periodDays(new Date(`${anchorKey}T00:00:00`), st.view),
    [anchorKey, st.view],
  );
  const typesKey = st.types.join(",");
  const fstate = useMemo(
    () => filterStateOf(st.filter, typesKey ? typesKey.split(",") : []),
    [st.filter, typesKey],
  );

  const go = useCallback(
    (patch: Partial<CalendarSearch> & { reviewEventId?: string }, replace = false) => {
      void navigate({
        to: "/trainer/calendar",
        search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
        replace,
      });
    },
    [navigate],
  );
  const setFilters = (f: FilterState) => {
    const filter = filterOf(f);
    go(
      {
        filter: filter === "all" ? undefined : filter,
        types: f.types.length ? f.types.join(",") : undefined,
      },
      true,
    );
  };
  const goToDay = (d: Date, view: CalendarView = st.view) =>
    go({ date: format(d, "yyyy-MM-dd"), view: view === "day" ? "day" : undefined });

  // ----- Dialog della pagina -----
  const [formInit, setFormInit] = useState<SessionFormInit | null>(null);
  const [removal, setRemoval] = useState<{ id: string; removal: SessionRemoval } | null>(null);
  const [packageClientId, setPackageClientId] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [repairingId, setRepairingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // new=sessione e client=<id> aprono «Nuova sessione», poi si tolgono.
  useEffect(() => {
    if (!isDesktop || (!search.new && !search.client)) return;
    setFormInit({
      mode: "create",
      kind: "client",
      clientId: search.client ?? null,
      date: search.date ?? todayKey,
      time: defaultStartTime(new Date()),
    });
    void navigate({
      to: "/trainer/calendar",
      search: (prev: Record<string, unknown>) => withoutCreateParams(prev as CalendarSearch),
      replace: true,
    });
  }, [isDesktop, search.new, search.client, search.date, todayKey, navigate]);

  // event=<id>: apre il pannello nella settimana (o nel giorno) che lo contiene.
  // Un evento da assegnare apre «Assegna evento»; uno che non c'è più si toglie.
  const checkedEvent = useRef<string | null>(null);
  useEffect(() => {
    if (!isDesktop || !search.event || !bookingsQ.data) return;
    const b = bookingsQ.data.find((x) => x.id === search.event);
    // Appena creata: arriva col prossimo caricamento.
    if (!b && bookingsQ.isFetching) return;
    if (!b) {
      if (checkedEvent.current !== search.event) {
        toast.info("Evento non trovato: potrebbe essere stato eliminato.");
      }
      checkedEvent.current = null;
      go({ event: undefined }, true);
      return;
    }
    checkedEvent.current = search.event;
    if (eventKind(b) === "assign") go({ event: undefined, reviewEventId: b.id }, true);
  }, [isDesktop, search.event, bookingsQ.data, bookingsQ.isFetching, go]);

  const panelBooking =
    eventBooking && eventKind(eventBooking) !== "assign" && eventKind(eventBooking) !== "allday"
      ? eventBooking
      : null;
  const closePanel = useCallback(() => go({ event: undefined }, true), [go]);

  // Tastiera: ← → cambiano periodo, Esc chiude il pannello.
  const keyState = useRef({ panelOpen: false, anchor: st.anchor, view: st.view });
  keyState.current = { panelOpen: !!panelBooking, anchor: st.anchor, view: st.view };
  const pageDialogOpen = !!formInit || !!removal || !!packageClientId;
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (pageDialogOpen || anyDialogOpen()) return;
      const k = keyState.current;
      if (e.key === "Escape" && k.panelOpen) {
        closePanel();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (arrowsBelongToTarget(e.target)) return;
      e.preventDefault();
      const next = shiftAnchor(k.anchor, k.view, e.key === "ArrowLeft" ? -1 : 1);
      go({ date: format(next, "yyyy-MM-dd") });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, pageDialogOpen, closePanel, go]);

  // ----- Nomi e colori -----
  const clientName = useCallback(
    (id: string | null) => {
      const c = id ? clientById.get(id) : undefined;
      return c?.full_name ?? c?.email ?? "Cliente";
    },
    [clientById],
  );
  const typeName = useCallback(
    (b: BookingRow) =>
      (b.event_type_id ? typeById.get(b.event_type_id)?.name : undefined) ??
      sessionLabel(b.session_type),
    [typeById],
  );
  const colorOf = useCallback(
    (b: BookingRow) => {
      const t = b.event_type_id ? typeById.get(b.event_type_id) : undefined;
      if (t?.color) return t.color;
      return eventKind(b) === "consulenza" ? CONSULENZA_COLOR : FALLBACK_TYPE_COLOR;
    },
    [typeById],
  );
  const minutesOf = useCallback(
    (b: BookingRow) =>
      gridMinutes(b, b.event_type_id ? typeById.get(b.event_type_id)?.duration : null),
    [typeById],
  );

  // ----- Griglia -----
  const { itemsByDay, allDayByDay, placements, visibleCount } = useMemo(() => {
    const keys = days.map((d) => format(d, "yyyy-MM-dd"));
    const timed: BookingRow[][] = days.map(() => []);
    const allDay: AllDayItem[][] = days.map(() => []);
    let count = 0;
    for (const b of bookings) {
      if (!isOnGrid(b) || !passesFilters(b, fstate)) continue;
      const i = keys.indexOf(format(new Date(b.scheduled_at), "yyyy-MM-dd"));
      if (i < 0) continue;
      count++;
      if (eventKind(b) === "allday") allDay[i]!.push(b);
      else timed[i]!.push(b);
    }
    const items: GridItem[][] = timed.map((list) =>
      list.map((b) => {
        const start = new Date(b.scheduled_at);
        const client = hasClientCredit(b) ? clientName(b.client_id) : null;
        return {
          id: b.id,
          view: tileView(b, { client, type: typeName(b) }, format(start, "HH:mm")),
          color: colorOf(b),
          start,
          minutes: minutesOf(b),
        };
      }),
    );
    return {
      itemsByDay: items,
      allDayByDay: allDay,
      placements: timed.map((list) => layoutDay(list, minutesOf)),
      visibleCount: count,
    };
  }, [bookings, days, fstate, clientName, typeName, colorOf, minutesOf]);

  const closedByDay = useMemo(
    () => (st.avail ? days.map((d) => closedRanges(d, availability, exceptions)) : null),
    [st.avail, days, availability, exceptions],
  );

  const assignCount = countToAssign(bookings);
  const missing: MissingOnGoogle[] = useMemo(
    () =>
      notOnGoogle(bookings, now).map((b) => {
        const start = new Date(b.scheduled_at);
        return {
          id: b.id,
          name: hasClientCredit(b)
            ? `${clientName(b.client_id)} · ${typeName(b)}`
            : b.title?.trim() || typeName(b),
          when: `${formatShortDay(start)} · ${formatTimeRange(start, minutesOf(b))}`,
        };
      }),
    [bookings, now, clientName, typeName, minutesOf],
  );

  const periodHasToday = days.some((d) => format(d, "yyyy-MM-dd") === todayKey);
  // Come il prototipo la griglia parte dalle 07:00; un evento aperto da un
  // link si porta in vista.
  const focusHour =
    eventDay && eventBooking && days.some((d) => format(d, "yyyy-MM-dd") === eventDay)
      ? Math.max(GRID_START_HOUR + 1, new Date(eventBooking.scheduled_at).getHours())
      : GRID_START_HOUR + 1;

  // ----- Azioni -----
  const refreshBookings = (clientId: string | null) => {
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.client(clientId) });
  };

  // Check-in, assenza e i loro annullamenti (session-outcome.ts, passata 03).
  async function changeOutcome(b: BookingRow, from: SessionOutcome, to: SessionOutcome) {
    const key = queryKeys.bookings.coach(coachId);
    const name = clientName(b.client_id);
    setPending((prev) => new Set(prev).add(b.id));
    await qc.cancelQueries({ queryKey: key });
    qc.setQueryData<BookingRow[]>(key, (old) => (old ? withOutcome(old, b.id, to) : old));
    try {
      await changeSessionOutcome(supabaseSessionStore, b.id, from, to);
      if (to === "scheduled") toast.success(outcomeMessage(to, name));
      else toastWithUndo(outcomeMessage(to, name), () => void changeOutcome(b, to, from));
    } catch (e) {
      qc.setQueryData<BookingRow[]>(key, (old) => (old ? withOutcome(old, b.id, from) : old));
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito. Riprova.");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(b.id);
        return next;
      });
      refreshBookings(b.client_id);
    }
  }

  async function repair(id: string) {
    if (repairingId) return;
    setRepairingId(id);
    try {
      const ok = await supabaseSessionStore.createGoogleEvent(id);
      if (ok) toast.success("Evento ricreato su Google Calendar.");
      else toast.error("Non è stato possibile ricrearlo su Google Calendar. Riprova.");
    } catch {
      toast.error("Non è stato possibile ricrearlo su Google Calendar. Riprova.");
    } finally {
      setRepairingId(null);
      void qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
    }
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    } catch {
      /* noop */
    }
    const r = await sync.runReconcile();
    sync.markSynced();
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
    // Con modifiche il messaggio lo dà già runReconcile; senza, l'esito vero,
    // anche quando Google non risponde o l'app non legge le sessioni.
    if (!r.changed) notifySync(quickSyncMessage(r));
    setSyncing(false);
  }

  function openItem(id: string) {
    const b = bookings.find((x) => x.id === id);
    if (!b) return;
    if (eventKind(b) === "assign") go({ reviewEventId: id });
    else go({ event: search.event === id ? undefined : id }, true);
  }

  function openEdit(b: BookingRow) {
    const start = new Date(b.scheduled_at);
    setFormInit({
      mode: "edit",
      kind: hasClientCredit(b) ? "client" : "personal",
      booking: b,
      date: localDate(start),
      time: localTime(start),
    });
  }

  // ----- Pannello -----
  const panel = useMemo(() => {
    const b = panelBooking;
    if (!b) return null;
    const kind = eventKind(b);
    const start = new Date(b.scheduled_at);
    const cancelled = b.status === "cancelled" || b.status === "late_cancelled";
    const isClient = hasClientCredit(b);
    const client = isClient && b.client_id ? clientById.get(b.client_id) : undefined;
    let credits: PanelCredit[] = [];
    if (client) {
      const own = blocks.filter((x) => x.client_id === client.id);
      credits = getCurrentBlockCredits(
        own,
        own.flatMap((x) => x.allocations),
        now,
      ).map((c) => {
        const t = c.eventTypeId ? typeById.get(c.eventTypeId) : undefined;
        return {
          key: c.key,
          name: t?.name ?? sessionLabel(c.sessionType),
          color: t?.color ?? FALLBACK_TYPE_COLOR,
          left: c.left,
          total: c.assigned,
          label: formatCreditsOf(c.left, c.assigned),
        };
      });
    }
    const t = b.event_type_id ? typeById.get(b.event_type_id) : undefined;
    return {
      booking: b,
      kindLabel:
        kind === "personal"
          ? "Impegno personale"
          : kind === "consulenza"
            ? t
              ? `Consulenza esterna · ${t.name}`
              : "Consulenza esterna"
            : typeName(b),
      color: kind === "personal" ? PERSONAL_COLOR : colorOf(b),
      title: isClient
        ? clientName(b.client_id)
        : b.title?.trim() || (kind === "consulenza" ? "Consulenza" : "Impegno personale"),
      when: `${formatLongDay(start)} · ${formatTimeRange(start, minutesOf(b))}`,
      status: detailsStatus(b, now),
      confirm: confirmLine(b, now),
      canCheck: canCheckIn(b, now),
      isDone:
        kind === "session" && (b.status === "completed" || b.status === "no_show")
          ? b.status
          : null,
      canEdit: !cancelled,
      cancelLabel: cancelled ? null : isClient ? "Annulla sessione" : "Elimina impegno",
      canDelete: isClient && !cancelled,
      client: client
        ? {
            id: client.id,
            name: client.full_name ?? client.email ?? "Cliente",
            plan: clientPlanLabel(client),
            whatsapp: whatsappUrl(client.phone),
            credits,
            note: lastSessionNote(bookings, client.id, now),
          }
        : null,
      notOnGoogle: missing.some((m) => m.id === b.id),
    };
  }, [
    panelBooking,
    clientById,
    blocks,
    now,
    typeById,
    typeName,
    colorOf,
    clientName,
    minutesOf,
    bookings,
    missing,
  ]);

  const removing = removal ? (bookings.find((b) => b.id === removal.id) ?? null) : null;
  const emptyWithFilters = !bookingsQ.isLoading && filtersActive(fstate) && visibleCount === 0;

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] bg-surface px-10 pb-12 pt-7 text-on-surface">
      <div className="flex flex-col gap-5">
        <CalendarToolbar
          syncLabel={syncLabel(sync.lastSyncAt, now)}
          syncing={syncing}
          onSyncNow={() => void syncNow()}
          missing={missing}
          repairingId={repairingId}
          onRepair={(id) => void repair(id)}
          periodLabel={periodLabel(days, st.view)}
          view={st.view}
          onToday={() => goToDay(now)}
          onShift={(dir) => goToDay(shiftAnchor(st.anchor, st.view, dir))}
          onView={(v) => {
            // Da settimana a giorno: oggi se è nella settimana, altrimenti il lunedì.
            const day = v === "day" && periodHasToday ? now : (days[0] ?? st.anchor);
            goToDay(v === "day" ? day : st.anchor, v);
          }}
          filter={st.filter}
          assignCount={assignCount}
          onFilter={(f: CalendarFilter) => setFilters(pickFilter(fstate, f))}
          eventTypes={eventTypes}
          types={fstate.types}
          onToggleType={(id) => setFilters(toggleType(fstate, id))}
          onClearTypes={() => setFilters({ ...fstate, types: [] })}
          avail={st.avail}
          onToggleAvail={() => go({ avail: st.avail ? undefined : 1 }, true)}
          emptyWithFilters={emptyWithFilters}
          onClearFilters={() => setFilters({ assign: false, personal: false, types: [] })}
        />

        {bookingsQ.isError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-2xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger-text"
          >
            Non è stato possibile caricare le sessioni.
            <button
              type="button"
              onClick={() => void bookingsQ.refetch()}
              className="text-[13px] font-semibold"
            >
              Riprova
            </button>
          </div>
        )}

        <CalendarGrid
          days={days}
          now={now}
          itemsByDay={itemsByDay}
          placements={placements}
          allDayByDay={allDayByDay}
          closedByDay={closedByDay}
          selectedId={panelBooking?.id ?? null}
          focusHour={focusHour}
          onOpenItem={openItem}
          onSlot={(day, time) =>
            setFormInit({ mode: "create", kind: "client", date: localDate(day), time })
          }
          onOpenDay={(day) => goToDay(day, "day")}
        />
        <p className="-mt-2 text-xs text-outline">
          Clic su uno spazio vuoto per creare una sessione · ← → per cambiare periodo
        </p>
      </div>

      {/* Nel body: il contenuto della pagina ha un antenato con transform, che
          sposterebbe il pannello fisso. */}
      {panel &&
        isDesktop &&
        createPortal(
          <CalendarDetailsPanel
            kindLabel={panel.kindLabel}
            color={panel.color}
            title={panel.title}
            when={panel.when}
            status={panel.status}
            confirm={panel.confirm}
            canCheck={panel.canCheck}
            isDone={panel.isDone}
            canEdit={panel.canEdit}
            cancelLabel={panel.cancelLabel}
            canDelete={panel.canDelete}
            busy={pending.has(panel.booking.id)}
            client={panel.client}
            notOnGoogle={panel.notOnGoogle}
            repairing={repairingId === panel.booking.id}
            onClose={closePanel}
            onCheckIn={() => void changeOutcome(panel.booking, "scheduled", "completed")}
            onAbsent={() => void changeOutcome(panel.booking, "scheduled", "no_show")}
            onUndo={() =>
              void changeOutcome(panel.booking, panel.booking.status as SessionOutcome, "scheduled")
            }
            onEdit={() => openEdit(panel.booking)}
            onCancel={() =>
              setRemoval({
                id: panel.booking.id,
                removal: hasClientCredit(panel.booking) ? "cancel" : "delete",
              })
            }
            onDelete={() => setRemoval({ id: panel.booking.id, removal: "delete" })}
            onRepair={() => void repair(panel.booking.id)}
          />,
          document.body,
        )}

      <SessionFormDialog
        init={formInit}
        coachId={coachId}
        clients={clients}
        eventTypes={eventTypes}
        bookings={bookings}
        availability={availability}
        exceptions={exceptions}
        onClose={() => setFormInit(null)}
        onSaved={(id, date) => {
          setFormInit(null);
          go({ date, event: id }, true);
        }}
        onOpenPackage={(clientId) => {
          setFormInit(null);
          setPackageClientId(clientId);
        }}
      />

      <SessionCancelDialog
        session={removing}
        removal={removal?.removal ?? "cancel"}
        clientName={removing?.client_id ? clientName(removing.client_id) : null}
        typeName={removing ? typeName(removing) : null}
        onClose={() => setRemoval(null)}
        onChanged={() => {
          // Eliminata: il pannello si chiude. Annullata: resta aperto con lo
          // stato «Annullata» (e torna com'era con «Ripristina»).
          if (removal?.removal === "delete") closePanel();
        }}
      />

      <PackageDialog clientId={packageClientId} onClose={() => setPackageClientId(null)} />
    </div>
  );
}
