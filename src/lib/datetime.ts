// toUtcISO / fromUtc / formatLocal / formatLocalDate RIMOSSI (audit 2026-06-06):
// helper mai usati. getUserTimezoneLabel resta (usato nella UI di conferma).

/**
 * Returns the user's IANA timezone label (e.g. "Europe/Rome") plus a short
 * GMT offset suffix (e.g. "GMT+1"). Used in booking-confirmation UI so
 * coaches and clients in different zones can resolve ambiguity.
 */
export function getUserTimezoneLabel(): { iana: string; offset: string; combined: string } {
  let iana = "Locale";
  try {
    iana = Intl.DateTimeFormat().resolvedOptions().timeZone || "Locale";
  } catch {
    // Some embedded environments don't expose Intl.DateTimeFormat
  }
  const now = new Date();
  const tzPart = now.toLocaleTimeString("it-IT", { timeZoneName: "shortOffset" }).split(" ").pop();
  const offset = tzPart && tzPart.startsWith("GMT") ? tzPart : `GMT${formatOffsetMinutes(now)}`;
  return { iana, offset, combined: `${iana} (${offset})` };
}

function formatOffsetMinutes(d: Date): string {
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return mm === 0 ? `${sign}${hh}` : `${sign}${hh}:${String(mm).padStart(2, "0")}`;
}
