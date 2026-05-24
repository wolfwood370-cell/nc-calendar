// ----------------------------------------------------------------------------
// RescheduleDrawer — mobile-first reschedule flow for an active booking.
// ----------------------------------------------------------------------------
// Opens from the LiveBookingCard on the client dashboard. Uses vaul
// (already wired in src/components/ui/drawer.tsx) to slide a sheet up
// from the bottom with a strict rounded-t-[32px] silhouette and pure
// white surface, matching the Aura spec.
//
// Internal flow:
//   1. Day chips — horizontal scroll, today → +14 days.
//   2. Time slots — generated from the coach's availability rules for
//      the picked day, filtered against get_coach_busy + the current
//      booking's own window (we don't want to count the booking we're
//      about to move as busy against itself).
//   3. Confirm — runs a pure UPDATE on bookings.scheduled_at via
//      useRescheduleBooking. The new DB trigger
//      z_trg_validate_client_booking_update (migration 20260522100000)
//      enforces 24h cutoff + column whitelist server-side; the existing
//      bookings_no_overlap_per_coach exclusion constraint still catches
//      double-booking with SQLSTATE 23P01. Credits + meeting_link +
//      google_event_id are preserved end-to-end (same row, same id).
//
// On confirm success the drawer closes and we toast. Errors bubble up
// as destructive toasts and keep the drawer open so the user can retry.
// ----------------------------------------------------------------------------

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  useCoachAvailability,
  useCoachAvailabilityExceptions,
  useRescheduleBooking,
  type AvailabilityRow,
  type AvailabilityExceptionRow,
  type BookingRow,
} from "@/lib/queries";

interface RescheduleDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingRow;
  coachId: string | null;
  durationMin: number;
}

// 14-day rolling window starting today. The drawer prevents picking a
// past slot via the "before now" filter below.
import {
  RESCHEDULE_WINDOW_DAYS as WINDOW_DAYS,
  startOfDay,
  addDays,
  buildSlots,
} from "@/lib/reschedule-slots";

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

