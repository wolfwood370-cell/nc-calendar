import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Plus, Check, CheckCircle2, CalendarCheck, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  useClientBlocks,
  useClientBookings,
  useCoachEventTypes,
  useClientExtraCredits,
} from "@/lib/queries";
import { useCurrentBlock } from "@/hooks/use-current-block";
import { sessionLabel } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { AuraCardSkeleton, AuraLineSkeleton } from "@/components/ui/aura-skeleton";
import { EmptyStateCard } from "@/components/empty-state-card";
import { ClientLiveBookingCard } from "@/components/client-live-booking-card";
import { ClientSessionTimeline } from "@/components/client-session-timeline";
import {
  ClientSessionsBreakdown,
  type SessionTypeBreakdownRow,
} from "@/components/client-sessions-breakdown";

export const Route = createFileRoute("/client/")({
  component: ClientHome,
});

function ClientHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const meId = user?.id;

  const profileQ = useQuery({
    queryKey: ["profile", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, coach_id, path_type, auto_renew_blocks")
        .eq("id", meId!)
        .maybeSingle();
      return data;
    },
  });

  const fullName = profileQ.data?.full_name ?? user?.email ?? "Cliente";
  const firstName = fullName.split(" ")[0] ?? fullName;
  const coachId = profileQ.data?.coach_id ?? null;
  // path_type discriminates the counter semantics: "recurring" → only the
  // current 4-week block is counted (resets every block); "fixed" (or
  // anything else) → aggregate across the whole path (e.g. 4/24 progress
  // toward a fixed-term goal).
  const isRecurring = (profileQ.data?.path_type ?? "fixed") === "recurring";

  const blocksQ = useClientBlocks(meId);
  const bookingsQ = useClientBookings(meId);
  const eventTypesQ = useCoachEventTypes(coachId);
  const extraCreditsQ = useClientExtraCredits(meId);
  // For recurring clients only: this RPC closes expired blocks past their
  // grace and auto-creates the next one when auto_renew_blocks=true. The
  // hook is called unconditionally for shape stability; the result is
  // simply ignored when isRecurring=false.
  const currentBlockQ = useCurrentBlock(meId);

  const currentBlock = useMemo(() => {
    if (!isRecurring) return null;
    const id = currentBlockQ.data?.currentBlockId ?? null;
    if (!id) return null;
    return (blocksQ.data ?? []).find((b) => b.id === id) ?? null;
  }, [isRecurring, currentBlockQ.data, blocksQ.data]);

  // Block "corrente" resolution per il rendering hero:
  // - Recurring → arriva dall'RPC `useCurrentBlock` (state-aware)
  // - Fixed → cerca il blocco la cui finestra [start_date, end_date] contiene oggi;
  //   fallback al primo non ancora terminato; ultimo fallback = blocco con
  //   sequence_order minore (path appena iniziato)
  //
  // MED-C3 (audit 2026-05-26): il useMemo non lista `Date.now()` nei deps
  // per scelta — la data corrente è usata SOLO come discriminante per
  // categorizzare "passato/attuale/futuro", non come valore renderizzato.
  // Il risultato cambia significativamente solo a midnight cross. React
  // Query rifresca `blocksQ.data` periodicamente, garantendo che il
  // useMemo recompute a ogni refetch con il `Date.now()` aggiornato.
  // Pattern accettato per il caso "data-as-condition", da NON replicare
  // dove il timestamp finisce direttamente in props/render output.
  const resolvedCurrentBlock = useMemo(() => {
    if (isRecurring) return currentBlock;
    const all = blocksQ.data ?? [];
    if (all.length === 0) return null;
    const sorted = [...all].sort((a, b) => a.sequence_order - b.sequence_order);
    const now = Date.now();
    const inside = sorted.find((b) => {
      const start = new Date(b.start_date).getTime();
      const end = new Date(b.end_date).getTime() + 24 * 60 * 60 * 1000;
      return now >= start && now <= end;
    });
    if (inside) return inside;
    // Path già terminato → ultimo blocco. Path non ancora iniziato → primo.
    const futureStart = sorted.find((b) => new Date(b.start_date).getTime() > now);
    return futureStart ?? sorted[sorted.length - 1] ?? null;
  }, [isRecurring, currentBlock, blocksQ.data]);

  // Stats intero percorso (cumulativo dall'inizio). Total include:
  //   - allocations di tutti i blocchi non-deleted
  //   - extra credits acquistati (booster pack)
  // Completed = tutti i bookings status=completed storici, no scoping.
  // Per recurring clients (path infinito), `total` cresce ad ogni nuovo
  // blocco creato → la card path-wide ha senso comunque ma il "percent"
  // non rappresenta una "fine" → la nascondiamo per recurring (sotto).
  const pathStats = useMemo(() => {
    const allBlocks = blocksQ.data ?? [];
    const blocksTotal = allBlocks.reduce(
      (s, b) => s + b.allocations.reduce((sa, a) => sa + a.quantity_assigned, 0),
      0,
    );
    const extraTotal = (extraCreditsQ.data ?? []).reduce((s, ec) => s + ec.quantity, 0);
    const total = blocksTotal + extraTotal;
    const completed = (bookingsQ.data ?? []).filter((b) => b.status === "completed").length;
    const remaining = Math.max(0, total - completed);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, remaining, percent };
  }, [blocksQ.data, bookingsQ.data, extraCreditsQ.data]);

  // "BLOCCO N DI M" badge: per fixed mostra M = totale blocchi del path,
  // per recurring mostra solo "BLOCCO N" (path è infinito, M non ha senso).
  const blockProgress = useMemo(() => {
    if (!resolvedCurrentBlock) return null;
    const allBlocks = blocksQ.data ?? [];
    return {
      index: resolvedCurrentBlock.sequence_order,
      total: allBlocks.length,
    };
  }, [resolvedCurrentBlock, blocksQ.data]);

  // Segment visual: 1 slot per ogni sessione assegnata del blocco corrente,
  // marcato come 'completed' (verde primary), 'booked' (azzurro
  // primary-fixed-dim) o 'open' (grigio tratteggiato). I booked riportano
  // la propria data (dd/MM). Ordine fisso: completed → booked → open
  // così la "rampa" cresce sempre da sinistra a destra.
  const currentBlockSlots = useMemo(() => {
    if (!resolvedCurrentBlock) return [] as Array<{ state: "completed" | "booked" | "open"; date?: Date }>;
    const total = resolvedCurrentBlock.allocations.reduce(
      (s, a) => s + a.quantity_assigned,
      0,
    );
    if (total === 0) return [];
    const startMs = new Date(resolvedCurrentBlock.start_date).getTime();
    const endMs = new Date(resolvedCurrentBlock.end_date).getTime() + 24 * 60 * 60 * 1000 - 1;
    const inBlock = (bookingsQ.data ?? []).filter((b) => {
      const t = new Date(b.scheduled_at).getTime();
      return t >= startMs && t <= endMs;
    });
    const completedCount = inBlock.filter((b) => b.status === "completed").length;
    const scheduledList = inBlock
      .filter((b) => b.status === "scheduled")
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    const slots: Array<{ state: "completed" | "booked" | "open"; date?: Date }> = [];
    for (let i = 0; i < completedCount && slots.length < total; i++) {
      slots.push({ state: "completed" });
    }
    for (let i = 0; i < scheduledList.length && slots.length < total; i++) {
      const item = scheduledList[i];
      if (!item) break;
      slots.push({ state: "booked", date: new Date(item.scheduled_at) });
    }
    while (slots.length < total) slots.push({ state: "open" });
    return slots;
  }, [resolvedCurrentBlock, bookingsQ.data]);

  // Breakdown numerico del blocco (derivato dagli slot per coerenza UI).
  const currentBlockBreakdown = useMemo(() => {
    let completed = 0;
    let booked = 0;
    let open = 0;
    for (const s of currentBlockSlots) {
      if (s.state === "completed") completed++;
      else if (s.state === "booked") booked++;
      else open++;
    }
    return { completed, booked, open };
  }, [currentBlockSlots]);

  // Breakdown per tipologia di sessione del blocco corrente. Sostituisce
  // il vecchio KPI single-counter con un layout granulare a 3 colonne
  // (icona+nome | progress bar | badge+CTA). Aggrega le allocations per
  // event_type_id (o session_type fallback) + cross-referencia i bookings
  // dentro la finestra del blocco per popolare completed/booked.
  const currentBlockTypeBreakdown = useMemo<SessionTypeBreakdownRow[]>(() => {
    if (!resolvedCurrentBlock) return [];
    const ets = eventTypesQ.data ?? [];
    const map = new Map<string, SessionTypeBreakdownRow>();

    // 1. Inizializza dalle allocations (sourcetruth per total per type).
    //    `remaining` = somma di (quantity_assigned - quantity_booked) — STESSA
    //    fonte di /client/book pools, così il bottone Prenota e il pool sono
    //    sempre coerenti (no drift dashboard↔booking).
    for (const a of resolvedCurrentBlock.allocations) {
      const key = a.event_type_id ?? a.session_type;
      const et = a.event_type_id ? ets.find((e) => e.id === a.event_type_id) : null;
      const cur = map.get(key) ?? {
        key,
        eventTypeId: a.event_type_id ?? null,
        name: et?.name ?? sessionLabel(a.session_type),
        completed: 0,
        booked: 0,
        total: 0,
        remaining: 0,
      };
      cur.total += a.quantity_assigned;
      cur.remaining += a.quantity_assigned - a.quantity_booked;
      map.set(key, cur);
    }

    // 2. Cross-referencia bookings dentro la finestra del blocco
    const startMs = new Date(resolvedCurrentBlock.start_date).getTime();
    const endMs =
      new Date(resolvedCurrentBlock.end_date).getTime() + 24 * 60 * 60 * 1000 - 1;
    for (const b of bookingsQ.data ?? []) {
      const t = new Date(b.scheduled_at).getTime();
      if (t < startMs || t > endMs) continue;
      if (b.status !== "completed" && b.status !== "scheduled") continue;
      const key = b.event_type_id ?? b.session_type;
      const cur = map.get(key);
      if (!cur) continue; // booking di un tipo non allocato → ignora
      if (b.status === "completed") cur.completed += 1;
      else cur.booked += 1;
    }

    // 3. Ordina per total desc così le tipologie con più sessioni stanno in alto
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [resolvedCurrentBlock, eventTypesQ.data, bookingsQ.data]);

  // Titoli (event_types.name = booster_packs.event_type_title) per cui esiste
  // un booster attivo. Usato dal breakdown per offrire "Vai allo Store" quando
  // i crediti di una tipologia sono esauriti. Query leggera, sempre la stessa
  // per tutti i clienti → staleTime = 5 min.
  const boosterTitlesQ = useQuery({
    queryKey: ["booster_titles_active"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booster_packs")
        .select("event_type_title")
        .eq("active", true);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.event_type_title as string));
    },
  });

  // Data di fine blocco corrente formattata it-IT (es. "30 giugno"),
  // usata nel KPI box "...entro il 30 giugno".
  const currentBlockEndLabel = useMemo(() => {
    if (!resolvedCurrentBlock) return null;
    return new Date(resolvedCurrentBlock.end_date).toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
    });
  }, [resolvedCurrentBlock]);

  // Lista blocchi del percorso, ognuno con stato past/current/future + counts.
  // Per recurring rimuoviamo i "future" perché il path è infinito (i blocchi
  // futuri non esistono finché auto_renew non li crea).
  const pathBlocks = useMemo(() => {
    const all = (blocksQ.data ?? []).slice().sort((a, b) => a.sequence_order - b.sequence_order);
    const now = Date.now();
    const rows = all.map((b) => {
      const total = b.allocations.reduce((s, a) => s + a.quantity_assigned, 0);
      const startMs = new Date(b.start_date).getTime();
      const endMs = new Date(b.end_date).getTime() + 24 * 60 * 60 * 1000 - 1;
      const completed = (bookingsQ.data ?? []).filter((bk) => {
        if (bk.status !== "completed") return false;
        const t = new Date(bk.scheduled_at).getTime();
        return t >= startMs && t <= endMs;
      }).length;
      let state: "past" | "current" | "future" = "future";
      if (resolvedCurrentBlock && b.id === resolvedCurrentBlock.id) state = "current";
      else if (endMs < now) state = "past";
      else if (startMs > now) state = "future";
      return {
        id: b.id,
        sequence: b.sequence_order,
        name: `Blocco ${b.sequence_order}`,
        total,
        completed,
        state,
      };
    });
    return isRecurring ? rows.filter((r) => r.state !== "future") : rows;
  }, [blocksQ.data, bookingsQ.data, resolvedCurrentBlock, isRecurring]);

  // "Settimana X/4" label for recurring clients showing how far we are
  // into the current block (1-indexed, clamped to [1, 4]).
  const currentWeekLabel = useMemo(() => {
    if (!isRecurring || !currentBlock) return null;
    const startMs = new Date(currentBlock.start_date).getTime();
    const diffDays = Math.floor((Date.now() - startMs) / (24 * 60 * 60 * 1000));
    const week = Math.min(4, Math.max(1, Math.floor(diffDays / 7) + 1));
    return `Settimana ${week}/4`;
  }, [isRecurring, currentBlock]);

  // Grace banner: residuals from previous block, valid for a few more
  // days. Only relevant when the client is recurring + actually in grace.
  const graceBanner = useMemo(() => {
    if (!isRecurring) return null;
    const state = currentBlockQ.data;
    if (!state?.inGracePeriod) return null;
    if ((state.residualsFromPrevious ?? 0) <= 0) return null;
    return {
      residuals: state.residualsFromPrevious,
      until: state.nextRenewalDate,
    };
  }, [isRecurring, currentBlockQ.data]);

  const nextBooking = useMemo(() => {
    const now = Date.now();
    return (bookingsQ.data ?? [])
      .filter((b) => b.status === "scheduled" && new Date(b.scheduled_at).getTime() > now)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))[0];
  }, [bookingsQ.data]);

  const nextEventType = nextBooking?.event_type_id
    ? (eventTypesQ.data ?? []).find((e) => e.id === nextBooking.event_type_id)
    : null;

  const isLoading =
    blocksQ.isLoading || bookingsQ.isLoading || profileQ.isLoading || extraCreditsQ.isLoading;

  return (
    <div className="max-w-md mx-auto bg-surface min-h-screen">
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 shadow-[0_8px_30px_rgba(0,0,0,0.04)] z-40">
        <div className="flex justify-between items-center w-full px-margin-mobile py-stack-md">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container grid place-items-center border-2 border-surface-container-lowest shadow-sm font-semibold">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold text-aura-primary">Ciao {firstName}</h1>
          </div>
          {/* B12 (audit): rimossa la campanella notifiche inerte (nessuna azione
              collegata). Da reintrodurre solo quando esistera' un pannello
              notifiche cliente funzionante. */}
        </div>
      </header>

      <main className="px-margin-mobile pt-stack-md flex flex-col gap-stack-lg">
        {/* Card 1: Blocco corrente — segment visual + KPI + secondary row */}
        <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-aura-primary/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col gap-6 relative z-10">
            {/* Header: BLOCCO N DI M + titolo (+ "Settimana X/4" per recurring) */}
            <div className="flex flex-col gap-1">
              {blockProgress && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                    {isRecurring || blockProgress.total === 0
                      ? `BLOCCO ${blockProgress.index}`
                      : `BLOCCO ${blockProgress.index} DI ${blockProgress.total}`}
                  </span>
                  {currentWeekLabel && (
                    <span className="text-[11px] font-semibold text-on-surface-variant tabular-nums">
                      {currentWeekLabel}
                    </span>
                  )}
                </div>
              )}
              <h2 className="text-xl font-semibold text-on-surface">
                {isRecurring ? "Il tuo mese corrente" : "Il tuo blocco corrente"}
              </h2>
            </div>

            {graceBanner && (
              <div className="rounded-[20px] bg-tertiary-container/30 border border-tertiary-container/40 px-4 py-3">
                <p className="text-xs font-semibold text-on-tertiary-container">
                  Sessioni del mese precedente: {graceBanner.residuals}
                </p>
                {graceBanner.until && (
                  <p className="text-[11px] text-on-tertiary-container/80 mt-0.5">
                    Valide fino al{" "}
                    {new Date(graceBanner.until).toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "long",
                    })}
                  </p>
                )}
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col gap-6">
                <AuraLineSkeleton className="h-3 w-full rounded-full" />
                <AuraCardSkeleton className="h-24 rounded-[20px]" />
                <div className="grid grid-cols-3 gap-3">
                  <AuraCardSkeleton className="h-16" />
                  <AuraCardSkeleton className="h-16" />
                  <AuraCardSkeleton className="h-16" />
                </div>
              </div>
            ) : currentBlockSlots.length === 0 && pathStats.total === 0 ? (
              <EmptyStateCard
                title="Pronto a salire di livello?"
                description="Non hai ancora un percorso attivo. Scegli un Booster o un NC Add-on per iniziare a prenotare le tue sessioni."
                ctaLabel="Esplora gli Add-on"
                ctaTo="/client/store"
              />
            ) : currentBlockSlots.length === 0 ? (
              // Edge: percorso attivo ma blocco corrente vuoto (es. tra due blocchi)
              <p className="text-sm text-on-surface-variant text-center py-4">
                Nessuna sessione nel blocco corrente.
              </p>
            ) : (
              <>
                {/* Segment Visual */}
                {currentBlockSlots.length <= 24 ? (
                  <div className="flex flex-col">
                    <div
                      className="grid gap-2 items-center mt-6 mb-6"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(
                          currentBlockSlots.length,
                          8,
                        )}, minmax(0, 1fr))`,
                      }}
                    >
                      {currentBlockSlots.map((slot, i) => (
                        <div key={i} className="relative flex justify-center">
                          {slot.state === "completed" && (
                            <Check
                              className="size-4 text-aura-primary absolute -top-6"
                              aria-hidden
                            />
                          )}
                          <div
                            className={cn(
                              "w-full h-3 rounded-full",
                              slot.state === "completed" && "bg-aura-primary",
                              slot.state === "booked" && "bg-primary-fixed-dim",
                              slot.state === "open" &&
                                "bg-surface-container-high border border-dashed border-outline-variant",
                            )}
                          />
                          {slot.state === "booked" && slot.date && (
                            <span className="text-[10px] font-semibold text-on-surface-variant tabular-nums absolute -bottom-5">
                              {slot.date.toLocaleDateString("it-IT", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
                      <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                        <span className="text-aura-primary leading-none">●</span>
                        Completate
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                        <span className="text-primary-fixed-dim leading-none">●</span>
                        Prenotate
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                        <span className="text-outline-variant leading-none">○</span>
                        Da prenotare
                      </span>
                    </div>
                  </div>
                ) : (
                  // Fallback per blocchi grandi (>24 slot): stacked progress bar
                  <div className="flex flex-col gap-2">
                    <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden flex">
                      <div
                        className="bg-aura-primary h-full"
                        style={{
                          width: `${(currentBlockBreakdown.completed / currentBlockSlots.length) * 100}%`,
                        }}
                      />
                      <div
                        className="bg-primary-fixed-dim h-full"
                        style={{
                          width: `${(currentBlockBreakdown.booked / currentBlockSlots.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Breakdown per tipologia di sessione — nested card "Le tue
                    Sessioni" con grid flat [1fr_auto_auto] + separatori
                    (vedi ClientSessionsBreakdown). Sostituisce il vecchio
                    KPI box single-counter con visibilità granulare per
                    tipologia (PT, BIA, FMS, ...). */}
                {currentBlockTypeBreakdown.length > 0 && (
                  <ClientSessionsBreakdown
                    rows={currentBlockTypeBreakdown}
                    boosterTitles={boosterTitlesQ.data}
                  />
                )}

                {/* Hint scadenza blocco (sostituisce il sub-testo del vecchio
                    KPI box). Sempre visibile finché c'è almeno una sessione
                    aperta — il messaggio di completamento è ridondante con
                    la secondary row sotto + i badge dei pool. */}
                {currentBlockBreakdown.open > 0 && currentBlockEndLabel && (
                  <p className="text-xs text-on-surface-variant text-center">
                    Da prenotare entro il <strong>{currentBlockEndLabel}</strong>.
                  </p>
                )}
                {currentBlockBreakdown.open === 0 &&
                  currentBlockBreakdown.completed === currentBlockSlots.length && (
                    <div className="bg-tertiary-container/20 rounded-[20px] p-4 text-center">
                      <p className="text-sm font-semibold text-on-tertiary-container">
                        Blocco completato. Ottimo lavoro!
                      </p>
                    </div>
                  )}

                {/* Secondary Row: 3 colonne */}
                <div className="grid grid-cols-3 divide-x divide-surface-container-high pt-2">
                  <div className="flex flex-col items-center gap-1 text-center px-2">
                    <CheckCircle2 className="size-6 text-aura-primary" aria-hidden />
                    <span className="text-sm font-semibold text-on-surface tabular-nums">
                      {currentBlockBreakdown.completed}{" "}
                      {currentBlockBreakdown.completed === 1 ? "fatta" : "fatte"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center px-2">
                    <CalendarCheck
                      className="size-6 text-primary-fixed-dim"
                      aria-hidden
                    />
                    <span className="text-sm font-semibold text-on-surface tabular-nums">
                      {currentBlockBreakdown.booked}{" "}
                      {currentBlockBreakdown.booked === 1 ? "prenotata" : "prenotate"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center px-2">
                    <Clock className="size-6 text-outline" aria-hidden />
                    <span className="text-sm font-semibold text-on-surface tabular-nums">
                      {currentBlockBreakdown.open} da fare
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Card 2: Percorso complessivo — lista blocchi (skip se < 2 blocchi
            o se l'utente non ha ancora un percorso attivo) */}
        {!isLoading && pathBlocks.length >= 2 && (
          <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 flex flex-col gap-6">
            <div className="flex justify-between items-end gap-3">
              <h3 className="text-xl font-semibold text-on-surface">Il tuo percorso</h3>
              <span className="text-xs font-semibold text-on-surface-variant tabular-nums shrink-0">
                {pathStats.completed} di {pathStats.total} sessioni
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {pathBlocks.map((b) => {
                if (b.state === "past") {
                  const full = b.completed >= b.total && b.total > 0;
                  return (
                    <div
                      key={b.id}
                      className="h-14 rounded-2xl bg-aura-primary flex items-center justify-between px-4 text-on-primary"
                    >
                      <span className="text-sm font-semibold">{b.name}</span>
                      <div className="flex items-center gap-1">
                        {full && <Check className="size-4" aria-hidden />}
                        <span className="text-sm font-semibold tabular-nums">
                          {b.completed}/{b.total}
                        </span>
                      </div>
                    </div>
                  );
                }
                if (b.state === "current") {
                  const pct = b.total > 0 ? Math.round((b.completed / b.total) * 100) : 0;
                  return (
                    <div
                      key={b.id}
                      className="h-14 rounded-2xl bg-surface-container-low border-2 border-aura-primary flex items-center justify-between px-4 relative overflow-hidden"
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-aura-primary/20 transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="text-sm font-semibold text-on-surface relative z-10">
                        {b.name} · {b.completed}/{b.total}
                      </span>
                      <span className="bg-aura-primary text-on-primary text-[10px] font-bold px-2 py-1 rounded-md tracking-wider relative z-10">
                        ATTUALE
                      </span>
                    </div>
                  );
                }
                // future
                return (
                  <div
                    key={b.id}
                    className="h-14 rounded-2xl bg-surface-container-high border border-dashed border-outline-variant flex items-center justify-between px-4"
                  >
                    <span className="text-sm text-on-surface-variant">
                      {b.name} · {b.total > 0 ? `0/${b.total}` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center text-center">
              <span className="text-[13px] text-on-surface-variant">
                {isRecurring
                  ? `${pathStats.completed} completate • ${pathStats.remaining} crediti disponibili`
                  : `${pathStats.completed} completate • ${pathStats.remaining} rimanenti • ${pathStats.percent}% del percorso`}
              </span>
            </div>
          </section>
        )}

        {/* Prossima Sessione */}
        <section>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 ml-2">
            Prossima Sessione
          </h3>
          {isLoading ? (
            <AuraCardSkeleton className="h-32" />
          ) : nextBooking ? (
            <ClientLiveBookingCard
              booking={nextBooking}
              // H3: prefer the per-booking snapshot so a later coach
              // edit to event_types.duration can't relabel an already-
              // booked next session on the client dashboard.
              durationMin={nextBooking.duration_min ?? nextEventType?.duration ?? 60}
              label={nextEventType?.name ?? sessionLabel(nextBooking.session_type)}
              color={nextEventType?.color ?? "#039BE5"}
              coachId={coachId}
            />
          ) : (
            <div className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 border border-outline-variant/30 text-center">
              <p className="text-base font-semibold text-on-surface mb-1">
                Nessuna sessione in programma
              </p>
              <p className="text-sm text-on-surface-variant mb-4">
                Prenota la tua prossima sessione.
              </p>
              <button
                onClick={() => navigate({ to: "/client/book" })}
                className="bg-primary-container text-white font-semibold text-sm py-2.5 px-6 rounded-full active:scale-95 transition"
              >
                Prenota ora
              </button>
            </div>
          )}
        </section>

        {/* Fitness Journey Timeline */}
        <section className="flex flex-col gap-stack-md">
          <h3 className="text-xl font-semibold text-on-surface ml-1">Il Tuo Percorso Recente</h3>
          {isLoading ? (
            <AuraCardSkeleton className="h-40" />
          ) : (
            <ClientSessionTimeline bookings={bookingsQ.data ?? []} eventTypes={eventTypesQ.data ?? []} />
          )}
        </section>

        {/* Quick Action */}
        <section className="flex flex-col gap-stack-md mt-2">
          <Link
            to="/client/book"
            className="w-full bg-primary-container text-white font-semibold text-base py-4 rounded-full shadow-md hover:opacity-90 transition active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus className="size-5" />
            Prenota Nuova Sessione
          </Link>
        </section>
      </main>
    </div>
  );
}

// LiveBookingCard — replaces the previous NextAppointmentCard with a
// time-aware "live state". When the booking is today and starts within
// 60 minutes, the card transitions to a premium primary-container
// background, pulses a live dot next to the time, and surfaces the
// Join button full-width (when the booking carries a Google Meet URL).
// Otherwise it renders the regular Aura white card with the date label.
// In both states a small "Riprogramma" pill opens the RescheduleDrawer
// inline — no navigation, no desktop AlertDialog detour on mobile.

