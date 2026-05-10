import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarPlus, Activity, Flame, AlertTriangle } from "lucide-react";
import { sessionLabel } from "@/lib/mock-data";
import { useClientBlocks, useClientBookings, useCancelBooking, useCoachEventTypes, type BookingRow } from "@/lib/queries";
import { useMemo, useState } from "react";
import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { JoinVideoCallButton } from "@/components/join-video-call-button";
import { toast } from "sonner";
import { syncCalendar } from "@/lib/sync-calendar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/client/")({
  component: ClientHome,
});

function getCurrentWeek(start: string): number {
  const s = new Date(start).getTime();
  const days = Math.floor((Date.now() - s) / (1000 * 60 * 60 * 24));
  return Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
}

function ClientHome() {
  const { user } = useAuth();
  const meId = user?.id;
  const blocksQ = useClientBlocks(meId);
  const bookingsQ = useClientBookings(meId);
  const cancelM = useCancelBooking();
  const [pendingLate, setPendingLate] = useState<BookingRow | null>(null);

  // profilo per recuperare coach + nome
  const profileQ = useQuery({
    queryKey: ["profile", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, coach_id")
        .eq("id", meId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const meName = profileQ.data?.full_name ?? user?.email ?? "Cliente";
  const meEmail = profileQ.data?.email ?? user?.email ?? "";
  const coachId = profileQ.data?.coach_id ?? null;
  const eventTypesQ = useCoachEventTypes(coachId);

  const block = (blocksQ.data ?? []).find((b) => b.status === "active");

  // Riepilogo crediti residui per tipologia (event_type), con fallback al base session_type per blocchi legacy
  const remainingByType = useMemo(() => {
    if (!block) return [] as Array<{ key: string; name: string; color: string; remaining: number; assigned: number }>;
    const map = new Map<string, { name: string; color: string; remaining: number; assigned: number }>();
    for (const a of block.allocations) {
      const et = a.event_type_id ? (eventTypesQ.data ?? []).find((e) => e.id === a.event_type_id) : null;
      const key = a.event_type_id ?? a.session_type;
      const cur = map.get(key) ?? {
        name: et?.name ?? sessionLabel(a.session_type),
        color: et?.color ?? "hsl(var(--primary))",
        remaining: 0, assigned: 0,
      };
      cur.remaining += Math.max(0, a.quantity_assigned - a.quantity_booked);
      cur.assigned += a.quantity_assigned;
      map.set(key, cur);
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v }));
  }, [block, eventTypesQ.data]);

  const totals = useMemo(() => {
    if (!block) return { assigned: 0, booked: 0, pct: 0 };
    const assigned = block.allocations.reduce((s, a) => s + a.quantity_assigned, 0);
    const booked = block.allocations.reduce((s, a) => s + a.quantity_booked, 0);
    return { assigned, booked, pct: assigned ? Math.round((booked / assigned) * 100) : 0 };
  }, [block]);

  const upcoming = useMemo(
    () =>
      (bookingsQ.data ?? [])
        .filter((b) => b.status === "scheduled" && new Date(b.scheduled_at) >= new Date())
        .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at)),
    [bookingsQ.data]
  );

  const findAllocationId = (b: BookingRow): string | null => {
    if (!block) return null;
    const cw = getCurrentWeek(block.start_date);
    const matchPool = (a: typeof block.allocations[number]) =>
      b.event_type_id
        ? a.event_type_id === b.event_type_id
        : a.event_type_id === null && a.session_type === b.session_type;
    const sameWeek = block.allocations.find((a) => matchPool(a) && a.week_number === cw);
    if (sameWeek) return sameWeek.id;
    const any = block.allocations.find(matchPool);
    return any?.id ?? null;
  };

  const handleCancel = (b: BookingRow) => {
    const hoursAway = (new Date(b.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursAway >= 24) {
      cancelM.mutate(
        { id: b.id, late: false, allocationId: findAllocationId(b) },
        {
          onSuccess: () => {
            if (coachId) {
              syncCalendar({ action: "cancel", coachId, googleEventId: b.google_event_id });
            }
            toast.success("Prenotazione annullata", { description: "Il credito è stato restituito al tuo blocco." });
          },
          onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
        }
      );
    } else {
      setPendingLate(b);
    }
  };

  const confirmLate = () => {
    if (!pendingLate) return;
    const b = pendingLate;
    cancelM.mutate(
      { id: b.id, late: true },
      {
        onSuccess: () => {
          if (coachId) {
            syncCalendar({ action: "cancel", coachId, googleEventId: b.google_event_id });
          }
          toast.error("Cancellazione tardiva", { description: "Il credito di questa sessione è stato perso." });
          setPendingLate(null);
        },
        onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
      }
    );
  };

  if (blocksQ.isLoading || bookingsQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!block) {
    return (
      <Card>
        <CardContent className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Nessun blocco attivo. Il tuo trainer te ne assegnerà uno a breve.</p>
        </CardContent>
      </Card>
    );
  }

  const cw = getCurrentWeek(block.start_date);
  

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Ciao, {meName.split(" ")[0]}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Il tuo blocco di allenamento</h1>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-accent/40 to-background p-6 border-b">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Blocco attivo</Badge>
              <p className="font-display text-xl font-semibold mt-2">Settimana {cw} di 4</p>
              <p className="text-sm text-muted-foreground">
                {new Date(block.start_date).toLocaleDateString("it-IT")} → {new Date(block.end_date).toLocaleDateString("it-IT")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl font-semibold tabular-nums">{totals.booked}/{totals.assigned}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">sessioni prenotate</p>
            </div>
          </div>
          <Progress value={totals.pct} className="mt-4 h-2" />
        </div>
        <CardContent className="p-4 space-y-3">
          {remainingByType.length > 0 && (
            <div className="rounded-lg bg-accent/40 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Crediti residui</p>
              <div className="flex flex-wrap gap-1.5">
                {remainingByType.map((r) => (
                  <Badge key={r.key} variant="outline" className="font-normal" style={{ borderColor: r.color }}>
                    <span className="size-2 rounded-full mr-1.5" style={{ backgroundColor: r.color }} />
                    Hai ancora <span className="mx-1 font-semibold tabular-nums">{r.remaining}</span> {r.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <Button asChild className="w-full">
            <Link to="/client/book"><CalendarPlus className="size-4" /> Prenota le sessioni del blocco</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((wn) => {
          const wAlloc = block.allocations.filter((a) => a.week_number === wn);
          const assigned = wAlloc.reduce((s, a) => s + a.quantity_assigned, 0);
          const booked = wAlloc.reduce((s, a) => s + a.quantity_booked, 0);
          const isCurrent = wn === cw;
          const groups = new Map<string, { name: string; color: string; assigned: number; booked: number }>();
          for (const a of wAlloc) {
            const et = a.event_type_id ? (eventTypesQ.data ?? []).find((e) => e.id === a.event_type_id) : null;
            const key = a.event_type_id ?? a.session_type;
            const cur = groups.get(key) ?? {
              name: et?.name ?? sessionLabel(a.session_type),
              color: et?.color ?? "hsl(var(--primary))",
              assigned: 0, booked: 0,
            };
            cur.assigned += a.quantity_assigned;
            cur.booked += a.quantity_booked;
            groups.set(key, cur);
          }
          return (
            <Card key={wn} className={isCurrent ? "border-primary/40 ring-1 ring-primary/15" : ""}>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    Settimana {wn}
                    {isCurrent && <Flame className="size-4 text-primary" />}
                  </CardTitle>
                  <CardDescription>{booked} di {assigned} prenotate</CardDescription>
                </div>
                <div className="size-9 rounded-md bg-accent grid place-items-center">
                  <Activity className="size-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...groups.entries()].map(([key, g]) => {
                  if (g.assigned === 0) return null;
                  const pct = Math.round((g.booked / g.assigned) * 100);
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ backgroundColor: g.color }} />
                          {g.name}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{g.booked} / {g.assigned}</span>
                      </div>
                      <Progress value={pct} className="mt-1.5 h-1.5" />
                    </div>
                  );
                })}
                {wAlloc.length === 0 && <p className="text-xs text-muted-foreground">Nessuna sessione assegnata.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prossime sessioni</CardTitle>
          <CardDescription>Le cancellazioni entro 24 ore comportano la perdita del credito.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nessuna sessione in programma.</p>}
          {upcoming.map((b) => {
            const d = new Date(b.scheduled_at);
            return (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{sessionLabel(b.session_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.toLocaleDateString("it-IT", { weekday: "short", month: "short", day: "numeric" })} ·{" "}
                    {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {b.meeting_link && <JoinVideoCallButton url={b.meeting_link} />}
                  <AddToCalendarButton
                    sessionLabel={sessionLabel(b.session_type)}
                    startsAt={d}
                    coachName="Coach"
                    clientName={meName}
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleCancel(b)} disabled={cancelM.isPending}>
                    Cancella
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingLate} onOpenChange={(o) => !o && setPendingLate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Attenzione: cancellazione tardiva
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stai disdicendo a meno di 24 ore. Il credito di questa sessione verrà perso e non sarà restituito al tuo blocco.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Indietro</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLate} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Cancella comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
