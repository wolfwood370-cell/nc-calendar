// Le notifiche del cliente (passata 08): i promemoria, la lista con le azioni
// del coach, lo stato «letta» e i testi della pagina. Lunedì 28 settembre 2026
// alle 10:40, ora locale: le stesse attese a Roma, in UTC e a Los Angeles,
// perché le date dei casi sono costruite in ora locale.

import { describe, expect, it } from "vitest";
import { NO_COACH, type BookCoach, type BookState } from "@/lib/client-book";
import {
  READ_IDS_CAP,
  clientNotificationList,
  clientNotificationsReadKey,
  clientReminders,
  emptyNotificationsText,
  nextReadIds,
  notificationsSummary,
  parseReadIds,
  unreadCount,
  type ClientReminder,
  type ClientReminderInput,
  type ReminderBooking,
} from "@/lib/client-notifications";

const NOW = new Date(2026, 8, 28, 10, 40);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const PT = "tipologia-pt";
const EVENT_TYPES = [{ id: PT, name: "Personal Training" }];
const NICOLO: BookCoach = { name: "Nicolò Castello", firstName: "Nicolò", whatsapp: null };

const inHours = (h: number) => new Date(NOW.getTime() + h * HOUR);
/** L'id della conferma: la sessione e il suo inizio in millisecondi. */
const confirmId = (id: string, start: Date) => `confirm-${id}-${start.getTime()}`;

const session = (
  id: string,
  start: Date,
  over: Partial<ReminderBooking> = {},
): ReminderBooking => ({
  id,
  status: "scheduled",
  scheduled_at: start.toISOString(),
  duration_min: 60,
  client_confirmed_at: null,
  title: null,
  event_type_id: PT,
  session_type: "PT Session",
  category: "client_session",
  ...over,
});

type Book = NonNullable<ClientReminderInput["book"]>;

/**
 * Lo stato dei crediti coi soli campi che le regole leggono: il blocco di
 * riferimento («blocco-3», dal 14/09 all'11/10 se non detto), le opzioni di
 * Prenota (count, e blockAvail del pool del blocco), il numero della Home,
 * chi compra, il percorso concluso.
 */
const book = (
  o: {
    start?: string;
    end?: string;
    sequence?: number;
    number?: number | null;
    counts?: number[];
    blockAvail?: number[];
    canBuy?: boolean;
    concluded?: boolean;
    pathType?: "fixed" | "recurring" | "free";
  } = {},
): Book => {
  const free = o.pathType === "free";
  const counts = o.counts ?? [5];
  return {
    client: { path_type: o.pathType ?? "fixed" },
    state: {
      reference: free
        ? null
        : ({
            id: "blocco-3",
            status: "active",
            start_date: o.start ?? "2026-09-14",
            end_date: o.end ?? "2026-10-11",
            sequence_order: o.sequence ?? 3,
            allocations: [],
          } as unknown as BookState["reference"]),
      referenceNumber: free ? null : o.number === undefined ? 3 : o.number,
      options: counts.map((count, i) => ({
        count,
        referencePool: { blockAvail: o.blockAvail?.[i] ?? count },
      })) as unknown as BookState["options"],
      canBuy: o.canBuy ?? true,
      blocked: o.concluded
        ? ({ kind: "concluso", title: "", text: "", buy: false } as BookState["blocked"])
        : null,
    },
  };
};

const input = (over: Partial<ClientReminderInput> = {}): ClientReminderInput => ({
  clientId: "giulia",
  bookings: [],
  eventTypes: EVENT_TYPES,
  feedback: [],
  book: null,
  pathStartDate: null,
  bia: [],
  coach: NICOLO,
  coachCreated: null,
  ...over,
});

const ids = (items: readonly Pick<ClientReminder, "id">[]) => items.map((i) => i.id);

