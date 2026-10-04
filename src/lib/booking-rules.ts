// ----------------------------------------------------------------------------
// Regole di prenotazione del cliente (lato cliente, passata 00)
// ----------------------------------------------------------------------------
// Una fonte sola per i numeri che il cliente si vede applicare, per prenotare
// e per spostare: Prenota li importa, gli helper del cliente (client-slots.ts,
// client-credits.ts, client-session-status.ts) li leggono da qui, e la card
// «Regole di prenotazione» della Disponibilità del coach li mostra in sola
// lettura. trainer_settings (min_notice_hours, booking_horizon_days) non li
// applica nessuno: né Prenota, dal 27/08/2026, né il server.
//
// Cosa il server oggi non fa, fino alle migrazioni rinviate al 02/10/2026:
//   - preavviso e orizzonte li applica solo l'app: enforce_client_booking_rules
//     controlla solo che la tipologia sia prenotabile, e reschedule_booking non
//     controlla preavviso e orizzonte della nuova data (20260827143053_4c03121c-…sql).
//     Su questi due numeri è sicuro: l'app stringe, il server lascia passare.
//   - il blocco che paga il server può sbagliarlo: validate_booking_block_allocation
//     (stessa migrazione, :35-53 e :59-61) sceglie il credito fra tutti i
//     blocchi del cliente, anche quelli finiti, e riscrive block_id col blocco
//     scelto. Una prenotazione sul blocco dopo può quindi scalare un credito
//     del blocco in corso. Dove vale ogni credito lo dicono le finestre dei
//     crediti (getCreditWindows, client-credits.ts), che il server non conosce.
//   - spostando, reschedule_booking riprende il credito allo stesso modo
//     (:214-231) e riscrive block_id (:253-255), che validate_client_booking_update
//     vieta al cliente: con crediti della tipologia in un blocco precedente lo
//     spostamento fallisce. La scadenza degli extra, dal giro del server del
//     02/10/2026, la guarda l'inserimento (validate_booking_extra_credits) e non
//     lo spostamento: reschedule_booking non la guarda, e Sposta per una
//     sessione senza blocco apre i giorni da oggi a oggi + 14 (getMoveWindow).
// Le soglie delle 24 ore sono invece già del server: validate_client_booking_update
// rifiuta lo spostamento di una sessione che inizia prima di now() + 24 ore, e
// cancel_booking segna tardivo l'annullamento da now() >= inizio − 24 ore. Il
// preavviso della prenotazione, invece, no: l'inserimento non ne ha.
// ----------------------------------------------------------------------------

import { addDays, parseISO } from "date-fns";
import { toIsoDate } from "@/lib/current-block";
import { formatLongDay } from "@/lib/session-time";

/** Preavviso minimo per prenotare e per spostare, in ore. */
export const CLIENT_MIN_NOTICE_HOURS = 24;

/** Fin dove il cliente può prenotare, in giorni da oggi: oggi + 14 compreso. */
export const CLIENT_BOOKING_HORIZON_DAYS = 14;

/**
 * Ore prima dell'inizio entro cui il cliente non può più spostare una
 * sessione. È la regola del server: il trigger validate_client_booking_update
 * rifiuta al cliente lo spostamento di una sessione che inizia prima di
 * now() + 24 ore (a 24 ore esatte si sposta ancora).
 */
export const CLIENT_RESCHEDULE_CUTOFF_HOURS = 24;

/** Giorni in cui il cliente può scegliere il nuovo orario: gli stessi della prenotazione. */
export const CLIENT_RESCHEDULE_WINDOW_DAYS = CLIENT_BOOKING_HORIZON_DAYS;

/**
 * Anticipo oltre il quale annullare non costa il credito. È la soglia di
 * cancel_booking, che segna tardivo da now() >= inizio − 24 ore: a 24 ore
 * esatte il credito si perde già.
 */
export const CLIENT_FREE_CANCEL_HOURS = 24;

/** Da quante ore prima dell'inizio si chiede al cliente di confermare la presenza. */
export const CLIENT_CONFIRM_WINDOW_HOURS = 48;

/** Per quanti giorni dall'inizio una sessione svolta si può valutare. */
export const CLIENT_FEEDBACK_DAYS = 14;

/** 0 → «Nessuno», 1 → «1 ora», N → «N ore». */
export function noticeLabel(hours: number): string {
  if (hours <= 0) return "Nessuno";
  return hours === 1 ? "1 ora" : `${hours} ore`;
}

/** «1 giorno in anticipo», «N giorni in anticipo». */
export function horizonLabel(days: number): string {
  return days === 1 ? "1 giorno in anticipo" : `${days} giorni in anticipo`;
}

