import { DAY_LABELS, sameDay } from "@/components/mobile-calendar-agenda";

export interface CalendarDaysHeaderProps {
  /** 7 giorni della settimana visualizzata (lunedì → domenica). */
  weekDays: readonly Date[];
  /** Riferimento "oggi" per evidenziare la cella corrispondente in primary. */
  today: Date;
}

/**
 * Header 7-colonne del desktop grid coach calendar: ogni cella mostra
 * label (DAY_LABELS) + numero del giorno, con highlight primary quando
 * la cella corrisponde a `today`. Sticky in cima al grid.
 *
 * Estratto da trainer.calendar.tsx.
 */
export function CalendarDaysHeader({ weekDays, today }: CalendarDaysHeaderProps) {
  return (
    <div className="flex border-b border-surface-container bg-surface sticky top-0 z-20">
      <div className="w-16 shrink-0 border-r border-surface-container" />
      <div className="flex-1 grid grid-cols-7">
        {weekDays.map((d, i) => {
          const isToday = sameDay(d, today);
          return (
            <div
              key={i}
              className={`p-3 text-center border-r border-surface-container last:border-r-0 ${isToday ? "bg-primary-fixed/30" : ""}`}
            >
              <div
                className={`text-[11px] uppercase tracking-wider ${isToday ? "text-aura-primary font-bold" : "text-outline"}`}
              >
                {DAY_LABELS[i]}
              </div>
              <div
                className={`text-xl mt-1 ${isToday ? "text-aura-primary font-bold" : "font-semibold"}`}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
