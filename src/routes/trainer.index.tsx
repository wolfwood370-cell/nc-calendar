import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Users,
  CalendarCheck2,
  Wallet,
  UserPlus,
  AlertTriangle,
  Hourglass,
  Dumbbell,
  Stethoscope,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/trainer/")({
  component: Overview,
});

const GLASS = "bg-white/60 backdrop-blur-xl border border-white/40";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function iconForType(name: string | undefined) {
  const n = (name ?? "").toLowerCase();
  if (n.includes("triage") || n.includes("bia") || n.includes("test")) return Stethoscope;
  if (n.includes("massa") || n.includes("spa")) return Sparkles;
  return Dumbbell;
}

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

  // Centro Revisione: bookings with client_id NULL within last 7 days
  // (active + ignored). Personal Blocks share the client_id IS NULL shape
  // so without the is_personal filter they would re-appear in the
  // "needs attention" list right after the coach converted them — the
  // whole point of marking them personal is to clear them from this
  // queue. The SELECT below uses the same defensive try-with-fallback
  // pattern as queries.ts in case the migration hasn't shipped yet.
  interface ReviewRow {
    id: string;
    scheduled_at: string;
    title: string | null;
    notes: string | null;
    session_type: SessionType;
    event_type_id: string | null;
    ignored: boolean;
    deleted_at: string | null;
    is_personal?: boolean;
  }
  const reviewQ = useQuery<ReviewRow[]>({
    queryKey: ["bookings", "unassigned-all", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<ReviewRow[]> => {
      const baseCols =
        "id, scheduled_at, title, notes, session_type, event_type_id, ignored, deleted_at";
      const primary = await supabase
        .from("bookings")
        .select(`${baseCols}, is_personal`)
        .eq("coach_id", coachId!)
        .is("client_id", null)
        .gte("scheduled_at", sevenDaysAgo().toISOString())
        .order("scheduled_at", { ascending: false });
      if (
        primary.error &&
        ((primary.error as { code?: string }).code === "42703" ||
          (primary.error.message ?? "").includes("is_personal"))
      ) {
        const fallback = await supabase
          .from("bookings")
          .select(baseCols)
          .eq("coach_id", coachId!)
          .is("client_id", null)
          .gte("scheduled_at", sevenDaysAgo().toISOString())
          .order("scheduled_at", { ascending: false });
        if (fallback.error) {
          console.error("[Dashboard] review fetch failed", fallback.error);
          return [];
        }
        return (fallback.data ?? []).map(
          (r) => ({ ...(r as object), is_personal: false }) as ReviewRow,
        );
      }
      if (primary.error) {
        console.error("[Dashboard] review fetch failed", primary.error);
        return [];
      }
      return (primary.data ?? []) as ReviewRow[];
    },
  });
  const allReviewItems = reviewQ.data ?? [];
  // Drop personal blocks from BOTH buckets: they're not "to review", and
  // shouldn't be reachable from the "Ignorati" tab either — the coach
  // already gave them a final classification.
  const reviewItems = allReviewItems.filter(
    (r) => !r.ignored && !r.deleted_at && r.is_personal !== true,
  );
  const ignoredItems = allReviewItems.filter(
    (r) => (r.ignored || r.deleted_at) && r.is_personal !== true,
  );
  const [reviewTab, setReviewTab] = useState<"todo" | "ignored">("todo");

  // Today's appointments
  const todayItems = useMemo(() => {
    const s = startOfToday().getTime(),
      e = endOfToday().getTime();
    return bookings
      .filter((b) => b.client_id && b.status === "scheduled")
      .filter((b) => {
        const t = new Date(b.scheduled_at).getTime();
        return t >= s && t <= e;
      })
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      .slice(0, 5);
  }, [bookings]);

  // Expiring credits (active block, remaining <= 2)
  const expiring = useMemo(() => {
    const now = startOfToday().getTime();
    const map = new Map<string, number>();
    for (const b of blocks) {
      if (b.status !== "active") continue;
      if (new Date(b.end_date).getTime() < now) continue;
      const blockBookings = bookings.filter(
        (bk) => bk.block_id === b.id && bk.status === "completed",
      );
      const dynamicCompleted = blockBookings.length;
      const totalAssigned = b.allocations.reduce((s, a) => s + a.quantity_assigned, 0);
      const rem = Math.max(0, totalAssigned - dynamicCompleted);

      if (rem <= 2) map.set(b.client_id, (map.get(b.client_id) ?? 0) + rem);
    }
    return Array.from(map.entries())
      .map(([clientId, remaining]) => ({
        clientId,
        name: clientById.get(clientId)?.full_name ?? clientById.get(clientId)?.email ?? "Cliente",
        remaining,
      }))
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 6);
  }, [blocks, bookings, clientById]);

  // Service distribution this month
  const distribution = useMemo(() => {
    const s = startOfMonth().getTime(),
      e = endOfMonth().getTime();
    const counts = new Map<string, { count: number; color: string }>();
    let total = 0;
    for (const b of bookings) {
      const t = new Date(b.scheduled_at).getTime();
      if (t < s || t > e) continue;
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
        pct: total ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
    return { items: arr, total };
  }, [bookings, eventTypeById]);

  // New clients (last 30 days)
  const newClientsQ = useQuery({
    queryKey: ["profiles", "new-30d", coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", coachId!)
        .is("deleted_at", null)
        .gte("created_at", thirtyDaysAgo().toISOString());
      if (error) {
        console.error("[Dashboard] new clients count failed", error);
        return 0;
      }
      return count ?? 0;
    },
  });

  // Quick stats
  const stats = useMemo(() => {
    const s = startOfMonth().getTime(),
      e = endOfMonth().getTime();
    const sessionsMonth = bookings.filter((b) => {
      const t = new Date(b.scheduled_at).getTime();
      return t >= s && t <= e && b.status === "completed";
    }).length;
    const creditsIssued = blocks
      .flatMap((b) => b.allocations)
      .reduce((s, a) => s + a.quantity_assigned, 0);
    const activeClients = clients.filter((c) => c.status === "active").length;
    return {
      activeClients,
      sessionsMonth,
      creditsIssued,
      newClients: newClientsQ.data ?? 0,
    };
  }, [bookings, blocks, clients, newClientsQ.data]);

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

  const ignoreBooking = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").update({ ignored: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento spostato negli ignorati");
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const restoreBooking = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ ignored: false, deleted_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento ripristinato");
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  // P4: open the global ReviewBookingDialog by pushing `?reviewEventId=`
  // into the URL. The dialog lives at the /trainer layout level (see
  // src/routes/trainer.tsx) and handles assign / personal / consulenza
  // server-side; this page just routes the user into it.
  const navigate = useNavigate();
  const openReview = (bookingId: string) => {
    navigate({
      to: "/trainer",
      search: (prev: Record<string, unknown>) => ({ ...prev, reviewEventId: bookingId }),
    });
  };

  const loading = clientsQ.isLoading || bookingsQ.isLoading || blocksQ.isLoading;
  const userName = (user?.user_metadata?.full_name as string) || user?.email || "Coach";
  const todayLabel = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="bg-surface text-on-background -m-6 p-6 md:p-10 min-h-[calc(100vh-3.5rem)]">
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
          {/* Centro Revisione */}
          {(reviewItems.length > 0 || ignoredItems.length > 0) && (
            <section
              className={`${GLASS} rounded-[32px] p-6 shadow-soft-card border border-warning-border/40`}
            >
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="size-6 text-tertiary-container" />
                  <h2 className="text-2xl font-manrope font-semibold">Centro Revisione</h2>
                </div>
                <div className="inline-flex rounded-full bg-surface-container-low p-1">
                  <button
                    type="button"
                    onClick={() => setReviewTab("todo")}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                      reviewTab === "todo"
                        ? "bg-aura-primary text-white"
                        : "text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    Da Assegnare ({reviewItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewTab("ignored")}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                      reviewTab === "ignored"
                        ? "bg-aura-primary text-white"
                        : "text-on-surface-variant hover:bg-surface-container"
                    }`}
                  >
                    Ignorati ({ignoredItems.length})
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {(reviewTab === "todo" ? reviewItems : ignoredItems).slice(0, 5).map((r) => {
                  const start = new Date(r.scheduled_at);
                  const dateLabel = start.toLocaleDateString("it-IT", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  });
                  const timeLabel = start.toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const et = r.event_type_id ? eventTypeById.get(r.event_type_id) : null;
                  const importedTitle =
                    typeof r.notes === "string"
                      ? r.notes.match(/^Importato da Google Calendar:\s*(.+)$/)?.[1]?.trim()
                      : null;
                  const googleTitle = r.title?.trim() || importedTitle || null;
                  const eventName =
                    googleTitle ||
                    et?.name ||
                    sessionLabel(r.session_type) ||
                    "Evento Google Calendar";
                  const typeLabel = et?.name ?? sessionLabel(r.session_type);
                  const isIgnored = reviewTab === "ignored";
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low p-4 rounded-2xl"
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-semibold uppercase tracking-wider mb-1 ${
                            isIgnored ? "text-on-surface-variant" : "text-error"
                          }`}
                        >
                          {isIgnored ? "Ignorato" : "Cliente non assegnato"}
                        </p>
                        <p className="font-semibold text-on-background truncate">{eventName}</p>
                        <p className="text-sm text-on-surface-variant capitalize">
                          {dateLabel} · {timeLabel}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                          Tipologia: {typeLabel} · Origine: Google Calendar
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {isIgnored ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-full bg-surface-variant text-on-surface-variant hover:bg-surface-container-high"
                            onClick={() => restoreBooking.mutate(r.id)}
                            disabled={restoreBooking.isPending}
                          >
                            Ripristina
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="rounded-full bg-surface-variant text-on-surface-variant hover:bg-surface-container-high"
                            onClick={() => ignoreBooking.mutate(r.id)}
                            disabled={ignoreBooking.isPending}
                          >
                            Ignora
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="rounded-full bg-aura-primary text-white hover:bg-aura-primary/90"
                          onClick={() => openReview(r.id)}
                        >
                          Assegna
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {(reviewTab === "todo" ? reviewItems : ignoredItems).length === 0 && (
                  <p className="text-sm text-on-surface-variant italic px-2 py-4 text-center">
                    {reviewTab === "todo"
                      ? "Nessun evento da revisionare."
                      : "Nessun evento ignorato."}
                  </p>
                )}
              </div>
            </section>
          )}

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
                Nessun appuntamento previsto per oggi. Goditi la giornata!
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
          {/* Crediti in Scadenza */}
          <section className={`${GLASS} rounded-[32px] p-6 shadow-soft-card`}>
            <div className="flex items-center gap-2 mb-5">
              <Hourglass className="size-5 text-aura-primary" />
              <h2 className="text-2xl font-manrope font-semibold">Crediti in Scadenza</h2>
            </div>
            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : expiring.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-2">
                Nessun pacchetto in scadenza imminente.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {expiring.map((c) => {
                  const isZero = c.remaining === 0;
                  const isOne = c.remaining === 1;
                  const rowBg = isZero
                    ? "bg-error-container/30"
                    : isOne
                      ? "bg-tertiary-container/10"
                      : "bg-surface-container-low";
                  const badgeBg = isZero
                    ? "bg-error-container text-on-error-container"
                    : isOne
                      ? "bg-warning-container text-tertiary-container"
                      : "bg-surface-variant text-on-surface-variant";
                  const avatarBg = isZero
                    ? "bg-error text-white"
                    : isOne
                      ? "bg-tertiary text-white"
                      : "bg-surface-variant text-on-surface-variant";
                  return (
                    <li
                      key={c.clientId}
                      className={`flex items-center justify-between p-3 rounded-2xl ${rowBg}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${avatarBg}`}
                        >
                          {initials(c.name)}
                        </div>
                        <Link
                          to="/trainer/clients/$id"
                          params={{ id: c.clientId }}
                          className="font-semibold truncate hover:underline"
                        >
                          {c.name}
                        </Link>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-md whitespace-nowrap ${badgeBg}`}
                      >
                        {c.remaining} {c.remaining === 1 ? "rimanente" : "rimanenti"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Distribuzione Servizi */}
          <section className={`${GLASS} rounded-[32px] p-6 shadow-soft-card`}>
            <h2 className="text-2xl font-manrope font-semibold mb-5">Distribuzione Servizi</h2>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : distribution.items.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                Nessuna sessione registrata questo mese.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {distribution.items.map((d) => (
                  <div key={d.key}>
                    <div className="flex justify-between text-sm font-semibold mb-1.5">
                      <span className="text-on-background">{d.label}</span>
                      <span style={{ color: d.color }}>{d.pct}%</span>
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

      {/* Quick Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickStat icon={Users} label="Clienti Attivi" value={stats.activeClients} />
        <QuickStat icon={CalendarCheck2} label="Sessioni Mese" value={stats.sessionsMonth} />
        <QuickStat icon={Wallet} label="Crediti Emessi" value={stats.creditsIssued} />
        <QuickStat icon={UserPlus} label="Nuovi (30gg)" value={stats.newClients} />
      </section>

      {/* The Assign / Personal / Consulenza dialog is now mounted globally
          at the /trainer layout (src/routes/trainer.tsx) and driven by
          ?reviewEventId. openReview() just navigates. */}
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div
      className={`${GLASS} p-6 rounded-[32px] shadow-soft-card flex flex-col items-center justify-center text-center`}
    >
      <Icon className="size-7 text-aura-primary mb-2" />
      <p className="text-xs uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
        {label}
      </p>
      <p className="font-display text-4xl font-bold text-on-background tabular-nums">{value}</p>
    </div>
  );
}
