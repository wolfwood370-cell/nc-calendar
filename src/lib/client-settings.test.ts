// Le regole del Profilo (passata 07), lunedì 28/09/2026 alle 10:40. Date
// costruite con l'ora locale, come gli altri test del cliente: le stesse attese
// a Roma, in UTC e a Los Angeles.

import { describe, expect, it } from "vitest";
import {
  calendarInviteText,
  coachCard,
  googleLinkText,
  googleLinkToast,
  googleLinked,
  googleRow,
  installRow,
  passwordCheck,
  passwordSaveError,
  profileIdentity,
  profilePathRows,
  pushRow,
  type ProfileRow,
} from "@/lib/client-settings";
import type { RenewalBlock, RenewalClient } from "@/lib/renewal";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const NOW = at(2026, 9, 28, 10, 40);

const block = (
  id: string,
  n: number,
  start: string,
  end: string,
  status = "active",
): RenewalBlock => ({ id, sequence_order: n, start_date: start, end_date: end, status });

const client = (path: string | null, autoRenew: boolean | null = false): RenewalClient => ({
  status: "active",
  path_type: path,
  auto_renew_blocks: autoRenew,
});

const row = (label: string, value: string): ProfileRow => ({ label, value });

// Giulia: percorso fisso di sei blocchi, il 3 in corso fino all'11/10.
const PATH = [
  block("b1", 1, "2026-07-20", "2026-08-16", "completed"),
  block("b2", 2, "2026-08-17", "2026-09-13", "completed"),
  block("b3", 3, "2026-09-14", "2026-10-11"),
  block("b4", 4, "2026-10-12", "2026-11-08"),
  block("b5", 5, "2026-11-09", "2026-12-06"),
  block("b6", 6, "2026-12-07", "2027-01-03"),
];

// ---------------------------------------------------------------------------
// Il tuo percorso
// ---------------------------------------------------------------------------

