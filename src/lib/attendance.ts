// ----------------------------------------------------------------------------
// Presenza (audit V5) — ultime 8 settimane
// ----------------------------------------------------------------------------
// svolte / (svolte + assenze + cancellazioni tardive), contando solo le
// sessioni già iniziate nelle ultime 8 settimane. null se nel periodo non c'è
// nessuna sessione conclusa (la UI mostra «—»). Lo stesso valore va usato in
// elenco Clienti, Profilo e ordinamento per presenza.
// ----------------------------------------------------------------------------

import { subWeeks } from "date-fns";

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
