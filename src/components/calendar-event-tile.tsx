import {
  HelpCircle,
  Clock,
  User,
  Video,
  MapPin,
  Pencil,
  Trash2,
  ExternalLink,
  Check,
  AlertCircle,
} from "lucide-react";
import { Close as PopoverClose } from "@radix-ui/react-popover";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import {
  isAllDayEvent,
  IMPORT_PREFIX,
  personalBlockTitle,
} from "@/components/mobile-calendar-agenda";
import type { EventPlacement } from "@/lib/calendar-layout";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

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
  /** Design handoff: conferma presenza del cliente (✓ sul tile). */
  client_confirmed_at?: string | null;
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
    !isPersonal &&
    !booking.event_type_id &&
    !!booking.client_id &&
    booking.client_id === booking.coach_id;

  const typeLabel =
    booking.title?.trim() ||
    eventType?.name ||
    (booking.session_type ? sessionLabel(booking.session_type) : "Sessione");
  const safeDuration = duration > 0 ? duration : 60;
  const endDate = new Date(d.getTime() + safeDuration * 60000);
  const timeLabel = `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

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
        <p className="text-[10px] text-outline mt-0.5">
          Personale · {d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </button>
    );
  }

  if (isUnassigned) {
    return (
      <button
        onClick={() => onOpenReview(booking.id)}
        style={laneStyle}
        className="absolute z-10 border-2 border-dashed border-warning-border bg-warning-container/40 rounded-2xl p-2 flex flex-col items-center justify-center gap-0.5 text-tertiary-container hover:bg-warning-container/70 hover:scale-[1.02] transition-all cursor-pointer"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <HelpCircle className="size-3.5" /> Assegna
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
  const eventColor = eventType?.color || "#9AA0A6";
  const isOnline = eventType?.location_type === "online" || !!booking.meeting_link;
  const gcalUrl = booking.google_event_id
    ? `https://calendar.google.com/calendar/u/0/r/eventedit/${booking.google_event_id}`
    : null;

  const clientName = client?.full_name?.trim() || null;
  // Design handoff: ✓ quando il cliente ha confermato la presenza.
  const isConfirmed = !!booking.client_confirmed_at;

  const startTime = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const endTime = endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const compact = height < 52;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          style={{
            ...laneStyle,
            backgroundColor: eventColor,
          }}
          className="absolute z-10 rounded-[10px] px-2 py-[3px] flex flex-col justify-start text-left shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:z-20 transition-all cursor-pointer overflow-hidden"
        >
          <h4
            className={`text-[11px] leading-[1.15] font-semibold text-white truncate drop-shadow-sm ${isConfirmed ? "pr-11" : ""}`}
          >
            {typeLabel}
          </h4>
          {/* Badge "cliente" come da prototipo (.cli): pill in alto a destra */}
          {isConfirmed && (
            <span
              aria-label="Presenza confermata dal cliente"
              className="absolute top-[3px] right-1 rounded-full bg-white/90 px-[5px] py-px text-[8px] font-bold tracking-[0.04em] text-aura-primary"
            >
              ✓ cliente
            </span>
          )}
          {compact ? (
            <p className="text-[10px] leading-[1.15] text-white/90 truncate">
              {clientName ? `${clientName} · ${startTime}` : startTime}
            </p>
          ) : (
            <>
              {clientName && (
                <p className="text-[10px] leading-[1.15] font-medium text-white/95 truncate">
                  {clientName}
                </p>
              )}
              <p className="text-[10px] leading-[1.15] text-white/85 truncate">{startTime}</p>
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        className="w-[250px] rounded-[18px] border border-surface-container p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Card bianca come da prototipo: pallino tipologia + titolo + chiudi */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: eventColor }}
            />
            <strong className="text-[15px] font-bold text-on-surface truncate">{typeLabel}</strong>
          </div>
          <PopoverClose
            aria-label="Chiudi"
            className="text-sm leading-none text-outline cursor-pointer"
          >
            ✕
          </PopoverClose>
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5 text-[13px] text-on-surface-variant">
          <div className="flex items-center gap-2">
            <Clock className="size-[15px] shrink-0 text-outline" />
            <span>
              {startTime} – {endTime}
            </span>
          </div>

          {client && (
            <div className="flex items-center gap-2">
              <User className="size-[15px] shrink-0 text-outline" />
              <span className="truncate">{client.full_name || "Cliente"}</span>
            </div>
          )}

          {/* Stato conferma del cliente come da prototipo */}
          {client &&
            (isConfirmed ? (
              <div className="flex items-center gap-2 font-semibold text-success-strong">
                <Check className="size-[15px] shrink-0" strokeWidth={2.5} />
                Presenza confermata
              </div>
            ) : (
              <div className="flex items-center gap-2 font-semibold text-warning-strong">
                <AlertCircle className="size-[15px] shrink-0" />
                In attesa di conferma
              </div>
            ))}

          {isOnline && booking.meeting_link && (
            <div className="flex items-center gap-2">
              <Video className="size-[15px] shrink-0 text-outline" />
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
            <div className="flex items-start gap-2">
              <MapPin className="size-[15px] shrink-0 text-outline mt-0.5" />
              <span>{eventType.location_address}</span>
            </div>
          )}

          {booking.trainer_notes && (
            <div className="rounded-xl bg-surface-container-low p-2.5 text-xs">
              {booking.trainer_notes}
            </div>
          )}
        </div>

        {/* Azioni: pill come da prototipo (bianche + eliminazione rossa) */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {onEdit && (
            <button
              onClick={() => onEdit(booking.id)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant bg-white py-[7px] text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            >
              <Pencil className="size-3.5" /> Modifica
            </button>
          )}
          {client && booking.client_id && (
            <button
              onClick={() => onFocusClient(booking.client_id)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full border border-outline-variant bg-white py-[7px] text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            >
              <User className="size-3.5" /> Profilo
            </button>
          )}
          {gcalUrl && (
            <a
              href={gcalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-outline-variant bg-white p-[7px] text-on-surface-variant hover:bg-surface-container transition-colors"
              title="Apri in Google Calendar"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          {onCancel && (
            <button
              onClick={() => {
                if (confirm("Annullare questo evento?")) onCancel(booking.id);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#fef2f2] py-[7px] text-xs font-bold text-error-strong hover:bg-[#fee2e2] transition-colors cursor-pointer"
            >
              <Trash2 className="size-3.5" /> Annulla
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
