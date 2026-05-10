import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, ArrowRight, CalendarCheck, Users, Activity, Clock } from "lucide-react";
import { sessionLabel } from "@/lib/mock-data";
import { useCoachBlocks, useCoachBookings, useCoachClients } from "@/lib/queries";
import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { JoinVideoCallButton } from "@/components/join-video-call-button";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { useAuth } from "@/lib/auth";
import { useMemo } from "react";

export const Route = createFileRoute("/trainer/")({
  component: Overview,
});

function getCurrentWeek(start: string, end: string): number {
  const s = new Date(start).getTime();
  const days = Math.floor((Date.now() - s) / (1000 * 60 * 60 * 24));
  return Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
}

function Overview() {
  const { user } = useAuth();
  const coachId = user?.id;
  const clientsQ = useCoachClients(coachId);
  const bookingsQ = useCoachBookings(coachId);
  const blocksQ = useCoachBlocks(coachId);

  const clients = clientsQ.data ?? [];
  const bookings = bookingsQ.data ?? [];
  const blocks = blocksQ.data ?? [];
  const clientNameById = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach((c) => m.set(c.id, c.full_name ?? c.email ?? "Cliente"));
    return m;
  }, [clients]);

  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "scheduled" && new Date(b.scheduled_at) >= new Date())
        .slice(0, 6),
    [bookings]
  );

  const alerts = useMemo(() => {
    const result: { client: string; week: number; type: string; remaining: number }[] = [];
    for (const block of blocks) {
      if (block.status !== "active") continue;
      const cw = getCurrentWeek(block.start_date, block.end_date);
      for (const a of block.allocations) {
        const remaining = a.quantity_assigned - a.quantity_booked;
        if (remaining > 0 && (a.week_number === cw || a.week_number === cw + 1)) {
          result.push({
            client: clientNameById.get(block.client_id) ?? "Cliente",
            week: a.week_number,
            type: sessionLabel(a.session_type),
            remaining,
          });
        }
      }
    }
    return result;
  }, [blocks, clientNameById]);

  const totalAssigned = blocks.flatMap((b) => b.allocations).reduce((s, a) => s + a.quantity_assigned, 0);
  const totalBooked = blocks.flatMap((b) => b.allocations).reduce((s, a) => s + a.quantity_booked, 0);
  const utilization = totalAssigned ? Math.round((totalBooked / totalAssigned) * 100) : 0;

  const loading = clientsQ.isLoading || bookingsQ.isLoading || blocksQ.isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Panoramica studio</h1>
        <p className="text-sm text-muted-foreground mt-1">Oggi, {new Date().toLocaleDateString("it-IT", { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Users} label="Clienti attivi" value={loading ? "—" : clients.length.toString()} hint="totale roster" />
        <Stat icon={Activity} label="Blocchi attivi" value={loading ? "—" : blocks.filter((b) => b.status === "active").length.toString()} hint="ciclo corrente" />
        <Stat icon={CalendarCheck} label="Sessioni in arrivo" value={loading ? "—" : upcoming.length.toString()} hint="prossimi appuntamenti" />
        <Stat icon={Clock} label="Utilizzo blocchi" value={loading ? "—" : `${utilization}%`} hint="prenotate vs assegnate" progress={utilization} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Prossime prenotazioni</CardTitle>
              <CardDescription>Programmate per tutti i clienti</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/trainer/calendar">Apri calendario <ArrowRight className="size-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>}
            {!loading && upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nessuna prenotazione in arrivo.</p>}
            {!loading && upcoming.map((b) => {
              const d = new Date(b.scheduled_at);
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-md bg-accent grid place-items-center">
                      <span className="font-display text-sm font-semibold">
                        {d.toLocaleDateString("it-IT", { day: "2-digit" })}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{clientNameById.get(b.client_id) ?? "Cliente"}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.toLocaleDateString("it-IT", { weekday: "short", month: "short" })} ·{" "}
                        {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{sessionLabel(b.session_type)}</Badge>
                    <BookingStatusBadge status={b.status} />
                    {b.meeting_link && <JoinVideoCallButton url={b.meeting_link} variant="outline" />}
                    <AddToCalendarButton
                      sessionLabel={sessionLabel(b.session_type)}
                      startsAt={d}
                      coachName={user?.user_metadata?.full_name ?? user?.email ?? "Coach"}
                      clientName={clientNameById.get(b.client_id) ?? "Cliente"}
                      variant="ghost"
                      label=""
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-md bg-warning/15 text-warning grid place-items-center">
                <AlertTriangle className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base">Quote non prenotate</CardTitle>
                <CardDescription>Questa settimana e la prossima</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading && <Skeleton className="h-12 w-full" />}
            {!loading && alerts.length === 0 && <p className="text-sm text-muted-foreground">Tutto in regola.</p>}
            {!loading && alerts.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{a.client}</p>
                  <p className="text-xs text-muted-foreground">Settimana {a.week} · {a.type}</p>
                </div>
                <Badge variant="outline" className="border-warning/40 text-warning">
                  {a.remaining} rimanenti
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, hint, progress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint: string; progress?: number;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-3xl font-semibold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
          </div>
          <div className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center">
            <Icon className="size-4" />
          </div>
        </div>
        {progress !== undefined && <Progress value={progress} className="mt-4 h-1.5" />}
      </CardContent>
    </Card>
  );
}
