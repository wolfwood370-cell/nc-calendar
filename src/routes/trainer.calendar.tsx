import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, UserX } from "lucide-react";
import { sessionLabel } from "@/lib/mock-data";
import { useCoachBookings, useCoachClients, useMarkNoShow } from "@/lib/queries";
import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { JoinVideoCallButton } from "@/components/join-video-call-button";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/calendar")({
  component: CalendarPage,
});

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CalendarPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  const bookingsQ = useCoachBookings(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const noShow = useMarkNoShow();

  const bookings = bookingsQ.data ?? [];
  const clientsMap = useMemo(() => {
    const m = new Map<string, string>();
    (clientsQ.data ?? []).forEach((c) => m.set(c.id, c.full_name ?? c.email ?? "Cliente"));
    return m;
  }, [clientsQ.data]);

  const bookedDates = useMemo(
    () => bookings.filter((b) => b.status === "scheduled" || b.status === "completed").map((b) => new Date(b.scheduled_at)),
    [bookings]
  );

  const dayBookings = useMemo(() => {
    if (!selected) return [];
    return bookings
      .filter((b) => b.status !== "cancelled" && sameDay(new Date(b.scheduled_at), selected))
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  }, [selected, bookings]);

  const handleNoShow = (id: string) => {
    noShow.mutate(id, {
      onSuccess: () => toast.error("Sessione segnata come No Show", { description: "Il credito non viene restituito." }),
      onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
    });
  };

  const coachName = (user?.user_metadata?.full_name as string) ?? user?.email ?? "Coach";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Calendario principale</h1>
        <p className="text-sm text-muted-foreground mt-1">Tutte le prenotazioni dei clienti in un unico sguardo.</p>
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
              {selected?.toLocaleDateString("it-IT", { weekday: "long", month: "long", day: "numeric" })}
            </CardTitle>
            <CardDescription>{dayBookings.length} {dayBookings.length === 1 ? "sessione" : "sessioni"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {bookingsQ.isLoading && <Skeleton className="h-16 w-full" />}
            {!bookingsQ.isLoading && dayBookings.length === 0 && <p className="text-sm text-muted-foreground">Nessuna sessione in questa data.</p>}
            {dayBookings.map((b) => {
              const d = new Date(b.scheduled_at);
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
                  <div className="flex items-center gap-4">
                    <div className="font-display text-lg font-semibold tabular-nums">
                      {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{clientsMap.get(b.client_id) ?? "Cliente"}</p>
                      <p className="text-xs text-muted-foreground">{sessionLabel(b.session_type)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <BookingStatusBadge status={b.status} />
                    {b.meeting_link && <JoinVideoCallButton url={b.meeting_link} variant="outline" />}
                    <AddToCalendarButton
                      sessionLabel={sessionLabel(b.session_type)}
                      startsAt={d}
                      coachName={coachName}
                      clientName={clientsMap.get(b.client_id) ?? "Cliente"}
                    />
                    {b.status === "scheduled" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost"><MoreHorizontal className="size-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleNoShow(b.id)} className="text-destructive">
                            <UserX className="size-4" /> Segna Cliente assente
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
