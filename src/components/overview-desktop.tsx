// ----------------------------------------------------------------------------
// Panoramica desktop del coach (passata 03 del redesign)
// ----------------------------------------------------------------------------
// Brief design_handoff_coach_redesign/passes/03-panoramica.md, prototipo
// designs/Coach Panoramica.dc.html. Il layout mobile (block md:hidden in
// trainer.index.tsx) resta com'era.
//   - Oggi: tutte le sessioni cliente del giorno con il loro stato (P1, P3);
//     check-in e assenza aggiornano la riga subito e si annullano (P2).
//   - Rinnovi in scadenza: la regola unica di renewal.ts (P4), «Rinnova» apre
//     il dialog Pacchetto sulla pagina (P5).
//   - Da assegnare: lo stesso insieme del badge della sidebar (to-assign.ts),
//     «Assegna» apre il dialog montato nel layout /trainer (P5).
//   - Distribuzione servizi a tutta larghezza, sotto (P6).
// ----------------------------------------------------------------------------

import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, CircleCheck, Undo2, UserX } from "lucide-react";
import { toast } from "sonner";

import { PackageDialog } from "@/components/package-dialog";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { clientPlanLabel } from "@/lib/client-search";
import { romeDate } from "@/lib/credit-order";
import { initials } from "@/lib/initials";
import { sessionLabel } from "@/lib/mock-data";
import {
  BOOKINGS_FETCH_LIMIT,
  useCoachBlocks,
  useCoachBookings,
  useCoachClients,
  useCoachEventTypes,
  type BookingRow,
} from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { listRenewals } from "@/lib/renewal";
import {
  FALLBACK_TYPE_COLOR,
  formatDistributionLabel,
  getServiceDistribution,
} from "@/lib/service-distribution";
import {
  changeSessionOutcome,
  outcomeMessage,
  withOutcome,
  type SessionOutcome,
} from "@/lib/session-outcome";
import { supabaseSessionStore } from "@/lib/session-store";
import { formatShortDay, formatTimeRange } from "@/lib/session-time";
import { iconForType } from "@/lib/session-type-icon";
import { listToAssign } from "@/lib/to-assign";
import { toastWithUndo } from "@/lib/toast";
import {
  agendaChipLabel,
  countAgenda,
  findNextClientSession,
  formatAgendaProgress,
  formatAgendaSubtitle,
  formatRomeLongDay,
  getTodayAgenda,
  greetingFor,
  sessionMinutes,
  type AgendaItem,
  type AgendaPhase,
} from "@/lib/today-agenda";
import { cn } from "@/lib/utils";

const CARD =
  "flex min-w-0 flex-col rounded-[28px] border border-white/60 bg-white/70 p-6 shadow-soft-card";

/** Ogni quanto la pagina ricalcola gli stati della giornata. */
const CLOCK_TICK_MS = 30_000;

const CHIP_CLASS: Record<AgendaPhase, string> = {
  done: "bg-success-soft text-success-text",
  noshow: "bg-danger-soft text-danger-text",
  toconfirm: "bg-warning-soft text-warning-text",
  now: "bg-aura-primary/10 text-aura-primary",
  next: "bg-surface-container text-on-surface-variant",
  later: "",
};

const ROW_CLASS: Partial<Record<AgendaPhase, string>> = {
  now: "bg-primary-container/5",
  toconfirm: "bg-[rgba(255,237,213,0.35)]",
};

/** L'ora che scorre: gli stati della giornata cambiano senza ricaricare. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/** «1h», «30m», «1h 30m». */
function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const rest = min % 60;
  return `${Math.floor(min / 60)}h${rest ? ` ${rest}m` : ""}`;
}

function CountPill({ n, tone }: { n: number; tone: "warning" | "assign" }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-bold tabular-nums",
        n === 0
          ? "bg-surface-container text-outline"
          : tone === "warning"
            ? "bg-warning-soft text-warning-text"
            : "bg-[rgba(255,220,194,0.6)] text-tertiary-container",
      )}
    >
      {n}
    </span>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-on-surface-variant">
      <CircleCheck className="size-4 shrink-0 text-success-text" aria-hidden />
      {children}
    </p>
  );
}

