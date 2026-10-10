// ----------------------------------------------------------------------------
// ClientSessionRow — la riga di una sessione (lato cliente, passata 03)
// ----------------------------------------------------------------------------
// Un pulsante a tutta larghezza, come le righe delle Notifiche: il riquadro
// della data (50×52, raggio 14) nel colore della tipologia, le annullate sul
// fondo neutro; orario e tipologia con l'ellissi; il chip dello stato e la
// freccia. Alta almeno 72, raggio 18, bordo delle card. I testi, lo stato, il
// chip e i colori della tipologia vengono da sessionRow (client-sessions.ts);
// qui solo i token fissi (il fondo neutro delle annullate, la freccia) e nessun
// colore esadecimale. Niente Link: la pagina naviga lei, e la riga si rende
// anche fuori da un router (client-session-row.test.ts).
// ----------------------------------------------------------------------------

import { ChevronRight } from "lucide-react";
import type { SessionRowModel } from "@/lib/client-sessions";
import { cn } from "@/lib/utils";

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
