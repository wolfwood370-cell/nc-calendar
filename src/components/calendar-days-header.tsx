// ----------------------------------------------------------------------------
// Intestazione dei giorni della griglia desktop (passata 04)
// ----------------------------------------------------------------------------
// Giorno della settimana e numero; oggi con il numero nel cerchio primario.
// Il clic su un giorno apre la vista giorno (C5).
// ----------------------------------------------------------------------------

import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface CalendarDaysHeaderProps {
  days: readonly Date[];
  today: Date;
  gridCols: string;
  onOpenDay: (day: Date) => void;
}

const sameDay = (a: Date, b: Date) => format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");

export function CalendarDaysHeader({ days, today, gridCols, onOpenDay }: CalendarDaysHeaderProps) {
  return (
    <div
      className="grid border-b border-surface-container"
      style={{ gridTemplateColumns: gridCols }}
    >
      <div />
      {days.map((d) => {
        const isToday = sameDay(d, today);
        const long = format(d, "EEEE d MMMM", { locale: it });
        return (
          <button
            key={d.toISOString()}
            type="button"
            onClick={() => onOpenDay(d)}
            title={`Apri ${long}`}
            className="flex flex-col items-center gap-1 border-l border-surface-container-low px-1 pb-2.5 pt-3 transition-colors hover:bg-surface"
          >
            <span
              className={cn(
                "text-[11px] font-bold uppercase tracking-[0.06em]",
                isToday ? "text-aura-primary" : "text-outline",
              )}
            >
              {format(d, "EEE", { locale: it })}
            </span>
            <span
              className={cn(
                "grid size-[34px] place-items-center rounded-full font-display text-[17px] font-semibold",
                isToday ? "bg-aura-primary text-white" : "text-on-surface",
              )}
              aria-current={isToday ? "date" : undefined}
            >
              {d.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
