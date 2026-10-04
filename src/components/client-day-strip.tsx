// ----------------------------------------------------------------------------
// ClientDayStrip — la fila dei giorni del cliente (lato cliente, passata 02,
// audit B1 e B3)
// ----------------------------------------------------------------------------
// I giorni di getClientSlotDays (client-slots.ts), da oggi all'ultimo giorno
// valido e niente oltre: un pulsante 60×80 per giorno, in una fila che scorre
// in orizzontale ed esce fino ai bordi dello schermo (margine negativo pari al
// margine della pagina, `gutter`: 16 in Prenota, 20 in Sposta). Tre aspetti:
// disponibile, scelto, non disponibile (disabled). Nome accessibile dal giorno
// e dal suo motivo (dayAriaLabel), stato con aria-pressed; Tab passa da un
// giorno all'altro.
// Il giorno scelto si porta in vista impostando scrollLeft della fila,
// all'apertura e quando la scelta cambia: scrollIntoView sposterebbe anche la
// pagina in verticale. L'anello del focus sta a filo del pulsante: la fila
// scorre, e 2 px sopra il pulsante c'è il bordo del suo riquadro.
// Il componente non sa cosa si prenota o si sposta: la regola sotto la fila e
// gli orari del giorno li mette chi lo usa.
// ----------------------------------------------------------------------------

import { useLayoutEffect, useRef } from "react";
import { dayAriaLabel, dayCaption, dayHead, type ClientSlotDay } from "@/lib/client-slots";
import { cn } from "@/lib/utils";

export interface ClientDayStripProps {
  days: readonly ClientSlotDay[];
  /** Il giorno scelto (YYYY-MM-DD), o null. */
  selectedIso: string | null;
  onSelect: (isoDate: string) => void;
  /** Il margine laterale della pagina, in px: la fila esce fino al bordo. */
  gutter?: number;
}

export function ClientDayStrip({ days, selectedIso, onSelect, gutter = 16 }: ClientDayStripProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || !selectedIso) return;
    const button = row.querySelector<HTMLElement>(`[data-day="${selectedIso}"]`);
    if (!button) return;
    // offsetLeft è rispetto alla fila (position: relative): il pulsante deve
    // stare fra i due margini, altrimenti la fila scorre quanto basta.
    const first = button.offsetLeft - gutter;
    const last = button.offsetLeft + button.offsetWidth + gutter - row.clientWidth;
    if (row.scrollLeft > first) row.scrollLeft = first;
    else if (row.scrollLeft < last) row.scrollLeft = last;
  }, [selectedIso, gutter]);

  return (
    <div
      ref={rowRef}
      className="relative flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ margin: `0 -${gutter}px`, padding: `2px ${gutter}px 6px` }}
    >
      {days.map((day) => {
        const on = day.isoDate === selectedIso;
        const off = day.slots.length === 0;
        const { dow, num } = dayHead(day);
        return (
          <button
            key={day.isoDate}
            type="button"
            data-day={day.isoDate}
            aria-pressed={on}
            aria-label={dayAriaLabel(day)}
            disabled={off}
            onClick={() => onSelect(day.isoDate)}
            className={cn(
              "flex h-20 w-[60px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[18px] border focus-visible:outline-offset-0",
              on
                ? "border-primary-container bg-primary-container text-white"
                : off
                  ? "border-transparent bg-surface-container-low text-outline"
                  : "border-surface-variant bg-white text-on-surface",
            )}
          >
            <span className="text-xs font-semibold">{dow}</span>
            <span className="font-display text-xl leading-tight font-bold tabular-nums">{num}</span>
            <span
              className={cn(
                "text-xs font-semibold",
                on ? "text-primary-fixed" : off ? "text-on-surface-variant" : "text-success-text",
              )}
            >
              {dayCaption(day)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
