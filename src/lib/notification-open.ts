// ----------------------------------------------------------------------------
// Una notifica toccata con l'app già sulla sua pagina (passata 11 del lato
// cliente)
// ----------------------------------------------------------------------------
// public/push-sw.js, se una finestra è già sull'indirizzo della notifica, le
// dà il fuoco e le manda { type: NOTIFICATION_OPEN, url }: l'indirizzo non
// cambia, e il Calendario del telefono deve sapere che la data va scelta di
// nuovo (prima, dopo un altro giorno toccato a mano, restava su quello).
// ----------------------------------------------------------------------------

export const NOTIFICATION_OPEN = "nc-notification-open";

/** Il messaggio del service worker per una notifica toccata su questa pagina. */
export function notificationOpenUrl(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as { type?: unknown; url?: unknown };
  return m.type === NOTIFICATION_OPEN && typeof m.url === "string" ? m.url : null;
}

/** La notifica riguarda il Calendario del coach. */
export function opensCoachCalendar(url: string): boolean {
  try {
    return new URL(url, "https://x.invalid").pathname === "/trainer/calendar";
  } catch {
    return false;
  }
}
