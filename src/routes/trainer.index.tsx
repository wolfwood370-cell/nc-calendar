import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ArrowRight, CalendarCheck, Users, Activity, Clock } from "lucide-react";
import { blocks, bookings, clients, getCurrentWeek, clientName } from "@/lib/mock-data";
import { useMemo } from "react";

export const Route = createFileRoute("/trainer/")({
  component: Overview,
});

function Overview() {
  const upcoming = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "scheduled" && new Date(b.scheduled_at) >= new Date())
        .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
        .slice(0, 6),
    []
  );

  const alerts = useMemo(() => {
    const result: { client: string; week: number; type: string; remaining: number }[] = [];
    for (const block of blocks) {
      const cw = getCurrentWeek(block);
      for (const a of block.allocations) {
        const remaining = a.quantity_assigned - a.quantity_booked;
        if (remaining > 0 && (a.week_number === cw || a.week_number === cw + 1)) {
          result.push({
            client: clientName(block.client_id),
            week: a.week_number,
            type: a.session_type,
            remaining,
          });
        }
      }
    }
    return result;
  }, []);

  const totalAssigned = blocks.flatMap((b) => b.allocations).reduce((s, a) => s + a.quantity_assigned, 0);
  const totalBooked = blocks.flatMap((b) => b.allocations).reduce((s, a) => s + a.quantity_booked, 0);
  const utilization = Math.round((totalBooked / totalAssigned) * 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Studio overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Today, {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat icon={Users} label="Active clients" value={clients.length.toString()} hint="all rostered" />
        <Stat icon={Activity} label="Active blocks" value={blocks.length.toString()} hint="this cycle" />
        <Stat icon={CalendarCheck} label="Upcoming sessions" value={upcoming.length.toString()} hint="next 14 days" />
        <Stat icon={Clock} label="Block utilization" value={`${utilization}%`} hint="booked vs assigned" progress={utilization} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming bookings</CardTitle>
              <CardDescription>Scheduled across all clients</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/trainer/calendar">Open calendar <ArrowRight className="size-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming bookings.</p>}
            {upcoming.map((b) => {
              const d = new Date(b.scheduled_at);
              return (
                <div key={b.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-md bg-accent grid place-items-center">
                      <span className="font-display text-sm font-semibold">
                        {d.toLocaleDateString(undefined, { day: "2-digit" })}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">{clientName(b.client_id)}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.toLocaleDateString(undefined, { weekday: "short", month: "short" })} ·{" "}
                        {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{b.session_type}</Badge>
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
                <CardTitle className="text-base">Unbooked allocations</CardTitle>
                <CardDescription>This week & next</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 && <p className="text-sm text-muted-foreground">All caught up.</p>}
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{a.client}</p>
                  <p className="text-xs text-muted-foreground">Week {a.week} · {a.type}</p>
                </div>
                <Badge variant="outline" className="border-warning/40 text-warning">
                  {a.remaining} left
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
  icon: Icon,
  label,
  value,
  hint,
  progress,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  progress?: number;
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
