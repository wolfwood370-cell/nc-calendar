// ----------------------------------------------------------------------------
// Giornata del coach — card «Oggi» della Panoramica (audit P1, P3, O4)
// ----------------------------------------------------------------------------
// Tutte le sessioni cliente di oggi (ora di Roma), senza tagli: con cliente,
// non impegni personali, non il coach come cliente, stato programmata, svolta
// o assente, non eliminate. Lo stato di ogni riga viene dallo stato della
// sessione e dall'ora:
//   - svolta (completed), assente (no_show);
//   - programmata e finita: da confermare; iniziata e non finita: in corso;
//   - la prima programmata non ancora iniziata: prossima («tra N min» se
//     inizia entro 90 minuti); le altre: successive.
// Durata: duration_min della sessione, poi quella della tipologia, poi 60
// minuti (come la card di prima). Riferimento: todaySessions in
// design_handoff_coach_redesign/designs/nc-store.js.
// ----------------------------------------------------------------------------

import { romeDate } from "@/lib/credit-order";

export type AgendaPhase = "done" | "noshow" | "toconfirm" | "now" | "next" | "later";

/** Entro quanti minuti dall'inizio la prossima sessione dice «tra N min». */
export const NEXT_SOON_MINUTES = 90;
export const DEFAULT_SESSION_MINUTES = 60;

/** Stati delle sessioni che compaiono nella giornata. */
export const AGENDA_STATUSES = ["scheduled", "completed", "no_show"] as const;

/** Campi di una riga bookings usati dalla giornata. */
export interface AgendaBooking {
  id: string;
  client_id: string | null;
  coach_id: string;
  is_personal?: boolean | null;
  status: string;
  scheduled_at: string;
  deleted_at?: string | null;
  duration_min?: number | null;
}

export interface AgendaItem<B extends AgendaBooking = AgendaBooking> {
  booking: B;
  phase: AgendaPhase;
  /** Inizio e fine in millisecondi. */
  start: number;
  end: number;
  /** Minuti all'inizio, arrotondati per eccesso; negativi se già iniziata. */
  minutesTo: number;
}

/** Sessione di un cliente: non impegno personale, non il coach come cliente. */
export function isClientSession(b: AgendaBooking): boolean {
  return !!b.client_id && b.client_id !== b.coach_id && !b.is_personal;
}

/** Durata in minuti: quella della sessione, poi quella della tipologia, poi 60. */
export function sessionMinutes(
  b: Pick<AgendaBooking, "duration_min">,
  typeMinutes?: number | null,
): number {
  if (b.duration_min && b.duration_min > 0) return b.duration_min;
  if (typeMinutes && typeMinutes > 0) return typeMinutes;
  return DEFAULT_SESSION_MINUTES;
}

function isAgendaStatus(status: string): boolean {
  return (AGENDA_STATUSES as readonly string[]).includes(status);
}

/** Sessioni cliente di oggi (Roma), in ordine di orario, ciascuna col suo stato. */
export function getTodayAgenda<B extends AgendaBooking>(
  bookings: readonly B[],
  now: Date,
  typeMinutes: (b: B) => number | null | undefined = () => null,
): AgendaItem<B>[] {
  const today = romeDate(now.toISOString());
  const nowMs = now.getTime();
  const list = bookings
    .filter(
      (b) =>
        isClientSession(b) &&
        isAgendaStatus(b.status) &&
        !b.deleted_at &&
        romeDate(b.scheduled_at) === today,
    )
    .map((b) => {
      const start = new Date(b.scheduled_at).getTime();
      return { b, start, end: start + sessionMinutes(b, typeMinutes(b)) * 60_000 };
    })
    .sort((x, y) => x.start - y.start || x.b.id.localeCompare(y.b.id));
  let nextMarked = false;
  return list.map(({ b, start, end }) => {
    let phase: AgendaPhase;
    if (b.status === "completed") phase = "done";
    else if (b.status === "no_show") phase = "noshow";
    else if (end <= nowMs) phase = "toconfirm";
    else if (start <= nowMs) phase = "now";
    else if (!nextMarked) {
      phase = "next";
      nextMarked = true;
    } else phase = "later";
    return { booking: b, phase, start, end, minutesTo: Math.ceil((start - nowMs) / 60_000) };
  });
}

/** Etichetta del chip di stato; null per le successive. */
export function agendaChipLabel(item: Pick<AgendaItem, "phase" | "minutesTo">): string | null {
  switch (item.phase) {
    case "done":
      return "Svolta";
    case "noshow":
      return "Assente";
    case "toconfirm":
      return "Da confermare";
    case "now":
      return "In corso";
    case "next":
      return item.minutesTo <= NEXT_SOON_MINUTES
        ? `Prossima · tra ${item.minutesTo} min`
        : "Prossima";
    case "later":
      return null;
  }
}

export interface AgendaCounts {
  total: number;
  done: number;
  toConfirm: number;
}

export function countAgenda(items: readonly Pick<AgendaItem, "phase">[]): AgendaCounts {
  return {
    total: items.length,
    done: items.filter((i) => i.phase === "done").length,
    toConfirm: items.filter((i) => i.phase === "toconfirm").length,
  };
}

/**
 * «Venerdì 25 settembre · 7 sessioni oggi, 1 svolta, 1 da confermare»: le
 * parti a zero si omettono.
 */
export function formatAgendaSubtitle(dayLabel: string, c: AgendaCounts): string {
  if (c.total === 0) return `${dayLabel} · nessuna sessione oggi`;
  const parts = [c.total === 1 ? "1 sessione oggi" : `${c.total} sessioni oggi`];
  if (c.done) parts.push(c.done === 1 ? "1 svolta" : `${c.done} svolte`);
  if (c.toConfirm) parts.push(`${c.toConfirm} da confermare`);
  return `${dayLabel} · ${parts.join(", ")}`;
}

/** «1 di 7 svolte»; vuoto se oggi non ci sono sessioni. */
export function formatAgendaProgress(c: AgendaCounts): string {
  if (c.total === 0) return "";
  return `${c.done} di ${c.total} ${c.total === 1 ? "svolta" : "svolte"}`;
}

/** La prossima sessione cliente programmata dopo `now` (per il giorno vuoto). */
export function findNextClientSession<B extends AgendaBooking>(
  bookings: readonly B[],
  now: Date,
): B | null {
  const nowMs = now.getTime();
  let best: B | null = null;
  let bestMs = Infinity;
  for (const b of bookings) {
    if (!isClientSession(b) || b.status !== "scheduled" || b.deleted_at) continue;
    const t = new Date(b.scheduled_at).getTime();
    if (t > nowMs && t < bestMs) {
      best = b;
      bestMs = t;
    }
  }
  return best;
}

function romeHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

/** «Buongiorno» prima delle 13, «Buon pomeriggio» prima delle 18, poi «Buonasera» (ora di Roma). */
export function greetingFor(now: Date): string {
  const h = romeHour(now);
  return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera";
}

/** «Venerdì 25 settembre» (ora di Roma). */
export function formatRomeLongDay(d: Date): string {
  const s = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
