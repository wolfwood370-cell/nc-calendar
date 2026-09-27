// ----------------------------------------------------------------------------
// Regole delle tipologie di sessione (passata 07, audit E1, E3, E5)
// ----------------------------------------------------------------------------
// Pure, senza React: i passi dei −/+ della card, i segmenti e i colori del
// dialog (il valore attuale non si perde mai), il controllo del nome e i testi
// della card. Le usano la pagina desktop e il modulo delle scritture
// (event-type-actions.ts), che rifà gli stessi controlli per chiunque salvi.
// ----------------------------------------------------------------------------

import { TYPE_PALETTE, sameColor, type GCalColor } from "@/lib/event-colors";
import { toGoogleColorId } from "@/lib/gcal-colors";
import { formatDuration } from "@/lib/session-time";

/** Ordine della pagina: per nome, come l'ordinava la query di prima. */
export function sortTypesByName<T extends { name: string }>(types: readonly T[]): T[] {
  return [...types].sort((a, b) => a.name.localeCompare(b.name, "it"));
}

// ---------------------------------------------------------------------------
// −/+ della card
// ---------------------------------------------------------------------------

export interface StepGrid {
  step: number;
  min: number;
  max: number;
}

export const DURATION_GRID: StepGrid = { step: 15, min: 15, max: 240 };
export const BUFFER_GRID: StepGrid = { step: 5, min: 0, max: 60 };

/**
 * Valore dopo un clic su − (−1) o + (+1): il multiplo del passo successivo
 * nella direzione del clic (50 con passo 15: + dà 60, − dà 45), riportato nei
 * limiti. null al limite: il pulsante è disabilitato.
 */
export function stepValue(value: number, dir: 1 | -1, grid: StepGrid): number | null {
  if (dir === 1) {
    const next = Math.max(Math.floor(value / grid.step) * grid.step + grid.step, grid.min);
    return next > grid.max || next <= value ? null : next;
  }
  const next = Math.min(Math.ceil(value / grid.step) * grid.step - grid.step, grid.max);
  return next < grid.min || next >= value ? null : next;
}

// ---------------------------------------------------------------------------
// Segmenti e colori del dialog
// ---------------------------------------------------------------------------

export const DURATION_CHOICES = [30, 45, 60, 90, 120] as const;
export const BUFFER_CHOICES = [0, 5, 10, 15] as const;

export interface NumberOption {
  value: number;
  label: string;
}

/** Le scelte più il valore attuale, se non è fra queste, in ordine. */
function withCurrent(choices: readonly number[], current: number): number[] {
  return choices.includes(current) ? [...choices] : [...choices, current].sort((a, b) => a - b);
}

/** 30m · 45m · 1h · 1h 30m · 2h, più la durata attuale (la BIA di oggi: 15m). */
export function durationOptions(current: number): NumberOption[] {
  return withCurrent(DURATION_CHOICES, current).map((v) => ({
    value: v,
    label: formatDuration(v),
  }));
}

/** 0 · 5 · 10 · 15 min, più il margine attuale. */
export function bufferOptions(current: number): NumberOption[] {
  return withCurrent(BUFFER_CHOICES, current).map((v) => ({ value: v, label: `${v} min` }));
}

export const CURRENT_COLOR_NAME = "Colore attuale";

/** I 12 cerchi, più il colore della tipologia se non è fra questi. */
export function colorOptions(current: string): GCalColor[] {
  if (TYPE_PALETTE.some((c) => sameColor(c.hex, current))) return [...TYPE_PALETTE];
  return [...TYPE_PALETTE, { name: CURRENT_COLOR_NAME, hex: current }];
}

export const GOOGLE_COLOR_NOTE =
  "Su Google Calendar le sessioni nuove prendono il colore del calendario.";

/** Colore senza corrispondente fra i colori degli eventi di Google. */
export function lacksGoogleColor(hex: string): boolean {
  return toGoogleColorId(hex) === undefined;
}

