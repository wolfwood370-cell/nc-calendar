import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { sessionLabel } from "@/lib/mock-data";
import type { BookingRow, EventTypeRow } from "@/lib/queries";

function statusMeta(status: BookingRow["status"]) {
  switch (status) {
    case "completed":
      return { label: "Completata", cls: "bg-success/10 text-success" };
    case "cancelled":
      return { label: "Annullata", cls: "bg-destructive/10 text-destructive" };
    case "late_cancelled":
      return { label: "Cancellazione tardiva", cls: "bg-destructive/10 text-destructive" };
    case "no_show":
      return { label: "No Show", cls: "bg-destructive/10 text-destructive" };
    default:
      return { label: "In programma", cls: "bg-primary/10 text-primary" };
  }
}

interface TimelineCardProps {
  booking: BookingRow;
  eventTypes: readonly EventTypeRow[];
  compact?: boolean;
}

function TimelineCard({ booking, eventTypes, compact = false }: TimelineCardProps) {
  const et = booking.event_type_id ? eventTypes.find((e) => e.id === booking.event_type_id) : null;
  const typeName = et?.name ?? sessionLabel(booking.session_type);
  const color = et?.color ?? "#003e62";
  const title = booking.title?.trim() || typeName;
  const d = new Date(booking.scheduled_at);
  const dateStr = d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeStr = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const status = statusMeta(booking.status);

  return (
    <Link
      to="/client/bookings/$bookingId"
      params={{ bookingId: booking.id }}
      className={`block bg-surface-container-lowest/60 backdrop-blur-xl rounded-[24px] border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:bg-white/80 transition-colors ${compact ? "p-4" : "p-5"}`}
    >
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex flex-col gap-1">
          <p
            className={`font-semibold text-on-surface truncate leading-tight ${compact ? "text-sm" : "text-base"}`}
          >
            {title}
          </p>
          <p className={`text-on-surface-variant ${compact ? "text-xs" : "text-sm"}`}>
            {dateStr} · {timeStr}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ backgroundColor: `${color}1a`, color }}
          >
            {typeName}
          </span>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${status.cls}`}
          >
            {status.label}
          </span>
        </div>
      </div>
    </Link>
  );
}

export interface ClientSessionTimelineProps {
  /** Tutti i bookings del cliente (filtrati upstream se necessario). */
  bookings: readonly BookingRow[];
  /** Catalogo event types per la label tipo + color. */
  eventTypes: readonly EventTypeRow[];
}

/**
 * Vertical timeline delle sessioni passate del cliente. Mostra le 5 più
 * recenti come timeline verticale, le altre sono raggruppate per mese in
 * un archivio collassabile. Empty state se non ci sono sessioni completate.
 *
 * Estratto da client.index.tsx — comprende anche helper interno
 * TimelineCard (singola riga) e statusMeta (mappa status → label/cls).
 */
export function ClientSessionTimeline({ bookings, eventTypes }: ClientSessionTimelineProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  const past = useMemo(
    () =>
      bookings
        .filter((b) => new Date(b.scheduled_at).getTime() < Date.now())
        .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)),
    [bookings],
  );

  const recent = past.slice(0, 5);
  const archive = past.slice(5);

  const archiveByMonth = useMemo(() => {
    const groups = new Map<string, BookingRow[]>();
    for (const b of archive) {
      const d = new Date(b.scheduled_at);
      const key = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
      const arr = groups.get(key) ?? [];
      arr.push(b);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [archive]);

  if (past.length === 0) {
    return (
      <div className="bg-surface-container-lowest/60 backdrop-blur-xl rounded-[24px] border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6 text-sm text-on-surface-variant text-center">
        Non hai ancora completato nessuna sessione.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-stack-md">
      {/* Vertical timeline */}
      <ol className="relative border-l-2 border-outline-variant/30 pl-6 ml-2 flex flex-col gap-5">
        {recent.map((b) => (
          <li key={b.id} className="relative">
            <span
              aria-hidden
              className="absolute -left-[1.95rem] top-4 w-3 h-3 rounded-full bg-primary ring-4 ring-primary/20"
            />
            <TimelineCard booking={b} eventTypes={eventTypes} />
          </li>
        ))}
      </ol>

      {/* Archive */}
      {archive.length > 0 && (
        <div className="flex flex-col gap-stack-md">
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            className="self-center inline-flex items-center gap-2 px-5 py-2 rounded-full border border-outline-variant text-on-surface-variant text-sm font-medium bg-white/40 backdrop-blur hover:bg-white/70 transition-colors"
            aria-expanded={archiveOpen}
          >
            {archiveOpen ? "Nascondi Archivio" : "Visualizza Archivio"}
            <ChevronDown
              className={`size-4 transition-transform ${archiveOpen ? "rotate-180" : ""}`}
            />
          </button>

          {archiveOpen && (
            <div className="flex flex-col gap-stack-md animate-in fade-in slide-in-from-top-1 duration-300">
              {archiveByMonth.map(([month, items]) => (
                <div key={month} className="flex flex-col gap-2">
                  <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider ml-1 capitalize">
                    {month}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {items.map((b) => (
                      <TimelineCard key={b.id} booking={b} eventTypes={eventTypes} compact />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
