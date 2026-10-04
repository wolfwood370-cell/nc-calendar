// ----------------------------------------------------------------------------
// Prenota, in un file solo (lato cliente, passata 02, audit B1, B4, B5, B6, O1,
// O3 e D2)
// ----------------------------------------------------------------------------
// Le tipologie che il cliente vede in Prenota, coi loro crediti, e ogni testo
// della pagina, sopra gli helper della 00: getClientPools, getCreditWindows,
// getNextBlock e blockNumber (client-credits.ts); la regola sotto i giorni è
// bookingRulesText (booking-rules.ts) e i giorni sono getClientSlotDays
// (client-slots.ts). La pagina non conta crediti e non genera orari suoi.
//   - getBookState: il blocco di riferimento e il blocco dopo, le opzioni
//     (tutte le tipologie del cliente, anche esaurite e da prenotare col
//     coach, ognuna col suo motivo), quando non si prenota e perché, le
//     incoerenze dei crediti e se il cliente compra Booster;
//   - initialOption, howToBook e i testi della barra, del riepilogo e dell'esito;
//   - le soglie: 24 ore di preavviso e presenza confermata entro 48 ore;
//   - bookingErrorMessage: gli errori del server, detti nel foglio;
//   - reportPoolMismatches: una segnalazione per ogni insieme di incoerenze;
//   - canBuyBooster: chi compra un Booster, la regola dello Store.
// Il coach è un parametro: le pagine lo leggono con useMyCoach (get_my_coach,
// giro del server del 02/10/2026), e senza nome (NO_COACH, finché non arriva o
// senza coach) i testi dicono «il tuo coach».
// Puro: niente hook, niente rete, niente Sentry; l'ora entra come parametro.
// ----------------------------------------------------------------------------

import { addDays, addHours, format, parseISO } from "date-fns";
import {
  CLIENT_BOOKING_HORIZON_DAYS,
  CLIENT_CONFIRM_WINDOW_HOURS,
  CLIENT_MIN_NOTICE_HOURS,
  type CreditWindow,
  type RulesBlock,
} from "@/lib/booking-rules";
import {
  blockNumber,
  getClientPools,
  getCreditWindows,
  getNextBlock,
  type ClientBlock,
  type ClientPool,
  type PoolBooking,
  type PoolEventType,
  type PoolExtra,
  type PoolMismatch,
} from "@/lib/client-credits";
import { freeUntilLabel } from "@/lib/client-session-status";
import type { ClientSlot } from "@/lib/client-slots";
import { formatCreditsAgreed } from "@/lib/credits";
import { blockTiming, toIsoDate } from "@/lib/current-block";
import type { SessionType } from "@/lib/mock-data";
import { clientReferenceBlock, renewsAutomatically } from "@/lib/renewal";
import { formatLongDay, formatShortDay } from "@/lib/session-time";
import {
  boosterPathAllowed,
  boosterSaleClosed,
} from "../../supabase/functions/_shared/booster-validity";

const HOUR_MS = 3_600_000;

/** I campi del profilo del cliente che contano per Prenota. */
export interface BookClient {
  /** profiles.path_type: "fixed" | "recurring" | "free". */
  path_type: string | null;
  /** profiles.status: "active" | "archived". */
  status: string;
  /** profiles.pack_label: col percorso fisso, un PT Pack non compra Booster. */
  pack_label: string | null;
  /** profiles.auto_renew_blocks, per la regola dell'abbonamento (renewsAutomatically). */
  auto_renew_blocks?: boolean | null;
}

/** Il coach come lo nominano i testi; `whatsapp` è il link wa.me, o null. */
export interface BookCoach {
  /** Nome e cognome: la riga «con …» del riepilogo. */
  name: string | null;
  /** Il nome nei testi: «Si prenota con Nicolò». */
  firstName: string | null;
  whatsapp: string | null;
}

