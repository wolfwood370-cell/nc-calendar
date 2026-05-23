// ----------------------------------------------------------------------------
// ClientRescheduleSheet — athlete self-service reschedule UI
// ----------------------------------------------------------------------------
// Replaces the old "cancel + rebook" flow (which refunded a credit and
// sent the user back to /client/book) with a true UPDATE on
// bookings.scheduled_at. Backed by the existing client_booking_update_
// guards trigger (24h cutoff + column whitelist) so the security model
// stays identical; this just exposes the path through the UI.
//
// On confirm:
//   1. UPDATE bookings.scheduled_at directly (RLS + trigger enforce)
//   2. Invoke booking-notifications with event_type="booking.rescheduled"
//      → coach sees in-app + Web Push
//   3. syncCalendar({action:"update"}) so the coach's Google Calendar
//      mirror tracks the new time (only when the booking has a known
//      google_event_id; otherwise we skip — the mirror_check sweep
//      will reconcile later)
//   4. Invalidate the booking detail query + close sheet + toast
// ----------------------------------------------------------------------------

import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
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
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { syncCalendar } from "@/lib/sync-calendar";
import {
  useCoachAvailability,
  useCoachAvailabilityExceptions,
  useCoachOptimizationEnabled,
} from "@/lib/queries";
import { invalidateBookingScope } from "@/lib/query-keys";
import { generateSlots, type Slot, type BlockedRange } from "@/lib/booking-slots";
import { errorMessage } from "@/lib/utils";

interface BookingForReschedule {
  id: string;
  scheduled_at: string;
  coach_id: string;
  client_id: string | null;
  duration_min: number;
  google_event_id: string | null;
  session_label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: BookingForReschedule;
  clientName: string;
  onSuccess?: () => void;
}

const HORIZON_DAYS = 60;
const MIN_LEAD_MS = 24 * 60 * 60 * 1000;

