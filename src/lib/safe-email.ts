// ----------------------------------------------------------------------------
// L'email dell'invito di Google Calendar (passata 09 del lato cliente)
// ----------------------------------------------------------------------------
// Un posto solo per il server, che decide se invitare il cliente
// (gcal.server.ts, gcalCreate), e per i testi del cliente che promettono
// l'invito (il Profilo, il dettaglio della sessione, l'esito di Prenota). Fino
// alla 08 i testi toglievano gli spazi ai lati e promettevano l'invito a ogni
// indirizzo, mentre il server non li toglieva e scartava gli indirizzi con
// spazi, virgolette e simili: il cliente leggeva di un invito che non
// arrivava. Nessun import: lo usano il server e il browser.
// ----------------------------------------------------------------------------

// Wave 7 P8: validazione attendee email prima di passarla a Google Calendar
// con sendUpdates=all. L'email arriva da `profiles.email` (impostata dal
// coach in fase di invito), ma un valore malformato o di lunghezza
// abusiva farebbe inviare un invito Google a un indirizzo arbitrario o
// triggererebbe errori 400 ripetuti. RFC 5321 limita la lunghezza totale
// a 254 caratteri; la regex è volutamente permissiva (Google fa la
// validazione vera) ma rifiuta whitespace, CRLF injection e formati
// chiaramente non-email.
const EMAIL_RE = /^[^\s@<>,;"'\\]+@[^\s@<>,;"'\\]+\.[^\s@<>,;"'\\]+$/;
export function isSafeEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  if (/[\r\n\t]/.test(email)) return false;
  return EMAIL_RE.test(email);
}

/**
 * L'indirizzo a cui arriva l'invito: l'email senza spazi ai lati, se Google
 * la riceve (isSafeEmail); altrimenti null, e nessun testo promette l'invito.
 */
export function inviteEmail(email: string | null | undefined): string | null {
  const address = (email ?? "").trim();
  return isSafeEmail(address) ? address : null;
}
