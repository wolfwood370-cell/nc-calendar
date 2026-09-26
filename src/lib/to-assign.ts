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

/**
 * Gli eventi da assegnare in ordine di data, tutti: la card della Panoramica
 * li elenca dallo stesso insieme del badge, così lista e numero coincidono.
 */
export function listToAssign<T extends ToAssignFields & Pick<BookingRow, "id" | "scheduled_at">>(
  bookings: readonly T[] | undefined,
): T[] {
  return (bookings ?? [])
    .filter(isToAssign)
    .sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime() ||
        a.id.localeCompare(b.id),
    );
}

/** Etichetta del badge per gli screen reader: «1 evento da assegnare», «3 eventi da assegnare». */
export function formatToAssign(n: number): string {
  return n === 1 ? "1 evento da assegnare" : `${n} eventi da assegnare`;
}
