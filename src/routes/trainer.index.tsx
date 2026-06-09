import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  useCoachClients,
  useCoachBookings,
  useCoachBlocks,
  useCoachEventTypes,
} from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import { initials } from "@/lib/initials";
import {
  startOfToday,
  endOfToday,
  startOfYear,
} from "@/lib/date-windows";
import { iconForType } from "@/lib/session-type-icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AuraCardSkeleton,
  AuraLineSkeleton,
  AuraPillSkeleton,
} from "@/components/ui/aura-skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TrainerNotificationsBell } from "@/components/trainer-notifications-bell";
import { toast } from "sonner";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  ListChecks,
  ArrowRight,
} from "lucide-react";


export const Route = createFileRoute("/trainer/")({
  component: Overview,
});

const GLASS = "bg-white/60 backdrop-blur-xl border border-white/40";

function Overview() {
  const { user } = useAuth();
  const coachId = user?.id;
  const qc = useQueryClient();

  const clientsQ = useCoachClients(coachId);
  const bookingsQ = useCoachBookings(coachId);
  const blocksQ = useCoachBlocks(coachId);
  const eventTypesQ = useCoachEventTypes(coachId);

  // Memoize the `?? []` fallbacks so downstream useMemo hooks see a stable
  // reference when the underlying query data hasn't changed. Without these
  // wrappers `clients.filter(...)` etc. inside derived useMemos would
  // recompute on every render, defeating the memoization.
  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const bookings = useMemo(() => bookingsQ.data ?? [], [bookingsQ.data]);
  const blocks = useMemo(() => blocksQ.data ?? [], [blocksQ.data]);
  const eventTypes = useMemo(() => eventTypesQ.data ?? [], [eventTypesQ.data]);

  const clientById = useMemo(() => {
    const m = new Map<string, (typeof clients)[number]>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);
  const eventTypeById = useMemo(() => {
    const m = new Map<string, (typeof eventTypes)[number]>();
    eventTypes.forEach((e) => m.set(e.id, e));
    return m;
  }, [eventTypes]);

  // Centro Revisione RIMOSSO (2026-06-06): la revisione/assegnazione degli
  // eventi senza cliente avviene ora dal Calendario (filtro "Eventi da
  // Assegnare" + dialog di review). La sezione qui era ridondante.

  // Today's appointments
  const todayItems = useMemo(() => {
    const s = startOfToday().getTime(),
      e = endOfToday().getTime();
    return bookings
      .filter((b) => b.client_id && b.client_id !== b.coach_id && !b.is_personal && b.status === "scheduled")
      .filter((b) => {
        const t = new Date(b.scheduled_at).getTime();
        return t >= s && t <= e;
      })
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      .slice(0, 5);
  }, [bookings]);

  // Service distribution YTD (dal 1° gennaio dell'anno corrente)
  const distribution = useMemo(() => {
    const s = startOfYear().getTime();
    const counts = new Map<string, { count: number; color: string }>();
    let total = 0;
    for (const b of bookings) {
      const t = new Date(b.scheduled_at).getTime();
      if (t < s) continue;
      if (b.status === "cancelled") continue;
      const et = b.event_type_id ? eventTypeById.get(b.event_type_id) : null;
      const label = et?.name ?? sessionLabel(b.session_type);
      const color = et?.color ?? "#003e62";
      const prev = counts.get(label);
      counts.set(label, { count: (prev?.count ?? 0) + 1, color: prev?.color ?? color });
      total++;
    }
    const arr = Array.from(counts.entries())
      .map(([label, { count, color }]) => ({
        key: label,
        label,
        color,
        count,
        pct: total ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return { items: arr, total };
  }, [bookings, eventTypeById]);


  // Mutations
  const checkIn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "completed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
      qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user?.id) });
      qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
      toast.success("Sessione completata e contatori aggiornati");
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  // ignoreBooking / restoreBooking / markPersonalQuick / openReview RIMOSSI
  // insieme al Centro Revisione (2026-06-06): erano usati solo da quella
  // sezione. L'assegnazione eventi avviene dal Calendario.

  const loading = clientsQ.isLoading || bookingsQ.isLoading || blocksQ.isLoading;
  const userName = (user?.user_metadata?.full_name as string) || user?.email || "Coach";
  const todayLabel = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Next upcoming session (for the mobile "Prossimo Evento" card). Looks at
  // all assigned future bookings, picks the closest one. Reused on mobile
  // since the desktop "Oggi" list shows today only.
  const nextBooking = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => b.client_id && b.status === "scheduled")
      .filter((b) => new Date(b.scheduled_at).getTime() >= now)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0];
  }, [bookings]);

  const todayMobileLabel = new Date().toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
  });

  return (
    <>
      {/* ============================================================
          MOBILE LAYOUT (block md:hidden) — replicates the Stitch
          mockup trainer_dashboard_nc_calendar_oggi_20_maggio.html.
          Reuses every existing query (clientsQ, bookingsQ, etc.) and
          mutations — nothing new on the data side.
          ============================================================ */}
      <div className="block md:hidden bg-background min-h-screen">
        {/* Glassmorphic top bar */}
        <header className="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl bg-surface/80 flex justify-between items-center px-4 py-3 border-b border-outline-variant/20">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Apri menu profilo"
                  className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-semibold text-sm border border-outline-variant/30 active:scale-95 transition-transform"
                >
                  {initials(userName)}
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-[32px] bg-surface-container-lowest border-t border-outline-variant/20 p-0"
              >
                <SheetHeader className="px-6 pt-6 pb-2 text-left">
                  <SheetTitle className="text-lg font-semibold text-on-surface">
                    Impostazioni rapide
                  </SheetTitle>
                </SheetHeader>
                <nav className="px-4 pb-8 pt-2 flex flex-col gap-2" aria-label="Menu profilo">
                  <Link
                    to="/trainer/availability"
                    className="flex items-center gap-3 px-4 py-3 rounded-[24px] bg-surface-container-low text-on-surface font-medium active:scale-[0.98] transition-transform"
                  >
                    <Clock className="size-5 text-primary" />
                    <span>Disponibilità</span>
                    <ArrowRight className="size-4 text-outline ml-auto" />
                  </Link>
                  <Link
                    to="/trainer/event-types"
                    className="flex items-center gap-3 px-4 py-3 rounded-[24px] bg-surface-container-low text-on-surface font-medium active:scale-[0.98] transition-transform"
                  >
                    <ListChecks className="size-5 text-primary" />
                    <span>Tipi di Evento</span>
                    <ArrowRight className="size-4 text-outline ml-auto" />
                  </Link>
                  <Link
                    to="/trainer/integrations"
                    className="flex items-center gap-3 px-4 py-3 rounded-[24px] bg-surface-container-low text-on-surface font-medium active:scale-[0.98] transition-transform"
                  >
                    <Sparkles className="size-5 text-primary" />
                    <span>Integrazioni</span>
                    <ArrowRight className="size-4 text-outline ml-auto" />
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
            <h1 className="text-xl font-bold text-primary tracking-tight">NC Calendar</h1>
          </div>
          <TrainerNotificationsBell />
        </header>

        {/* Main scrollable content */}
        <main className="px-4 pt-[88px] pb-8 flex flex-col gap-6">
          <h2 className="text-[28px] leading-9 font-bold text-on-surface">
            Ciao, {userName.split(" ")[0]}
          </h2>

          {/* Daily Summary Card — AuraCardSkeleton during initial load
              eliminates the flash-of-zero before the bookings query
              resolves. */}
          {loading ? (
            <AuraCardSkeleton className="p-6 flex flex-col gap-3">
              <AuraLineSkeleton className="w-32 h-3" />
              <AuraLineSkeleton className="w-20 h-12 rounded-2xl" />
              <AuraLineSkeleton className="w-48 h-5" />
            </AuraCardSkeleton>
          ) : (
            <section className="bg-surface-container-lowest rounded-[32px] border border-outline-variant/20 shadow-[0_12px_32px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-3 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute top-0 right-0 w-32 h-32 bg-primary-fixed/30 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"
              />
              <p className="text-sm font-semibold text-on-surface-variant">
                Oggi, {todayMobileLabel}
              </p>
              <div className="flex flex-col gap-1">
                <span className="text-5xl font-extrabold text-primary tracking-tight leading-none">
                  {todayItems.length}
                </span>
                <span className="text-xl font-semibold text-on-surface">
                  {todayItems.length === 1 ? "Sessione Programmata" : "Sessioni Programmate"}
                </span>
              </div>
            </section>
          )}

          {/* Next Event Card — only renders when there's an upcoming
              booking. Tapping "Apri Scheda" jumps to the calendar page,
              same destination as desktop "Vedi tutto". */}
          {loading ? (
            <AuraCardSkeleton className="p-6 flex flex-col gap-4">
              <AuraPillSkeleton size="w-32 h-3" />
              <AuraLineSkeleton className="w-3/4 h-6" />
              <AuraPillSkeleton size="w-full h-12" />
            </AuraCardSkeleton>
          ) : nextBooking ? (
            <section className="bg-surface-container-lowest rounded-[32px] border border-outline-variant/20 shadow-[0_12px_32px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-container" />
                <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  Prossimo Evento
                </p>
              </div>
              <h3 className="text-xl font-semibold text-on-surface leading-snug">
                {new Date(nextBooking.scheduled_at).toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                ·{" "}
                {(() => {
                  const et = nextBooking.event_type_id
                    ? eventTypeById.get(nextBooking.event_type_id)
                    : null;
                  const client = nextBooking.client_id
                    ? clientById.get(nextBooking.client_id)
                    : null;
                  const label = et?.name ?? sessionLabel(nextBooking.session_type);
                  const name = client?.full_name ?? client?.email ?? "Cliente";
                  return `${label} con ${name}`;
                })()}
              </h3>
              <Link
                to="/trainer/calendar"
                className="mt-2 bg-primary-container text-on-primary font-semibold rounded-full py-3 px-6 w-full flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition"
              >
                Apri Calendario
                <ArrowRight className="size-4" />
              </Link>
            </section>
          ) : null}

          {/* Today's session stream — reuses todayItems already computed
              by the desktop view, just rendered as standalone cards. */}
          {loading ? (
            <section className="flex flex-col gap-3">
              <AuraLineSkeleton className="w-32 h-4 ml-1" />
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <AuraCardSkeleton key={i} className="p-4 flex items-center gap-4 h-20">
                    <AuraPillSkeleton size="w-12 h-4" />
                    <div className="w-px self-stretch bg-outline-variant/40" aria-hidden />
                    <div className="flex-1 flex flex-col gap-2">
                      <AuraLineSkeleton className="w-2/3 h-4" />
                      <AuraLineSkeleton className="w-1/3 h-3" />
                    </div>
                  </AuraCardSkeleton>
                ))}
              </div>
            </section>
          ) : todayItems.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h3 className="text-base font-semibold text-on-surface px-1">Sessioni di oggi</h3>
              <div className="flex flex-col gap-3">
                {todayItems.map((b) => {
                  const c = b.client_id ? clientById.get(b.client_id) : null;
                  const et = b.event_type_id ? eventTypeById.get(b.event_type_id) : null;
                  const label = et?.name ?? sessionLabel(b.session_type);
                  const name = c?.full_name ?? c?.email ?? "Cliente";
                  return (
                    <article
                      key={b.id}
                      className="bg-surface-container-lowest rounded-[32px] border border-outline-variant/20 shadow-[0_12px_32px_rgba(0,0,0,0.04)] p-4 flex items-center gap-4"
                    >
                      <div className="flex flex-col items-center min-w-[64px]">
                        <span className="text-base font-semibold text-on-surface tabular-nums">
                          {new Date(b.scheduled_at).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="w-px self-stretch bg-outline-variant/40" aria-hidden />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-on-surface truncate">{name}</h4>
                        <p className="text-xs text-on-surface-variant truncate">{label}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Centro Revisione mobile RIMOSSO (2026-06-06) — assegnazione dal Calendario. */}
        </main>
      </div>

      {/* ============================================================
          DESKTOP LAYOUT (hidden md:block) — original dashboard,
          UNCHANGED below this divider.
          ============================================================ */}
      <div className="hidden md:block bg-surface text-on-background -m-6 p-6 md:p-10 min-h-[calc(100vh-3.5rem)]">
        {/* Header */}
        <header className="mb-10">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-on-background tracking-tight">
            Bentornato, {userName.split(" ")[0]}
          </h1>
          <p className="text-on-surface-variant mt-2 text-lg">
            Oggi è <span className="capitalize">{todayLabel}</span>. Hai {todayItems.length}{" "}
            {todayItems.length === 1 ? "sessione programmata" : "sessioni programmate"}.
          </p>
        </header>

        {/* 2-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
          {/* LEFT */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            {/* Centro Revisione desktop RIMOSSO (2026-06-06) — assegnazione dal Calendario. */}

            {/* Oggi */}
            <section className={`${GLASS} rounded-[32px] p-6 shadow-soft-card`}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-2xl font-manrope font-semibold">Oggi</h2>
                <Link
                  to="/trainer/calendar"
                  className="text-sm font-semibold text-aura-primary hover:underline"
                >
                  Vedi tutto
                </Link>
              </div>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : todayItems.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-6 text-center">
                  Nessuna sessione prevista per oggi. Goditi la giornata!
                </p>
              ) : (
                <div className="flex flex-col">
                  {todayItems.map((b) => {
                    const c = clientById.get(b.client_id!);
                    const name = c?.full_name ?? c?.email ?? "Cliente";
                    const et = b.event_type_id ? eventTypeById.get(b.event_type_id) : null;
                    const label = et?.name ?? sessionLabel(b.session_type);
                    const Icon = iconForType(label);
                    const start = new Date(b.scheduled_at);
                    // H3: per-booking snapshot so changing the event type
                    // duration today doesn't relabel sessions already on
                    // the agenda.
                    const dur = b.duration_min ?? et?.duration ?? 60;
                    const time = start.toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        key={b.id}
                        className="group flex items-center justify-between py-3 border-b border-surface-variant/60 last:border-0"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-16 text-center shrink-0">
                            <p className="font-semibold text-on-background">{time}</p>
                            <p className="text-xs text-on-surface-variant">
                              {dur >= 60
                                ? `${Math.floor(dur / 60)}h${dur % 60 ? ` ${dur % 60}m` : ""}`
                                : `${dur}m`}
                            </p>
                          </div>
                          <div className="w-1 h-12 bg-aura-primary rounded-full shrink-0" />
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
                              <span className="font-bold text-on-secondary-container text-sm">
                                {initials(name)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-on-background truncate">{name}</p>
                              <div className="flex items-center gap-1 text-on-surface-variant">
                                <Icon className="size-4" />
                                <span className="text-xs">{label}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="rounded-full bg-primary-container text-on-primary-container hover:bg-primary-container/85 ml-2 shrink-0"
                          onClick={() => checkIn.mutate(b.id)}
                          disabled={checkIn.isPending}
                        >
                          <CheckCircle2 className="size-4" /> Check-in
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Distribuzione Servizi (dal 1° gennaio) */}
            <section className={`${GLASS} rounded-[32px] p-6 shadow-soft-card`}>
              <div className="flex items-baseline justify-between mb-5 gap-3 flex-wrap">
                <h2 className="text-2xl font-manrope font-semibold">Distribuzione Servizi</h2>
                <span className="text-xs text-on-surface-variant">
                  Dal 1° gen · {distribution.total}{" "}
                  {distribution.total === 1 ? "evento" : "eventi"}
                </span>
              </div>
              {loading ? (
                <Skeleton className="h-20 w-full" />
              ) : distribution.items.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  Nessuna sessione registrata da inizio anno.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {distribution.items.map((d) => (
                    <div key={d.key}>
                      <div className="flex justify-between text-sm font-semibold mb-1.5 gap-2">
                        <span className="text-on-background truncate">{d.label}</span>
                        <span
                          className="tabular-nums whitespace-nowrap"
                          style={{ color: d.color }}
                        >
                          {d.count} ({d.pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-surface-variant rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${d.pct}%`, backgroundColor: d.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* The Assign / Personal / Consulenza dialog is now mounted globally
          at the /trainer layout (src/routes/trainer.tsx) and driven by
          ?reviewEventId. openReview() just navigates. */}
      </div>
    </>
  );
}