export function RescheduleDrawer({
  open,
  onOpenChange,
  booking,
  coachId,
  durationMin,
}: RescheduleDrawerProps) {
  const today = startOfDay(new Date());
  const days = React.useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, i)),
    // today changes only at midnight; rebuilding the array is cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const [selectedDay, setSelectedDay] = React.useState<Date>(today);
  const [selectedISO, setSelectedISO] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset internal state on every open so re-opening starts clean.
  React.useEffect(() => {
    if (open) {
      setSelectedDay(today);
      setSelectedISO(null);
    }
    // today is recomputed each render but only differs across midnight;
    // including it would loop. eslint-disable for the same reason as days.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const availabilityQ = useCoachAvailability(coachId);
  const exceptionsQ = useCoachAvailabilityExceptions(coachId);

  // Coach busy via SECURITY DEFINER RPC — same source the booking flow
  // uses, so the slot picker shows the exact same blocked ranges.
  const busyQ = useQuery({
    queryKey: ["coach-busy", coachId, today.toISOString()],
    enabled: !!coachId && open,
    queryFn: async () => {
      const from = today.toISOString();
      const to = addDays(today, WINDOW_DAYS).toISOString();
      const { data, error } = await supabase.rpc("get_coach_busy", {
        p_coach_id: coachId!,
        p_from: from,
        p_to: to,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        scheduled_at: string;
        duration: number;
        buffer_minutes: number;
      }>;
    },
  });

  const busyRanges = React.useMemo(() => {
    const list = busyQ.data ?? [];
    return list.map((b) => {
      const start = new Date(b.scheduled_at).getTime();
      const end = start + ((b.duration ?? 60) + (b.buffer_minutes ?? 0)) * 60_000;
      return { start, end };
    });
  }, [busyQ.data]);

  const excludeBookingStart = new Date(booking.scheduled_at).getTime();

  const slots = React.useMemo(
    () =>
      buildSlots(
        selectedDay,
        durationMin,
        availabilityQ.data ?? [],
        exceptionsQ.data ?? [],
        busyRanges,
        excludeBookingStart,
      ),
    [
      selectedDay,
      durationMin,
      availabilityQ.data,
      exceptionsQ.data,
      busyRanges,
      excludeBookingStart,
    ],
  );

  const rescheduleMut = useRescheduleBooking();

  const handleConfirm = () => {
    if (!selectedISO || submitting || rescheduleMut.isPending) return;
    if (!booking.coach_id || !booking.client_id) {
      // Personal blocks (coach-owned, no real client) are filtered out
      // upstream — LiveBookingCard hides the reschedule button when
      // the row isn't client-owned. This is the defense-in-depth toast.
      toast.error("Dati prenotazione incompleti.");
      return;
    }
    setSubmitting(true);

    // Pure UPDATE on scheduled_at. The new DB trigger
    // z_trg_validate_client_booking_update enforces 24h cutoff +
    // column whitelist; the no-overlap exclusion constraint catches
    // double-booking. Same booking row → same id → same
    // google_event_id → same meeting_link preserved across the shift.
    // Google Calendar event PATCH fires inside the hook's onSuccess.
    rescheduleMut.mutate(
      { bookingId: booking.id, newScheduledISO: selectedISO },
      {
        onSuccess: () => {
          toast.success("Sessione riprogrammata");
          onOpenChange(false);
        },
        onError: (err) => {
          const e = err as { code?: string; message?: string };
          if (e.code === "23P01") {
            toast.error("Slot già occupato", {
              description: "Qualcun altro ha appena prenotato questo orario. Scegli un altro slot.",
            });
          } else if (e.code === "P0001") {
            // The trigger raises P0001 with a localized message for
            // both the 24h cutoff and the column-whitelist guard.
            // Surfacing it directly tells the athlete exactly which
            // safeguard they hit.
            toast.error("Riprogrammazione non possibile", {
              description: e.message ?? "Riprova fra qualche minuto.",
            });
          } else {
            toast.error("Errore", { description: e.message ?? "Riprova fra qualche minuto." });
          }
        },
        onSettled: () => setSubmitting(false),
      },
    );
  };

  const isLoadingPickers = availabilityQ.isLoading || exceptionsQ.isLoading || busyQ.isLoading;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[32px] bg-surface-container-lowest border-t-0">
        <DrawerHeader className="text-left px-6">
          <DrawerTitle className="text-xl font-bold text-on-surface">
            Riprogramma sessione
          </DrawerTitle>
          <DrawerDescription className="text-sm text-on-surface-variant">
            Scegli un nuovo giorno e orario. La modifica è permessa fino a 24 ore prima dell'inizio.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-6 pb-2 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {/* Day chips */}
          <div className="-mx-2 overflow-x-auto pb-1" aria-label="Selettore giorno">
            <div className="flex items-center gap-2 px-2 w-max">
              {days.map((d, i) => {
                const isActive = d.getTime() === selectedDay.getTime();
                const dow = DAY_SHORT[d.getDay()];
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedDay(d);
                      setSelectedISO(null);
                    }}
                    className={
                      isActive
                        ? "shrink-0 min-w-[64px] px-3 py-2 rounded-full flex flex-col items-center gap-0.5 bg-primary-container text-on-primary-container shadow-sm"
                        : "shrink-0 min-w-[64px] px-3 py-2 rounded-full flex flex-col items-center gap-0.5 text-on-surface-variant bg-surface-container-low active:bg-surface-container-high"
                    }
                  >
                    <span className="text-[11px] uppercase tracking-wider font-medium">{dow}</span>
                    <span className="text-base font-semibold tabular-nums">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time slots */}
          <div className="min-h-[160px]">
            {isLoadingPickers ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-11 rounded-full bg-surface-container-high/40 animate-pulse"
                  />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-8">
                Nessuno slot disponibile per questo giorno.
              </p>
            ) : (
              <div
                className="grid grid-cols-3 gap-2"
                role="radiogroup"
                aria-label="Orari disponibili"
              >
                {slots.map((s) => {
                  const isSelected = s.iso === selectedISO;
                  return (
                    <button
                      key={s.iso}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedISO(s.iso)}
                      className={
                        isSelected
                          ? "h-11 rounded-full bg-primary text-on-primary text-sm font-semibold shadow-sm"
                          : "h-11 rounded-full bg-surface-container-low text-on-surface text-sm font-medium border border-outline-variant/40 active:scale-[0.98]"
                      }
                    >
                      {s.date.toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DrawerFooter className="px-6 pb-6 pt-2 gap-2">
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedISO || submitting || rescheduleMut.isPending}
            className="w-full rounded-full bg-primary text-on-primary font-semibold py-4 text-base disabled:opacity-50"
          >
            {(submitting || rescheduleMut.isPending) && (
              <Loader2 className="size-4 animate-spin mr-1" />
            )}
            Conferma riprogrammazione
          </Button>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full rounded-full text-on-surface-variant"
            >
              Annulla
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
