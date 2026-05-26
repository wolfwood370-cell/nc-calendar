import { addDays, format, isBefore, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  TimelineBookingCard,
  type TimelineBookingItem,
  type TimelineBookingEventType,
} from "@/components/timeline-booking-card";

/** Subset structural della row settimana richiesto dal componente. */
export interface TimelineWeekRowData {
  week_number: number;
  monday_date: string | null;
  shifted: boolean;
}

export interface TimelineWeekRowProps<TBooking extends TimelineBookingItem = TimelineBookingItem> {
  /** Dati struttura della settimana (week_number, monday_date, shifted). */
  row: TimelineWeekRowData;
  /** Index della riga dentro il blocco — passato a onWeekDateChange. */
  idx: number;
  /** Data "now" usata per evidenziare past/current. */
  today: Date;
  /** Bookings effettivi associati a questa settimana (filtrati upstream). */
  weekBookings: readonly TBooking[];
  /** Catalogo event_types per lookup (passato a ogni TimelineBookingCard). */
  eventTypes: readonly TimelineBookingEventType[];
  /** Chiamato quando il coach cambia la data della settimana dal Calendar popup. */
  onWeekDateChange: (idx: number, newDate: Date) => void;
  /** Chiamato quando il coach clicca un booking card per aprire EditBookingDialog. */
  onBookingClick: (booking: TBooking) => void;
}

/**
 * Riga settimana nella Timeline: pill data cliccabile (Popover + Calendar
 * picker) + lista dei booking della settimana (TimelineBookingCard per
 * ognuno) o empty state. Bordo evidenziato se la settimana è "current"
 * (oggi cade dentro) o se è "shifted" (data spostata manualmente dal coach).
 * Opacity ridotta se la settimana è passata.
 */
export function TimelineWeekRow<TBooking extends TimelineBookingItem = TimelineBookingItem>({
  row,
  idx,
  today,
  weekBookings,
  eventTypes,
  onWeekDateChange,
  onBookingClick,
}: TimelineWeekRowProps<TBooking>) {
  const date = row.monday_date ? parseISO(row.monday_date) : null;
  const weekEnd = date ? addDays(date, 7) : null;
  const isPast = weekEnd ? isBefore(weekEnd, today) : false;
  const isCurrent =
    date && weekEnd ? !isBefore(today, date) && isBefore(today, weekEnd) : false;

  return (
    <div className={cn("space-y-3", isPast && "opacity-70")}>
      {/* Pill date header */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-full bg-surface-container hover:bg-surface-container-high transition-colors rounded-full px-4 py-2 flex items-center justify-between border-2",
              isCurrent
                ? "border-primary ring-2 ring-primary/30 shadow-[0_0_16px_rgba(0,86,133,0.25)]"
                : row.shifted
                  ? "border-primary"
                  : "border-transparent",
            )}
            title={row.shifted ? "Settimana spostata" : "Modifica data"}
          >
            <span className="text-sm font-bold text-on-surface px-2">
              {date ? format(date, "EEEE d MMM", { locale: it }) : "—"}
            </span>
            <CalendarDays className="size-4 text-on-surface" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date ?? undefined}
            onSelect={(d) => d && onWeekDateChange(idx, d)}
            weekStartsOn={1}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {/* Bookings */}
      {weekBookings.length === 0 ? (
        <div className="border border-dashed border-border rounded-2xl p-4 flex items-center justify-center text-center bg-background/50 h-24">
          <span className="text-sm text-muted-foreground italic">
            Nessuna sessione prevista
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {weekBookings.map((bk) => (
            <TimelineBookingCard
              key={bk.id}
              booking={bk}
              eventType={eventTypes.find((e) => e.id === bk.event_type_id)}
              onClick={() => onBookingClick(bk)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
