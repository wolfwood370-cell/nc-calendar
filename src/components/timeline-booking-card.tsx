import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Ban, Dumbbell, Stethoscope, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SessionType } from "@/lib/mock-data";

/** Subset structural del booking richiesto dalla card Timeline. */
export interface TimelineBookingItem {
  id: string;
  scheduled_at: string;
  title: string | null;
  status: string;
  event_type_id: string | null;
  session_type: SessionType;
  duration_min: number | null;
}

/** Subset structural dell'event type richiesto per label + durata fallback. */
export interface TimelineBookingEventType {
  id: string;
  name: string;
  duration: number;
}

export interface TimelineBookingCardProps {
  /** Booking da renderizzare nella riga settimana. */
  booking: TimelineBookingItem;
  /** Event type associato (lookup fatto dal parent), undefined se legacy o non risolto. */
  eventType: TimelineBookingEventType | undefined;
  /** Chiamato quando il coach clicca sulla card per aprire EditBookingDialog. */
  onClick: () => void;
}

function iconForSession(st: SessionType): LucideIcon {
  if ((st as string).toLowerCase().includes("triage")) return Stethoscope;
  return Dumbbell;
}

/**
 * Card singolo booking nella Timeline cliente. Due varianti visuali:
 *   - cancelled (status ∈ cancelled / late_cancelled / no_show): testo
 *     barrato, icona Ban su sfondo muted
 *   - active (scheduled o completed): icona session-type su sfondo
 *     primary/emerald + border-l-4 colorato
 *
 * Durata derivata con fallback per legacy bookings: snapshot
 * `duration_min` sul row prima, poi `eventType.duration`, infine 60min.
 */
export function TimelineBookingCard({ booking, eventType, onClick }: TimelineBookingCardProps) {
  const at = parseISO(booking.scheduled_at);
  const isCancelled =
    booking.status === "cancelled" ||
    booking.status === "late_cancelled" ||
    booking.status === "no_show";
  const isCompleted = booking.status === "completed";

  // H3: per-booking snapshot first; the event_types lookup is a legacy
  // fallback for rows inserted before the trigger (migration 20260518120000)
  // shipped.
  const durationMin = booking.duration_min ?? eventType?.duration ?? 60;
  const end = addDays(at, 0);
  end.setMinutes(end.getMinutes() + durationMin);

  const dayLabel = format(at, "EEE d MMM", { locale: it }).replace(/^./, (c) => c.toUpperCase());
  const timeRange = `${dayLabel}, ${format(at, "HH:mm")} - ${format(end, "HH:mm")}`;
  const label = eventType?.name ?? booking.title ?? booking.session_type;

  if (isCancelled) {
    return (
      <div
        onClick={onClick}
        className="cursor-pointer bg-surface-container-high rounded-2xl p-3 flex items-start gap-3 shadow-sm hover:scale-[1.02] transition-transform border border-border"
      >
        <div className="bg-muted text-muted-foreground p-2 rounded-full flex-shrink-0">
          <Ban className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground/70 mb-1 line-through">{timeRange}</p>
          <p className="text-sm text-foreground font-medium line-through truncate">{label}</p>
        </div>
      </div>
    );
  }

  const Icon = iconForSession(booking.session_type);

  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-2xl p-3 flex items-start gap-3 shadow-sm bg-white border-l-4 hover:scale-[1.02] transition-transform",
        isCompleted ? "border-emerald-500" : "border-primary",
      )}
    >
      <div
        className={cn(
          "p-2 rounded-full flex-shrink-0",
          isCompleted ? "bg-emerald-50 text-emerald-600" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground/70 mb-1 font-medium">{timeRange}</p>
        <p className="text-sm text-foreground font-semibold truncate">{label}</p>
      </div>
    </div>
  );
}
