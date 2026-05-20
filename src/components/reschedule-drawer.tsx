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
//      about to cancel as busy).
//   3. Confirm — refunds the credit on the old booking via useCancelBooking
//      and inserts a new one at the picked time. The DB triggers shipped
//      in earlier phases (validate_booking_block_allocation,
//      validate_booking_extra_credits, bookings_no_overlap_per_coach)
//      enforce credit + overlap safety server-side.
//
// On confirm success the drawer closes and we toast. Errors bubble up as
// destructive toasts and keep the drawer open so the user can retry.
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
  useCancelBooking,
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
const WINDOW_DAYS = 14;
const SLOT_STEP_MIN = 30;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function toIsoDate(d: Date): string {
  return d.toLocaleDateString("sv-SE"); // YYYY-MM-DD, no UTC shift
}
function jsDowToIso(d: number): number {
  return d === 0 ? 7 : d;
}

// Parse "HH:MM" or "HH:MM:SS" into minutes from midnight.
function parseTimeMin(s: string | null): number | null {
  if (!s) return null;
  const [h, m] = s.split(":");
  if (!h || !m) return null;
  return Number(h) * 60 + Number(m);
}

interface Slot {
  iso: string;
  date: Date;
}

function buildSlots(
  day: Date,
  durationMin: number,
  availability: AvailabilityRow[],
  exceptions: AvailabilityExceptionRow[],
  busyRanges: Array<{ start: number; end: number }>,
  excludeBookingStart: number | null,
): Slot[] {
  const dow = jsDowToIso(day.getDay());
  const rules = availability.filter((a) => a.day_of_week === dow);
  if (rules.length === 0) return [];

  const dateOnly = toIsoDate(day);
  const exForDay = exceptions.filter((e) => e.date === dateOnly);
  // Full-day block exception (no start/end) → no slots that day.
  if (exForDay.some((e) => !e.start_time && !e.end_time)) return [];

  const slots: Slot[] = [];
  const now = Date.now();
  for (const rule of rules) {
    const ruleStart = parseTimeMin(rule.start_time);
    const ruleEnd = parseTimeMin(rule.end_time);
    if (ruleStart === null || ruleEnd === null) continue;
    for (let m = ruleStart; m + durationMin <= ruleEnd; m += SLOT_STEP_MIN) {
      // Block by partial exceptions on the same day
      const blockedByException = exForDay.some((e) => {
        const exStart = parseTimeMin(e.start_time);
        const exEnd = parseTimeMin(e.end_time);
        if (exStart === null || exEnd === null) return false;
        return m < exEnd && m + durationMin > exStart;
      });
      if (blockedByException) continue;

      const slotStart = new Date(day);
      slotStart.setHours(0, 0, 0, 0);
      slotStart.setMinutes(m);
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotStartMs + durationMin * 60_000;
      if (slotStartMs < now) continue;

      // Skip slots overlapping busy coach ranges, EXCEPT the current
      // booking's own window — we're about to cancel it so it shouldn't
      // block its own rescheduling.
      const blockedByBusy = busyRanges.some(
        (r) =>
          slotStartMs < r.end &&
          slotEndMs > r.start &&
          !(excludeBookingStart !== null && r.start === excludeBookingStart),
      );
      if (blockedByBusy) continue;

      slots.push({ iso: slotStart.toISOString(), date: slotStart });
    }
  }
  return slots;
}

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
    [selectedDay, durationMin, availabilityQ.data, exceptionsQ.data, busyRanges, excludeBookingStart],
  );

  const cancelMut = useCancelBooking();

  const handleConfirm = async () => {
    if (!selectedISO || submitting) return;
    if (!booking.coach_id || !booking.client_id) {
      toast.error("Dati prenotazione incompleti.");
      return;
    }
    setSubmitting(true);
    try {
      // Insert the new booking first. If the DB rejects (overlap, credit
      // exhausted, etc.) we leave the original booking alive. Triggers
      // shipped in earlier phases enforce credit deduction + overlap.
      const { error: insertErr } = await supabase.from("bookings").insert({
        client_id: booking.client_id,
        coach_id: booking.coach_id,
        block_id: booking.block_id ?? null,
        session_type: booking.session_type,
        event_type_id: booking.event_type_id ?? null,
        scheduled_at: selectedISO,
        status: "scheduled",
        meeting_link: null,
      });
      if (insertErr) {
        if (insertErr.code === "23P01") {
          toast.error("Slot già occupato", {
            description: "Qualcun altro ha appena prenotato questo orario. Scegli un altro slot.",
          });
        } else if (insertErr.code === "P0001") {
          toast.error("Riprogrammazione non possibile", { description: insertErr.message });
        } else {
          toast.error("Errore", { description: insertErr.message });
        }
        return;
      }

      // New booking is in. Now cancel the old one — useCancelBooking goes
      // through the cancel_booking SECURITY DEFINER RPC which computes
      // late/free server-side off scheduled_at vs now() and refunds the
      // credit atomically. Google Calendar sync rides along inside the
      // mutation. The rescheduled slot's own server-side credit
      // consumption already happened in the insert above.
      cancelMut.mutate(
        { id: booking.id },
        {
          onSuccess: () => {
            toast.success("Sessione riprogrammata");
            onOpenChange(false);
          },
          onError: (e: Error) => {
            // New booking already created; surface the refund failure so
            // the user can ask support to reconcile. They don't lose the
            // new slot.
            toast.warning("Riprogrammata, ma il rimborso del credito è fallito", {
              description: e.message,
            });
            onOpenChange(false);
          },
        },
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isLoadingPickers =
    availabilityQ.isLoading || exceptionsQ.isLoading || busyQ.isLoading;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="rounded-t-[32px] bg-surface-container-lowest border-t-0">
        <DrawerHeader className="text-left px-6">
          <DrawerTitle className="text-xl font-bold text-on-surface">
            Riprogramma sessione
          </DrawerTitle>
          <DrawerDescription className="text-sm text-on-surface-variant">
            Scegli un nuovo giorno e orario. Il credito della sessione attuale verrà rimborsato.
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
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Orari disponibili">
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
            disabled={!selectedISO || submitting || cancelMut.isPending}
            className="w-full rounded-full bg-primary text-on-primary font-semibold py-4 text-base disabled:opacity-50"
          >
            {(submitting || cancelMut.isPending) && (
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
