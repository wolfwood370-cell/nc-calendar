# Passata 02 — Prenota

## Obiettivo
Prenotare in una schermata sola (cosa, quando, a che ora), vedendo solo i giorni coperti dai crediti, con un riepilogo prima di confermare e un esito dopo.

## Punti audit
B1 (giorni che poi danno errore), B3 (calendario mensile), B4 (nessun riepilogo), B5 (tipologie esaurite nascoste), B6 («Consigliato» senza motivo), B7 (dettagli tecnici), N4 (due barre fisse), O1, V15, D2 (azione «Aggiungi al Calendario» nel toast).

## Riferimenti design
`designs/Cliente Prenota.dc.html`. Dal pannello di revisione: Giulia (caso principale), Marta (blocco che finisce il 4 ottobre), Davide (percorso concluso).

## Schermate
- `screenshots/02-prenota-01-giorni-e-orari.png`
- `screenshots/02-prenota-02-orario-scelto.png`
- `screenshots/02-prenota-03-riepilogo.png`
- `screenshots/02-prenota-04-prenotata.png`
- `screenshots/02-prenota-05-come-si-prenota.png`
- `screenshots/02-prenota-06-marta-limite-blocco.png`
- `screenshots/02-prenota-07-davide-percorso-concluso.png`

## File del repo
`src/routes/client.book.tsx`, `book-calendar-grid.tsx` (si toglie), `book-slots-grid.tsx`, `book-pool-picker.tsx` (sostituiti), `src/hooks/use-book-confirm.ts`, helper della passata 00. Nuovi componenti: scelta della tipologia, **fila dei giorni** e **gruppi di orari** (riusati da Sposta nella passata 04), barra d'azione, fogli di riepilogo, esito e «Come si prenota».

## Search params
`eventType=<uuid>` preseleziona la tipologia (esiste già, resta).

## Layout
Intestazione di scheda «Prenota» con sottotitolo (passata 01). `main` con padding 4px 16px 24px, colonna con gap 20.

### Quando non si può prenotare
Card bianca (raggio 24, bordo, ombra, padding 20, gap 12): titolo 17/700; testo 15 px line-height 1.5 `#41474f`; se si possono comprare Booster, principale «Acquista un Booster»; secondario «Scrivi a Marco» con `MessageCircle` 16 (WhatsApp).
- Percorso concluso: «Il tuo percorso è concluso» · «Per prenotare nuove sessioni serve un nuovo percorso: scrivi a Marco, te lo propone lui.»
- Nessun credito: «Nessun credito da prenotare» · stesso testo.
- Tutti i crediti usati (e nessuna tipologia «con il coach» con crediti): «Hai usato tutti i crediti» · «Puoi aggiungere un Booster al blocco in corso, oppure chiedere a Marco di anticipare il prossimo.» (senza Booster: «Per continuare scrivi a Marco.»).

### 1. «Cosa vuoi prenotare?» (B5)
- Titolo 17/700; `role="radiogroup"` con `aria-label="Tipologia di sessione"`; opzioni in colonna con gap 8.
- Opzione: pulsante `role="radio"`, altezza minima 64, padding 10px 14px, raggio 18, bordo 1.5px `#e1e2e7` (selezionata `#005685`), fondo bianco (selezionata `rgba(0,86,133,0.06)`).
  - Riquadro 40×40 raggio 12 col colore della tipologia al 10%, icona 20 nel colore della tipologia.
  - Nome 15/700; sotto 13/600: prenotabile «60 min · 3 disponibili» (`#41474f`); da prenotare con il coach «Si prenota con Marco» (`#41474f`); esaurita «Crediti esauriti» (`--color-warning-ink`).
  - A destra: anello radio 22 px, bordo 2px `#c1c7d0` (selezionata `#005685`) con punto 10 px `#005685`; per le opzioni non selezionabili `ChevronRight` 18 `#41474f`.
