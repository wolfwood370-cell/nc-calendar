import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Activity, Flame } from "lucide-react";
import { getActiveBlock, getCurrentClient, getCurrentWeek, type SessionType, bookings } from "@/lib/mock-data";
import { useMemo } from "react";

export const Route = createFileRoute("/client/")({
  component: ClientHome,
});

const TYPES: SessionType[] = ["PT Session", "BIA", "Functional Test"];

function ClientHome() {
  const me = getCurrentClient();
  const block = getActiveBlock(me.id);

  if (!block) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted-foreground">No active block. Your trainer will assign one shortly.</p>
        </CardContent>
      </Card>
    );
  }

  const cw = getCurrentWeek(block);
  const totals = useMemo(() => {
    const assigned = block.allocations.reduce((s, a) => s + a.quantity_assigned, 0);
    const booked = block.allocations.reduce((s, a) => s + a.quantity_booked, 0);
    return { assigned, booked, pct: Math.round((booked / assigned) * 100) };
  }, [block]);

  const upcoming = bookings
    .filter((b) => b.client_id === me.id && b.status === "scheduled" && new Date(b.scheduled_at) >= new Date())
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Hello, {me.full_name.split(" ")[0]}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Your training block</h1>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-accent/40 to-background p-6 border-b">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Active block</Badge>
              <p className="font-display text-xl font-semibold mt-2">Week {cw} of 4</p>
              <p className="text-sm text-muted-foreground">
                {new Date(block.start_date).toLocaleDateString()} → {new Date(block.end_date).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl font-semibold tabular-nums">{totals.booked}/{totals.assigned}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">sessions booked</p>
            </div>
          </div>
          <Progress value={totals.pct} className="mt-4 h-2" />
        </div>
        <CardContent className="p-4">
          <Button asChild className="w-full">
            <Link to="/client/book"><CalendarPlus className="size-4" /> Book sessions for this block</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((wn) => {
          const wAlloc = block.allocations.filter((a) => a.week_number === wn);
          const assigned = wAlloc.reduce((s, a) => s + a.quantity_assigned, 0);
          const booked = wAlloc.reduce((s, a) => s + a.quantity_booked, 0);
          const isCurrent = wn === cw;
          return (
            <Card key={wn} className={isCurrent ? "border-primary/40 ring-1 ring-primary/15" : ""}>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Week {wn}
                    {isCurrent && <Flame className="size-4 text-primary" />}
                  </CardTitle>
                  <CardDescription>{booked} of {assigned} booked</CardDescription>
                </div>
                <div className="size-9 rounded-md bg-accent grid place-items-center">
                  <Activity className="size-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {TYPES.map((t) => {
                  const a = wAlloc.find((x) => x.session_type === t);
                  if (!a || a.quantity_assigned === 0) return null;
                  const pct = Math.round((a.quantity_booked / a.quantity_assigned) * 100);
                  return (
                    <div key={t}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{t}</span>
                        <span className="tabular-nums text-muted-foreground">{a.quantity_booked} / {a.quantity_assigned}</span>
                      </div>
                      <Progress value={pct} className="mt-1.5 h-1.5" />
                    </div>
                  );
                })}
                {wAlloc.length === 0 && <p className="text-xs text-muted-foreground">No sessions assigned.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming sessions</CardTitle>
          <CardDescription>Cancellations within 24 hours are not allowed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nothing booked yet.</p>}
          {upcoming.map((b) => {
            const d = new Date(b.scheduled_at);
            const hoursAway = (d.getTime() - Date.now()) / (1000 * 60 * 60);
            const canCancel = hoursAway >= 24;
            return (
              <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{b.session_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                    {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" disabled={!canCancel}>
                  {canCancel ? "Cancel" : "Locked (<24h)"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
