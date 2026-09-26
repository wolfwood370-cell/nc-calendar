// Dati di prova della lista Clienti (passata 05): come il prototipo, ora
// 25/09/2026 10:40 a Roma. Un cliente per ogni caso di stato, crediti e
// presenza.

import type {
  ListAllocation,
  ListBlock,
  ListBooking,
  ListClient,
  ListExtraCredit,
} from "@/lib/client-list";

export const NOW = new Date("2026-09-25T10:40:00+02:00");

const client = (
  id: string,
  full_name: string,
  path_type: ListClient["path_type"],
  over: Partial<ListClient> = {},
): ListClient => ({
  id,
  full_name,
  email: `${id}@email.it`,
  phone: null,
  status: "active",
  path_type,
  pack_label: null,
  auto_renew_blocks: path_type === "recurring",
  ...over,
});

export const CLIENTS: ListClient[] = [
  client("giulia", "Giulia Bianchi", "fixed", { phone: "+39 340 111 2222" }),
  client("luca", "Luca Verdi", "recurring"),
  client("marta", "Marta Conti", "recurring", { auto_renew_blocks: false }),
  client("sara", "Sara Neri", "fixed"),
  client("davide", "Davide Ferrari", "fixed"),
  client("elena", "Elena Ricci", "free", { pack_label: "Cliente Libero" }),
  client("roberto", "Roberto Fontana", "fixed", { status: "archived" }),
  client("andrea", "Andrea Gallo", "fixed", { pack_label: "PT Pack 12" }),
  // Stesso nome di Andrea: la parità si risolve per nome e poi per id.
  client("andrea2", "Andrea Gallo", "fixed"),
];

const block = (
  id: string,
  client_id: string,
  seq: number,
  start: string,
  end: string,
  status = "active",
): ListBlock => ({
  id,
  client_id,
  sequence_order: seq,
  start_date: start,
  end_date: end,
  status,
});

export const BLOCKS: ListBlock[] = [
  // Giulia: 6 blocchi da 28 giorni, oggi nel 3°.
  block("g1", "giulia", 1, "2026-07-27", "2026-08-23", "completed"),
  block("g2", "giulia", 2, "2026-08-24", "2026-09-20", "completed"),
  block("g3", "giulia", 3, "2026-09-21", "2026-10-18"),
  block("g4", "giulia", 4, "2026-10-19", "2026-11-15"),
  block("g5", "giulia", 5, "2026-11-16", "2026-12-13"),
  block("g6", "giulia", 6, "2026-12-14", "2027-01-10"),
  // Luca: mensile col rinnovo acceso.
  block("l1", "luca", 1, "2026-09-07", "2026-10-04"),
  // Marta: mensile col rinnovo spento, blocco che finisce fra 2 giorni.
  block("m1", "marta", 1, "2026-08-31", "2026-09-27"),
  // Sara: ultimo blocco con 1 credito.
  block("s1", "sara", 1, "2026-09-10", "2026-10-07"),
  // Davide: percorso finito, tutto usato.
  block("d1", "davide", 1, "2026-08-01", "2026-08-28", "completed"),
  // Roberto: archiviato.
  block("r1", "roberto", 1, "2026-09-01", "2026-09-28"),
  // Andrea: 3 blocchi, oggi nel 1°.
  block("a1", "andrea", 1, "2026-09-21", "2026-10-18"),
  block("a2", "andrea", 2, "2026-10-19", "2026-11-15"),
  block("a3", "andrea", 3, "2026-11-16", "2026-12-13"),
  // Andrea 2: un blocco che finisce più avanti.
  block("b1", "andrea2", 1, "2026-09-21", "2026-10-30"),
];

const alloc = (
  block_id: string,
  quantity_assigned: number,
  quantity_booked: number,
  event_type_id: string | null = "pt",
): ListAllocation => ({
  block_id,
  event_type_id,
  session_type: "PT Session",
  quantity_assigned,
  quantity_booked,
});

