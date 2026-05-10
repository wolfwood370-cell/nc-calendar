import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ChevronLeft, Check, Loader2, Video, MapPin } from "lucide-react";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import { useClientBlocks, useClientBookings, useCoachAvailability, useCoachAvailabilityExceptions, useCoachEventTypes, type AvailabilityRow, type AvailabilityExceptionRow, type EventTypeRow, type BookingRow } from "@/lib/queries";
import { generateMockMeetLink } from "@/components/join-video-call-button";
import { toast } from "sonner";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { supabase } from "@/integrations/supabase/client";
import { syncCalendar } from "@/lib/sync-calendar";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/client/book")({
  component: BookFlow,
});

interface Slot { iso: string; date: Date; }

// day_of_week: 1=Lun ... 7=Dom (Date.getDay() restituisce 0=Dom..6=Sab)
function jsDowToIso(d: number): number {
  return d === 0 ? 7 : d;
}

function parseHM(t: string): { h: number; m: number } {
  const [h, m] = t.split(":");
  return { h: parseInt(h, 10), m: parseInt(m, 10) };
}

interface BlockedRange { start: number; end: number; }

function generateSlots(
  daysAhead: number,
  blockedRanges: BlockedRange[],
  availability: AvailabilityRow[],
  exceptions: AvailabilityExceptionRow[],
): Slot[] {
  const slots: Slot[] = [];
  const now = new Date();
  // Pre-index exceptions by YYYY-MM-DD
  const excByDate = new Map<string, AvailabilityExceptionRow[]>();
  for (const ex of exceptions) {
    if (!excByDate.has(ex.date)) excByDate.set(ex.date, []);
    excByDate.get(ex.date)!.push(ex);
  }
  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const dow = jsDowToIso(day.getDay());
    const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const dayExceptions = excByDate.get(dateKey) ?? [];
    // Se esiste un'eccezione full-day (start_time/end_time entrambi null), salta tutto il giorno
    if (dayExceptions.some((ex) => !ex.start_time || !ex.end_time)) continue;
    const blocks = availability.filter((a) => a.day_of_week === dow);
    for (const b of blocks) {
      const s = parseHM(b.start_time);
      const e = parseHM(b.end_time);
      const startMin = s.h * 60 + s.m;
      const endMin = e.h * 60 + e.m;
      for (let mm = startMin; mm + 60 <= endMin; mm += 60) {
        const slot = new Date(day);
        slot.setHours(Math.floor(mm / 60), mm % 60, 0, 0);
        if (slot.getTime() - now.getTime() < 24 * 60 * 60 * 1000) continue;
        const slotStart = slot.getTime();
        const slotEnd = slotStart + 60 * 60 * 1000;
        // blocca lo slot se interseca un range già occupato (durata + buffer)
        const overlaps = blockedRanges.some((r) => slotStart < r.end && slotEnd > r.start);
        if (overlaps) continue;
        // blocca lo slot se interseca un'eccezione parziale del giorno
        const inException = dayExceptions.some((ex) => {
          if (!ex.start_time || !ex.end_time) return false;
          const exS = parseHM(ex.start_time);
          const exE = parseHM(ex.end_time);
          const exStart = new Date(day);
          exStart.setHours(exS.h, exS.m, 0, 0);
          const exEnd = new Date(day);
          exEnd.setHours(exE.h, exE.m, 0, 0);
          return slotStart < exEnd.getTime() && slotEnd > exStart.getTime();
        });
        if (inException) continue;
        slots.push({ iso: slot.toISOString(), date: slot });
      }
    }
  }
  slots.sort((a, b) => a.date.getTime() - b.date.getTime());
  return slots;
}

