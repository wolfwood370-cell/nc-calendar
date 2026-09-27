// ----------------------------------------------------------------------------
// Inviti e archivio della lista Clienti, con «Ripristina» (passata 05, L5, L6)
// ----------------------------------------------------------------------------
// Stesse scritture di prima (client_invitations.status, profiles.status), con
// in più la condizione sullo stato di partenza: «Ripristina» rimette la riga
// com'era solo se nessuno l'ha cambiata nel frattempo.
// Un invito non ha token né link suo: l'email porta all'app, e la
// registrazione lo aggancia per email finché è «pending». Rimettere la stessa
// riga a «pending» ridà lo stesso invito. Se nel frattempo è partito un altro
// invito alla stessa email, l'indice unico sugli inviti in attesa
// (idx_client_invitations_email_pending) lo impedisce, e «Ripristina» lo dice.
// ----------------------------------------------------------------------------

export interface ClientActionsStore {
  /** UPDATE client_invitations SET status = to WHERE id AND status = from; false se nessuna riga. */
  setInvitationStatus(id: string, from: string, to: string): Promise<boolean>;
  /** UPDATE profiles SET status = to WHERE id AND status = from; false se nessuna riga. */
  setClientStatus(id: string, from: string, to: string): Promise<boolean>;
}

export class ActionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionConflictError";
  }
}

const CHANGED = "Nel frattempo è cambiato: non ho toccato niente.";

/** Errore del database → messaggio per il coach. */
export function invitationWriteError(err: { code?: string; message?: string }): string {
  if (err.code === "23505") return "C'è già un altro invito in attesa per questa email.";
  return "Operazione non riuscita. Riprova.";
}

export async function cancelInvitation(store: ClientActionsStore, id: string): Promise<void> {
  if (!(await store.setInvitationStatus(id, "pending", "cancelled"))) {
    throw new ActionConflictError("L'invito non è più in attesa.");
  }
}

export async function restoreInvitation(store: ClientActionsStore, id: string): Promise<void> {
  if (!(await store.setInvitationStatus(id, "cancelled", "pending"))) {
    throw new ActionConflictError(CHANGED);
  }
}

/** Archivia o ripristina; restituisce lo stato di prima, per «Ripristina». */
export async function setArchived(
  store: ClientActionsStore,
  client: { id: string; status: string },
  archived: boolean,
): Promise<string> {
  const to = archived ? "archived" : "active";
  if (client.status === to) return client.status;
  if (!(await store.setClientStatus(client.id, client.status, to))) {
    throw new ActionConflictError(CHANGED);
  }
  return client.status;
}

export async function undoArchive(
  store: ClientActionsStore,
  client: { id: string },
  current: string,
  previous: string,
): Promise<void> {
  if (!(await store.setClientStatus(client.id, current, previous))) {
    throw new ActionConflictError(CHANGED);
  }
}

/** «inviato 3 giorni fa», «inviato oggi», «inviato ieri». */
export function sentAgo(createdAt: string, now: Date): string {
  const start = new Date(createdAt);
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((b - a) / 86_400_000);
  if (days <= 0) return "inviato oggi";
  if (days === 1) return "inviato ieri";
  return `inviato ${days} giorni fa`;
}
