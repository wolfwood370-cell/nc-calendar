// ----------------------------------------------------------------------------
// Lo Store dei Booster, in un file solo (lato cliente, passata 06, audit S1-S5,
// H7, V12, V14)
// ----------------------------------------------------------------------------
// Ogni testo, numero e condizione della pagina Booster:
//   - storeLock: chi non compra (S5), con il suo motivo e nessun prodotto;
//   - storeValidity: fino a quando valgono i Booster comprati oggi (S1), con la
//     regola del file condiviso con booster-checkout: la data mostrata prima di
//     pagare è quella che il pagamento scrive in extra_credits.expires_at;
//   - storeProducts: i pacchetti di booster_packs che si vendono davvero
//     (attivi, in euro, legati per nome a una tipologia del coach, come fa il
//     pagamento), col numero di crediti nel titolo e «Più conveniente» solo
//     dove è vero (S2, S4); storeEmpty quando non ce n'è nessuno;
//   - storeBought: i pagamenti del blocco in corso (S1, S4), e
//     storeBoughtVisible: se la lista si vede, anche sotto la card
//     dell'ultima settimana;
//   - storeSummary: il foglio «Riepilogo», col numero di crediti dopo
//     l'acquisto, quello di Prenota adesso più i crediti comprati;
//   - findPurchase e storeOutcome: il ritorno da Stripe (S3), mentre il
//     webhook scrive la riga;
//   - storePayError: gli errori del pagamento, detti per persone;
//   - storeSearch: i parametri dell'indirizzo (type, booster, session).
// Il coach è un parametro (useMyCoach nella pagina, da get_my_coach): senza
// nome i testi dicono «il tuo coach», e senza link nessun pulsante WhatsApp.
// Puro: niente hook, niente rete, niente orologio (l'ora entra come
// parametro), niente Sentry, niente toast.
// ----------------------------------------------------------------------------

import { parseISO } from "date-fns";
import {
  coachFirstName,
  coachSubject,
  coachTo,
  getBookState,
  writeOnWhatsApp,
  writeToCoach,
  type BookClient,
  type BookCoach,
  type BookState,
  type BookStateInput,
} from "@/lib/client-book";
import type { PoolEventType, PoolExtra } from "@/lib/client-credits";
import { blockTiming, toIsoDate } from "@/lib/current-block";
import { renewsAutomatically } from "@/lib/renewal";
import { formatLongDay, formatShortDay } from "@/lib/session-time";
import {
  BOOSTER_EXTENSION_DAYS,
  BOOSTER_SHORT_BLOCK_DAYS,
  boosterPackTitle,
  boosterPathAllowed,
  boosterSaleClosed,
  boosterValidity,
  endOfRomeDay,
} from "../../supabase/functions/_shared/booster-validity";

/** Il nome del coach a metà frase: il nome, o «il tuo coach». */
function coachName(coach: BookCoach): string {
  return coachFirstName(coach) ?? "il tuo coach";
}

/**
 * Il percorso continua dopo il blocco di riferimento: c'è il blocco dopo, o
 * l'abbonamento si rinnova da solo. Lo stesso per la card dell'ultima
 * settimana e per la validità (e per getBookState).
 */
function pathContinues(client: BookClient, state: Pick<BookState, "next">): boolean {
  return state.next !== null || renewsAutomatically(client);
}

const credits = (n: number) => (n === 1 ? "credito" : "crediti");
const available = (n: number) => (n === 1 ? "disponibile" : "disponibili");

// ----------------------------------------------------------------------------
// Chi non compra (S5)
// ----------------------------------------------------------------------------

export const STORE_LOCK_TITLE = "I Booster si aggiungono a un percorso";

/**
 * concluso: il percorso è finito; libero: crediti senza percorso; pacchetto:
 * PT Pack; fine: l'ultima settimana di un percorso che finisce (decisione 14).
 */
export type StoreLockKind = "concluso" | "libero" | "pacchetto" | "fine" | "altro";

export interface StoreLock {
  kind: StoreLockKind;
  title: string;
  text: string;
  /** Il pulsante WhatsApp, solo se il coach ha il link. */
  whatsapp: { label: string; href: string } | null;
}