/** Nessun dato del coach: i testi dicono «il tuo coach», e nessun pulsante WhatsApp. */
export const NO_COACH: BookCoach = { name: null, firstName: null, whatsapp: null };

/**
 * prenotabile: il cliente la prenota (ha giorni con crediti); coach: la
 * tipologia non è prenotabile dal cliente (client_bookable falso), anche con
 * crediti; esaurita: nessun credito che la paghi.
 */
export type BookOptionState = "prenotabile" | "coach" | "esaurita";

/** Una tipologia del cliente in Prenota. */
export interface BookOption {
  /** allocKey: event_type_id, o `__<session_type>` per le allocazioni senza tipologia. */
  key: string;
  eventTypeId: string | null;
  sessionType: SessionType;
  name: string;
  color: string | null;
  durationMin: number;
  bufferMin: number;
  location: "physical" | "online" | null;
  address: string | null;
  /** unavailable_message, per «Come si prenota». */
  message: string | null;
  state: BookOptionState;
  /** I crediti da mostrare: quelli del pool della finestra del numero (vedi getBookState). */
  count: number;
  /**
   * La finestra del numero è pagata dal blocco dopo (paidByNext): count sono
   * i crediti del blocco dopo. Falso senza finestre.
   */
  countFromNext: boolean;
  /** «60 min · 3 disponibili» · «Si prenota con il tuo coach» · «Crediti esauriti». */
  sub: string;
  /** getCreditWindows della tipologia: i giorni in cui si prenota, e con quale credito. */
  windows: CreditWindow[];
  /** Solo per le esaurite: un Booster di questa tipologia che il cliente può comprare. */
  buyBooster: boolean;
  /** La riga del blocco di riferimento, con gli extra; null se la tipologia c'è solo nel blocco dopo. */
  referencePool: ClientPool | null;
  /** La riga del blocco dopo; null se non c'è, o se il blocco dopo inizia oltre i 14 giorni. */
  nextPool: ClientPool | null;
}

/** Perché la pagina mostra la card invece della prenotazione. */
export type BlockedKind = "concluso" | "nessun-credito" | "crediti-usati";

export interface Blocked {
  kind: BlockedKind;
  title: string;
  text: string;
  /** Il pulsante «Acquista un Booster» (verso /client/store). */
  buy: boolean;
}

/** Un'incoerenza dei crediti, col blocco in cui sta. */
export interface BookMismatch extends PoolMismatch {
  blockId: string;
}

export interface BookState {
  /** clientReferenceBlock; null per il cliente libero e senza blocchi validi. */
  reference: ClientBlock | null;
  /** getNextBlock del riferimento, anche se inizia oltre i 14 giorni. */
  next: ClientBlock | null;
  referenceNumber: number | null;
  nextNumber: number | null;
  options: BookOption[];
  /** La card al posto della prenotazione; null se si prenota. */
  blocked: Blocked | null;
  /** Quelle del riferimento, poi quelle del blocco dopo: le manda a Sentry la pagina. */
  mismatches: BookMismatch[];
  /** canBuyBooster, sul profilo e sui blocchi. */
  canBuy: boolean;
}

export interface BookStateInput {
  now: Date;
  client: BookClient;
  /** I blocchi del cliente, con le allocazioni (useClientBlocks). */
  blocks: readonly ClientBlock[];
  /**
   * Le sessioni del cliente, comprese le annullate tardi con deleted_at
   * (useClientBookingsForCredits): cancel_booking lo scrive anche su di loro.
   */
  bookings: readonly PoolBooking[];
  /** I crediti extra del cliente: vanno solo al blocco di riferimento. */
  extras: readonly PoolExtra[];
  eventTypes: readonly PoolEventType[];
  /** event_type_title dei pacchetti attivi di booster_packs (legati alla tipologia per nome). */
  boosterTitles: readonly string[];
  coach: BookCoach;
}