function hoursText(hours: number): string {
  return hours === 1 ? "1 ora" : `${hours} ore`;
}

function daysText(days: number): string {
  return days === 1 ? "1 giorno" : `${days} giorni`;
}

/** «domenica 11 ottobre» da una data YYYY-MM-DD. */
function dayText(date: string): string {
  return formatLongDay(parseISO(date.slice(0, 10))).toLowerCase();
}

/** La nota sotto le regole, nella card del coach, coi numeri veri. */
export function bookingRulesNote(
  cutoffHours: number = CLIENT_RESCHEDULE_CUTOFF_HOURS,
  freeCancelHours: number = CLIENT_FREE_CANCEL_HOURS,
): string {
  return (
    "Valgono per tutti i clienti, per prenotare e per spostare. Ogni credito vale nel suo " +
    "blocco, e le date del blocco dopo si prenotano coi suoi crediti. " +
    `Si sposta fino a ${hoursText(cutoffHours)} prima; si annulla senza perdere il credito ` +
    `con più di ${hoursText(freeCancelHours)} di anticipo. Per ora non si cambiano da qui.`
  );
}

// ----------------------------------------------------------------------------
// Testi per il cliente: Prenota e Sposta non li ricompongono
// ----------------------------------------------------------------------------

/**
 * Una finestra dei crediti di una tipologia (getCreditWindows e getMoveWindow,
 * client-credits.ts): i giorni in cui la si prenota, estremi inclusi, e con
 * quale credito. Le finestre di una tipologia non si sovrappongono.
 */
export interface CreditWindow {
  /** Primo e ultimo giorno, YYYY-MM-DD. */
  from: string;
  until: string;
  /** Crediti del blocco, oppure extra (Booster, crediti del cliente libero). */
  source: "block" | "extra";
  /** Il blocco di cui copre i giorni; null per il cliente libero e per una sessione senza blocco. */
  blockId: string | null;
  /** Il suo numero, contato come blockChip (client-profile.ts). */
  blockNumber: number | null;
}

/** Un blocco come lo nominano i testi: il numero è quello che vede il coach. */
export interface RulesBlock {
  id: string;
  number: number;
  start_date: string;
  end_date: string;
}

export interface BookingTextInput {
  now: Date;
  /** profiles.path_type: "fixed" | "recurring" | "free". */
  pathType: string | null;
  /** renewsAutomatically (renewal.ts). */
  renews: boolean;
  /** Il blocco di riferimento (clientReferenceBlock), col suo numero. */
  reference: RulesBlock | null;
  /** Il blocco dopo (getNextBlock), col suo numero. */
  next: RulesBlock | null;
  /** Le finestre della tipologia scelta (getCreditWindows). */
  windows: readonly CreditWindow[];
}

/** «Si prenota da 24 ore a 14 giorni prima.» */
export function bookingBaseText(): string {
  return `Si prenota da ${hoursText(CLIENT_MIN_NOTICE_HOURS)} a ${daysText(CLIENT_BOOKING_HORIZON_DAYS)} prima.`;
}

/**
 * Il testo delle regole in Prenota, per la tipologia scelta: la frase base e
 * al massimo una frase sui crediti, secondo il primo caso che vale. Quali
 * giorni si prenotano, e da quando, lo leggono dalle finestre (la regola di
 * getCreditWindows) e non lo rifanno; le date dei blocchi servono a nominarli
 * e a dire se il blocco dopo cade nei 14 giorni. Una frase che le finestre
 * smentirebbero (un extra che copre i giorni del blocco dopo, crediti che
 * finiscono prima della fine del blocco) non si scrive, e parlano i giorni.
 */
export function bookingRulesText(input: BookingTextInput): string {
  return bookingBaseText() + creditsSentence(input);
}

