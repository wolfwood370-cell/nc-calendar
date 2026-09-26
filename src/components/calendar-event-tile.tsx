// ----------------------------------------------------------------------------
// Tile di un evento nella griglia del Calendario desktop (audit C4, passata 04)
// ----------------------------------------------------------------------------
// Sessione cliente: fondo del colore della tipologia, nome del cliente e
// «Tipologia · ora» (solo se il tile è alto almeno 38px), spunta bianca se il
// cliente ha confermato la presenza. Svolta: 62% di opacità e CheckCircle2.
// Assente: rosso tenue. Consulenza esterna: colore della tipologia. Impegno
// personale: grigio. Da assegnare: tratteggio arancione e CircleHelp.
// Selezionato: anello bianco e nero. Il clic apre il pannello dettagli (o
// «Assegna evento» per gli eventi da assegnare) e non arriva alla colonna.
// ----------------------------------------------------------------------------

import { Check, CheckCircle2, CircleHelp, UserX } from "lucide-react";
import type { CSSProperties } from "react";
import type { TileView } from "@/lib/calendar-events";
import { cn } from "@/lib/utils";

export interface CalendarEventTileProps {
  view: TileView;
  /** Colore della tipologia (sessioni e consulenze). */
  color: string;
  top: number;
  height: number;
  /** Colonna nelle sovrapposizioni. */
  col: number;
  cols: number;
  selected: boolean;
  onOpen: () => void;
}

const SHOW_SUB_MIN_PX = 38;

export function CalendarEventTile({
  view,
  color,
  top,
  height,
  col,
  cols,
  selected,
  onOpen,
}: CalendarEventTileProps) {
  const width = 100 / cols;
  const colored =
    view.variant === "session" || view.variant === "done" || view.variant === "consulenza";
  const style: CSSProperties = {
    top,
    height,
    left: `calc(${col * width}% + 3px)`,
    width: `calc(${width}% - 6px)`,
    ...(colored ? { backgroundColor: color } : {}),
  };
  const Icon =
    view.variant === "done"
      ? CheckCircle2
      : view.variant === "noshow"
        ? UserX
        : view.variant === "assign"
          ? CircleHelp
          : null;
  return (
    <button
      type="button"
      data-tile
      aria-label={`${view.title}, ${view.sub}`}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      style={style}
      className={cn(
        "absolute z-[2] flex flex-col items-start gap-px overflow-hidden rounded-[10px] px-[7px] py-1 text-left",
        colored && "border border-transparent text-white",
        view.variant === "done" && "opacity-[0.62]",
        view.variant === "noshow" && "border border-danger-line bg-danger-soft text-danger-text",
        view.variant === "personal" &&
          "border border-outline-variant bg-surface-container-high text-on-surface-variant",
        view.variant === "assign" &&
          "border-[1.5px] border-dashed border-assign-line bg-assign-soft text-tertiary-container",
        selected
          ? "shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#191c1f]"
          : "shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-1">
        {Icon && <Icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />}
        <span className="min-w-0 flex-1 truncate text-xs font-bold leading-tight">
          {view.title}
        </span>
        {view.confirmed && (
          <span
            title="Presenza confermata dal cliente"
            className="grid size-[15px] shrink-0 place-items-center rounded-full bg-white text-success-text"
          >
            <Check className="size-2.5" strokeWidth={3} aria-hidden />
          </span>
        )}
      </span>
      {height >= SHOW_SUB_MIN_PX && (
        <span className="w-full truncate text-[11px] leading-tight opacity-[0.92]">{view.sub}</span>
      )}
    </button>
  );
}
