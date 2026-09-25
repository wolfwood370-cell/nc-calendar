# Passata 04 — Calendario

## Obiettivo
Un calendario che si usa per lavorare: filtri chiari, una sola sincronizzazione, dettagli e azioni in un pannello, creazione di sessioni dal coach, stato nell'URL.

## Punti audit
C1 (tre modi di sincronizzare), C2 (filtri che danno vuoto), C3 (Focus cliente sempre aperto), C4 (tile), C5 (ora corrente, vista giorno), C6 (creazione dal coach), T4, T5.

## Riferimenti design
`designs/Coach Calendario.dc.html` (+ `Coach Assegna Evento`, `Coach Annulla Sessione`).


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/04-calendario-01-settimana.png`
- `screenshots/04-calendario-02-pannello-dettagli.png`
- `screenshots/04-calendario-03-annulla-sessione.png`
- `screenshots/04-calendario-04-nuova-sessione.png`
- `screenshots/04-calendario-05-vista-giorno.png`
- `screenshots/04-calendario-06-da-assegnare-disponibilita.png`

## File del repo
`src/routes/trainer.calendar.tsx`, `calendar-header.tsx`, `calendar-days-header.tsx`, `calendar-all-day-strip.tsx`, `calendar-event-tile.tsx`, `calendar-context-panel.tsx`, `focus-client-panel.tsx`, `calendar-gcal-review.tsx`, `calendar-event-edit-dialog.tsx`.

## Search params (T4)
`date=YYYY-MM-DD` (qualsiasi giorno del periodo), `view=day|week` (predefinita `week`), `filter=assign|personal`, `types=pt,bia`, `avail=1`, `event=<id>`; `new=sessione` e `client=<id>` aprono la creazione (e poi si tolgono). Frecce ←/→ cambiano periodo (non quando il focus è in un campo o su un controllo segmentato).

## Testata
- Riga 1: H1 «Calendario»; a destra il **solo** indicatore di sincronizzazione (C1): pill bianca «● Google Calendar · sincronizzato 4 min fa» con pulsante icona «Sincronizza ora» (`RefreshCw`). Se ci sono sessioni non presenti su Google: chip arancione «1 sessione non è su Google» che apre un popover (380px) con l'elenco e «Ricrea su Google» per riga. Il pannello «Riconciliazione Google Calendar» e il pulsante «Sincronizza tutto dal 1° gen» si tolgono da qui (vanno in Integrazioni, passata 09).
- Riga 2: «Oggi» (pill bordata) · ‹ › · periodo (Sora 18/600: «21 – 27 settembre 2026» / «Venerdì 25 settembre 2026»); a destra segmentato «Giorno | Settimana» (C5).
- Riga 3: segmentato **«Tutti | Da assegnare (3) | Personali»** mutuamente esclusivo (C2; il numero è pill terziaria) · separatore · chip tipologie (multiselezione; le non selezionate al 55% di opacità; «Mostra tutte» quando c'è una selezione; selezionare una tipologia riporta il filtro su Tutti) · separatore · interruttore «Disponibilità» (tratteggia gli orari chiusi ed eccezioni).
- Filtri che non trovano nulla: banner «Nessun evento con questi filtri nel periodo mostrato.» + «Rimuovi filtri».

## Griglia
- Card bianca radius 28px. Colonna ore 56px; righe da 48px dalle 07:00 alle 22:00; linee orarie `#eceef2`; oggi con fondo `rgba(0,86,133,0.03)` e numero del giorno in cerchio primario. Clic sull'intestazione di un giorno → vista giorno.
- **Linea dell'ora corrente** (C5): 2px `#e53935` con pallino 10px, solo su oggi.
- Striscia «Tutto il giorno» sopra la griglia solo se ci sono eventi giornalieri.
- **Tile (C4)** (radius 10px, padding 4px 7px, sovrapposizioni in colonne):
  - Sessione cliente: fondo colore tipologia, testo bianco; titolo = **nome cliente** 12/700, sotto «Tipologia · 10:30» 11 (solo se il tile è alto ≥ 38px). Presenza confermata dal cliente: cerchio bianco 15px con spunta verde (`title="Presenza confermata dal cliente"`), niente più testo a 8px. Svolta: 62% opacità + icona `CheckCircle2`. Assente: fondo `danger-soft`, bordo `danger-line`, testo `danger-text`, «Assente · 10:30».
  - Consulenza esterna: colore tipologia, «Consulenza esterna · ora».
  - Impegno personale: fondo `#e7e8ec`, bordo `outline-variant`, testo `on-surface-variant`.
  - Da assegnare: fondo `assign-soft`, bordo tratteggiato 1.5px `#f59e0b`, testo `#7c4302`, icona `CircleHelp`, «Da assegnare · ora» → apre Assegna evento.
  - Selezionato: anello 2px bianco + 2px `#191c1f`.
- **Clic su spazio vuoto (C6)**: apre «Nuova sessione» con giorno e ora arrotondata ai 15 minuti.

## Pannello dettagli (C3) — sostituisce «Focus Cliente»
Pannello fisso a destra (390px, sotto l'header, ombra `-20px 0 60px rgba(0,0,0,0.12)`), aperto solo al clic su un evento; Esc o ✕ lo chiudono. Contenuto:
- Tipologia con quadratino colore; nome cliente (Sora 24/700); «Giovedì 1 ottobre · 10:00–11:00»; chip di stato (Programmata / Da confermare / Svolta / Assente) e, per sessioni future, «Presenza confermata dal cliente» (verde) o «In attesa di conferma del cliente» (arancione).
- Azioni: se oggi o passata e programmata → «Check-in» primario + «Assente»; se svolta/assente → «Annulla check-in» / «Annulla assenza»; sempre «Modifica» e «Annulla sessione» (rosso tenue) → dialog condiviso (passata 02).
- Riquadro cliente (`surface-container-low`, radius 20): avatar, nome, piano; barre crediti del blocco in corso «3 di 5 rimasti»; «Apri profilo» e «WhatsApp» (`https://wa.me/<cifre>`).
- «Nota dell'ultima sessione» (label maiuscola 11/700).
- In fondo: avviso «Non presente su Google Calendar · Ricrea» se serve; «Apri in Google Calendar»; link rosso «Inserita per errore? Elimina» (dialog condiviso, modalità elimina).

## Creazione e modifica (C6)
Dialog 560px. Titolo «Nuova sessione» / «Nuovo impegno» (segue la scelta del segmentato «Sessione cliente | Impegno personale»), «Modifica sessione» / «Modifica impegno».
- Cliente (ricerca + elenco con radio; bloccato in modifica), tipologia a chip (la durata segue la tipologia), oppure titolo per l'impegno.
- Data (date), Ora (select a 15 minuti, 07:00–21:45), Durata (30/45/60/90/120).
- Avvisi arancioni, senza bloccare: «Si sovrappone a Giulia Bianchi (10:30–11:30).»; «È fuori dalla tua disponibilità: i clienti non vedono questo orario, ma puoi crearla comunque.» (considera anche le eccezioni).
- In modifica di sessione cliente: «Note del coach».
- Backend: **nuovo percorso di creazione lato coach** che rispetti i trigger su allocazioni/crediti e crei l'evento Google (oggi il coach non crea sessioni dall'app).

## Accettazione
- Link copiato da una notifica apre settimana ed evento giusti.
- «Da assegnare» e «Personali» non si possono attivare insieme.
- Nessun `confirm()`; nessun pannello vuoto a destra.
- Creare, modificare, annullare hanno toast con «Ripristina».