// ----------------------------------------------------------------------------
// Il coach nei testi
// ----------------------------------------------------------------------------

export function coachFirstName(coach: BookCoach): string | null {
  return coach.firstName?.trim() || coach.name?.trim().split(/\s+/)[0] || null;
}

/** «Il tuo coach» a inizio frase, altrimenti il nome. */
export function coachSubject(coach: BookCoach): string {
  return coachFirstName(coach) ?? "Il tuo coach";
}

/** «con il tuo coach» · «con Nicolò». */
function coachWith(coach: BookCoach): string {
  const first = coachFirstName(coach);
  return first ? `con ${first}` : "con il tuo coach";
}

/** «al tuo coach» · «a Nicolò». */
export function coachTo(coach: BookCoach): string {
  const first = coachFirstName(coach);
  return first ? `a ${first}` : "al tuo coach";
}

/** «Scrivi a Nicolò» · «Scrivi al tuo coach»: i pulsanti WhatsApp, che ci sono solo col link. */
export function writeToCoach(coach: BookCoach): string {
  return `Scrivi ${coachTo(coach)}`;
}

/** «Scrivi a Nicolò su WhatsApp», nel foglio «Come si prenota». */
export function writeOnWhatsApp(coach: BookCoach): string {
  return `${writeToCoach(coach)} su WhatsApp`;
}

/** «con Nicolò Castello», la riga del riepilogo; null senza nome, e la riga non c'è. */
export function withCoachLine(coach: BookCoach): string | null {
  const name = coach.name?.trim() || coachFirstName(coach);
  return name ? `con ${name}` : null;
}

// ----------------------------------------------------------------------------
// I colori della tipologia
// ----------------------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

/** Il colore della tipologia (event_types.color), o il primario se non è #rrggbb. */
export function typeColor(color: string | null): string {
  return color && HEX.test(color) ? color : "#005685";
}

/** Lo stesso colore al 10% (#rrggbb1a), per i riquadri delle icone. */
export function typeTint(color: string | null): string {
  return `${typeColor(color)}1a`;
}

// ----------------------------------------------------------------------------
// Lo stato di Prenota
// ----------------------------------------------------------------------------

/**
 * Chi compra un Booster (la regola dello Store e del pagamento): un blocco in
 * corso oggi, non nell'ultima settimana di un percorso che finisce
 * (boosterSaleClosed, decisione 14), e boosterPathAllowed del file condiviso
 * con booster-checkout (cliente attivo, percorso fisso senza pack_label
 * oppure abbonamento).
 */
export function canBuyBooster(
  client: Pick<BookClient, "path_type" | "status" | "pack_label">,
  hasCurrentBlock: boolean,
  saleClosed: boolean,
): boolean {
  return hasCurrentBlock && !saleClosed && boosterPathAllowed(client);
}

/** La finestra è pagata dal blocco dopo: crediti del blocco, e il blocco è il blocco dopo. */
function paidByNext(window: CreditWindow, next: ClientBlock | null): boolean {
  return window.source === "block" && next !== null && window.blockId === next.id;
}

/**
 * I crediti del pool che paga una finestra: il disponibile del blocco dopo
 * (blockAvail) se la paga il blocco dopo, altrimenti quello del riferimento,
 * blocco più extra (avail), anche per una finestra extra sui giorni del blocco
 * dopo: getCreditWindows mette il blockId anche lì, e da solo non basta.
 */
function poolCount(
  window: CreditWindow,
  option: Pick<BookOption, "referencePool" | "nextPool">,
  next: ClientBlock | null,
): number {
  return paidByNext(window, next)
    ? (option.nextPool?.blockAvail ?? 0)
    : (option.referencePool?.avail ?? 0);
}

