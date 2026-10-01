// ----------------------------------------------------------------------------
// Booster: fino a quando valgono e chi li compra (lato cliente, passata 06,
// audit S1 e S5; decisioni 10 e 13)
// ----------------------------------------------------------------------------
// Una regola sola per lo Store e per il pagamento: la data che lo Store mostra
// prima di pagare è quella che booster-checkout scrive nei metadati di Stripe
// e stripe-webhook in extra_credits.expires_at.
//   - un Booster vale fino alla fine del blocco in corso;
//   - se alla fine mancano meno di 7 giorni e il percorso continua dopo il
//     blocco (c'è un blocco dopo, o l'abbonamento si rinnova da solo), vale 30
//     giorni dopo la fine: dopo la fine del percorso Prenota non apre più
//     giorni, e quei 30 giorni il cliente li pagherebbe senza poterli usare;
//   - compra il cliente attivo, con un percorso fisso senza pack_label (il PT
//     Pack no) o con un abbonamento, e con un blocco in corso oggi;
//   - la scadenza è l'ultimo istante di quel giorno a Roma, così il giorno
//     letto dall'app è lo stesso a Roma, in UTC e a Los Angeles.
// Senza import e senza niente che sia solo del server o solo del browser
// (Date e Intl e basta): lo importano l'app (src/lib, con un percorso
// relativo senza estensione) e booster-checkout (con l'estensione .ts, come
// gli altri file di _shared). I giorni sono stringhe YYYY-MM-DD e si contano
// come date (mezzanotte UTC di ognuno): il cambio dell'ora non sposta niente.
// ----------------------------------------------------------------------------

/** I giorni in più quando il blocco sta per finire e il percorso continua. */
export const BOOSTER_EXTENSION_DAYS = 30;

/** Sotto questi giorni alla fine del blocco scatta la proroga (7 esatti: no). */
export const BOOSTER_SHORT_BLOCK_DAYS = 7;

const DAY_MS = 86_400_000;
const ROME = "Europe/Rome";

/** Mezzanotte UTC di un giorno YYYY-MM-DD (i primi 10 caratteri). */
function dayMs(day: string): number {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return Date.UTC(y ?? NaN, (m ?? NaN) - 1, d ?? NaN);
}