describe("clientReminders · la presenza da confermare", () => {
  it("una voce per ogni sessione «Da confermare», in ordine d'inizio, con «oggi» e «domani»", () => {
    const items = clientReminders(
      input({ bookings: [session("s2", inHours(30)), session("s1", inHours(3))] }),
      NOW,
    );
    expect(items.map((i) => [i.id, i.kind, i.title, i.body, i.target])).toEqual([
      [
        confirmId("s1", inHours(3)),
        "confirm",
        "Conferma la tua presenza",
        "Personal Training · oggi alle 13:40",
        { to: "/client/bookings/$bookingId", bookingId: "s1" },
      ],
      [
        confirmId("s2", inHours(30)),
        "confirm",
        "Conferma la tua presenza",
        "Personal Training · domani alle 16:40",
        { to: "/client/bookings/$bookingId", bookingId: "s2" },
      ],
    ]);
  });

  it("oltre domani la data è lunga, col mese", () => {
    const wednesday = new Date(2026, 8, 30, 9, 0);
    const [item] = clientReminders(
      input({ bookings: [session("s1", wednesday)] }),
      new Date(2026, 8, 28, 10, 0),
    );
    expect(item?.body).toBe("Personal Training · mercoledì 30 settembre alle 09:00");
  });

  it("senza tipologia il nome è quello del tipo base, come in Sessioni", () => {
    const [item] = clientReminders(
      input({
        bookings: [session("s1", inHours(3), { event_type_id: null, category: "consulenza" })],
      }),
      NOW,
    );
    expect(item?.body).toBe("Consulenza · oggi alle 13:40");
  });

  it("spostata, la stessa sessione ha un id nuovo: la voce torna non letta", () => {
    const [before] = clientReminders(input({ bookings: [session("s1", inHours(30))] }), NOW);
    const [after] = clientReminders(input({ bookings: [session("s1", inHours(31))] }), NOW);
    expect(before?.id).toBe(confirmId("s1", inHours(30)));
    expect(after?.id).toBe(confirmId("s1", inHours(31)));
    expect(before?.id).not.toBe(after?.id);
  });

  it("la data della voce è l'inizio meno 48 ore, o la creazione se è più recente", () => {
    const start = inHours(30);
    const window = new Date(start.getTime() - 48 * HOUR);
    const [plain] = clientReminders(input({ bookings: [session("s1", start)] }), NOW);
    expect(plain?.at).toEqual(window);
    const created = new Date(NOW.getTime() - 10 * MIN);
    const [late] = clientReminders(
      input({ bookings: [session("s1", start, { created_at: created.toISOString() })] }),
      NOW,
    );
    expect(late?.at).toEqual(created);
    const [early] = clientReminders(
      input({
        bookings: [session("s1", start, { created_at: new Date(2026, 8, 1).toISOString() })],
      }),
      NOW,
    );
    expect(early?.at).toEqual(window);
    const [broken] = clientReminders(
      input({ bookings: [session("s1", start, { created_at: "non è una data" })] }),
      NOW,
    );
    expect(broken?.at).toEqual(window);
  });

  it("confermata, oltre le 48 ore, annullata o già iniziata: nessuna voce", () => {
    const items = clientReminders(
      input({
        bookings: [
          session("confermata", inHours(30), { client_confirmed_at: NOW.toISOString() }),
          session("lontana", inHours(72)),
          session("annullata", inHours(30), { status: "cancelled" }),
          session("in-corso", new Date(NOW.getTime() - 10 * MIN)),
        ],
      }),
      NOW,
    );
    expect(items).toEqual([]);
  });
});

