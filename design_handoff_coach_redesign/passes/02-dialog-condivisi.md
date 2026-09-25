# Passata 02 — Dialog condivisi

## Obiettivo
Tre dialog usati da più pagine, costruiti una volta sola: assegnazione degli eventi Google, pacchetto/rinnovo, annullamento/eliminazione di una sessione.


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/03-panoramica-03-assegna-evento.png` (Assegna evento)
- `screenshots/03-panoramica-02-rinnovo.png` (Pacchetto · Rinnova lo stesso)
- `screenshots/02-dialog-02-pacchetto-nuovo-percorso.png` (Pacchetto · Nuovo percorso)
- `screenshots/04-calendario-03-annulla-sessione.png` (Annulla sessione, meno di 24 ore)

## Punti audit
P5 (azioni che portano altrove), O1 (annullare vs eliminare), O2 (una sola finestra di rinnovo), K6 parz.

## Riferimenti design
`designs/Coach Assegna Evento.dc.html`, `designs/Coach Pacchetto.dc.html`, `designs/Coach Annulla Sessione.dc.html`.

## 1. Assegna evento (sostituisce `review-booking-dialog.tsx`)
Aperto da Panoramica («Assegna»), Calendario (tile tratteggiato) e — dove serve — da `?reviewEventId`. Resta montato nel layout `/trainer` come oggi.
- Larghezza 560px. Titolo «Assegna evento»; sotto: «Titolo Google · ven 26 set, 08:00–09:00» e «Importato da Google Calendar» (12, `outline`).
- **Tre modalità** (card radio, 3 colonne): «Sessione cliente» (`User`), «Consulenza esterna» (`MessageCircle`, «Per chi non è cliente. Nessun credito.»), «Impegno personale» (`Coffee`, «Tempo tuo, non collegato a nessuno.»). Sostituiscono i pulsanti «Impegno Personale» / «Consulenza» di oggi (stessa RPC `mark_booking_special`).
- Modalità cliente: ricerca + elenco clienti (max 196px con scroll, riga con avatar, nome, piano, radio); se il titolo dell'evento contiene nome o cognome di un cliente lo si preseleziona e si mostra «Suggerito dal titolo dell'evento» (logica già presente in `calendar-gcal-review.tsx › openImport`). Tipologia a chip con pallino colore. Casella «Scala un credito dal pacchetto» con testo che dice quanti crediti di quella tipologia ha il cliente; disabilitata se 0.
- Pulsante: «Assegna» / «Segna come consulenza» / «Segna come personale». Toast con «Ripristina».

## 2. Pacchetto (sostituisce il rinnovo della Panoramica e `assign-package-dialog.tsx` nel profilo)
Aperto da Panoramica «Rinnova» (già su «Rinnova lo stesso») e dal Profilo («Rinnova pacchetto», «Assegna pacchetto», banner di esaurimento). Larghezza 580px. Titolo «Pacchetto di <Nome>», sotto il piano.
- Tre scelte (card radio): **Rinnova lo stesso** (non per clienti liberi) · **Crediti extra** · **Nuovo percorso**.
- *Rinnova lo stesso*: riquadro con «Nuovo blocco: 5 ott 2026 – 1 nov 2026» (dal giorno dopo la fine del blocco in corso, 28 giorni) e l'elenco crediti per tipologia («8 crediti», «1 credito»); nota «Il cliente può prenotare le sessioni del nuovo blocco da subito. I N crediti residui restano validi fino alla fine del blocco in corso.».
- *Crediti extra*: tipologia a chip + quantità con −/+ (1–30). Nota «Si aggiungono ai crediti disponibili del cliente.».
- *Nuovo percorso*: segmentato «Percorso fisso / Abbonamento mensile»; per il fisso «Numero di blocchi» −/+ (1–24) «da 4 settimane»; «Crediti per blocco» con −/+ per tipologia; nota «Inizia il <data>. Le sessioni già prenotate restano in calendario.». Disabilitato se 0 crediti.
- Pulsante: «Rinnova» / «Aggiungi crediti» / «Assegna percorso». Toast con «Ripristina».
- Backend: riusare `assignPackage` di `trainer.clients.$id.tsx` (inserimento blocchi/allocazioni) ed `extra_credits`.

## 3. Annulla o elimina sessione (O1)
Aperto dal pannello del Calendario e dal dialog di modifica sessione del Profilo. `AlertDialog` 460px.
- **Annulla sessione** (la sessione non si terrà; resta nello storico):
  - Titolo «Annullare la sessione di <Nome>?»; riga «Giovedì 1 ottobre · 10:00–11:00 · Test funzionale».
  - Se mancano più di 24 ore: «Il credito torna disponibile per <Nome> e l'evento viene rimosso da Google Calendar. Nello storico resta come «Annullata».» → stato `cancelled`.
  - Se mancano meno di 24 ore o la sessione è già iniziata/passata: testo «Mancano meno di 24 ore.» / «La sessione è già iniziata o passata.» + «Scegli cosa fare con il credito: l'evento viene comunque rimosso da Google Calendar.» e due opzioni radio: **Restituisci il credito** (predefinita; «Annulli tu o per un motivo valido del cliente.») → `cancelled`; **Addebita il credito** («Cancellazione tardiva: la sessione conta come usata.») → `late_cancelled`.
  - Pulsanti «Indietro» / «Annulla sessione» (rosso `danger-text`). Toast «Sessione annullata, credito restituito.» / «…credito addebitato.» con «Ripristina».
- **Elimina** (solo per sessioni inserite per errore): titolo «Eliminare la sessione di <Nome>?»; testo «Usa questa azione solo per sessioni inserite per errore: sparisce da calendario, storico e Google Calendar, e non conta per crediti e presenza. Se la sessione semplicemente non si terrà, annullala.». Pulsante «Elimina sessione». Backend: flusso «elimina ovunque» esistente (`deleteBookingEverywhere`).
- **Impegno personale**: «Eliminare l'impegno «Titolo»?» · «Lo slot torna libero per le prenotazioni. L'evento viene rimosso anche da Google Calendar.» · «Elimina impegno».
- Backend: `cancel_booking` oggi rimborsa sempre; per «Addebita» aggiungere un parametro (es. `p_charge boolean`) o una RPC coach che imposti `late_cancelled` senza rimborso. Verificare che `late_cancelled` conti come usato nei contatori (`quantity_booked`) e nella presenza.

## Accettazione
- I tre dialog sono componenti unici in `src/components/` e non esistono più copie per pagina.
- Nessun percorso porta fuori pagina per assegnare o rinnovare.
- Annullare con < 24 h mostra la scelta del credito; > 24 h no.
