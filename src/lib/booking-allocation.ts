// ----------------------------------------------------------------------------
// La chiave del pool di credito di una tipologia. Pura: la usano i conteggi
// dei crediti (credits.ts, client-credits.ts) e chi raggruppa per tipologia.
// Il credito da scalare alla prenotazione non lo sceglie più l'app: lo dice
// la finestra del giorno scelto (getCreditWindows, client-credits.ts), e
// block_id lo scrive use-book-confirm.ts (passata 02 del lato cliente).
// ----------------------------------------------------------------------------

import type { SessionType } from "@/lib/mock-data";

/**
 * Chiave del pool di credito: event_type_id se presente, altrimenti il
 * session_type prefissato con `__` (gestione legacy delle allocations senza
 * event_type_id esplicito).
 */
export function allocKey(eventTypeId: string | null, type: SessionType): string {
  return eventTypeId ?? `__${type}`;
}