- Tutte le tipologie del cliente, anche esaurite e non prenotabili, nell'ordine di `getClientPools`.
- Selezione iniziale: `eventType` se prenotabile e con crediti, altrimenti la prima prenotabile con crediti.
- Tocco su un'opzione non selezionabile → foglio «Come si prenota» (`02-prenota-05`):
  - non prenotabile: titolo = nome della tipologia; testo = `unavailable_message` o «Questa sessione si prenota direttamente con Marco.» + « Hai 1 credito disponibile.»; principale «Scrivi a Marco su WhatsApp»; testuale «Chiudi».
  - esaurita: titolo «Crediti Personal Training esauriti»; testo «Hai usato tutti i crediti Personal Training del blocco 3.» + « Puoi aggiungerne con un Booster oppure chiedere a Marco.» (senza Booster: « Per altre sessioni scrivi a Marco.»; cliente libero senza «del blocco 3»). Con un Booster di quella tipologia: principale «Acquista un Booster» → `/client/store?type=<id>`, poi secondario «Scrivi a Marco su WhatsApp» (bianco, bordo `#c1c7d0`); altrimenti WhatsApp principale. Testuale «Chiudi».

### 2. «Quando?» (B1, B3, O1)
- Titolo 17/700. Fila orizzontale scorrevole: margine 0 −16px, padding 2px 16px 6px, gap 8, barra di scorrimento nascosta. I giorni vengono da `getClientSlotDays`: da oggi all'ultimo giorno valido, niente oltre (B1).
- Giorno: pulsante 60×80, raggio 18, colonna centrata con gap 2: giorno della settimana 12/600 («mar»), numero Sora 20/700 `tabular-nums`, sotto 12/600 «4 orari» / «1 orario» (success-text), oppure «chiuso», «pieno», «—» (preavviso).
  - Disponibile: fondo bianco, bordo 1px `#e1e2e7`, testo `#191c1f`.
  - Selezionato: fondo e bordo `#005685`, testo bianco, riga sotto `#cde5ff`.
  - Non disponibile: fondo `#f2f3f8`, senza bordo, testo `#717880`, riga sotto `#41474f`, `disabled`.
  - `aria-pressed`; nome accessibile «Martedì 29 settembre, 4 orari» / «…, serve 24 ore di preavviso» / «…, chiuso» / «…, pieno».
- Il primo giorno con orari è già scelto e portato in vista (impostando `scrollLeft`, non `scrollIntoView`).
- Sotto la fila: riga con gap 8, `Info` 16 `#005685`, testo 13 px line-height 1.5 `#41474f` con la regola della passata 00 («Si prenota da 24 ore a 14 giorni prima. I crediti del blocco 3 valgono fino a domenica 11 ottobre: le date successive si aprono con il blocco 4.»).

### 3. Orari del giorno (B6, V15)
- Titolo 17/700 con il giorno scelto: «Martedì 29 settembre».
- Nessun orario in tutto il periodo: riquadro bianco raggio 18, bordo 1px `#e1e2e7`, padding 14px 16px, gap 10: testo 15 px «Nessun orario libero per Personal Training fino a domenica 11 ottobre. Marco può proporti un orario.» + tonale 48 px «Scrivi a Marco» (`MessageCircle` 16).
- Gruppi in colonna con gap 12; in ogni gruppo gap 8:
  - Etichetta 13/700. Prima «Consigliati» in `#003e62` con `Sparkles` 14, e sotto il motivo 13 px line-height 1.4 `#41474f`. Poi «Mattina», «Pomeriggio», «Sera» in `#41474f`, solo se hanno orari. Un orario consigliato compare solo tra i consigliati.
  - Griglia a 3 colonne, gap 8. Orario: `role="radio"` dentro un `radiogroup` («Orari consigliati», «Orari mattina»…), altezza 48, raggio 14, 16/700 `tabular-nums`. Normale: fondo bianco, bordo 1px `#c1c7d0`, testo `#003e62`. Consigliato: fondo `#cde5ff`, bordo `#94ccff`. Selezionato: fondo e bordo `#005685`, testo bianco.
- Nessun badge sovrapposto ai pulsanti; niente fuso orario né «Dettagli tecnici» (B7).

