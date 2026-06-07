# Piano: refactor area Trainer

Lavoro suddiviso in 6 interventi indipendenti. Ognuno è una piccola PR mentale: posso eseguirli in sequenza nello stesso turno di build o splittare. Niente modifiche al backend tranne dove indicato (nessuna serve davvero).

## 1. Panoramica (`/trainer`) — semplificata

File: `src/routes/trainer.index.tsx`

Cambiamenti:
- **Rimuovo** la sezione "Crediti in Scadenza" (blocco `expiring` + JSX, e l'intero `useMemo` collegato).
- **Rimuovo** la striscia "Quick Stats" in basso (Clienti Attivi / Sessioni Mese / Crediti Emessi / Nuovi 30gg) e con essa: `QuickStat` import, `useQuery newClientsQ`, `stats` useMemo, import `thirtyDaysAgo`, `Users/CalendarCheck2/Wallet/UserPlus`.
- **Cambio finestra "Distribuzione Servizi"**: oggi è "questo mese", diventa **dal 1° gennaio dell'anno corrente** (YTD). Aggiungo helper `startOfYear()` in `src/lib/date-windows.ts` (o inline) e aggiorno l'etichetta della card in "Distribuzione Servizi (dal 1° gen)".
- **Mostra anche il numero di eventi**, non solo la percentuale: per ogni voce rendo `Nome — N eventi (XX%)` e tolgo il limite `.slice(0, 5)` (oppure lo alzo a 10) così si vede la distribuzione completa.
- Layout: la colonna destra resta con la sola card "Distribuzione Servizi"; sinistra resta la lista "Oggi" (appuntamenti del giorno) invariata. Su mobile la vista resta com'è (già mostra solo today + next event, niente quick stats).

## 2. Calendario (`/trainer/calendar`) — versione compatta + dialog inline

File principali: `src/routes/trainer.calendar.tsx`, `src/components/calendar-event-tile.tsx`, `src/components/calendar-header.tsx`. Nuovo: `src/components/calendar-event-dialog.tsx`.

Cambiamenti:
- **Vista compatta**: riduco `HOUR_HEIGHT` da 64→44px e abbasso l'altezza minima della tile; il colore di sfondo della tile resta quello dell'event type (`et.color`) — già supportato.
- **Hover tooltip**: avvolgo `CalendarEventTile` in un `Tooltip` (shadcn `tooltip` già installato) che mostra ora inizio/fine, cliente, tipo evento, durata, note rapide.
- **Filtri per tipo evento sopra il calendario**: estendo `CalendarHeader` con una riga di chip/toggle che elenca gli `eventTypes` del coach + le categorie speciali ("Personali", "Esterni Google", "Da assegnare"). Stato `selectedTypeIds: Set<string>` nel parent. Sostituisce/affianca gli attuali toggle `onlyPT` / `onlyToAssign`. La logica filtro nel `useMemo` di `timedByDay/allDayByDay` viene aggiornata di conseguenza.
- **Dialog di modifica inline**: cliccando su una tile **non** si naviga via, si apre un `Dialog` shadcn sopra il calendario con form completo (data/ora, durata, tipo evento, cliente, note coach, status, link meet). On save → `supabase.from("bookings").update(...)` + `qc.invalidateQueries`. Sostituisce l'attuale `openReview` che usava `?reviewEventId` (lo lascio funzionante in parallelo per la riconciliazione Google, oppure rinomino il dialog di review come "dialog assegnazione" e aggiungo un nuovo "dialog modifica" per click su evento già assegnato).
- **Mantengo**: la card `CalendarGcalReview` (riconciliazione eventi sincronizzati) e il bottone refresh nell'header che già forza `runReconcile()`.
- **Aggiungo nell'header l'orario dell'ultima sincronizzazione**: leggo `localStorage.getItem("gcal_reconcile_last")` (già usato per il throttle) e lo mostro come "Ultima sync: HH:MM" accanto al bottone refresh. Aggiorno il valore ad ogni `runReconcile` riuscito (già fatto via `setItem`).

## 3. Clienti (`/trainer/clients`) — schede invece di tabella

File: `src/routes/trainer.clients.index.tsx`, `src/routes/trainer.clients.$id.tsx`.

Cambiamenti su `/trainer/clients`:
- Sostituisco la `Table` principale con una **grid di card cliente** (CSS grid responsive 1/2/3 colonne). Ogni card: avatar/initiali, nome, email, badge stato (active/paused), una riga riassuntiva "Percorso: 6 mesi · 3 sessioni residue" o "Free Session — 1 credito" (calcolata dai dati già caricati da `useCoachBlocks` / `useCoachExtraCredits`), e menu `ClientCardMenu` (già esistente) nell'angolo.
- Tutta la card è cliccabile → `<Link to="/trainer/clients/$id" params={{ id }}>`. Mantengo ricerca + tab status già presenti.
- Mantengo `PendingInvitationsCard`, `CreateClientDialog`, `InviteClientDialog`, `CredentialsDialog`.

Cambiamenti su `/trainer/clients/$id` (già esiste, 1238 righe — verifico cosa mostra già):
- **Audit veloce in build mode** poi miglioro per assicurare la presenza di queste sezioni:
  1. Anagrafica (nome, email, telefono, data inizio percorso, auto-renew).
  2. **Servizi attivi** raggruppati per tipo:
     - Percorsi a durata fissa (3/6/12 mesi o custom) → `training_blocks` con `path_type` di profilo `fixed`.
     - Programmazioni avanzate con rinnovo mensile → `path_type='recurring'`.
     - Clienti liberi: Free Session + PT Pack (3 sessioni) → `path_type='free'` + `extra_credits` (event_type_id corrispondente).
     - Crediti extra per qualsiasi event_type creato in `event_types`.
  3. **Appuntamenti**: due liste — passati (status `completed`/`cancelled`) e futuri (`scheduled`), ordinati per data, con tipo evento + colore.
- Per ogni riga, link/click apre lo stesso dialog di modifica costruito al punto 2.

## 4-6. Tipologie evento, Disponibilità, Integrazioni
Nessuna modifica.

## 7. Rimozione pagina Segnalazioni

- Cancello `src/routes/trainer.bug-reports.tsx`.
- Rimuovo la voce `{ title: "Segnalazioni", url: "/trainer/bug-reports", icon: Bug }` da `src/components/trainer-sidebar.tsx` (e l'import `Bug` se non usato altrove).
- Il routeTree viene rigenerato automaticamente da Vite.

## 8. Rimozione bottone FAB segnalazione bug

- Rimuovo `import { BugReportFAB }` e il rispettivo `<BugReportFAB />` da `src/routes/__root.tsx`.
- Cancello `src/components/bug-report-fab.tsx`.
- Lascio la tabella `bug_reports` nel DB intatta (nessuna migration) — storico preservato; se vuoi posso aggiungere uno step di drop table.

## Note tecniche

- Nessuna migration SQL richiesta per i punti 1-3, 7, 8. Tutti i dati necessari (blocks, allocations, extra_credits, bookings, event_types) sono già esposti dalle query esistenti (`useCoachBlocks`, `useCoachBookings`, `useCoachExtraCredits` se esiste, altrimenti la aggiungo lato client).
- Il dialog di modifica evento usa solo `supabase.from('bookings').update(...)` — RLS già permette al coach proprietario.
- Per gli helper `startOfYear` aggiungo una funzione pura in `src/lib/date-windows.ts`.
- Tooltip su mobile: il `Tooltip` shadcn non funziona bene al tap; su mobile il tap apre direttamente il dialog di modifica, quindi nessun tooltip serve sotto md.

## Domande aperte prima di implementare

Una sola, per non sbagliare scope sul punto 3:

**Sul dettaglio cliente** (`/trainer/clients/$id`) preferisci che:
- (a) faccia un **audit** della pagina esistente e tocchi solo quello che manca rispetto ai requisiti (anagrafica + servizi attivi raggruppati + appuntamenti passati/futuri), oppure
- (b) la **ricostruisca da zero** con un layout pulito a sezioni, anche se significa perdere alcune view già presenti?

Se non specifichi, vado con (a) — meno invasivo.
