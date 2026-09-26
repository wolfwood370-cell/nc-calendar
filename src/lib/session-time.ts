// ----------------------------------------------------------------------------
// Date e orari delle sessioni nei dialog coach
// ----------------------------------------------------------------------------
// Formati del prototipo (nc-store.js): «Giovedì 1 ottobre», «ven 26 set»,
// «10:00–11:00», «5 ott 2026». Ora locale del browser, come il resto dell'app.
// ----------------------------------------------------------------------------

import { addMinutes, format } from "date-fns";
import { it } from "date-fns/locale";

/** «Giovedì 1 ottobre». */
export function formatLongDay(d: Date): string {
  const s = format(d, "EEEE d MMMM", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «ven 26 set». */
export function formatShortDay(d: Date): string {
  return format(d, "EEE d MMM", { locale: it });
}

/** «5 ott 2026». */
export function formatShortDate(d: Date): string {
  return format(d, "d MMM yyyy", { locale: it });
}

/** «10:00–11:00»; durata mancante o non valida = 60 minuti. */
export function formatTimeRange(start: Date, durationMin: number | null | undefined): string {
  const minutes = durationMin && durationMin > 0 ? durationMin : 60;
  return `${format(start, "HH:mm")}–${format(addMinutes(start, minutes), "HH:mm")}`;
}
