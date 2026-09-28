# Passata 04 — Dettaglio sessione, Sposta, Annulla

## Obiettivo
Un'intestazione con tutte le informazioni, una sola azione principale secondo lo stato, lo spostamento con lo stesso selettore di Prenota e l'annullamento con «Ripristina» e la regola spiegata.

## Punti audit
D1 (annullare è definitivo), D2 («Aggiungi a Google Calendar»), D3 (quattro card e due pulsanti pieni), D4 (nota di riempimento), D5 («Indietro» sempre alla Home), O3, O4, B2 (Sposta con un'altra regola), H9 (valutazione), V11 (WhatsApp secondario), T1.

## Riferimenti design
`designs/Cliente Sessione.dc.html` (si apre con `?id=<id sessione>`: il modo più semplice è partire da Sessioni) e `designs/Cliente Sposta.dc.html` (foglio, usato anche dalla Home).

## Schermate
- `screenshots/04-sessione-01-da-confermare.png` — più di 24 ore, entro 48: conferma, Sposta, Annulla.
- `screenshots/04-sessione-02-sposta.png`
- `screenshots/04-sessione-03-annulla.png`
- `screenshots/04-sessione-04-annullata-ripristina.png`
- `screenshots/04-sessione-05-meno-di-24-ore.png` — Marta, sessione di oggi alle 19:30.
- `screenshots/04-sessione-06-svolta-valutazione.png`

## File del repo
`src/routes/client.bookings.$bookingId.tsx`, `client-booking-detail-view.tsx` (da riscrivere), `client-reschedule-sheet.tsx` e `reschedule-drawer.tsx` (sostituiti dal foglio Sposta; prima verificare che non li usi il lato coach), `join-video-call-button.tsx`, `src/hooks/use-confirm-attendance.ts`, `src/hooks/use-session-feedback.ts`, `src/lib/calendar.ts` (`generateGoogleCalendarLink` non più usato dal cliente). Nuovi: foglio Sposta, foglio Annulla, componente valutazione (riusato dalla Home).

## Layout
Intestazione di pagina aperta «Sessione» (passata 01), senza barra in basso. `main` con padding 8px 16px 32px, colonna con gap 16.

Caricamento ed errori come oggi (errore di rete con «Riprova» distinto da sessione inesistente). Sessione inesistente: card «Sessione non trovata» 17/700, testo 15 px «Potrebbe essere stata eliminata.», principale «Vai alle sessioni».

### Intestazione (D3)
Card bianca, raggio 24, bordo, ombra, padding 20, gap 14:
- Chip di stato con icona 14 (passata 00), 12/700, padding 4px 10px.
- Riga: riquadro 48×48 raggio 14 (colore tipologia al 10%) con icona 24; titolo Sora 24/700, line-height 1.2, letter-spacing −0.01em, con il nome della tipologia.
- Elenco con gap 10, righe 15 px line-height 1.4, icone 18 `#005685`:
  - `CalendarDays`: in grassetto «Mercoledì 30 settembre» (oggi e domani: «Oggi, lunedì 28 settembre», «Domani, martedì 29 settembre»); a capo «10:00–11:00 · 60 min · tra 2 giorni» (il tempo che manca solo per le sessioni future).
  - `User` «con Marco Rossi».
  - `MapPin` «Studio · Via Roma 12, Bologna» e sotto il link 14/700 `#005685` «Apri in Mappe» (`https://www.google.com/maps/search/?api=1&query=<indirizzo>`); online `Video` «Online · videochiamata Google Meet», senza Mappe.

### Azioni secondo lo stato
Mai più di un pulsante pieno (V11).
1. **Da confermare** (O3): principale «Conferma presenza» (`CircleCheck` 18) e sotto, centrato, 13 px `#41474f` «Marco vede la conferma nel suo calendario.» → `confirm_booking_attendance`; toast «Presenza confermata: Marco la vede nel suo calendario.»
2. **Online, in corso o entro un'ora**: principale «Entra nella videochiamata» (`Video` 18) con `meeting_link` (logica di `join-video-call-button.tsx`).
3. **Futura, almeno 24 ore prima**: secondario «Sposta» (48 px, fondo bianco, `Repeat` 16, 15/700); testuale distruttivo «Annulla sessione»; sotto, centrato, 13 px «Gratis fino a martedì 29 settembre alle 10:00. Dopo, il credito viene scalato.» Se la sessione è anche da confermare, «Conferma presenza» resta sopra.
4. **Futura, meno di 24 ore prima** (`04-sessione-05`): riquadro warning-soft raggio 24, padding 16, gap 10:
   - titolo con gap 8, `Clock` 18, 15/700 `--color-warning-ink`: «Mancano meno di 24 ore»;
   - testo 14 px line-height 1.5 `#41474f`: «La sessione non si può più spostare. Se la annulli, il credito Personal Training viene scalato comunque. Per un altro orario scrivi a Marco.»;
   - secondario bianco «Scrivi a Marco su WhatsApp» (`MessageCircle` 16);
   - testuale distruttivo «Annulla comunque».
5. **In corso** (non online): nessuna azione.
6. **Passata o annullata**: card bianca raggio 24, bordo, padding 16, gap 10:
   - riga di stato con gap 8, icona 18, 15/700 nel colore dello stato: «Svolta · credito usato», «Assente · il credito è stato scalato», «Annullata · il credito è tornato disponibile», «Annullata con meno di 24 ore · credito scalato», «In verifica · il coach deve ancora registrarla»;
   - assente: link 14/700 `#005685` «Pensi sia un errore? Scrivi a Marco»;
   - svolta o annullata, con crediti prenotabili di quella tipologia: secondario «Prenota di nuovo» → `/client/book?eventType=<id>`.

### Valutazione (H9)
Componente condiviso con la Home. Compare per le sessioni valutabili (passata 00: svolta, non importata, negli ultimi 14 giorni) o già valutate.
- Card bianca raggio 24, bordo, padding 16, gap 12. Titolo 17/700 «Com'è andata?» (o «La tua valutazione» se salvata e non in modifica).
- `role="radiogroup"` «Valutazione da 1 a 5»: cinque pulsanti 48×48 (gap 2; nella Home centrati con gap 4), stella SVG 32 px: piena `#d97706` con bordo `#b45309`, vuota solo bordo `#717880` 1.5; nomi «1 stella», «2 stelle»…; frecce.
- Dopo la scelta: area di testo (2 righe, raggio 14, bordo 1px `#c1c7d0`, padding 12px 14px, 15 px line-height 1.4, segnaposto «Vuoi aggiungere qualcosa? (facoltativo)», `aria-label="Nota per il coach, facoltativa"`) e principale «Invia valutazione» («Aggiorna valutazione» se già inviata), grigio disattivato finché non c'è una stella.
- Salvata: stelle in sola lettura, la nota tra «» 14 px `#41474f`, testuale 14/700 `#005685` «Modifica valutazione» (solo entro i 14 giorni).
- Toast «Grazie: Marco vedrà la tua valutazione.» Salvataggio con `rating` e `note` (colonna della passata 00).

### Informazioni (D4, O4)
Card bianca raggio 24, bordo, padding 16, gap 14, con solo le voci presenti:
- «Nota di Marco» 14/700 e testo 15 px line-height 1.5 `#41474f`, solo se `trainer_notes` non è vuoto (niente testo di riempimento).
- «Cosa aspettarti» 14/700 e descrizione della tipologia, solo se c'è.
- Per le sessioni in programma: `CalendarCheck` 18 `#005685` e 14 px line-height 1.45 «Invito del calendario inviato a giulia.b@email.it: si aggiorna da solo se la sessione viene spostata o annullata.»
- Nessun pulsante «Aggiungi a Google Calendar» (D2).

## Sposta (B2)
Foglio dal basso, con ombra `0 -12px 40px rgba(0,0,0,0.12)`. Si apre dal dettaglio e dalla card della prossima sessione in Home.
- Titolo «Sposta la sessione» e sotto 14 px line-height 1.45 `#41474f` «Ora: mercoledì 30 settembre, 10:00–11:00 · Personal Training».
- Meno di 24 ore: solo il testo 15 px «Mancano meno di 24 ore all'inizio: la sessione non si può più spostare. Per un altro orario scrivi a Marco.» e «Indietro».
- Altrimenti:
  - «Nuovo giorno» 15/700 e la **fila dei giorni della passata 02** (qui margine 0 −20px e padding 2px 20px 6px);
  - titolo del giorno 15/700 e i **gruppi di orari della passata 02**; senza orari: 14 px «Nessun orario libero nei prossimi giorni. Per trovarne uno scrivi a Marco.»;
  - riga regola (`Info` 16): «Si sposta fino a 24 ore prima, su un orario entro 14 giorni e non oltre domenica 11 ottobre, fine del blocco. Marco riceve un avviso.»;
  - errore `role="alert"` 14/600 `#b91c1c`;
  - principale «Sposta a mar 29 set, 11:10», disattivato («Scegli un nuovo orario», fondo `#e1e2e7`, testo `#41474f`) finché non si sceglie; testuale «Indietro».
- Orari da `getClientSlotDays` escludendo la sessione stessa, fino alla validità dei crediti del suo blocco.
- Conferma → `reschedule_booking` e aggiornamento dell'evento Google come oggi; il foglio si chiude; toast «Spostata a mar 29 set alle 11:10. Marco riceve un avviso.» con «Ripristina» (8 s) che riporta la sessione all'orario di prima. Se l'orario di prima non è più libero: toast d'avviso «L'orario di prima non è più libero.»
- La conferma della presenza si aggiorna dal server (passata 00).

## Annulla (D1)
Foglio `role="alertdialog"`:
- Titolo «Annullare la sessione?»; 15/600 «Personal Training · mer 30 set, 10:00–11:00».
- Riquadro 15 px line-height 1.5, raggio 14, padding 12px 14px: almeno 24 ore prima fondo `#f8f9fe`, testo `#41474f`, «Il credito torna disponibile e Marco riceve un avviso.»; meno di 24 ore fondo warning-soft, testo `--color-warning-ink`, «Mancano meno di 24 ore: il credito Personal Training viene scalato comunque. Marco riceve un avviso.»
- Distruttivo pieno «Annulla sessione»; testuale «Tienila».
- Dopo: si resta sulla sessione, che mostra «Annullata» o «Annullata tardi»; toast «Sessione annullata: il credito è tornato disponibile.» (ok) oppure «Sessione annullata: il credito è stato scalato.» (avviso), entrambi con «Ripristina» per 8 s.

## Dati e backend
Proporre e aspettare conferma.
- **Ripristinare un annullamento (D1).** `cancel_booking` porta la sessione a `cancelled`/`late_cancelled`, imposta `deleted_at` e restituisce il credito se gratuito; non esiste il contrario. Opzioni:
  1. RPC `restore_booking(p_booking_id)`: consentita al cliente della sessione entro 10 minuti da `deleted_at`, se l'orario è ancora libero; riporta `status = scheduled`, `deleted_at = null`, riprende il credito (stessa logica di consumo dei trigger) e ricrea l'evento Google. Consigliata.
  2. Annullamento differito: la UI mostra «Annullata» e chiama `cancel_booking` alla scadenza del toast o all'uscita dalla pagina. Più semplice, ma se l'app si chiude prima l'annullamento può andare perso.
- **Ripristinare uno spostamento:** `reschedule_booking` verso l'orario di prima; valgono le regole della passata 00.
- **Conferma (O3)** e **nota della valutazione (H9):** dalla passata 00.

## Accettazione
- In ogni stato al massimo un pulsante pieno.
- Sposta offre gli stessi giorni e orari di Prenota per la stessa tipologia, più l'orario liberato dalla sessione stessa.
- Dopo l'annullamento si resta sulla sessione; «Ripristina» entro 8 secondi la riporta com'era e il calendario del coach si aggiorna.
- «Indietro» torna a Sessioni (sulla stessa tab), alla Home o alle Notifiche, secondo da dove si è arrivati.
- Nel lato cliente non c'è più «Aggiungi a Google Calendar» né «Riprogramma».

## Fuori scope
Home (passata 05), notifiche al cliente per le azioni del coach (08).
