# Passata 00 — Fondamenta

## Obiettivo
Preparare token, testi e helper che tutte le passate successive usano. Nessuna pagina cambia aspetto in modo evidente, ma dopo questa passata i nomi, i titoli e le regole di dominio sono unici.

## Punti audit
T1 (nomi), T2 (scala titoli), T3 (colori fuori token), T5 (conferme native), T6 (maiuscole), V1 (Ripristina), V2 (unità «crediti»), P4 (regola unica «in scadenza»).

## File del repo
- `src/styles.css` — nuovi token (vedi README › Design Tokens).
- `src/lib/` — nuovi helper (vedi sotto).
- Tutte le route `src/routes/trainer.*.tsx` e i componenti `src/components/*` del lato coach per testi e `confirm()`.
- `calendar-event-tile.tsx:346` e `trainer.clients.$id.tsx:489` — `confirm()` da sostituire.

## Cosa fare
1. **Token**: aggiungere `success-text/soft`, `warning-text/soft/line`, `danger-text/soft/line`, `assign-soft/line` in `@theme` e sostituire i valori scritti a mano del lato coach (`orange-50`, `emerald-50`, `#fff7ed`, `#92400e`, `#059669`, `#dc2626`, `#94a3b8`, `#f1f5f9`). Togliere l'emoji ⚠️ dal banner di esaurimento pacchetto (icona `TriangleAlert`).
2. **Componenti tipografici**: un `PageTitle` (H1 Sora 36/700, −0.02em, lh 1.15, `text-on-surface`) e una classe/variante per il titolo card (20/600). Usarli in tutte le pagine coach (oggi: 48px, 36px blu, 30px semibold, 26px).
3. **Testi (T1, T6)**: titolo scheda `<Pagina> · NC Calendar` (oggi «| NC Training Systems»); «Tipologie evento» → «Tipologie di sessione»; «I tuoi Clienti» → «Clienti»; «Calendario Master» → «Calendario»; maiuscole solo all'inizio («Aggiungi Cliente», «In Scadenza», «Salva Calendario», «Distribuzione Servizi», «Salva Modifiche», «Orario Settimanale», «Regole di Prenotazione», «Data Inizio Percorso», «Timeline del Percorso», «Sessioni da Revisionare», «Credenziali Generate»).
4. **Unità crediti (V2)**: formatter `formatCreditsLeft(n)` → «1 credito rimasto» / «N crediti rimasti» / «Crediti esauriti»; `formatCreditsOf(left, total)` → «6 di 13 rimasti» (singolare «1 di 1 rimasto»).
5. **Toast con Ripristina (V1)**: helper `toastWithUndo(message, onUndo)` su `sonner` con `action: { label: "Ripristina", onClick }`, `duration: 8000`. Mai «Annulla» come azione di un toast.
6. **Conferme (T5)**: sostituire ogni `confirm()` con `AlertDialog` (pattern già usato in `edit-booking-dialog.tsx`).
7. **Regola unica «in scadenza» (P4)**: helper `getRenewalInfo(client, currentBlock, allocations)` → `null` oppure `{ reason, remaining, daysLeft }`.
   - In scadenza se: **crediti residui del blocco in corso ≤ 2** oppure **il blocco in corso termina entro 7 giorni** (0–7).
   - Esclusi: archiviati, clienti liberi, percorsi conclusi (blocco finito e 0 residui).
   - `reason`: «Il blocco scade oggi» / «domani» / «tra N giorni» se vale la data, altrimenti il testo dei crediti (punto 4).
   - Ordinamento: prima per giorni alla scadenza, poi per crediti residui.
   - Da usare in Panoramica, lista Clienti (chip e tab) e Profilo. Riferimento: `renewalInfo` in `designs/nc-store.js`.
8. **Crediti del blocco in corso (L8, V6)**: helper `getCurrentBlockCredits(blocks, allocations)` → per tipologia `{ assigned, booked, left }` del **blocco in corso** (`quantity_assigned − quantity_booked`). Il credito si impegna alla prenotazione, quindi il check-in non cambia il residuo. Usare la logica «blocco corrente» oggi duplicata in 3 file (vedi audit tecnico del 21/09) estraendola in un helper unico.
9. **Presenza (V5)**: helper `getAttendance(bookings)` = svolte / (svolte + assenze + cancellazioni tardive) nelle ultime 8 settimane; `null` se nessuna sessione conclusa.

## Accettazione
- Nessun `confirm(` nel codice del lato coach.
- Nessun valore esadecimale di stato scritto a mano nelle route coach (grep su `#fff7ed|#059669|#dc2626|orange-50|emerald-50`).
- Tutti gli H1 coach usano `PageTitle`.
- Test unitari per `getRenewalInfo`, `formatCreditsLeft`, `getAttendance` (casi: 0/1/2/3 crediti, scadenza 0/1/7/8 giorni, cliente libero, archiviato).

## Fuori scope
Layout delle pagine (passate 03–09).
