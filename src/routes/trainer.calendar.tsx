import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bookings, clientName } from "@/lib/mock-data";

export const Route = createFileRoute("/trainer/calendar")({
  component: CalendarPage,
});

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CalendarPage() {
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const bookedDates = useMemo(
    () => bookings.filter((b) => b.status !== "cancelled").map((b) => new Date(b.scheduled_at)),
    []
  );

  const dayBookings = useMemo(() => {
    if (!selected) return [];
    return bookings
      .filter((b) => b.status !== "cancelled" && sameDay(new Date(b.scheduled_at), selected))
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  }, [selected]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Master calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">All client bookings at a glance.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card>
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              modifiers={{ booked: bookedDates }}
              modifiersClassNames={{ booked: "after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:size-1 after:rounded-full after:bg-primary relative" }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {selected?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </CardTitle>
            <CardDescription>{dayBookings.length} session{dayBookings.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {dayBookings.length === 0 && <p className="text-sm text-muted-foreground">No sessions on this day.</p>}
            {dayBookings.map((b) => {
              const d = new Date(b.scheduled_at);
              return (
                <div key={b.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-4">
                    <div className="font-display text-lg font-semibold tabular-nums">
                      {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{clientName(b.client_id)}</p>
                      <p className="text-xs text-muted-foreground">{b.session_type}</p>
                    </div>
                  </div>
                  <Badge variant={b.status === "completed" ? "secondary" : "default"}>{b.status}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