/** Il giorno YYYY-MM-DD `days` giorni dopo `day`. */
function addDays(day: string, days: number): string {
  return new Date(dayMs(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Fino a quando vale un Booster comprato oggi: la fine del blocco, o 30
 * giorni dopo se alla fine mancano meno di 7 giorni (da 0 a 6, l'ultimo
 * giorno compreso) e il percorso continua. Un blocco già finito non si
 * proroga mai.
 */
export function boosterValidity({
  today,
  blockEnd,
  continues,
}: {
  today: string;
  blockEnd: string;
  continues: boolean;
}): { until: string; extended: boolean } {
  const end = blockEnd.slice(0, 10);
  const left = Math.round((dayMs(end) - dayMs(today)) / DAY_MS);
  const extended = continues && left >= 0 && left < BOOSTER_SHORT_BLOCK_DAYS;
  return { until: extended ? addDays(end, BOOSTER_EXTENSION_DAYS) : end, extended };
}

const ROME_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: ROME,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ROME_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: ROME,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((p) => p.type === type)?.value);
}

/** Il giorno di Roma (YYYY-MM-DD) di un istante: l'«oggi» del server. */
export function romeDate(at: Date): string {
  const parts = ROME_DAY.formatToParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${part(parts, "year")}-${pad(part(parts, "month"))}-${pad(part(parts, "day"))}`;
}

/** Quanto Roma è avanti su UTC in un istante (un'ora d'inverno, due d'estate). */
function romeOffsetMs(at: number): number {
  const whole = Math.floor(at / 1000) * 1000;
  const p = ROME_TIME.formatToParts(new Date(whole));
  const wall = Date.UTC(
    part(p, "year"),
    part(p, "month") - 1,
    part(p, "day"),
    part(p, "hour"),
    part(p, "minute"),
    part(p, "second"),
  );
  return wall - whole;
}

/**
 * L'ultimo istante (23:59:59.999) di un giorno a Roma, in ISO, con l'ora
 * legale o solare di quel giorno: è extra_credits.expires_at. L'ora cambia
 * di notte, mai a mezzanotte, quindi a fine giornata vale l'ora del giorno.
 */
export function endOfRomeDay(day: string): string {
  const wall = dayMs(day) + DAY_MS - 1;
  let at = wall - romeOffsetMs(wall);
  const check = wall - romeOffsetMs(at);
  if (check !== at) at = check;
  return new Date(at).toISOString();
}

/**
 * Il titolo di un pacchetto: booster_packs.title se c'è, altrimenti il
 * numero di crediti e la tipologia («1 credito <tipologia>», «3 crediti
 * <tipologia>»). Lo usano lo Store e il nome del prodotto su Stripe.
 */
export function boosterPackTitle(pack: {
  title?: string | null;
  quantity: number;
  event_type_title: string;
}): string {
  const title = pack.title?.trim();
  if (title) return title;
  return `${pack.quantity} ${pack.quantity === 1 ? "credito" : "crediti"} ${pack.event_type_title}`;
}

/** I campi del profilo che contano per chi compra. */
export interface BoosterClient {
  /** profiles.path_type: "fixed" | "recurring" | "free". */
  path_type: string | null;
  /** profiles.status: "active" | "archived". */
  status: string;
  /** profiles.pack_label: col percorso fisso è il PT Pack. */
  pack_label: string | null;
  /** profiles.auto_renew_blocks: null vale spento. */
  auto_renew_blocks?: boolean | null;
}

/** Un blocco del cliente (training_blocks non eliminato). */
export interface BoosterBlock {
  id: string;
  start_date: string;
  end_date: string;
  /** training_blocks.status: un blocco «cancelled» non conta. */
  status?: string | null;
  sequence_order: number;
}

/** Cosa scrive il pagamento: il blocco in corso e fino a quando vale il Booster. */
export interface BoosterPurchase {
  blockId: string;
  until: string;
  extended: boolean;
  /** endOfRomeDay(until): extra_credits.expires_at. */
  expiresAt: string;
}

/**
 * La parte di chi compra che non guarda i blocchi: cliente attivo, percorso
 * fisso senza pack_label oppure abbonamento (anche con pack_label).
 */
export function boosterPathAllowed(
  client: Pick<BoosterClient, "path_type" | "status" | "pack_label">,
): boolean {
  return (
    client.status === "active" &&
    ((client.path_type === "fixed" && !client.pack_label) || client.path_type === "recurring")
  );
}

const day10 = (iso: string) => iso.slice(0, 10);

/** Viene dopo `ref`: sequence_order più alto, o lo stesso e un inizio dopo. */
function comesAfter(b: BoosterBlock, ref: BoosterBlock): boolean {
  if (b.sequence_order !== ref.sequence_order) return b.sequence_order > ref.sequence_order;
  return day10(b.start_date) > day10(ref.start_date);
}

/** sequence_order crescente e, a pari numero, l'inizio più recente prima. */
function bySequence(a: BoosterBlock, b: BoosterBlock): number {
  if (a.sequence_order !== b.sequence_order) return a.sequence_order - b.sequence_order;
  const sa = day10(a.start_date);
  const sb = day10(b.start_date);
  return sa === sb ? 0 : sa > sb ? -1 : 1;
}

/**
 * La decisione del pagamento, la stessa dello Store: null se il cliente non
 * compra (percorso, stato, nessun blocco in corso oggi); altrimenti il blocco
 * in corso (il primo valido che contiene oggi, nell'ordine di sequence_order
 * e, a pari numero, dall'inizio più recente) e fino a quando vale il Booster.
 * Il percorso continua se un altro blocco valido viene dopo il blocco in
 * corso, oppure se è un abbonamento col rinnovo automatico acceso.
 */
export function boosterPurchase(
  client: BoosterClient,
  blocks: readonly BoosterBlock[],
  today: string,
): BoosterPurchase | null {
  if (!boosterPathAllowed(client)) return null;
  const valid = blocks.filter((b) => b.status !== "cancelled");
  const current = [...valid]
    .sort(bySequence)
    .find((b) => day10(b.start_date) <= today && today <= day10(b.end_date));
  if (!current) return null;
  const renews = client.path_type === "recurring" && client.auto_renew_blocks === true;
  const continues = renews || valid.some((b) => b.id !== current.id && comesAfter(b, current));
  const { until, extended } = boosterValidity({
    today,
    blockEnd: day10(current.end_date),
    continues,
  });
  return { blockId: current.id, until, extended, expiresAt: endOfRomeDay(until) };
}