// ---------------------------------------------------------------------------
// Nome
// ---------------------------------------------------------------------------

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;
export const ADDRESS_MAX = 255;
export const MESSAGE_MAX = 500;

export const NAME_ERRORS = {
  empty: "Inserisci un nome.",
  duplicate: "Esiste già una tipologia con questo nome.",
  tooLong: `Il nome può avere al massimo ${NAME_MAX} caratteri.`,
  locked:
    "Il negozio dei clienti vende questa tipologia cercandola per nome: il nome non si cambia da qui.",
} as const;

export type NameProblem = keyof typeof NAME_ERRORS;

/** Nomi uguali senza maiuscole e senza spazi ai lati. */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Il negozio vende la tipologia cercandola col nome esatto (booster-checkout
 * e stripe-webhook, `.eq("name", event_type_title)`): se un pacchetto attivo
 * porta questo nome, cambiarlo romperebbe il negozio.
 */
export function isNameLocked(currentName: string, shopTitles: readonly string[]): boolean {
  return shopTitles.includes(currentName);
}

/**
 * Cosa non va nel nome, o null. `self` è la tipologia che si modifica (null
 * se è nuova): il suo nome lasciato com'è va sempre bene (anche se un
 * doppione c'era già prima dei controlli), non conta come doppione, e se il
 * negozio ne usa il nome il nome non cambia.
 */
export function nameProblem(
  name: string,
  self: { id: string; name: string } | null,
  types: readonly { id: string; name: string }[],
  shopTitles: readonly string[] = [],
): NameProblem | null {
  const trimmed = name.trim();
  if (!trimmed) return "empty";
  if (self && trimmed === self.name.trim()) return null;
  if (trimmed.length > NAME_MAX) return "tooLong";
  if (types.some((t) => t.id !== self?.id && sameName(t.name, trimmed))) return "duplicate";
  if (self && isNameLocked(self.name, shopTitles)) return "locked";
  return null;
}

// ---------------------------------------------------------------------------
// Testi della card
// ---------------------------------------------------------------------------

/** Il testo che il cliente legge in Prenota se il coach non ha scritto il suo. */
export const DEFAULT_UNAVAILABLE_MESSAGE =
  "Per prenotare questa sessione è necessario passare in reception.";

/**
 * Sotto l'interruttore «Prenotabile dai clienti». Una tipologia non
 * prenotabile non è nascosta: chi ha crediti di quel tipo la vede in Prenota,
 * con «Prenotazione non disponibile dall'app» e il messaggio.
 */
export function bookableHint(t: {
  client_bookable: boolean;
  unavailable_message: string | null;
}): string {
  if (t.client_bookable) return "I clienti la vedono tra le sessioni prenotabili.";
  const message = t.unavailable_message?.trim();
  return message
    ? `I clienti la vedono ma non possono prenotarla dall'app. Messaggio: «${message}»`
    : "I clienti la vedono ma non possono prenotarla dall'app: solo tu puoi fissarla.";
}

/**
 * Il link non lo manda l'app: alla prenotazione nasce l'evento Google con la
 * stanza Meet, il cliente lo trova nel dettaglio della sessione e, se ha
 * un'email valida, nell'invito di Google Calendar (gcal.server.ts:106-129,
 * client-booking-detail-view.tsx:215-227).
 */
export const ONLINE_LABEL = "Online · link Meet creato alla prenotazione";

export function locationLabel(t: {
  location_type: "physical" | "online";
  location_address: string | null;
}): string {
  if (t.location_type === "online") return ONLINE_LABEL;
  return `In studio · ${t.location_address?.trim() || "indirizzo non impostato"}`;
}

/** Toast dell'interruttore. */
export function bookableToast(name: string, bookable: boolean): string {
  return bookable
    ? `${name} è di nuovo prenotabile dai clienti.`
    : `${name} non è più prenotabile dai clienti.`;
}
