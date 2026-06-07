import { HelpCircle, Calendar, Clock, User, Video, MapPin, Pencil, Trash2, ExternalLink, X } from "lucide-react";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import {
  isAllDayEvent,
  IMPORT_PREFIX,
  personalBlockTitle,
} from "@/components/mobile-calendar-agenda";
import type { EventPlacement } from "@/lib/calendar-layout";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

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
  meeting_link?: string | null;
  google_event_id?: string | null;
  trainer_notes?: string | null;
}

export interface CalendarEventTileEventType {
  name: string;
  color: string | null;
  duration: number;
  location_type?: string | null;
  location_address?: string | null;
}

export interface CalendarEventTileClient {
  full_name: string | null;
  email?: string | null;
}

export interface CalendarEventTileProps {
  booking: CalendarEventBooking;
  placement: EventPlacement | undefined;
  eventType: CalendarEventTileEventType | undefined;
  client: CalendarEventTileClient | undefined;
  hourHeight: number;
  startHour: number;
  endHour: number;
  /** Apre il dialog di review per varianti unassigned/external. */
  onOpenReview: (bookingId: string) => void;
  /** Naviga al profilo del cliente. */
  onFocusClient: (clientId: string | null) => void;
  /** Apre il dialog di modifica completo. */
  onEdit?: (bookingId: string) => void;
  /** Annulla l'evento (status=cancelled). */
  onCancel?: (bookingId: string) => void;
}

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
  onEdit,
  onCancel,
}: CalendarEventTileProps) {
  if (isAllDayEvent(booking)) return null;
  const d = new Date(booking.scheduled_at);
  const hour = d.getHours() + d.getMinutes() / 60;
  if (hour < startHour || hour >= endHour) return null;

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

  // Un evento è "puramente personale" solo se non ha cliente associato.
  // I booking con is_personal=true ma client_id valorizzato (es. import da Google) sono trattati come sessioni cliente.
  const isPersonal = !!booking.is_personal && !booking.client_id;
  const isUnassigned = !isPersonal && !booking.client_id;
  // "External" = evento importato da Google senza tipologia assegnata (client_id==coach_id come placeholder).
  // Se ha già un event_type_id valido, lo trattiamo come sessione certificata con colore della tipologia.
  const isExternal =
    !isPersonal && !booking.event_type_id && !!booking.client_id && booking.client_id === booking.coach_id;

  const typeLabel =
    eventType?.name ?? (booking.session_type ? sessionLabel(booking.session_type) : "Sessione");
  const safeDuration = duration > 0 ? duration : 60;
  const endDate = new Date(d.getTime() + safeDuration * 60000);
  const timeLabel = `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  const dateLabel = d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

  if (isPersonal) {
    const title = personalBlockTitle(booking);
    return (
      <button
        style={laneStyle}
        onClick={() => onEdit?.(booking.id)}
        className="absolute z-10 bg-surface-container-high border border-outline-variant/40 rounded-2xl p-2 text-left hover:bg-surface-container transition-colors cursor-pointer"
        aria-label={`Impegno personale: ${title} — modifica`}
      >
        <h4 className="text-[12px] leading-tight font-semibold text-on-surface truncate">
          {title}
        </h4>
        <p className="text-[10px] text-outline mt-0.5">Personale · {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</p>
      </button>
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

  // ----- Certified: colored tile + Google-Calendar-style popover -----
  const eventColor = eventType?.color || "#003e62";
  const isOnline = eventType?.location_type === "online" || !!booking.meeting_link;
  const gcalUrl = booking.google_event_id
    ? `https://calendar.google.com/calendar/u/0/r/eventedit/${booking.google_event_id}`
    : null;

  const clientName = client?.full_name?.trim() || null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          style={{
            ...laneStyle,
            backgroundColor: eventColor,
          }}
          className="absolute z-10 rounded-xl px-2 py-1.5 flex flex-col justify-start text-left shadow-sm hover:shadow-md hover:scale-[1.02] hover:z-20 transition-all cursor-pointer ring-1 ring-black/5"
        >
          <h4 className="text-[12px] leading-tight font-semibold text-white truncate drop-shadow-sm">
            {typeLabel}
          </h4>
          {clientName && (
            <p className="text-[11px] leading-tight font-medium text-white/95 truncate">
              {clientName}
            </p>
          )}
          <p className="text-[10px] text-white/85 mt-0.5 truncate">
            {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
          </p>

        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        className="w-80 p-0 overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Header colorato come l'evento */}
        <div
          className="px-4 py-3 text-white"
          style={{ backgroundColor: eventColor }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-tight truncate">
                {typeLabel}
              </h3>
              <p className="text-xs text-white/85 mt-0.5 capitalize">{dateLabel}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium">
              <Clock className="size-3" />
              {safeDuration} min
            </span>
          </div>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <div className="flex items-start gap-2.5">
            <Calendar className="size-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>{timeLabel}</span>
          </div>

          {client && (
            <div className="flex items-start gap-2.5">
              <User className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium truncate">{client.full_name || "Cliente"}</p>
                {client.email && (
                  <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                )}
              </div>
            </div>
          )}

          {isOnline && booking.meeting_link && (
            <div className="flex items-start gap-2.5">
              <Video className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <a
                href={booking.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate"
              >
                Partecipa al meeting
              </a>
            </div>
          )}

          {!isOnline && eventType?.location_address && (
            <div className="flex items-start gap-2.5">
              <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{eventType.location_address}</span>
            </div>
          )}

          {booking.trainer_notes && (
            <div className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
              {booking.trainer_notes}
            </div>
          )}
        </div>

        <div className="border-t flex items-center gap-1 px-2 py-2 bg-muted/30">
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 gap-1.5 text-xs"
              onClick={() => onEdit(booking.id)}
            >
              <Pencil className="size-3.5" /> Modifica
            </Button>
          )}
          {client && booking.client_id && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 gap-1.5 text-xs"
              onClick={() => onFocusClient(booking.client_id)}
            >
              <User className="size-3.5" /> Profilo
            </Button>
          )}
          {gcalUrl && (
            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-2 text-xs rounded-md hover:bg-muted text-muted-foreground"
              title="Apri in Google Calendar"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <div className="flex-1" />
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Annullare questo evento?")) onCancel(booking.id);
              }}
            >
              <Trash2 className="size-3.5" /> Annulla
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
