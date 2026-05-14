import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import {
  useClientBlocks,
  useClientBookings,
  useClientExtraCredits,
  useCoachAvailability,
  useCoachAvailabilityExceptions,
  useCoachEventTypes,
  useCoachOptimizationEnabled,
  type AvailabilityRow,
  type AvailabilityExceptionRow,
  type EventTypeRow,
} from "@/lib/queries";
import { generateMockMeetLink } from "@/components/join-video-call-button";
import { toast } from "sonner";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { supabase } from "@/integrations/supabase/client";
import { syncCalendar } from "@/lib/sync-calendar";
import { generateGoogleCalendarLink } from "@/lib/calendar-utils";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
} from "date-fns";
import { it } from "date-fns/locale";

export const Route = createFileRoute("/client/book")({
  component: BookFlow,
});

interface Slot {
  iso: string;
  date: Date;
  recommended?: boolean;
  injected?: boolean;
}

// day_of_week: 1=Lun ... 7=Dom (Date.getDay() restituisce 0=Dom..6=Sab)
function jsDowToIso(d: number): number {
  return d === 0 ? 7 : d;
}

function parseHM(t: string): { h: number; m: number } {
  const [h, m] = t.split(":");
  return { h: parseInt(h, 10), m: parseInt(m, 10) };
}

