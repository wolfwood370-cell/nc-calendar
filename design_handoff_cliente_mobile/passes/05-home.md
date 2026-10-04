# Passata 05 — Home

## Obiettivo
In cima la prossima sessione con la sua azione, poi i crediti con un solo numero, poi valutazione e progressi. Lo storico passa in Sessioni.

## Punti audit
H1 (tre conteggi), H2 (prossima sessione sotto la seconda schermata), H3 (numeri ripetuti), H4 (conferma in quattro punti), H5 (conto alla rovescia), H6 (contatti), H7 (invito allo Store senza percorso), H9 (valutazione), H10 («Completo»), N1 (altre sessioni), N5 (installazione), V1, V2, V8, V9, V10.

## Riferimenti design
`designs/Cliente Home.dc.html` con i quattro clienti di prova.

## Schermate
- `screenshots/05-home-01-prossima-da-confermare.png` — Giulia.
- `screenshots/05-home-02-crediti.png` — Giulia, card crediti.
- `screenshots/05-home-03-valutazione-e-progressi.png` — Giulia, dopo una sessione svolta.
- `screenshots/05-home-04-marta-abbonamento.png` — meno di 24 ore, abbonamento in scadenza.
- `screenshots/05-home-05-elena-cliente-libero.png`
- `screenshots/05-home-06-elena-crediti.png` — cliente che non può acquistare.
- `screenshots/05-home-07-davide-percorso-concluso.png`

## File del repo
`src/routes/client.index.tsx` (riscrivere la parte mobile), `client-live-booking-card.tsx`, `client-sessions-breakdown.tsx`, `client-session-timeline.tsx`, `client-reminder-banner.tsx`, `client-feedback-card.tsx`, `client-bia-progress.tsx`, `bia-sparkline.tsx`, `empty-state-card.tsx`. Query invariate: `useClientBlocks`, `useClientBookings`, `useCoachEventTypes`, `useClientExtraCredits`, `useBiaMeasurements`, `useClientFeedback`; conteggi da `getClientPools`.

## Layout
Intestazione di scheda: «Ciao Giulia» (una riga, ellissi, V10) con la data di oggi «Lunedì 28 settembre»; campanella. `main` con padding 4px 16px 24px, colonna con gap 16, in quest'ordine: percorso concluso → prossima sessione (o nessuna sessione) → crediti → valutazione → progressi → installazione.

Card: fondo bianco, raggio 24, bordo 1px `rgba(193,199,208,0.35)`, ombra `--shadow-soft-card`, padding 18.

### Percorso concluso (H7) — Davide
- Padding 20, gap 14. Riquadro 48×48 raggio 14 `rgba(0,86,133,0.1)` con `Award` 24 `#005685`.
- «Il tuo percorso è concluso» 17/700; testo 15 px line-height 1.5 `#41474f`: «L'ultimo blocco si è chiuso domenica 6 settembre. Per ripartire scrivi a Marco: ti proporrà il prossimo percorso.»
- Principale «Scrivi a Marco su WhatsApp» (`MessageCircle` 18); secondario «Chiama +39 347 555 01 23» (`Phone` 16, `tel:`).
- Niente card crediti, niente «Prenota», nessun invito allo Store.

### Prossima sessione (H2, H4, H5, V1)
- `section` con `aria-label="Prossima sessione"`, gap 14.
- Riga: «Prossima sessione» 14/700 `#41474f` e il chip di stato.
- Blocco cliccabile (apre il dettaglio), riga con gap 14: riquadro 52×52 raggio 16 (colore tipologia al 10%) con icona 26; colonna con gap 4:
  - giorno Sora 22/700, line-height 1.2, letter-spacing −0.01em: «Oggi», «Domani», «Mercoledì 30 settembre»;
  - «10:00–11:00» 16/700 `tabular-nums` seguito da « · tra 2 giorni» 500 `#41474f` («· in corso» durante la sessione);
  - «Personal Training · 60 min» 14 px `#41474f`;
  - luogo 14 px line-height 1.4 `#41474f` con `MapPin` o `Video` 16.
