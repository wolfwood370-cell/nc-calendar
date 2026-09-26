// ----------------------------------------------------------------------------
// Check-in e assenza — cambi di stato fra programmata, svolta e assente
// ----------------------------------------------------------------------------
// Check-in: scheduled → completed. Assente: scheduled → no_show. «Annulla
// check-in», «Annulla assenza» e «Ripristina» del toast riportano a
// scheduled. Il credito resta impegnato in tutti e tre gli stati (holdsCredit
// in cancel-session.ts) e nessun trigger su bookings lo tocca in questi
// passaggi (misurato nelle migrazioni, passata 03): cambia solo lo stato.
// La scrittura passa dallo stesso store del dialog «Annulla o elimina
// sessione» (session-store.ts) e vale solo se la sessione ha ancora lo stato
// da cui si parte: un doppio clic, o un cambio fatto altrove, non la
// sovrascrive.
// ----------------------------------------------------------------------------

import { SessionChangedError, type SessionStore } from "@/lib/cancel-session";

export type SessionOutcome = "scheduled" | "completed" | "no_show";

export type OutcomeStore = Pick<SessionStore, "updateSession">;

/** Porta la sessione da `from` a `to`; SessionChangedError se nel frattempo è cambiata. */
export async function changeSessionOutcome(
  store: OutcomeStore,
  sessionId: string,
  from: SessionOutcome,
  to: SessionOutcome,
): Promise<void> {
  if (from === to) return;
  const ok = await store.updateSession(sessionId, { status: from, deleted: false }, { status: to });
  if (!ok) {
    throw new SessionChangedError("La sessione è stata modificata nel frattempo. Riprova.");
  }
}

/** Testo del toast dopo il cambio verso `to`. */
export function outcomeMessage(to: SessionOutcome, clientName: string): string {
  if (to === "completed") return `Sessione di ${clientName} segnata come svolta.`;
  if (to === "no_show") return `Assenza registrata per ${clientName}.`;
  return `Stato ripristinato: ${clientName} torna in agenda.`;
}

/** Copia dell'elenco con lo stato di una sessione cambiato (aggiornamento ottimistico). */
export function withOutcome<B extends { id: string; status: string }>(
  bookings: readonly B[],
  sessionId: string,
  status: SessionOutcome,
): B[] {
  return bookings.map((b) => (b.id === sessionId ? { ...b, status } : b));
}