describe("clientReminders · i crediti", () => {
  it("i crediti da usare: i numeri dell'avviso della Home, da 7 giorni prima della fine", () => {
    const items = clientReminders(
      input({ book: book({ end: "2026-10-04", blockAvail: [2, 1], counts: [4, 1] }) }),
      NOW,
    );
    expect(items).toEqual([
      {
        id: "use-giulia-blocco-3-3",
        kind: "use",
        title: "Crediti da usare",
        body: "3 crediti da prenotare entro domenica 4 ottobre",
        at: new Date(2026, 8, 27),
        target: { to: "/client/book" },
      },
    ]);
  });

  it("con i crediti da usare non c'è anche «Ti restano»", () => {
    const items = clientReminders(input({ book: book({ end: "2026-10-04", counts: [2] }) }), NOW);
    expect(ids(items)).toEqual(["use-giulia-blocco-3-2"]);
  });

  it("1 o 2 crediti in tutto: «Ti resta»/«Ti restano», col Booster a chi lo compra", () => {
    expect(clientReminders(input({ book: book({ counts: [1, 1] }) }), NOW)).toEqual([
      {
        id: "low-giulia-blocco-3-2",
        kind: "low",
        title: "Ti restano 2 crediti",
        body: "Puoi aggiungerne con un Booster.",
        at: null,
        target: { to: "/client/store" },
      },
    ]);
    const [one] = clientReminders(input({ book: book({ counts: [1, 0] }) }), NOW);
    expect([one?.id, one?.title]).toEqual(["low-giulia-blocco-3-1", "Ti resta 1 credito"]);
  });

  it("chi non compra parla col coach, e verso la Home", () => {
    const noBuy = book({ counts: [2], canBuy: false });
    const [withCoach] = clientReminders(input({ book: noBuy }), NOW);
    expect([withCoach?.body, withCoach?.target]).toEqual([
      "Per continuare parla con Nicolò.",
      { to: "/client" },
    ]);
    const [noCoach] = clientReminders(input({ book: noBuy, coach: NO_COACH }), NOW);
    expect(noCoach?.body).toBe("Per continuare parla con il tuo coach.");
  });

  it("il cliente libero: l'id porta «libero» al posto del blocco", () => {
    const items = clientReminders(
      input({ book: book({ pathType: "free", counts: [1], canBuy: false }) }),
      NOW,
    );
    expect(items.map((i) => [i.id, i.body])).toEqual([
      ["low-giulia-libero-1", "Per continuare parla con Nicolò."],
    ]);
  });

  it("niente voce con 0 o con 3 crediti, a percorso concluso, o senza lo stato dei crediti", () => {
    expect(clientReminders(input({ book: book({ counts: [0] }) }), NOW)).toEqual([]);
    expect(clientReminders(input({ book: book({ counts: [2, 1] }) }), NOW)).toEqual([]);
    const concluded = book({
      start: "2026-08-10",
      end: "2026-09-06",
      counts: [1],
      concluded: true,
    });
    expect(clientReminders(input({ book: concluded }), NOW)).toEqual([]);
    expect(clientReminders(input({ book: null }), NOW)).toEqual([]);
  });

  it("un blocco nuovo con gli stessi crediti ha un id nuovo", () => {
    const [before] = clientReminders(input({ book: book({ counts: [2] }) }), NOW);
    const next = book({ counts: [2] });
    (next.state.reference as { id: string }).id = "blocco-4";
    const [after] = clientReminders(input({ book: next }), NOW);
    expect([before?.id, after?.id]).toEqual(["low-giulia-blocco-3-2", "low-giulia-blocco-4-2"]);
  });
});

describe("clientReminders · il blocco e il percorso appena iniziati", () => {
  it("un blocco iniziato da meno di 7 giorni, col numero della Home", () => {
    const items = clientReminders(
      input({ book: book({ start: "2026-09-24", end: "2026-10-21", sequence: 9, number: 4 }) }),
      NOW,
    );
    expect(items).toEqual([
      {
        id: "renewed-giulia-blocco-3",
        kind: "renewed",
        title: "È iniziato un nuovo blocco",
        body: "Blocco 4 · i nuovi crediti sono disponibili",
        at: new Date(2026, 8, 24),
        target: { to: "/client" },
      },
    ]);
    const [noNumber] = clientReminders(
      input({ book: book({ start: "2026-09-24", end: "2026-10-21", sequence: 9, number: null }) }),
      NOW,
    );
    expect(noNumber?.body).toBe("Blocco 9 · i nuovi crediti sono disponibili");
  });

  it("il primo blocco del cliente, o quello che comincia con path_start_date, apre un percorso", () => {
    const first = clientReminders(
      input({ book: book({ start: "2026-09-28", end: "2026-10-25", sequence: 1, number: 1 }) }),
      NOW,
    );
    expect(first).toEqual([
      {
        id: "path-giulia-blocco-3",
        kind: "path",
        title: "Nuovo percorso",
        body: "Percorso fisso · i crediti sono disponibili",
        at: new Date(2026, 8, 28),
        target: { to: "/client" },
      },
    ]);
    const [monthly] = clientReminders(
      input({
        book: book({ start: "2026-09-26", end: "2026-10-23", sequence: 1, pathType: "recurring" }),
      }),
      NOW,
    );
    expect(monthly?.body).toBe("Abbonamento mensile · i crediti sono disponibili");
    const [restarted] = clientReminders(
      input({
        book: book({ start: "2026-09-22", end: "2026-10-19", sequence: 7 }),
        pathStartDate: "2026-09-22",
      }),
      NOW,
    );
    expect([restarted?.id, restarted?.kind]).toEqual(["path-giulia-blocco-3", "path"]);
  });

  it("niente notizia dal settimo giorno, per un blocco che deve iniziare o per il cliente libero", () => {
    const seventh = book({ start: "2026-09-21", end: "2026-10-18", sequence: 4 });
    expect(clientReminders(input({ book: seventh }), NOW)).toEqual([]);
    const sixth = book({ start: "2026-09-22", end: "2026-10-19", sequence: 4 });
    expect(ids(clientReminders(input({ book: sixth }), NOW))).toEqual(["renewed-giulia-blocco-3"]);
    const future = book({ start: "2026-10-05", end: "2026-11-01", sequence: 4 });
    expect(clientReminders(input({ book: future }), NOW)).toEqual([]);
    expect(clientReminders(input({ book: book({ pathType: "free" }) }), NOW)).toEqual([]);
  });
});

