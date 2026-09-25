# Passata 09 — Integrazioni

## Obiettivo
Stato reale di Google Calendar e tutti gli strumenti di allineamento in un posto solo.

## Punti audit
I1 (stato fisso), I2 (nessuna azione), I3 (termini tecnici), I4 (Meet separato), C1 (strumenti spostati dal Calendario).

## Riferimenti design
`designs/Coach Integrazioni.dc.html` (nel prototipo la proprietà `googleState: error` mostra lo stato di errore).


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/09-integrazioni-01-pagina.png`
- `screenshots/09-integrazioni-02-conferma-sincronizzazione.png`

## File del repo
`src/routes/trainer.integrations.tsx`, `src/components/integration-card.tsx`, logica da spostare da `trainer.calendar.tsx` (`runForceSync`) e `calendar-gcal-review.tsx` (liste googleOnly/platformOnly), `src/lib/gcal.functions.ts`.

## Pagina
H1 «Integrazioni»; sottotitolo «I servizi collegati a NC Calendar sono configurati per tutto lo studio. Qui ne vedi lo stato e tieni allineato Google Calendar.». Due colonne `minmax(min(100%,440px),1fr)`, max 1200px.

## Google Calendar (sinistra)
- Logo 48px `#4285f4` · «Google Calendar» (20/600) · chip **stato reale** (I1): «● Collegato» (`success`) o «● Errore di connessione» (`danger`) · «Calendario condiviso dello studio» · «Sincronizza ora» (bordato).
- In errore: riquadro `danger` «Google Calendar non risponde dalle 10:12» + «Le prenotazioni continuano a funzionare nell'app. Le sessioni senza evento su Google vengono ricreate alla prossima sincronizzazione riuscita. Se l'errore resta, avvisa chi gestisce l'account dello studio.».
- Tre riquadri: «Ultimo aggiornamento» · «Eventi da assegnare» (→ Calendario `?filter=assign`) · «Sessioni non su Google» (arancione se > 0) con elenco e «Ricrea su Google».
- «Cosa fa» in linguaggio semplice (I3): crea l'evento alla prenotazione/conferma; invia l'invito email con gli aggiornamenti; promemoria 24 ore prima, poi 30 minuti (online) o 2 ore (in studio); **aggiunge il link Google Meet alle sessioni online** (I4: Meet non è più una card); riporta nell'app spostamenti e cancellazioni fatti su Google. Via «sendUpdates=all», «Lovable Connector», «workspace».

## Colonna destra
- **Sincronizzazione completa** (C1, I2): «Ricontrolla tutte le sessioni dal 1° gennaio 2026 e le allinea con Google Calendar, nei due sensi. Serve solo se noti differenze tra i due calendari; la sincronizzazione normale avviene da sola.» → «Avvia sincronizzazione completa» → AlertDialog «Vengono controllate circa N sessioni. Può richiedere qualche minuto e la pagina deve restare aperta fino alla fine.» → barra di avanzamento con fase («Ricreo su Google gli eventi mancanti…», «Controllo le sessioni: 120 di 458»), avviso «Tieni aperta questa pagina finché non termina.» e blocco della navigazione → esito verde con il riepilogo reale (spostate, annullate, create su Google) e «Chiudi».
- **Pagamenti · Stripe**: chip neutro «Gestito dallo studio» · «I clienti pagano i Booster con carta o wallet.» · «Non serve nessuna azione da parte tua. I crediti acquistati compaiono in automatico nel profilo del cliente.».

## Dati e backend
- Stato: considerare in errore se `gcalListEventsForReview` fallisce o l'ultima riconciliazione riuscita è troppo vecchia; ultimo aggiornamento da `gcal_reconcile_last` (oggi in localStorage: valutare di salvarlo lato server, vedi audit tecnico sul throttle per-browser).
- La sincronizzazione completa oggi gira nel browser e non riprende se la pagina si chiude: mantenerla bloccante in UI finché non diventa un job lato server.

## Accettazione
- Staccando Google (o simulando l'errore) la pagina lo dice.
- Nel Calendario non restano pulsanti di sincronizzazione completa.