/**
 * Tutto quello che Prenota mostra dei crediti:
 *   - il riferimento (clientReferenceBlock) e il blocco dopo (getNextBlock);
 *   - le righe del riferimento, con gli extra, e quelle del blocco dopo, senza,
 *     solo se il blocco dopo inizia entro oggi + 14: oltre non apre niente;
 *   - le opzioni: le righe del riferimento nel loro ordine, poi quelle del
 *     blocco dopo che il riferimento non ha. Ognuna con le sue finestre
 *     (getCreditWindows) e il suo stato: coach se non è prenotabile dal
 *     cliente, prenotabile se ha una finestra, esaurita se no;
 *   - count, il numero da mostrare: quello del pool della prima finestra che
 *     ha ancora un giorno prenotabile (finisce da oggi + 24 ore in poi),
 *     altrimenti della prima. Così una tipologia finita nel blocco 3 e
 *     presente nel 4 dice il credito che userà, e negli ultimi giorni di un
 *     blocco, quando per le 24 ore non si prenotano più, il numero è quello
 *     del blocco dopo (countFromNext); senza finestre, il disponibile del
 *     riferimento;
 *   - blocked, il primo caso che vale: percorso concluso; nessuna opzione;
 *     nessuna prenotabile e nessuna col coach con crediti.
 */
export function getBookState(input: BookStateInput): BookState {
  const { now, client, blocks, bookings, extras, eventTypes, boosterTitles, coach } = input;
  const pathType = client.path_type;
  const free = pathType === "free";
  const reference = free ? null : clientReferenceBlock(blocks, now);
  const next = getNextBlock(blocks, reference);
  const referenceNumber = reference ? blockNumber(blocks, reference) : null;
  const nextNumber = next ? blockNumber(blocks, next) : null;

  const refPools = getClientPools({
    now,
    pathType,
    block: reference,
    bookings,
    extras,
    eventTypes,
  });
  const horizon = toIsoDate(addDays(now, CLIENT_BOOKING_HORIZON_DAYS));
  const nextOpen = next !== null && next.start_date.slice(0, 10) <= horizon;
  const nextPools = nextOpen
    ? getClientPools({ now, pathType, block: next, bookings, eventTypes })
    : null;
  const nextRows = nextPools?.rows ?? [];

  const current = reference !== null && blockTiming(reference, now) === "current";
  // Il percorso continua come per la validità del Booster: il blocco dopo, o
  // l'abbonamento che si rinnova da solo.
  const saleClosed =
    current &&
    boosterSaleClosed({
      today: toIsoDate(now),
      blockEnd: reference.end_date.slice(0, 10),
      continues: next !== null || renewsAutomatically(client),
    });
  const canBuy = canBuyBooster(client, current, saleClosed);
  // Il primo giorno che si prenota ancora: le finestre che finiscono prima
  // non danno il numero.
  const firstBookable = toIsoDate(addHours(now, CLIENT_MIN_NOTICE_HOURS));

  const pairs: Array<{ ref: ClientPool | null; next: ClientPool | null }> = [
    ...refPools.rows.map((r) => ({ ref: r, next: nextRows.find((n) => n.key === r.key) ?? null })),
    ...nextRows
      .filter((n) => !refPools.rows.some((r) => r.key === n.key))
      .map((n) => ({ ref: null, next: n })),
  ];

  const options = pairs.map(({ ref, next: nextPool }): BookOption => {
    const row = (ref ?? nextPool)!;
    const windows = getCreditWindows({
      now,
      pathType,
      blocks,
      reference,
      referencePools: refPools.rows,
      next,
      nextPools: nextRows,
      key: row.key,
    });
    const state: BookOptionState = !row.bookable
      ? "coach"
      : windows.length > 0
        ? "prenotabile"
        : "esaurita";
    const pools = { referencePool: ref, nextPool };
    const numbered = windows.find((w) => w.until >= firstBookable) ?? windows[0];
    const count = numbered
      ? poolCount(numbered, pools, next)
      : (ref?.avail ?? nextPool?.blockAvail ?? 0);
    const sub =
      state === "prenotabile"
        ? `${row.durationMin} min · ${count} ${count === 1 ? "disponibile" : "disponibili"}`
        : state === "coach"
          ? `Si prenota ${coachWith(coach)}`
          : "Crediti esauriti";
    return {
      key: row.key,
      eventTypeId: row.eventTypeId,
      sessionType: row.sessionType,
      name: row.name,
      color: row.color,
      durationMin: row.durationMin,
      bufferMin: row.bufferMin,
      location: row.location,
      address: row.address,
      message: row.message,
      state,
      count,
      countFromNext: numbered ? paidByNext(numbered, next) : false,
      sub,
      windows,
      buyBooster:
        state === "esaurita" &&
        canBuy &&
        row.eventTypeId !== null &&
        boosterTitles.includes(row.name),
      ...pools,
    };
  });

  const concluded = !free && reference !== null && blockTiming(reference, now) === "past";
  const newPath = `Per prenotare nuove sessioni serve un nuovo percorso: scrivi ${coachTo(coach)}, te lo propone lui.`;
  let blocked: Blocked | null = null;
  if (concluded) {
    blocked = { kind: "concluso", title: "Il tuo percorso è concluso", text: newPath, buy: false };
  } else if (options.length === 0) {
    blocked = {
      kind: "nessun-credito",
      title: "Nessun credito da prenotare",
      text: newPath,
      buy: false,
    };
  } else if (
    !options.some((o) => o.state === "prenotabile") &&
    !options.some((o) => o.state === "coach" && o.count > 0)
  ) {
    blocked = {
      kind: "crediti-usati",
      title: "Hai usato tutti i crediti",
      text: canBuy
        ? `Puoi aggiungere un Booster al blocco in corso, oppure chiedere ${coachTo(coach)} di anticipare il prossimo.`
        : `Per continuare scrivi ${coachTo(coach)}.`,
      buy: canBuy,
    };
  }

  const mismatches: BookMismatch[] = [
    ...(reference ? refPools.mismatches.map((m) => ({ ...m, blockId: reference.id })) : []),
    ...(next && nextPools ? nextPools.mismatches.map((m) => ({ ...m, blockId: next.id })) : []),
  ];

  return {
    reference,
    next,
    referenceNumber,
    nextNumber,
    options,
    blocked,
    mismatches,
    canBuy,
  };
}

