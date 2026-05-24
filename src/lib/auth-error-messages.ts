/**
 * Traduce un messaggio di errore raw da Supabase Auth in una stringa
 * user-facing italiana. Pattern matching case-insensitive su keyword
 * note. Fallback: ritorna il messaggio originale invariato (preserva
 * info se la classificazione fallisce).
 *
 * Estratto da auth.tsx — usato dai try/catch dei form login/signup.
 */
export function traduciErrore(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login")) return "Email o password non corrette.";
  if (m.includes("user already registered")) return "Questa email è già registrata.";
  if (m.includes("email not confirmed")) return "Conferma la tua email prima di accedere.";
  if (m.includes("non invitata") || m.includes("not invited")) {
    return "Questa email non è stata invitata da un Coach. Chiedi al tuo coach di inviarti un invito.";
  }
  if (m.includes("database error") || m.includes("unexpected_failure")) {
    return "Email non invitata da un Coach. Contatta il tuo coach per ricevere un invito.";
  }
  if (m.includes("password")) return "La password non soddisfa i requisiti.";
  return msg;
}