/**
 * La card di chi non compra; null se compra. Il primo caso che vale: cliente
 * libero; blocco di riferimento finito (anche un PT Pack finito: il percorso
 * è concluso); PT Pack con un blocco in corso; l'ultima settimana di un
 * percorso che finisce (boosterSaleClosed sul blocco in corso, col «continua»
 * della validità); tutto il resto (nessun blocco in corso, un blocco che deve
 * iniziare, cliente archiviato).
 */
export function storeLock(
  client: BookClient,
  state: Pick<BookState, "reference" | "next" | "canBuy">,
  coach: BookCoach,
  now: Date,
): StoreLock | null {
  if (state.canBuy) return null;
  const whatsapp = coach.whatsapp ? { label: writeOnWhatsApp(coach), href: coach.whatsapp } : null;
  const lock = (kind: StoreLockKind, text: string): StoreLock => ({
    kind,
    title: STORE_LOCK_TITLE,
    text,
    whatsapp,
  });
  const name = coachName(coach);
  if (client.path_type === "free") {
    return lock(
      "libero",
      `Hai crediti senza scadenza fuori da un percorso. Se ti servono altre sessioni, ${name} può aggiungerle o proporti un percorso.`,
    );
  }
  const timing = state.reference ? blockTiming(state.reference, now) : null;
  if (timing === "past") {
    return lock(
      "concluso",
      `Il tuo percorso è concluso. Per ripartire, ${name} ti propone il prossimo percorso: i Booster si aggiungono a quello.`,
    );
  }
  if (client.path_type === "fixed" && client.pack_label && timing === "current") {
    return lock(
      "pacchetto",
      `I Booster si aggiungono a un percorso fisso o a un abbonamento. Se ti servono altre sessioni, ${name} può aggiungerle o proporti un percorso.`,
    );
  }
  if (state.reference && timing === "current" && boosterPathAllowed(client)) {
    const today = toIsoDate(now);
    const end = state.reference.end_date.slice(0, 10);
    const closed = boosterSaleClosed({
      today,
      blockEnd: end,
      continues: pathContinues(client, state),
    });
    if (closed) {
      const when = end === today ? "oggi" : formatLongDay(parseISO(end)).toLowerCase();
      return lock(
        "fine",
        `Il tuo percorso finisce ${when}, e nell'ultima settimana di un percorso i Booster non si acquistano. Per una sessione in più, o per continuare, scrivi ${coachTo(coach)}.`,
      );
    }
  }
  return lock(
    "altro",
    `Al momento non hai un blocco attivo. Scrivi ${coachTo(coach)} per continuare.`,
  );
}

// ----------------------------------------------------------------------------
// Fino a quando valgono (S1)
// ----------------------------------------------------------------------------

export interface StoreValidity {
  /** Il numero del blocco di riferimento; null se non si numera. */
  blockNumber: number | null;
  /** L'ultimo giorno (YYYY-MM-DD) in cui valgono. */
  until: string;
  /** I 30 giorni in più: il blocco finisce fra meno di 7 giorni e il percorso continua. */
  extended: boolean;
  /** endOfRomeDay(until): la stessa di extra_credits.expires_at. */
  expiresAt: string;
  /** Il riquadro sopra i prodotti. */
  text: string;
  /** La riga del foglio «Riepilogo». */
  summary: string;
}

/**
 * Fino a quando vale un Booster comprato adesso; null se il cliente non
 * compra. Il percorso continua se c'è un blocco dopo o se l'abbonamento si
 * rinnova da solo; il resto è boosterValidity, la regola del pagamento.
 */
export function storeValidity(
  client: BookClient,
  state: Pick<BookState, "reference" | "next" | "referenceNumber" | "canBuy">,
  now: Date,
): StoreValidity | null {
  const reference = state.reference;
  if (!state.canBuy || !reference) return null;
  const { until, extended } = boosterValidity({
    today: toIsoDate(now),
    blockEnd: reference.end_date.slice(0, 10),
    continues: pathContinues(client, state),
  });
  const day = formatLongDay(parseISO(until)).toLowerCase();
  const block =
    state.referenceNumber !== null ? `del blocco ${state.referenceNumber}` : "del blocco in corso";
  const rule = "Le sessioni si prenotano entro quella data.";
  return {
    blockNumber: state.referenceNumber,
    until,
    extended,
    expiresAt: endOfRomeDay(until),
    text: extended
      ? `Si aggiungono ai crediti ${block} e valgono fino a ${day}: il blocco finisce fra meno di ${BOOSTER_SHORT_BLOCK_DAYS} giorni, quindi hanno ${BOOSTER_EXTENSION_DAYS} giorni in più. ${rule}`
      : `Si aggiungono ai crediti ${block} e valgono fino a ${day}, come gli altri. ${rule}`,
    summary: extended
      ? `Valgono fino a ${day}, ${BOOSTER_EXTENSION_DAYS} giorni dopo la fine ${block}.`
      : `Valgono fino a ${day}, fine ${block}.`,
  };
}