describe("clientReminders · la BIA", () => {
  const measure = (
    measured_on: string,
    created_at: string,
    weight_kg: number,
    muscle_kg: number,
  ) => ({
    measured_on,
    created_at,
    weight_kg,
    muscle_kg,
  });

  it("la misurazione più recente, se registrata da meno di 14 giorni, con la virgola e la massa magra", () => {
    const registered = new Date(2026, 8, 27, 18, 5);
    const items = clientReminders(
      input({
        bia: [
          measure("2026-09-20", new Date(2026, 8, 20, 10).toISOString(), 62, 25.6),
          measure("2026-09-25", registered.toISOString(), 61.25, 25),
        ],
      }),
      NOW,
    );
    expect(items).toEqual([
      {
        id: "bia-2026-09-25",
        kind: "bia",
        title: "Nuova misurazione BIA",
        body: "Peso 61,3 kg · massa magra 25 kg",
        at: registered,
        target: { to: "/client" },
      },
    ]);
  });

  it("registrata da 14 giorni esatti: nessuna voce; un minuto dopo sì", () => {
    const at = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
    expect(
      clientReminders(input({ bia: [measure("2026-09-14", at(14 * DAY), 61, 25)] }), NOW),
    ).toEqual([]);
    const [item] = clientReminders(
      input({ bia: [measure("2026-09-14", at(14 * DAY - MIN), 70.04, 30.06)] }),
      NOW,
    );
    expect(item?.body).toBe("Peso 70 kg · massa magra 30,1 kg");
  });

  it("senza la data di registrazione vale il giorno della misura", () => {
    const [item] = clientReminders(input({ bia: [measure("2026-09-23", "", 61.2, 25.9)] }), NOW);
    expect([item?.at, item?.body]).toEqual([
      new Date(2026, 8, 23),
      "Peso 61,2 kg · massa magra 25,9 kg",
    ]);
  });
});

describe("clientReminders · la valutazione", () => {
  const done = (id: string, start: Date, over: Partial<ReminderBooking> = {}) =>
    session(id, start, { status: "completed", ...over });

  it("la più recente fra le sessioni da valutare, con la data della sua fine", () => {
    const items = clientReminders(
      input({
        bookings: [
          done("vecchia", new Date(2026, 8, 24, 9)),
          done("ieri", new Date(2026, 8, 27, 9), { duration_min: 45 }),
        ],
      }),
      NOW,
    );
    expect(items).toEqual([
      {
        id: "fb-ieri",
        kind: "feedback",
        title: "Com'è andata?",
        body: "Valuta la sessione di domenica 27 settembre",
        at: new Date(2026, 8, 27, 9, 45),
        target: { to: "/client/bookings/$bookingId", bookingId: "ieri" },
      },
    ]);
    const [noLength] = clientReminders(
      input({ bookings: [done("zero", new Date(2026, 8, 27, 9), { duration_min: 0 })] }),
      NOW,
    );
    expect(noLength?.at).toEqual(new Date(2026, 8, 27, 10));
  });

  it("prima che le valutazioni arrivino (feedback null): niente voce", () => {
    const bookings = [done("ieri", new Date(2026, 8, 27, 9))];
    expect(clientReminders(input({ bookings, feedback: null }), NOW)).toEqual([]);
  });

  it("valutata, importata da Google (col titolo) o di più di 14 giorni fa: niente voce", () => {
    const rated = clientReminders(
      input({
        bookings: [done("ieri", new Date(2026, 8, 27, 9))],
        feedback: [{ booking_id: "ieri" }],
      }),
      NOW,
    );
    const imported = clientReminders(
      input({ bookings: [done("google", new Date(2026, 8, 27, 9), { title: "Allenamento" })] }),
      NOW,
    );
    const old = clientReminders(
      input({ bookings: [done("vecchia", new Date(2026, 8, 10, 9))] }),
      NOW,
    );
    const absent = clientReminders(
      input({ bookings: [session("assente", new Date(2026, 8, 27, 9), { status: "no_show" })] }),
      NOW,
    );
    expect([rated, imported, old, absent]).toEqual([[], [], [], []]);
  });
});

