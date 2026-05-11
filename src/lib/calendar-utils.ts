/**
 * Utility per generare un link "Aggiungi al Calendario" per Google Calendar
 * a partire da un booking, l'event_type associato e il nome del cliente.
 *
 * Format date richiesto: YYYYMMDDTHHmmssZ (UTC).
 */

export interface BookingLike {
  scheduled_at: string | Date;
}

export interface EventTypeLike {
  name?: string | null;
  duration?: number | null;
  location_type?: "physical" | "online" | string | null;
  location_address?: string | null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatGCalDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

export function generateGoogleCalendarLink(
  booking: BookingLike,
  eventType?: EventTypeLike | null,
  profileName?: string | null,
): string {
  const start =
    booking.scheduled_at instanceof Date ? booking.scheduled_at : new Date(booking.scheduled_at);
  const duration = eventType?.duration ?? 60;
  const end = new Date(start.getTime() + duration * 60_000);

  const eventName = eventType?.name?.trim() || "Sessione";
  const title = `${eventName} con NC Training`;

  const isOnline = eventType?.location_type === "online";
  const location = isOnline ? "Online" : eventType?.location_address?.trim() || "Online";

  const details = profileName
    ? `Sessione prenotata da ${profileName} tramite NC Training.`
    : "Sessione prenotata tramite NC Training.";

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", title);
  url.searchParams.set("dates", `${formatGCalDate(start)}/${formatGCalDate(end)}`);
  url.searchParams.set("details", details);
  url.searchParams.set("location", location);
  return url.toString();
}
