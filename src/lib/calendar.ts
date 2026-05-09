/**
 * Genera un URL Google Calendar "Add to Calendar" per una sessione.
 * Le date sono convertite nel formato richiesto: YYYYMMDDTHHmmssZ (UTC).
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
