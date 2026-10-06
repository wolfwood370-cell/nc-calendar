// Il giorno scelto nell'agenda del Calendario del telefono (passata 10b del lato cliente).
//
// Una notifica del coach apre /trainer/calendar?date=AAAA-MM-GG&event=… (openInCalendar,
// trainer-notifications-bell.tsx). Il Calendario del telefono usava la data solo per la settimana
// (calendar-mobile.tsx), e l'agenda sceglieva comunque oggi, o il lunedì: la sessione del 7 ottobre si
// apriva sul 6 (Nicolò, 06/10/2026). Qui la data chiesta vince, se cade nella settimana mostrata.
import { isValid, parseISO } from "date-fns";

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** L'indice del giorno `date` («AAAA-MM-GG», giorno locale) fra i giorni della settimana, o -1. */
export function dayIndexOf(weekDays: Date[], date: string | undefined | null): number {
  if (!date) return -1;
  const d = parseISO(date);
  if (!isValid(d)) return -1;
  return weekDays.findIndex((w) => sameDay(w, d));
}

/** Il giorno da scegliere all'apertura: la data chiesta se è in questa settimana, poi oggi, poi il lunedì. */
export function initialAgendaDayIndex(
  weekDays: Date[],
  date: string | undefined | null,
  today: Date,
): number {
  const asked = dayIndexOf(weekDays, date);
  if (asked >= 0) return asked;
  const t = weekDays.findIndex((w) => sameDay(w, today));
  return t >= 0 ? t : 0;
}
