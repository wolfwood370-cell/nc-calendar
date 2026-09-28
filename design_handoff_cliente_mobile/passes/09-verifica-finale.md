# Passata 09 — Verifica finale

## Obiettivo
Controllo incrociato di tutte le schermate rifatte, come la «Seconda verifica» del prototipo (`designs/Audit Cliente Mobile.dc.html#verifica`), sul telefono (320 e 390 px) e su desktop.

## Controlli
- **Testi (T1, T4, V6):** nel codice del cliente nessuna occorrenza di «Riprogramma», «Cancella» (come azione), «No Show», «In programma» come stato, «Programmata», «NC Add-on», «Store», «atleti», «Impostazioni», «appuntamento», «NC Training Systems», «Aggiungi a Google Calendar», «Aggiungi al Calendario», «Completo». Solo iniziale maiuscola; piani scritti come «Percorso fisso», «Abbonamento mensile». Toast annullabili sempre con «Ripristina».
- **Misure (V3, V4, V5, T2):** titoli delle card 17/700; pulsanti 52 / 48 / 44; card 24, righe e opzioni 18, orari e campi 14; testo minimo 12 px; aree di tocco minimo 44 px.
- **Colori (V7, V8, T3):** pulsanti principali `#005685`; «Si prenota con Marco» neutro, «Crediti esauriti» in avviso; nessun esadecimale scritto a mano nei componenti del cliente fuori dai token; nessuna emoji.
- **Numeri (H1, V9, V13):** crediti disponibili per tipologia uguali in Home, Prenota, riepilogo Booster e Profilo cliente del coach; presenza uguale in Sessioni, Profilo e lato coach; «Perse» in legenda solo quando ci sono.
- **Regola (O1, B2):** Prenota e Sposta offrono gli stessi giorni per la stessa tipologia; la Disponibilità del coach mostra 24 ore e 14 giorni; il server rifiuta prenotazioni e spostamenti fuori finestra.
- **Conferma (O3):** prenotando entro 48 ore la sessione risulta confermata; una sessione inserita dal coach diventa «Da confermare» a 48 ore; badge su Sessioni e voce nelle notifiche; il coach vede la spunta nel calendario.
- **Seconda verifica del prototipo (V1–V15):** ripercorrere le quindici voci e confermare che valgono anche in app.

## Flussi end-to-end
1. Giulia: Home → Prenota → orario consigliato → riepilogo → «Prenotata» → «Vedi la sessione» → Sposta → «Ripristina».
2. Marta: Home → «Conferma presenza» → il coach vede la conferma → «Dettagli» → «Annulla comunque» → «Annullata tardi» → «Ripristina».
3. Il coach sposta una sessione di Giulia → notifica al cliente → dettaglio aggiornato → la notifica aperta risulta letta, le altre no.
4. Giulia: Booster → «Acquista» → Stripe in modalità test → esito con i crediti aggiornati → «Prenota ora».
5. Elena: Booster mostra solo la spiegazione; in Home «Per altri crediti scrivi a Marco».
6. Davide: Home e Prenota mostrano il percorso concluso con i contatti; nessun invito allo Store.
7. Sessione svolta → valutazione con nota → il coach vede voto e nota.

## Regressioni
- Lato coach invariato, salvo i punti del README (Disponibilità, notifiche).
- Desktop del cliente utilizzabile con le cinque schede nell'header.
- Link delle notifiche push e URL di ritorno di Stripe funzionanti.
- Nessun errore in console; build, typecheck, lint e test puliti.

## Esito
Aggiornare `PIANO.md`, annotare nella PR gli scostamenti voluti dal design e preparare la PR da `redesign/cliente-mobile` a `main`.
