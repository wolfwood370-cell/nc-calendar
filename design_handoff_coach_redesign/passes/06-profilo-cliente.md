# Passata 06 — Profilo cliente

## Obiettivo
Profilo diviso in tre sezioni, contatti a portata di mano, pianificazione che non perde modifiche.

## Punti audit
K1 (modifiche perse), K2 (sei sezioni impilate), K3 (storico), K4 (Limitazioni), K5 (spostare settimane), K6 (sessioni fuori percorso), K7 (contatti), P5.

## Riferimenti design
`designs/Coach Cliente.dc.html?id=giulia-bianchi` (+ `Coach Pacchetto`, `Coach Annulla Sessione`).


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/06-cliente-01-panoramica.png`
- `screenshots/06-cliente-02-percorso.png`
- `screenshots/06-cliente-03-sessioni.png`
- `screenshots/06-cliente-04-modifica-sessione.png`

## File del repo
`src/routes/trainer.clients.$id.tsx`, `trainer-bia-panel.tsx`, `coach-notes-card.tsx`, `timeline-week-row.tsx`, `timeline-booking-card.tsx`, `path-start-date-card.tsx`, `auto-renew-toggle-card.tsx`, `orphan-bookings-card.tsx`, `edit-booking-dialog.tsx`, `block-credits-dialog.tsx`.

## Search params
`tab=panoramica|percorso|sessioni` (predefinita panoramica); `tab=pacchetto` apre il dialog Pacchetto sulla panoramica.

## Intestazione (card bianca, radius 28)
Freccia indietro (→ Clienti, con controllo modifiche) · avatar 72px · nome come H1 36/700 · chip stato, piano, «Blocco 3 di 6» (o «Mese 2») · **contatti (K7)**: email (`mailto:`), telefono (`tel:`), «WhatsApp» (verde `#0b8043`). A destra: «Nuova sessione» (secondario → Calendario `?new=sessione&client=<id>`) e primario «Rinnova pacchetto» (se in scadenza) / «Gestisci pacchetto» / «Assegna pacchetto» (clienti liberi) → dialog Pacchetto. Il pulsante «Salva Calendario» in testata si toglie.

## Tab (K2)
Segmentato 36px «Panoramica · Percorso · Sessioni (badge arancione = sessioni fuori percorso)».

### Panoramica (due colonne `minmax(min(100%,420px),1fr)`)
- Sinistra:
  - **Pacchetto e percorso**: «Il blocco in corso termina il 18 ott 2026»; segmenti per blocco (passati primario, in corso `#5b8db8`, futuri `surface-variant`) + «Vedi il percorso»; barre crediti del blocco in corso «**3** di 5 rimasti»; se in scadenza banner arancione con il motivo e «Rinnova» (P5, dialog in pagina).
  - **Prossime sessioni** (3): data lunga + ora, tipologia, «Confermata» / «Da confermare»; clic → calendario sull'evento; link «Nuova sessione».
  - **Ultime sessioni** (5) con chip di stato; «Vedi tutte (N)» → tab Sessioni (K3); nota «Clic su una sessione per modificarla.».
- Destra:
  - **Note e obiettivi**: Obiettivo (`Target`), **Limitazioni** (`TriangleAlert`, campo modificabile, K4), Note private (textarea). Salvataggio automatico con stato «Salvataggio…» / «Salvato» / «Salvataggio automatico».
  - **Presenza**: «Presenza» % (colori come Clienti), «Assenze (8 sett.)», «Sessioni a settimana» (ultime 4 settimane) + «Ultima sessione svolta: …».
  - **Andamento BIA**: selettore compatto «Peso · Massa magra · Grasso»; valore ultimo (Sora 28/700) + variazione dalla prima misurazione (verde se nella direzione buona: peso/grasso in calo, massa in crescita); grafico a linea; «Aggiungi misurazione» (dialog: data ≤ oggi, peso obbligatorio, massa magra, grasso).

### Percorso
- Card riepilogo: «Inizio percorso: Lunedì 18 agosto 2026» · «Struttura: 6 blocchi da 4 settimane» · per abbonamenti interruttore «Rinnovo automatico» con «Nuovo blocco il …» / «Alla scadenza il cliente non potrà prenotare» · «Ripristina le date standard» (solo se ci sono settimane spostate; AlertDialog di conferma).
- Riga guida: «Cambia la data di una settimana per spostarla; le modifiche si salvano dalla barra in basso.».
- Blocchi espandibili (quello in corso aperto e bordato primario): «Blocco 3 · In corso · 22 set – 19 ott · 5 svolte · 11 in totale». Dentro, 4 colonne settimana: pill «Sett. 1» con **data modificabile direttamente** (K5), bordo primario se in corso, arancione se spostata; etichetta «Spostata · da salvare»; mini card sessione (barretta colore, «lun 22 set · 09:00», tipologia, chip stato) → modifica; «Nessuna sessione».
- **Barra di salvataggio (K1)** fissa in basso (fondo `#191c1f`, radius 20): «2 settimane modificate» · «Annulla modifiche» · «Salva calendario». Uscita con modifiche (sidebar, percorso, indietro, `beforeunload`): AlertDialog «Salvare le modifiche al percorso?» con «Resta qui», «Esci senza salvare», «Salva ed esci». Usare `useBlocker` di TanStack Router.
- Clienti liberi: «Nessun percorso a blocchi» + «Assegna un percorso».

### Sessioni
- **Sessioni fuori percorso (K6)** (ex «Sessioni da Revisionare»): card tratteggiata «Importate da Google e non collegate a un blocco. Collegale per scalare il credito, oppure ignorale.»; per riga «Collega al blocco in corso» / «Ignora».
- Filtro segmentato con conteggi: Tutte · Programmate · Svolte · Assenze · Annullate (include «Annullata tardi»).
- Elenco completo (K3): barretta colore, data e ora, tipologia, chip (Programmata, Svolta, Assente, Annullata, Annullata tardi `warning`), ›.
- **Modifica sessione** (dialog 540px): stato segmentato **Programmata · Svolta · Assente** (O1: «Annullata» non è più uno stato selezionabile); se annullata, riga «Sessione annullata, credito restituito.» / «…con credito addebitato.» + «Rimetti in agenda»; tipologia, data, ora, note del coach; in basso a sinistra «Annulla sessione» (rosso tenue) e link «Elimina» → dialog condiviso; a destra «Annulla» / «Salva».

## Dati e backend
- K4: nuova colonna per le limitazioni accanto all'obiettivo della tabella usata da `CoachNotesCard`.
- K5: la logica di spostamento settimane e `saveSchedule` esistono già; cambiano solo punto di modifica, stato «sporco» e protezione all'uscita.

## Accettazione
- Nessuna modifica al percorso si perde senza conferma.
- Il tab resta nell'URL; «Vedi tutte» porta alle Sessioni.
- Limitazioni si salvano e ricompaiono dopo il ricaricamento.
