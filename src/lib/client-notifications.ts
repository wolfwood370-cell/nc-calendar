// ----------------------------------------------------------------------------
// Le voci della campanella del cliente (lato cliente, passata 01, audit H8
// prima parte)
// ----------------------------------------------------------------------------
// Prima le calcolava la Home dai suoi dati, e la campanella c'era solo lì;
// dalla 01 la campanella sta nelle cinque schede e nell'header desktop, e la
// pagina Notifiche le elenca, quindi il calcolo esce dalla Home. Le voci sono
// quelle di prima, con gli stessi id, gli stessi testi e lo stesso ordine
// (conferma, blocco, BIA, crediti, valutazione): la passata 08 le sostituisce.
// Una differenza voluta: «Conferma la tua presenza» c'è per ogni sessione «Da
// confermare» (dalla 00: in programma, non confermata, inizio entro 48 ore,
// O3), come il badge di Sessioni, e non più per la sola prossima sessione a
// qualunque distanza, che chiedeva di confermare una sessione fra cinque
// giorni mentre il badge diceva che non c'era niente da confermare.
// Lo stato «letta» resta quello di prima: un elenco di id in localStorage per
// utente; qui la lettura tollerante e il conteggio, lo storage sta nell'hook.
// Puri: l'ora entra come parametro.
// ----------------------------------------------------------------------------

import type { BiaMeasurement } from "@/hooks/use-bia";
import type { SessionFeedback } from "@/hooks/use-session-feedback";
import { CLIENT_FEEDBACK_DAYS } from "@/lib/booking-rules";
import { getClientSessionStatus } from "@/lib/client-session-status";
import { sessionLabel } from "@/lib/mock-data";
import type { AllocationRow, BlockRow, BookingRow, EventTypeRow } from "@/lib/queries";
import { clientReferenceBlock } from "@/lib/renewal";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ClientReminderKind = "confirm" | "block" | "bia" | "credit" | "feedback";

/** Dove porta una voce: un dato, non una funzione. BIA e valutazione non portano da nessuna parte. */
export type ClientReminderTarget =
  | { to: "/client/bookings/$bookingId"; bookingId: string }
  | { to: "/client/book" }
  | { to: "/client/store" }
  | null;

export interface ClientReminderItem {
  id: string;
  kind: ClientReminderKind;
  title: string;
  sub: string;
  target: ClientReminderTarget;
}

export type ReminderBooking = Pick<
  BookingRow,
  | "id"
  | "status"
  | "scheduled_at"
  | "duration_min"
  | "client_confirmed_at"
  | "event_type_id"
  | "session_type"
>;

export type ReminderBlock = Pick<
  BlockRow,
  "id" | "status" | "start_date" | "end_date" | "sequence_order"
> & {
  allocations: readonly Pick<
    AllocationRow,
    "event_type_id" | "session_type" | "quantity_assigned" | "quantity_booked"
  >[];
};

export interface ClientReminderInput {
  now: Date;
  bookings: readonly ReminderBooking[];
  blocks: readonly ReminderBlock[];
  eventTypes: readonly Pick<EventTypeRow, "id" | "name">[];
  /** In ordine di measured_on, come li restituisce useBiaMeasurements. */
  bia: readonly Pick<BiaMeasurement, "measured_on" | "weight_kg" | "muscle_kg">[];
  feedback: readonly Pick<SessionFeedback, "booking_id">[];
}

function typeName(
  eventTypeId: string | null,
  sessionType: BookingRow["session_type"],
  eventTypes: ClientReminderInput["eventTypes"],
): string {
  const et = eventTypeId ? eventTypes.find((e) => e.id === eventTypeId) : null;
  return et?.name ?? sessionLabel(sessionType);
}

const startMs = (b: Pick<BookingRow, "scheduled_at">) => new Date(b.scheduled_at).getTime();

/**
 * Le voci di oggi, in quest'ordine: le conferme (una per sessione «Da
 * confermare», in ordine d'inizio), le sessioni da prenotare del blocco di
 * riferimento, l'ultima BIA, i crediti esauriti per tipologia, la valutazione
 * in sospeso negli ultimi 14 giorni.
 */