function BookFlow() {
  const { user } = useAuth();
  const meId = user?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const blocksQ = useClientBlocks(meId);
  const bookingsQ = useClientBookings(meId);

  const profileQ = useQuery({
    queryKey: ["profile", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, coach_id")
        .eq("id", meId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  interface Pick { type: SessionType; eventTypeId: string | null; }
  const [picked, setPicked] = useState<Record<string, Pick>>({});
  const [confirming, setConfirming] = useState(false);

  const block = (blocksQ.data ?? []).find((b) => b.status === "active");
  const coachIdForAvail = profileQ.data?.coach_id ?? null;
  const availQ = useCoachAvailability(coachIdForAvail);
  const exceptionsQ = useCoachAvailabilityExceptions(coachIdForAvail);
  const eventTypesQ = useCoachEventTypes(coachIdForAvail);

  // Tipologie evento personalizzate del coach (fallback alle 3 default se vuoto).
  const customTypes: EventTypeRow[] = eventTypesQ.data ?? [];

  // Range bloccati = [scheduled_at, scheduled_at + duration + buffer] della tipologia evento.
  const blockedRanges = useMemo(() => {
    const ranges: BlockedRange[] = [];
    const list = (bookingsQ.data ?? []) as BookingRow[];
    for (const b of list) {
      if (b.status !== "scheduled" && b.status !== "completed") continue;
      const et = customTypes.find((e) => e.id === b.event_type_id);
      const duration = et?.duration ?? 60;
      const buffer = et?.buffer_minutes ?? 0;
      const start = new Date(b.scheduled_at).getTime();
      const end = start + (duration + buffer) * 60 * 1000;
      ranges.push({ start, end });
    }
    return ranges;
  }, [bookingsQ.data, customTypes]);

  const slots = useMemo(
    () => generateSlots(28, blockedRanges, availQ.data ?? [], exceptionsQ.data ?? []),
    [blockedRanges, availQ.data, exceptionsQ.data]
  );
  const grouped = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = s.date.toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [slots]);

  if (blocksQ.isLoading || bookingsQ.isLoading || availQ.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (!block) {
    return <p className="text-sm text-muted-foreground">Nessun blocco attivo.</p>;
  }

  const remainingByType: Record<SessionType, number> = { "PT Session": 0, BIA: 0, "Functional Test": 0 };
  for (const a of block.allocations) {
    remainingByType[a.session_type] += a.quantity_assigned - a.quantity_booked;
  }
  const pickedCounts = Object.values(picked).reduce<Record<SessionType, number>>(
    (acc, p) => ({ ...acc, [p.type]: (acc[p.type] ?? 0) + 1 }),
    { "PT Session": 0, BIA: 0, "Functional Test": 0 }
  );

  const togglePick = (iso: string, value: string) => {
    setPicked((cur) => {
      const next = { ...cur };
      if (!value) { delete next[iso]; return next; }
      // value format: "<base_type>" or "<base_type>::<event_type_id>"
      const [type, eventTypeId] = value.split("::") as [SessionType, string | undefined];
      const used = pickedCounts[type] - (cur[iso]?.type === type ? 1 : 0);
      if (used >= remainingByType[type]) {
        toast.error(`Nessuna sessione di tipo ${sessionLabel(type)} rimanente nel tuo blocco.`);
        return cur;
      }
      next[iso] = { type, eventTypeId: eventTypeId ?? null };
      return next;
    });
  };

  const totalPicked = Object.keys(picked).length;

  // Per ogni tipo, alloca al settore della settimana corrispondente con credito disponibile.
  const findAllocationForWeek = (type: SessionType, isoDate: string): { id: string; remaining: number } | null => {
    const slotDate = new Date(isoDate);
    const weeksFromStart = Math.floor((slotDate.getTime() - new Date(block.start_date).getTime()) / (1000 * 60 * 60 * 24 * 7));
    const wn = Math.min(4, Math.max(1, weeksFromStart + 1));
    const a = block.allocations.find(
      (x) => x.session_type === type && x.week_number === wn && x.quantity_assigned - x.quantity_booked > 0
    );
    if (a) return { id: a.id, remaining: a.quantity_assigned - a.quantity_booked };
    // fallback: qualsiasi settimana con credito
    const any = block.allocations.find((x) => x.session_type === type && x.quantity_assigned - x.quantity_booked > 0);
    return any ? { id: any.id, remaining: any.quantity_assigned - any.quantity_booked } : null;
  };

  const profile = profileQ.data;
  const meName = profile?.full_name ?? user?.email ?? "Cliente";
  const meEmail = profile?.email ?? user?.email ?? "";
  const mePhone = profile?.phone ?? null;
  const coachId = profile?.coach_id;

  const confirm = async () => {
    if (!coachId) {
      toast.error("Coach non assegnato. Contatta il tuo coach.");
      return;
    }
    setConfirming(true);
    try {
      // tracker locale per non sforare quando si prenotano più slot dello stesso tipo
      const localUsed: Record<string, number> = {}; // alloc_id -> count

      for (const [iso, pick] of Object.entries(picked)) {
        const type = pick.type;
        const eventType = pick.eventTypeId
          ? customTypes.find((e) => e.id === pick.eventTypeId)
          : null;
        const displayLabel = eventType?.name ?? sessionLabel(type);
        const alloc = findAllocationForWeek(type, iso);
        if (!alloc) {
          toast.error(`Credito esaurito per ${displayLabel}.`);
          continue;
        }
        const used = localUsed[alloc.id] ?? 0;
        if (used >= alloc.remaining) {
          toast.error(`Credito esaurito per ${displayLabel} questa settimana.`);
          continue;
        }
        const isOnline = eventType?.location_type === "online";
        const meetingLink = isOnline ? generateMockMeetLink() : null;

        // INSERT booking
        const { error: bErr } = await supabase.from("bookings").insert({
          client_id: meId!,
          coach_id: coachId,
          block_id: block.id,
          session_type: type,
          event_type_id: eventType?.id ?? null,
          scheduled_at: iso,
          status: "scheduled",
          meeting_link: meetingLink,
        });
        if (bErr) {
          toast.error("Errore prenotazione", { description: bErr.message });
          continue;
        }

        // increment quantity_booked sull'allocation
        const { data: cur } = await supabase
          .from("block_allocations")
          .select("quantity_booked")
          .eq("id", alloc.id)
          .maybeSingle();
        if (cur) {
          await supabase
            .from("block_allocations")
            .update({ quantity_booked: cur.quantity_booked + 1 })
            .eq("id", alloc.id);
        }
        localUsed[alloc.id] = used + 1;

        // notifications (fire and forget)
        syncCalendar({
          action: "create", coachId, clientName: meName,
          sessionLabel: displayLabel, startISO: iso, meetingLink,
          color: eventType?.color ?? null,
        });
        void Promise.all([
          sendBookingConfirmationEmail({
            to: meEmail, recipientName: meName,
            sessionLabel: displayLabel, scheduledAt: new Date(iso),
            coachName: "Coach", clientName: meName,
          }).catch((e) => console.error("email failed", e)),
          supabase.functions.invoke("booking-notifications", {
            body: {
              coach_id: coachId, client_name: meName, client_phone: mePhone,
              scheduled_at: iso, session_label: displayLabel, meeting_link: meetingLink,
            },
          }).catch((e) => console.error("booking-notifications failed", e)),
        ]);
      }

      toast.success(`${totalPicked} ${totalPicked === 1 ? "sessione prenotata" : "sessioni prenotate"}`, {
        description: "Email di conferma inviata. I link videochiamata sono generati automaticamente per le sessioni online.",
      });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      navigate({ to: "/client" });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/client" })}>
          <ChevronLeft className="size-4" /> Indietro
        </Button>
      </div>

      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Prenota il tuo blocco</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scegli gli slot e assegna un tipo di sessione. Le prenotazioni entro 24 ore sono disabilitate.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          {(Object.keys(remainingByType) as SessionType[]).map((t) => (
            <Badge key={t} variant="outline" className="font-normal">
              {sessionLabel(t)}: <span className="ml-1 tabular-nums font-medium">{remainingByType[t] - pickedCounts[t]}</span> rimanenti
            </Badge>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <Button onClick={confirm} disabled={totalPicked === 0 || confirming}>
              {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Conferma {totalPicked > 0 && `(${totalPicked})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {grouped.size === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {(availQ.data ?? []).length === 0
                ? "Il tuo coach non ha ancora configurato la sua disponibilità. Contattalo per maggiori informazioni."
                : "Nessuna disponibilità nei prossimi giorni. Tutti gli slot sono già prenotati."}
            </CardContent>
          </Card>
        ) : (
          [...grouped.entries()].slice(0, 14).map(([day, daySlots]) => (
            <Card key={day}>
              <CardHeader>
                <CardTitle className="text-base">
                  {new Date(day).toLocaleDateString("it-IT", { weekday: "long", month: "long", day: "numeric" })}
                </CardTitle>
                <CardDescription>
                  {daySlots.length === 0
                    ? "Nessuna disponibilità in questa data"
                    : `${daySlots.length} slot disponibili`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {daySlots.map((s) => {
                    const chosen = picked[s.iso];
                    return (
                      <div
                        key={s.iso}
                        className={`rounded-lg border p-3 transition ${chosen ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-display font-semibold tabular-nums">
                            {s.date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {chosen && (() => {
                            const ev = chosen.eventTypeId
                              ? customTypes.find((e) => e.id === chosen.eventTypeId)
                              : null;
                            return (
                              <Badge style={ev ? { backgroundColor: ev.color, color: "#fff", borderColor: ev.color } : undefined}>
                                {ev?.name ?? sessionLabel(chosen.type)}
                              </Badge>
                            );
                          })()}
                        </div>
                        <Select
                          value={chosen ? (chosen.eventTypeId ? `${chosen.type}::${chosen.eventTypeId}` : chosen.type) : ""}
                          onValueChange={(v) => togglePick(s.iso, v)}
                        >
                          <SelectTrigger className="mt-2 h-8 text-xs">
                            <SelectValue placeholder="Aggiungi sessione…" />
                          </SelectTrigger>
                          <SelectContent>
                            {customTypes.length === 0 ? (
                              <>
                                <SelectItem value="PT Session">Sessione PT</SelectItem>
                                <SelectItem value="BIA">BIA</SelectItem>
                                <SelectItem value="Functional Test">Test Funzionale</SelectItem>
                              </>
                            ) : (
                              customTypes.map((et) => (
                                <SelectItem key={et.id} value={`${et.base_type}::${et.id}`}>
                                  <span className="inline-flex items-center gap-2">
                                    <span className="size-2.5 rounded-full" style={{ backgroundColor: et.color }} />
                                    {et.name}
                                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                      · {et.duration}m
                                      {et.location_type === "online"
                                        ? <Video className="size-3" />
                                        : <MapPin className="size-3" />}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {chosen && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-7 text-xs w-full"
                            onClick={() => togglePick(s.iso, "")}
                          >
                            Rimuovi
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
