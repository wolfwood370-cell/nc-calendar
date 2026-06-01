/**
 * Helpers per generare l'URL pubblico "Add to Google Calendar"
 * (calendar.google.com/calendar/render) — usato dai pulsanti CTA che il
 * cliente clicca per aggiungere la sessione al PROPRIO calendario.
 *
 * NB: questo è il flusso lato cliente, separato dall'integrazione del
 * coach che usa il connettore Lovable Google Calendar via server fn
 * (vedi src/lib/gcal.functions.ts). Qui generiamo solo un link pubblico
 * GET, niente API.
 */

function formatGCalDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
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

export interface CalendarEventParams {
  sessionLabel: string;
  startsAt: Date;
  durationMinutes?: number;
  coachName: string;
  clientName: string;
  location?: string;
}

export function buildGoogleCalendarUrl(params: CalendarEventParams): string {
  const duration = params.durationMinutes ?? 60;
  const end = new Date(params.startsAt.getTime() + duration * 60_000);
  const text = `${params.sessionLabel} — ${params.clientName}`;
  const details = `Sessione tra ${params.coachName} (Coach) e ${params.clientName} (Cliente).`;

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", text);
  url.searchParams.set("dates", `${formatGCalDate(params.startsAt)}/${formatGCalDate(end)}`);
  url.searchParams.set("details", details);
  if (params.location) url.searchParams.set("location", params.location);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Variante "booking-shape": accetta un booking + event type + nome cliente,
// usata dai pulsanti CTA del flusso cliente.
// ---------------------------------------------------------------------------

export interface BookingLike {
  scheduled_at: string | Date;
}

export interface EventTypeLike {
  name?: string | null;
  duration?: number | null;
  location_type?: "physical" | "online" | string | null;
  location_address?: string | null;
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
