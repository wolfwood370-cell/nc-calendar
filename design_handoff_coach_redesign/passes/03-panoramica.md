# Passata 03 — Panoramica

## Obiettivo
Una giornata leggibile a colpo d'occhio: numeri corretti, stato di ogni sessione, azioni reversibili, cose da fare accanto all'agenda.

## Punti audit
P1 (conteggio fermo a 5), P2 (check-in senza annulla), P3 (giornata senza stato), P4 (regola in scadenza), P5 (azioni in pagina), P6 (gerarchia), P7 (contatori a zero), O4 (giorno vuoto).

## Riferimenti design
`designs/Coach Panoramica.dc.html`.


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/03-panoramica-01-pagina.png`
- `screenshots/03-panoramica-02-rinnovo.png`
- `screenshots/03-panoramica-03-assegna-evento.png`

## File del repo
`src/routes/trainer.index.tsx` (solo il blocco `hidden md:block`).

## Layout
- H1 (`PageTitle`): «Buongiorno, <Nome>» (< 13:00), «Buon pomeriggio, …» (< 18:00), «Buonasera, …». Sotto (16px, `on-surface-variant`): «Venerdì 25 settembre · 7 sessioni oggi, 1 svolta, 1 da confermare» (le parti a zero si omettono).
- Griglia a due colonne `repeat(auto-fit, minmax(min(100%, 440px), 1fr))`, gap 24px: a sinistra **Oggi**, a destra **Rinnovi in scadenza** e **Da assegnare** impilati (P6). Sotto, a tutta larghezza, **Distribuzione servizi**.
- Card: fondo `rgba(255,255,255,0.7)`, bordo `rgba(255,255,255,0.6)`, radius 28px, padding 24px.

## Card «Oggi»
- Titolo 20/600 + «1 di 7 svolte» (13, `outline`) + link a destra «Apri nel calendario →» (vista giorno di oggi).
- **Tutte** le sessioni cliente del giorno (P1: niente `slice(0,5)`; il conteggio del sottotitolo usa l'elenco completo).
- Riga (padding 12px, radius 18px; su schermi stretti le azioni vanno a capo sotto il nome): ora 700 + durata (12) · barretta 4×44px del colore della tipologia · avatar 40px · nome 600 · riga con icona tipologia, nome tipologia e chip di stato.
- **Stato calcolato dall'ora** (P3):
  - *Svolta* (`completed`): chip `success`; ora e barretta attenuate; pulsante «Annulla check-in» (icona `Undo2`).
  - *Assente* (`no_show`): chip `danger`; «Annulla assenza».
  - *Da confermare* (passata e ancora `scheduled`): chip `warning`, fondo riga `rgba(255,237,213,0.35)`; pulsante icona «Segna come assente» (`UserX`, 38px, bordato) + «Check-in» primario (`#005685`, testo bianco).
  - *In corso*: chip «In corso» primario, fondo riga `rgba(0,86,133,0.05)`; stessi pulsanti.
  - *Prossima*: chip «Prossima · tra 25 min» (entro 90 minuti) o «Prossima»; «Check-in» secondario (bianco, bordo `surface-variant`, testo primario).
  - *Successive*: nessun chip; «Check-in» secondario.
- **Check-in (P2)**: aggiorna subito la riga (non la toglie), disabilita solo quella riga durante il salvataggio, toast «Sessione di <Nome> segnata come svolta.» con «Ripristina» (riporta a `scheduled`). Assente: «Assenza registrata per <Nome>.». Clic sul nome → profilo.
- Giorno vuoto (O4): «Nessuna sessione in agenda oggi.» + link «Prossima: Lunedì 28 settembre alle 07:30 con Luca Verdi» che apre quella sessione nel calendario.

## Card «Rinnovi in scadenza» e «Da assegnare»
- Titolo 20/600 + contatore pill a destra: arancione solo se > 0, altrimenti neutro (`surface-container`, `outline`) (P7). Sotto il titolo una riga che spiega il criterio (12, `outline`): «Clienti con 2 crediti o meno, o con il blocco che scade entro 7 giorni.» / «Eventi importati da Google Calendar senza cliente.».
- Rinnovi: righe bianche (radius 20, bordo `surface-variant`): avatar, nome, «Abbonamento Mensile · **Il blocco scade tra 2 giorni**» (motivo in `warning-text` 600, da `getRenewalInfo`). Pulsante «Rinnova» → dialog Pacchetto già su «Rinnova lo stesso» (P5).
- Da assegnare: righe tratteggiate (`assign-soft`, bordo `#ffb77b` dashed): titolo Google, «sab 26 set · 08:00–09:00». Pulsante «Assegna» (fondo `#7c4302`) → dialog Assegna evento **in pagina** (P5).
- Vuoti: icona `CircleCheck` verde + «Nessun rinnovo nei prossimi 7 giorni.» / «Tutti gli eventi importati sono assegnati.».

## Card «Distribuzione servizi»
Titolo + «Dal 1° gennaio · N sessioni». Barra impilata alta 12px (segmenti col colore della tipologia, gap 2px) e legenda in griglia `minmax(190px,1fr)`: quadratino colore, nome 600, «312 · 68%».

## Accettazione
- Con 7 sessioni oggi il sottotitolo dice 7 e l'elenco ne mostra 7.
- Check-in → riga «Svolta», toast «Ripristina» riporta la sessione come prima; nessun'altra riga si disabilita.
- «Rinnova» e «Assegna» non cambiano pagina.
- Un cliente in scadenza qui lo è anche in Clienti e nel Profilo (stesso helper).
