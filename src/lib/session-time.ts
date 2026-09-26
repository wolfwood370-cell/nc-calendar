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

/**
 * Data breve dentro una frase, con l'articolo: «il 5 ott 2026», «l'11 gen
 * 2027», «il 1° ott 2026»; con "da": «dal 5 ott 2026», «dall'8 ott 2026».
 * L'articolo segue la pronuncia del giorno (otto, undici); il primo del mese
 * si scrive «1°».
 */
export function shortDateWithArticle(d: Date, preposition?: "da"): string {
  const day = d.getDate();
  const label = day === 1 ? `1° ${format(d, "MMM yyyy", { locale: it })}` : formatShortDate(d);
  const elided = day === 8 || day === 11;
  if (preposition === "da") return elided ? `dall'${label}` : `dal ${label}`;
  return elided ? `l'${label}` : `il ${label}`;
}

/** «10:00–11:00»; durata mancante o non valida = 60 minuti. */
export function formatTimeRange(start: Date, durationMin: number | null | undefined): string {
  const minutes = durationMin && durationMin > 0 ? durationMin : 60;
  return `${format(start, "HH:mm")}–${format(addMinutes(start, minutes), "HH:mm")}`;
}
