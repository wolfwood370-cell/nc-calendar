// ----------------------------------------------------------------------------
// Il Profilo del cliente, in un file solo (lato cliente, passata 07, audit
// R1-R5, H6, N5, O4 e V6)
// ----------------------------------------------------------------------------
// Ogni riga e ogni testo della pagina Profilo (client.settings.tsx), sopra gli
// helper delle passate prima:
//   - profileIdentity: le iniziali, il nome, l'email e il telefono del cliente;
//   - coachCard: la card «Il tuo coach» dalla riga di get_my_coach, coi soli
//     collegamenti che ci sono (getCoachContacts: WhatsApp, Chiama, Email);
//   - profilePathRows: «Il tuo percorso» sul blocco di riferimento di
//     getClientBlockInfo, con validBlockCount e blockTiming della 00 e la
//     presenza di Sessioni (clientAttendance): gli stessi numeri e le stesse
//     date della Home e di Sessioni, senza conti suoi (R5, V6);
//   - pushRow: «Notifiche sul telefono», da quello che il browser e
//     l'installazione dicono (R2), e i toast dell'interruttore;
//   - calendarInviteText: l'invito di Google Calendar al posto
//     dell'interruttore «Email di conferma», che non mandava niente (R1, O4);
//   - googleLinked, googleRow, googleLinkText e googleLinkToast: l'accesso con
//     Google, col giro di oggi (esci e rientra con «Continua con Google»,
//     decisione 11 del 30/09/2026: R4 resta, niente linkIdentity né «Scollega»);
//   - installRow: la voce «Installa l'app» (N5);
//   - passwordCheck, passwordSaveError e il toast: il foglio «Cambia password»
//     (R3), con gli errori sotto i campi.
// Il file si chiama come la route: client-profile.ts è il Profilo del cliente
// visto dal coach.
// Puro: niente hook, niente rete, niente Sentry, niente toast; l'ora entra
// come parametro, sempre l'ultimo.
// ----------------------------------------------------------------------------

import { addDays, parseISO } from "date-fns";
import type { Attendance } from "@/lib/attendance";
import { getClientBlockInfo, validBlockCount } from "@/lib/client-credits";
import { getCoachContacts, type MyCoachRow } from "@/lib/coach-contacts";
import { blockTiming } from "@/lib/current-block";
import { initials } from "@/lib/initials";
import { renewsAutomatically, type RenewalBlock, type RenewalClient } from "@/lib/renewal";
import { inviteEmail } from "@/lib/safe-email";
import { formatLongDay } from "@/lib/session-time";

// ----------------------------------------------------------------------------
// L'identità e il coach
// ----------------------------------------------------------------------------

/** I campi del profilo del cliente che l'intestazione mostra. */
export type IdentityProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export interface ProfileIdentity {
  /** Fino a due lettere: dal nome, altrimenti dall'email; «?» senza niente. */
  initials: string;
  /** Il nome; senza, l'email; senza niente «Cliente». */
  name: string;
  /** L'email del profilo, altrimenti quella dell'accesso; null senza. */
  email: string | null;
  /** Il telefono del profilo, senza spazi in testa e in coda; null senza. */
  phone: string | null;
}

/**
 * L'intestazione del Profilo. Niente foto: profiles non ha una colonna per
 * l'immagine.
 */
export function profileIdentity(
  profile: IdentityProfile | null,
  authEmail: string | null | undefined,
): ProfileIdentity {
  const email = profile?.email?.trim() || authEmail?.trim() || null;
  return {
    initials: initials(profile?.full_name, email),
    name: profile?.full_name?.trim() || email || "Cliente",
    email,
    phone: profile?.phone?.trim() || null,
  };
}

export type CoachLinkKind = "whatsapp" | "tel" | "mail";

export interface CoachLink {
  kind: CoachLinkKind;
  label: "WhatsApp" | "Chiama" | "Email";
  href: string;
}

export interface CoachCardModel {
  name: string;
  initials: string;
  /** Nell'ordine WhatsApp, Chiama, Email, e solo quelli che ci sono. */
  links: CoachLink[];
}

/**
 * La card «Il tuo coach» (H6): null senza riga o senza nome, e la card non
 * c'è. I collegamenti sono quelli di getCoachContacts, quindi WhatsApp e
 * Chiama compaiono insieme e solo con almeno sei cifre nel numero, tolto lo
 * 00 davanti (whatsappUrl: con meno, nessun href), e l'email se c'è.
 */
