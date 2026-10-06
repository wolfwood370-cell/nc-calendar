// ----------------------------------------------------------------------------
// I crediti extra che il coach vede (passata 11 del lato cliente)
// ----------------------------------------------------------------------------
// Un credito extra vale fino a expires_at (decisioni 10 e 13 del lato
// cliente; per i crediti dati dal coach il 2100). I conti del coach (le barre
// del Profilo, la scheda dell'elenco Clienti) sommavano quantity −
// quantity_booked senza guardare la scadenza: un Booster scaduto con crediti
// rimasti risultava ancora disponibile. Qui si contano solo quelli che valgono
// adesso, con la stessa regola del server (expires_at >= l'istante, come
// extraValidAt in credit-order.ts).
//
// L'uso di una tipologia (event-type-usage.ts) invece li conta tutti: lì la
// domanda è se eliminarla stacchi dei crediti, e un extra scaduto resta un
// credito che l'eliminazione lascerebbe senza tipologia.
// ----------------------------------------------------------------------------

export interface ExtraCreditLike {
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

/** Il credito vale adesso: scade in questo istante o dopo. */
export function extraValidNow(e: Pick<ExtraCreditLike, "expires_at">, now: Date): boolean {
  const ms = new Date(e.expires_at).getTime();
  return Number.isFinite(ms) && ms >= now.getTime();
}

/** I crediti extra che valgono adesso. */
export function validExtras<T extends ExtraCreditLike>(extras: readonly T[], now: Date): T[] {
  return extras.filter((e) => extraValidNow(e, now));
}

/** Crediti assegnati e rimasti, sui soli extra che valgono adesso. */
export function extraTotals(
  extras: readonly ExtraCreditLike[],
  now: Date,
): { total: number; left: number } {
  let total = 0;
  let left = 0;
  for (const e of validExtras(extras, now)) {
    total += e.quantity;
    left += Math.max(0, e.quantity - e.quantity_booked);
  }
  return { total, left };
}
