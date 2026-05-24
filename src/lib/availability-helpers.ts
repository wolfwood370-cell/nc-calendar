// ----------------------------------------------------------------------------
// Helpers condivisi tra trainer.availability route e AvailabilityExceptionsCard.
// Estratto da trainer.availability.tsx per riusare HOURS picker + fmt time
// formatter in entrambi i contesti senza duplicazione.
// ----------------------------------------------------------------------------

/**
 * 48 slot orari ogni 30 min (00:00, 00:30, …, 23:30) come stringhe HH:MM,
 * usati dai Select per inizio/fine fascia disponibilità e fasce eccezione.
 */
export const HOURS: readonly string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

/**
 * Tronca un valore time stringa (es. "09:00:00" da Postgres) ai primi 5
 * caratteri "HH:MM" per uniformare il display nei picker.
 */
export function fmt(t: string): string {
  return t.slice(0, 5);
}
