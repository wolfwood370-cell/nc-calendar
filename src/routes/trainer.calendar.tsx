import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MoreHorizontal, UserX, NotebookPen, Save, Trash2 } from "lucide-react";
import { sessionLabel } from "@/lib/mock-data";
import { useCoachBookings, useCoachClients, useCoachEventTypes, useMarkNoShow, useUpdateTrainerNotes, useCoachCancelBooking, type BookingRow } from "@/lib/queries";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { JoinVideoCallButton } from "@/components/join-video-call-button";
import { BookingStatusBadge } from "@/components/booking-status-badge";
import { useAuth } from "@/lib/auth";
import { syncCalendarAwait } from "@/lib/sync-calendar";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/calendar")({
  component: CalendarPage,
});

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Date | undefined>(new Date());
  const [mirroring, setMirroring] = useState(false);
  const lastMirrorMonth = useRef<string>("");
  const bookingsQ = useCoachBookings(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const eventTypesQ = useCoachEventTypes(user?.id);
  const noShow = useMarkNoShow();
  const updateNotes = useUpdateTrainerNotes();
  const cancelBooking = useCoachCancelBooking();
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const handleCancelBooking = () => {
    if (!activeBooking) return;
    cancelBooking.mutate(activeBooking, {
      onSuccess: () => {
        toast.success("Appuntamento cancellato e credito rimborsato.");
        setActiveBooking(null);
      },
      onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
    });
  };

  const openNotes = (b: BookingRow) => {
    setActiveBooking(b);
    setNotesDraft(b.trainer_notes ?? "");
  };
  const saveNotes = () => {
    if (!activeBooking) return;
    updateNotes.mutate(
      { id: activeBooking.id, notes: notesDraft },
      {
        onSuccess: () => {
          toast.success("Note salvate");
          setActiveBooking(null);
        },
        onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
      }
    );
  };

  const bookings = bookingsQ.data ?? [];
  const clientsMap = useMemo(() => {
    const m = new Map<string, string>();
    (clientsQ.data ?? []).forEach((c) => m.set(c.id, c.full_name ?? c.email ?? "Cliente"));
    return m;
  }, [clientsQ.data]);
  const eventTypesMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    (eventTypesQ.data ?? []).forEach((e) => m.set(e.id, { name: e.name, color: e.color }));
    return m;
  }, [eventTypesQ.data]);

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

  // Full sync (passato + 2 anni futuri) una volta per sessione all'apertura del Calendario
  const didFullSync = useRef(false);
  useEffect(() => {
    if (!user || didFullSync.current) return;
    didFullSync.current = true;
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    setMirroring(true);
    syncCalendarAwait({
      action: "import_history", coachId: user.id,
      rangeStartISO: "2026-01-01T00:00:00Z",
      rangeEndISO: future.toISOString(),
    })
      .then(({ data }) => {
        const r = data as { ok?: boolean; imported?: number; updated?: number; matched?: number; creditsBooked?: number; skipped?: boolean } | null;
        if (r?.skipped) return;
        if (r?.ok) {
          toast.success("Sincronizzazione completata", {
            description: `${r.imported ?? 0} nuovi · ${r.updated ?? 0} aggiornati · ${r.creditsBooked ?? 0} crediti scalati`,
          });
          qc.invalidateQueries({ queryKey: ["bookings"] });
          qc.invalidateQueries({ queryKey: ["block-allocations"] });
        }
      })
      .catch((e) => console.error("full sync failed", e))
      .finally(() => setMirroring(false));
  }, [user, qc]);

  // Mirror check con Google Calendar quando cambia il mese visualizzato
  useEffect(() => {
    if (!user || !selected) return;
    const monthKey = `${selected.getFullYear()}-${selected.getMonth()}`;
    if (lastMirrorMonth.current === monthKey) return;
    lastMirrorMonth.current = monthKey;
    const start = new Date(selected.getFullYear(), selected.getMonth(), 1).toISOString();
    const end = new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 23, 59, 59).toISOString();
    setMirroring(true);
    syncCalendarAwait({
      action: "mirror_check", coachId: user.id,
      rangeStartISO: start, rangeEndISO: end,
    })
      .then(({ data }) => {
        const r = data as { ok?: boolean; cancelled?: number; moved?: number; remapped?: number; imported?: number; skipped?: boolean } | null;
        if (r?.ok && ((r.cancelled ?? 0) > 0 || (r.moved ?? 0) > 0 || (r.remapped ?? 0) > 0 || (r.imported ?? 0) > 0)) {
          toast.info("Calendario aggiornato", {
            description: `${r.imported ?? 0} nuovi · ${r.cancelled ?? 0} annullate · ${r.moved ?? 0} spostate · ${r.remapped ?? 0} ri-mappate`,
          });
          qc.invalidateQueries({ queryKey: ["bookings"] });
          qc.invalidateQueries({ queryKey: ["block-allocations"] });
        }
      })
      .catch((e) => console.error("mirror_check failed", e))
      .finally(() => setMirroring(false));
  }, [user, selected, qc]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Calendario principale</h1>
          <p className="text-sm text-muted-foreground mt-1">Tutte le prenotazioni dei clienti in un unico sguardo.</p>
        </div>
        {mirroring && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border px-3 py-1.5">
            <Loader2 className="size-3.5 animate-spin" /> Sincronizzazione in corso…
          </div>
        )}
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
              const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
              const isSynced = !!b.google_event_id;
              const isUnmatchedSync = isSynced && b.client_id === b.coach_id;
              const originalTitle = isSynced && b.notes
                ? b.notes.replace(/^Importato da Google Calendar:\s*/i, "")
                : null;
              const displayName = isUnmatchedSync
                ? (originalTitle ?? "Evento Google")
                : (clientsMap.get(b.client_id) ?? "Cliente");
              const typeLabel = et?.name ?? sessionLabel(b.session_type);
              const accent = et?.color;
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4 border-l-4"
                  style={accent ? { borderLeftColor: accent } : undefined}
                >
                  <div className="flex items-center gap-4">
                    <div className="font-display text-lg font-semibold tabular-nums">
                      {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {displayName}
                        {isUnmatchedSync && (
                          <span className="text-[10px] uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Sync</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        {accent && <span className="inline-block size-2 rounded-full" style={{ background: accent }} />}
                        {typeLabel}
                        {isSynced && !isUnmatchedSync && originalTitle && originalTitle !== typeLabel && (
                          <span className="opacity-60">· {originalTitle}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <BookingStatusBadge status={b.status} />
                    {b.meeting_link && <JoinVideoCallButton url={b.meeting_link} variant="outline" />}
                    <AddToCalendarButton
                      sessionLabel={typeLabel}
                      startsAt={d}
                      coachName={coachName}
                      clientName={displayName}
                    />
                    <Button size="sm" variant="outline" onClick={() => openNotes(b)}>
                      <NotebookPen className="size-4" />
                      {b.trainer_notes ? "Note" : "Aggiungi note"}
                    </Button>
                    {b.status === "scheduled" && !isUnmatchedSync && (
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

      <Dialog open={!!activeBooking} onOpenChange={(o) => !o && setActiveBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dettagli sessione</DialogTitle>
            <DialogDescription>
              {activeBooking && (() => {
                const dd = new Date(activeBooking.scheduled_at);
                const cli = clientsMap.get(activeBooking.client_id) ?? "Cliente";
                return `${cli} · ${dd.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} · ${dd.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Note di Sessione (visibili solo al Coach)</label>
            <Textarea
              rows={6}
              placeholder="Esercizi svolti, carichi, feedback…"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={!activeBooking || activeBooking.status === "cancelled" || cancelBooking.isPending}
                >
                  {cancelBooking.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  Cancella Appuntamento
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancellare l'appuntamento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Questa azione annullerà l'evento. Il credito verrà automaticamente rimborsato nel blocco del cliente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Indietro</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelBooking}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Sì, cancella
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setActiveBooking(null)}>Chiudi</Button>
              <Button onClick={saveNotes} disabled={updateNotes.isPending}>
                {updateNotes.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salva note
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
