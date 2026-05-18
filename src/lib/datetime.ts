import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Tutte le date in DB sono salvate in UTC (`timestamptz`).
 * Queste utility convertono automaticamente in fuso orario locale.
 */

export function toUtcISO(date: Date): string {
  return date.toISOString();
}

export function fromUtc(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

export function formatLocal(value: string | Date, pattern = "dd/MM/yyyy HH:mm"): string {
  return format(fromUtc(value), pattern, { locale: it });
}

export function formatLocalDate(value: string | Date): string {
  return formatLocal(value, "dd MMM yyyy");
}

export function formatLocalTime(value: string | Date): string {
  return formatLocal(value, "HH:mm");
}

/**
 * Returns the user's IANA timezone label (e.g. "Europe/Rome") plus a short
 * GMT offset suffix (e.g. "GMT+1"). Used in booking-confirmation UI so
 * coaches and clients in different zones can resolve ambiguity.
 */
export function getUserTimezoneLabel(): { iana: string; offset: string; combined: string } {
  let iana = "Locale";
  try {
    iana = Intl.DateTimeFormat().resolvedOptions().timeZone || "Locale";
  } catch {
    // Some embedded environments don't expose Intl.DateTimeFormat
  }
  const now = new Date();
  const tzPart = now.toLocaleTimeString("it-IT", { timeZoneName: "shortOffset" }).split(" ").pop();
  const offset = tzPart && tzPart.startsWith("GMT") ? tzPart : `GMT${formatOffsetMinutes(now)}`;
  return { iana, offset, combined: `${iana} (${offset})` };
}

function formatOffsetMinutes(d: Date): string {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return mm === 0 ? `${sign}${hh}` : `${sign}${hh}:${String(mm).padStart(2, "0")}`;
}
