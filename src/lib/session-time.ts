// ----------------------------------------------------------------------------
// Date e orari delle sessioni, nei dialog del coach e per il cliente
// ----------------------------------------------------------------------------
// Formati del prototipo (nc-store.js): «Giovedì 1 ottobre», «ven 26 set»,
// «10:00–11:00», «5 ott 2026»; per il cliente (nc-client.js) «Oggi»,
// «Domani», «tra 25 min». Ora locale del browser, come il resto dell'app.
// La locale arriva da date-fns/locale/it e non dal barile date-fns/locale,
// che carica 95 locale in ogni file che lo importa.
// ----------------------------------------------------------------------------

import { addMinutes, differenceInCalendarDays, format } from "date-fns";
import { it } from "date-fns/locale/it";

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

/** Durata in minuti come nel prototipo (fmtDur): «30m», «1h», «1h 30m». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)}h${rest ? ` ${rest}m` : ""}`;
}

/** «10:00–11:00»; durata mancante o non valida = 60 minuti. */
export function formatTimeRange(start: Date, durationMin: number | null | undefined): string {
  const minutes = durationMin && durationMin > 0 ? durationMin : 60;
  return `${format(start, "HH:mm")}–${format(addMinutes(start, minutes), "HH:mm")}`;
}

/** «Oggi», «Domani», «Ieri», altrimenti «Mercoledì 30 settembre». Giorni di calendario. */
export function formatDayRel(d: Date, now: Date): string {
  const diff = differenceInCalendarDays(d, now);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  if (diff === -1) return "Ieri";
  return formatLongDay(d);
}

/**
 * Quanto manca all'inizio, come `until` del prototipo: «tra 25 min» sotto
 * l'ora (anche dopo la mezzanotte), «tra 1 ora» / «tra 3 ore» nello stesso
 * giorno, «domani», poi «tra 2 giorni» in giorni di calendario; null se è già
 * iniziata. Si aggiorna col passo di useNow, niente conti al secondo.
 */
export function formatUntil(start: Date, now: Date): string | null {
  const minutes = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `tra ${minutes} min`;
  const days = differenceInCalendarDays(start, now);
  if (days === 0) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "tra 1 ora" : `tra ${hours} ore`;
  }
  if (days === 1) return "domani";
  return `tra ${days} giorni`;
}
