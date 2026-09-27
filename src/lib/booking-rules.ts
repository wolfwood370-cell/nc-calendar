// ----------------------------------------------------------------------------
// Regole di prenotazione del cliente (passata 08, D1)
// ----------------------------------------------------------------------------
// Una fonte sola per i numeri che Prenota applica (client.book.tsx li importa)
// e per i testi della card «Regole di prenotazione» della Disponibilità, che
// li mostra in sola lettura. trainer_settings (min_notice_hours,
// booking_horizon_days) non li applica nessuno: né Prenota, dal 27/08/2026,
// né il server.
// ----------------------------------------------------------------------------

import { RESCHEDULE_WINDOW_DAYS } from "@/lib/reschedule-slots";

/** Preavviso minimo per prenotare, in ore: nessuno. */
export const CLIENT_MIN_NOTICE_HOURS = 0;

/** Fin dove il cliente può prenotare, in giorni da oggi. */
export const CLIENT_BOOKING_HORIZON_DAYS = 90;

/**
 * Ore prima dell'inizio entro cui il cliente non può più spostare una
 * sessione. È la regola del server: il trigger validate_client_booking_update
 * rifiuta al cliente lo spostamento di una sessione che inizia fra meno di 24
 * ore; il foglio di riprogrammazione la anticipa.
 */
export const CLIENT_RESCHEDULE_CUTOFF_HOURS = 24;

/** Giorni in cui il cliente può scegliere il nuovo orario. */
export const CLIENT_RESCHEDULE_WINDOW_DAYS = RESCHEDULE_WINDOW_DAYS;

/** 0 → «Nessuno», 1 → «1 ora», N → «N ore». */
export function noticeLabel(hours: number): string {
  if (hours <= 0) return "Nessuno";
  return hours === 1 ? "1 ora" : `${hours} ore`;
}

/** «1 giorno in anticipo», «N giorni in anticipo». */
export function horizonLabel(days: number): string {
  return days === 1 ? "1 giorno in anticipo" : `${days} giorni in anticipo`;
}

/** La nota sotto le regole, coi numeri veri dello spostamento. */
export function bookingRulesNote(
  cutoffHours: number = CLIENT_RESCHEDULE_CUTOFF_HOURS,
  windowDays: number = CLIENT_RESCHEDULE_WINDOW_DAYS,
): string {
  const cutoff = cutoffHours === 1 ? "1 ora" : `${cutoffHours} ore`;
  const window = windowDays === 1 ? "del giorno successivo" : `dei ${windowDays} giorni successivi`;
  return (
    "Valgono per tutti i clienti, sempre entro la validità dei loro crediti, e per ora non si " +
    "cambiano da qui. Una sessione già prenotata il cliente può spostarla fino a " +
    `${cutoff} prima, su un orario ${window}.`
  );
}
