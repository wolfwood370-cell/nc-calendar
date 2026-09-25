# Passata 07 — Tipologie di sessione

## Obiettivo
Card che fanno davvero quello che sembrano, dati reali al posto dei segnaposto, un modulo chiaro.

## Punti audit
E1 (controlli finti), E2 (segnaposto), E3 (doppia negazione), E4 (eliminazione senza contesto), E5 (validazione).

## Riferimenti design
`designs/Coach Tipologie.dc.html`.


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/07-tipologie-01-pagina.png`
- `screenshots/07-tipologie-02-modifica.png`

## File del repo
`src/routes/trainer.event-types.tsx`, `src/components/event-type-service-card.tsx`, `src/lib/event-colors.ts`.

## Pagina
H1 «Tipologie di sessione»; sottotitolo «Durata, margine, luogo e colore di ogni servizio. Calendario, pacchetti e prenotazioni dei clienti usano questi valori.» (niente più «prezzo»); «Nuova tipologia» (42px). Griglia `minmax(min(100%,320px),1fr)`, gap 16px.

## Card (radius 24, padding 22, fascia colore 6px in alto)
- Quadrato colore 40px con icona bianca · nome 17/700 · descrizione 13 · matita «Modifica <nome>».
- **Durata** −/+ (passo 15 min, 15–240) e **Margine dopo la sessione** −/+ (passo 5 min, 0–60): **agiscono subito** (E1) con update di `duration` / `buffer_minutes`.
- Luogo: `MapPin` «In studio · Via Roma 12, Bologna» o `Video` «Online · link inviato alla prenotazione».
- **Interruttore «Prenotabile dai clienti»** (E3) su `client_bookable`, immediato con toast e «Ripristina»; testo sotto: «I clienti la vedono tra le sessioni prenotabili.» / «Nascosta ai clienti. Messaggio: «…»» / «Nascosta ai clienti: solo tu puoi fissarla.». Nessuna opacità ridotta sulla card.
- Piè: `Activity` «12 sessioni questo mese · 5 clienti con crediti» (E2, da bookings e allocazioni) · «Elimina» (rosso, 12/600).
- «Prezzo» si toglie finché non esiste il campo.

## Dialog nuova/modifica (600px) (E5)
- Nome (obbligatorio, max 60; errori sotto il campo: «Inserisci un nome.», «Esiste già una tipologia con questo nome.»), Descrizione «(la vedono i clienti)».
- Durata segmentata 30/45/60/90/120 min · Margine dopo 0/5/10/15 min.
- Luogo: card radio «In studio» (+ indirizzo, «I clienti possono aprirlo in Google Maps.») / «Online».
- Colore: 12 cerchi 32px (Blu studio `#003e62` + palette Google) con anello di selezione; **anteprima del tile** «Giulia Bianchi / <Nome> · 10:30» sul colore scelto e avviso «Testo bianco poco leggibile su questo colore» se il contrasto col bianco è < 3:1 (es. Banana `#f6bf26`).
- Interruttore «Prenotabile dai clienti» (in positivo) + «Messaggio per i clienti» se disattivo.
- «Annulla» / «Crea tipologia» / «Salva modifiche».

## Eliminazione (E4)
AlertDialog «Eliminare «<Nome>»?». Se in uso: «È in uso: 27 sessioni future e 9 clienti hanno crediti di questo tipo. Le sessioni restano in calendario, ma non potrai più assegnare pacchetti con questa tipologia. Se vuoi solo nasconderla ai clienti, rendila non prenotabile.» con «Rendi non prenotabile» accanto a «Elimina». Se non in uso: «Non ci sono sessioni future né crediti di questo tipo. Le sessioni passate restano nello storico.». Verificare lato DB cosa succede ad allocazioni e booking che referenziano la tipologia (valutare soft delete).

## Accettazione
- Nessun controllo della card apre il dialog senza dirlo.
- Nessun «—» segnaposto.