export function ClientRescheduleSheet({
  open,
  onOpenChange,
  booking,
  clientName,
  onSuccess,
}: Props) {
  const qc = useQueryClient();

  // Pre-validation mirroring the DB trigger. The trigger raises if
  // OLD.scheduled_at < now()+24h; we surface it here so the user
  // doesn't open a sheet only to be rejected on submit. The submit
  // path re-checks (defense in depth).
  const oldTime = new Date(booking.scheduled_at).getTime();
  const withinCutoff = oldTime - Date.now() < MIN_LEAD_MS;

  const [calendarMonth, setCalendarMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const coachId = booking.coach_id;
  const availQ = useCoachAvailability(coachId);
  const exceptionsQ = useCoachAvailabilityExceptions(coachId);
  const optimizationQ = useCoachOptimizationEnabled(coachId);

  // Coach busy times via the SECURITY DEFINER RPC that returns
  // anonymized busy slots (no client identities leaked to other clients).
  const busyQ = useQuery({
    queryKey: ["coach-busy-reschedule", coachId, booking.id],
    enabled: open && !!coachId,
    queryFn: async () => {
      const from = startOfDay(new Date());
      const to = addDays(from, HORIZON_DAYS);
      to.setHours(23, 59, 59, 999);
      const { data, error } = await supabase.rpc("get_coach_busy", {
        p_coach_id: coachId,
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

  // Exclude the CURRENT booking's range from blockedRanges — otherwise
  // the slot generator would treat the slot we're trying to vacate as
  // busy and refuse to surface adjacent slots. UPDATE semantics in the
  // bookings_no_overlap_per_coach exclusion constraint already exclude
  // the row from its own conflict check, so this is consistent.
  const blockedRanges = useMemo<BlockedRange[]>(() => {
    const ranges: BlockedRange[] = [];
    const currentStart = oldTime;
    const currentEnd = currentStart + booking.duration_min * 60_000;
    for (const b of busyQ.data ?? []) {
      const start = new Date(b.scheduled_at).getTime();
      const end = start + ((b.duration ?? 60) + (b.buffer_minutes ?? 0)) * 60_000;
      // Drop the row that represents the booking we're moving.
      if (start === currentStart && end === currentEnd) continue;
      ranges.push({ start, end });
    }
    return ranges;
  }, [busyQ.data, oldTime, booking.duration_min]);

  const slots = useMemo<Slot[]>(() => {
    if (!availQ.data) return [];
    return generateSlots(
      HORIZON_DAYS,
      blockedRanges,
      availQ.data,
      exceptionsQ.data ?? [],
      booking.duration_min,
      startOfDay(new Date()),
      addDays(startOfDay(new Date()), HORIZON_DAYS),
      { enabled: optimizationQ.data ?? true },
    );
  }, [availQ.data, exceptionsQ.data, optimizationQ.data, blockedRanges, booking.duration_min]);

  const daysWithSlots = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) set.add(format(s.date, "yyyy-MM-dd"));
    return set;
  }, [slots]);

  const slotsForSelectedDay = useMemo(() => {
    if (!selectedDate) return [];
    return slots.filter((s) => isSameDay(s.date, selectedDate));
  }, [slots, selectedDate]);

  const monthStart = startOfMonth(calendarMonth);
  const monthEnd = endOfMonth(calendarMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) calendarDays.push(d);
  const todayStart = startOfDay(new Date());

  const dataLoading = availQ.isLoading || exceptionsQ.isLoading || busyQ.isLoading;

  const handleConfirm = async () => {
    if (!selectedISO || submitting) return;
    // Defense in depth: re-check cutoff against OLD time at submit.
    if (Date.now() + MIN_LEAD_MS > oldTime) {
      toast.error("Troppo tardi", {
        description: "Non puoi più spostare a meno di 24 ore dall'inizio.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error: updErr } = await supabase
        .from("bookings")
        .update({ scheduled_at: selectedISO })
        .eq("id", booking.id);
      if (updErr) {
        // The trigger raises Italian messages already; surface them
        // directly. P0001 + 23P01 (overlap exclusion) both land here.
        toast.error("Riprogrammazione rifiutata", {
          description: updErr.message,
        });
        return;
      }

      // Fire-and-forget: failures here don't undo the UPDATE.
      void supabase.functions
        .invoke("booking-notifications", {
          body: {
            event_type: "booking.rescheduled",
            coach_id: booking.coach_id,
            client_name: clientName,
            scheduled_at: selectedISO,
            old_scheduled_at: booking.scheduled_at,
            session_label: booking.session_label,
            booking_id: booking.id,
          },
        })
        .catch((e) => console.error("booking-notifications (rescheduled) failed", e));

      if (booking.google_event_id) {
        syncCalendar({
          action: "update",
          coachId: booking.coach_id,
          googleEventId: booking.google_event_id,
          startISO: selectedISO,
          clientName,
          sessionLabel: booking.session_label,
        });
      }

      invalidateBookingScope(qc, {
        coachId: booking.coach_id,
        clientId: booking.client_id ?? undefined,
      });
      qc.invalidateQueries({ queryKey: ["booking-detail", booking.id] });

      const newWhen = format(new Date(selectedISO), "EEEE d MMMM · HH:mm", { locale: it });
      toast.success("Appuntamento riprogrammato", {
        description: `Nuovo orario: ${newWhen}. Il coach è stato notificato.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (e: unknown) {
      toast.error("Errore", { description: errorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[32px] bg-surface-container-lowest border-t border-outline-variant/20 p-0 max-h-[90vh] overflow-y-auto"
      >
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <SheetTitle className="text-lg font-semibold text-on-surface">
            Riprogramma sessione
          </SheetTitle>
          <p className="text-xs text-on-surface-variant">
            Attuale: {format(new Date(booking.scheduled_at), "EEE d MMM · HH:mm", { locale: it })}
          </p>
        </SheetHeader>

        {withinCutoff ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-semibold text-on-surface mb-2">
              Non puoi più riprogrammare
            </p>
            <p className="text-xs text-on-surface-variant">
              Manca meno di 24 ore all'inizio della sessione. Contatta il coach per concordare un
              nuovo orario.
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 pt-2 pb-3">
              {/* Calendar */}
              <div className="bg-surface-container-low rounded-[24px] p-4">
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => addMonths(m, -1))}
                    className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
                    aria-label="Mese precedente"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="font-semibold text-sm text-on-surface capitalize">
                    {format(calendarMonth, "MMMM yyyy", { locale: it })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                    className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors"
                    aria-label="Mese successivo"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
                    <div key={i} className="text-[10px] font-semibold text-outline mb-1">
                      {d}
                    </div>
                  ))}
                  {calendarDays.map((day) => {
                    const inMonth = isSameMonth(day, calendarMonth);
                    const past = isBefore(day, todayStart);
                    const dayKey = format(day, "yyyy-MM-dd");
                    const hasSlots = daysWithSlots.has(dayKey);
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                    const disabled = past || !hasSlots;
                    return (
                      <div key={dayKey} className="flex justify-center items-center py-0.5">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setSelectedDate(day);
                            setSelectedISO(null);
                          }}
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs transition-colors ${
                            isSelected
                              ? "bg-primary-container text-on-primary font-semibold shadow-sm"
                              : !inMonth || disabled
                                ? "text-outline-variant cursor-not-allowed"
                                : "text-on-surface hover:bg-surface-container cursor-pointer"
                          }`}
                        >
                          {format(day, "d")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Slots */}
            <div className="px-6 pb-4">
              <h3 className="font-semibold text-sm text-on-surface mb-3">
                {selectedDate
                  ? `Orari per ${format(selectedDate, "d MMMM", { locale: it })}`
                  : "Seleziona una data"}
              </h3>
              {dataLoading ? (
                <div className="flex items-center gap-2 text-sm text-on-surface-variant py-4">
                  <Loader2 className="size-4 animate-spin" /> Caricamento...
                </div>
              ) : selectedDate && slotsForSelectedDay.length === 0 ? (
                <p className="text-sm text-on-surface-variant py-4">
                  Nessuno slot disponibile in questa data.
                </p>
              ) : selectedDate ? (
                <div className="grid grid-cols-3 gap-2">
                  {slotsForSelectedDay.map((s) => {
                    const isSelected = s.iso === selectedISO;
                    return (
                      <button
                        key={s.iso}
                        type="button"
                        onClick={() => setSelectedISO(s.iso)}
                        className={`w-full rounded-full py-2.5 text-sm font-semibold tabular-nums transition-colors ${
                          isSelected
                            ? "bg-primary-container text-on-primary border border-primary-container shadow-sm"
                            : "bg-surface-container-lowest border border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                        }`}
                      >
                        {format(s.date, "HH:mm")}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant py-2">
                  Scegli un giorno dal calendario per vedere gli orari liberi.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-8 pt-2 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!selectedISO || submitting}
                className="w-full bg-primary-container text-on-primary rounded-full py-4 text-sm font-semibold shadow-md active:scale-95 transition-transform hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Conferma nuovo orario
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
                className="w-full text-sm font-medium text-on-surface-variant py-3"
              >
                Annulla
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