export function OverviewDesktop() {
  const { user } = useAuth();
  const coachId = user?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const now = useNow();
  // Cliente di cui è aperto il dialog «Pacchetto» (da «Rinnova»).
  const [renewClientId, setRenewClientId] = useState<string | null>(null);
  // Righe della giornata con un cambio di stato in corso: si disabilita solo quella.
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());

  const clientsQ = useCoachClients(coachId);
  const bookingsQ = useCoachBookings(coachId);
  const blocksQ = useCoachBlocks(coachId);
  const eventTypesQ = useCoachEventTypes(coachId);
  const loading = clientsQ.isLoading || bookingsQ.isLoading || blocksQ.isLoading;

  const clients = useMemo(() => clientsQ.data ?? [], [clientsQ.data]);
  const bookings = useMemo(() => bookingsQ.data ?? [], [bookingsQ.data]);
  const blocks = useMemo(() => blocksQ.data ?? [], [blocksQ.data]);
  const eventTypes = useMemo(() => eventTypesQ.data ?? [], [eventTypesQ.data]);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const typeById = useMemo(() => new Map(eventTypes.map((t) => [t.id, t])), [eventTypes]);

  const agenda = useMemo(
    () =>
      getTodayAgenda(bookings, now, (b) =>
        b.event_type_id ? typeById.get(b.event_type_id)?.duration : null,
      ),
    [bookings, now, typeById],
  );
  const counts = countAgenda(agenda);
  const nextSession = useMemo(
    () => (agenda.length === 0 ? findNextClientSession(bookings, now) : null),
    [agenda.length, bookings, now],
  );
  const renewals = useMemo(() => listRenewals(clients, blocks, now), [clients, blocks, now]);
  const toAssign = useMemo(() => listToAssign(bookings), [bookings]);
  const distribution = useMemo(
    () =>
      getServiceDistribution(bookings, eventTypes, now, {
        truncated: bookings.length >= BOOKINGS_FETCH_LIMIT,
      }),
    [bookings, eventTypes, now],
  );

  const firstName = ((user?.user_metadata?.full_name as string) || user?.email || "Coach").split(
    " ",
  )[0];
  const today = romeDate(now.toISOString());

  const clientName = (id: string | null) => {
    const c = id ? clientById.get(id) : undefined;
    return c?.full_name ?? c?.email ?? "Cliente";
  };
  const typeName = (b: BookingRow) => {
    const t = b.event_type_id ? typeById.get(b.event_type_id) : undefined;
    return t?.name ?? sessionLabel(b.session_type);
  };

  // Check-in, assenza e i loro annullamenti: la riga cambia subito, torna
  // com'era se il salvataggio non riesce.
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
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: queryKeys.bookings.client(b.client_id) });
    }
  }

  function openAssign(id: string) {
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, reviewEventId: id }),
    });
  }

  const skeleton = (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );

  return (
    <div className="hidden md:block -m-6 min-h-[calc(100vh-3.5rem)] bg-surface px-10 pb-12 pt-7 text-on-surface">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <PageTitle>
            {greetingFor(now)}, {firstName}
          </PageTitle>
          <p className="text-base text-on-surface-variant">
            {formatAgendaSubtitle(formatRomeLongDay(now), counts)}
          </p>
        </header>

        <div className="grid items-start gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,440px),1fr))]">
          {/* Oggi */}
          <section className={cn(CARD, "gap-2")} aria-labelledby="overview-today">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 id="overview-today" className="text-xl font-semibold">
                  Oggi
                </h2>
                {counts.total > 0 && (
                  <span className="text-[13px] text-outline">{formatAgendaProgress(counts)}</span>
                )}
              </div>
              <Link
                to="/trainer/calendar"
                search={{ date: today }}
                className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-aura-primary hover:text-primary-container"
              >
                Apri nel calendario
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            {loading ? (
              skeleton
            ) : agenda.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <p className="text-sm text-on-surface-variant">Nessuna sessione in agenda oggi.</p>
                {nextSession && (
                  <Link
                    to="/trainer/calendar"
                    search={{
                      date: romeDate(nextSession.scheduled_at),
                      event: nextSession.id,
                    }}
                    className="text-sm font-semibold text-aura-primary hover:text-primary-container"
                  >
                    Prossima: {formatRomeLongDay(new Date(nextSession.scheduled_at))} alle{" "}
                    {formatTime(new Date(nextSession.scheduled_at))} con{" "}
                    {clientName(nextSession.client_id)}
                  </Link>
                )}
              </div>
            ) : (
              <>
                <ul className="flex flex-col">
                  {agenda.map((item) => (
                    <AgendaRow
                      key={item.booking.id}
                      item={item}
                      clientName={clientName(item.booking.client_id)}
                      typeName={typeName(item.booking)}
                      typeColor={
                        (item.booking.event_type_id &&
                          typeById.get(item.booking.event_type_id)?.color) ||
                        FALLBACK_TYPE_COLOR
                      }
                      busy={pending.has(item.booking.id)}
                      onChange={(from, to) => void changeOutcome(item.booking, from, to)}
                    />
                  ))}
                </ul>
                <p className="mt-1 text-xs text-outline">
                  Ogni check-in si può annullare dal messaggio di conferma o dalla riga.
                </p>
              </>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-6">
            {/* Rinnovi in scadenza */}
            <section className={cn(CARD, "gap-3.5")} aria-labelledby="overview-renewals">
              <div className="flex items-center justify-between gap-3">
                <h2 id="overview-renewals" className="text-xl font-semibold">
                  Rinnovi in scadenza
                </h2>
                <CountPill n={renewals.length} tone="warning" />
              </div>
              <p className="-mt-1.5 text-xs text-outline">
                Ultimo blocco con 2 crediti o meno, o che scade entro 7 giorni. Esclusi i rinnovi
                automatici.
              </p>
              {loading ? (
                skeleton
              ) : renewals.length === 0 ? (
                <EmptyLine>Nessun rinnovo nei prossimi 7 giorni.</EmptyLine>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {renewals.map(({ client, info }) => {
                    const name = client.full_name ?? client.email ?? "Cliente";
                    return (
                      <li
                        key={client.id}
                        className="flex items-center justify-between gap-3 rounded-[20px] border border-surface-variant bg-white px-3.5 py-3"
                      >
                        <Link
                          to="/trainer/clients/$id"
                          params={{ id: client.id }}
                          className="group flex min-w-0 items-center gap-3 text-left"
                        >
                          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-avatar-placeholder text-[13px] font-bold text-on-avatar-placeholder">
                            {initials(name)}
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-semibold group-hover:text-aura-primary">
                              {name}
                            </span>
                            <span className="text-xs text-on-surface-variant">
                              {clientPlanLabel(client)} ·{" "}
                              <span className="font-semibold text-warning-text">{info.reason}</span>
                            </span>
                          </span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => setRenewClientId(client.id)}
                          className="h-9 shrink-0 rounded-full bg-aura-primary px-4 text-[13px] font-semibold text-white transition-colors hover:bg-primary-container"
                        >
                          Rinnova
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Da assegnare */}
            <section className={cn(CARD, "gap-3.5")} aria-labelledby="overview-to-assign">
              <div className="flex items-center justify-between gap-3">
                <h2 id="overview-to-assign" className="text-xl font-semibold">
                  Da assegnare
                </h2>
                <CountPill n={toAssign.length} tone="assign" />
              </div>
              <p className="-mt-1.5 text-xs text-outline">
                Eventi importati da Google Calendar senza cliente.
              </p>
              {loading ? (
                skeleton
              ) : toAssign.length === 0 ? (
                <EmptyLine>Tutti gli eventi importati sono assegnati.</EmptyLine>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {toAssign.map((b) => {
                    const start = new Date(b.scheduled_at);
                    const minutes = sessionMinutes(
                      b,
                      b.event_type_id ? typeById.get(b.event_type_id)?.duration : null,
                    );
                    return (
                      <li
                        key={b.id}
                        className="flex items-center justify-between gap-3 rounded-[20px] border border-dashed border-warning-border bg-assign-soft px-3.5 py-3"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-semibold">
                            {b.title?.trim() || typeName(b)}
                          </span>
                          <span className="text-xs text-tertiary-container">
                            {formatShortDay(start)} · {formatTimeRange(start, minutes)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openAssign(b.id)}
                          className="h-9 shrink-0 rounded-full bg-tertiary-container px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#5f3300]"
                        >
                          Assegna
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* Distribuzione servizi */}
        <section className={cn(CARD, "gap-4")} aria-labelledby="overview-distribution">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="overview-distribution" className="text-xl font-semibold">
              Distribuzione servizi
            </h2>
            <span className="text-[13px] text-outline">
              {formatDistributionLabel(distribution)}
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : distribution.total === 0 ? (
            <p className="text-sm text-on-surface-variant">
              Nessuna sessione registrata da inizio anno.
            </p>
          ) : (
            <>
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-surface-variant">
                {distribution.items.map((d) => (
                  <div
                    key={d.key}
                    className="h-full"
                    style={{ width: `${d.share}%`, backgroundColor: d.color }}
                  />
                ))}
              </div>
              <ul className="grid gap-x-6 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                {distribution.items.map((d) => (
                  <li key={d.key} className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: d.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{d.name}</span>
                    <span className="text-sm tabular-nums text-on-surface-variant">
                      {d.count} · {d.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* «Assegna evento» è montato nel layout /trainer (src/routes/trainer.tsx)
          e si apre con ?reviewEventId; «Pacchetto» si apre qui sul posto. */}
      <PackageDialog
        clientId={renewClientId}
        initialMode="renew"
        onClose={() => setRenewClientId(null)}
      />
    </div>
  );
}

function AgendaRow({
  item,
  clientName,
  typeName,
  typeColor,
  busy,
  onChange,
}: {
  item: AgendaItem<BookingRow>;
  clientName: string;
  typeName: string;
  typeColor: string;
  busy: boolean;
  onChange: (from: SessionOutcome, to: SessionOutcome) => void;
}) {
  const { booking: b, phase } = item;
  const start = new Date(item.start);
  const minutes = Math.round((item.end - item.start) / 60_000);
  const finished = phase === "done" || phase === "noshow";
  const urgent = phase === "toconfirm" || phase === "now";
  const chip = agendaChipLabel(item);
  const Icon = iconForType(typeName);

  return (
    <li
      className={cn(
        "-mx-3 flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[18px] p-3",
        ROW_CLASS[phase],
      )}
      aria-busy={busy || undefined}
    >
      <div className="w-[52px] shrink-0 text-center">
        <p className={cn("font-bold tabular-nums", finished ? "text-outline" : "text-on-surface")}>
          {formatTime(start)}
        </p>
        <p className="text-xs text-outline">{formatDuration(minutes)}</p>
      </div>
      <div
        className={cn("h-11 w-1 shrink-0 rounded-full", finished && "opacity-35")}
        style={{ backgroundColor: typeColor }}
        aria-hidden
      />
      {b.client_id ? (
        <Link
          to="/trainer/clients/$id"
          params={{ id: b.client_id }}
          className="group flex min-w-[180px] flex-[1_1_180px] items-center gap-3 text-left"
        >
          <RowIdentity
            clientName={clientName}
            typeName={typeName}
            Icon={Icon}
            chip={chip}
            chipClass={CHIP_CLASS[phase]}
          />
        </Link>
      ) : null}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {finished && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange(b.status as SessionOutcome, "scheduled")}
            className="flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            <Undo2 className="size-3.5" aria-hidden />
            {phase === "noshow" ? "Annulla assenza" : "Annulla check-in"}
          </button>
        )}
        {urgent && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange("scheduled", "no_show")}
            aria-label="Segna come assente"
            title="Segna come assente"
            className="grid size-[38px] place-items-center rounded-full border border-surface-variant bg-white text-on-surface-variant transition-colors hover:border-danger-line hover:text-danger-text disabled:opacity-50"
          >
            <UserX className="size-4" aria-hidden />
          </button>
        )}
        {!finished && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onChange("scheduled", "completed")}
            className={cn(
              "flex h-[38px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors disabled:opacity-50",
              urgent
                ? "bg-primary-container text-white hover:bg-aura-primary"
                : "border border-surface-variant bg-white text-aura-primary hover:border-primary-container",
            )}
          >
            <CheckCircle2 className="size-4" aria-hidden />
            Check-in
          </button>
        )}
      </div>
    </li>
  );
}

function RowIdentity({
  clientName,
  typeName,
  Icon,
  chip,
  chipClass,
}: {
  clientName: string;
  typeName: string;
  Icon: ReturnType<typeof iconForType>;
  chip: string | null;
  chipClass: string;
}) {
  return (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-sm font-bold text-on-secondary-container">
        {initials(clientName)}
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="truncate font-semibold group-hover:text-aura-primary">{clientName}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1">
            <Icon className="size-3.5" aria-hidden />
            {typeName}
          </span>
          {chip && (
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", chipClass)}>
              {chip}
            </span>
          )}
        </span>
      </span>
    </>
  );
}