export function clientReminderItems(input: ClientReminderInput): ClientReminderItem[] {
  const { now, bookings, blocks, eventTypes, bia, feedback } = input;
  const items: ClientReminderItem[] = [];

  const toConfirm = bookings
    .filter((b) => getClientSessionStatus(b, now).key === "toconfirm")
    .sort((a, b) => startMs(a) - startMs(b));
  for (const b of toConfirm) {
    const when = new Date(b.scheduled_at);
    items.push({
      id: `confirm-${b.id}`,
      kind: "confirm",
      title: "Conferma la tua presenza",
      sub: `${typeName(b.event_type_id, b.session_type, eventTypes)} · ${when.toLocaleDateString(
        "it-IT",
        { weekday: "long", day: "numeric" },
      )} alle ${when.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`,
      target: { to: "/client/bookings/$bookingId", bookingId: b.id },
    });
  }

  const ref = clientReferenceBlock(blocks, now);

  // I posti del blocco contati per data, come la Home: svolte e prenotate
  // prendono i posti, il resto è da prenotare.
  if (ref) {
    const total = ref.allocations.reduce((s, a) => s + a.quantity_assigned, 0);
    const from = new Date(ref.start_date).getTime();
    const to = new Date(ref.end_date).getTime() + DAY_MS - 1;
    const taken = bookings.filter((b) => {
      const t = startMs(b);
      return t >= from && t <= to && (b.status === "completed" || b.status === "scheduled");
    }).length;
    const open = Math.max(0, total - taken);
    if (open > 0) {
      const endLabel = new Date(ref.end_date).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
      });
      items.push({
        id: `block-open-${ref.id}-${open}`,
        kind: "block",
        title: "Sessioni da prenotare",
        sub: `Hai ${open} ${open === 1 ? "sessione" : "sessioni"} da prenotare entro il ${endLabel}`,
        target: { to: "/client/book" },
      });
    }
  }

  const lastBia = bia[bia.length - 1];
  if (lastBia) {
    items.push({
      id: `bia-${lastBia.measured_on}`,
      kind: "bia",
      title: "Nuova misurazione BIA",
      sub: `Peso ${lastBia.weight_kg} kg · massa ${lastBia.muscle_kg} kg`,
      target: null,
    });
  }

  // Le righe per tipologia del blocco di riferimento, dalla più grande.
  if (ref) {
    const rows = new Map<string, { key: string; name: string; total: number; remaining: number }>();
    for (const a of ref.allocations) {
      const key = a.event_type_id ?? a.session_type;
      const row = rows.get(key) ?? {
        key,
        name: typeName(a.event_type_id, a.session_type, eventTypes),
        total: 0,
        remaining: 0,
      };
      row.total += a.quantity_assigned;
      row.remaining += a.quantity_assigned - a.quantity_booked;
      rows.set(key, row);
    }
    for (const row of [...rows.values()].sort((a, b) => b.total - a.total)) {
      if (row.total > 0 && row.remaining <= 0) {
        items.push({
          id: `credit-${row.key}`,
          kind: "credit",
          title: `Pool ${row.name} esaurito`,
          sub: "Acquista un Booster per prenotare ancora",
          target: { to: "/client/store" },
        });
      }
    }
  }

  const rated = new Set(feedback.map((f) => f.booking_id));
  const cutoff = now.getTime() - CLIENT_FEEDBACK_DAYS * DAY_MS;
  const pending = bookings
    .filter((b) => b.status === "completed" && !rated.has(b.id) && startMs(b) >= cutoff)
    .sort((a, b) => startMs(b) - startMs(a))[0];
  if (pending) {
    items.push({
      id: `fb-${pending.id}`,
      kind: "feedback",
      title: "Com'è andata?",
      sub: `Lascia un feedback sulla sessione del ${new Date(
        pending.scheduled_at,
      ).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`,
      target: null,
    });
  }

  return items;
}

/** La chiave di localStorage dell'elenco delle voci lette, per utente (come prima). */
export function clientNotificationsReadKey(userId: string): string {
  return `nc-client-notif-read-${userId}`;
}

/** L'elenco degli id letti, com'è nello storage: JSON rotto o di un'altra forma vuol dire nessuna letta. */
export function parseReadIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Le voci non lette: il loro id non sta nell'elenco. */
export function unreadCount(
  items: readonly Pick<ClientReminderItem, "id">[],
  readIds: readonly string[],
): number {
  const read = new Set(readIds);
  return items.filter((i) => !read.has(i.id)).length;
}
