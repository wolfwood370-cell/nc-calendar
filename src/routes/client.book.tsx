import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import { useClientBlocks, useClientBookings, useCoachAvailability, useCoachAvailabilityExceptions, useCoachEventTypes, useCoachOptimizationEnabled, type AvailabilityRow, type AvailabilityExceptionRow, type EventTypeRow } from "@/lib/queries";
import { generateMockMeetLink } from "@/components/join-video-call-button";
import { toast } from "sonner";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { supabase } from "@/integrations/supabase/client";
import { syncCalendar } from "@/lib/sync-calendar";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, isSameDay, isSameMonth, isBefore, startOfDay } from "date-fns";
import { it } from "date-fns/locale";

export const Route = createFileRoute("/client/book")({
  component: BookFlow,
});

interface Slot { iso: string; date: Date; recommended?: boolean; injected?: boolean; }

// day_of_week: 1=Lun ... 7=Dom (Date.getDay() restituisce 0=Dom..6=Sab)
function jsDowToIso(d: number): number {
  return d === 0 ? 7 : d;
}

function parseHM(t: string): { h: number; m: number } {
  const [h, m] = t.split(":");
  return { h: parseInt(h, 10), m: parseInt(m, 10) };
}

interface BlockedRange { start: number; end: number; }

/**
 * Strict collision check.
 * Collision iff: slotStart < existingEnd AND slotEnd > existingStart
 * (where ends already include duration + buffer).
 */
function collides(slotStart: number, slotEnd: number, ranges: BlockedRange[]): boolean {
  for (const r of ranges) {
    if (slotStart < r.end && slotEnd > r.start) return true;
  }
  return false;
}

