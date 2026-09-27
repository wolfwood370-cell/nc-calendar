// ----------------------------------------------------------------------------
// Pillola di Google Calendar della Disponibilità (passata 08, D5)
// ----------------------------------------------------------------------------
// Se Google risponde adesso non lo misura nessuno (lo stato dal vivo è della
// passata 09), e la pagina non chiama Google: la pillola dice solo quello che
// si sa in questo browser, cioè l'ora dell'ultima sincronizzazione riuscita
// (gcal_reconcile_ok, scritta da use-gcal-sync.ts). «ora» sotto il minuto,
// poi formatAgo, come l'etichetta del Calendario.
// ----------------------------------------------------------------------------

import { formatAgo } from "@/lib/notifications";

/** Il valore salvato, o null se manca o non è un numero. */
export function parseSyncStamp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function gcalSyncPillText(lastOk: number | null, now: Date): string {
  if (lastOk === null) return "Google Calendar · non ancora sincronizzato da questo browser";
  if (now.getTime() - lastOk < 60_000) return "Google Calendar · sincronizzato ora";
  return `Google Calendar · sincronizzato ${formatAgo(new Date(lastOk).toISOString(), now)}`;
}