describe("clientReminders · l'ordine prima della lista", () => {
  it("le conferme, i crediti, il blocco, la BIA, la valutazione", () => {
    const items = clientReminders(
      input({
        bookings: [
          session("s1", inHours(3)),
          session("ieri", new Date(2026, 8, 27, 9), { status: "completed" }),
        ],
        book: book({ start: "2026-09-24", end: "2026-10-21", counts: [2], number: 4 }),
        bia: [{ measured_on: "2026-09-25", created_at: "", weight_kg: 61, muscle_kg: 25 }],
      }),
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual(["confirm", "low", "renewed", "bia", "feedback"]);
  });
});

describe("clientNotificationList · le due fonti in una lista", () => {
  const MOVED = {
    coach_name: "Nicolò Castello",
    booking_id: "b1",
    session_label: "Personal Training",
    old_scheduled_at: new Date(2026, 9, 5, 9).toISOString(),
    scheduled_at: new Date(2026, 9, 5, 10).toISOString(),
  };
  const rows = [
    {
      id: "r1",
      type: "booking.moved_by_coach",
      payload: MOVED,
      read_at: null,
      created_at: new Date(NOW.getTime() - 25 * MIN).toISOString(),
    },
    {
      id: "r2",
      type: "credits.added",
      payload: { coach_name: "Nicolò Castello", quantity: 2, session_label: "Personal Training" },
      read_at: new Date(2026, 8, 26, 12).toISOString(),
      created_at: new Date(2026, 8, 26, 11).toISOString(),
    },
    {
      id: "r3",
      type: "bia.recorded",
      payload: { weight: 61.2, lean_mass: 25.3 },
      read_at: null,
      created_at: NOW.toISOString(),
    },
    {
      id: "r4",
      type: "booking.created",
      payload: {
        booking_id: "b9",
        client_name: "Giulia",
        session_label: "PT",
        scheduled_at: inHours(5).toISOString(),
      },
      read_at: null,
      created_at: NOW.toISOString(),
    },
    {
      id: "r5",
      type: "booking.no_show",
      payload: { booking_id: "b4", scheduled_at: new Date(2026, 8, 28, 9).toISOString() },
      read_at: null,
      created_at: NOW.toISOString(),
    },
  ];
  const reminders = clientReminders(
    input({ bookings: [session("s1", inHours(3))], book: book({ counts: [1] }) }),
    NOW,
  );
  const CONFIRM = confirmId("s1", inHours(3));
  const list = (readIds: string[] = [], bookingIds: ReadonlySet<string> | null = null) =>
    clientNotificationList({ reminders, rows, readIds, coach: NICOLO, bookingIds }, NOW);

  it("dalla più recente: i crediti quasi finiti in cima, e le righe che non si leggono non ci sono", () => {
    const items = list();
    expect(items.map((i) => [i.id, i.rowId, i.kind, i.ago, i.unread])).toEqual([
      ["low-giulia-blocco-3-1", null, "low", null, true],
      ["row-r1", "r1", "moved", "25 min fa", true],
      [CONFIRM, null, "confirm", "2 giorni fa", true],
      ["row-r2", "r2", "credits", "2 giorni fa", false],
    ]);
    expect(items[1]?.aria).toBe(
      "Non letta. Nicolò ha spostato una sessione. Personal Training · lun 5 ott 09:00 → lun 5 ott alle 10:00",
    );
    expect(items[3]?.aria).toBe("Crediti aggiunti. +2 Personal Training da Nicolò");
    expect(items[1]?.target).toEqual({ to: "/client/bookings/$bookingId", bookingId: "b1" });
    expect(unreadCount(items)).toBe(3);
  });

  it("il nome accessibile non mette il punto dopo «?»", () => {
    const feedback = clientReminders(
      input({ bookings: [session("ieri", new Date(2026, 8, 27, 9), { status: "completed" })] }),
      NOW,
    );
    const [item] = clientNotificationList(
      { reminders: feedback, rows: [], readIds: [], coach: NICOLO, bookingIds: null },
      NOW,
    );
    expect(item?.aria).toBe("Non letta. Com'è andata? Valuta la sessione di domenica 27 settembre");
  });

  it("un promemoria letto resta letto finché il suo id non cambia", () => {
    // Letto «Ti restano 2 crediti»: «Ti resta 1 credito» è un'altra voce.
    expect(list(["low-giulia-blocco-3-2", CONFIRM]).map((i) => [i.id, i.unread])).toEqual([
      ["low-giulia-blocco-3-1", true],
      ["row-r1", true],
      [CONFIRM, false],
      ["row-r2", false],
    ]);
    // Spostata, la conferma è un'altra voce: torna non letta.
    const moved = clientReminders(input({ bookings: [session("s1", inHours(4))] }), NOW);
    const [again] = clientNotificationList(
      { reminders: moved, rows: [], readIds: [CONFIRM], coach: NICOLO, bookingIds: null },
      NOW,
    );
    expect([again?.id, again?.unread]).toEqual([confirmId("s1", inHours(4)), true]);
  });

  it("una riga di una sessione che non è più del cliente porta alla Home", () => {
    const target = (bookingIds: ReadonlySet<string> | null) =>
      list([], bookingIds).find((i) => i.id === "row-r1")?.target;
    expect(target(new Set(["s1"]))).toEqual({ to: "/client" });
    expect(target(new Set(["s1", "b1"]))).toEqual({
      to: "/client/bookings/$bookingId",
      bookingId: "b1",
    });
    expect(target(null)).toEqual({ to: "/client/bookings/$bookingId", bookingId: "b1" });
    // I promemoria portano dove dicono: la loro sessione c'è per forza.
    expect(list([], new Set()).find((i) => i.id === CONFIRM)?.target).toEqual({
      to: "/client/bookings/$bookingId",
      bookingId: "s1",
    });
  });

  it("i crediti quasi finiti restano in cima anche sopra una riga più nuova dell'ora della cornice", () => {
    // L'ora della cornice va a passi di 30 secondi: una riga appena arrivata
    // può avere un momento dopo `now`.
    const fresh = {
      id: "r9",
      type: "booking.moved_by_coach",
      payload: MOVED,
      read_at: null,
      created_at: new Date(NOW.getTime() + 20_000).toISOString(),
    };
    const items = clientNotificationList(
      { reminders, rows: [fresh, rows[0]!], readIds: [], coach: NICOLO, bookingIds: null },
      NOW,
    );
    expect(items.map((i) => [i.id, i.ago])).toEqual([
      ["low-giulia-blocco-3-1", null],
      ["row-r9", "adesso"],
      ["row-r1", "25 min fa"],
      [CONFIRM, "2 giorni fa"],
    ]);
  });

  it("a parità di momento vale l'id, e la creazione che non si legge conta come adesso", () => {
    const same = new Date(NOW.getTime() - HOUR).toISOString();
    const row = (id: string, created_at: string) => ({
      id,
      type: "credits.added",
      payload: { quantity: 1, session_label: "PT" },
      read_at: null,
      created_at,
    });
    const items = clientNotificationList(
      {
        reminders: [],
        rows: [row("b", same), row("a", same), row("z", "non è una data")],
        readIds: [],
        coach: NO_COACH,
        bookingIds: null,
      },
      NOW,
    );
    expect(items.map((i) => [i.id, i.ago, i.body])).toEqual([
      ["row-z", "adesso", "+1 PT dal tuo coach"],
      ["row-a", "1 ora fa", "+1 PT dal tuo coach"],
      ["row-b", "1 ora fa", "+1 PT dal tuo coach"],
    ]);
  });
});

describe("lo stato «letta» dei promemoria", () => {
  const current = [{ id: "confirm-s1" }, { id: "use-giulia-blocco-3-3" }];

  it("il tocco aggiunge e basta: le lette che adesso mancano restano", () => {
    expect(nextReadIds(["vecchia", "confirm-s1"], current, "use-giulia-blocco-3-3")).toEqual([
      "vecchia",
      "confirm-s1",
      "use-giulia-blocco-3-3",
    ]);
  });

  it("un id già letto va in fondo, una volta sola", () => {
    expect(nextReadIds(["confirm-s1", "vecchia"], current, "confirm-s1")).toEqual([
      "vecchia",
      "confirm-s1",
    ]);
  });

  it("«Segna tutte come lette» aggiunge i promemoria di adesso", () => {
    expect(nextReadIds(["vecchia", "confirm-s1"], current, "all")).toEqual([
      "vecchia",
      "confirm-s1",
      "use-giulia-blocco-3-3",
    ]);
  });

  it(`oltre ${READ_IDS_CAP} id escono i più vecchi`, () => {
    const many = Array.from({ length: READ_IDS_CAP }, (_, i) => `v${i}`);
    const next = nextReadIds(many, current, "nuova");
    expect(next).toHaveLength(READ_IDS_CAP);
    expect([next[0], next[next.length - 1]]).toEqual(["v1", "nuova"]);
  });

  it("la chiave per utente e la lettura tollerante dello storage", () => {
    expect(clientNotificationsReadKey("u1")).toBe("nc-client-notif-read-u1");
    expect([null, "", "{rotto", '{"a":1}'].map(parseReadIds)).toEqual([[], [], [], []]);
    expect(parseReadIds('["a", 2, "b"]')).toEqual(["a", "b"]);
  });
});

describe("i testi della pagina", () => {
  it("il riepilogo", () => {
    expect([notificationsSummary(3), notificationsSummary(1), notificationsSummary(0)]).toEqual([
      "3 da leggere",
      "1 da leggere",
      "Tutte lette",
    ]);
  });

  it("la pagina vuota, col coach e senza", () => {
    expect(emptyNotificationsText(NICOLO)).toBe(
      "Qui arrivano i promemoria e gli avvisi quando Nicolò cambia una sessione.",
    );
    expect(emptyNotificationsText(NO_COACH)).toBe(
      "Qui arrivano i promemoria e gli avvisi quando il tuo coach cambia una sessione.",
    );
  });
});

// Passata 09: una riga nata dopo la lettura delle sessioni tiene il dettaglio
// anche se la sua sessione non è fra quelle lette (il coach l'ha appena
// creata); una nata prima porta alla Home (la sessione non c'è più).
describe("clientNotificationList · il momento della lettura delle sessioni (passata 09)", () => {
  const created = new Date(NOW.getTime() - MIN);
  const rows = [
    {
      id: "r-nuova",
      type: "booking.created_by_coach",
      payload: {
        coach_name: "Nicolò Castello",
        booking_id: "b-nuova",
        session_label: "Personal Training",
        scheduled_at: new Date(2026, 9, 1, 10).toISOString(),
      },
      read_at: null,
      created_at: created.toISOString(),
    },
  ];
  const targets = (bookingIds: Set<string> | null, bookingIdsAt?: number | null) =>
    clientNotificationList(
      { reminders: [], rows, readIds: [], coach: NICOLO, bookingIds, bookingIdsAt },
      NOW,
    ).map((i) => i.target);
  const DETAIL = { to: "/client/bookings/$bookingId", bookingId: "b-nuova" };
  const HOME = { to: "/client" };

  it("nata dopo la lettura: il dettaglio, anche se la sessione non è fra quelle lette", () => {
    expect(targets(new Set(["b1"]), NOW.getTime() - 5 * MIN)).toEqual([DETAIL]);
  });

  it("nata prima della lettura, o nello stesso istante: la Home", () => {
    expect(targets(new Set(["b1"]), NOW.getTime())).toEqual([HOME]);
    expect(targets(new Set(["b1"]), created.getTime())).toEqual([HOME]);
  });

  it("senza il momento della lettura, come prima", () => {
    expect(targets(new Set(["b1"]), null)).toEqual([HOME]);
    expect(targets(new Set(["b1"]))).toEqual([HOME]);
    expect(targets(null, null)).toEqual([DETAIL]);
    expect(targets(new Set(["b-nuova"]), NOW.getTime())).toEqual([DETAIL]);
  });
});