- Azioni:
  - Da confermare → principale «Conferma presenza» (`CircleCheck` 18). Unico punto della Home in cui compare (H4): niente banner in cima.
  - Online, in corso o entro un'ora → principale «Entra nella videochiamata» (`Video` 18).
  - Almeno 24 ore prima → griglia a due colonne con gap 8: secondari «Sposta» (`Repeat` 16, apre il foglio Sposta della passata 04) e «Dettagli».
  - Meno di 24 ore → secondario «Dettagli» a tutta larghezza e sotto 13 px line-height 1.45 `#41474f` «Mancano meno di 24 ore: non si può più spostare.» (in corso: «La sessione è in corso.») seguito dal link 700 `#005685` «Scrivi a Marco» (V1).
- Se ci sono altre sessioni: pulsante in fondo, altezza minima 44, padding-top 12, bordo superiore 1px `#f2f3f8`, `space-between`: «Hai un'altra sessione prenotata» / «Hai altre 5 sessioni prenotate» 14/500 `#41474f`; a destra «Vedi tutte» 14/600 `#003e62` con `ChevronRight` 16 → `/client/sessions` (N1).
- Toast: conferma «Presenza confermata: Marco la vede nel suo calendario.»; spostamento come nella passata 04.

### Nessuna sessione in programma
- Card con gap 12: «Prossima sessione» 14/700 `#41474f`; «Nessuna sessione in programma» 17/700; testo 15 px `#41474f`:
  - «Primo orario libero: giovedì 1 ottobre alle 09:00, Personal Training.» (il primo orario di `getClientSlotDays` tra le tipologie prenotabili con crediti) + principale «Prenota una sessione» → `/client/book?eventType=<id>`;
  - «Nessun orario libero nei prossimi giorni: scrivi a Marco per trovarne uno.»;
  - «Non hai crediti da prenotare in questo momento.»

### I tuoi crediti (H1, H3, H10, V2, V8, V9)
- `section` con `aria-label="I tuoi crediti"`, gap 12. Non compare a percorso concluso o senza crediti.
- Intestazione: «I tuoi crediti» 17/700 e sotto il sottotitolo del blocco della passata 00, 13 px line-height 1.4 `#41474f` (abbonamento con il prefisso «Abbonamento mensile · »); a destra chip 12/700, fondo `#eceef2`, testo `#41474f`: «Blocco 3 di 6», «Blocco 4», «Cliente libero».
- Percorso fisso con più blocchi: segmenti `role="img"` («Percorso: blocco 3 di 6»), gap 4, ciascuno `flex: 1`, altezza 6, raggio 9999: blocchi finiti `#003e62`, in corso `#94ccff`, futuri `#e1e2e7`.
- Crediti da usare (non libero, blocco non finito, crediti disponibili e fine del blocco entro 7 giorni): riquadro con gap 8, 13 px line-height 1.45, `--color-warning-ink` su warning-soft, raggio 12, padding 10px 12px, `Hourglass` 16: «3 crediti da prenotare entro domenica 4 ottobre.» Nessuna frase sul passaggio al blocco successivo (V2).
- Una riga per tipologia, padding 12px 0, bordo superiore 1px `#f2f3f8` dalla seconda, gap 8:
  - riquadro 40×40 raggio 12 con icona 20; nome 15/700; sotto 14/700 «3 disponibili» / «1 disponibile» (success-text) oppure «Esauriti» (warning-text);
  - a destra un'azione di riga (44 px, padding 0 16px, 14/700): crediti e prenotabile → «Prenota» piena `#005685` → `/client/book?eventType=<id>`; crediti ma da prenotare col coach → «Come si prenota» con bordo (apre il foglio: titolo nome della tipologia; testo messaggio della tipologia o «Questa sessione si prenota direttamente con Marco.» + « Hai 1 credito disponibile.»; principale «Scrivi a Marco su WhatsApp»; «Chiudi»); esauriti e si può acquistare → «Acquista» con bordo → `/client/store?type=<id>`; altrimenti nessuna azione. Mai «Completo» (H10).
  - Barra `role="img"`, altezza 8, raggio 9999, fondo `#eceef2`: svolte `#003e62`, prenotate `#94ccff`, perse `--color-credit-lost`, larghezze in proporzione al totale. Nome accessibile «Personal Training: 5 svolte, 7 prenotate, 1 persa, 3 disponibili su 16».
  - Dettaglio 13 px `#41474f`: «5 svolte · 7 prenotate · 1 persa · 16 in totale»; mai usati: «Non ancora usati · 1 in totale» (V9).
