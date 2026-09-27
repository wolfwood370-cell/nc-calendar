# Ultimo ritorno · Redesign coach, passata 06 (Profilo cliente)

27/09/2026. Brief: `design_handoff_coach_redesign/passes/06-profilo-cliente.md`, prototipo `designs/Coach Cliente.dc.html` (con `Coach Pacchetto` e `Coach Annulla Sessione`) e le quattro schermate `screenshots/06-cliente-0*.png`. Audit: K1–K3, K5–K7, P5. K4 resta fuori (§3.1).

## Ramo e hash

- **Ramo pubblicato:** `redesign/coach-06-profilo-cliente`, con `git push -u origin redesign/coach-06-profilo-cliente`.
- **Base:** `git rev-parse origin/main` = `b8c1cece7649a9e4400589d1c1ec48d2314a647f`, come atteso (merge della PR #71). Il ramo l'ho creato da lì, prima di ogni modifica.
- **Commit, in ordine:**
  1. `d6304d8` regole del Profilo desktop (`client-profile.ts`) e riquadro Presenza (`presenceSummary`), con i test;
  2. `de4850b` scritture delle sessioni dal Profilo (`profile-session.ts`), store Supabase e archivio in memoria, con i test;
  3. `6e3c0b3` telefono in «Crea l'account» e nella scrittura del profilo;
  4. `d4c454c` Profilo desktop; la pagina di prima passa **senza modifiche** in `client-profile-mobile.tsx`;
  5. `06e0a60` il Profilo del telefono scrive con gli stessi helper, senza cambiare quello che mostra (commit a parte, si può togliere da solo: vedi Divergenze);
  6. `5cc20bb` CHECKLIST;
  7. questo file, per ultimo.
- **Come ho committato:** file aggiunti per nome, mai `git add -A` o `git add .`. `bun.lock` rimesso com'era subito dopo l'installazione e controllato prima di ogni commit.
- **Typecheck commit per commit:** in un worktree separato, `tsc --noEmit` dà 0 errori su tutti e cinque i commit di codice.

## PR

https://github.com/wolfwood370-cell/nc-calendar/pull/72: verso `main`, aperta, non in bozza, **non** unita. L'ho aperta con lo strumento GitHub della sessione.

## Manifesto

**NUOVI (16)**

- Helper puri e test (`src/lib/`):
  - `client-profile.ts` + test (27):
    - tab e URL;
    - settimane «da salvare» (con lo spostamento di prima), ricaricamento che non perde le modifiche, protezione all'uscita;
    - interruttore del rinnovo;
    - intestazione e «Pacchetto e percorso»;
    - filtri, prossime e ultime sessioni;
    - testo di «Collega»;
    - regola delle sessioni fuori percorso;
  - `profile-session.ts` + test (20): modifica sessione (stato, data, ora, tipologia, note) sugli helper della 03-04, «Rimetti in agenda» e il suo «Ripristina», «Collega», «Ignora», «Scollega dal profilo».
- Resto di `src/lib/`:
  - `profile-load.ts`: le letture del Profilo, le stesse tabelle di prima, in una sola funzione per `useQuery`;
  - `profile-store.ts`: lo store Supabase, che unisce quello del Calendario e quello di «Assegna evento»;
  - `testing/memory-profile-store.ts`: archivio in memoria per i test, costruito su quello della 04.
- Componenti:
  - `client-profile-desktop.tsx`: pagina, intestazione, tab, barra di salvataggio, dialog d'uscita;
  - `profile-overview.tsx`, `profile-path.tsx`, `profile-sessions.tsx`: i tre tab;
  - `profile-session-dialog.tsx`: «Modifica sessione»;
  - `profile-notes-card.tsx`: «Note e obiettivi»;
  - `profile-ui.tsx` e `profile-styles.ts`: chip di stato e classe dei riquadri;
  - `client-profile-mobile.tsx`: la pagina di prima (vedi sotto).

**MODIFICATI (7)**

- `src/routes/trainer.clients.$id.tsx`:
  - `validateSearch: parseProfileSearch`;
  - sotto md monta `ClientProfileMobile`, da md in su `ClientProfileDesktop`, uno solo alla volta (:33-58);
  - con modifiche al percorso non salvate il desktop resta montato anche se la finestra si stringe.
- `src/lib/attendance.ts`: `presenceSummary` (:128). `profileEngagement` (:81) resta com'era: vedi Divergenze.
- `src/lib/client-create.ts`: `phone` facoltativo nel payload, scritto nell'aggiornamento del profilo che la creazione fa già.
- `src/components/new-client-dialog.tsx`: «Telefono (facoltativo)» nel passo Dati e nel riepilogo.
- Test: `src/lib/attendance.test.ts` (+4), `src/lib/client-create.test.ts` (+3).
- `design_handoff_coach_redesign/CHECKLIST.md`: la 06 passa a `[x]`, con la nota che K4 resta aperto.
- `docs/ULTIMO-RITORNO.md`: questo file.

**NON TOCCATI**

- **Niente database, lock, dipendenze, tipi generati o CI.** Questo comando dà 0 righe:

  ```
  git diff origin/main..HEAD --stat -- supabase/ bun.lock package.json src/integrations/supabase/types.ts .github
  ```

- **Altri file:** `src/routes/client.*`, `trainer-header.tsx`, `trainer-bottom-nav.tsx` e i componenti del Profilo di prima: `coach-notes-card.tsx`, `trainer-bia-panel.tsx`, `timeline-week-row.tsx`, `timeline-booking-card.tsx`, `path-start-date-card.tsx`, `auto-renew-toggle-card.tsx`, `orphan-bookings-card.tsx`, `edit-booking-dialog.tsx`, `block-credits-dialog.tsx`. Il telefono li usa ancora; il desktop riusa `trainer-bia-panel.tsx` e `block-credits-dialog.tsx`.
- **Il telefono resta com'era.**
  - **Estrazione:** `client-profile-mobile.tsx` al commit `d4c454c` differisce dalla route su `origin/main` solo in quattro punti: import, commento in testa, definizione della route (spostata) e `export function ClientProfileMobile`.
  - **Prova:** a 390 px, 5 stati, col finto backend e l'ora fissa:
    1. Giulia;
    2. dialog «Modifica sessione» di prima aperto;
    3. abbonamento mensile (Luca);
    4. cliente libero (Elena);
    5. `?tab=pacchetto`, che sul telefono non apre niente, come prima.
  - **Risultato:** su `origin/main` e sul ramo (dopo il commit 5), impronta del DOM visibile **e** hash del PNG a pagina intera identici in tutti e 5 gli stati.

  | stato | DOM `origin/main` | DOM ramo | PNG (uguale) |
  |---|---|---|---|
  | 1 · Giulia | `1b7350cc25c5850e` | `1b7350cc25c5850e` | `8fc6495c229978ab` |
  | 2 · modifica | `63bbcdc3d07f9ffa` | `63bbcdc3d07f9ffa` | `c5495590337193f7` |
  | 3 · mensile | `de36417109a29a14` | `de36417109a29a14` | `6c7a2693b7229040` |
  | 4 · libero | `9afd9b682dbe6a16` | `9afd9b682dbe6a16` | `169d6e29220bbfd4` |
  | 5 · `tab=pacchetto` | `1b7350cc25c5850e` | `1b7350cc25c5850e` | `8fc6495c229978ab` |

## Ambiente

- **Dipendenze:** ho riscritto in `bun.lock` gli indirizzi del registro di Lovable verso `https://registry.npmjs.org/`. Poi `bun install --frozen-lockfile` (Bun 1.3.11) ha dato «Checked 724 installs across 846 packages (no changes)». Infine ho rimesso `bun.lock` com'era (`git checkout -- bun.lock`).
- **Browser:** la Chromium di Playwright in `/opt/pw-browsers`.
- **Finto backend:** quello delle passate 02-05, esteso per la 06. Vive nella cartella di lavoro della sessione, non nel repo.
  - **Giulia come nelle schermate:** telefono, 6 blocchi dal 13/07, blocco 3 in corso con 3 PT su 16, una sessione annullata;
  - **due sessioni di Giulia importate da Google**, fuori percorso;
  - **BIA e note del coach**;
  - **un percorso fisso col rinnovo acceso** (Sara);
  - **l'upsert di PostgREST** (`on_conflict`, `resolution=merge-duplicates`) per le note.
- **Albero di base:** un worktree separato su `b8c1cec`, per le impronte del telefono.
- **Rete:** nessuna richiesta è uscita verso Supabase, Google o l'invio email. Il banco le conta, zero in ogni giro.

## Controlli

Base (`b8c1cec`) e fine (`06e0a60`, ultimo commit di codice), stessi comandi e stesso ambiente.

| | Base | Fine |
|---|---|---|
| typecheck (`tsc --noEmit`) | 0 errori | 0 errori |
| lint (`eslint .`) | `✖ 22 problems (0 errors, 22 warnings)` | `✖ 22 problems (0 errors, 22 warnings)` |
| test (`vitest run`) | `Tests  334 passed (334)`, 24 file | `Tests  388 passed (388)`, 26 file |
| build (`vite build`) | riuscita | riuscita |

- **Base:** uguale a quella misurata da Cowork.
- **Lint:** gli stessi avvisi file per file. L'unico che cambia posto è quello di `react-hooks/exhaustive-deps` della pagina di prima, che si sposta con lei da `trainer.clients.$id.tsx:165` a `client-profile-mobile.tsx:147`.
- **Test nuovi (54):**
  - `client-profile`: 27;
  - `profile-session`: 20;
  - `attendance`: 4;
  - `client-create`: 3.

## Ricognizione del §4

Righe di `origin/main` (`b8c1cec`); la pagina era `src/routes/trainer.clients.$id.tsx`.

1. **Cosa scrive oggi la modifica di una sessione.**
   - **`edit-booking-dialog.tsx`** è solo interfaccia:
     - stato scegliibile solo fra Pianificata e Completata (:47, :119, :181-194);
     - «Annulla sessione» ed «Elimina» aprono il dialog condiviso della 02;
     - «Scollega dal profilo» si conferma con un AlertDialog.
   - **Il salvataggio** è `saveBookingEdit` (:557-600): un UPDATE secco su `bookings` di `scheduled_at`, `event_type_id`, `session_type` ed eventualmente `status` (:558-566), poi `gcalUpdateEvent` senza attendere (:580-594).
     - Niente `reschedule_booking`: il credito non segue né la nuova settimana né la nuova tipologia.
     - Nessun controllo che la riga sia ancora com'era.
   - **Annulla ed elimina** passano da `SessionCancelDialog` (:1352-1359, :1362-1382).
   - **Scollega** (`unlinkBooking`, :519-553): `findCreditToReturn`, poi UPDATE di `client_id` e `block_id` a null con `ignored_by_clients`, poi `moveCredit(−1)`.
   - **Il Calendario** invece usa `editSession` (`session-form-dialog.tsx:312`, `reschedule_booking` in `calendar-store.ts:94-100`) e `changeSessionOutcome` (`calendar-desktop.tsx:394`).
   - **Quindi il Profilo era la terza strada.** Ora desktop e telefono passano da `profile-session.ts`, che usa gli helper del Calendario.
2. **Sessioni fuori percorso e «Ignora».**
   - **Caricamento** (`loadOrphans`, :398-436): eventi del coach senza cliente e non eliminati, esclusi quelli col cliente in `ignored_by_clients`, che contengono il nome (e il cognome, se c'è) nel titolo o nelle note.
   - **La card** è `orphan-bookings-card.tsx:44-96` («Sessioni da revisionare», «Conferma» / «Scarta»).
   - **«Scarta»** (`discardOrphan`, :498-516): legge `ignored_by_clients`, aggiunge il cliente e aggiorna la riga. Nessun credito si muove.
   - **«Conferma»** (`confirmOrphan`, :438-496): prende il credito dal primo blocco, per `sequence_order`, che ha capienza per quella tipologia, non dal blocco della data. Scala con un UPDATE non condizionato; altrimenti dagli extra; altrimenti collega senza credito.
3. **Spostamento delle settimane e `saveSchedule`.**
   - **Le righe** si costruiscono al caricamento (:336-354): prima `weekly_schedule`, altrimenti `path_start_date` + 7 giorni per settimana.
   - **`handleWeekDateChange`** (:627-647) porta la data al lunedì, segna la settimana `shifted` e sposta le successive di 7 in 7 (ognuna tiene il suo `shifted`).
   - **La data d'inizio** (`handleStartChange`, :619-625) e «Ricalcola» (`resetSchedule`, :649-653) rigenerano tutto.
   - **«Da salvare»** (`dirty`, :723-729) confronta le righe con `originalRows`. Il pulsante stava in testata (:952-959) e non c'era nessuna protezione all'uscita.
   - **`saveSchedule`** (:682-721): UPDATE di `profiles.path_start_date`, DELETE di tutto `weekly_schedule` del cliente, INSERT di tutte le righe. Non è una transazione.
4. **«Blocco 3 di 6», «Mese 2» e BIA.**
   - **«Blocco N di M»** (:982): `currentNum` (:850-851) è il blocco il cui intervallo contiene oggi, ma l'intervallo viene dalle settimane di `weekly_schedule` (:753-759), non dalle date di `training_blocks`.
   - **«Mese 2»** nel Profilo non c'era: è solo nel prototipo. Ora intestazione e riquadro usano `resolveCurrentBlock` sui blocchi validi, come la lista della 05 (`client-profile.ts`, `blockChip`, `packageSummary`).
   - **BIA:** `TrainerBiaPanel` (:1293) su `useBiaMeasurements` (`use-bia.ts:44-93`), tabella `bia_measurements` (`measured_on`, `weight_kg`, `muscle_kg`, `fat_pct`), in tempo reale. Aggiunta, modifica ed eliminazione passano da `use-bia.ts`.
5. **Come salva `CoachNotesCard`.**
   - Idrata i campi una volta (:28-33), poi aspetta 800 ms di pausa (:36-56).
   - Salva con `useSaveCoachClientNote`: upsert su `coach_client_notes` con `onConflict` su `coach_id,client_id`, di `note` e `goal` (`use-coach-notes.ts:45-65`).
   - Mostra «Salvataggio…» e «Salvato» (:62-73). Limitazioni è un segnaposto «—» (:107-114).
   - Il timer si cancella quando la card sparisce: una modifica degli ultimi 800 ms si perde. Il desktop (`profile-notes-card.tsx:69-73`) la salva invece subito.

**Dal server, letto nelle migrazioni:**

- **Trigger dei crediti:** solo `BEFORE INSERT` (`20260522204517_…sql:23-25`, :125-127). Un cambio di stato non muove crediti, perciò «Rimetti in agenda» li riprende da sé, come il «Ripristina» della 02.
- **Rinnovo:** `ensure_client_block_state` (`20260827143325_…sql:1-100`) non guarda `path_type`, mentre il cron (:136-139) lavora solo sui mensili. E `auto_renew_blocks` nasce `true` (`20260523112416_…sql:6`). È il motivo del §3.2.

## Prove rosse

Ognuna: difetto nel codice, test che cade, file ripristinato con `git checkout`, test di nuovo verde. Uscita sotto, sintetizzata dal log.

1. **Una settimana cambiata non si segna «da salvare»** (`client-profile.ts`, `sameWeek` diventa `return !!a && !!b;`).
   - **Rosso:** `Tests 3 failed | 24 passed (27)`. Cade «spostare una settimana la segna da salvare…» con `AssertionError: expected [] to deeply equal [ 2, 3, 4, 5, 6, 7, 8 ]`, e con lui `isScheduleDirty`. La protezione all'uscita è `dirty && leavesSchedule(…)`: senza «dirty» non si attiva.
   - **Verde:** `Tests 27 passed (27)`.
2. **L'interruttore anche ai fissi spenti** (`renewalControl` restituisce `{ kind: "toggle", … }` anche per i fissi).
   - **Rosso:** `Tests 2 failed | 25 passed (27)`. Cade «fisso spento: niente» con `expected { kind: 'toggle', on: false } to be null`.
   - **Verde:** `Tests 27 passed (27)`.
3. **Assenze = solo `late_cancelled`** (`presenceSummary`, `absences: att?.lateCancelled ?? 0`).
   - **Rosso:** `Tests 2 failed | 8 passed (10)`. Cade «“Assenze (8 sett.)” sono le assenze di getAttendance» con `expected 3 to be 2`.
   - **Verde:** `Tests 10 passed (10)`.
4. **«Collega» dal blocco in corso invece che da quello della data** (`assign-event.ts`, `blockForDate(…, new Date().toISOString())`).
   - **Rosso:** `Tests 1 failed | 19 passed (20)`. Cade «“Collega” prende il credito dal blocco della data, non da quello in corso» con `expected { kind: 'allocation', id: 'm1-pt-1' } to deeply equal { kind: 'allocation', id: 'm0-pt-4' }`.
   - **Verde:** `Tests 20 passed (20)`.
   - **Nota:** questo difetto usa l'orologio vero (27/09, nel blocco `m1`); il test invece ha date fisse.
5. **`tab` non scritto nell'URL** (`profileSearchOf` restituisce sempre `{}`).
   - **Rosso:** `Tests 1 failed | 26 passed (27)`. Cade «ogni tab scrive il suo parametro; la panoramica nessuno» con `expected {} to deeply equal { tab: 'percorso' }`.
   - **Verde:** `Tests 27 passed (27)`.

## Verifica nel browser

Finto backend, ora fissa venerdì 25/09/2026 10:40 a Roma, viewport 1440×900. **Desktop: 53 controlli, 53 OK. Telefono, scritture: 5 controlli, 5 OK.**

**Accettazione**

- **Riga 1, nessuna modifica si perde senza conferma.** Spostata la settimana 2 del blocco 3 al 23/09: compaiono «Spostata · da salvare» e la barra «15 settimane modificate», fissa in fondo alla finestra.
  - Cambio tab, sidebar «Clienti», freccia e «indietro» del browser (arrivando dalla lista) aprono «Salvare le modifiche al percorso?».
  - «Resta qui» lascia tab, URL e modifiche.
  - «Esci senza salvare» porta alla lista, senza scrivere.
  - «Salva ed esci» scrive le 24 settimane con `saveSchedule`, la 10 al 21/09 e `shifted`, e porta al tab scelto.
  - La chiusura della pagina dà `beforeunload`.
  - «Annulla modifiche» toglie la barra senza scrivere.
  - «Ripristina le date standard» chiede conferma, e poi si salva dalla barra.
- **Riga 2, il tab resta nell'URL e «Vedi tutte» porta alle Sessioni.**
  - `tab=percorso` resta dopo il ricaricamento, e la panoramica non scrive `tab`.
  - «Vedi tutte (N)» porta a `tab=sessioni`.
  - `tab=pacchetto` apre il dialog Pacchetto sulla panoramica e si toglie dall'URL.

**Il resto**

- **Intestazione:** «Attivo · Percorso Fisso · Blocco 3 di 6», `mailto:giulia.b@email.it`, `tel:+393401182209`, `https://wa.me/393401182209`.
- **Collegamenti:**
  - «Nuova sessione» porta a `/trainer/calendar?new=sessione&client=<id>`;
  - una sessione in arrivo porta a `?date=2026-09-28&event=<id>`;
  - «Vedi il percorso» porta al tab Percorso.
- **Presenza:** 77%, «3 Assenze (8 sett.)», uguali ai valori ricalcolati sul finto database. «Ultima sessione svolta: Lunedì 21 settembre (4 giorni fa)».
- **Note:** si salvano da sole e dicono «Salvato». Un obiettivo scritto subito prima di cambiare tab si salva lo stesso. Nessun campo «Limitazioni».
- **Rinnovo in pagina (P5):** Sara è in scadenza e ha il banner col motivo e «Rinnova», che apre il Pacchetto su «Rinnova lo stesso».
- **Sessioni fuori percorso:**
  - i pulsanti dicono «Collega al blocco in corso» (18/09) e «Collega al blocco 2» (01/09);
  - «Collega» mette la sessione nel blocco 3 e il PT del blocco passa da 13 a 14 prenotati;
  - «Ignora» scrive `ignored_by_clients`, senza crediti, e «Ripristina» lo toglie.
- **Modifica sessione:**
  - la nuova ora passa da `reschedule_booking` e nessun PATCH di `scheduled_at`;
  - «Svolta» scrive `status` con il filtro `status=eq.scheduled`, e «Ripristina» la riporta a Programmata.
- **«Rimetti in agenda»:**
  - la sessione del 22/09 torna programmata, riprende un PT e ha un evento Google nuovo;
  - per Chiara, senza capienza, il dialog dice «Non ci sono crediti…» e non cambia niente.
- **Rinnovo automatico:**
  - Luca (mensile): interruttore acceso con «Nuovo blocco il 5 ott 2026»; spento, scrive `auto_renew_blocks = false`;
  - Sara (fissa, accesa): avviso con «Spegni», niente interruttore; «Spegni» scrive `false` e l'avviso sparisce;
  - Paolo (fisso spento): niente.
- **Telefono alla creazione:** il riepilogo lo mostra e il profilo scritto ha `+39 347 555 0101`. `admin-create-user` riceve gli stessi quattro campi di prima.
- **Telefono, scritture (390 px):**
  - «Conferma» prende il credito dal blocco della data;
  - la nuova ora passa da `reschedule_booking`;
  - «Completata» scrive con `changeSessionOutcome`.
- **Telefono, aspetto:** vedi Manifesto.
- **Larghezza 820 px:** niente scorrimento orizzontale.
- **Rete ed errori:** 0 dialog nativi, 0 richieste esterne, 0 errori nella pagina.

## Divergenze

- **Il telefono scrive con gli helper nuovi** (`client-profile-mobile.tsx:432`, :502, commit `06e0a60`). Il §3.9 chiede la pagina di oggi «senza cambiarla», ma il punto 2 del §0 e il §3.3 vogliono una strada sola per ogni scrittura.
  - Ho spostato la pagina tale e quale (commit `d4c454c`), poi ho cambiato solo le sue scritture. Quello che mostra è identico (impronte uguali a `origin/main`).
  - Per Nicolò cambia questo: dal telefono una nuova data segue il credito, e una sessione svolta non si sposta più senza riportarla a Programmata.
  - «Conferma» ora prende il credito dal blocco della data, non dal primo blocco con capienza.
  - Se non va bene, il commit si toglie da solo.
- **`profileEngagement` non è allineato** (`attendance.ts:81`): lo mostra il telefono, che non cambia. L'allineamento chiesto dal §3.5 vive in `presenceSummary` (`attendance.ts:128`), che usa il desktop. Il «No-show» del telefono conta ancora le annullate tardi.
- **La route monta una sola versione, non le nasconde col CSS** come la 04 (`trainer.clients.$id.tsx:33-58`). Il motivo: la pagina di prima carica i dati da sé, e i suoi dialog, che escono in un portal, comparirebbero anche da nascosta.
- **Lo spostamento di una settimana sposta anche le successive,** come faceva la pagina di prima (`client-profile.ts:113`). Il prototipo sposta solo quella settimana. Per questo spostarne una segna «da salvare» tutte quelle che cambiano (per esempio «15 settimane modificate»).
- **«Ripristina le date standard» passa dalla barra,** non si salva subito col «Ripristina» del toast come nel prototipo: resta una modifica da salvare, coerente con il K1.
- **La data d'inizio del percorso si può ancora cambiare** («Cambia», `profile-path.tsx:170`), come faceva la card di prima. Rigenera le settimane e passa dalla barra.
- **«Sessione annullata.» per le annullate col credito restituito,** non «…credito restituito» come nel brief (`profile-session-dialog.tsx:54`). Le annullate dal Calendario prima della 02 hanno lo stesso stato, ma il credito non è mai tornato: è la stessa scelta del dialog della 02.
- **«Rimetti in agenda» riprende un credito anche per le annullate di prima della 02.** Da quel vecchio stato non si capisce se il credito era tornato o no.
- **Note del coach nel dialog:** il segnaposto dice «Il cliente le vede nel dettaglio della sessione.», non «Visibili solo a te» (`profile-session-dialog.tsx:322`). `trainer_notes` il cliente la legge, come dice già il dialog della 04.
- **«Scollega dal profilo» resta nel dialog** (`profile-session-dialog.tsx:362`). Il brief non lo ha, ma oggi c'è, e toglierlo farebbe sparire una funzione dal desktop.
- **Sessioni fuori percorso: la regola del nome è quella di prima,** nome **e** cognome (`client-profile.ts:432`). «PT Giulia (da Google)» del prototipo non comparirebbe: nel banco il titolo è «PT Giulia Bianchi (da Google)».
  - In più escludo gli eventi che «Collega» non potrebbe collegare: annullati, impegni personali, già in un blocco.
  - Senza credito, un toast offre «Collega senza credito» (`client-profile-desktop.tsx:401`), come faceva «Conferma».
- **Andamento BIA:** riuso `TrainerBiaPanel` così com'è (`profile-overview.tsx:340`). Selettore, grafico e dialog ci sono. Rispetto al brief: il dialog chiede anche massa magra e grasso (oggi obbligatori) e dice «Massa (kg)»; in più tiene modifica ed eliminazione dal grafico.
- **Nessun avviso di sovrapposizione nel dialog,** perché il Profilo non carica le sessioni degli altri clienti. Se l'orario è occupato, il server rifiuta e il dialog mostra «L'orario ora è occupato da un'altra sessione.».
- **Stato in intestazione:** viene da `clientStatus` della lista (05), non dal calcolo locale di prima. Così Profilo e lista dicono lo stesso stato.
- **La barra di salvataggio vive in un portal** (`client-profile-desktop.tsx:656`). Il contenitore `.page-enter` del layout ha un `transform`, e un `fixed` dentro di lui finiva in fondo alla pagina invece che in fondo alla finestra. Nel banco c'è un controllo apposta.
- **«Indietro» del browser col dialog aperto:** la barra degli indirizzi mostra già la pagina di destinazione. «Resta qui» rimette URL e modifiche. È il comportamento di `useBlocker` sui passi indietro.

## Cosa non ho fatto e perché

- **K4, Limitazioni, e la terza riga di Accettazione:** servono una colonna accanto a `goal`, cioè una migrazione (§3.1 e §5). Non le salvo in un campo che serve ad altro. Nel desktop non c'è il campo, nel telefono resta il segnaposto «—» di prima.
- **Il filtro delle Sessioni non va nell'URL:** il brief chiede solo `tab`.
- **`block-credits-dialog.tsx`** (crediti assegnati di un blocco) scrive `block_allocations` come prima. È la gestione del pacchetto, non il movimento di una sessione; lo riusano entrambe le versioni.
- **Verifica con dati veri:** il divieto vale anche in lettura. Il finto backend riproduce trigger, `reschedule_booking`, upsert e funzioni Google letti nelle migrazioni. Non prova le policy RLS: per esempio l'UPDATE del telefono sul profilo del cliente, che però è la stessa riga che la creazione aggiorna già.

## Cosa resta a Nicolò

- **Prova sull'anteprima Lovable, con dati veri:**
  - spostare una settimana e uscire in tutti i modi (tab, sidebar, freccia, indietro, chiusura);
  - «Salva calendario»;
  - modificare ora e tipologia di una sessione e controllare il credito della settimana;
  - «Rimetti in agenda» con e senza crediti;
  - «Collega» su un evento di Google;
  - WhatsApp dal Profilo;
  - un cliente creato col telefono.
- **Decidere il commit `06e0a60`**, cioè il telefono che scrive con gli helper: tenerlo (consigliato: una strada sola) o toglierlo.
- **Spegnere il rinnovo sui percorsi fissi di prima:** dal Profilo c'è «Spegni», oppure si sistemano i dati.
- **K4:** colonna e migrazione per le Limitazioni, alla revisione del 02/10/2026.
