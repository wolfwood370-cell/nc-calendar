// ----------------------------------------------------------------------------
// Validazione dei search params (validateSearch di TanStack Router)
// ----------------------------------------------------------------------------
// Un valore malformato si scarta in silenzio (undefined) invece di arrivare
// alle query: un id non UUID farebbe fallire Postgres con 22P02.
// ----------------------------------------------------------------------------

import { isValid, parseISO } from "date-fns";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Un UUID, altrimenti undefined. */
export function uuidParam(value: unknown): string | undefined {
  return typeof value === "string" && UUID_RE.test(value) ? value : undefined;
}

/** Una data di calendario esistente in formato YYYY-MM-DD, altrimenti undefined. */
export function isoDateParam(value: unknown): string | undefined {
  return typeof value === "string" && ISO_DATE_RE.test(value) && isValid(parseISO(value))
    ? value
    : undefined;
}
