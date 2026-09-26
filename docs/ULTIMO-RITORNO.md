# Ultimo ritorno · Redesign coach, passata 04 (Calendario)

26/09/2026. Brief: `design_handoff_coach_redesign/passes/04-calendario.md`, prototipo `designs/Coach Calendario.dc.html`. Audit: C1–C6, T4, T5.

## Ramo e hash

- **Ramo pubblicato:** `redesign/coach-04-calendario`, col primo push, `git push origin HEAD:redesign/coach-04-calendario`.
- **Base:** `git rev-parse origin/main` = `ec0331e6328203b73e7742256e4769438c0f4d25`, come atteso (merge della PR #69). Il ramo l'ho creato da lì, prima di ogni modifica.
- **Commit, in ordine:**
  1. `73ab5c9` helper puri e test: URL, filtri, ora, disponibilità, creazione e modifica dal coach, finto archivio in memoria;
  2. `437e787` dialog «Nuova sessione» / «Modifica sessione»;
  3. `138f2dd` sincronizzazione con Google in un hook condiviso;
  4. `e223012` Calendario desktop: testata, griglia, pannello dettagli, route. Qui si toglie il vecchio dialog di modifica;
  5. `5904b05` Integrazioni: riconciliazione e «Sincronizza tutto»;
  6. `7ab1e58` Panoramica: «Apri nel calendario» in vista giorno;
  7. `34292c8` CHECKLIST;
  8. questo file, in un commit a parte, per ultimo.
- **Come ho committato:** file aggiunti per nome, mai `git add -A` o `git add .`. Prima di ogni commit ho rimesso `bun.lock` com'era (`git checkout -- bun.lock`).
- **Typecheck commit per commit.** L'ho verificato in una copia di lavoro separata: `tsc --noEmit` esce con 0 su tutti e sei i commit di codice.
- **Un incidente, corretto prima del push.** L'eliminazione di `calendar-event-edit-dialog.tsx`, già in stage, era finita nel commit 1, e quel commit non compilava. Ho ricostruito i commit 1–4 con gli stessi messaggi e l'eliminazione nel 4. L'albero finale non cambia. Il ramo non era ancora pubblicato.

## PR

https://github.com/wolfwood370-cell/nc-calendar/pull/70: verso `main`, aperta, non in bozza, **non** unita. `gh` non c'è nella VM, quindi l'ho aperta con lo strumento GitHub della sessione.

## Manifesto

**NUOVI (23)**

- Helper puri e test (`src/lib/`):
  - `calendar-search.ts` + test: parametri dell'URL, periodo, frecce, etichetta del periodo, filtri esclusivi;
  - `calendar-time.ts` + test: griglia 07–22, ora del clic al quarto d'ora, disponibilità con le eccezioni, sovrapposizioni;
  - `calendar-events.ts` + test: tipo di evento, filtri, tile, «non su Google», stato e righe del pannello;
  - `session-create.ts` + test: credito previsto, creazione della sessione cliente e dell'impegno, messaggi per il coach;
  - `session-edit.ts` + test: modifica di data, ora, tipologia, durata e note, e il suo «Ripristina».
- Resto di `src/lib/`:
  - `calendar-store.ts`: lo store Supabase della creazione e della modifica;
  - `all-day-event.ts`: `isAllDayEvent`, spostato qui invariato da `mobile-calendar-agenda.tsx`;
  - `testing/memory-calendar-store.ts` e `testing/calendar-seed.ts`: finto archivio per i test, con l'ordine dei trigger d'inserimento, `reschedule_booking` e l'ora fissa del 25/09/2026 10:40.
- Componenti:
  - `calendar-desktop.tsx`: il Calendario desktop;
  - `calendar-mobile.tsx`: il Calendario del telefono, estratto invariato dalla vecchia route;
  - `calendar-toolbar.tsx`: la testata;
  - `calendar-grid.tsx`: la griglia;
  - `calendar-details-panel.tsx`: il pannello dettagli;
  - `session-form-dialog.tsx`: i dialog di creazione e modifica;
  - `segmented-control.tsx`: i segmentati;
  - `gcal-full-sync-button.tsx`: «Sincronizza tutto dal 1° gen».
- `src/hooks/use-gcal-sync.ts`: la riconciliazione all'apertura e il sync completo, estratti invariati.

**MODIFICATI (11)**

- `src/routes/trainer.calendar.tsx`:
  - `validateSearch` passa a `parseCalendarSearch`;
  - sotto md monta `CalendarMobile`, da md in su `CalendarDesktop`;
  - una sola sincronizzazione all'apertura per tutti e due.
- `src/components/calendar-event-tile.tsx`, `calendar-days-header.tsx`, `calendar-all-day-strip.tsx`: riscritti per la griglia nuova. Li usava solo la griglia desktop.
- `src/components/mobile-calendar-agenda.tsx`: tolta la definizione di `isAllDayEvent`, che ora sta in `src/lib/all-day-event.ts`. Nient'altro.
- `src/components/calendar-gcal-review.tsx`: solo l'import di `isAllDayEvent` (:44).
- `src/lib/credit-order.ts`: aggiunto `pickInsertAllocation`, l'ordine del trigger d'inserimento.
- `src/routes/trainer.integrations.tsx`: sotto la card di Google Calendar, `CalendarGcalReview` e «Sincronizza tutto», così com'erano.
- `src/components/overview-desktop.tsx:265`: `search={{ date: today, view: "day" }}`.
- `design_handoff_coach_redesign/CHECKLIST.md`: la 04 passa a `[x]`.
- `docs/ULTIMO-RITORNO.md`: questo file.

**ELIMINATI (1)**

- `src/components/calendar-event-edit-dialog.tsx`. Lo sostituisce «Modifica sessione». Nessun altro file lo importava.

**NON TOCCATI**

- **Niente database, lock, dipendenze, tipi generati o CI.** `git diff origin/main..HEAD --stat -- supabase/ bun.lock package.json src/integrations/supabase/types.ts .github` è vuoto (0 righe).
- **Altri file:** `src/routes/client.*`, `trainer-header.tsx`, `trainer-bottom-nav.tsx`, `calendar-header.tsx`, `calendar-context-panel.tsx`, `focus-client-panel.tsx`, `trainer-notifications-bell.tsx`.
- **Il telefono resta com'era.** A 390 px ho confrontato 5 stati, due giri su `origin/main` e due sul ramo, con lo stesso finto backend e l'ora fissa. I risultati sono nella tabella sotto:
  - **impronta del DOM visibile** (per ogni elemento mostrato: tag, riquadro, testo e stili che si vedono): identica in tutti i giri;
  - **hash del PNG a pagina intera:** uguale su 1, 2, 4 e 5. Sul 3 cambia da un giro all'altro anche fra due giri di `origin/main`: sono pixel di antialiasing ai bordi arrotondati. L'ho verificato con una differenza pixel per pixel, 102 pixel sparsi. Gli hash del 3 visti sul ramo (`053131cb…`) sono gli stessi visti sulla base.

  | stato | DOM base (2 giri) | DOM ramo (2 giri) |
  |---|---|---|
  | 1 · settimana di oggi | `741b0e2cead045c8` | `741b0e2cead045c8` |
  | 2 · link di notifica `?date=2026-09-29&event=…` | `d0f978c9d30b08d3` | `d0f978c9d30b08d3` |
  | 3 · `?new=sessione` (menu «Nuovo») | `741b0e2cead045c8` | `741b0e2cead045c8` |
  | 4 · Focus Cliente nello Sheet | `8bed252100f55857` | `8bed252100f55857` |
  | 5 · settimana successiva | `9dd877bc5f487a4a` | `9dd877bc5f487a4a` |

  Dal confronto ho escluso solo il `<div class="md:hidden">`, trasparente, che sul ramo avvolge l'albero del telefono. Prima di ogni scatto la pagina torna in posizione 0,0: a 390 px sfora di 24 px (`-m-6`) anche su `origin/main`, e a volte restava scorsa in orizzontale.

## Ambiente

- **Dipendenze:** installate da `bun.lock`. Ho riscritto in locale il registro di Lovable verso `registry.npmjs.org`, poi `bun install --frozen-lockfile` (Bun 1.3.11) ha dato «Checked 724 installs across 846 packages (no changes)». Poi ho rimesso `bun.lock` com'era.
- **Browser:** la Chromium di Playwright preinstallata (`/opt/pw-browsers`), senza download.
- **Finto backend:** quello delle passate 02 e 03, esteso per la 04. Ora applica:
  - il trigger della durata;
  - i trigger d'inserimento su blocchi ed extra;
  - `reschedule_booking` lato coach;
  - il vincolo di non sovrapposizione;
  - `trainer_availability` e `availability_exceptions`.

  Vive nella cartella di lavoro della sessione, non nel repo. Nessuna richiesta è uscita verso Supabase o Google: il banco le conta, zero.

## Controlli

Base (`ec0331e`) e fine (`7ab1e58`, ultimo commit di codice), stessi comandi e stesso ambiente.

| | Base | Fine |
|---|---|---|
| build (`npm run build`) | esce con 0: `✓ built in 12.57s`, `3.07s`, `12.95s` | esce con 0: `✓ built in 10.46s`, `3.69s`, `11.70s` |
| typecheck (`npx tsc --noEmit`) | 0 errori | 0 errori |
| lint (`npx eslint .`) | `✖ 24 problems (0 errors, 24 warnings)` | `✖ 22 problems (0 errors, 22 warnings)` |
| test (`npx vitest run`) | `Tests  223 passed (223)`, 16 file | `Tests  297 passed (297)`, 21 file |

**Lint.** Rispetto alla base:

- spariscono i 4 avvisi della vecchia `trainer.calendar.tsx`;
- in `calendar-mobile.tsx`, che è lo stesso codice spostato, ne restano 3;
- `mobile-calendar-agenda.tsx` scende da 4 a 3.

**Test.** I 74 test nuovi:

- `session-create`: 14;
- `session-edit`: 12;
- `calendar-search`: 14;
- `calendar-time`: 20;
- `calendar-events`: 14.

## Ricognizione del §4

**1. Impegni personali e consulenze esterne.** Prima di questa passata l'app non creava impegni da zero. Li otteneva in due modi:

- **`mark_booking_special`** (`supabase/migrations/20260522204517_…sql:391-435`) marca un evento esistente: `is_personal = true`, `category` a `personal` o `consulenza`, `client_id`, `block_id` ed `event_type_id` a NULL (:429).
- **`gcalImportEvent`** (`src/lib/gcal.functions.ts:779-894`) importa da Google. Il modo `consulenza` scrive `client_id = coachId` per saltare il trigger dei crediti (:878-886), `category = 'consulenza'` e `is_personal = false` (:864-870).

Quindi i tile «consulenza esterna» sono `category = 'consulenza'` oppure `client_id = coach_id` non personale (`calendar-events.ts`, `eventKind`).

«Nuovo impegno» scrive quello che scrive `mark_booking_special` per un impegno: `is_personal = true`, `category = 'personal'`, senza cliente, blocco né tipologia (`session-create.ts:248-249`). L'evento Google lo crea lo stesso percorso della 02 (`createGoogleEvent`).

**2. Cosa blocca il coach** (`reschedule_booking`, `20260827143053_…sql:139-298`).

- Il coach può chiamarla: il controllo di :178-180 accetta `coach_id = auth.uid()`.
- Rifiuta le sessioni non programmate o eliminate (:183-184).
- Rifiuta impegni, eventi senza cliente e quelli col coach come cliente (:186-187, «non e riprogrammabile dal cliente»). Per questi la modifica fa un `update`.
- Rifiuta la stessa ora (:191): se l'ora non cambia, il form non la chiama.
- Il credito della nuova data lo prende da tutti i blocchi del cliente, e se manca dà «Credito esaurito per la nuova data. Acquista un Booster.» (:275). Il coach vede invece «Il cliente non ha più crediti per questa tipologia: la sessione non è stata salvata.» (`coachWriteError`).
- `zz_trg_revalidate_client_reschedule` (`20260606120000_…sql:94-112`, trigger a :411-414) e `a_trg_enforce_client_booking_insert` (`20260605222541_…sql:52-53`) escono subito per il ruolo coach.
- **Il vincolo che conta per il brief** è `bookings_no_overlap_per_coach` (`20260522204517_…sql:147-150`): due eventi `scheduled` non possono sovrapporsi, impegni ed eventi da assegnare compresi. È il motivo per cui l'avviso di sovrapposizione blocca (vedi Divergenze).
- **Trigger della durata** (`20260814102120_…sql:26-28`): con una tipologia, senza evento Google e con durata 60 (o vuota), il server salva la durata della tipologia.

**3. Conferma e note.**

- **Conferma di presenza:** `bookings.client_confirmed_at` (`src/lib/queries.ts:46`, letta con `BOOKINGS_COLS_FULL_CONFIRM` :149-151).
- **Note della sessione:** `bookings.trainer_notes`.
  - Le scriveva il vecchio dialog di modifica (`calendar-event-edit-dialog.tsx:73,91` su `origin/main`).
  - Il cliente le vede nel dettaglio della sessione (`src/components/client-booking-detail-view.tsx:284-286`, «Note del Coach»).
  - `use-coach-notes.ts` è un'altra cosa: `coach_client_notes`, note sul cliente e non sulla sessione.

  «Note del coach» e «Nota dell'ultima sessione» usano quindi `trainer_notes`.

**4. Disponibilità ed eccezioni.**

- `trainer_availability.day_of_week` va da 1 = lunedì a 7 = domenica (`src/lib/booking-slots.ts:36`).
- `availability_exceptions` con `start_time`/`end_time` vuoti chiude tutto il giorno (`booking-slots.ts:13`, `queries.ts:51-58`).
- Le letture ci sono già: `useCoachAvailability` (`queries.ts:382`) e `useCoachAvailabilityExceptions` (`queries.ts:607`).
- `get_coach_busy` serve le prenotazioni occupate al lato cliente e non guarda la disponibilità: il coach non la usa.
- Il calcolo del tratteggio e dell'avviso sta in `calendar-time.ts`, `closedRanges` e `isWithinAvailability`, in ora locale come le fasce che vedono i clienti.

**5. File condivisi col telefono.** `mobile-calendar-agenda.tsx` esporta:

- `DAY_LABELS` (:8);
- `IMPORT_PREFIX` (:18);
- `AllDayPill` (:48);
- `personalBlockTitle` (:89);
- `sameDay` (:101);
- `MobileAgendaView` (:136).

L'unico helper spostato è `isAllDayEvent` (era a :17 su `origin/main`), con la stessa regex. Ho aggiornato i tre file che lo importavano: `calendar-mobile.tsx`, `calendar-gcal-review.tsx`, `calendar-events.ts`. La prova che il telefono non cambia è nel Manifesto.

## La strada scelta per la tipologia

**Il credito si sposta.** Cambiando tipologia a una sessione che ha un credito:

- si trova il credito da rendere, nell'ordine della 02;
- si calcola quello da prendere per la tipologia nuova, nell'ordine del trigger, su tutti i blocchi del cliente;
- si aggiornano tipologia e blocco della sessione con una scrittura condizionata;
- si prende il credito nuovo (`moveCredit +1`) e si rende il vecchio (`moveCredit −1`) (`session-edit.ts`, `retype`, :248).

Se la presa fallisce, la sessione torna com'era. Se fallisce la restituzione, il toast lo dice. Senza credito della tipologia nuova il dialog lo dice prima di salvare e offre «Pacchetto»: non cambia niente, nemmeno la data.

«Ripristina» rimette tipologia, crediti, data, durata e note. Se nel frattempo il credito di prima è stato usato, o la sessione è cambiata, lo dice e non tocca niente.

**Perché:** bloccare la tipologia avrebbe tolto al coach una correzione normale (PT prenotato come BIA). Le scritture condizionate e il «Ripristina» della 02 coprono il caso. Le prove: `session-edit.test.ts`, «il credito si sposta», «senza credito della tipologia nuova…», «data, tipologia, durata e note tornano com'erano, crediti compresi». Nel browser: Paolo 30/09, PT 3→2 e BIA 1→2, poi di nuovo 3 e 1.

## Prove rosse

Ogni difetto l'ho messo nel file e poi l'ho tolto rimettendo la copia originale. Ho rifatto il test anche col codice giusto.

**1. Senza il controllo del credito prima di salvare** (`session-create.ts`: `if (!plan && false) throw new NoCreditError(…)`)

```
× nessun credito: niente inserimento e il messaggio per il coach
AssertionError: expected a thrown error to be NoCreditError: Luca non ha crediti Person…
      Tests  1 failed | 13 passed (14)
```

Col codice giusto: `Tests  14 passed (14)`.

**2. Data e ora di una sessione cliente con un `update` invece di `reschedule_booking`** (`session-edit.ts`: `if (isClient && false) { await store.rescheduleSession(…) }`)

```
× sessione cliente: passa da reschedule_booking e il credito segue la settimana
AssertionError: expected [] to have a length of 1 but got +0
× solo data: il credito torna sulla sua settimana
AssertionError: expected +0 to be 1 // Object.is equality
      Tests  2 failed | 10 passed (12)
```

La seconda cade proprio sul credito: con un `update` non si sposta sulla settimana nuova. Col codice giusto: `Tests  12 passed (12)`.

**3. «Da assegnare» e «Personali» insieme** (`calendar-search.ts`: `personal` tiene `assign: prev.assign`)

```
× «Da assegnare» e «Personali» non stanno mai insieme
AssertionError: expected [ true, true ] to deeply equal [ false, true ]
      Tests  1 failed | 13 passed (14)
```

Col codice giusto: `Tests  14 passed (14)`.

**4. Arrotondamento per difetto invece che al quarto d'ora più vicino** (`calendar-time.ts`: `Math.floor` al posto di `Math.round`)

```
× clic alle 10:08 → 10:15   (expected '10:00' to be '10:15')
× clic alle 10:38 → 10:45   (expected '10:30' to be '10:45')
× clic alle 10:53 → 11:00
      Tests  3 failed | 17 passed (20)
```

Col codice giusto: `Tests  20 passed (20)`.

**5. Disponibilità che ignora le eccezioni** (`calendar-time.ts`: `if (blocked && false) return false;`)

```
× un'eccezione che tocca la fascia la chiude        (expected true to be false)
× un'eccezione senza orari chiude tutto il giorno   (expected true to be false)
      Tests  2 failed | 18 passed (20)
```

Col codice giusto: `Tests  20 passed (20)`.

## Verifica nel browser

Il banco ha lo stesso seme della 03, simile al prototipo: 11 clienti, 4 tipologie, 6 eventi da assegnare. Ora fissa venerdì 25/09/2026 10:40 a Roma. Viewport 1440×900, poi 390×844. Tutto è segnato su Google tranne una sessione (la BIA di Andrea dell'01/10), come nel prototipo. **61 controlli, 61 OK, 0 KO.**

**Accettazione**

- **Link di notifica:** `?date=2026-09-29&event=<id>` apre «28 set – 4 ott 2026» col pannello su Giulia Bianchi, «Martedì 29 settembre · 09:00–10:00», e il tile selezionato. Con solo `?event=<id>` apre la settimana dell'evento.
- **«Da assegnare» e «Personali»:** «Personali» spegne «Da assegnare» (`filter=personal`, «Da assegnare» `aria-checked=false`). Una tipologia riporta su «Tutti».
- **Nessun `confirm()`:** 0 dialog nativi in tutto il giro, e `grep confirm(` sui file del Calendario è vuoto.
- **Nessun pannello vuoto:** all'apertura il pannello non c'è; Esc e ✕ lo chiudono e tolgono `event`.
- **Toast con «Ripristina»:**
  - creazione: «Sessione creata per Luca Verdi.» → «Ripristina» elimina la sessione e rende il credito (5 → 4);
  - modifica di data: `reschedule_booking` chiamata, 29/09 09:00 → 01/10 11:00, «Ripristina» la riporta (seconda chiamata);
  - modifica di tipologia: sopra;
  - annullamento dal pannello (dialog 02): il pannello resta con «Annullata», «Ripristina» la rimette programmata.

**Creazione**

- **Con credito.** Clic su martedì 29 alle 11:00, Luca Verdi, Personal Training. La riga ha coach, cliente, tipologia, `scheduled`, `client_session` e il blocco di Luca. Il trigger ha preso il credito (4 → 5), l'evento Google è creato e il pannello si apre sulla sessione nuova.
- **Senza credito.** `?new=sessione&client=<Chiara>&date=2026-09-29`: il dialog si apre e `new` e `client` spariscono dall'URL. Compare «Chiara non ha crediti Personal Training disponibili.», «Crea sessione» è disabilitato e nessuna riga viene scritta. «Pacchetto» apre il dialog della 02.
- **Impegno.** «Dentista» sabato 26 alle 09:00: `is_personal = true`, `category = personal`, senza cliente né blocco.
- **Avvisi.**
  - Il clic su giovedì 24 alle 16:12 propone 16:15.
  - Con Luca compare «È fuori dalla tua disponibilità…»: l'eccezione di giovedì pomeriggio.
  - Venerdì 25 alle 09:30 compare «Si sovrappone a Giulia Bianchi (09:00–10:00).» e il salvataggio è disabilitato.

**Il resto**

- **Griglia.** Linea dell'ora solo su venerdì 25. Vista giorno «Venerdì 25 settembre 2026» con la linea. Il clic sull'intestazione di giovedì apre il giorno.
- **Disponibilità.** Tratteggia anche l'eccezione: giovedì ha una fascia chiusa in più di mercoledì.
- **Filtri.** Con Test funzionale nella settimana dopo compare il banner «Nessun evento con questi filtri…»; «Rimuovi filtri» toglie `types` e `filter`.
- **Frecce.** ← → cambiano settimana e sono ignorate col focus sul segmentato.
- **Check-in dal pannello.** Check-in e «Annulla check-in» su Giulia di oggi.
- **Da assegnare.** Il tile da assegnare apre «Assegna evento», senza pannello. «Da assegnare 6» è uguale al badge della sidebar (6).
- **Google.** Chip «1 sessione non è su Google» → popover → «Ricrea su Google»: l'evento viene creato e il chip sparisce.
- **Panoramica e Integrazioni.** Da Panoramica, «Apri nel calendario» apre `view=day`. Integrazioni mostra «Riconciliazione Google Calendar» e «Sincronizza tutto dal 1° gen 2026». Sul Calendario desktop non ci sono più.
- **Rete ed errori.** 0 errori nella pagina, 0 richieste esterne.
- **Telefono a 390 px:** vedi Manifesto.

## Divergenze

- **L'avviso di sovrapposizione blocca.** Il brief lo vuole «senza bloccare», ma il server rifiuterebbe comunque il salvataggio (`bookings_no_overlap_per_coach`, `20260522204517_…sql:147-150`). Il dialog lo dice e disabilita «Crea sessione» (`session-form-dialog.tsx:245`, testo a :357). L'avviso di fuori disponibilità non blocca.
- **Arrotondamento al quarto d'ora più vicino** (`calendar-time.ts:47`). Il prototipo arrotonda per difetto (`Math.floor(…) * 15`). Ho seguito il brief e la prova rossa 4 del prompt.
- **«Note del coach» le vede anche il cliente.** Il prototipo dice «Visibili solo a te», ma la colonna della sessione è `trainer_notes`, che il cliente legge (§4.3). Il segnaposto dice «Il cliente le vede nel dettaglio della sessione.» (`session-form-dialog.tsx:606`). Note private servirebbero una colonna nuova, cioè una migrazione.
- **Niente «Apri in Google Calendar».** Delle sessioni salviamo solo `google_event_id`: né il calendario né `htmlLink`, quindi un link funzionante non si costruisce. Il pannello lo omette (`calendar-details-panel.tsx`).
- **Il telefono tiene la riconciliazione e «Sincronizza tutto».** Il §3.5 li sposta in Integrazioni, e sul desktop è fatto. Ma il divieto sul mobile chiede che il telefono resti identico, quindi lì restano (`calendar-mobile.tsx:229-238`). Sono anche in Integrazioni.
- **Durata 60.** Con una tipologia che non dura 60 minuti e «1h» scelto, il server salva la durata della tipologia (§4.2). Il dialog lo scrive sotto i campi (`session-form-dialog.tsx:362`, testo a :562).
- **`event=` su un evento da assegnare** apre «Assegna evento» al posto del pannello, come il clic sul tile (`calendar-desktop.tsx:255`). Un `event=` che non esiste più mostra «Evento non trovato…» e si toglie dall'URL (:248).
- **Sessioni annullate aperte da un link.** Il pannello le mostra con lo stato «Annullata» e senza azioni (`calendar-events.ts:167`, `calendar-desktop.tsx:510-511`). Il brief elenca quattro stati: questo è in più, per le notifiche di annullamento.
- **«Annulla sessione» per le sessioni cliente, anche svolte o assenti** (il brief dice «sempre»). Passa dal dialog della 02. Per impegni e consulenze il pulsante è «Elimina impegno» (dialog della 02 in modalità elimina) e non c'è «Inserita per errore? Elimina» (`calendar-desktop.tsx:511`).
- **«Ricrea su Google» ha un toast semplice, senza «Ripristina»** (`calendar-desktop.tsx:414-415`). Crea solo l'evento Google e nell'app non c'è niente da annullare.
- **Credito per una data fuori da ogni blocco.** Vengono solo i crediti extra (`block_id` vuoto, trigger degli extra). Se la data cade in un blocco, il credito si cerca in tutti i blocchi del cliente, nell'ordine del server (`session-create.ts`, `planSessionCredit`).
- **Consulenza senza tipologia:** viola `#8e24aa` (`calendar-desktop.tsx:97`), il colore del prototipo.
- **La griglia parte dalle 07:00** come nel prototipo, tranne quando si apre un evento da un link.
- **Il pannello è montato in `body`** (`calendar-desktop.tsx:614`). Nella pagina un antenato ha un `transform` che spostava il `position: fixed`.
- **`new=sessione` sul telefono resta ignorato**, come prima (`calendar-desktop.tsx:223`).
- **Il testo dell'avviso di sovrapposizione è più lungo** del brief: aggiunge «Due eventi programmati non possono sovrapporsi: scegli un altro orario.», perché blocca.

## Cosa non ho fatto e perché

- **«Apri in Google Calendar»:** vedi Divergenze.
- **Redesign del Calendario sul telefono:** il §5 lo vieta. Sul telefono restano Focus Cliente, i filtri vecchi, la riconciliazione e l'agenda.
- **Redesign di Integrazioni:** è della passata 09. Ho solo spostato i due pezzi.
- **Trascinamento dei tile per spostare le sessioni:** non è nel brief.
- **Verifica con dati veri.** Il divieto vale anche in lettura. Il finto backend riproduce l'ordine dei trigger, `reschedule_booking`, la durata e il vincolo di sovrapposizione come li ho letti nelle migrazioni. Non prova le policy RLS, i tempi di rete e le risposte vere di Google.

## Cosa resta a Nicolò

- **Prova sull'anteprima Lovable, con dati veri:**
  - una sessione creata dal Calendario a un cliente con crediti: il credito sale nel Profilo, l'evento compare su Google;
  - lo stesso con un cliente senza crediti: nessun salvataggio, «Pacchetto»;
  - spostare una sessione a un'altra settimana del blocco, poi «Ripristina»;
  - cambiare tipologia (PT → BIA) a un cliente con un credito BIA, poi «Ripristina»;
  - un impegno personale e la sua eliminazione;
  - un link da una notifica.
- **Decidere:**
  - se «Note del coach» devono essere private: serve una colonna nuova, cioè una migrazione;
  - se sovrapporre eventi deve essere permesso: oggi lo vieta il vincolo del database;
  - se si vuole «Apri in Google Calendar»: va salvato `htmlLink` alla creazione, anche questa una migrazione.
- **Passata 09:** il redesign di Integrazioni, che ora contiene la riconciliazione e «Sincronizza tutto».
