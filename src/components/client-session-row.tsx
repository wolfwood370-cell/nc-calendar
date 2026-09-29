// ----------------------------------------------------------------------------
// ClientSessionRow — la riga di una sessione (lato cliente, passata 03)
// ----------------------------------------------------------------------------
// Un pulsante a tutta larghezza, come le righe delle Notifiche: il riquadro
// della data (50×52, raggio 14) nel colore della tipologia, le annullate sul
// fondo neutro; orario, tipologia con l'ellissi e, se valutata, la stella col
// voto; il chip dello stato e la freccia. Alta almeno 72, raggio 18, bordo
// delle card. I testi, lo stato, il chip e i colori della tipologia vengono da
// sessionRow (client-sessions.ts); qui solo i token fissi (il fondo neutro
// delle annullate, la stella, la freccia) e nessun colore esadecimale. Niente
// Link: la pagina naviga lei, e la riga si rende anche fuori da un router
// (client-session-row.test.ts).
// ----------------------------------------------------------------------------

import { ChevronRight } from "lucide-react";
import type { SessionRowModel } from "@/lib/client-sessions";
import { cn } from "@/lib/utils";

// La stella della valutazione, il path del prototipo (Cliente Sessioni.dc.html).
const STAR_PATH = "M12 17.3 6.2 21l1.6-6.6L2.4 9.6l6.8-.5L12 3l2.8 6.1 6.8.5-5.4 4.8 1.6 6.6z";

export interface ClientSessionRowProps {
  row: SessionRowModel;
  /** Il tocco: la pagina apre il dettaglio della sessione. */
  onOpen: (id: string) => void;
}

export function ClientSessionRow({ row, onOpen }: ClientSessionRowProps) {
  return (
    <button
      type="button"
      aria-label={row.ariaLabel}
      onClick={() => onOpen(row.id)}
      className="flex min-h-[72px] w-full items-center gap-3 rounded-[18px] border border-outline-variant/35 bg-white py-2.5 pr-3 pl-2.5 text-left text-on-surface"
    >
      <span
        className={cn(
          "flex h-[52px] w-[50px] shrink-0 flex-col items-center justify-center rounded-[14px]",
          !row.tile && "bg-surface-container-low text-on-surface-variant",
        )}
        style={row.tile ? { backgroundColor: row.tile.bg, color: row.tile.fg } : undefined}
      >
        <span className="text-xs font-semibold">{row.dow}</span>
        <span className="font-display text-[20px] leading-[1.1] font-bold tabular-nums">
          {row.day}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[15px] font-bold tabular-nums">{row.range}</span>
        <span className="truncate text-[13px] text-on-surface-variant">{row.type}</span>
        {row.rating && (
          <span className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR_PATH} fill="var(--color-rating-star)" />
            </svg>
            {row.rating}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
          row.chipTone.bg,
          row.chipTone.fg,
        )}
      >
        {row.chip}
      </span>
      <ChevronRight className="size-4 shrink-0 text-outline" aria-hidden />
    </button>
  );
}
