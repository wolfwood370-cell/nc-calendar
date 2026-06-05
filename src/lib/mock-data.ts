/**
 * Tipi ed helper condivisi per le sessioni. I dati reali sono caricati da
 * Supabase via react-query.
 */
export type SessionType = "PT Session" | "BIA" | "Functional Test";
export type BookingStatus = "scheduled" | "cancelled" | "completed" | "late_cancelled" | "no_show";

export function sessionLabel(t: SessionType): string {
  if (t === "PT Session") return "Sessione PT";
  if (t === "Functional Test") return "Test Funzionale";
  return "BIA";
}
