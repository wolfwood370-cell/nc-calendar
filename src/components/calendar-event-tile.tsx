import { HelpCircle } from "lucide-react";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import {
  isAllDayEvent,
  IMPORT_PREFIX,
  personalBlockTitle,
} from "@/components/mobile-calendar-agenda";
import type { EventPlacement } from "@/lib/calendar-layout";

/** Subset structural del booking richiesto dal tile (campi consumati direttamente). */
export interface CalendarEventBooking {
  id: string;
  scheduled_at: string;
  client_id: string | null;
  coach_id: string | null;
  event_type_id: string | null;
  session_type: SessionType | null;
  duration_min: number | null;
  title: string | null;
  notes: string | null;
  is_personal: boolean | null;
}

/** Subset structural dell'event type richiesto per label/color/duration. */
export interface CalendarEventTileEventType {
  name: string;
  color: string | null;
  duration: number;
}

/** Subset structural del client per label "Cliente — typeLabel". */
export interface CalendarEventTileClient {
  full_name: string | null;
}

export interface CalendarEventTileProps {
  /** Booking da renderizzare. Se all-day o out-of-window, il tile ritorna null. */
  booking: CalendarEventBooking;
  /** Posizionamento lane assegnato da layoutDay (undefined = single lane). */
  placement: EventPlacement | undefined;
  /** Event type risolto dal parent (lookup eventTypesMap), undefined = fallback. */
  eventType: CalendarEventTileEventType | undefined;
  /** Client risolto dal parent (lookup clientsMap), undefined per personal/unassigned/external. */
  client: CalendarEventTileClient | undefined;
  /** Costante config: ore di altezza per ora (px). */
  hourHeight: number;
  /** Ora di inizio della finestra grid (ad es. 7). */
  startHour: number;
  /** Ora di fine (esclusa) della finestra grid (ad es. 22). */
  endHour: number;
  /** Click handler per varianti "unassigned" (no client) e "external" (client=coach_id). */
  onOpenReview: (bookingId: string) => void;
  /** Click handler per la variante "certified" (cliente normale). */
  onFocusClient: (clientId: string | null) => void;
}

/**
 * Tile evento singolo nella griglia desktop del coach calendar. 4 varianti
 * mutuamente esclusive in base a flag e campi del booking:
 *
 *   - personal      (is_personal=true)            → bg neutro, non cliccabile
 *   - unassigned    (no client_id, !is_personal)  → dashed warning, openReview
 *   - external      (client_id === coach_id)      → surface-low, openReview
 *   - certified     (regular client booking)      → colorato con event color
 *
 * Posizionamento via lane (placement) → side-by-side per overlapping events.
 * Ritorna null per all-day events o out-of-window per evitare render a
 * top-edge (safety net oltre il filtro upstream timedByDay).
 *
 * Estratto da trainer.calendar.tsx (renderEvent inline).
 */
export function CalendarEventTile({
  booking,
  placement,
  eventType,
  client,
  hourHeight,
  startHour,
  endHour,
  onOpenReview,
  onFocusClient,
}: CalendarEventTileProps) {
  // Safety net: timedByDay già esclude all-day, ma pre-existing booking con
  // midnight scheduled_at fuori dal range Google start.date può sfuggire.
  if (isAllDayEvent(booking)) return null;
  const d = new Date(booking.scheduled_at);
  const hour = d.getHours() + d.getMinutes() / 60;
  if (hour < startHour || hour >= endHour) return null;

  // H3: snapshot duration wins; eventType lookup è solo fallback per rows
  // pre-trigger migration 20260518120000.
  const duration = booking.duration_min ?? eventType?.duration ?? 60;
  const top = (hour - startHour) * hourHeight;
  const height = Math.max(28, (duration / 60) * hourHeight - 4);

  const cols = placement?.cols ?? 1;
  const col = placement?.col ?? 0;
  const widthPct = 100 / cols;
  const leftPct = col * widthPct;
  const laneStyle = {
    top,
    height,
    left: `calc(${leftPct}% + 4px)`,
    width: `calc(${widthPct}% - 8px)`,
  } as const;

  // Personal Block first: is_personal=true row non deve essere ri-classificata
  // come unassigned/external anche se old data ha client_id=coach_id.
  const isPersonal = !!booking.is_personal;
  const isUnassigned = !isPersonal && !booking.client_id;
  const isExternal =
    !isPersonal && !!booking.client_id && booking.client_id === booking.coach_id;

  const typeLabel =
    eventType?.name ?? (booking.session_type ? sessionLabel(booking.session_type) : "Sessione");
  const safeDuration = duration > 0 ? duration : 60;
  const timeLabel = `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} - ${new Date(d.getTime() + safeDuration * 60000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

  if (isPersonal) {
    const title = personalBlockTitle(booking);
    return (
      <div
        style={laneStyle}
        className="absolute z-10 bg-surface-container-high border border-outline-variant/40 rounded-2xl p-2 cursor-default"
        aria-label={`Impegno personale: ${title}`}
      >
        <h4 className="text-[12px] leading-tight font-semibold text-on-surface truncate">
          {title}
        </h4>
        <p className="text-[10px] text-outline mt-0.5">Personale · {timeLabel}</p>
      </div>
    );
  }

  if (isUnassigned) {
    return (
      <button
        onClick={() => onOpenReview(booking.id)}
        style={laneStyle}
        className="absolute z-10 border-2 border-dashed border-warning-border bg-warning-container/40 rounded-2xl p-2 flex flex-col items-center justify-center gap-1 text-tertiary hover:bg-warning-container/70 hover:scale-[1.02] transition-all cursor-pointer"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <HelpCircle className="size-3.5 animate-pulse" /> Assegna
        </div>
        <div className="text-[10px] opacity-80">{timeLabel}</div>
      </button>
    );
  }

  if (isExternal) {
    const title = (booking.notes ?? "").replace(IMPORT_PREFIX, "") || "Evento esterno";
    return (
      <button
        onClick={() => onOpenReview(booking.id)}
        style={laneStyle}
        className="absolute z-10 bg-surface-container-low border border-outline-variant/40 rounded-2xl p-2 text-left hover:bg-surface-container transition-colors cursor-pointer"
        aria-label={`Evento esterno: ${title} — assegna o segna come impegno personale`}
      >
        <h4 className="text-[12px] leading-tight font-medium text-on-surface-variant truncate">
          {title}
        </h4>
        <p className="text-[10px] text-outline mt-0.5">{timeLabel}</p>
      </button>
    );
  }

  // Certified — colora l'evento secondo il tipo
  const eventColor = eventType?.color || "#003e62";
  return (
    <button
      onClick={() => onFocusClient(booking.client_id)}
      style={{
        ...laneStyle,
        backgroundColor: `color-mix(in oklab, ${eventColor} 18%, white)`,
        borderLeft: `4px solid ${eventColor}`,
      }}
      className="absolute z-10 rounded-2xl p-2 flex flex-col justify-between text-left shadow-sm hover:shadow-md hover:scale-[1.02] hover:z-20 transition-all cursor-pointer"
    >
      <div>
        <h4
          className="text-[12px] leading-tight font-semibold truncate"
          style={{ color: `color-mix(in oklab, ${eventColor} 75%, black)` }}
        >
          {client?.full_name || "Cliente"} — {typeLabel || "Evento senza titolo"}
        </h4>
        <p
          className="text-[10px] mt-0.5"
          style={{ color: `color-mix(in oklab, ${eventColor} 65%, black)` }}
        >
          {timeLabel}
        </p>
      </div>
    </button>
  );
}