function generateSlots(
  daysAhead: number,
  blockedRanges: BlockedRange[],
  availability: AvailabilityRow[],
  exceptions: AvailabilityExceptionRow[],
  candidateMinutes: number, // duration + buffer used to test collision
  rangeStart?: Date,
  rangeEnd?: Date,
  optimization?: { enabled: boolean },
): Slot[] {
  const slots: Slot[] = [];
  const now = new Date();
  const candidateMs = candidateMinutes * 60_000;
  // Pre-index exceptions by YYYY-MM-DD
  const excByDate = new Map<string, AvailabilityExceptionRow[]>();
  for (const ex of exceptions) {
    if (!excByDate.has(ex.date)) excByDate.set(ex.date, []);
    excByDate.get(ex.date)!.push(ex);
  }
  // Pre-index blocked ranges by day
  const rangesByDay = new Map<string, BlockedRange[]>();
  for (const r of blockedRanges) {
    const d = new Date(r.start);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!rangesByDay.has(k)) rangesByDay.set(k, []);
    rangesByDay.get(k)!.push(r);
  }

  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    if (rangeStart && day < new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate())) continue;
    if (rangeEnd && day > rangeEnd) break;
    const dow = jsDowToIso(day.getDay());
    const dateKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const dayExceptions = excByDate.get(dateKey) ?? [];
    if (dayExceptions.some((ex) => !ex.start_time || !ex.end_time)) continue;
    const blocks = availability.filter((a) => a.day_of_week === dow);
    if (blocks.length === 0) continue;

    const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const dayRanges = rangesByDay.get(dayKey) ?? [];

    // Build map of working windows in ms for the day.
    interface Win { start: number; end: number }
    const windows: Win[] = blocks.map((b) => {
      const s = parseHM(b.start_time);
      const e = parseHM(b.end_time);
      const ws = new Date(day); ws.setHours(s.h, s.m, 0, 0);
      const we = new Date(day); we.setHours(e.h, e.m, 0, 0);
      return { start: ws.getTime(), end: we.getTime() };
    });

    const inWindow = (ms: number, endMs: number) =>
      windows.some((w) => ms >= w.start && endMs <= w.end);

    const inException = (ms: number, endMs: number) =>
      dayExceptions.some((ex) => {
        if (!ex.start_time || !ex.end_time) return false;
        const exS = parseHM(ex.start_time);
        const exE = parseHM(ex.end_time);
        const exStart = new Date(day); exStart.setHours(exS.h, exS.m, 0, 0);
        const exEnd = new Date(day); exEnd.setHours(exE.h, exE.m, 0, 0);
        return ms < exEnd.getTime() && endMs > exStart.getTime();
      });

    const minLeadMs = 24 * 60 * 60 * 1000;
    const candidates = new Map<number, { injected: boolean }>();

    // 1) Hourly grid candidates from working windows.
    for (const w of windows) {
      const startD = new Date(w.start);
      let mm = startD.getHours() * 60 + startD.getMinutes();
      // round up to next top-of-hour if not already
      if (mm % 60 !== 0) mm = Math.ceil(mm / 60) * 60;
      const endMin = (() => {
        const e = new Date(w.end);
        return e.getHours() * 60 + e.getMinutes();
      })();
      for (; mm + candidateMinutes <= endMin; mm += 60) {
        const slot = new Date(day);
        slot.setHours(Math.floor(mm / 60), mm % 60, 0, 0);
        candidates.set(slot.getTime(), { injected: false });
      }
    }

    // 2) Anchor injection: for each existing booking on this day, inject a slot at existing_end.
    for (const r of dayRanges) {
      const startMs = r.end;
      const endMs = startMs + candidateMs;
      if (!inWindow(startMs, endMs)) continue;
      if (!candidates.has(startMs)) candidates.set(startMs, { injected: true });
    }

    // 3) Filter candidates against strict collision rules.
    const daySlots: Slot[] = [];
    for (const [startMs, meta] of candidates) {
      const endMs = startMs + candidateMs;
      if (startMs - now.getTime() < minLeadMs) continue;
      if (!inWindow(startMs, endMs)) continue;
      if (collides(startMs, endMs, blockedRanges)) continue;
      if (inException(startMs, endMs)) continue;
      daySlots.push({
        iso: new Date(startMs).toISOString(),
        date: new Date(startMs),
        injected: meta.injected,
      });
    }

    // 4) Recommended logic: anchors when no bookings, adjacent (injected) when bookings exist.
    if (optimization?.enabled && daySlots.length > 0) {
      if (dayRanges.length === 0) {
        daySlots.sort((a, b) => a.date.getTime() - b.date.getTime());
        const lastIdx = daySlots.length - 1;
        const midIdx = Math.floor(lastIdx / 2);
        [0, midIdx, lastIdx].forEach((idx) => { daySlots[idx].recommended = true; });
      } else {
        for (const s of daySlots) if (s.injected) s.recommended = true;
      }
      daySlots.sort((a, b) => {
        const ra = a.recommended ? 0 : 1;
        const rb = b.recommended ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return a.date.getTime() - b.date.getTime();
      });
    } else {
      daySlots.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    slots.push(...daySlots);
  }
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
        .select("id, full_name, email, phone, coach_id, email_notifications")
        .eq("id", meId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Single-pick state for the new Aura booking flow
  const [selectedPoolKey, setSelectedPoolKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(startOfMonth(new Date()));
  const [confirming, setConfirming] = useState(false);

  const block = (blocksQ.data ?? []).find((b) => b.status === "active");
  const coachIdForAvail = profileQ.data?.coach_id ?? null;
  const availQ = useCoachAvailability(coachIdForAvail);
  const exceptionsQ = useCoachAvailabilityExceptions(coachIdForAvail);
  const eventTypesQ = useCoachEventTypes(coachIdForAvail);
  const optimizationQ = useCoachOptimizationEnabled(coachIdForAvail);
  const coachProfileQ = useQuery({
    queryKey: ["coach-profile", coachIdForAvail],
    enabled: !!coachIdForAvail,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles").select("full_name, email").eq("id", coachIdForAvail!).maybeSingle();
      return data;
    },
  });

  // Tipologie evento personalizzate del coach (fallback alle 3 default se vuoto).
  const customTypes: EventTypeRow[] = eventTypesQ.data ?? [];

  // Durata candidata per testare collisioni nello slot generator: minimo (durata + buffer)
  // tra le tipologie configurate, default 60.
  const candidateMinutes = useMemo(() => {
    if (customTypes.length === 0) return 60;
    return Math.min(...customTypes.map((e) => (e.duration ?? 60) + (e.buffer_minutes ?? 0)));
  }, [customTypes]);

  // Busy times del coach (tutti i clienti, anonimizzato via SECURITY DEFINER).
  const coachBusyQ = useQuery({
    queryKey: ["coach-busy", coachIdForAvail, block?.start_date, block?.end_date],
    enabled: !!coachIdForAvail && !!block,
    queryFn: async () => {
      const from = new Date(block!.start_date);
      const to = new Date(block!.end_date);
      to.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.rpc("get_coach_busy", {
        p_coach_id: coachIdForAvail!,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as { scheduled_at: string; event_type_id: string | null; duration: number; buffer_minutes: number }[];
    },
  });

  // Range bloccati = [scheduled_at, scheduled_at + duration + buffer] del coach (tutti i clienti).
  const blockedRanges = useMemo(() => {
    const ranges: BlockedRange[] = [];
    for (const b of coachBusyQ.data ?? []) {
      const start = new Date(b.scheduled_at).getTime();
      const end = start + ((b.duration ?? 60) + (b.buffer_minutes ?? 0)) * 60_000;
      ranges.push({ start, end });
    }
    return ranges;
  }, [coachBusyQ.data]);

  const slots = useMemo(
    () => {
      if (!block) return [];
      const start = new Date(block.start_date);
      const end = new Date(block.end_date);
      end.setHours(23, 59, 59, 999);
      return generateSlots(
        28, blockedRanges, availQ.data ?? [], exceptionsQ.data ?? [],
        candidateMinutes,
        start, end,
        { enabled: optimizationQ.data ?? true },
      );
    },
    [block, blockedRanges, availQ.data, exceptionsQ.data, optimizationQ.data, candidateMinutes]
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

  // Chiave del pool di credito: event_type_id se presente, altrimenti session_type (legacy).
  const allocKey = (eventTypeId: string | null, type: SessionType) => eventTypeId ?? `__${type}`;

  // Credito residuo per pool (event_type_id o session_type).
  const remainingByPool: Record<string, number> = {};
  const poolLabel: Record<string, string> = {};
  for (const a of block.allocations) {
    const k = allocKey(a.event_type_id, a.session_type);
    remainingByPool[k] = (remainingByPool[k] ?? 0) + (a.quantity_assigned - a.quantity_booked);
    if (!poolLabel[k]) {
      const et = a.event_type_id ? customTypes.find((e) => e.id === a.event_type_id) : null;
      poolLabel[k] = et?.name ?? sessionLabel(a.session_type);
    }
  }
  const pickedCountsByPool = Object.values(picked).reduce<Record<string, number>>(
    (acc, p) => {
      const k = allocKey(p.eventTypeId, p.type);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const togglePick = (iso: string, value: string) => {
    setPicked((cur) => {
      const next = { ...cur };
      if (!value) { delete next[iso]; return next; }
      // value format: "<base_type>" or "<base_type>::<event_type_id>"
      const [type, eventTypeId] = value.split("::") as [SessionType, string | undefined];
      const newKey = allocKey(eventTypeId ?? null, type);
      const prev = cur[iso];
      const prevKey = prev ? allocKey(prev.eventTypeId, prev.type) : null;
      const used = (pickedCountsByPool[newKey] ?? 0) - (prevKey === newKey ? 1 : 0);
      const remaining = remainingByPool[newKey] ?? 0;
      if (used >= remaining) {
        toast.error(`Nessuna sessione di tipo ${poolLabel[newKey] ?? sessionLabel(type)} rimanente nel tuo blocco.`);
        return cur;
      }
      next[iso] = { type, eventTypeId: eventTypeId ?? null };
      return next;
    });
  };

  const totalPicked = Object.keys(picked).length;

  // Cerca un'allocation con credito disponibile, prima per event_type_id+settimana, poi qualunque.
  const findAllocationForWeek = (
    type: SessionType,
    eventTypeId: string | null,
    isoDate: string,
  ): { id: string; remaining: number } | null => {
    const slotDate = new Date(isoDate);
    const weeksFromStart = Math.floor((slotDate.getTime() - new Date(block.start_date).getTime()) / (1000 * 60 * 60 * 24 * 7));
    const wn = Math.min(4, Math.max(1, weeksFromStart + 1));
    const matchPool = (a: typeof block.allocations[number]) =>
      eventTypeId
        ? a.event_type_id === eventTypeId
        : a.event_type_id === null && a.session_type === type;
    const sameWeek = block.allocations.find(
      (a) => matchPool(a) && a.week_number === wn && a.quantity_assigned - a.quantity_booked > 0,
    );
    if (sameWeek) return { id: sameWeek.id, remaining: sameWeek.quantity_assigned - sameWeek.quantity_booked };
    const any = block.allocations.find((a) => matchPool(a) && a.quantity_assigned - a.quantity_booked > 0);
    return any ? { id: any.id, remaining: any.quantity_assigned - any.quantity_booked } : null;
  };

  const profile = profileQ.data;
  const meName = profile?.full_name ?? user?.email ?? "Cliente";
  const meEmail = profile?.email ?? user?.email ?? "";
  const mePhone = profile?.phone ?? null;
  const coachId = profile?.coach_id;
  const coachName = coachProfileQ.data?.full_name ?? coachProfileQ.data?.email ?? "il tuo Coach";
  const emailNotificationsEnabled = profile?.email_notifications ?? true;

  const confirm = async () => {
    if (!coachId) {
      toast.error("Coach non assegnato. Contatta il tuo coach.");
      return;
    }
    setConfirming(true);
    try {
      // tracker locale per non sforare quando si prenotano più slot dello stesso tipo
      const localUsed: Record<string, number> = {}; // alloc_id -> count
      let bookedCount = 0;

      for (const [iso, pick] of Object.entries(picked)) {
        const type = pick.type;
        const eventType = pick.eventTypeId
          ? customTypes.find((e) => e.id === pick.eventTypeId)
          : null;
        const displayLabel = eventType?.name ?? sessionLabel(type);
        const alloc = findAllocationForWeek(type, eventType?.id ?? null, iso);
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

        // Hard conflict check (server-side ricontrollo: nessuna sovrapposizione)
        const newDuration = eventType?.duration ?? 60;
        const newBuffer = eventType?.buffer_minutes ?? 0;
        const slotStartMs = new Date(iso).getTime();
        const slotEndMs = slotStartMs + (newDuration + newBuffer) * 60_000;
        const winStartIso = new Date(slotStartMs - 4 * 60 * 60_000).toISOString();
        const winEndIso = new Date(slotEndMs + 4 * 60 * 60_000).toISOString();
        const { data: nearby } = await supabase
          .from("bookings")
          .select("scheduled_at, event_type_id, status")
          .eq("coach_id", coachId)
          .in("status", ["scheduled", "completed"])
          .gte("scheduled_at", winStartIso)
          .lte("scheduled_at", winEndIso);
        const conflict = (nearby ?? []).some((b) => {
          const et = b.event_type_id ? customTypes.find((e) => e.id === b.event_type_id) : null;
          const dur = et?.duration ?? 60;
          const buf = et?.buffer_minutes ?? 0;
          const bStart = new Date(b.scheduled_at).getTime();
          const bEnd = bStart + (dur + buf) * 60_000;
          return slotStartMs < bEnd && slotEndMs > bStart;
        });
        if (conflict) {
          toast.error("Questo orario è stato appena occupato. Scegli un altro slot.");
          continue;
        }

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
        bookedCount += 1;

        // notifications (fire and forget)
        syncCalendar({
          action: "create", coachId, clientName: meName,
          sessionLabel: displayLabel, startISO: iso, meetingLink,
          color: eventType?.color ?? null,
        });
        void Promise.all([
          emailNotificationsEnabled
            ? sendBookingConfirmationEmail({
                to: meEmail, recipientName: meName,
                sessionLabel: displayLabel, scheduledAt: new Date(iso),
                coachName, clientName: meName,
              }).catch((e) => console.error("email failed", e))
            : Promise.resolve(),
          supabase.functions.invoke("booking-notifications", {
            body: {
              coach_id: coachId, client_name: meName, client_phone: mePhone,
              scheduled_at: iso, session_label: displayLabel, meeting_link: meetingLink,
            },
          }).catch((e) => console.error("booking-notifications failed", e)),
        ]);
        sendPush({
          profileId: meId!,
          title: "Prenotazione confermata",
          body: `${displayLabel} — ${new Date(iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}`,
          url: "/client",
        });
      }

      if (bookedCount === 0) {
        toast.warning("Nessuna sessione prenotata", { description: "Verifica i crediti residui o la disponibilità." });
      } else {
        toast.success(`${bookedCount} ${bookedCount === 1 ? "sessione prenotata" : "sessioni prenotate"}`, {
          description: emailNotificationsEnabled
            ? "Email di conferma inviata. I link videochiamata sono generati automaticamente per le sessioni online."
            : "I link videochiamata sono generati automaticamente per le sessioni online.",
        });
        qc.invalidateQueries({ queryKey: ["bookings"] });
        qc.invalidateQueries({ queryKey: ["blocks"] });
        navigate({ to: "/client" });
      }
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
        {(optimizationQ.data ?? true) && (
          <p className="text-xs text-muted-foreground mt-2">
            ✨ Scegli gli orari evidenziati come <span className="font-medium text-foreground">Consigliato</span> per aiutarci a ottimizzare il calendario!
          </p>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          {Object.keys(remainingByPool).map((k) => (
            <Badge key={k} variant="outline" className="font-normal">
              {poolLabel[k]}: <span className="ml-1 tabular-nums font-medium">{remainingByPool[k] - (pickedCountsByPool[k] ?? 0)}</span> rimanenti
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
                        className={`rounded-lg border p-3 transition ${chosen ? "border-primary bg-primary/5" : s.recommended ? "border-success/40 bg-success/5 hover:border-success/60" : "hover:border-primary/40"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display font-semibold tabular-nums">
                            {s.date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {chosen ? (() => {
                            const ev = chosen.eventTypeId
                              ? customTypes.find((e) => e.id === chosen.eventTypeId)
                              : null;
                            return (
                              <Badge style={ev ? { backgroundColor: ev.color, color: "#fff", borderColor: ev.color } : undefined}>
                                {ev?.name ?? sessionLabel(chosen.type)}
                              </Badge>
                            );
                          })() : s.recommended ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 inline-flex items-center gap-1 border"
                              style={{ backgroundColor: "rgba(51,184,100,0.10)", color: "#0B8043", borderColor: "rgba(51,184,100,0.30)" }}
                            >
                              <Sparkles className="size-2.5" /> Consigliato
                            </Badge>
                          ) : null}
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
                              customTypes.map((et) => {
                                const k = allocKey(et.id, et.base_type);
                                const remaining = (remainingByPool[k] ?? 0) - (pickedCountsByPool[k] ?? 0);
                                const isExhausted = remaining <= 0 && (chosen?.eventTypeId !== et.id);
                                return (
                                  <SelectItem key={et.id} value={`${et.base_type}::${et.id}`} disabled={isExhausted}>
                                    <span className="inline-flex items-center gap-2">
                                      <span className="size-2.5 rounded-full" style={{ backgroundColor: et.color }} />
                                      {et.name}
                                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                        · {et.duration}m
                                        {et.location_type === "online"
                                          ? <Video className="size-3" />
                                          : <MapPin className="size-3" />}
                                      </span>
                                      {isExhausted && (
                                        <span className="text-[10px] text-destructive">esauriti</span>
                                      )}
                                    </span>
                                  </SelectItem>
                                );
                              })
                            )}
                          </SelectContent>
                        </Select>
                        {customTypes.length > 0 && customTypes.every((et) => {
                          const k = allocKey(et.id, et.base_type);
                          return ((remainingByPool[k] ?? 0) - (pickedCountsByPool[k] ?? 0)) <= 0;
                        }) && !chosen && (
                          <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                            Crediti esauriti per questa tipologia. Contatta il Coach per il rinnovo.
                          </p>
                        )}
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
