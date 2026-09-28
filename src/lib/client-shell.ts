// ----------------------------------------------------------------------------
// La cornice del cliente, in un posto solo (lato cliente, passata 01, audit
// N2, N3, O2, T1 e V14)
// ----------------------------------------------------------------------------
// Le cinque schede (nome, percorso, icona e ordine), quale si accende per un
// percorso, dove c'è la barra in basso, il badge di Sessioni, i sottotitoli
// delle intestazioni, il titolo della scheda del browser e dove porta
// «Indietro» quando prima non c'è una pagina dell'app. Barra e header desktop
// leggono le schede da qui, così nomi e ordine sono scritti una volta.
// I percorsi si confrontano per segmenti, non per prefisso di stringa:
// "/client/bookings/abc".startsWith("/client/book") è vero, e prima sul
// dettaglio di una sessione si accendeva «Calendario».
// Puri: niente hook, niente rete; l'ora entra come parametro.
// ----------------------------------------------------------------------------

import { parseISO } from "date-fns";
import { CalendarDays, CalendarPlus, Home, Sparkles, User, type LucideIcon } from "lucide-react";
import { blockNumber } from "@/lib/client-credits";
import { getClientSessionStatus, type StatusBooking } from "@/lib/client-session-status";
import { blockTiming } from "@/lib/current-block";
import { clientReferenceBlock, isValidBlock, type RenewalBlock } from "@/lib/renewal";
import { formatLongDay } from "@/lib/session-time";

export type ClientTabKey = "home" | "prenota" | "sessioni" | "booster" | "profilo";

export type ClientTabPath =
  | "/client"
  | "/client/book"
  | "/client/sessions"
  | "/client/store"
  | "/client/settings";

export interface ClientTab {
  key: ClientTabKey;
  to: ClientTabPath;
  label: string;
  icon: LucideIcon;
}

/** Le cinque schede, nell'ordine della barra (O2, V14). */
export const CLIENT_TABS: readonly ClientTab[] = [
  { key: "home", to: "/client", label: "Home", icon: Home },
  { key: "prenota", to: "/client/book", label: "Prenota", icon: CalendarPlus },
  { key: "sessioni", to: "/client/sessions", label: "Sessioni", icon: CalendarDays },
  { key: "booster", to: "/client/store", label: "Booster", icon: Sparkles },
  { key: "profilo", to: "/client/settings", label: "Profilo", icon: User },
];

/** "/client/bookings/abc/" → ["client", "bookings", "abc"]. */
function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** Tutto ciò che sta sotto /client (e /client stesso); non /clients. */
export function isClientPath(pathname: string): boolean {
  return segments(pathname)[0] === "client";
}

/**
 * La scheda accesa: Home solo su /client; le altre sul loro percorso e sotto;
 * il dettaglio di una sessione (/client/bookings/…) accende Sessioni. Le
 * Notifiche e ogni altro percorso non ne accendono nessuna.
 */
export function activeClientTab(pathname: string): ClientTabKey | null {
  const segs = segments(pathname);
  if (segs[0] !== "client") return null;
  if (segs.length === 1) return "home";
  if (segs[1] === "bookings") return "sessioni";
  const tab = CLIENT_TABS.find((t) => t.key !== "home" && segments(t.to)[1] === segs[1]);
  return tab?.key ?? null;
}

/** La barra in basso sta sulle cinque schede, non sulle pagine aperte (dettaglio, Notifiche). */
export function showsTabBar(pathname: string): boolean {
  const key = activeClientTab(pathname);
  const tab = CLIENT_TABS.find((t) => t.key === key);
  return !!tab && segments(pathname).length === segments(tab.to).length;
}

/**
 * Il badge di Sessioni: le sessioni «Da confermare» (dalla 00: in programma,
 * non confermate e con l'inizio entro 48 ore). `label` è il nome accessibile
 * della scheda.
 */
export function sessionsBadge(
  bookings: readonly StatusBooking[],
  now: Date,
): { count: number; label: string } {
  const count = bookings.filter((b) => getClientSessionStatus(b, now).key === "toconfirm").length;
  return { count, label: count > 0 ? `Sessioni, ${count} da confermare` : "Sessioni" };
}

/**
 * Le sessioni in programma e non ancora finite (prenotate, da confermare,
 * confermate, in corso), come `upcoming` del prototipo: una sessione iniziata
 * da 20 minuti conta ancora.
 */
export function upcomingCount(bookings: readonly StatusBooking[], now: Date): number {
  return bookings.filter((b) => {
    const key = getClientSessionStatus(b, now).key;
    return key === "booked" || key === "toconfirm" || key === "confirmed" || key === "now";
  }).length;
}

/** «Nessuna sessione in programma» · «1 sessione in programma» · «6 sessioni in programma». */
export function sessionsSubtitle(n: number): string {
  if (n <= 0) return "Nessuna sessione in programma";
  return n === 1 ? "1 sessione in programma" : `${n} sessioni in programma`;
}

/** Il sottotitolo della Home: la data di oggi, «Lunedì 28 settembre». */
export function homeSubtitle(now: Date): string {
  return formatLongDay(now);
}

/** «domenica 11 ottobre», dalla data YYYY-MM-DD del blocco letta come giorno locale. */
function blockDay(isoDate: string): string {
  return formatLongDay(parseISO(isoDate.slice(0, 10))).toLowerCase();
}

/**
 * Il sottotitolo di Prenota, sul blocco di riferimento della 00
 * (clientReferenceBlock) e non sull'RPC: «Blocco 3 di 6 · fino a domenica 11
 * ottobre», «Abbonamento mensile · blocco 4 · fino a domenica 4 ottobre»,
 * «… · inizia lunedì 5 ottobre» per un blocco che deve ancora iniziare,
 * «Percorso concluso», «Crediti senza scadenza» per il cliente libero; null
 * senza blocchi validi. Numero e totale come il coach (blockNumber).
 */
export function bookSubtitle(
  pathType: string | null,
  blocks: readonly RenewalBlock[],
  now: Date,
): string | null {
  if (pathType === "free") return "Crediti senza scadenza";
  const ref = clientReferenceBlock(blocks, now);
  if (!ref) return null;
  const timing = blockTiming(ref, now);
  if (timing === "past") return "Percorso concluso";
  const n = blockNumber(blocks, ref);
  if (n === null) return null;
  const total = blocks.filter(isValidBlock).length;
  const label =
    pathType === "recurring" ? `Abbonamento mensile · blocco ${n}` : `Blocco ${n} di ${total}`;
  return timing === "future"
    ? `${label} · inizia ${blockDay(ref.start_date)}`
    : `${label} · fino a ${blockDay(ref.end_date)}`;
}

/** Il titolo della scheda del browser (T1): «Sessione · NC Calendar». */
export function clientPageTitle(name: string): string {
  return `${name} · NC Calendar`;
}

/**
 * Dove porta «Indietro» quando la voce prima nella cronologia non è una
 * pagina dell'app (D5): dal dettaglio di una sessione a Sessioni, da tutto il
 * resto (Notifiche compresa) alla Home.
 */
export function backFallback(pathname: string): "/client" | "/client/sessions" {
  return segments(pathname)[1] === "bookings" ? "/client/sessions" : "/client";
}
