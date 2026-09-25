// ----------------------------------------------------------------------------
// Eventi «da assegnare»
// ----------------------------------------------------------------------------
// Eventi importati da Google Calendar a cui manca il cliente: non impegni
// personali, non annullati. Stesso criterio per il filtro «Da assegnare» del
// Calendario e per il badge accanto a «Calendario» nella sidebar (audit V12),
// così i due numeri coincidono.
// ----------------------------------------------------------------------------

import type { BookingRow } from "@/lib/queries";

type ToAssignFields = Pick<BookingRow, "client_id" | "is_personal" | "status">;

export function isToAssign(b: ToAssignFields): boolean {
  return !b.is_personal && !b.client_id && b.status !== "cancelled";
}

export function countToAssign(bookings: readonly ToAssignFields[] | undefined): number {
  return bookings ? bookings.filter(isToAssign).length : 0;
}

/** Etichetta del badge per gli screen reader: «1 evento da assegnare», «3 eventi da assegnare». */
export function formatToAssign(n: number): string {
  return n === 1 ? "1 evento da assegnare" : `${n} eventi da assegnare`;
}
