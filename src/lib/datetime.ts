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
