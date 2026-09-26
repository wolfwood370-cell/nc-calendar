// ----------------------------------------------------------------------------
// Griglia del Calendario desktop, settimana o giorno (audit C4, C5, C6)
// ----------------------------------------------------------------------------
// Card bianca con radius 28px; colonna ore 56px; righe da 48px dalle 07:00
// alle 22:00. Oggi con il fondo tenue e la linea rossa dell'ora corrente.
// Con «Disponibilità» accesa gli orari chiusi e le eccezioni sono tratteggiati.
// Il clic su uno spazio vuoto apre «Nuova sessione» all'ora cliccata,
// arrotondata al quarto d'ora (calendar-time.ts).
// ----------------------------------------------------------------------------

import { format } from "date-fns";
import { useEffect, useRef } from "react";
import { CalendarAllDayStrip, type AllDayItem } from "@/components/calendar-all-day-strip";
import { CalendarDaysHeader } from "@/components/calendar-days-header";
import { CalendarEventTile } from "@/components/calendar-event-tile";
import type { TileView } from "@/lib/calendar-events";
import {
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  HOUR_PX,
  nowLineOffset,
  offsetOf,
  timeFromOffset,
} from "@/lib/calendar-time";

export interface GridItem {
  id: string;
  view: TileView;
  color: string;
  start: Date;
  minutes: number;
}

export interface CalendarGridProps {
  days: readonly Date[];
  now: Date;
  itemsByDay: ReadonlyArray<readonly GridItem[]>;
  placements: ReadonlyArray<ReadonlyMap<string, { col: number; cols: number }>>;
  allDayByDay: ReadonlyArray<readonly AllDayItem[]>;
  /** Fasce chiuse in minuti per giorno, se «Disponibilità» è accesa. */
  closedByDay: ReadonlyArray<ReadonlyArray<readonly [number, number]>> | null;
  selectedId: string | null;
  /** Ora a cui portare lo scorrimento all'apertura del periodo. */
  focusHour: number;
  onOpenItem: (id: string) => void;
  onSlot: (day: Date, time: string) => void;
  onOpenDay: (day: Date) => void;
}

const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);
const TODAY_BG = "rgba(0,86,133,0.03)";

export function CalendarGrid(p: CalendarGridProps) {
  const gridCols = `56px repeat(${p.days.length}, minmax(0, 1fr))`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const periodKey = p.days.map((d) => format(d, "yyyy-MM-dd")).join(",");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (p.focusHour - 1 - GRID_START_HOUR) * HOUR_PX);
    // Solo quando cambia il periodo o l'evento da mostrare, non a ogni minuto.
  }, [periodKey, p.focusHour]);

  const todayKey = format(p.now, "yyyy-MM-dd");

  return (
    <section
      aria-label="Griglia del calendario"
      className="flex flex-col overflow-hidden rounded-[28px] border border-surface-container bg-white shadow-[0_4px_20px_rgba(0,86,133,0.05)]"
    >
      <CalendarDaysHeader days={p.days} today={p.now} gridCols={gridCols} onOpenDay={p.onOpenDay} />
      <CalendarAllDayStrip gridCols={gridCols} allDayByDay={p.allDayByDay} />
      <div ref={scrollRef} className="max-h-[calc(100vh-330px)] min-h-[420px] overflow-auto">
        <div className="relative grid" style={{ gridTemplateColumns: gridCols }}>
          <div className="relative" style={{ height: GRID_HEIGHT_PX }}>
            {HOURS.map((h, i) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-outline"
                style={{ top: i * HOUR_PX + (i === 0 ? 8 : 0) }}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {p.days.map((day, i) => {
            const isToday = format(day, "yyyy-MM-dd") === todayKey;
            const nowTop = nowLineOffset(day, p.now);
            const items = p.itemsByDay[i] ?? [];
            return (
              <div
                key={day.toISOString()}
                data-day={format(day, "yyyy-MM-dd")}
                title="Clic per creare una sessione"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  p.onSlot(day, timeFromOffset(e.clientY - rect.top));
                }}
                className="relative cursor-copy border-l border-surface-container-low"
                style={{
                  height: GRID_HEIGHT_PX,
                  backgroundColor: isToday ? TODAY_BG : "transparent",
                  backgroundImage: "linear-gradient(#eceef2 1px, transparent 1px)",
                  backgroundSize: `100% ${HOUR_PX}px`,
                }}
              >
                {(p.closedByDay?.[i] ?? []).map(([a, b]) => (
                  <div
                    key={`${a}-${b}`}
                    data-closed
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0"
                    style={{
                      top: ((a - GRID_START_HOUR * 60) / 60) * HOUR_PX,
                      height: ((b - a) / 60) * HOUR_PX,
                      background:
                        "repeating-linear-gradient(135deg, rgba(193,199,208,0.28) 0 6px, transparent 6px 12px)",
                    }}
                  />
                ))}
                {items.map((it) => {
                  const top = offsetOf(it.start);
                  const end = top + (it.minutes / 60) * HOUR_PX;
                  if (end <= 0 || top >= GRID_HEIGHT_PX) return null;
                  const place = p.placements[i]?.get(it.id) ?? { col: 0, cols: 1 };
                  return (
                    <CalendarEventTile
                      key={it.id}
                      view={it.view}
                      color={it.color}
                      top={Math.max(0, top)}
                      height={Math.max(22, (it.minutes / 60) * HOUR_PX - 3)}
                      col={place.col}
                      cols={place.cols}
                      selected={p.selectedId === it.id}
                      onOpen={() => p.onOpenItem(it.id)}
                    />
                  );
                })}
                {nowTop !== null && (
                  <div
                    data-now-line
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-[3] h-0.5 bg-error-bright"
                    style={{ top: nowTop }}
                  >
                    <span className="absolute -left-[5px] -top-1 size-2.5 rounded-full bg-error-bright" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