interface BlockedRange {
  start: number;
  end: number;
}

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
    if (
      rangeStart &&
      day < new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate())
    )
      continue;
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
    interface Win {
      start: number;
      end: number;
    }
    const windows: Win[] = blocks.map((b) => {
      const s = parseHM(b.start_time);
      const e = parseHM(b.end_time);
      const ws = new Date(day);
      ws.setHours(s.h, s.m, 0, 0);
      const we = new Date(day);
      we.setHours(e.h, e.m, 0, 0);
      return { start: ws.getTime(), end: we.getTime() };
    });

    const inWindow = (ms: number, endMs: number) =>
      windows.some((w) => ms >= w.start && endMs <= w.end);

    const inException = (ms: number, endMs: number) =>
      dayExceptions.some((ex) => {
        if (!ex.start_time || !ex.end_time) return false;
        const exS = parseHM(ex.start_time);
        const exE = parseHM(ex.end_time);
        const exStart = new Date(day);
        exStart.setHours(exS.h, exS.m, 0, 0);
        const exEnd = new Date(day);
        exEnd.setHours(exE.h, exE.m, 0, 0);
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
        [0, midIdx, lastIdx].forEach((idx) => {
          daySlots[idx].recommended = true;
        });
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
        .from("profiles")
        .select("full_name, email")
        .eq("id", coachIdForAvail!)
        .maybeSingle();
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
      return (data ?? []) as {
        scheduled_at: string;
        event_type_id: string | null;
        duration: number;
        buffer_minutes: number;
      }[];
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

  const slots = useMemo(() => {
    if (!block) return [];
    const start = new Date(block.start_date);
    const end = new Date(block.end_date);
    end.setHours(23, 59, 59, 999);
    return generateSlots(
      28,
      blockedRanges,
      availQ.data ?? [],
      exceptionsQ.data ?? [],
      candidateMinutes,
      start,
      end,
      { enabled: optimizationQ.data ?? true },
    );
  }, [block, blockedRanges, availQ.data, exceptionsQ.data, optimizationQ.data, candidateMinutes]);
  const grouped = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = s.date.toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [slots]);

  // Chiave del pool di credito: event_type_id se presente, altrimenti session_type (legacy).
  const allocKey = (eventTypeId: string | null, type: SessionType) => eventTypeId ?? `__${type}`;

  // Pools list (one entry per credit pool: event_type_id or legacy session_type).
  interface Pool {
    key: string;
    label: string;
    type: SessionType;
    eventTypeId: string | null;
    remaining: number;
    color?: string | null;
    validUntil: Date | null;
  }
  const pools = useMemo<Pool[]>(() => {
    if (!block) return [];
    const poolsMap = new Map<string, Pool>();
    for (const a of block.allocations) {
      const k = allocKey(a.event_type_id, a.session_type);
      const remaining = a.quantity_assigned - a.quantity_booked;
      const allocExp = a.valid_until ? new Date(`${a.valid_until}T23:59:59`) : null;
      if (poolsMap.has(k)) {
        const cur = poolsMap.get(k)!;
        cur.remaining += remaining;
        // pool expiry = max of allocations' expiry (latest day still bookable)
        if (allocExp && (!cur.validUntil || allocExp > cur.validUntil)) cur.validUntil = allocExp;
      } else {
        const et = a.event_type_id ? customTypes.find((e) => e.id === a.event_type_id) : null;
        poolsMap.set(k, {
          key: k,
          label: et?.name ?? sessionLabel(a.session_type),
          type: a.session_type as SessionType,
          eventTypeId: a.event_type_id ?? null,
          remaining,
          color: et?.color ?? null,
          validUntil: allocExp,
        });
      }
    }
    return Array.from(poolsMap.values()).filter((p) => p.remaining > 0);
  }, [block, customTypes]);

  // Auto-select first available pool
  useEffect(() => {
    if (!selectedPoolKey && pools.length > 0) setSelectedPoolKey(pools[0].key);
  }, [selectedPoolKey, pools]);

  // ===== Aura UI helpers (must run before any early return to satisfy hooks rules) =====
  const todayStart = startOfDay(new Date());
  const daysWithSlots = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) set.add(format(s.date, "yyyy-MM-dd"));
    return set;
  }, [slots]);

  const slotsForSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, "yyyy-MM-dd");
    return slots.filter((s) => format(s.date, "yyyy-MM-dd") === key);
  }, [slots, selectedDate]);

  if (blocksQ.isLoading || bookingsQ.isLoading || availQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!block) {
    return <p className="text-sm text-muted-foreground">Nessun blocco attivo.</p>;
  }

  // Cerca un'allocation con credito disponibile, prima per event_type_id+settimana, poi qualunque.
  const findAllocationForWeek = (
    type: SessionType,
    eventTypeId: string | null,
    isoDate: string,
  ): { id: string; remaining: number } | null => {
    const slotDate = new Date(isoDate);
    const weeksFromStart = Math.floor(
      (slotDate.getTime() - new Date(block.start_date).getTime()) / (1000 * 60 * 60 * 24 * 7),
    );
    const wn = Math.min(4, Math.max(1, weeksFromStart + 1));
    const matchPool = (a: (typeof block.allocations)[number]) =>
      eventTypeId
        ? a.event_type_id === eventTypeId
        : a.event_type_id === null && a.session_type === type;
    const sameWeek = block.allocations.find(
      (a) => matchPool(a) && a.week_number === wn && a.quantity_assigned - a.quantity_booked > 0,
    );
    if (sameWeek)
      return { id: sameWeek.id, remaining: sameWeek.quantity_assigned - sameWeek.quantity_booked };
    const any = block.allocations.find(
      (a) => matchPool(a) && a.quantity_assigned - a.quantity_booked > 0,
    );
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
    if (!selectedISO || !selectedPoolKey) {
      toast.error("Seleziona data e orario.");
      return;
    }
    const pool = pools.find((p) => p.key === selectedPoolKey);
    if (!pool) {
      toast.error("Tipologia non disponibile.");
      return;
    }
    setConfirming(true);
    try {
      // tracker locale per non sforare quando si prenotano più slot dello stesso tipo
      const localUsed: Record<string, number> = {}; // alloc_id -> count
      let bookedCount = 0;
      let lastCalendarUrl: string | null = null;

      const entries: [string, { type: SessionType; eventTypeId: string | null }][] = [
        [selectedISO, { type: pool.type, eventTypeId: pool.eventTypeId }],
      ];
      for (const [iso, pick] of entries) {
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
        lastCalendarUrl = generateGoogleCalendarLink(
          { scheduled_at: iso },
          eventType
            ? {
                name: eventType.name,
                duration: eventType.duration,
                location_type: eventType.location_type,
                location_address: eventType.location_address,
              }
            : { name: displayLabel },
          meName,
        );

        // notifications (fire and forget)
        syncCalendar({
          action: "create",
          coachId,
          clientName: meName,
          sessionLabel: displayLabel,
          startISO: iso,
          meetingLink,
          color: eventType?.color ?? null,
        });
        void Promise.all([
          emailNotificationsEnabled
            ? sendBookingConfirmationEmail({
                to: meEmail,
                recipientName: meName,
                sessionLabel: displayLabel,
                scheduledAt: new Date(iso),
                coachName,
                clientName: meName,
              }).catch((e) => console.error("email failed", e))
            : Promise.resolve(),
          supabase.functions
            .invoke("booking-notifications", {
              body: {
                coach_id: coachId,
                client_name: meName,
                client_phone: mePhone,
                scheduled_at: iso,
                session_label: displayLabel,
                meeting_link: meetingLink,
              },
            })
            .catch((e) => console.error("booking-notifications failed", e)),
        ]);
        sendPush({
          profileId: meId!,
          title: "Prenotazione confermata",
          body: `${displayLabel} — ${new Date(iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}`,
          url: "/client",
        });
      }

      if (bookedCount === 0) {
        toast.warning("Nessuna sessione prenotata", {
          description: "Verifica i crediti residui o la disponibilità.",
        });
      } else {
        toast.success(
          `${bookedCount} ${bookedCount === 1 ? "sessione prenotata" : "sessioni prenotate"}`,
          {
            description: emailNotificationsEnabled
              ? "Email di conferma inviata. I link videochiamata sono generati automaticamente per le sessioni online."
              : "I link videochiamata sono generati automaticamente per le sessioni online.",
            action: lastCalendarUrl
              ? {
                  label: "Aggiungi al Calendario",
                  onClick: () => window.open(lastCalendarUrl!, "_blank", "noopener,noreferrer"),
                }
              : undefined,
          },
        );
        qc.invalidateQueries({ queryKey: ["bookings"] });
        qc.invalidateQueries({ queryKey: ["blocks"] });
        navigate({ to: "/client" });
      }
    } finally {
      setConfirming(false);
    }
  };

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) calendarDays.push(d);

  const selectedSlot = selectedISO ? (slots.find((s) => s.iso === selectedISO) ?? null) : null;

  const goPrevMonth = () => setCalendarMonth((m) => addMonths(m, -1));
  const goNextMonth = () => setCalendarMonth((m) => addMonths(m, 1));

  return (
    <div className="bg-surface min-h-screen pb-32">
      {/* Top App Bar */}
      <header className="flex justify-between items-center w-full px-margin-mobile py-stack-md max-w-3xl mx-auto bg-transparent z-40 sticky top-0 backdrop-blur-md">
        <button
          onClick={() => navigate({ to: "/client" })}
          aria-label="Indietro"
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest/50 backdrop-blur-md border border-outline-variant/30 text-primary-container active:scale-95 transition-transform"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="font-display font-bold text-2xl text-on-surface text-center absolute left-1/2 -translate-x-1/2 whitespace-nowrap">
          Nuova Prenotazione
        </h1>
        <div className="w-10 h-10" />
      </header>

      <main className="max-w-3xl mx-auto px-margin-mobile flex flex-col gap-stack-lg mt-stack-md">
        {/* Selection Type */}
        <section>
          <h2 className="font-semibold text-lg text-on-surface mb-stack-sm">
            Seleziona la tipologia
          </h2>
          {pools.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              Nessun credito residuo nel blocco attivo.
            </p>
          ) : (
            <div className="flex overflow-x-auto gap-3 pb-2 -mx-margin-mobile px-margin-mobile [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {pools.map((p) => {
                const active = p.key === selectedPoolKey;
                return (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPoolKey(p.key)}
                    className={`flex-shrink-0 rounded-full px-6 py-3 text-sm font-semibold whitespace-nowrap transition-transform active:scale-95 ${
                      active
                        ? "bg-primary-container text-on-primary"
                        : "bg-transparent border border-outline-variant text-on-surface"
                    }`}
                  >
                    {p.label}
                    <span
                      className={`ml-2 text-xs ${active ? "text-on-primary/80" : "text-on-surface-variant"}`}
                    >
                      {p.remaining}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Date Selector Card */}
        <section className="bg-surface-container-lowest rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6">
          <div className="flex justify-between items-center mb-6">
            <button
              onClick={goPrevMonth}
              className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
              aria-label="Mese precedente"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="font-display font-semibold text-xl text-on-surface capitalize">
              {format(calendarMonth, "MMMM yyyy", { locale: it })}
            </span>
            <button
              onClick={goNextMonth}
              className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
              aria-label="Mese successivo"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-2 text-center">
            {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
              <div key={i} className="text-xs font-semibold text-outline mb-2">
                {d}
              </div>
            ))}
            {calendarDays.map((day) => {
              const inMonth = isSameMonth(day, calendarMonth);
              const past = isBefore(day, todayStart);
              const dayKey = format(day, "yyyy-MM-dd");
              const hasSlots = daysWithSlots.has(dayKey);
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const selectedPool = pools.find((p) => p.key === selectedPoolKey) ?? null;
              const expired = !!(
                selectedPool?.validUntil && isBefore(selectedPool.validUntil, day)
              );
              const disabled = past || !hasSlots || expired;
              return (
                <div key={dayKey} className="flex justify-center items-center py-1">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setSelectedDate(day);
                      setSelectedISO(null);
                    }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm transition-colors ${
                      isSelected
                        ? "bg-primary-container text-on-primary font-semibold shadow-sm"
                        : !inMonth || disabled
                          ? "text-outline-variant cursor-not-allowed"
                          : "text-on-surface hover:bg-surface-container-low cursor-pointer"
                    }`}
                  >
                    {format(day, "d")}
                  </button>
                </div>
              );
            })}
          </div>
          {(() => {
            const selectedPool = pools.find((p) => p.key === selectedPoolKey) ?? null;
            if (!selectedPool?.validUntil) return null;
            return (
              <p className="mt-stack-md text-xs text-on-surface-variant text-center">
                I crediti per questa tipologia scadono il{" "}
                {format(selectedPool.validUntil, "d MMMM yyyy", { locale: it })}.
              </p>
            );
          })()}
        </section>

        {/* Available Times */}
        <section>
          <h3 className="font-semibold text-lg text-on-surface mb-stack-md">
            {selectedDate
              ? `Orari disponibili per il ${format(selectedDate, "d MMMM", { locale: it })}`
              : "Seleziona una data"}
          </h3>
          {selectedDate && slotsForSelectedDay.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              Nessuno slot disponibile in questa data.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {slotsForSelectedDay.map((s) => {
                const isSelected = s.iso === selectedISO;
                const recommended = !!s.recommended;
                const button = (
                  <button
                    type="button"
                    onClick={() => setSelectedISO(s.iso)}
                    className={`w-full rounded-full py-3 text-sm font-semibold tabular-nums transition-colors ${
                      isSelected
                        ? "bg-primary-container text-on-primary border border-primary-container shadow-sm"
                        : recommended
                          ? "bg-on-primary-container text-on-primary-fixed border border-primary-container shadow-sm"
                          : "bg-surface-container-lowest border border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                    }`}
                  >
                    {format(s.date, "HH:mm")}
                  </button>
                );
                if (recommended) {
                  return (
                    <div key={s.iso} className="relative flex flex-col items-center">
                      <span
                        className="absolute -top-3 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase z-10 shadow-sm border border-surface-container-lowest"
                        style={{ backgroundColor: "#3b6284", color: "#ffffff" }}
                      >
                        Consigliato
                      </span>
                      {button}
                    </div>
                  );
                }
                return <div key={s.iso}>{button}</div>;
              })}
            </div>
          )}
        </section>
      </main>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-[88px] md:bottom-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-t border-white/20 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-margin-mobile py-4 pb-4 md:pb-8 flex justify-between items-center md:px-margin-desktop">
        <div className="flex flex-col">
          <span className="text-sm text-outline">Selezionato:</span>
          <span className="font-display font-semibold text-xl text-primary-container">
            {selectedSlot
              ? `${format(selectedSlot.date, "d MMM", { locale: it })}, ${format(selectedSlot.date, "HH:mm")}`
              : "—"}
          </span>
        </div>
        <button
          onClick={confirm}
          disabled={!selectedISO || !selectedPoolKey || confirming}
          className="bg-primary-container text-on-primary rounded-full px-8 py-4 text-sm font-semibold shadow-md active:scale-95 transition-transform hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {confirming && <Loader2 className="size-4 animate-spin" />}
          Conferma
        </button>
      </div>
    </div>
  );
}
