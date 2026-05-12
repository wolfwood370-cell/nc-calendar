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
import { sessionLabel } from "@/lib/mock-data";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const SOFT_SHADOW = "shadow-[0px_4px_20px_rgba(0,86,133,0.05)]";

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

  const clients = clientsQ.data ?? [];
  const bookings = bookingsQ.data ?? [];
  const blocks = blocksQ.data ?? [];
  const eventTypes = eventTypesQ.data ?? [];

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

  // Centro Revisione: bookings with client_id NULL within last 7 days (active + ignored)
  const reviewQ = useQuery({
    queryKey: ["bookings", "unassigned-all", coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, scheduled_at, title, notes, session_type, event_type_id, ignored, deleted_at")
        .eq("coach_id", coachId!)
        .is("client_id", null)
        .gte("scheduled_at", sevenDaysAgo().toISOString())
        .order("scheduled_at", { ascending: false });
      if (error) {
        console.error("[Dashboard] review fetch failed", error);
        return [];
      }
      return data ?? [];
    },
  });
  const allReviewItems = reviewQ.data ?? [];
  const reviewItems = allReviewItems.filter((r) => !r.ignored && !r.deleted_at);
  const ignoredItems = allReviewItems.filter((r) => r.ignored || r.deleted_at);
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
      const blockBookings = bookings.filter(bk => bk.block_id === b.id && bk.status === "completed");
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
  }, [blocks, clientById]);

  // Service distribution this month
  const distribution = useMemo(() => {
    const s = startOfMonth().getTime(),
      e = endOfMonth().getTime();
    const counts = new Map<string, number>();
    let total = 0;
    for (const b of bookings) {
      const t = new Date(b.scheduled_at).getTime();
      if (t < s || t > e) continue;
      if (b.status === "cancelled") continue;
      const key = b.event_type_id ?? `__${b.session_type}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
    const arr = Array.from(counts.entries())
      .map(([key, count]) => {
        const et = key.startsWith("__") ? null : eventTypeById.get(key);
        return {
          key,
          label: et?.name ?? sessionLabel(key.replace("__", "") as never),
          color: et?.color ?? "#003e62",
          pct: total ? Math.round((count / total) * 100) : 0,
        };
      })
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
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["trainer-stats"] });
      qc.invalidateQueries({ queryKey: ["client-details"] });
      toast.success("Sessione completata e contatori aggiornati");
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const ignoreBooking = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ ignored: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Evento spostato negli ignorati");
      qc.invalidateQueries({ queryKey: ["bookings"] });
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
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const [assignTarget, setAssignTarget] = useState<{ id: string; title: string } | null>(null);
  const [assignClientId, setAssignClientId] = useState<string>("");
  const assignBooking = useMutation({
    mutationFn: async (input: { bookingId: string; clientId: string }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ client_id: input.clientId })
        .eq("id", input.bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sessione assegnata");
      setAssignTarget(null);
      setAssignClientId("");
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

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
              className={`bg-surface-container-lowest rounded-[32px] p-6 ${SOFT_SHADOW} border border-[#ffb77b]/40`}
            >
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="size-6 text-tertiary-container" />
                  <h2 className="text-2xl font-semibold">Centro Revisione</h2>
                </div>
                <div className="inline-flex rounded-full bg-surface-container-low p-1">
                  <button
                    type="button"
                    onClick={() => setReviewTab("todo")}
                    className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                      reviewTab === "todo"
                        ? "bg-[#003e62] text-white"
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
                        ? "bg-[#003e62] text-white"
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
                    googleTitle || et?.name || sessionLabel(r.session_type) || "Evento Google Calendar";
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
                            isIgnored ? "text-on-surface-variant" : "text-[#ba1a1a]"
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
                          className="rounded-full bg-[#003e62] text-white hover:bg-[#003e62]/90"
                          onClick={() => {
                            setAssignTarget({ id: r.id, title: r.title || "Sessione" });
                            setAssignClientId("");
                          }}
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
          <section className={`bg-surface-container-lowest rounded-[32px] p-6 ${SOFT_SHADOW}`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-semibold">Oggi</h2>
              <Link
                to="/trainer/calendar"
                className="text-sm font-semibold text-[#003e62] hover:underline"
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
                  const dur = et?.duration ?? 60;
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
                        <div className="w-1 h-12 bg-[#003e62] rounded-full shrink-0" />
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
          <section className={`bg-surface-container-lowest rounded-[32px] p-6 ${SOFT_SHADOW}`}>
            <div className="flex items-center gap-2 mb-5">
              <Hourglass className="size-5 text-[#003e62]" />
              <h2 className="text-2xl font-semibold">Crediti in Scadenza</h2>
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
                    ? "bg-error-container text-[#93000a]"
                    : isOne
                      ? "bg-[#ffdcc2] text-tertiary-container"
                      : "bg-surface-variant text-on-surface-variant";
                  const avatarBg = isZero
                    ? "bg-[#ba1a1a] text-white"
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
          <section className={`bg-surface-container-lowest rounded-[32px] p-6 ${SOFT_SHADOW}`}>
            <h2 className="text-2xl font-semibold mb-5">Distribuzione Servizi</h2>
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

      {/* Assign client dialog */}
      <Dialog
        open={!!assignTarget}
        onOpenChange={(o) => {
          if (!o) setAssignTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna sessione a un cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{assignTarget?.title}</p>
          <Select value={assignClientId} onValueChange={setAssignClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona cliente" />
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
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Annulla
            </Button>
            <Button
              disabled={!assignClientId || assignBooking.isPending}
              onClick={() =>
                assignTarget &&
                assignBooking.mutate({ bookingId: assignTarget.id, clientId: assignClientId })
              }
            >
              Assegna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
      className={`bg-surface-container-lowest p-6 rounded-[32px] ${SOFT_SHADOW} flex flex-col items-center justify-center text-center`}
    >
      <Icon className="size-7 text-[#003e62] mb-2" />
      <p className="text-xs uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
        {label}
      </p>
      <p className="font-display text-4xl font-bold text-on-background tabular-nums">{value}</p>
    </div>
  );
}
