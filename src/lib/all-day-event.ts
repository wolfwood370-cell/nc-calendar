// ----------------------------------------------------------------------------
// Eventi giornalieri di Google Calendar
// ----------------------------------------------------------------------------
// Spostato qui da mobile-calendar-agenda.tsx (passata 04): serve all'agenda
// del telefono, al Calendario del desktop, al ripristino del server e alla
// stima della completa, e la regola è una sola.
//
// Un evento «tutto il giorno» (compleanni, promemoria, fine percorso) si salva
// a mezzanotte UTC. Il database lo restituisce come «…T00:00:00+00:00»
// (PostgREST), e la regola di prima cercava solo la «Z»: nessuno era
// riconosciuto, e nel Calendario diventavano consulenze delle 02:00 (misurato
// sul backup del 26/09: 42 eventi; passata 11 del lato cliente). Si accetta
// ogni scrittura della mezzanotte UTC: Z, +00:00, +0000, -00:00, con o senza
// millesimi. Un evento normale a mezzanotte di Roma si salva alle 22:00 o
// alle 23:00 UTC, quindi non è preso per giornaliero.
// ----------------------------------------------------------------------------

const MIDNIGHT_UTC = /T00:00:00(?:\.0+)?(?:Z|[+-]00:?00)$/i;

export function isAllDayEvent(b: { scheduled_at: string }): boolean {
  return MIDNIGHT_UTC.test(b.scheduled_at);
}