/** L'opzione di partenza: quella di `eventType` se è prenotabile, altrimenti la prima prenotabile. */
export function initialOption(
  options: readonly BookOption[],
  eventType?: string | null,
): BookOption | null {
  const bookable = options.filter((o) => o.state === "prenotabile");
  return (
    (eventType ? bookable.find((o) => o.eventTypeId === eventType) : undefined) ??
    bookable[0] ??
    null
  );
}

/** Un blocco come lo vuole bookingRulesText; null senza blocco o senza numero. */
export function rulesBlock(block: ClientBlock | null, number: number | null): RulesBlock | null {
  if (!block || number === null) return null;
  return { id: block.id, number, start_date: block.start_date, end_date: block.end_date };
}

// ----------------------------------------------------------------------------
// «Come si prenota»
// ----------------------------------------------------------------------------

export interface HowToBook {
  title: string;
  text: string;
  /** «Acquista un Booster», verso /client/store?type=<eventTypeId>. */
  buy: boolean;
  /** Il link WhatsApp del coach, o null: senza, niente pulsante. */
  whatsapp: string | null;
}

function withPeriod(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/**
 * Il foglio di una tipologia che non si sceglie. Col coach: il suo messaggio
 * (col punto finale, perché il testo continua) e i crediti; esaurita: dove
 * sono finiti i crediti e cosa si può fare. Il Booster solo se ce n'è uno di
 * quella tipologia che il cliente può comprare.
 */
export function howToBook(option: BookOption, state: BookState, coach: BookCoach): HowToBook {
  if (option.state === "coach") {
    const message = option.message?.trim();
    const lead = message
      ? withPeriod(message)
      : `Questa sessione si prenota direttamente ${coachWith(coach)}.`;
    const credits =
      option.count > 0
        ? ` Hai ${formatCreditsAgreed(option.count, null, ["disponibile", "disponibili"])}.`
        : "";
    return { title: option.name, text: lead + credits, buy: false, whatsapp: coach.whatsapp };
  }
  const n = option.referencePool ? state.referenceNumber : state.nextNumber;
  const where = n !== null ? ` del blocco ${n}` : "";
  const then = option.buyBooster
    ? ` Puoi aggiungerne con un Booster oppure chiedere ${coachTo(coach)}.`
    : ` Per altre sessioni scrivi ${coachTo(coach)}.`;
  return {
    title: `Crediti ${option.name} esauriti`,
    text: `Hai usato tutti i crediti ${option.name}${where}.${then}`,
    buy: option.buyBooster,
    whatsapp: coach.whatsapp,
  };
}

// ----------------------------------------------------------------------------
// Barra, riepilogo, esito
// ----------------------------------------------------------------------------

type SlotTimes = Pick<ClientSlot, "iso" | "time" | "end">;

/** «Sessione PT · 60 min» */
export function barType(option: Pick<BookOption, "name" | "durationMin">): string {
  return `${option.name} · ${option.durationMin} min`;
}

/** «mar 29 set · 11:10–12:10» */
export function barWhen(slot: SlotTimes): string {
  return `${formatShortDay(new Date(slot.iso))} · ${slot.time}–${slot.end}`;
}

/** «Martedì 29 settembre, 11:10–12:10» */
export function whenLine(slot: SlotTimes): string {
  return `${formatLongDay(new Date(slot.iso))}, ${slot.time}–${slot.end}`;
}

/**
 * «Online · videochiamata Google Meet» · «Studio · Via …» · «Studio» senza
 * indirizzo; null senza tipologia (un'allocazione vecchia), e la riga non c'è.
 */
export function placeLine(option: Pick<BookOption, "location" | "address">): string | null {
  if (option.location === "online") return "Online · videochiamata Google Meet";
  if (option.location === "physical") {
    const address = option.address?.trim();
    return address ? `Studio · ${address}` : "Studio";
  }
  return null;
}

/**
 * «Userai 1 credito Sessione PT: ne resteranno 2.» Il pool è quello della
 * finestra del giorno scelto: il blocco dopo, se la paga lui («… del blocco
 * 4: …»), altrimenti il riferimento, blocco più extra.
 */
export function creditLine(
  option: BookOption,
  window: CreditWindow,
  state: Pick<BookState, "next" | "nextNumber">,
): string {
  const onNext = paidByNext(window, state.next);
  const left = poolCount(window, option, state.next) - 1;
  const tail =
    left <= 0
      ? "non ne resteranno altri."
      : left === 1
        ? "ne resterà 1."
        : `ne resteranno ${left}.`;
  const where = onNext && state.nextNumber !== null ? ` del blocco ${state.nextNumber}` : "";
  return `Userai 1 credito ${option.name}${where}: ${tail}`;
}

/** Inizio fra almeno 24 ore: a 24:00 esatte si prenota ancora (come generateSlots). */
export function noticeOk(iso: string, now: Date): boolean {
  return new Date(iso).getTime() - now.getTime() >= CLIENT_MIN_NOTICE_HOURS * HOUR_MS;
}

/** Il foglio è rimasto aperto e l'orario è entrato nelle 24 ore. */
export const NOTICE_GONE = `Mancano meno di ${CLIENT_MIN_NOTICE_HOURS} ore a questo orario: scegline un altro.`;

/**
 * Chi prenota entro 48 ore, comprese, risulta già confermato (O3): la stessa
 * soglia di «Da confermare» in getClientSessionStatus.
 */
export function confirmsOnBooking(iso: string, now: Date): boolean {
  return new Date(iso).getTime() - now.getTime() <= CLIENT_CONFIRM_WINDOW_HOURS * HOUR_MS;
}

/**
 * La regola sotto il riepilogo. «prima di», non «fino a»: a quel minuto
 * cancel_booking fa già pagare il credito (freeUntilLabel).
 */
export function summaryRule(iso: string, now: Date): string {
  const free = `Puoi spostarla o annullarla gratis prima di ${freeUntilLabel({ scheduled_at: iso })}.`;
  return confirmsOnBooking(iso, now)
    ? `${free} La presenza risulta già confermata.`
    : `${free} Ti chiederemo di confermare la presenza ${CLIENT_CONFIRM_WINDOW_HOURS} ore prima.`;
}

/**
 * Il testo dell'esito. L'email è profiles.email del cliente, quella a cui
 * gcalCreateEvent manda l'invito; senza, la frase finisce al calendario.
 */
export function doneText(
  name: string,
  iso: string,
  coach: BookCoach,
  email: string | null,
): string {
  const d = new Date(iso);
  const when = `${formatLongDay(d).toLowerCase()} alle ${format(d, "HH:mm")}`;
  const address = email?.trim();
  const invite = address ? `; l'invito di Google Calendar arriva a ${address}.` : ".";
  return `${name}, ${when}. ${coachSubject(coach)} la vede subito nel calendario${invite}`;
}

/** Il riquadro di una fila senza orari: fino all'ultimo giorno della fila (YYYY-MM-DD). */
export function noSlotsText(name: string, until: string | null, coach: BookCoach): string {
  const limit = until ? ` fino a ${formatLongDay(parseISO(until.slice(0, 10))).toLowerCase()}` : "";
  return `Nessun orario libero per ${name}${limit}. ${coachSubject(coach)} può proporti un orario.`;
}

// ----------------------------------------------------------------------------
// Errori e incoerenze
// ----------------------------------------------------------------------------

export interface BookingErrorLike {
  code?: string | null;
  message?: string | null;
}

/**
 * L'errore dell'inserimento, nel foglio. 23P01: il vincolo di sovrapposizione
 * del coach. P0001 dei crediti: i messaggi di validate_booking_block_allocation
 * e validate_booking_extra_credits cominciano con «Credito», salvo quello
 * dell'extra che scade prima della sessione (dal giro del server del
 * 02/10/2026), che dice già cosa succede e resta com'è. Ogni altro errore col
 * suo messaggio, anche un P0001 che non parla di crediti.
 */
export function bookingErrorMessage(
  err: BookingErrorLike | null | undefined,
  name: string,
): string {
  if (err?.code === "23P01") return "Questo orario non è più libero: scegline un altro.";
  const message = err?.message?.trim();
  if (err?.code === "P0001" && message?.startsWith("Credito")) {
    return `Non hai crediti disponibili per ${name}.`;
  }
  return message || "Prenotazione non riuscita: riprova.";
}

/**
 * Manda le incoerenze una volta per ogni insieme diverso, e lo ricorda in
 * `seen`: la pagina si ridisegna ogni 30 secondi (useNow). Niente con zero
 * incoerenze.
 */
export function reportPoolMismatches(
  mismatches: readonly BookMismatch[],
  send: (message: string) => void,
  seen: Set<string>,
): void {
  if (mismatches.length === 0) return;
  const parts = mismatches
    .map((m) => `${m.blockId}/${m.key}: ${m.counted} contate, ${m.recorded} registrate`)
    .sort();
  const key = parts.join(" · ");
  if (seen.has(key)) return;
  seen.add(key);
  const names = [...new Set(mismatches.map((m) => m.name))].join(", ");
  send(`Prenota: sessioni e crediti non coincidono (${names}) · ${key}`);
}
