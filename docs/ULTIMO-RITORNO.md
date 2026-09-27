# Ultimo ritorno · Redesign coach, passata 07 (Tipologie di sessione)

27/09/2026. Brief: `design_handoff_coach_redesign/passes/07-tipologie.md`, prototipo `designs/Coach Tipologie.dc.html`, schermate `screenshots/07-tipologie-01-pagina.png` e `07-tipologie-02-modifica.png`. Audit: E1–E5, con le correzioni del §3 del prompt. L'archiviazione resta fuori: vedi «Cosa non ho fatto».

## Ramo e hash

- **Ramo:** `redesign/coach-07-tipologie`, pubblicato con `git push -u origin redesign/coach-07-tipologie`.
- **Base:** `git rev-parse origin/main` = `3d29634e77f429e6c9da8fd542c71dbcbf0d44c7`, come atteso (merge della PR #72). Il ramo è partito da lì, prima di ogni modifica.
- **Commit, in ordine:**
  1. `010bbc1` helper puri: uso delle tipologie (`event-type-usage.ts`), regole (`event-type-rules.ts`), palette e contrasto (`event-colors.ts`), `isCountedSession`, `formatDuration`, coi test;
  2. `7bf4029` modulo unico delle scritture (`event-type-actions.ts`), store Supabase e archivio in memoria, coi test;
  3. `8003334` pagina desktop; la pagina di prima passa **senza modifiche** in `event-types-mobile.tsx`; `useDesktop` in `src/hooks/`;
  4. `0bb1230` il telefono scrive e legge con gli helper del desktop, senza cambiare quello che mostra;
  5. `751a0f7` dalla revisione: salvataggio e «Ripristina» campo per campo, nome invariato sempre valido, conteggio esatto nella rilettura dell'uso;
  6. `5f89c67` dalla revisione: niente dialog su valori che stanno cambiando, uso letto all'apertura del dialog d'eliminazione, dialog che non si chiude mentre salva;
  7. `631d6c6` dalla revisione: il telefono rilegge la lista all'apertura e dopo un errore;
  8. `de442af` CHECKLIST;
  9. questo file, per ultimo.
- **Come ho committato:** file aggiunti per nome, mai `git add -A` o `git add .`.
- **Typecheck commit per commit:** in un worktree separato su ogni commit, `tsc --noEmit` dà 0 errori su tutti e sette i commit di codice.

## PR

https://github.com/wolfwood370-cell/nc-calendar/pull/73: verso `main`, aperta, non in bozza, **non** unita. L'ho aperta con `gh pr create`: `gh auth status` rispondeva autenticato.

## Manifesto

**NUOVI (14)**

- Helper puri e test (`src/lib/`):
  - `event-type-usage.ts` + test (10):
    - uso di una tipologia: sessioni del mese, future, passate, clienti con crediti (archiviati a parte), negozio;
    - verdetto «in uso»;
    - testi del piè e del dialog d'eliminazione;
  - `event-type-rules.ts` + test (17):
    - passi dei −/+;
    - segmenti e colori col valore attuale;
    - nome (vuoto, doppione, bloccato dal negozio);
    - testi della card;
    - ordine per nome;
  - `event-type-actions.ts` + test (25): −/+, interruttore, salvataggio, «Ripristina», eliminazione con rilettura.
- Resto di `src/lib/`:
  - `event-type-store.ts`: lo store Supabase delle scritture e della rilettura dell'uso;
  - `testing/memory-event-type-store.ts`: archivio in memoria dei test, che imita il `SET NULL`.
- Componenti:
  - `event-types-desktop.tsx`: la pagina;
  - `event-type-card.tsx`, `event-type-dialog.tsx`, `event-type-delete-dialog.tsx`;
  - `event-types-mobile.tsx`: la pagina di prima (vedi sotto).
- `src/hooks/use-desktop.ts`: `useDesktop`, prima locale alla route del Profilo, ora usato da due route.

**MODIFICATI (13)**

- `src/routes/trainer.event-types.tsx`: resta `head`; sotto md monta `EventTypesMobile`, da md in su `EventTypesDesktop`, uno solo alla volta. Con un dialog aperto il desktop resta montato anche se la finestra si stringe (:31-37).
- `src/routes/trainer.clients.$id.tsx`: importa `useDesktop` da `src/hooks/` invece della copia locale. Il comportamento è identico.
- `src/lib/queries.ts`:
  - `useCoachEventTypes` accetta `{ fresh }` (:368): rilegge all'apertura, come la query di prima che aveva `staleTime` 0;
  - due letture nuove, `useTypeExtraCredits` (:424) e `useActiveShopTitles` (:433).
- `src/lib/query-keys.ts`: `extraCredits.types` e `shopTitles`.
- `src/lib/event-colors.ts`:
  - nomi italiani in `GCAL_COLORS`, con gli stessi hex (Salvia resta `#33B864`);
  - `STUDIO_BLUE` e `TYPE_PALETTE` solo per il desktop;
  - contrasto WCAG col bianco.
- `src/lib/service-distribution.ts`: `isCountedSession` (:25) con `AGENDA_STATUSES` al posto di `COUNTED_STATUSES`.
- `src/lib/session-time.ts`: `formatDuration` (:42). Sostituisce le due copie locali di `session-form-dialog.tsx` e `overview-desktop.tsx`.
- `src/components/segmented-control.tsx`: `itemClassName` facoltativo (:32), per il padding di 11 px del prototipo nel dialog.
- Test: `session-time.test.ts` (+1).
- `design_handoff_coach_redesign/CHECKLIST.md`: la 07 passa a `[x]`, con la nota sull'archiviazione.
- `docs/ULTIMO-RITORNO.md`: questo file.

**NON TOCCATI**

- **Niente database, lock, dipendenze, tipi generati, CI o Google.** Questo comando dà 0 righe:

  ```
  git diff origin/main..HEAD --stat -- supabase/ bun.lock package.json src/integrations/supabase/types.ts .github src/lib/gcal-colors.ts src/lib/gcal.functions.ts src/lib/gcal.server.ts
  ```

- **Anche queste 0 righe:** `src/routes/client.*`, `trainer-header.tsx`, `trainer-bottom-nav.tsx`, `trainer-sidebar.tsx`, `src/routes/trainer.tsx`.
- **`event-type-service-card.tsx` non cambia.** È la card del telefono; il desktop ha la sua.
- **Il telefono resta com'era.**
  - **Estrazione:** al commit `8003334`, `event-types-mobile.tsx` differisce dalla route di `origin/main` solo in quattro punti: commento in testa, import di `createFileRoute`, definizione della route (tolta) e `export function EventTypesMobile`. I commit `0bb1230` e `631d6c6` cambiano solo query, scritture e `onError`: nessuna riga di JSX.
  - **Prova:** a 390 px, finto backend e ora fissa, tre stati: elenco, nessuna tipologia, errore di caricamento. DOM visibile di `<main>` (senza `data-tsd-source`, l'attributo che Vite aggiunge col percorso del file) e PNG a pagina intera.
  - **Risultato:** impronte identiche su `origin/main` e sul ramo:

  | stato      | DOM `origin/main`  | DOM ramo           | PNG (uguale)       |
  | ---------- | ------------------ | ------------------ | ------------------ |
  | 1 · elenco | `5124f232f46cb9ca` | `5124f232f46cb9ca` | `6a4ce56f3b2fbbe3` |
  | 2 · vuota  | `e127b604f2024026` | `e127b604f2024026` | `1133c68e5a549478` |
  | 3 · errore | `5572897596465493` | `5572897596465493` | `a0df8d4f534ba0b5` |
  - **Cosa cambia sul telefono, per scelta (§3.8):**
    - i rifiuti del modulo nel toast «Errore» di sempre;
    - il nome del colore in italiano nel suo dialog («Selezionato: Pavone»), perché legge `GCAL_COLORS`;
    - dalla revisione: salva solo i campi cambiati, quindi non cancella più `unavailable_message`, e rilegge la lista dopo un rifiuto.

## Ambiente

- **Sistema:** Windows 11, clone di Nicolò, senza worktree per il lavoro. Il worktree di `origin/main` per le impronte è stato temporaneo e l'ho già tolto.
- **Versioni:** Bun 1.3.14, Node v24.12.0.
- **Dipendenze:** nessuna installazione. `node_modules` è quello della passata 00. `git diff --stat b780645 origin/main -- package.json bun.lock` è vuoto; controllo positivo `4434a77`..`02a4d2a`: 2 file.
- **Browser:** niente installazioni e niente download.
  - **Playwright** 1.64.0-alpha, quello della cache npx del server MCP Playwright (fuori dal repo).
  - **Chromium:** la headless shell 143.0.7499.4, già in `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1200`. La `chrome.exe` completa della stessa cartella non parte (`Permission denied`).
- **Finto backend:** scritto per questa passata, nella cartella di lavoro della sessione, non nel repo.
  - **Avvio:** Vite con `VITE_SUPABASE_URL=http://finto-supabase.test` (un host che non si risolve) e `VITE_SENTRY_DSN` vuoto.
  - **PostgREST minimo:** filtri, ordine, `limit`, `Prefer: return=representation` e `count=exact`, `SET NULL` sull'eliminazione.
  - **Realtime** finto, **Google Fonts** serviti vuoti.
  - **Tutto il resto bloccato e contato:** zero in ogni giro.

## Controlli

Base (`3d29634`) e fine (`631d6c6`, ultimo commit di codice), stessi comandi e stesso PC.

|                                 | Base                                    | Fine                                    |
| ------------------------------- | --------------------------------------- | --------------------------------------- |
| typecheck (`bun run typecheck`) | 0 errori                                | 0 errori                                |
| lint (`bun run lint`)           | `✖ 22 problems (0 errors, 22 warnings)` | `✖ 22 problems (0 errors, 22 warnings)` |
| test (`bun run test`)           | `Tests  388 passed (388)`, 26 file      | `Tests  441 passed (441)`, 29 file      |
| build (`bun run build`)         | riuscita                                | riuscita                                |

- **Base:** uguale a quella misurata da Cowork.
- **Lint:** gli stessi avvisi, file per file.
- **Test nuovi (53):** `event-type-actions` 25, `event-type-rules` 17, `event-type-usage` 10, `session-time` 1.
- **Un lancio fallito, per contesa di risorse.** Un primo `bun run test` a fine lavoro ha dato 3-4 file falliti. Le cause: `UNKNOWN: unknown error, lstat` su `node_modules/date-fns` e un worker uscito con codice 134. Nello stesso momento girava il vitest di un altro progetto (`nc-movement`, un'altra sessione) con una decina di worker. Quando è finito, lo stesso comando ha dato 29 file verdi. Non ho toccato quei processi.

## Ricognizione del §4

Righe di `origin/main` (`3d29634`).

1. **Chi legge `duration` e `buffer_minutes` dopo che la sessione è nata.**
   - **Il trigger.**
     - L'ultima definizione è `20260522204517_…sql:78-81`, `BEFORE INSERT OR UPDATE OF scheduled_at, duration_min, buffer_min, event_type_id`.
     - La funzione è in `20260814102120_…sql:1-39`: il margine si rilegge sempre (:18-20); la durata solo se `google_event_id IS NULL` e vale 60 (:26-28).
     - Nessun trigger su `event_types` aggiorna le sessioni: c'è solo `set_updated_at` (`20260510095008_…sql:30-32`).
   - **I lettori usano i valori copiati nella sessione:**
     - `get_coach_busy`, l'ultima in `20260522204517_…sql:258-271`. `get_coach_busy_snapshot` non esiste come funzione: è solo il nome del file `20260519110000_get_coach_busy_snapshot_duration.sql`;
     - Prenota, per le sessioni esistenti (`client.book.tsx:210-234`, `booking-slots.ts:63-68,172-185`);
     - Riprogramma (`client-reschedule-sheet.tsx:109-141`, `reschedule-slots.ts:106-111`);
     - Calendario (`calendar-desktop.tsx:310-314`, `calendar-events.ts:74-78`);
     - Oggi (`today-agenda.ts:56-62`).
   - **I valori vivi della tipologia servono solo alla sessione da creare** (`client.book.tsx:178-181`).
   - **La frase «Durata e margine valgono per le sessioni fissate da ora in poi.» è vera.** Due precisazioni al §3.2 del prompt:
     - la condizione della durata è «non collegata a un evento Google», non «non viene da Google»: anche le sessioni create nell'app ricevono `google_event_id` quando vengono pubblicate (`gcal.functions.ts:195-202`);
     - il Calendario passa la durata esplicitamente (`session-create.ts:213`), Prenota no (`use-book-confirm.ts:177-195`).
2. **Una sessione con `event_type_id` nullo.**
   - **Fallback:** `sessionLabel(session_type)` («Sessione PT», «Test funzionale», «BIA», `mock-data.ts:8-12`).
   - **Calendario desktop e Panoramica:** blu `#003e62` (`FALLBACK_TYPE_COLOR`, `service-distribution.ts:52`); nel Calendario resta viola se è una consulenza (`calendar-desktop.tsx:302-306`).
   - **Profilo desktop:** grigio `#c1c7d0` (`client-profile.ts:381-388`).
   - **Profilo del telefono:** mostra il titolo Google o «Sessione» (`client-profile-mobile.tsx:994-995`).
   - **Filtri per tipologia del Calendario:** la escludono (`calendar-events.ts:65-68`).
   - **Icona:** la calcola il nome, quindi può cambiare (`session-type-icon.ts`).
   - **Crediti:**
     - un'allocazione nulla si prenota ancora per `session_type` (trigger `20260827143053_…sql:42-45`);
     - un credito extra nullo compare in Prenota ma **non si può più prenotare** (`booking-allocation.ts:83`, trigger :81-83);
     - `cancel_booking` non lo rimborsa (`20260606120000_…sql:193`).
   - **Chiavi verso `event_types`:** le tre FK `ON DELETE SET NULL` sono confermate alle righe citate dal prompt, e non ce ne sono altre verso `event_types`.
   - **Per questo il testo dell'eliminazione dice che sessioni e crediti «perderebbero la tipologia».**
3. **«Link inviato alla prenotazione»: vero solo in parte.**
   - **Il link nasce** con l'evento Google:
     - `requestMeet: isOnline` in `use-book-confirm.ts:253` e `session-store.ts:103,111`;
     - lato server, `gcal.server.ts:116-123` con `conferenceDataVersion=1` (:129);
     - si salva in `bookings.meeting_link` (`gcal.functions.ts:194-202`).
   - **Il cliente lo trova:**
     - nell'app, «Apri videocall» (`client-booking-detail-view.tsx:215-227`);
     - nell'invito di Google Calendar, se ha un'email valida (`gcal.server.ts:106-114`, `sendUpdates` «all» a :128).
   - **L'app non lo manda:** nessuna email o notifica col link (`use-book-confirm.ts:261-262`, :272).
   - **Se Google fallisce** il link non c'è.
   - Il testo della card dice quello che succede: «Online · link Meet creato alla prenotazione» (`event-type-rules.ts:176`).

## Prove rosse

Ognuna: difetto nel codice, test che cade, file ripristinato con `git checkout`, test di nuovo verde. Uscite sintetizzate.

1. **Soglia del contrasto a 3,1** (`MIN_WHITE_CONTRAST = 3.1`).
   - **Rosso:** `Tests 1 failed | 16 passed (17)`. Cade «l'avviso esce esattamente per Fenicottero, Banana e Salvia»: il risultato ha anche `"Pavone"`.
   - **Verde:** `Tests 17 passed (17)`.
2. **Il nome si confronta con le maiuscole** (`sameName` senza `toLowerCase`).
   - **Rosso:** `Tests 1 failed | 16 passed (17)`. Cade «doppione senza maiuscole e senza spazi ai lati…» con `expected null to be 'duplicate'`.
   - **Verde:** `Tests 17 passed (17)`.
3. **Il verdetto ignora i clienti con crediti** (`isTypeInUse` senza `clientsWithCredits`).
   - **Rosso:** `Tests 1 failed | 24 passed (25)`. Cade «in uso per i crediti, senza sessioni future: rifiutata» con `Error: doveva rifiutare`: la BIA con i crediti di Marta viene eliminata.
   - **Verde:** `Tests 25 passed (25)`.
4. **Il verdetto ignora il negozio** (`isTypeInUse` senza `soldInShop`).
   - **Rosso:** `Tests 1 failed | 24 passed (25)`. Cade «in uso per il negozio: rifiutata» con `Error: doveva rifiutare`.
   - **Verde:** `Tests 25 passed (25)`.
5. **Il mese conta anche `late_cancelled`.**
   - **Rosso:** `Tests 1 failed | 9 passed (10)`. Cade «la regola della Distribuzione servizi sul mese intero di Roma…» con `expected 5 to be 4`.
   - **Verde:** `Tests 10 passed (10)`.
6. **L'interruttore scrive `unavailable_message: null`.**
   - **Rosso:** `Tests 1 failed | 24 passed (25)`. Cade «scrive solo client_bookable: il messaggio per i clienti resta»: la patch ricevuta ha anche `"unavailable_message": null`.
   - **Verde:** `Tests 25 passed (25)`.

## Verifica nel browser

- **Condizioni:** finto backend, ora fissa venerdì 25/09/2026 10:40 a Roma, desktop 1440×900 e telefono 390×844.
- **Esito:** **76 controlli, 76 OK. Zero richieste bloccate verso host esterni, zero errori nella pagina, zero dialog nativi.**

**Accettazione**

- **Riga 1, nessun controllo della card apre il dialog senza dirlo.**
  - I controlli della card sono esattamente «Modifica <nome>», i quattro −/+, l'interruttore ed «Elimina».
  - −/+, interruttore e quadrato colore non aprono niente.
  - Solo la matita apre «Modifica tipologia».
- **Riga 2, nessun «—» segnaposto.** Nessun «—» nella pagina; nessun «Prezzo» né «prenotazioni questo mese».

**Il resto**

- **Piè con l'uso vero:**
  - «7 sessioni questo mese · 1 cliente con crediti» su Sessione PT;
  - «1 sessione questo mese · 1 cliente con crediti» sulla BIA.
- **Pagina:**
  - card in ordine di nome;
  - descrizione su due righe;
  - niente opacità ridotta;
  - la riga sotto la griglia;
  - «In studio · indirizzo non impostato»;
  - «Online · link Meet creato alla prenotazione».
- **−/+:**
  - **tre clic veloci** su «Aumenta la durata di Sessione PT», con la risposta ritardata di 500 ms: **una scrittura sola**, `{ duration: 75 }`, e la card mostra «1h 15m»;
  - durante la scrittura −/+, matita ed «Elimina» sono disabilitati;
  - fuori griglia: 50 + dà 1h, 50 − dà 45m, margine 20 − dà 15;
  - la BIA a 15 minuti ha il «−» disabilitato;
  - una scrittura fallita riporta il valore di prima col toast «Modifica non salvata.».
- **Interruttore:**
  - scrive solo `{ client_bookable: false }`;
  - toast «Sessione PT non è più prenotabile dai clienti.» con «Ripristina», che riaccende;
  - riaccendere la tipologia di test non cancella il messaggio, e rispenta lo mostra di nuovo.
- **Dialog:**
  - la nuova tipologia parte da 1h, 10 min, In studio, Blu studio e prenotabile, con 12 cerchi e 600 px;
  - errori sotto il campo: «Inserisci un nome.» e «Esiste già una tipologia con questo nome.» (con « misurazione bia »);
  - avviso di contrasto su Banana e Salvia, non su Pavone;
  - nota di Google su Blu studio;
  - anteprima «Nome cliente» / «Stretching · 10:30»;
  - non prenotabile: il messaggio e il testo predefinito;
  - la creazione scrive i valori del prototipo, e il suo «Ripristina» rilegge l'uso e poi elimina;
  - la BIA ha il segmento «15m» in più, selezionato;
  - «Vecchia prova» ha il tredicesimo cerchio «Colore attuale» e «20 min» e «50m» selezionati;
  - «Sessione PT» ha il nome in sola lettura con la spiegazione del negozio;
  - salvare scrive solo i campi cambiati, e «Ripristina» li riporta;
  - durata e margine sulla stessa riga;
  - con un dialog aperto la finestra scende a 390 px: il desktop resta con la bozza; chiuso il dialog, arriva il telefono.
- **Eliminazione:**
  - **Sessione PT:** «È in uso: 3 sessioni future, 1 cliente ha crediti di questo tipo e il negozio dei clienti la vende.» più i motivi. Pulsanti «Annulla» e «Rendi non prenotabile», niente «Elimina». «Rendi non prenotabile» scrive solo `client_bookable`.
  - **Test Funzionali:** è già non prenotabile, e resta solo «Chiudi».
  - **Free Session:** sessioni passate e «I crediti rimasti a 2 clienti archiviati…». «Elimina» rilegge l'uso (`event_types`, `bookings`, `block_allocations`, `extra_credits`, `booster_packs`, `training_blocks`, `profiles`), poi fa `DELETE`. Il toast non ha «Ripristina».
  - **Consulenza, uso non leggibile:** non elimina e il dialog lo dice.
  - **Consulenza, sessione futura aggiunta nel frattempo:** rifiuta e mostra «È in uso: 1 sessione futura.».
- **Telefono, scritture (390 px):**
  - eliminare Sessione PT: rifiutato col toast «Errore · È in uso: 3 sessioni future…»;
  - rinominarla: rifiutato col motivo del negozio;
  - « misurazione BIA »: rifiutato come doppione;
  - «Selezionato: Pavone», 11 cerchi;
  - riaccendere la tipologia di test scrive solo `client_bookable`.
- **Telefono, aspetto:** vedi Manifesto.

## Divergenze

- **Testo del luogo online:** «Online · link Meet creato alla prenotazione», non «link inviato alla prenotazione» (`event-type-rules.ts:176`). Vedi il §4.3.
- **Motivi dell'eliminazione per parte:**
  - «le sessioni perderebbero la tipologia» se ci sono solo sessioni future;
  - «i crediti…» se ci sono solo crediti;
  - «sessioni e crediti…» se ci sono entrambi (`event-type-usage.ts:187`).

  È il «coi motivi delle parti vere» del §3.4.

- **Già non prenotabile:** il testo è «È già non prenotabile: i clienti non possono prenotarla dall'app.» (`event-type-usage.ts:164`).
- **Il dialog d'eliminazione legge l'uso dal database all'apertura** (`event-type-delete-dialog.tsx:82`), per la sola tipologia, non dalla cache della pagina.
  - **Il motivo** (dalla revisione): la pagina ha solo le 1.000 sessioni più recenti del coach, e per una tipologia ferma da mesi il testo avrebbe taciuto che lo storico perde la tipologia.
  - **Stesso verdetto puro.** «Elimina» rilegge un'altra volta subito prima di cancellare.
- **Salvataggio e «Ripristina» campo per campo** (`event-type-actions.ts:208`, :227, :258). Il salvataggio scrive solo i campi cambiati rispetto alla riga da cui è partito il dialog, e «Ripristina» riporta solo quelli.
  - **Il motivo** (dalla revisione): un dialog aperto su valori vecchi riscriveva i −/+ o l'interruttore appena usati, e «Ripristina» li annullava.
  - **Effetto sul telefono:** non scrive più tutti i campi.
- **Nome invariato sempre valido** (`event-type-rules.ts:139`), anche con un doppione esatto già nel database, che prima non aveva controlli. Altrimenti una tipologia venduta dal negozio con un doppione non si sarebbe più potuta salvare.
- **Nome in sola lettura finché non si sa se il negozio la vende** (`event-type-dialog.tsx:133`). Se la lettura dei titoli fallisce resta modificabile, e controlla il modulo.
- **Sessioni future:** contano tutte le righe programmate con quella tipologia dopo adesso, anche quelle senza cliente o col coach come cliente (`event-type-usage.ts:93`). L'eliminazione toglierebbe la tipologia anche a loro.
- **Sessioni passate:** tutte le righe con quella tipologia fino ad adesso, qualunque stato (`event-type-usage.ts:94`).
- **Clienti con crediti:** conta solo chi è fra i clienti non eliminati del coach, come `useCoachClients` (`event-type-usage.ts:117`). Lo stesso vale nella rilettura (`event-type-store.ts:132`).
- **Una costante sola:** `AGENDA_STATUSES` di `today-agenda.ts`, dentro `isCountedSession` (`service-distribution.ts:25`), che ora usa anche la Distribuzione servizi. `COUNTED_STATUSES` non c'è più; i test della Panoramica restano verdi.
- **Oltre i limiti, i −/+ rientrano** (`event-type-rules.ts:37`): per esempio una durata 250 con − dà 240, un margine 90 con − dà 60. Il brief non lo dice.
- **Con un dialog aperto la route tiene il desktop** (`trainer.event-types.tsx:34-36`), come il Profilo con le modifiche non salvate.
- **`useCoachEventTypes({ fresh: true })`** (`queries.ts:368`) su entrambe le pagine. La query di prima aveva `staleTime` 0: senza, un dialog poteva partire da una riga vecchia di 5 minuti.
- **Chiave dei titoli del negozio:** `["booster_packs","active_titles"]`, diversa da `["booster_titles_active"]` di `client.index.tsx`, che restituisce un'altra forma. Un'altra chiave condivisa sarebbe stata lo stesso errore del §3.1.
- **Segnaposto dell'indirizzo:** «Indirizzo dello studio», non l'indirizzo d'esempio del prototipo.
- **`SegmentedControl` ha un `itemClassName` facoltativo** (`segmented-control.tsx:32`). Senza, durata e margine andavano a capo; gli altri usi non cambiano.
- **A 820 px la pagina scorre di 63 px, ma non per colpa sua.**
  - **Base e ramo:** succede sia su `origin/main` sia sul ramo: stessa misura, 883 contro 820.
  - **La causa:** l'intestazione della 01 («Impostazioni › Tipologie di sessione», ricerca, «Nuovo», campanella) non si restringe, e la colonna del layout (`trainer.tsx`, senza `min-w-0`) la segue.
  - **La prova:** con l'intestazione nascosta, lo scorrimento è 0.
  - **Cosa ho fatto:** niente; `trainer-header.tsx` non si tocca. A 820 px su `/trainer/clients` non succede.

## Cosa non ho fatto e perché

- **Archiviare le tipologie:** vuole una colonna, cioè una migrazione (§5). Fino ad allora una tipologia in uso non si elimina.
- **Chiudere la finestra fra rilettura e cancellazione:** servirebbe una funzione sul server che controlli e cancelli nella stessa transazione, cioè una migrazione. Oggi, se fra la rilettura e il `DELETE` qualcuno fissa una sessione o assegna un credito di quella tipologia, quella riga perde la tipologia.
- **Testi sbagliati del telefono (debiti):**
  - il sottotitolo col prezzo (`event-types-mobile.tsx:138`);
  - la conferma «Le prenotazioni esistenti non saranno modificate» (`event-type-service-card.tsx:163`);
  - i trattini di «Prezzo» e «prenotazioni questo mese», e «Blocca prenotazione lato cliente».

  Il §3.8 li lascia com'erano.

- **Il piè oltre le 1.000 righe.** «Clienti con crediti» può sottostimare oltre le 1.000 allocazioni o i 1.000 crediti extra per coach: `useCoachBlocks` e la lettura dei crediti extra non paginano, come il resto dell'app. Il dialog e l'eliminazione non ne dipendono: rileggono per la sola tipologia, col conteggio esatto (`event-type-store.ts:85`, :97).
- **Verifica con dati veri:** il divieto vale anche in lettura. Il finto backend non prova le policy RLS: in particolare la lettura di `booster_packs` e di `extra_credits` col conteggio esatto sotto RLS, e il `DELETE … RETURNING` su `event_types`.

## Cosa resta a Nicolò

- **Prova sull'anteprima Lovable, con dati veri:**
  - −/+ e interruttore su una tipologia, poi il Calendario;
  - il nome di «Sessione PT» in sola lettura;
  - eliminare una tipologia in uso: rifiutata;
  - eliminarne una non usata;
  - il dialog di «Free Session»: sessioni passate e archiviati;
  - dal telefono: le stesse scritture.
- **Decidere i commit `0bb1230` e `631d6c6`,** cioè il telefono che scrive con gli helper: tenerli (consigliato: una strada sola) o toglierli, tutti e due insieme.
- **Revisione del 02/10/2026:** migrazione per archiviare le tipologie e funzione sul server per eliminare senza finestra.
- **Passata 01:** l'intestazione che a 820 px fa scorrere la pagina Tipologie.
- **Da guardare, trovato di passaggio dalla ricognizione, non toccato:**
  - modificando una sessione non collegata a Google e mettendo esattamente 60 minuti, il trigger riporta la durata a quella della tipologia (`session-edit.ts:370`);
  - nella riprogrammazione lato cliente il margine nuovo non entra nello slot candidato (`reschedule-slots.ts:103`, `client-reschedule-sheet.tsx:132-150`).