function creditsSentence({
  now,
  pathType,
  renews,
  reference: ref,
  next,
  windows,
}: BookingTextInput): string {
  // b) cliente libero. a) nessun blocco, percorso concluso (il blocco di
  // riferimento è finito), o nessun credito della tipologia né nel blocco di
  // riferimento né nel blocco dopo (nessuna finestra): la pagina mostra lo stato suo.
  if (pathType === "free" || !ref) return "";
  const today = toIsoDate(now);
  const refEnd = ref.end_date.slice(0, 10);
  if (refEnd < today) return "";
  const onRef = windows.filter((w) => w.blockId === ref.id);
  const onNext = next ? windows.filter((w) => w.blockId === next.id) : [];
  if (onRef.length === 0 && onNext.length === 0) return "";

  const horizon = toIsoDate(addDays(now, CLIENT_BOOKING_HORIZON_DAYS));

  // c) il blocco di riferimento non è ancora iniziato: si prenota dal primo
  // giorno del primo blocco che ha crediti della tipologia, di solito il suo.
  if (ref.start_date.slice(0, 10) > today) {
    const first = windows.reduce((a, w) => (w.from < a.from ? w : a));
    return ` Si prenota dal primo giorno del blocco ${first.blockNumber ?? ref.number}, ${dayText(first.from)}.`;
  }

  // d) il blocco di riferimento non ha più crediti della tipologia, il blocco
  // dopo sì ed entro i 14 giorni (solo così getCreditWindows gli apre i giorni).
  // La data è l'inizio della sua finestra, cioè il primo giorno che si prenota.
  const nextOwn = onNext.find((w) => w.source === "block");
  if (onRef.length === 0) {
    return next && nextOwn
      ? ` I crediti del blocco ${ref.number} per questa sessione sono finiti: da ${dayText(nextOwn.from)} valgono quelli del blocco ${next.number}.`
      : "";
  }

  // e) i 14 giorni finiscono prima della fine del blocco di riferimento.
  if (horizon < refEnd) return "";
  // I crediti della tipologia finiscono prima della fine del blocco (un extra
  // che scade prima): le frasi qui sotto lo negherebbero.
  const refUntil = onRef.reduce((m, w) => (w.until > m ? w.until : m), "");
  if (refUntil < refEnd) return "";

  const n = ref.number;
  const until = dayText(refEnd);
  if (next) {
    const nextStart = next.start_date.slice(0, 10);
    if (nextStart <= horizon) {
      // f) il blocco dopo inizia entro i 14 giorni e ha crediti della tipologia.
      // La seconda data è l'inizio della sua finestra: fra i due blocchi può
      // esserci un buco, e non è il giorno dopo la fine del primo.
      if (nextOwn) {
        return ` Fino a ${until} valgono i crediti del blocco ${n}, da ${dayText(nextOwn.from)} quelli del blocco ${next.number}.`;
      }
      // Un extra copre i giorni del blocco dopo: la frase g) direbbe il falso.
      if (onNext.length > 0) return "";
      // g) il blocco dopo inizia entro i 14 giorni ma non ha crediti della tipologia.
      return ` I crediti del blocco ${n} valgono fino a ${until}, e nel blocco ${next.number} non ce ne sono per questa sessione.`;
    }
    // h) il blocco dopo esiste ma inizia oltre i 14 giorni.
    return ` I crediti del blocco ${n} valgono fino a ${until}: le date successive si aprono con il blocco ${next.number}.`;
  }
  if (pathType === "recurring") {
    // i) abbonamento senza blocco dopo, col rinnovo automatico; j) senza.
    return renews
      ? ` I crediti del blocco ${n} valgono fino a ${until}: le date successive si aprono con il blocco successivo.`
      : ` I crediti del blocco ${n} valgono fino a ${until}, quando termina l'abbonamento.`;
  }
  // k) percorso fisso senza blocco dopo.
  return ` I crediti del blocco ${n} valgono fino a ${until}, fine del percorso.`;
}

export interface MoveTextInput {
  now: Date;
  /**
   * La finestra della sessione che si sposta (getMoveWindow): dentro il suo
   * blocco, o i 14 giorni se non ne ha. null se non si sposta.
   */
  window: CreditWindow | null;
  /** Il nome del coach; oggi il cliente non lo legge (profiles), e senza si dice «Il tuo coach». */
  coachName?: string | null;
}

/**
 * Il testo delle regole in Sposta. Un credito non passa di blocco nemmeno
 * spostando: i limiti sono quelli della finestra di getMoveWindow, e il testo
 * li legge da lì. Un blocco più corto di 14 giorni e non ancora iniziato
 * avrebbe i due limiti insieme: la frase dice l'inizio.
 */
export function moveRulesText({ now, window, coachName }: MoveTextInput): string {
  const lead = `Si sposta fino a ${hoursText(CLIENT_RESCHEDULE_CUTOFF_HOURS)} prima, su un orario entro ${daysText(CLIENT_RESCHEDULE_WINDOW_DAYS)}`;
  const tail = `${coachName?.trim() || "Il tuo coach"} riceve un avviso.`;
  // Senza blocco la finestra sono i 14 giorni: nessun limite in più da dire.
  if (window?.blockId) {
    if (window.from > toIsoDate(now)) {
      return `${lead} e non prima di ${dayText(window.from)}, inizio del blocco. ${tail}`;
    }
    if (window.until <= toIsoDate(addDays(now, CLIENT_RESCHEDULE_WINDOW_DAYS))) {
      return `${lead} e non oltre ${dayText(window.until)}, fine del blocco. ${tail}`;
    }
  }
  return `${lead}. ${tail}`;
}