export const ALLOCATIONS: ListAllocation[] = [
  alloc("g1", 6, 6),
  alloc("g2", 6, 6),
  alloc("g3", 6, 1),
  alloc("g4", 6, 0),
  alloc("g5", 6, 0),
  alloc("g6", 6, 0),
  alloc("l1", 14, 9),
  alloc("m1", 12, 9),
  alloc("s1", 5, 4),
  alloc("d1", 4, 4),
  alloc("r1", 8, 2),
  alloc("a1", 4, 2),
  alloc("a2", 4, 0),
  alloc("a3", 4, 0),
  alloc("b1", 4, 2),
];

let n = 0;
const bk = (
  client_id: string,
  scheduled_at: string,
  status: string,
): ListBooking & { id: string } => ({
  id: `bk${++n}`,
  client_id,
  event_type_id: "pt",
  session_type: "PT Session",
  status,
  scheduled_at,
});

export const BOOKINGS: Array<ListBooking & { id: string }> = [
  // Giulia: 5 svolte e 1 assente nelle ultime 8 settimane, 1 annullata dal
  // coach (non conta per getAttendance, contava per il Profilo di prima).
  bk("giulia", "2026-08-03T07:00:00Z", "completed"),
  bk("giulia", "2026-08-10T07:00:00Z", "completed"),
  bk("giulia", "2026-08-17T07:00:00Z", "completed"),
  bk("giulia", "2026-08-24T07:00:00Z", "completed"),
  bk("giulia", "2026-08-31T07:00:00Z", "no_show"),
  bk("giulia", "2026-09-07T07:00:00Z", "completed"),
  bk("giulia", "2026-09-14T07:00:00Z", "cancelled"),
  bk("giulia", "2026-09-28T07:00:00Z", "scheduled"),
  // Luca: tutte svolte, e un'assenza di 12 settimane fa (fuori periodo).
  bk("luca", "2026-07-01T07:00:00Z", "no_show"),
  bk("luca", "2026-09-14T05:30:00Z", "completed"),
  bk("luca", "2026-09-21T05:30:00Z", "completed"),
  bk("luca", "2026-09-28T05:30:00Z", "scheduled"),
  // Marta: 2 svolte, 1 annullata tardi.
  bk("marta", "2026-09-08T17:30:00Z", "completed"),
  bk("marta", "2026-09-15T17:30:00Z", "late_cancelled"),
  bk("marta", "2026-09-22T17:30:00Z", "completed"),
  bk("marta", "2026-09-25T17:30:00Z", "scheduled"),
  // Sara: 3 svolte, 1 assente.
  bk("sara", "2026-09-11T06:30:00Z", "completed"),
  bk("sara", "2026-09-15T06:30:00Z", "no_show"),
  bk("sara", "2026-09-18T06:30:00Z", "completed"),
  bk("sara", "2026-09-22T06:30:00Z", "completed"),
  // Davide: 4 svolte ad agosto, tutto il percorso.
  bk("davide", "2026-08-03T16:00:00Z", "completed"),
  bk("davide", "2026-08-10T16:00:00Z", "completed"),
  bk("davide", "2026-08-17T16:00:00Z", "completed"),
  bk("davide", "2026-08-24T16:00:00Z", "completed"),
  // Andrea: una svolta, una assente, una prossima.
  bk("andrea", "2026-09-22T16:00:00Z", "completed"),
  bk("andrea", "2026-09-23T16:00:00Z", "no_show"),
  bk("andrea", "2026-09-25T16:00:00Z", "scheduled"),
  // Andrea 2: una svolta, una assente (stessa presenza di Andrea).
  bk("andrea2", "2026-09-22T15:00:00Z", "completed"),
  bk("andrea2", "2026-09-23T15:00:00Z", "no_show"),
];

export const EXTRAS: ListExtraCredit[] = [{ client_id: "elena", quantity: 7, quantity_booked: 5 }];
