// ----------------------------------------------------------------------------
// Striscia «Tutto il giorno» della griglia desktop (passata 04)
// ----------------------------------------------------------------------------
// Compare solo se nel periodo ci sono eventi giornalieri di Google
// (compleanni, ricorrenze).
// ----------------------------------------------------------------------------

import { IMPORT_PREFIX } from "@/components/mobile-calendar-agenda";

export interface AllDayItem {
  id: string;
  title: string | null;
  notes: string | null;
}

export interface CalendarAllDayStripProps {
  gridCols: string;
  allDayByDay: ReadonlyArray<readonly AllDayItem[]>;
}

function allDayTitle(b: AllDayItem): string {
  const title = b.title?.trim();
  if (title) return title;
  const notes = b.notes?.trim().replace(IMPORT_PREFIX, "").trim();
  return notes || "Evento giornaliero";
}

export function CalendarAllDayStrip({ gridCols, allDayByDay }: CalendarAllDayStripProps) {
  if (!allDayByDay.some((d) => d.length > 0)) return null;
  return (
    <div
      className="grid border-b border-surface-container bg-[#fbfbfd]"
      style={{ gridTemplateColumns: gridCols }}
    >
      <div className="px-1.5 py-2 text-right text-[10px] font-bold uppercase tracking-[0.04em] text-outline">
        Tutto il giorno
      </div>
      {allDayByDay.map((items, i) => (
        <div
          key={i}
          className="flex min-w-0 flex-col gap-1 border-l border-surface-container-low p-1.5"
        >
          {items.map((b) => {
            const title = allDayTitle(b);
            return (
              <span
                key={b.id}
                title={title}
                className="truncate rounded-lg bg-surface-container px-2 py-[3px] text-xs font-semibold text-on-surface-variant"
              >
                {title}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
