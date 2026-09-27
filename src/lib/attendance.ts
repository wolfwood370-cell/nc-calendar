// ----------------------------------------------------------------------------
// Presenza (audit V5) — ultime 8 settimane
// ----------------------------------------------------------------------------
// svolte / (svolte + assenze + cancellazioni tardive), contando solo le
// sessioni già iniziate nelle ultime 8 settimane. null se nel periodo non c'è
// nessuna sessione conclusa (la UI mostra «—»). Lo stesso valore va usato in
// elenco Clienti, Profilo e ordinamento per presenza.
// ----------------------------------------------------------------------------

import { format, subWeeks } from "date-fns";
import { it } from "date-fns/locale";

export const ATTENDANCE_WEEKS = 8;

/** Subset di una riga bookings usato per la presenza. */
export interface AttendanceBooking {
  status: string;
  scheduled_at: string;
}

export interface Attendance {
  /** Percentuale intera 0–100. */
  percent: number;
  /** Sessioni svolte (completed). */
  completed: number;
  /** Assenze (no_show). */
  noShow: number;
  /** Cancellazioni tardive (late_cancelled). */
  lateCancelled: number;
}

export function getAttendance(
  bookings: readonly AttendanceBooking[],
  now: Date = new Date(),
): Attendance | null {
  const from = subWeeks(now, ATTENDANCE_WEEKS).getTime();
  const to = now.getTime();
  let completed = 0;
  let noShow = 0;
  let lateCancelled = 0;
  for (const b of bookings) {
    const t = new Date(b.scheduled_at).getTime();
    // Il confronto positivo scarta anche le date non valide (NaN).
    if (!(t >= from && t <= to)) continue;
    if (b.status === "completed") completed++;
    else if (b.status === "no_show") noShow++;
    else if (b.status === "late_cancelled") lateCancelled++;
  }
  const concluded = completed + noShow + lateCancelled;
  if (concluded === 0) return null;
  return {
    percent: Math.round((completed / concluded) * 100),
    completed,
    noShow,
    lateCancelled,
  };
}

// ----------------------------------------------------------------------------
// Riquadro «Engagement» del Profilo (passata 05)
// ----------------------------------------------------------------------------
// Il calcolo era dentro trainer.clients.$id.tsx. Cambia solo la presenza, che
// ora è getAttendance come nella lista Clienti (prima: svolte su tutte le
// sessioni non programmate, annullate comprese, 100 senza dati). No-show,
// frequenza e ultima sessione restano quelli di prima.

export interface EngagementBooking extends AttendanceBooking {
  status: string;
  scheduled_at: string;
}

export interface Engagement {
  /** Presenza di getAttendance; null senza sessioni concluse nel periodo. */
  att: number | null;
  noshow: number;
  perWeek: string;
  lastLabel: string;
}

/** `bookings` in ordine di data decrescente, come le carica il Profilo. */
export function profileEngagement(
  bookings: readonly EngagementBooking[],
  now: Date = new Date(),
): Engagement {
  const past = bookings.filter((b) => b.status !== "scheduled");
  const noshow = past.filter((b) => b.status === "late_cancelled").length;
  const completedTimes = bookings
    .filter((b) => b.status === "completed")
    .map((b) => new Date(b.scheduled_at).getTime());
  let perWeek = "—";
  if (completedTimes.length > 0) {
    const weeks =
      Math.max(
        1,
        Math.round((Math.max(...completedTimes) - Math.min(...completedTimes)) / (7 * 86400000)),
      ) + 1;
    perWeek = `~${Math.max(1, Math.round(completedTimes.length / weeks))}`;
  }
  const last = past[0];
  return {
    att: getAttendance(bookings, now)?.percent ?? null,
    noshow,
    perWeek,
    lastLabel: last ? format(new Date(last.scheduled_at), "EEE d MMM", { locale: it }) : "—",
  };
}