describe("profilePathRows · il tuo percorso", () => {
  it("percorso fisso in corso: il piano, «3 di 6», la fine del blocco e la presenza", () => {
    expect(profilePathRows(client("fixed"), PATH, { percent: 91 }, NOW)).toEqual([
      row("Percorso", "Percorso fisso"),
      row("Blocco", "3 di 6"),
      row("Fine del blocco", "domenica 11 ottobre"),
      row("Presenza, ultime 8 settimane", "91%"),
    ]);
  });

  it("l'ultimo giorno del blocco è ancora il suo; dal giorno dopo il blocco 4", () => {
    expect(profilePathRows(client("fixed"), PATH, null, at(2026, 10, 11, 21, 30))).toEqual([
      row("Percorso", "Percorso fisso"),
      row("Blocco", "3 di 6"),
      row("Fine del blocco", "domenica 11 ottobre"),
    ]);
    expect(profilePathRows(client("fixed"), PATH, null, at(2026, 10, 12, 0, 5))).toEqual([
      row("Percorso", "Percorso fisso"),
      row("Blocco", "4 di 6"),
      row("Fine del blocco", "domenica 8 novembre"),
    ]);
  });

  it("abbonamento che si rinnova da solo: «Blocco in corso» e «Rinnovo», il giorno dopo la fine", () => {
    const months = [
      block("m1", 1, "2026-09-07", "2026-10-04"),
      block("m2", 2, "2026-10-05", "2026-11-01"),
    ];
    expect(profilePathRows(client("recurring", true), months, null, NOW)).toEqual([
      row("Percorso", "Abbonamento mensile"),
      row("Blocco in corso", "1"),
      row("Rinnovo", "lunedì 5 ottobre"),
    ]);
  });

  it("abbonamento senza rinnovo (spento o null): la fine del blocco", () => {
    const months = [block("m1", 1, "2026-09-07", "2026-10-04")];
    expect(profilePathRows(client("recurring", false), months, null, NOW)).toEqual([
      row("Percorso", "Abbonamento mensile"),
      row("Blocco in corso", "1"),
      row("Fine del blocco", "domenica 4 ottobre"),
    ]);
    expect(profilePathRows(client("recurring", null), months, { percent: 100 }, NOW)).toEqual([
      row("Percorso", "Abbonamento mensile"),
      row("Blocco in corso", "1"),
      row("Fine del blocco", "domenica 4 ottobre"),
      row("Presenza, ultime 8 settimane", "100%"),
    ]);
  });

  it("cliente libero: solo il piano, e la presenza se c'è", () => {
    expect(profilePathRows(client("free"), [], { percent: 50 }, NOW)).toEqual([
      row("Percorso", "Cliente libero"),
      row("Presenza, ultime 8 settimane", "50%"),
    ]);
    expect(profilePathRows(client("free"), PATH, null, NOW)).toEqual([
      row("Percorso", "Cliente libero"),
    ]);
  });

  it("percorso finito: «Concluso» col giorno della fine, e nessuna data dopo", () => {
    const ended = [
      block("a", 1, "2026-07-13", "2026-08-09"),
      block("b", 2, "2026-08-10", "2026-09-06"),
    ];
    expect(profilePathRows(client("fixed"), ended, null, NOW)).toEqual([
      row("Percorso", "Percorso fisso"),
      row("Concluso", "domenica 6 settembre"),
    ]);
    expect(profilePathRows(client("recurring", true), ended, { percent: 0 }, NOW)).toEqual([
      row("Percorso", "Abbonamento mensile"),
      row("Concluso", "domenica 6 settembre"),
      row("Presenza, ultime 8 settimane", "0%"),
    ]);
  });

  it("blocco che deve iniziare: «Inizio del blocco», per il fisso e per l'abbonamento", () => {
    expect(
      profilePathRows(client("fixed"), [block("a", 1, "2026-10-05", "2026-11-01")], null, NOW),
    ).toEqual([
      row("Percorso", "Percorso fisso"),
      row("Blocco", "1 di 1"),
      row("Inizio del blocco", "lunedì 5 ottobre"),
    ]);
    const months = [
      block("m1", 1, "2026-08-10", "2026-09-06"),
      block("m2", 2, "2026-10-05", "2026-11-01"),
    ];
    expect(profilePathRows(client("recurring", true), months, null, NOW)).toEqual([
      row("Percorso", "Abbonamento mensile"),
      row("Blocco", "2"),
      row("Inizio del blocco", "lunedì 5 ottobre"),
    ]);
  });

  it("un blocco annullato in mezzo non conta, né nel numero né nel «di»", () => {
    const withCancelled = [
      block("a", 1, "2026-08-17", "2026-09-13"),
      block("x", 2, "2026-08-31", "2026-09-27", "cancelled"),
      block("b", 3, "2026-09-14", "2026-10-11"),
    ];
    expect(profilePathRows(client("fixed"), withCancelled, null, NOW)).toEqual([
      row("Percorso", "Percorso fisso"),
      row("Blocco", "2 di 2"),
      row("Fine del blocco", "domenica 11 ottobre"),
    ]);
  });

  it("percorso fisso senza blocchi: solo il piano (e senza path_type vale il fisso)", () => {
    expect(profilePathRows(client("fixed"), [], null, NOW)).toEqual([
      row("Percorso", "Percorso fisso"),
    ]);
    expect(profilePathRows(client(null), PATH, null, NOW)).toEqual([
      row("Percorso", "Percorso fisso"),
      row("Blocco", "3 di 6"),
      row("Fine del blocco", "domenica 11 ottobre"),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Il tuo coach
// ---------------------------------------------------------------------------

describe("coachCard · il tuo coach", () => {
  it("nome, iniziali e i tre collegamenti, nell'ordine WhatsApp, Chiama, Email", () => {
    expect(
      coachCard({
        id: "co",
        full_name: "Marco Rossi",
        phone: "+39 347 555 01 23",
        email: "marco@example.com",
      }),
    ).toEqual({
      name: "Marco Rossi",
      initials: "MR",
      links: [
        { kind: "whatsapp", label: "WhatsApp", href: "https://wa.me/393475550123" },
        { kind: "tel", label: "Chiama", href: "tel:+393475550123" },
        { kind: "mail", label: "Email", href: "mailto:marco@example.com" },
      ],
    });
  });

  it("il coach di oggi, senza telefono: la sola email", () => {
    expect(
      coachCard({
        id: "co",
        full_name: " Nicolò Castello ",
        phone: null,
        email: "nicolo@example.com",
      }),
    ).toEqual({
      name: "Nicolò Castello",
      initials: "NC",
      links: [{ kind: "mail", label: "Email", href: "mailto:nicolo@example.com" }],
    });
  });

  it("un telefono che non è un numero e un'email di soli spazi: nessun collegamento", () => {
    expect(
      coachCard({ id: "co", full_name: "Marco Rossi", phone: "javascript:alert(1)", email: "  " }),
    ).toEqual({ name: "Marco Rossi", initials: "MR", links: [] });
  });

  it("senza riga, o senza nome, la card non c'è", () => {
    expect(coachCard(null)).toBeNull();
    expect(
      coachCard({ id: "co", full_name: "  ", phone: "3475550123", email: "x@example.com" }),
    ).toBeNull();
    expect(coachCard({ id: "co", full_name: null, phone: null, email: null })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// L'identità
// ---------------------------------------------------------------------------

describe("profileIdentity · iniziali, nome, email e telefono", () => {
  it("dal profilo, col telefono", () => {
    expect(
      profileIdentity(
        { full_name: "Giulia Bianchi", email: "giulia.b@email.it", phone: " +39 340 118 22 09 " },
        "altra@email.it",
      ),
    ).toEqual({
      initials: "GB",
      name: "Giulia Bianchi",
      email: "giulia.b@email.it",
      phone: "+39 340 118 22 09",
    });
  });

  it("senza nome vale l'email, e un telefono di soli spazi non c'è", () => {
    expect(
      profileIdentity({ full_name: null, email: "sara.verdi@email.it", phone: "   " }, null),
    ).toEqual({
      initials: "SV",
      name: "sara.verdi@email.it",
      email: "sara.verdi@email.it",
      phone: null,
    });
  });

  it("senza profilo vale l'email dell'accesso; senza niente «?» e «Cliente»", () => {
    expect(profileIdentity(null, "luca@email.it")).toEqual({
      initials: "LE",
      name: "luca@email.it",
      email: "luca@email.it",
      phone: null,
    });
    expect(profileIdentity(null, null)).toEqual({
      initials: "?",
      name: "Cliente",
      email: null,
      phone: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Notifiche
// ---------------------------------------------------------------------------

describe("pushRow · notifiche sul telefono", () => {
  const none = { supported: false, ready: false, installed: false, markedInstalled: false };
  const push = { supported: true, ready: true, installed: false, markedInstalled: false };

  it("con le push l'interruttore: acceso dice cosa arriva, spento dove restano gli avvisi", () => {
    expect(pushRow({ ...push, enabled: true })).toEqual({
      text: "Attive: quando prenoti una sessione la conferma arriva sul telefono.",
      control: "switch",
      checked: true,
    });
    expect(pushRow({ ...push, installed: true, enabled: false })).toEqual({
      text: "Disattivate: gli avvisi restano nella campanella dell'app.",
      control: "switch",
      checked: false,
    });
  });

  it("senza push e senza installazione: come si installa, con «Come fare»", () => {
    expect(pushRow({ ...none, enabled: false })).toEqual({
      text: "Per riceverle installa l'app sulla schermata Home del telefono.",
      control: "come-fare",
      checked: false,
    });
    // Le API ci sono ma il service worker no (l'anteprima): non basta supported.
    expect(pushRow({ ...none, supported: true, enabled: false }).control).toBe("come-fare");
  });

  it("segnata con «Ho installato l'app» ma aperta nel browser: si apre l'app dall'icona", () => {
    expect(pushRow({ ...none, markedInstalled: true, enabled: false })).toEqual({
      text: "Per riceverle apri l'app dall'icona sulla schermata Home.",
      control: null,
      checked: false,
    });
  });

  it("aperta dall'icona ma senza push: nessun comando, e checked falso anche con un'iscrizione", () => {
    expect(pushRow({ ...none, supported: true, installed: true, enabled: false })).toEqual({
      text: "Su questo telefono non si possono attivare: gli avvisi restano nella campanella dell'app.",
      control: null,
      checked: false,
    });
    expect(
      pushRow({ ...none, installed: true, markedInstalled: true, enabled: true }).checked,
    ).toBe(false);
    expect(pushRow({ ...none, markedInstalled: true, enabled: true }).checked).toBe(false);
  });
});

describe("calendarInviteText · inviti del calendario", () => {
  it("con l'email del profilo, senza spazi; senza email nessuna riga", () => {
    expect(calendarInviteText(" giulia.b@email.it ")).toBe(
      "Ogni sessione arriva come invito di Google Calendar a giulia.b@email.it e si aggiorna da sola se viene spostata o annullata.",
    );
    expect(calendarInviteText("  ")).toBeNull();
    expect(calendarInviteText(null)).toBeNull();
    expect(calendarInviteText(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

describe("Google · collegato o no", () => {
  it("googleLinked: dai provider dell'accesso o dalle identità, non da altro", () => {
    expect(googleLinked({ app_metadata: { providers: ["email", "google"] } })).toBe(true);
    expect(
      googleLinked({
        app_metadata: { providers: ["email"] },
        identities: [{ provider: "google" }],
      }),
    ).toBe(true);
    expect(googleLinked({ app_metadata: { providers: "google" }, identities: [] })).toBe(false);
    expect(
      googleLinked({ app_metadata: { providers: ["email"] }, identities: [{ provider: "email" }] }),
    ).toBe(false);
    expect(googleLinked({ app_metadata: null, identities: null })).toBe(false);
    expect(googleLinked(null)).toBe(false);
  });

  it("la riga nei due stati", () => {
    expect(googleRow(false)).toEqual({
      text: "Entra con il tuo account Google invece della password",
      link: true,
    });
    expect(googleRow(true)).toEqual({
      text: "Collegato: puoi entrare anche con Google",
      link: false,
    });
  });

  it("il testo del foglio e il toast, con l'email e senza", () => {
    expect(googleLinkText("giulia.b@email.it")).toBe(
      "Esci, poi nella pagina di accesso tocca «Continua con Google» e scegli l'account con la tua email, giulia.b@email.it: ritrovi le tue sessioni e i tuoi crediti.",
    );
    const noMail =
      "Esci, poi nella pagina di accesso tocca «Continua con Google» e scegli l'account con la tua email: ritrovi le tue sessioni e i tuoi crediti.";
    expect(googleLinkText(" ")).toBe(noMail);
    expect(googleLinkText(null)).toBe(noMail);
    expect(googleLinkToast("giulia.b@email.it")).toBe(
      "Ora entra con «Continua con Google» usando giulia.b@email.it.",
    );
    expect(googleLinkToast(" ")).toBe(
      "Ora entra con «Continua con Google» usando la stessa email.",
    );
    expect(googleLinkToast(null)).toBe(
      "Ora entra con «Continua con Google» usando la stessa email.",
    );
  });
});

describe("installRow · installa l'app", () => {
  it("resta un pulsante finché l'app non è aperta dall'icona, anche a segno messo", () => {
    expect(installRow(false, false)).toEqual({ label: "Installa l'app", opens: true });
    expect(installRow(true, false)).toEqual({ label: "App installata", opens: false });
    expect(installRow(false, true)).toEqual({ label: "App installata", opens: true });
    expect(installRow(true, true)).toEqual({ label: "App installata", opens: false });
  });
});

// ---------------------------------------------------------------------------
// Cambia password
// ---------------------------------------------------------------------------

describe("passwordCheck · cambia password", () => {
  it("vuota prima di salvare: solo la regola, niente errori", () => {
    expect(passwordCheck("", "", false)).toEqual({
      firstInvalid: false,
      firstHint: "Almeno 8 caratteri.",
      secondInvalid: false,
      secondError: null,
      canSave: false,
    });
  });

  it("corta mentre si scrive («ora 7»), e vuota dopo il salvataggio («ora 0»)", () => {
    expect(passwordCheck("1234567", "", false)).toEqual({
      firstInvalid: true,
      firstHint: "Servono almeno 8 caratteri (ora 7).",
      secondInvalid: false,
      secondError: null,
      canSave: false,
    });
    expect(passwordCheck("", "", true)).toMatchObject({
      firstInvalid: true,
      firstHint: "Servono almeno 8 caratteri (ora 0).",
      canSave: false,
    });
  });

  it("le due diverse: nessun errore prima del salvataggio, «non coincidono» dopo", () => {
    expect(passwordCheck("12345678", "12345679", false)).toEqual({
      firstInvalid: false,
      firstHint: "Almeno 8 caratteri.",
      secondInvalid: false,
      secondError: null,
      canSave: false,
    });
    expect(passwordCheck("12345678", "12345679", true)).toEqual({
      firstInvalid: false,
      firstHint: "Almeno 8 caratteri.",
      secondInvalid: true,
      secondError: "Le due password non coincidono.",
      canSave: false,
    });
  });

  it("si salva con 8 caratteri e le due uguali, non con 7 uguali", () => {
    expect(passwordCheck("12345678", "12345678", false).canSave).toBe(true);
    expect(passwordCheck("12345678", "12345678", true).canSave).toBe(true);
    expect(passwordCheck("1234567", "1234567", true)).toMatchObject({
      firstInvalid: true,
      secondInvalid: false,
      canSave: false,
    });
  });
});

describe("passwordSaveError · l'errore sotto il campo", () => {
  const same = "È la password che usi già: scegline una diversa.";
  const weak = "Questa password è troppo debole: scegline una più lunga o più varia.";
  const reauth = "Per cambiarla serve un accesso recente: esci, rientra e riprova.";
  const generic = "Non siamo riusciti a salvare la password. Riprova tra poco.";

  it("dal codice o dal messaggio di Supabase Auth, il resto generico", () => {
    expect(passwordSaveError({ code: "same_password", message: "x" })).toBe(same);
    expect(
      passwordSaveError({ message: "New password should be different from the old password." }),
    ).toBe(same);
    expect(passwordSaveError({ code: "weak_password", message: "x" })).toBe(weak);
    expect(passwordSaveError({ message: "Password should be at least 6 characters." })).toBe(weak);
    expect(passwordSaveError({ code: "reauthentication_needed", message: "x" })).toBe(reauth);
    expect(passwordSaveError({ message: "Password update requires reauthentication." })).toBe(
      reauth,
    );
    expect(passwordSaveError({ message: "Failed to fetch" })).toBe(generic);
    expect(passwordSaveError({ code: null, message: null })).toBe(generic);
    expect(passwordSaveError(null)).toBe(generic);
  });
});