export function coachCard(row: MyCoachRow | null): CoachCardModel | null {
  const name = row?.full_name?.trim();
  if (!row || !name) return null;
  const c = getCoachContacts({ name, phone: row.phone, email: row.email });
  const links: CoachLink[] = [];
  if (c.whatsapp) links.push({ kind: "whatsapp", label: "WhatsApp", href: c.whatsapp });
  if (c.tel) links.push({ kind: "tel", label: "Chiama", href: c.tel });
  if (c.mail) links.push({ kind: "mail", label: "Email", href: c.mail });
  return { name, initials: initials(name), links };
}

// ----------------------------------------------------------------------------
// Il tuo percorso
// ----------------------------------------------------------------------------

export interface ProfileRow {
  label: string;
  value: string;
}

/** «domenica 11 ottobre»: formatLongDay in minuscolo, come i sottotitoli della Home. */
function dayText(d: Date): string {
  return formatLongDay(d).toLowerCase();
}

/**
 * «Il tuo percorso» (R5, V6), sul blocco di riferimento di getClientBlockInfo,
 * nell'ordine:
 *   - «Percorso» · il piano della Home («Percorso fisso», «Abbonamento
 *     mensile», «Cliente libero»), sempre;
 *   - col blocco di riferimento: finito, «Concluso» · il giorno della fine;
 *     altrimenti «Blocco in corso» · N per l'abbonamento in corso, «Blocco» ·
 *     N per l'abbonamento che deve iniziare, «Blocco» · «N di M» per il fisso
 *     (M = validBlockCount, il «di 6» della Home);
 *   - la data, se il blocco non è finito: da iniziare, «Inizio del blocco» ·
 *     l'inizio; in corso, «Rinnovo» · il giorno dopo la fine per l'abbonamento
 *     che si rinnova da solo, altrimenti «Fine del blocco» · la fine;
 *   - «Presenza, ultime 8 settimane» · «91%», se c'è (clientAttendance).
 * Le date si leggono dal blocco come fa getClientBlockInfo (parseISO dei
 * primi dieci caratteri), mai con new Date(end_date), che a Los Angeles dà il
 * giorno prima. Il cliente libero e un percorso senza blocchi hanno solo il
 * piano e la presenza. Nessun credito e nessuna sessione contata: stanno
 * nella Home.
 */
export function profilePathRows(
  client: RenewalClient,
  blocks: readonly RenewalBlock[],
  attendance: Pick<Attendance, "percent"> | null,
  now: Date,
): ProfileRow[] {
  const info = getClientBlockInfo(client, blocks, now);
  const rows: ProfileRow[] = [{ label: "Percorso", value: info.plan }];
  const ref = info.reference;
  if (ref && info.number !== null) {
    const recurring = client.path_type === "recurring";
    const timing = blockTiming(ref, now);
    const start = parseISO(ref.start_date.slice(0, 10));
    const end = parseISO(ref.end_date.slice(0, 10));
    if (timing === "past") {
      rows.push({ label: "Concluso", value: dayText(end) });
    } else {
      rows.push({
        label: recurring && timing === "current" ? "Blocco in corso" : "Blocco",
        value: recurring ? String(info.number) : `${info.number} di ${validBlockCount(blocks)}`,
      });
      if (timing === "future") {
        rows.push({ label: "Inizio del blocco", value: dayText(start) });
      } else if (renewsAutomatically(client)) {
        rows.push({ label: "Rinnovo", value: dayText(addDays(end, 1)) });
      } else {
        rows.push({ label: "Fine del blocco", value: dayText(end) });
      }
    }
  }
  if (attendance) {
    rows.push({ label: "Presenza, ultime 8 settimane", value: `${attendance.percent}%` });
  }
  return rows;
}

// ----------------------------------------------------------------------------
// Notifiche
// ----------------------------------------------------------------------------

export interface PushState {
  /** isPushSupported(): il browser ha service worker, PushManager e Notification. */
  supported: boolean;
  /** isPushReady(): il service worker è registrato (nell'anteprima non lo è). */
  ready: boolean;
  /** usePwaInstall().installed: aperta dall'icona (standalone) o appena installata. */
  installed: boolean;
  /** usePwaInstall().markedInstalled: «Ho installato l'app», su questo dispositivo. */
  markedInstalled: boolean;
  /** C'è un'iscrizione push su questo dispositivo (getCurrentPushSubscription). */
  enabled: boolean;
}

/** switch: l'interruttore; come-fare: il tonale che apre il foglio d'installazione; null: niente. */
export type PushControl = "switch" | "come-fare" | null;

export interface PushRowModel {
  text: string;
  control: PushControl;
  /** L'interruttore acceso; falso in ogni caso senza interruttore, anche con un'iscrizione. */
  checked: boolean;
}