- Legenda `aria-hidden`, a capo, gap 6px 14px, 12 px `#41474f`, quadratini 10×10 raggio 3: «Svolte», «Prenotate» e, solo se ci sono crediti persi, «Perse (assenze e annullate tardi)» (V9).
- In fondo (altezza minima 44, padding-top 10, bordo superiore `#f2f3f8`, `space-between`, 14/700 `#003e62`): se si può acquistare «Acquista un Booster» (`Sparkles` 16, `ChevronRight` 16) → `/client/store`; altrimenti «Per altri crediti scrivi a Marco» (`MessageCircle` 16) → WhatsApp.
- Il numero disponibile è lo stesso di Prenota, del riepilogo Booster e del lato coach (H1).

### Com'è andata? (H9)
Se c'è una sessione valutabile non ancora valutata (la più recente) e il percorso non è concluso: card con il componente valutazione della passata 04, titolo «Com'è andata?» e sotto 14 px line-height 1.45 `#41474f` «Personal Training di lunedì 28 settembre. La valutazione arriva a Marco.»; stelle centrate.

### I tuoi progressi
Solo con almeno due misurazioni BIA.
- «I tuoi progressi» 17/700; segmentato `role="radiogroup"` «Misura», griglia a 3 colonne, gap 4, padding 4, raggio 9999, fondo `#f2f3f8`; voci 44 px 14/700 «Peso», «Massa magra», «Grasso»; selezionata fondo bianco, testo `#003e62`, ombra `0 2px 8px rgba(0,0,0,0.08)`.
- Valore Sora 30/700 `tabular-nums` «61,2 kg» / «25,9%» e accanto 14 px `#41474f` «−3,0 kg dal 1 mag» (segno + o −, virgola decimale).
- Grafico a linea, SVG 320×100 alto 96: linea di base `#eceef2`; linea `#005685` spessore 2.5 con giunture arrotondate; ultimo punto cerchio r 4.5 bianco con bordo `#005685` 2.5; `role="img"` «Peso: da 64,2 a 61,2 kg in 6 misurazioni».
- Prima e ultima data 12 px `#41474f` («dom 1 mar», «mer 23 set»); in fondo 13 px «Misurazioni BIA registrate da Marco.»

### Installa (N5)
Se l'app non è installata e la card non è stata chiusa: card raggio 24, bordo, senza ombra, padding 16px 18px, riga con gap 14:
- riquadro 40×40 raggio 12 `rgba(0,86,133,0.1)` con `Download` 20 `#005685`;
- «Installa NC Calendar» 15/700; 13 px line-height 1.45 «Apri l'app dalla schermata Home e ricevi le notifiche sulle sessioni.»;
- pulsanti (margin-top 6, gap 8): tonale «Come installarla» (44 px) → foglio della passata 01; testuale «Non ora» (`#41474f` 14/600) → chiude per sempre (preferenza per utente) e toast «Puoi installarla quando vuoi dal Profilo.»

## Da togliere dalla Home
Banner «Promemoria» (H4); segmenti del blocco con date, legenda con ● e ○, tabella «Le tue Sessioni», riepilogo «fatte / prenotate / da fare», elenco dei blocchi «Il tuo percorso» (H3); «Il Tuo Percorso Recente» (va in Sessioni); pulsante «Prenota Nuova Sessione»; stato vuoto che porta allo Store (H7); conto alla rovescia al secondo ed emoji (H5).

## Accettazione
- Su 390×844 la prossima sessione e la sua azione sono nella prima schermata (H2).
- Il numero disponibile per tipologia coincide con Prenota e con il residuo che vede il coach (H1).
- «Conferma presenza» compare solo per le sessioni da confermare; dopo il tocco il chip diventa «Confermata» e il badge di Sessioni scende.
- Le quattro persone di prova corrispondono alle schermate.
- Chi non ha un percorso o l'ha concluso non vede inviti allo Store.

## Fuori scope
Notifiche (passata 08).
