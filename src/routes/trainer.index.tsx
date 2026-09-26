import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import {
  useCoachClients,
  useCoachBookings,
  useCoachBlocks,
  useCoachEventTypes,
} from "@/lib/queries";
import { sessionLabel } from "@/lib/mock-data";
import { initials } from "@/lib/initials";
import { startOfToday, endOfToday } from "@/lib/date-windows";
import { OverviewDesktop } from "@/components/overview-desktop";
import {
  AuraCardSkeleton,
  AuraLineSkeleton,
  AuraPillSkeleton,
} from "@/components/ui/aura-skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TrainerNotificationsBell } from "@/components/trainer-notifications-bell";
import { Sparkles, Clock, ListChecks, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/trainer/")({
  head: () => ({
    meta: [
      { title: "Panoramica · NC Calendar" },
      {
        name: "description",
        content: "Appuntamenti di oggi, clienti attivi e attività recenti in un'unica schermata.",
      },
      { property: "og:title", content: "Panoramica · NC Calendar" },
      {
        property: "og:description",
        content: "Appuntamenti di oggi, clienti attivi e attività recenti in un'unica schermata.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { user } = useAuth();
  const coachId = user?.id;

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

  // Today's appointments — solo per il layout mobile: la Panoramica desktop
  // usa getTodayAgenda (today-agenda.ts), senza tagli.
  const todayItems = useMemo(() => {
    const s = startOfToday().getTime(),
      e = endOfToday().getTime();
    return bookings
      .filter(
        (b) =>
          b.client_id && b.client_id !== b.coach_id && !b.is_personal && b.status === "scheduled",
      )
      .filter((b) => {
        const t = new Date(b.scheduled_at).getTime();
        return t >= s && t <= e;
      })
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      .slice(0, 5);
  }, [bookings]);

  // ignoreBooking / restoreBooking / markPersonalQuick / openReview RIMOSSI
  // insieme al Centro Revisione (2026-06-06): erano usati solo da quella
  // sezione. L'assegnazione eventi avviene dal Calendario.

  const loading = clientsQ.isLoading || bookingsQ.isLoading || blocksQ.isLoading;
  const userName = (user?.user_metadata?.full_name as string) || user?.email || "Coach";
  // Next upcoming session (for the mobile "Prossimo Evento" card). Looks at
  // all assigned future bookings, picks the closest one. Reused on mobile
  // since the desktop "Oggi" list shows today only.
  const nextBooking = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter(
        (b) =>
          b.client_id && b.client_id !== b.coach_id && !b.is_personal && b.status === "scheduled",
      )
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
                    <span>Tipologie di sessione</span>
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
                  {todayItems.length === 1 ? "Sessione programmata" : "Sessioni programmate"}
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
                  Prossimo evento
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
                Apri calendario
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

      {/* Desktop: Panoramica del redesign (passata 03). */}
      <OverviewDesktop />
    </>
  );
}
