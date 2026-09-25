# Passata 10 — Verifica finale

## Obiettivo
Controllo incrociato di tutte le pagine rifatte, come la «Seconda verifica» del prototipo (`designs/Audit Coach Desktop.dc.html#verifica`).

## Controlli
- **Testi (V1–V4)**: grep di «Annulla» nei toast (deve essere «Ripristina»); unità sempre «crediti» con singolare corretto; «Annulla check-in» / «Annulla assenza» uguali in Panoramica e Calendario; titoli dei dialog coerenti con il pulsante che li apre.
- **Dati (V5–V8)**: stessa presenza % in Clienti e Profilo; crediti residui coerenti con le sessioni prenotate del blocco in corso in Panoramica, Clienti, Profilo, pannello Calendario e dialog Assegna; nessuna sessione di test fuori disponibilità; stato delle sessioni calcolato dalla stessa ora in tutte le pagine.
- **Misure (V9–V11)**: H1 36px, titoli card 20/600, padding `main` 28/40/48, tab di pagina 36px, segmentati 32px, dialog di conferma 460px.
- **Accessibilità (V12, O3)**: badge e pulsanti icona con etichetta; frecce/Home/End nei gruppi `radiogroup`/`tablist`; focus visibile; contrasto ≥ 4.5:1 sui chip di stato.
- **Flussi end-to-end**:
  1. Notifica → Calendario sull'evento → check-in → Ripristina.
  2. Panoramica → Rinnova → toast → il cliente esce da «In scadenza» ovunque.
  3. Calendario → spazio vuoto → Nuova sessione con avviso di sovrapposizione → crea → compare in Profilo › Prossime sessioni.
  4. Profilo → Percorso → sposta una settimana → prova a uscire → «Salva ed esci».
  5. Disponibilità → eccezione di 3 giorni con sessioni prenotate → avviso → Calendario tratteggiato.
  6. Tipologie → rendi non prenotabile → il client non la vede.
- **Regressioni**: layout mobile invariati; `reviewEventId` continua a funzionare; nessun errore in console; build, typecheck e lint puliti.

## Esito
Aggiornare `CHECKLIST.md` e annotare nella PR eventuali scostamenti voluti dal design.
