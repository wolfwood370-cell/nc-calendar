import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Info } from "lucide-react";
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

// Deep-link search params per la pagina prenotazione.
// `eventType` (UUID di event_types.id) viene passato dal client dashboard
// quando il cliente clicca "Prenota" su una specifica tipologia di sessione
// del breakdown. Il BookPoolPicker pre-seleziona automaticamente il pool
// corrispondente al primo mount (vedi useEffect più sotto).
// Validator type-safe: zod-like inline, fallback graceful se param mancante
// o stringa non-UUID (ignorato senza errori). N3: enforce UUID v4 shape per
// evitare che valori arbitrari entrino in query/lookup downstream.
const BOOK_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const Route = createFileRoute("/client/book")({
  component: BookFlow,
  validateSearch: (search: Record<string, unknown>): { eventType?: string } => {
    const v = search.eventType;
    return typeof v === "string" && BOOK_UUID_RE.test(v) ? { eventType: v } : {};
  },
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
        .select("id, full_name, email, phone, coach_id, email_notifications, path_type")
        .eq("id", meId!)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
        coach_id: string | null;
        email_notifications: boolean;
        path_type: string | null;
      } | null;
    },
  });
  // path_type discrimina la logica del block resolver: "recurring" si
  // affida all'RPC ensure_client_block_state (gestisce grace + auto-renew),
  // "fixed" usa risoluzione time-based perché l'RPC su fixed può ritornare
  // un currentBlockId arbitrario tra quelli active (Marco Golinelli pesca
  // Blocco 6 di Agosto invece di Blocco 3 di Maggio).
  const isRecurring = (profileQ.data?.path_type ?? "fixed") === "recurring";

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
  // Block resolver gemello di client.index.tsx:
  //   - recurring → trust the RPC (gestisce grace + auto-renewal)
  //   - fixed → time-based perché l'RPC su path fixed può ritornare un
  //     currentBlockId arbitrario tra quelli con status="active" (per
  //     Marco Golinelli pescava Blocco 6 di Agosto invece di Blocco 3
  //     di Maggio, saturando rangeStart fuori dall'orizzonte di 28 giorni
  //     e generando 0 slot).
  const block = useMemo(() => {
    const all = blocksQ.data ?? [];
    if (all.length === 0) return null;
    if (isRecurring) {
      const fromRpc = all.find((b) => b.id === currentBlockQ.data?.currentBlockId);
      if (fromRpc) return fromRpc;
    }
    const sorted = [...all].sort((a, b) => a.sequence_order - b.sequence_order);
    const now = Date.now();
    const inside = sorted.find((b) => {
      const start = new Date(b.start_date).getTime();
      const end = new Date(b.end_date).getTime() + 24 * 60 * 60 * 1000;
      return now >= start && now <= end;
    });
    if (inside) return inside;
    const futureStart = sorted.find((b) => new Date(b.start_date).getTime() > now);
    return futureStart ?? sorted[sorted.length - 1] ?? null;
  }, [isRecurring, blocksQ.data, currentBlockQ.data]);
  const coachIdForAvail = profileQ.data?.coach_id ?? null;
  const availQ = useCoachAvailability(coachIdForAvail);
  const exceptionsQ = useCoachAvailabilityExceptions(coachIdForAvail);
  const eventTypesQ = useCoachEventTypes(coachIdForAvail);
  const optimizationQ = useCoachOptimizationEnabled(coachIdForAvail);
  const coachProfileQ = useQuery({
    queryKey: ["coach-profile", coachIdForAvail],
    enabled: !!coachIdForAvail,
    queryFn: async () => {
      // MED-B3: narrowing esplicito invece di `coachIdForAvail!`. `enabled`
      // previene già la chiamata quando è null, ma il guard rende il tipo
      // safe senza non-null assertion.
      if (!coachIdForAvail) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", coachIdForAvail)
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
      // MED-B3: stesso pattern del profilo coach sopra — narrowing
      // esplicito invece di `coachIdForAvail!`.
      if (!coachIdForAvail) return [];
      const today = startOfDay(new Date());
      // Finestra fissa: da max(oggi, inizio blocco) a oggi+14gg SEMPRE
      // (settimana corrente + 2 successive), così le busy ranges del coach
      // coprono tutti gli slot visibili.
      const from = block
        ? new Date(Math.max(today.getTime(), new Date(block.start_date).getTime()))
        : today;
      const to = addDays(today, 14);
      to.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.rpc("get_coach_busy", {
        p_coach_id: coachIdForAvail,
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

  // Finestra di prenotazione SEMPRE [max(oggi, inizio blocco), oggi+14gg]
  // = settimana corrente + 2 successive. Il backend
  // (validate_booking_block_allocation) accetta finché esiste un'allocation
  // con valid_until >= data della sessione; i giorni senza credito danno
  // errore al click (gestito in use-book-confirm), come nel flusso di create
  // esistente. Niente più logica isLastWeek.
  const slots = useMemo(() => {
    const today = startOfDay(new Date());
    const start = block
      ? new Date(Math.max(today.getTime(), new Date(block.start_date).getTime()))
      : today;
    const end = addDays(today, 14);
    end.setHours(23, 59, 59, 999);
    return generateSlots(
      block ? 15 : 60, // oggi..oggi+14 = 15 giorni
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

  // Deep-link: il client dashboard può navigare qui con ?eventType=<uuid>
  // per pre-selezionare il pool corrispondente alla tipologia cliccata
  // ("Prenota" su Sessione PT → preseleziona pool PT). Se il param manca o
  // non matcha alcun pool disponibile (es. tipologia esaurita), fallback
  // al primo pool con residuo > 0 (comportamento legacy).
  const deepLinkEventType = Route.useSearch({ select: (s) => s.eventType });
  // I pool si popolano in più fasi (blocco via RPC async + crediti extra). Il
  // fallback a pools[0] deve scattare SOLO quando questi dati sono "settled",
  // altrimenti bloccherebbe la selezione sul primo pool prima che arrivi quello
  // della tipologia deep-linkata (bug "PT prenota consulenza").
  const poolsSettled =
    !blocksQ.isLoading && !extraCreditsQ.isLoading && !currentBlockQ.isLoading;
  useEffect(() => {
    if (selectedPoolKey) return;
    if (pools.length === 0) return;
    if (deepLinkEventType) {
      const match = pools.find((p) => p.eventTypeId === deepLinkEventType);
      if (match) {
        setSelectedPoolKey(match.key);
        return;
      }
      // Deep-link specificato ma il suo pool non è (ancora) tra i pool. Se i
      // dati non sono ancora settled -> ASPETTA (l'effetto ri-parte quando
      // `pools` cambia e seleziona la tipologia giusta appena compare). Se sono
      // settled e il pool non esiste (es. il cliente NON ha crediti di quella
      // tipologia) -> ripieghiamo sul primo pool disponibile, così "Conferma"
      // resta utilizzabile invece di restare bloccato senza selezione.
      if (!poolsSettled) return;
    }
    const first = pools[0];
    if (first) setSelectedPoolKey(first.key);
  }, [selectedPoolKey, pools, deepLinkEventType, poolsSettled]);

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

  // Auto-navigate calendar al primo mese con slot disponibili. Una-tantum,
  // così se l'utente naviga manualmente non viene riportato indietro.
  // Necessario quando il blocco corrente parte in un mese futuro (es. il
  // mese di oggi non ha alcuno slot): senza questo, il calendario mostrerebbe
  // Maggio tutto grigio e l'utente non capirebbe che deve cliccare ">".
  const [hasInitedCalendar, setHasInitedCalendar] = useState(false);
  useEffect(() => {
    if (hasInitedCalendar) return;
    const first = slots[0];
    if (!first) return;
    let earliest = first.date;
    for (const s of slots) if (s.date < earliest) earliest = s.date;
    const firstMonth = startOfMonth(earliest);
    if (firstMonth.getTime() > calendarMonth.getTime()) {
      setCalendarMonth(firstMonth);
    }
    setHasInitedCalendar(true);
  }, [slots, hasInitedCalendar, calendarMonth]);

  // ===== Derivazioni profile + useBookConfirm DEVONO stare prima degli
  // early-return per non violare le rules of hooks (React error #310).
  // Durante isLoading profileQ.data è undefined ma i fallback ?? sono
  // safe; useBookConfirm gestisce internamente meId/coachId undefined. ====
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
  const selectedPool = pools.find((p) => p.key === selectedPoolKey) ?? null;
  const selectedEventType = selectedPool?.eventTypeId
    ? customTypes.find((e) => e.id === selectedPool.eventTypeId) ?? null
    : null;
  const poolBlocked = selectedEventType ? selectedEventType.client_bookable === false : false;
  const poolBlockedMessage =
    selectedEventType?.unavailable_message?.trim() ||
    "Per prenotare questa sessione è necessario passare in reception.";
  // Scadenza pool corrente, usata sia per filtrare i giorni del calendario
  // sia per il messaggio testuale:
  // - source="block"  → limite più stringente = fine del blocco corrente
  //                     (il valid_until delle allocations include 2-3 mesi
  //                     di grace dopo la fine blocco, ma il cliente DEVE
  //                     prenotare le sessioni dentro la finestra del blocco)
  // - source="extra"  → scadenza del pacchetto stesso (booster con orizzonte
  //                     più lungo, indipendente dal blocco)
  const selectedPoolValidUntil = useMemo(() => {
    if (!selectedPool) return null;
    if (selectedPool.source === "block" && block) {
      // Limite cliccabile del calendario = oggi+14 SECCO (settimana corrente
      // + 2). NIENTE cap sul valid_until del blocco corrente: altrimenti i
      // giorni coperti da un'altra allocation (blocco successivo / grace)
      // verrebbero grigiati. Il backend rifiuta i giorni realmente senza
      // credito; il fallback no-slots gestisce il caso.
      const today = startOfDay(new Date());
      const lookaheadEnd = addDays(today, 14);
      lookaheadEnd.setHours(23, 59, 59, 999);
      return lookaheadEnd;
    }
    return selectedPool.validUntil;
  }, [selectedPool, block]);

  // Data di inizio del blocco successivo (se esiste): la mostriamo sotto il
  // calendario per spiegare quando si "apriranno" le prossime prenotazioni,
  // così il cliente capisce che il limite temporale visibile non è un bug
  // ma il design del path fixed (1 blocco alla volta).
  const nextBlockStartDate = useMemo(() => {
    if (!block) return null;
    const all = blocksQ.data ?? [];
    const next = all.find((b) => b.sequence_order === block.sequence_order + 1);
    return next ? new Date(next.start_date) : null;
  }, [block, blocksQ.data]);

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
          selectedPoolSource={selectedPool?.source ?? null}
          nextBlockStartDate={nextBlockStartDate}
        />

        {/* No-slots fallback DIAGNOSTICO: stile aura, info-card pulita.
            Identifica la causa specifica per cui slots è vuoto. */}
        {selectedPoolKey && slots.length === 0 && (
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-[24px] px-5 py-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
            <div className="flex items-start gap-3">
              <div className="size-9 rounded-full bg-aura-primary/10 flex items-center justify-center shrink-0">
                <Info className="size-4 text-aura-primary" aria-hidden />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <p className="text-sm font-semibold text-on-surface">
                  Nessuno slot disponibile per questa tipologia
                </p>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {!coachId
                    ? "Non hai ancora un coach assegnato. Contatta il supporto."
                    : (eventTypesQ.data ?? []).length === 0
                      ? `${coachName} non ha configurato le tipologie di sessione.`
                      : (availQ.data ?? []).length === 0
                        ? `${coachName} non ha configurato gli orari di disponibilità settimanali.`
                        : block && new Date(block.end_date).getTime() < Date.now()
                          ? "Il blocco corrente è terminato. Contatta il coach per rinnovare."
                          : `Tutti gli slot del blocco sono già occupati o esclusi. Contatta ${coachName}.`}
                </p>
              </div>
            </div>
            <details className="mt-3 pl-12 text-[11px] text-on-surface-variant">
              <summary className="cursor-pointer font-semibold select-none hover:text-on-surface transition-colors">
                Dettagli tecnici
              </summary>
              <ul className="mt-2 space-y-1 list-disc list-inside tabular-nums">
                <li>Fasce disponibilità coach: {(availQ.data ?? []).length}</li>
                <li>Eccezioni disponibilità: {(exceptionsQ.data ?? []).length}</li>
                <li>Tipologie evento: {(eventTypesQ.data ?? []).length}</li>
                <li>Eventi che bloccano slot (coach busy): {(coachBusyQ.data ?? []).length}</li>
                <li>Durata minima testata: {candidateMinutes} min</li>
                {block && (
                  <>
                    <li>Blocco selezionato: #{block.sequence_order}</li>
                    <li>Inizio blocco: {block.start_date}</li>
                    <li>Fine blocco: {block.end_date}</li>
                  </>
                )}
              </ul>
            </details>
          </div>
        )}

        {/* Available Times */}
        <BookSlotsGrid
          selectedDate={selectedDate}
          slotsForSelectedDay={slotsForSelectedDay}
          selectedISO={selectedISO}
          onSelectISO={setSelectedISO}
        />
      </main>

      {/* Bottom Action Bar — MED-E1 (audit 2026-05-26): mobile bottom anchor
          rispetta la bottom nav (88px) + l'eventuale safe-area-inset-bottom
          dei dispositivi con notch (iPhone X+). Senza l'inset, su iPhone
          notched la barra si sovrapponeva alla home indicator nascondendo
          parzialmente il bottone Conferma. Desktop (md+) resta ancorato a 0
          perché non c'è bottom nav. */}
      <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-t border-white/20 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] px-margin-mobile py-4 pb-4 md:pb-8 flex justify-between items-center md:px-margin-desktop">
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
