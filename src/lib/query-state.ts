// ----------------------------------------------------------------------------
// Le letture perse, fallite e arrivate (lato cliente, passata 05)
// ----------------------------------------------------------------------------
// Una regola sola per Prenota, Sessioni, il foglio Sposta e la Home. TanStack
// Query v5, rileggendo una lettura che non ha dati (fallita al primo
// caricamento), ne toglie l'errore e la rimette in attesa (query-core 5.100.1,
// query.js:400-409): isError torna falso per tutta la rilettura, con «Riprova»
// e al ritorno sulla finestra. Guardando solo isError, «Riprova» toglieva la
// card dell'errore e metteva lo scheletro, e il focus finiva sul body.
// errorUpdateCount invece resta: ricorda che la lettura era fallita.
// Puro: niente hook, niente rete; riceve i campi di una useQuery.
// ----------------------------------------------------------------------------

/** I campi di una useQuery che servono alle tre regole. */
export type ReadState = {
  data: unknown;
  isError: boolean;
  errorUpdateCount: number;
  fetchStatus: "fetching" | "paused" | "idle";
};

/**
 * Persa: la lettura non c'è, in errore oppure riletta dopo un errore. Una
 * rilettura fallita coi dati di prima non conta: TanStack Query li tiene, e
 * la pagina resta.
 */
export function lostRead(q: ReadState): boolean {
  return (
    q.data === undefined && (q.isError || (q.errorUpdateCount > 0 && q.fetchStatus !== "idle"))
  );
}

/**
 * Fallita: persa, oppure in errore anche coi dati di prima. Per gli orari: un
 * occupato vecchio offrirebbe un orario già preso.
 */
export function failedRead(q: ReadState): boolean {
  return q.isError || lostRead(q);
}

/**
 * Arrivata: coi dati o con l'errore, e resta arrivata mentre una lettura
 * fallita si rilegge (mai lo scheletro al posto della card dell'errore).
 */
export function arrivedRead(q: ReadState): boolean {
  return q.data !== undefined || q.isError || q.errorUpdateCount > 0;
}
