/**
 * Estrae le iniziali (max 2 lettere) da nome utente, con fallback email
 * quando il nome manca. Regex split su spazi / `@` / `.` cosicché un email
 * tipo `mario.rossi@example.com` restituisca "MR" e un nome tipo
 * `"Mario Rossi"` restituisca anch'esso "MR". Fallback finale "?" se tutto
 * è vuoto.
 */
export function initials(name: string | null | undefined, email?: string | null): string {
  const src = (name && name.trim()) || (email ?? "?");
  return (
    src
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