### Barra d'azione (N4)
- Compare solo dopo aver scelto un orario, tra il contenuto e la barra in basso (il contenuto ne tiene conto e non viene coperto).
- Fondo bianco, bordo superiore 1px `rgba(193,199,208,0.45)`, padding 10px 16px, riga con gap 12: a sinistra «Personal Training · 60 min» 13 px `#41474f` e sotto «mar 29 set · 11:10–12:10» 16/700 `tabular-nums`; a destra principale «Continua» (padding 0 24px).
- Cambiare tipologia o giorno toglie l'orario scelto.

### Riepilogo (B4) — foglio «Conferma la prenotazione»
- Riga: riquadro 44×44 raggio 14 (colore tipologia al 10%) con icona 22; nome 17/700; «60 minuti» 14 px `#41474f`.
- Riquadro `#f8f9fe`, raggio 18, padding 14px 16px; elenco con gap 12, righe 15 px line-height 1.4 con icona 18 `#005685`:
  - `CalendarDays` «Martedì 29 settembre, 11:10–12:10» (600);
  - `User` «con Marco Rossi»;
  - `MapPin` «Studio · Via Roma 12, Bologna» oppure `Video` «Online · videochiamata Google Meet»;
  - `Coins` «Userai 1 credito Personal Training: ne resteranno 2.» («…: ne resterà 1.», «…: non ne resteranno altri.»).
- Testo 14 px line-height 1.5 `#41474f`: «Puoi spostarla o annullarla gratis fino a lunedì 28 settembre alle 11:10.» + « La presenza risulta già confermata.» (entro 48 ore) oppure « Ti chiederemo di confermare la presenza 48 ore prima.»
- Errore sopra i pulsanti, `role="alert"`, 14/600 `#b91c1c`: «Questo orario non è più libero: scegline un altro.» (23P01), «Non hai crediti disponibili per Personal Training.» (P0001 sui crediti), altrimenti il messaggio del server.
- Principale «Conferma prenotazione» (disattivato con indicatore mentre conferma; resta la protezione dal doppio tocco); testuale «Indietro».

### Esito — foglio «Prenotata»
- Riquadro 56×56 raggio 18, fondo success-soft, `CircleCheck` 28 success-text; titolo «Prenotata»; testo 15 px: «Personal Training, martedì 29 settembre alle 11:10. Marco la vede subito nel calendario; l'invito di Google Calendar arriva a giulia.b@email.it.»
- Principale «Vedi la sessione» → `/client/bookings/<id>` (con provenienza Prenota); secondario «Prenota un'altra sessione» (chiude, toglie l'orario, ricarica gli orari).
- Niente ritorno automatico alla Home, niente toast con «Aggiungi al Calendario» (D2).

## Comportamento
- `useBookConfirm`: tenere inserimento, controllo del doppio tocco e side effect (`gcalCreateEvent`, `booking-notifications`, push). Togliere `generateGoogleCalendarLink`, il toast di successo e `navigate`; restituire l'id della sessione creata; gli errori vanno nel foglio.
- Dopo un errore di orario occupato, ricaricare occupati e orari.
- Luogo e durata dalla tipologia (`event_types.location_type`, `location_address`, `duration`).

## Accettazione
- Giulia vede i giorni fino all'11 ottobre, Marta fino al 4 ottobre con la regola che nomina il blocco successivo; un giorno mostrato non dà mai «Credito esaurito» alla conferma (B1).
- All'apertura il primo giorno utile è scelto e i consigliati sono in testa con il motivo.
- Tipologie esaurite e non prenotabili visibili, ciascuna con il motivo e l'azione possibile.
- Riepilogo prima di confermare; dopo la conferma l'esito, e «Vedi la sessione» apre la sessione giusta.
- La barra d'azione non c'è finché non si sceglie un orario.
- Nessun fuso orario, nessun dettaglio tecnico, nessun «Aggiungi al Calendario».

## Fuori scope
Sposta (passata 04), acquisto dei Booster (06).
