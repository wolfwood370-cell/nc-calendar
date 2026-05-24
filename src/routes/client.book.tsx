import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2 } from "lucide-react";
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
// generateMockMeetLink was deprecated: the real Google Meet URL is now
// minted server-side by sync-calendar (conferenceData + booking_id) and
// written onto bookings.meeting_link via service-role UPDATE.
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCurrentBlock } from "@/hooks/use-current-block";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, addDays, startOfDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { EmptyStateCard } from "@/components/empty-state-card";
import { generateSlots, type Slot, type BlockedRange } from "@/lib/booking-slots";
import { BookCalendarGrid } from "@/components/book-calendar-grid";
import { BookSlotsGrid } from "@/components/book-slots-grid";
import { BookPoolPicker } from "@/components/book-pool-picker";
import { allocKey } from "@/lib/booking-allocation";
import { useBookConfirm } from "@/hooks/use-book-confirm";

export const Route = createFileRoute("/client/book")({
  component: BookFlow,
});

function BookFlow() {
  const { user } = useAuth();
  const meId = user?.id;
  const navigate = useNavigate();
  const blocksQ = useClientBlocks(meId);
  const bookingsQ = useClientBookings(meId);
  const extraCreditsQ = useClientExtraCredits(meId);

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

  // ensure_client_block_state RPC closes expired blocks past their 7-day
  // grace, and auto-creates the next one when profiles.auto_renew_blocks
  // is true. On the first load for a client whose previous block expired,
  // this hook is what physically materializes the new block in the DB.
  const currentBlockQ = useCurrentBlock(meId);
  const block =
    (blocksQ.data ?? []).find((b) => b.id === currentBlockQ.data?.currentBlockId) ??
    (blocksQ.data ?? []).find((b) => b.status === "active");
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
  // M4: key on stable primitives (id + dates) rather than the parent block
  // object's fields. block.id is the immutable handle; the dates are
  // included so a block whose dates were edited still keys to a new query.
  const coachBusyQ = useQuery({
    queryKey: [
      "coach-busy",
      coachIdForAvail,
      block?.id ?? null,
      block?.start_date ?? null,
      block?.end_date ?? null,
    ],
    enabled: !!coachIdForAvail,
    queryFn: async () => {
      const from = block ? new Date(block.start_date) : startOfDay(new Date());
      const to = block ? new Date(block.end_date) : addDays(startOfDay(new Date()), 60);
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
    // Range: from active block dates, or fallback to today + 60d (free clients with extra credits only).
    const start = block ? new Date(block.start_date) : startOfDay(new Date());
    const end = block ? new Date(block.end_date) : addDays(startOfDay(new Date()), 60);
    end.setHours(23, 59, 59, 999);
    return generateSlots(
      block ? 28 : 60,
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

  // Pools list (one entry per credit pool: block allocation OR extra credit pack).
  interface Pool {
    key: string;
    label: string;
    type: SessionType;
    eventTypeId: string | null;
    remaining: number;
    color?: string | null;
    validUntil: Date | null;
    source: "block" | "extra";
  }
  const pools = useMemo<Pool[]>(() => {
    const poolsMap = new Map<string, Pool>();
    // 1) Block allocations (fixed paths)
    if (block) {
      for (const a of block.allocations) {
        const k = `block:${allocKey(a.event_type_id, a.session_type)}`;
        const remaining = a.quantity_assigned - a.quantity_booked;
        // L6: parseISO treats a date-only string as local midnight, which
        // formats consistently across timezones ("20 maggio" everywhere) and
        // compares correctly against the calendar's midnight-anchored `day`
        // iterator at line ~823. The previous `\`${valid_until}T23:59:59\``
        // expression parsed in the browser's local TZ, shifting credit
        // expiry by up to ±12h for travelling users.
        const allocExp = a.valid_until ? parseISO(a.valid_until) : null;
        if (poolsMap.has(k)) {
          const cur = poolsMap.get(k)!;
          cur.remaining += remaining;
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
            source: "block",
          });
        }
      }
    }
    // 2) Extra credits (booster packs / free-client initial credits)
    for (const ec of extraCreditsQ.data ?? []) {
      const remaining = ec.quantity - ec.quantity_booked;
      if (remaining <= 0) continue;
      const et = customTypes.find((e) => e.id === ec.event_type_id);
      const k = `extra:${ec.event_type_id}`;
      const exp = new Date(ec.expires_at);
      if (poolsMap.has(k)) {
        const cur = poolsMap.get(k)!;
        cur.remaining += remaining;
        if (!cur.validUntil || exp > cur.validUntil) cur.validUntil = exp;
      } else {
        poolsMap.set(k, {
          key: k,
          label: et?.name ?? "Sessione Extra",
          type: (et?.base_type ?? "PT Session") as SessionType,
          eventTypeId: ec.event_type_id,
          remaining,
          color: et?.color ?? null,
          validUntil: exp,
          source: "extra",
        });
      }
    }
    return Array.from(poolsMap.values()).filter((p) => p.remaining > 0);
  }, [block, customTypes, extraCreditsQ.data]);

  // Auto-select first available pool
  useEffect(() => {
    if (!selectedPoolKey && pools[0]) setSelectedPoolKey(pools[0].key);
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

  if (blocksQ.isLoading || bookingsQ.isLoading || availQ.isLoading || extraCreditsQ.isLoading) {
    // M6: skeleton mirrors the actual booking layout to reserve space and
    // prevent the layout shift (CLS) that the previous two generic rectangles
    // caused when real content rendered.
    return (
      <div className="bg-surface min-h-screen pb-32">
        <header className="flex justify-between items-center w-full px-margin-mobile py-stack-md max-w-3xl mx-auto">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </header>
        <div className="px-margin-mobile max-w-3xl mx-auto space-y-stack-lg">
          {/* Pool selector skeleton */}
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-[24px]" />
            <Skeleton className="h-24 rounded-[24px]" />
          </div>
          {/* Calendar skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-72 w-full rounded-[24px]" />
          </div>
          {/* Time slots skeleton */}
          <div className="space-y-3">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  // No active block AND no extra credits → empty state with link to Store.
  if (!block && pools.length === 0) {
    return (
      <div className="bg-surface min-h-screen px-margin-mobile py-8 max-w-3xl mx-auto">
        <EmptyStateCard
          title="Pronto a salire di livello?"
          description="Non hai un percorso attivo né sessioni extra. Acquista un NC Add-on o un Booster per sbloccare nuove prenotazioni."
          ctaLabel="Vai allo Store"
          ctaTo="/client/store"
        />
      </div>
    );
  }

  const profile = profileQ.data;
  const meName = profile?.full_name ?? user?.email ?? "Cliente";
  const meEmail = profile?.email ?? user?.email ?? "";
  const mePhone = profile?.phone ?? null;
  const coachId = profile?.coach_id;
  const coachName = coachProfileQ.data?.full_name ?? coachProfileQ.data?.email ?? "il tuo Coach";
  const emailNotificationsEnabled = profile?.email_notifications ?? true;

  const { confirm, confirming } = useBookConfirm({
    meId,
    meName,
    meEmail,
    mePhone,
    coachId,
    coachName,
    emailNotificationsEnabled,
    selectedISO,
    selectedPoolKey,
    pools,
    block,
    customTypes,
    extraCredits: extraCreditsQ.data,
  });

  const selectedSlot = selectedISO ? (slots.find((s) => s.iso === selectedISO) ?? null) : null;
  const selectedPoolValidUntil =
    pools.find((p) => p.key === selectedPoolKey)?.validUntil ?? null;

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
        <BookPoolPicker
          pools={pools}
          selectedPoolKey={selectedPoolKey}
          onSelectPoolKey={setSelectedPoolKey}
        />

        {/* Date Selector Card */}
        <BookCalendarGrid
          calendarMonth={calendarMonth}
          onMonthChange={setCalendarMonth}
          selectedDate={selectedDate}
          onSelectDate={(day) => {
            setSelectedDate(day);
            setSelectedISO(null);
          }}
          daysWithSlots={daysWithSlots}
          todayStart={todayStart}
          selectedPoolValidUntil={selectedPoolValidUntil}
        />

        {/* Available Times */}
        <BookSlotsGrid
          selectedDate={selectedDate}
          slotsForSelectedDay={slotsForSelectedDay}
          selectedISO={selectedISO}
          onSelectISO={setSelectedISO}
        />
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
