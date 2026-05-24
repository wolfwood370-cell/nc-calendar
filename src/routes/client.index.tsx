import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Bell, Plus, Sparkles } from "lucide-react";
import type { BookingRow } from "@/lib/queries";
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
// Auto-merge resolution: union of both import lists. Drop the legacy
// <Skeleton> (no remaining callers), keep both Aura variants used by
// the loading state below.
import { AuraCardSkeleton, AuraLineSkeleton } from "@/components/ui/aura-skeleton";
import { AuraProgressRing } from "@/components/ui/aura-progress-ring";
// EmptyStateCard arrived from origin/main (PWA onboarding + empty
// states pass). Reused in the "Il Tuo Percorso" zero-state branch
// below — auto-merge applied that branch cleanly, only the import
// list collided with mine. Progress wasn't kept because my pass
// replaced the linear bars with AuraProgressRing entirely.
import { EmptyStateCard } from "@/components/empty-state-card";
import { ClientLiveBookingCard } from "@/components/client-live-booking-card";
import { ClientSessionTimeline } from "@/components/client-session-timeline";

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

  // Aggregate allocations. For "recurring" clients the counter is scoped
  // to the current block only (so it resets every 4 weeks). For "fixed"
  // clients we keep the historical behavior (sum across all blocks =
  // progress toward the fixed-term goal, e.g. 4/24).
  const summary = useMemo(() => {
    const allBlocks = blocksQ.data ?? [];
    const blocks = isRecurring && currentBlock ? [currentBlock] : allBlocks;
    const ets = eventTypesQ.data ?? [];
    const extraCredits = extraCreditsQ.data ?? [];
    const map = new Map<string, { name: string; color: string; used: number; total: number }>();

    // 1. Totali (assigned) dai block.allocations dei blocchi rilevanti.
    for (const b of blocks) {
      for (const a of b.allocations) {
        const et = a.event_type_id ? ets.find((e) => e.id === a.event_type_id) : null;
        const key = a.event_type_id ?? a.session_type;
        const cur = map.get(key) ?? {
          name: et?.name ?? sessionLabel(a.session_type),
          color: et?.color ?? "#003e62",
          used: 0,
          total: 0,
        };
        cur.total += a.quantity_assigned;
        map.set(key, cur);
      }
    }

    // 1.5. Extra credits sono sempre inclusi (pool separato, non legato
    //      al blocco mensile — il cliente li ha pagati come pack a sé).
    for (const ec of extraCredits) {
      const et = ets.find((e) => e.id === ec.event_type_id);
      const key = ec.event_type_id;
      const cur = map.get(key) ?? {
        name: et?.name ?? "Extra",
        color: et?.color ?? "#003e62",
        used: 0,
        total: 0,
      };
      cur.total += ec.quantity;
      map.set(key, cur);
    }

    // 2. Bookings completati. Per "recurring" filtriamo alla finestra
    //    [current_block.start_date, current_block.end_date + grace] così
    //    il counter "used" combacia col "total" del blocco corrente.
    let completedBookings = (bookingsQ.data ?? []).filter((b) => b.status === "completed");
    if (isRecurring && currentBlock) {
      const startMs = new Date(currentBlock.start_date).getTime();
      // End is inclusive of the day so we add 24h - 1ms.
      const endMs = new Date(currentBlock.end_date).getTime() + 24 * 60 * 60 * 1000 - 1;
      completedBookings = completedBookings.filter((b) => {
        const t = new Date(b.scheduled_at).getTime();
        return t >= startMs && t <= endMs;
      });
    }
    for (const b of completedBookings) {
      const key = b.event_type_id ?? b.session_type;
      const cur = map.get(key);
      if (cur) {
        cur.used += 1;
      }
    }

    return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
  }, [
    blocksQ.data,
    eventTypesQ.data,
    bookingsQ.data,
    extraCreditsQ.data,
    isRecurring,
    currentBlock,
  ]);

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

  const recentCompleted = useMemo(() => {
    return (bookingsQ.data ?? [])
      .filter((b) => b.status === "completed")
      .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at))
      .slice(0, 3);
  }, [bookingsQ.data]);

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
          <button
            type="button"
            aria-label="Notifiche"
            className="text-aura-primary hover:bg-surface-container-high transition-colors active:scale-95 duration-200 p-2 rounded-full"
          >
            <Bell className="size-6" />
          </button>
        </div>
      </header>

      <main className="px-margin-mobile pt-stack-md flex flex-col gap-stack-lg">
        {/* Il Tuo Percorso */}
        <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-baseline justify-between mb-6 gap-2">
            <h2 className="text-xl font-semibold text-on-surface">
              {isRecurring ? "Il Tuo Mese" : "Il Tuo Percorso"}
            </h2>
            {currentWeekLabel && (
              <span className="text-xs font-semibold text-on-surface-variant tabular-nums">
                {currentWeekLabel}
              </span>
            )}
          </div>

          {graceBanner && (
            <div className="mb-4 rounded-[20px] bg-tertiary-container/30 border border-tertiary-container/40 px-4 py-3">
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
            // Auto-merge resolution: kept the richer HEAD version — it
            // mirrors the resolved layout (AuraProgressRing size-72 +
            // name + label lines) more faithfully than origin's two
            // h-12 rows. Both used AuraCardSkeleton + Aura tokens so
            // there's no design-system regression.
            <div className="flex flex-col gap-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <AuraCardSkeleton key={i} className="p-4 flex items-center gap-4 h-20">
                  <div className="size-[72px] rounded-full bg-surface-container-high/40 shrink-0" />
                  <div className="flex-1 flex flex-col gap-2">
                    <AuraLineSkeleton className="w-2/3 h-4" />
                    <AuraLineSkeleton className="w-1/3 h-3" />
                  </div>
                </AuraCardSkeleton>
              ))}
            </div>
          ) : summary.length === 0 ? (
            <EmptyStateCard
              title="Pronto a salire di livello?"
              description="Non hai ancora un percorso attivo. Scegli un Booster o un NC Add-on per iniziare a prenotare le tue sessioni."
              ctaLabel="Esplora gli Add-on"
              ctaTo="/client/store"
            />
          ) : (
            <div className="flex flex-col gap-5">
              {summary.map((row) => {
                const remaining = Math.max(0, row.total - row.used);
                const isLow = row.total > 0 && remaining > 0 && remaining <= 2;
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-4 rounded-[24px] bg-surface-container-low/50 px-4 py-3"
                  >
                    <AuraProgressRing
                      used={row.used}
                      total={row.total}
                      size={72}
                      strokeWidth={7}
                      color={row.color}
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-base font-semibold text-on-surface truncate">
                        {row.name}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {remaining} rimanenti su {row.total}
                      </span>
                      {isLow && (
                        // Soft alerting recharge CTA — pill-shaped per Aura.
                        // Routes to the booster store (Stripe checkout entry).
                        <Link
                          to="/client/store"
                          className="mt-1 inline-flex self-start items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-tertiary-container/20 text-tertiary"
                        >
                          <Sparkles className="size-3.5" />
                          Ricarica Crediti
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Prossimo Appuntamento */}
        <section>
          <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 ml-2">
            Prossimo Appuntamento
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