/**
 * «Notifiche sul telefono» (R2), in quest'ordine:
 *   - con le push (supportate e service worker registrato) l'interruttore, e
 *     il testo dice cosa arriva oggi: la conferma della sessione che il
 *     cliente prenota (use-book-confirm.ts è l'unica push del cliente). Dalla
 *     passata 08 gli avvisi delle azioni del coach arrivano nella campanella
 *     dell'app, in tempo reale, e non sul telefono: il server non ha un modo
 *     per mandare una push quando agisce il coach (niente pg_net, e send-push
 *     vuole il JWT di un utente), quindi il testo resta questo. «Attive»
 *     guarda la riga di chi è entrato per questo dispositivo
 *     (isPushEnabledFor);
 *   - altrimenti, aperta dall'icona: qui non si attivano, niente comando;
 *   - altrimenti, segnata con «Ho installato l'app» ma aperta nel browser: si
 *     apre l'app dall'icona (su iPhone le push ci sono solo lì). Senza questo
 *     caso l'account direbbe «App installata» e, sopra, ancora «installa
 *     l'app» con «Come fare»;
 *   - altrimenti come si installa, con «Come fare».
 * Lo stato viene dal browser e non solo dall'installazione: su Android in
 * Chrome le push ci sono anche senza installare.
 */
export function pushRow(s: PushState): PushRowModel {
  if (s.supported && s.ready) {
    return s.enabled
      ? {
          text: "Attive: quando prenoti una sessione la conferma arriva sul telefono.",
          control: "switch",
          checked: true,
        }
      : {
          text: "Disattivate: gli avvisi restano nella campanella dell'app.",
          control: "switch",
          checked: false,
        };
  }
  if (s.installed) {
    return {
      text: "Su questo telefono non si possono attivare: gli avvisi restano nella campanella dell'app.",
      control: null,
      checked: false,
    };
  }
  if (s.markedInstalled) {
    return {
      text: "Per riceverle apri l'app dall'icona sulla schermata Home.",
      control: null,
      checked: false,
    };
  }
  return {
    text: "Per riceverle installa l'app sulla schermata Home del telefono.",
    control: "come-fare",
    checked: false,
  };
}

export const PUSH_ON_TOAST = "Notifiche sul telefono attivate.";
export const PUSH_OFF_TOAST = "Notifiche sul telefono disattivate.";
/** «Permesso negato» di subscribeToPush. */
export const PUSH_DENIED_TOAST =
  "Le notifiche sono bloccate: consentile nelle impostazioni del telefono o del browser e riprova.";
export const PUSH_ERROR_TOAST = "Non siamo riusciti a cambiare le notifiche. Riprova tra poco.";

/**
 * «Inviti del calendario» (R1, O4), al posto dell'interruttore «Email di
 * conferma»: ogni sessione fissata nell'app diventa un evento Google col
 * cliente invitato all'email del suo profilo (gcal.server.ts, sendUpdates=all),
 * la stessa che il dettaglio della 04 scrive. Quelle importate da Google non
 * hanno l'invito, e il testo dalla 09 dice «fissate nell'app». null senza
 * un'email che Google riceve (inviteEmail, la regola del server), e la riga
 * non c'è.
 */
export function calendarInviteText(profileEmail: string | null | undefined): string | null {
  const address = inviteEmail(profileEmail);
  if (!address) return null;
  return `Le sessioni fissate nell'app arrivano come invito di Google Calendar a ${address} e si aggiornano da sole se vengono spostate o annullate.`;
}

// ----------------------------------------------------------------------------
// Account
// ----------------------------------------------------------------------------

/** L'utente di useAuth(), quanto basta per sapere se entra anche con Google. */
export interface AuthIdentityUser {
  app_metadata?: { providers?: unknown } | null;
  identities?: readonly { provider: string }[] | null;
}

/**
 * Vero se fra i modi di entrare c'è Google: app_metadata.providers è un array
 * che lo contiene, oppure fra le identities ce n'è una google. L'utente è
 * quello di useAuth(): nessun supabase.auth.getUser() in più.
 */
export function googleLinked(user: AuthIdentityUser | null | undefined): boolean {
  if (!user) return false;
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.includes("google")) return true;
  return (user.identities ?? []).some((i) => i.provider === "google");
}

export interface GoogleRowModel {
  text: string;
  /** Il tonale «Collega», che apre il foglio: solo se Google non c'è. */
  link: boolean;
}

/**
 * «Accesso con Google» (R4). Collegarlo resta il giro di oggi: si esce e si
 * rientra con «Continua con Google» usando la stessa email (decisione 11 del
 * 30/09/2026: l'accesso con Google passa dal servizio di Lovable, non da
 * signInWithOAuth, e «Manual linking» con linkIdentity non si usa). Collegato
 * la riga lo dice e basta: niente «Scollega», che è un'altra funzione di
 * Supabase Auth che oggi l'app non ha, e un pulsante che può fallire è
 * peggio di nessun pulsante.
 */
