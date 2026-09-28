# Passata 03 — Sessioni

## Obiettivo
Un posto con tutte le prenotazioni: quelle in programma, ciascuna apribile e gestibile, e lo storico.

## Punti audit
N1 (sessioni dopo la prossima non apribili), T5 (sessioni passate «In programma»), T1 (stati con i nomi del lato coach), H9 (valutazione anche dallo storico), V13 (riepilogo e presenza sulle stesse sessioni).

## Riferimenti design
`designs/Cliente Sessioni.dc.html`.

## Schermate
- `screenshots/03-sessioni-01-in-programma.png`
- `screenshots/03-sessioni-02-passate.png`

## File del repo
`src/routes/client.sessions.tsx` (sostituisce il segnaposto della passata 01), `client-session-timeline.tsx` (non più usato dalla Home dopo la passata 05: toglierlo allora), `src/lib/attendance.ts`, helper della passata 00.

## Search params
`tab=prossime|passate` (predefinito `prossime`), cambiato con `replace` (nessuna voce nuova nella cronologia).

## Layout
- Intestazione di scheda «Sessioni» con sottotitolo «6 sessioni in programma» / «1 sessione in programma» / «Nessuna sessione in programma».
- Nell'intestazione, sotto il titolo con gap 14: `role="tablist"` con `aria-label="Sessioni"`, griglia a 2 colonne, gap 4, padding 4, raggio 9999, fondo `#eceef2`. Tab: altezza 44, raggio 9999, 14/700; selezionata fondo bianco, testo `#003e62`, ombra `0 2px 8px rgba(0,0,0,0.08)`; non selezionata trasparente, `#41474f`. Etichette «In programma · 6» e «Passate». Frecce, Home, End.
- `main` con padding 8px 16px 24px, colonna con gap 20.

### In programma
- Sessioni `scheduled` non ancora finite, in ordine di inizio; compresa quella in corso.
- Gruppi per settimana (da lunedì): «Questa settimana», «Settimana prossima», «Dal lunedì 12 ottobre». Titolo del gruppo 14/700 `#41474f`, padding 0 4px; righe con gap 8.
- Vuoto: card (raggio 24, padding 20, gap 12) «Nessuna sessione in programma» 17/700 e testo 15 px «Hai 3 crediti disponibili: scegli giorno e orario.» con principale «Prenota una sessione»; senza crediti «Non hai crediti da prenotare in questo momento.» senza pulsante.

### Passate
- Tutte le sessioni finite, più quelle annullate (anche se future), dalla più recente. Escluse quelle ignorate. Gruppi per mese: «Settembre 2026».
- Sopra l'elenco, se c'è una percentuale: riga bianca raggio 18, bordo, padding 14px 16px, gap 12; riquadro 40×40 raggio 12 success-soft con `TrendingUp` 20 success-text; «Presenza 91% nelle ultime 8 settimane» 15/700; «21 sessioni svolte · 2 assenze» 13 px `#41474f`. Percentuale e conteggi da `getAttendance`, sulle stesse sessioni (escluse quelle importate da Google, V13), uguale al Profilo del cliente e al Profilo cliente del coach.
- Vuoto: «Nessuna sessione passata» · «Qui trovi le sessioni svolte, le assenze e quelle annullate.»

### Riga sessione
- Pulsante a tutta larghezza, altezza minima 72, padding 10px 12px 10px 10px, raggio 18, fondo bianco, bordo 1px `rgba(193,199,208,0.35)`, riga con gap 12, allineamento al centro.
- Data: riquadro 50×52 raggio 14, fondo colore della tipologia al 10%, testo nel colore della tipologia (annullate: fondo `#f2f3f8`, testo `#717880`); giorno della settimana 12/600, numero Sora 20/700 line-height 1.1 `tabular-nums`.
- Centro, gap 3: orario 15/700 `tabular-nums` «10:00–11:00»; tipologia 13 px `#41474f` con ellissi («Personal Training», « · online» se online); se valutata, stella 14 `#d97706` e «4 su 5» 12/600 `#41474f`.
- Chip a destra 12/700, padding 4px 10px, raggio 9999: stato della passata 00; «Da valutare» (`--color-rating-soft` / `--color-rating-text`) se valutabile e non ancora valutata.
- `ChevronRight` 16 `#717880`.
- Nome accessibile «Mercoledì 30 settembre, 10:00–11:00, Personal Training, da confermare».
- Tocco → `/client/bookings/<id>` con la provenienza (per tornare alla stessa tab).

## Accettazione
- Ogni sessione prenotata compare ed è apribile (N1).
- Le sessioni passate non ancora registrate dal coach sono «In verifica» (T5).
- La percentuale di presenza è la stessa del Profilo e del lato coach.
- La tab scelta resta dopo un ricaricamento e dopo essere tornati dal dettaglio.

## Fuori scope
Dettaglio della sessione (passata 04).