// ----------------------------------------------------------------------------
// I prodotti (S2, S4)
// ----------------------------------------------------------------------------

/**
 * Un prezzo in centesimi, con la virgola: i decimali solo se non sono zero,
 * niente separatore delle migliaia, uno spazio e «€».
 */
export function euro(cents: number): string {
  const c = Math.round(cents);
  const sign = c < 0 ? "-" : "";
  const whole = Math.floor(Math.abs(c) / 100);
  const rest = Math.abs(c) % 100;
  return rest === 0 ? `${sign}${whole} €` : `${sign}${whole},${String(rest).padStart(2, "0")} €`;
}

/**
 * Una riga di booster_packs letta con select("*"): title e description
 * arrivano col giro del server, e prima mancano.
 */
export interface StorePack {
  package_type: string;
  currency: string;
  amount_cents: number;
  quantity: number;
  event_type_title: string;
  active: boolean;
  title?: string | null;
  description?: string | null;
}

export interface StoreProduct {
  /** package_type: quello che riceve booster-checkout. */
  key: string;
  eventTypeId: string;
  typeName: string;
  quantity: number;
  amountCents: number;
  /** boosterPackTitle: col numero di crediti. */
  title: string;
  description: string | null;
  /** «60 min a sessione», più « · si prenota con …» se la prenota il coach. */
  meta: string;
  price: string;
  /** Il prezzo a sessione per i pacchetti da più crediti, altrimenti «1 credito». */
  per: string;
  /** «Più conveniente». */
  best: boolean;
  /** La tipologia di `type`: in testa, col bordo del primario. */
  highlighted: boolean;
  color: string | null;
  /** client_bookable della tipologia. */
  bookable: boolean;
}

/**
 * Un pacchetto si vende: attivo, in euro, con quantità e prezzo sopra zero (lo
 * stesso filtro di storeProducts e di booster-checkout, che legge solo euro).
 */
function isSellablePack(pack: StorePack): boolean {
  return pack.active && pack.currency === "eur" && pack.quantity > 0 && pack.amount_cents > 0;
}

/**
 * I nomi delle tipologie con un pacchetto che si vende (passata 09): li usano
 * Home e Prenota per «Acquista». Prima venivano da tutti i pacchetti attivi,
 * anche in dollari o a zero, e una tipologia con un pacchetto solo in dollari
 * aveva «Acquista» e nessun prodotto nello Store.
 */
export function sellablePackTitles(packs: readonly StorePack[]): string[] {
  return [...new Set(packs.filter(isSellablePack).map((p) => p.event_type_title))];
}

/**
 * I prodotti dello Store. Entrano i pacchetti attivi, in euro, con quantità e
 * prezzo sopra zero, il cui event_type_title è esattamente il nome di una
 * tipologia del coach (la prima con quel nome), come li risolve
 * booster-checkout: gli altri non si vendono e non si vedono. «Più
 * conveniente» è il pacchetto col prezzo per credito strettamente più basso
 * fra quelli della sua tipologia, se ce n'è più d'uno (a pari merito nessuno):
 * il prezzo per credito esatto, confrontato senza dividere. L'ordine: prima
 * la tipologia di `type`, poi per nome della tipologia, quantità, prezzo, key.
 */