export function googleRow(linked: boolean): GoogleRowModel {
  return linked
    ? { text: "Collegato: puoi entrare anche con Google", link: false }
    : { text: "Entra con il tuo account Google invece della password", link: true };
}

/** Il testo del foglio «Collega Google»: i due passi, con l'email da scegliere se c'è. */
export function googleLinkText(email: string | null | undefined): string {
  const address = email?.trim();
  const which = address ? `l'account con la tua email, ${address}` : "l'account con la tua email";
  return `Esci, poi nella pagina di accesso tocca «Continua con Google» e scegli ${which}: ritrovi le tue sessioni e i tuoi crediti.`;
}

/** Il toast all'uscita per collegare Google, con la stessa regola sull'email. */
export function googleLinkToast(email: string | null | undefined): string {
  const address = email?.trim();
  return address
    ? `Ora entra con «Continua con Google» usando ${address}.`
    : "Ora entra con «Continua con Google» usando la stessa email.";
}

export interface InstallRowModel {
  /** «Installa l'app», oppure «App installata» (aperta dall'icona o segnata, come la card della Home). */
  label: string;
  /** Vero se la voce è un pulsante che apre il foglio d'installazione. */
  opens: boolean;
}

/**
 * La voce dell'installazione (N5). Resta un pulsante che riapre il foglio
 * finché l'app non è aperta dall'icona, anche a segno messo: il segno di «Ho
 * installato l'app» non si toglie (use-pwa.ts), su iPhone il browser non sa
 * se l'app c'è, e con la riga inerte chi lo tocca per sbaglio nel browser non
 * ritroverebbe più la guida, né dalla Home (la card sparisce) né dalle
 * notifiche (senza «Come fare»). Ad app aperta dall'icona non c'è niente da
 * installare, e la riga non è un pulsante.
 */
export function installRow(installed: boolean, markedInstalled: boolean): InstallRowModel {
  return {
    label: installed || markedInstalled ? "App installata" : "Installa l'app",
    opens: !installed,
  };
}

// ----------------------------------------------------------------------------
// Cambia password
// ----------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordCheck {
  firstInvalid: boolean;
  /** Sotto «Nuova password»: la regola, oppure quanti caratteri ci sono ora. */
  firstHint: string;
  secondInvalid: boolean;
  /** Sotto «Ripeti la password», dopo un salvataggio con le due diverse. */
  secondError: string | null;
  /** Si salva solo con almeno 8 caratteri e le due uguali. */
  canSave: boolean;
}

/**
 * Il foglio «Cambia password» (R3). La prima è in errore mentre si scrive, da
 * 1 a 7 caratteri, e dopo un salvataggio anche vuota; la seconda si controlla
 * al salvataggio. Una regola sola per i due campi: con la seconda uguale alla
 * prima ha anche lei almeno 8 caratteri (oggi la conferma ne accetta 6).
 */
export function passwordCheck(first: string, second: string, tried: boolean): PasswordCheck {
  const short = first.length < PASSWORD_MIN_LENGTH;
  const firstInvalid = (first.length > 0 && short) || (tried && short);
  const secondInvalid = tried && second !== first;
  return {
    firstInvalid,
    firstHint: firstInvalid
      ? `Servono almeno ${PASSWORD_MIN_LENGTH} caratteri (ora ${first.length}).`
      : `Almeno ${PASSWORD_MIN_LENGTH} caratteri.`,
    secondInvalid,
    secondError: secondInvalid ? "Le due password non coincidono." : null,
    canSave: !short && second === first,
  };
}

export const PASSWORD_SAVED_TOAST = "Password aggiornata.";

/**
 * L'errore di supabase.auth.updateUser, detto sotto il primo campo e non in un
 * toast: la password di prima, una troppo debole, un accesso da rifare;
 * tutto il resto, null compreso, un errore generico. Il messaggio si confronta
 * in minuscolo.
 */
export function passwordSaveError(
  err: { code?: string | null; message?: string | null } | null | undefined,
): string {
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  if (code === "same_password" || msg.includes("different from the old password")) {
    return "È la password che usi già: scegline una diversa.";
  }
  if (code === "weak_password" || msg.includes("weak") || msg.includes("at least")) {
    return "Questa password è troppo debole: scegline una più lunga o più varia.";
  }
  if (code === "reauthentication_needed" || msg.includes("reauthenticat")) {
    return "Per cambiarla serve un accesso recente: esci, rientra e riprova.";
  }
  return "Non siamo riusciti a salvare la password. Riprova tra poco.";
}