export function storeProducts(
  packs: readonly StorePack[],
  eventTypes: readonly PoolEventType[],
  coach: BookCoach,
  typeParam: string | null,
): StoreProduct[] {
  const products: StoreProduct[] = [];
  for (const pack of packs) {
    if (!isSellablePack(pack)) continue;
    const type = eventTypes.find((t) => t.name === pack.event_type_title);
    if (!type) continue;
    const bookable = type.client_bookable;
    products.push({
      key: pack.package_type,
      eventTypeId: type.id,
      typeName: type.name,
      quantity: pack.quantity,
      amountCents: pack.amount_cents,
      title: boosterPackTitle(pack),
      description: pack.description?.trim() || null,
      meta: bookable
        ? `${type.duration} min a sessione`
        : `${type.duration} min a sessione · si prenota con ${coachName(coach)}`,
      price: euro(pack.amount_cents),
      per:
        pack.quantity > 1
          ? `${euro(Math.round(pack.amount_cents / pack.quantity))} a sessione`
          : "1 credito",
      best: false,
      highlighted: typeParam !== null && type.id === typeParam,
      color: type.color,
      bookable,
    });
  }
  for (const p of products) {
    const others = products.filter((q) => q !== p && q.eventTypeId === p.eventTypeId);
    p.best =
      others.length > 0 &&
      others.every((q) => p.amountCents * q.quantity < q.amountCents * p.quantity);
  }
  return products.sort(
    (a, b) =>
      Number(b.highlighted) - Number(a.highlighted) ||
      a.typeName.localeCompare(b.typeName, "it") ||
      a.quantity - b.quantity ||
      a.amountCents - b.amountCents ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** Al posto dei prodotti, quando chi compra non ne ha nessuno. */
export function storeEmpty(coach: BookCoach): string {
  return `Al momento non ci sono Booster da acquistare. Per altre sessioni scrivi ${coachTo(coach)}.`;
}

// ----------------------------------------------------------------------------
// Gli acquisti del blocco (S1, S4)
// ----------------------------------------------------------------------------

/**
 * Una riga di extra_credits del cliente con le colonne dell'acquisto:
 * price_paid è in euro; stripe_payment_id è la sessione di Stripe, null per i
 * crediti dati dal coach.
 */
export type StorePurchase = PoolExtra & {
  id: string;
  created_at: string;
  price_paid: number | null;
  stripe_payment_id: string | null;
};

export interface StoreBoughtRow {
  id: string;
  /** «+3 <tipologia>»; senza tipologia «+1 credito», «+2 crediti». */
  label: string;
  /** Il giorno breve e, se c'è, il prezzo pagato. */
  meta: string;
}

function hasPrice(p: StorePurchase): p is StorePurchase & { price_paid: number } {
  return typeof p.price_paid === "number" && Number.isFinite(p.price_paid);
}

/**
 * «Acquistati in questo blocco»: i pagamenti (con stripe_payment_id: non i
 * crediti del coach) dal giorno d'inizio del blocco di riferimento, per data
 * locale, dal più recente. Senza riferimento nessuno.
 */
export function storeBought(
  purchases: readonly StorePurchase[],
  eventTypes: readonly PoolEventType[],
  state: Pick<BookState, "reference">,
): StoreBoughtRow[] {
  const reference = state.reference;
  if (!reference) return [];
  const start = reference.start_date.slice(0, 10);
  return purchases
    .filter((p) => !!p.stripe_payment_id && toIsoDate(new Date(p.created_at)) >= start)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((p) => {
      const type = eventTypes.find((t) => t.id === p.event_type_id);
      const what = type ? type.name : credits(p.quantity);
      const day = formatShortDay(new Date(p.created_at));
      return {
        id: p.id,
        label: `+${p.quantity} ${what}`,
        meta: hasPrice(p) ? `${day} · ${euro(Math.round(p.price_paid * 100))}` : day,
      };
    });
}

/**
 * Se lo Store mostra «Acquistati in questo blocco»: senza card, quando ci sono
 * acquisti; fra le card, solo sotto quella dell'ultima settimana («fine»,
 * decisione 14), perché il blocco è ancora in corso e chi ha comprato prima
 * deve ritrovare i suoi Booster. Sotto le altre la lista non serve: con
 * «pacchetto» i Booster non si comprano, con «concluso» e «libero» il blocco
 * non c'è, con «altro» non c'è un blocco in corso o il cliente è archiviato.
 */
export function storeBoughtVisible(
  lock: Pick<StoreLock, "kind"> | null,
  bought: readonly StoreBoughtRow[],
): boolean {
  return bought.length > 0 && (lock === null || lock.kind === "fine");
}

// ----------------------------------------------------------------------------
// Il riepilogo
// ----------------------------------------------------------------------------

export interface StoreSummary {
  title: string;
  price: string;
  /** StoreValidity.summary */
  valid: string;
  /** I crediti della tipologia dopo l'acquisto. */
  after: string;
  /** Il pulsante: «Paga <prezzo> con Stripe». */
  pay: string;
}

/** Il numero di Prenota di una tipologia: il count della sua opzione, 0 senza. */
function bookCount(input: BookStateInput, eventTypeId: string): number {
  return getBookState(input).options.find((o) => o.eventTypeId === eventTypeId)?.count ?? 0;
}

/**
 * Il foglio «Riepilogo». Il numero dopo l'acquisto è quello di Prenota adesso
 * più i crediti comprati, come nel prototipo. Dalla passata 09 l'ultimo
 * giorno di un blocco è anche il numero che Prenota dirà dopo il pagamento:
 * Prenota conta i crediti del blocco dopo più gli extra che valgono lì, e il
 * Booster comprato in un percorso che continua vale anche nel blocco dopo
 * (booster-validity.ts). Con giorni ancora prenotabili nel blocco in corso,
 * dove la tipologia non ha più crediti suoi, può non esserlo: il Booster apre
 * prima la sua finestra su quei giorni (scada col blocco o sia prorogato), e
 * Prenota conta quella, i soli extra, anche se prima contava il blocco dopo.
 */
export function storeSummary(
  product: StoreProduct,
  validity: StoreValidity,
  input: BookStateInput,
): StoreSummary {
  const n = bookCount(input, product.eventTypeId) + product.quantity;
  return {
    title: product.title,
    price: product.price,
    valid: validity.summary,
    after: `Dopo l'acquisto avrai ${n} ${credits(n)} ${product.typeName} ${available(n)}.`,
    pay: `Paga ${product.price} con Stripe`,
  };
}

// ----------------------------------------------------------------------------
// Il ritorno da Stripe (S3)
// ----------------------------------------------------------------------------

/** Ogni quanto la pagina rilegge gli acquisti mentre aspetta il webhook. */
export const STORE_POLL_MS = 2000;
/** Per quanto aspetta, prima di dire che i crediti sono in ritardo. */
export const STORE_POLL_FOR_MS = 20_000;
/** Senza la sessione di Stripe, quanto indietro si cerca il pagamento della tipologia. */
export const STORE_MATCH_WINDOW_MS = 15 * 60_000;
export const STORE_CANCEL_TOAST = "Pagamento non completato: nessun addebito.";
export const STORE_FOOTER =
  "Il pagamento avviene sulla pagina sicura di Stripe. I crediti compaiono appena il pagamento è completato.";
export const STORE_DONE_TITLE = "Pagamento completato";

/**
 * La riga del pagamento appena fatto. Con la sessione di Stripe, solo la riga
 * di quella sessione; senza, con la tipologia, il pagamento più recente di
 * quella tipologia (una riga con stripe_payment_id: un credito del coach non è
 * un pagamento) fatto da 15 minuti prima di `now`, compreso, a `now`; senza
 * tutte e due, null.
 */
export function findPurchase(
  purchases: readonly StorePurchase[],
  session: string | null,
  typeId: string | null,
  now: Date,
): StorePurchase | null {
  if (session) return purchases.find((p) => p.stripe_payment_id === session) ?? null;
  if (!typeId) return null;
  const to = now.getTime();
  const from = to - STORE_MATCH_WINDOW_MS;
  let found: StorePurchase | null = null;
  let foundAt = -Infinity;
  for (const p of purchases) {
    if (!p.stripe_payment_id || p.event_type_id !== typeId) continue;
    const at = new Date(p.created_at).getTime();
    if (!(at >= from && at <= to) || at <= foundAt) continue;
    found = p;
    foundAt = at;
  }
  return found;
}

/** Cosa fare dopo: prenotare, scrivere al coach (le tipologie che fissa lui), niente. */
export type StoreDoneAction =
  | { kind: "book"; eventTypeId: string }
  | { kind: "whatsapp"; label: string; href: string }
  | { kind: "none" };

export type StoreOutcome =
  | { kind: "waiting"; text: string }
  | { kind: "late"; text: string }
  | { kind: "arrived"; purchaseId: string; text: string; action: StoreDoneAction };

/** stripe_payment_id di un extra, se la riga lo porta. */
function paymentOf(extra: PoolExtra): string | null {
  return (extra as Partial<StorePurchase>).stripe_payment_id ?? null;
}

/**
 * Il foglio «Pagamento completato». Senza la riga del webhook: in attesa
 * finché non passano 20 secondi, poi in ritardo. Con la riga: cosa è arrivato
 * e quanti crediti ci sono adesso, con lo stesso conto del riepilogo (Prenota
 * senza la riga arrivata, più i suoi crediti), e cosa fare dopo.
 */
export function storeOutcome({
  purchases,
  session,
  typeId,
  elapsedMs,
  input,
  coach,
}: {
  purchases: readonly StorePurchase[];
  session: string | null;
  typeId: string | null;
  elapsedMs: number;
  input: BookStateInput;
  coach: BookCoach;
}): StoreOutcome {
  const row = findPurchase(purchases, session, typeId, input.now);
  if (!row) {
    return elapsedMs < STORE_POLL_FOR_MS
      ? { kind: "waiting", text: "Pagamento ricevuto: i crediti arrivano tra qualche secondo." }
      : {
          kind: "late",
          text: `I crediti non sono ancora arrivati. Se non compaiono entro qualche minuto scrivi ${coachTo(coach)}.`,
        };
  }
  const type = input.eventTypes.find((t) => t.id === row.event_type_id) ?? null;
  const without: BookStateInput = {
    ...input,
    extras: input.extras.filter((e) => paymentOf(e) !== row.stripe_payment_id),
  };
  const n = (row.event_type_id ? bookCount(without, row.event_type_id) : 0) + row.quantity;
  const what = `+${row.quantity} ${credits(row.quantity)}${type ? ` ${type.name}` : ""}`;
  let action: StoreDoneAction = { kind: "none" };
  if (type?.client_bookable) {
    action = { kind: "book", eventTypeId: type.id };
  } else if (type && coach.whatsapp) {
    action = {
      kind: "whatsapp",
      label: `${writeToCoach(coach)} per fissarlo`,
      href: coach.whatsapp,
    };
  }
  return {
    kind: "arrived",
    purchaseId: row.id,
    text: `${what}. Ora ne hai ${n} ${available(n)}. ${coachSubject(coach)} vede l'acquisto nelle notifiche.`,
    action,
  };
}

// ----------------------------------------------------------------------------
// Gli errori del pagamento
// ----------------------------------------------------------------------------

/**
 * Le frasi di booster-checkout che dicono al cliente cosa succede. Gli altri
 * casi il cliente non li risolve da solo, e diventano STORE_PAY_GENERIC.
 */
export const STORE_PAY_ERRORS: readonly string[] = [
  "Troppe richieste, riprova tra qualche minuto.",
  "Pacchetto non valido.",
  "Tipologia di sessione non disponibile per questo coach.",
  "Al momento non puoi acquistare Booster: serve un blocco in corso.",
  "Nell'ultima settimana del percorso i Booster non si acquistano: per una sessione in più scrivi al tuo coach.",
  "Errore durante la creazione del checkout. Riprova più tardi.",
];

export const STORE_PAY_GENERIC = "Il pagamento non è partito. Riprova tra qualche minuto.";

/** Il messaggio del server dopo il trim, se è una di quelle frasi; altrimenti il generico. */
export function storePayError(message: string | null | undefined): string {
  const text = message?.trim() ?? "";
  return STORE_PAY_ERRORS.includes(text) ? text : STORE_PAY_GENERIC;
}

// ----------------------------------------------------------------------------
// I parametri dell'indirizzo
// ----------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STRIPE_SESSION_RE = /^cs_(?:test|live)_[A-Za-z0-9]{1,255}$/;

export interface StoreSearch {
  /** event_types.id: i prodotti di quella tipologia in testa. */
  type?: string;
  /** L'esito del ritorno da Stripe. */
  booster?: "success" | "cancel";
  /** La sessione di Stripe ({CHECKOUT_SESSION_ID} della success_url). */
  session?: string;
}

/** Il validateSearch della pagina: ogni valore che non è quello atteso non entra. */
export function storeSearch(search: Record<string, unknown>): StoreSearch {
  const out: StoreSearch = {};
  const { type, booster, session } = search;
  if (typeof type === "string" && UUID_RE.test(type)) out.type = type;
  if (booster === "success" || booster === "cancel") out.booster = booster;
  if (typeof session === "string" && STRIPE_SESSION_RE.test(session)) out.session = session;
  return out;
}
