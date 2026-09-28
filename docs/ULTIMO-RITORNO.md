# Ultimo ritorno · Redesign coach, passata 09 (Integrazioni)

## IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **La base.** Ramo `redesign/coach-09-integrazioni` da `origin/main` = `711a441`, come atteso.
   - Misure: typecheck 0 errori · lint 0 errori e 22 avvisi · 510 test verdi in 34 file, sia con `TZ=Europe/Rome` sia con `TZ=UTC` · build riuscita.
   - Memoria impegnabile libera all'avvio: 7,1 GB. Tutti i comandi sono girati coi worker predefiniti.
   - `git diff --stat b780645 origin/main -- package.json bun.lock` è vuoto. Controllo positivo: `4434a77..02a4d2a` dà 2 file.
   - Nessun commit.
1. ☑ **La ricognizione** (§5). Quattro letture in parallelo, ognuna ricontrollata da uno scettico. Il §4.1 è confermato, con due precisazioni (dettagli sotto, in «Ricognizione»):
   - a `gcal.functions.ts:563` c'è una copia locale della regola, `isMidnightUtc`, non `isAllDayEvent`;
   - nel ripristino la scrittura dell'id (`:655-664`) non guarda l'errore e conta `created` comunque.
   - Nessun commit.
2. ☑ **Il numero che manca dal server** (§4.6). `eb03451`.
   - C2 dà `0` e `0`, con 3 righe aggiunte e 2 tolte.
   - Prettier ed ESLint puliti sul file; typecheck 0.
3. ☑ **La logica delle sincronizzazioni, pura** (§4.5, §4.6). `268045a`: 22 test verdi con `TZ=Europe/Rome` e con `TZ=UTC`; typecheck 0.
4. ☑ **Le regole della pagina, pure** (§4.2, §4.3, §4.5). `938c533`: 16 test verdi nei due fusi; typecheck 0.
5. ☑ **Il hook usa la logica pura** (§4.5-§4.8). `2285cce`.
   - C6 dà `1` e `0`; «Tutto già allineato» nel hook `0`.
   - 548 test verdi in 36 file; typecheck 0.
6. ☑ **Le due pagine** (§4.2-§4.9).
   - Commit, in ordine:
     - `c0e9dc8` estrazione: quattro differenze, vedi Manifesto;
     - `c5dd4b8` lettura e riconoscimento condivisi col telefono (C7: tutti gli intervalli finiscono prima della riga 206);
     - `dccf72b` stato misurato, «Sincronizza ora» e caselle;
     - `46eeaba` sessioni non su Google ed eventi solo su Google;
     - `3ce1301` sincronizzazione completa.
   - Typecheck 0 su ogni commit; C4 `0` su ogni file nuovo; lint 0 errori; test verdi; build riuscita.
7. ☑ **Il Calendario desktop** (§4.7). `7f0b248`.
   - C5 vuoto.
   - Il diff del file tocca solo `syncLabel` (il suo commento), `syncNow` e due import: 7 righe aggiunte, 4 tolte.
8. ☑ **Prove rosse e browser** (§7, §8). Nessun commit per le prove: i file stanno fuori dal repo.
   - Sei prove rosse su sei: ognuna cade sul difetto e torna verde col codice giusto. Le ho rifatte sul codice finale.
   - Giro nel browser sul codice finale: 77 controlli su 77, zero richieste esterne, zero funzioni server di Google eseguite.
   - Impronte del telefono uguali su `origin/main` e sul ramo, in quattro stati.
   - ⚠️ Il giro ha trovato un difetto della pagina: una misura con lo stesso tipo e la stessa ora veniva scartata (`integrations-desktop.tsx:124-133`). Corretto in `2464000`.
9. ☑ **Chiusura** (§9).
   - Controlli del §6 col risultato atteso.
   - `1695f92` CHECKLIST.
   - Push e PR [wolfwood370-cell/nc-calendar#75](https://github.com/wolfwood370-cell/nc-calendar/pull/75), aperta e non unita.
   - Questo file per ultimo.
10. ☑ **Revisione avversaria** (passo aggiunto, fra l'8 e il 9). Tre letture in sola lettura (logica e stato, aderenza alla specifica, telefono e Calendario), ogni rilievo ricontrollato da uno scettico.
    - 7 rilievi, 2 difetti confermati. Tutti e due chiusi in `311515d`:
      - il caso dell'errore dell'app nella completa aveva una frase in più rispetto al §4.5;
      - una passata piena del ripristino che non crea niente dava «completata con qualche problema» anche se le sessioni più vecchie non le aveva provate nessuno.
    - Dopo la correzione ho rifatto prove rosse, giro, impronte e controlli.

27/09/2026. Riferimenti:

- brief `design_handoff_coach_redesign/passes/09-integrazioni.md`;
- prototipo `designs/Coach Integrazioni.dc.html`;
- schermate `09-integrazioni-01/02`.

Audit I1-I4 e C1, con le correzioni del §4 del prompt.

## Ramo e hash

- **Ramo:** `redesign/coach-09-integrazioni`, pubblicato con `git push -u origin redesign/coach-09-integrazioni`.
- **Base:** `git rev-parse --short origin/main` = `711a441`, come atteso (merge della PR #74). Il clone era su `redesign/coach-08-disponibilita`; il ramo è partito da `origin/main`, prima di ogni modifica.
- **Commit, in ordine:**
  1. `eb03451` la riconciliazione dice quante sessioni ha confrontato;
  2. `268045a` sincronizzazioni con esito vero, logica pura coi test;
  3. `938c533` stato di Google, caselle e stima, regole pure coi test;
  4. `2285cce` una logica sola per le sincronizzazioni, e l'ora dell'ultimo successo;
  5. `c0e9dc8` la pagina di prima diventa quella del telefono;
  6. `c5dd4b8` lettura degli eventi e riconoscimento condivisi col telefono;
  7. `dccf72b` desktop: stato di Google misurato, «Sincronizza ora» e caselle;
  8. `46eeaba` desktop: sessioni non su Google ed eventi solo su Google;
  9. `3ce1301` desktop: sincronizzazione completa con fasi, esito e uscita bloccata;
  10. `7f0b248` Calendario: sincronizzazione a mano con esito vero;
  11. `2464000` dal giro nel browser: ogni sincronizzazione conta per il chip;
  12. `311515d` dalla revisione: esito vero anche con una passata piena di fallimenti;
  13. `1695f92` CHECKLIST;
  14. questo file, per ultimo.
- **Come ho committato:** file aggiunti per nome, mai `git add -A` o `git add .`.

## PR

[wolfwood370-cell/nc-calendar#75](https://github.com/wolfwood370-cell/nc-calendar/pull/75): «Redesign coach · passata 09 · Integrazioni», verso `main`.

- Aperta, non in bozza, **non** unita.
- L'ho aperta con `gh pr create`: `gh auth status` rispondeva autenticato.
- Nessun controllo CI: il repo non ha `.github`.

## Manifesto

**NUOVI (11)**

- Moduli puri e test (`src/lib/`):
  - `gcal-sync-run.ts` + test (23). La rapida e la completa senza rete né orologio nascosti, un'eccezione che vale come fallimento, la lista vuota che non è un successo, il ciclo del ripristino con i suoi quattro arresti, i testi della rapida e l'esito della completa nei sei casi. I tipi dei DTO li ricava con `import type` e `Awaited<ReturnType<…>>`.
  - `gcal-integration.ts` + test (17). Il chip dall'ultima misura, l'esito di una lettura fallita, «Ultimo aggiornamento», la stima coi filtri dei due server, i testi della completa, gli eventi solo su Google, il riconoscimento dal titolo e il payload dell'importazione.
- `src/hooks/use-gcal-review.ts`: la lettura degli eventi con la chiave di prima; `fresh` per il desktop (`refetchOnMount: "always"`, `retry: 1`).
- Componenti:
  - `integrations-mobile.tsx`: la pagina di prima;
  - `integrations-desktop.tsx`: stato, misure, «occupato», completa, blocco dell'uscita;
  - `integrations-gcal-card.tsx`;
  - `integrations-gcal-lists.tsx`;
  - `integrations-import-dialog.tsx`;
  - `integrations-full-sync-card.tsx`.

**MODIFICATI (7)**

- `src/lib/gcal.functions.ts`: solo le tre righe di `checked` (C2).
- `src/hooks/use-gcal-sync.ts`.
  - La logica passa su `gcal-sync-run.ts`, e `runReconcile` restituisce il risultato della rapida.
  - `lastSyncAt` nasce da `gcal_reconcile_ok` e si aggiorna solo a un successo.
  - `markSynced` rilegge la chiave.
  - `useGcalSync(…, { auto: false })` per Integrazioni.
  - `useGcalForceSync` usa la completa pura e mostra i toast dell'esito.
  - Restano esportati `LAST_SYNC_OK_KEY`, `gcalSyncApi`, `rememberSyncOk`, `readSyncOk`, `rememberSyncAttempt`, `notifySync`.
- `src/routes/trainer.integrations.tsx`: monta una sola versione, telefono o desktop, e tiene il desktop montato durante la completa. La descrizione di `head()` è nuova.
- `src/components/calendar-gcal-review.tsx`: lettura, riconoscimento e payload condivisi, senza righe di JSX (C7).
- `src/components/calendar-desktop.tsx`: `syncLabel` (commento), `syncNow` e due import.
- `design_handoff_coach_redesign/CHECKLIST.md`, e questo file.

**NON TOCCATI:** tutto il resto. In particolare, C1 dà zero righe:

```
git diff origin/main..HEAD --stat -- supabase/ bun.lock package.json src/integrations/supabase/types.ts .github src/lib/gcal.server.ts src/lib/gcal-colors.ts src/lib/all-day-event.ts src/lib/calendar-events.ts src/components/trainer-header.tsx src/components/trainer-bottom-nav.tsx src/components/trainer-sidebar.tsx src/components/gcal-sync-pill.tsx src/components/gcal-full-sync-button.tsx src/components/calendar-mobile.tsx src/components/calendar-header.tsx src/components/integration-card.tsx src/components/availability-desktop.tsx src/components/availability-mobile.tsx src/components/client-profile-desktop.tsx 'src/routes/client.*'
(nessuna riga)
```

Il controllo positivo `git diff 4252ab9..711a441 --stat -- src/components/gcal-sync-pill.tsx` dà `43 +++…`, cioè una modifica vera la vede.

**Controlli del §6, sul ramo finale**

|     | Risultato                                                                                                                                               | Atteso             | Positivo                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------- |
| C1  | vuoto                                                                                                                                                   | vuoto              | pillola della 08: 43 righe                                                    |
| C2  | `0` e `0`, numstat `3 2`                                                                                                                                | `0` e `0`, 3+ e 2− | —                                                                             |
| C3  | `git diff c0e9dc8..HEAD -- src/components/integrations-mobile.tsx` vuoto                                                                                | vuoto              | —                                                                             |
| C4  | `0` su `integrations-desktop`, `-gcal-card`, `-gcal-lists`, `-import-dialog`, `-full-sync-card`, `use-gcal-review`, `gcal-integration`, `gcal-sync-run` | `0`                | `integrations-mobile.tsx` dà `5`, come la route di `origin/main` (`5`)        |
| C5  | nessuna riga                                                                                                                                            | nessuna riga       | su `origin/main` 2 righe: `calendar-desktop.tsx:437` e `use-gcal-sync.ts:141` |
| C6  | `1` e `0`                                                                                                                                               | `1` e `0`          | su `origin/main` `2` e `1`                                                    |
| C7  | `-16,0 ok`, `-19 ok`, `-41 ok`, `-86,10 ok`, `-142,19 ok`, `-163,3 ok`, `-177,9 ok`                                                                     | niente «TOCCA JSX» | —                                                                             |

**La prova del telefono**

- **Confronto d'estrazione.** `diff <(git show origin/main:src/routes/trainer.integrations.tsx) <(git show c0e9dc8:src/components/integrations-mobile.tsx)` dà due soli blocchi:
  - `1c1,8`: l'import di `createFileRoute` lascia il posto al commento in testa, che non usa nessuno dei tre termini tecnici;
  - `11,31c18`: la route tolta e `function IntegrationsPage()` diventa `export function IntegrationsMobile()`.

  Dopo l'estrazione il file non cambia più (C3).

- **Impronte a 390 px.** Finto backend, Google finto e ora fissa; DOM visibile di `<main>` e PNG a pagina intera. Uguali su `origin/main` (`711a441`) e sul ramo finale (`311515d`), sia nel DOM sia nel PNG:

  | Stato                                         | DOM                | PNG                |
  | --------------------------------------------- | ------------------ | ------------------ |
  | Integrazioni, pannello chiuso                 | `e3c1451fc364a629` | `a650db15b42eb5ff` |
  | Integrazioni, pannello aperto                 | `8ca47b487346a03f` | `f8f44d717475f57b` |
  | Calendario, con le due chiavi alla stessa ora | `4ddda032070cd226` | `8f2ff848b9c54907` |
  | Calendario senza chiavi                       | `b646ef964d38314a` | `c7bd38c2b7be92a8` |

  Nell'ultimo stato l'etichetta «Ultima sync: ora» è la stessa per due ragioni diverse. Su `origin/main`, in sviluppo, il doppio montaggio di StrictMode rilegge la chiave dei tentativi appena scritta. Sul ramo è l'ora di un successo vero. In produzione `origin/main` direbbe «mai»: è la correzione del §4.7.

## Ambiente

- **Sistema:** Windows 11 Home, clone di Nicolò, senza worktree per il lavoro.
  - Due worktree temporanei stavano nella cartella di lavoro della sessione, fuori dal repo, con `node_modules` collegato da una giunzione:
    - `origin/main`, per le impronte;
    - il ramo, per le prove rosse e il typecheck commit per commit.
  - Li ho tolti alla fine, staccando prima le giunzioni. `node_modules` del repo è intatto.
- **Versioni:** Bun 1.3.14, Node v24.12.0.
- **Dipendenze:** nessuna installazione, né nel repo né fuori.
- **Memoria:** 7,1 GB impegnabili liberi all'avvio. Tutti i comandi coi worker predefiniti, nessun errore di memoria.
- **Browser:**
  - Playwright 1.64.0-alpha della cache npx del server MCP Playwright;
  - la headless shell di Chromium in `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1200`, la stessa della 07 e della 08.
- **Finto backend:** quello della 08 (PostgREST in memoria, realtime finto, Google Fonts vuoti, tutto il resto bloccato e contato, `/_serverFn` contate), con un seme nuovo:
  - 3 clienti e 3 tipologie;
  - 10 sessioni, fra cui 2 da assegnare, 1 in programma senza evento, 1 svolta senza evento, 1 impegno personale e 1 annullata;
  - 2 eventi solo su Google.
- **Come ho sostituito il modulo di Google:** un modulo finto (`gcal-finto.js`, fuori dal repo), con le stesse sette esportazioni. Risponde da `window.__gcalFake`, che la prova comanda: risposte riuscite, fallite, lente, lista vuota, errore dell'app, code di risposte. Registra ogni chiamata con i dati e con quante ne erano in corso insieme.
  - L'alias sta in una configurazione di Vite fuori dal repo, che chiama la funzione `async (env)` di `vite.config.ts` del repo e mette in testa, come array, `{ find: /^@\/lib\/gcal\.functions$/, … }` prima dell'alias `@` in forma d'oggetto.
  - Vite parte con la cartella del repo come cartella corrente. `server.fs.allow` include la cartella del modulo finto.
  - `vite.config.ts` resta com'è.
  - L'importazione finta scrive la sessione nel PostgREST finto, così l'elenco si aggiorna come col server vero.
- ⚠️ **Una cancellazione fuori dalla cartella di lavoro.** Una schermata di prova è finita in `C:\c\Users\…\p1.png`: Git Bash aveva passato a Node un percorso in stile `/c/…`. Dopo averla spostata ho cancellato `C:\c` con `rm -rf /c/c`, pensando che l'avesse creata Playwright. Prima di cancellare ho guardato solo la sottocartella della schermata, non tutto `C:\c`: se prima della sessione c'era altro, è andato perso, e non posso verificarlo. Da lì ho usato solo percorsi Windows espliciti e nessuna cancellazione fuori dalla cartella di lavoro.

## Controlli

Base (`711a441`) e fine (`311515d`, ultimo commit di codice), stessi comandi e stesso PC.

|                               | Base                | Fine                |
| ----------------------------- | ------------------- | ------------------- |
| `bun run typecheck`           | 0 errori            | 0 errori            |
| `bun run lint`                | 0 errori, 22 avvisi | 0 errori, 22 avvisi |
| `TZ=Europe/Rome bun run test` | 510 in 34 file      | 550 in 36 file      |
| `TZ=UTC bun run test`         | 510 in 34 file      | 550 in 36 file      |
| `bun run build`               | riuscita            | riuscita            |

- **Typecheck commit per commit:** nel worktree temporaneo del ramo `tsc --noEmit` dà 0 errori su tutti e 12 i commit di codice, da `eb03451` a `311515d`.
- **I 40 test nuovi:**
  - `gcal-sync-run.test.ts`: 23;
  - `gcal-integration.test.ts`: 17.

## Ricognizione (§5)

Quattro letture in parallelo, ognuna ricontrollata da uno scettico. Riferimenti su `origin/main`.

1. **Chi chiama `gcal.functions.ts`.**
   - Metodo e copertura: 7 esportazioni su 7 (`:146`, `:312`, `:330`, `:362`, `:506`, `:704`, `:786`). Grep per nome e per import, anche dinamici: 7 file su 7 importano da `@/lib/gcal.functions`, nessun import dinamico, nessun `import type`.
   - I file:
     - `use-gcal-sync.ts:19`: riconciliazione e ripristino;
     - `use-book-confirm.ts:23`: creazione, con la chiamata a `:244`;
     - `calendar-gcal-review.tsx:41`: lettura a `:91` e importazione a `:176`;
     - `calendar-store.ts:14`: modifica, a `:103`;
     - `client-reschedule-sheet.tsx:43`: modifica, a `:222`;
     - `queries.ts:5`: cancellazione e modifica, a `:549` e `:640`;
     - `session-store.ts:14`: creazione a `:104`, dentro `createGoogleEvent` (`:77-125`), e cancellazione a `:185`.
   - Il §4.1 è confermato: riconciliazione e ripristino partono insieme in `use-gcal-sync.ts:61`, e la completa sta a `:101-154`.
   - Precisazioni:
     - `createGoogleEvent` la usano anche `session-create.ts:184-190`, `cancel-session.ts:318` e `profile-session.ts:241`;
     - a `gcal.functions.ts:563` c'è `isMidnightUtc`, una copia locale della regola di `isAllDayEvent`, non un import;
     - le scritture dell'id (`:196-202`, `:655-663`) stanno dentro `if (r.googleEventId)` ma non filtrano `.is("google_event_id", null)`;
     - nel ripristino `created++` scatta anche se la scrittura fallisce (`:655-664`).
2. **Chi legge o scrive le due chiavi.** 6 file su 6: 4 di codice, 2 di sola documentazione. Grep delle stringhe, delle costanti e dei loro import su 272 file `.ts`/`.tsx`.
   - `gcal_reconcile_last` (`use-gcal-sync.ts:22`, doppione in `calendar-desktop.tsx:101`):
     - si legge a `use-gcal-sync.ts:55` e `:84`;
     - si scrive a `use-gcal-sync.ts:86` e `:131`, e a `calendar-desktop.tsx:429`.
   - `gcal_reconcile_ok` (`use-gcal-sync.ts:30`):
     - si scrive a `:34`, chiamata da `:62` e da `:126`;
     - la legge solo la pillola della 08 (`gcal-sync-pill.tsx:13`, `:24`).
   - Precisazione: anche l'intestazione del Calendario del telefono mostra `lastSyncAt` (`calendar-header.tsx:82-91`, `:159`), quindi con questa passata si corregge da sola.
3. **Chi monta cosa.**
   - `CalendarGcalReview`: `trainer.integrations.tsx:91` e `calendar-mobile.tsx:230`.
   - `GcalFullSyncButton`: `trainer.integrations.tsx:98` e `calendar-mobile.tsx:238`, con `onSynced={markSynced}`.
   - `useGcalSync`: solo `trainer.calendar.tsx:39`.
   - Il desktop del Calendario monta anche il telefono, nascosto (`trainer.calendar.tsx:42-44`), e viceversa (`:45-47`).
   - Nella route di oggi i tre termini tecnici stanno in 5 righe (7 occorrenze: a `:85` e `:121` due per riga).
4. **Firme.**
   - `notOnGoogle<B extends GridBooking>(bookings, now): B[]` e `notOnGoogleLabel(n)` (`calendar-events.ts:134-152`).
   - `isToAssign` e `countToAssign(bookings | undefined): number` (`to-assign.ts:14-20`).
   - `createGoogleEvent(sessionId): Promise<boolean>`, senza toast suoi: i due messaggi sono in `calendar-desktop.tsx:415-418`.
   - `formatAgo(iso, now)` (`notifications.ts:106-114`).
   - `useCoachBookings`: le colonne di `BookingRow` servono tutte (`status`, `deleted_at`, `google_event_id`, `is_personal`, `client_id`, `scheduled_at`, più `event_type_id`, `session_type`, `duration_min`, `title`). Il filtro `deleted_at is null` è già nella query, con un limite di 1000 (`queries.ts:235-247`).
   - Precisazione: `isToAssign` esclude `cancelled` ma non `late_cancelled` (`to-assign.ts:15`). Il badge e la casella lo seguono.

## Prove rosse

Nella copia temporanea del ramo, fuori dal repo. Per ogni prova ho applicato il difetto, lanciato il test del file, rimesso il file com'era e rilanciato. Le ho rifatte sul codice finale (`311515d`); la copia è tornata pulita.

| #   | Difetto                                                                                                       | Rosso           | Il test che cade                                                                                                                    | Verde    |
| --- | ------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | la completa dà «completata» anche se la riconciliazione fallisce (ramo `google` di `fullSyncOutcome` saltato) | 2 falliti su 23 | «2 · riconciliazione fallita: mai «completata», anche col ripristino fallito» (`expected 'partial' to be 'google'`) e la precedenza | 23 su 23 |
| 2   | ciclo del ripristino senza l'arresto su «nessun progresso»                                                    | 3 falliti su 23 | «un ripristino che fallisce sempre fa una passata sola» (`expected 20 to be 1`), le fasi e la passata piena                         | 23 su 23 |
| 3   | il chip prende la prima misura invece dell'ultima                                                             | 3 falliti su 17 | «vince l'ultima misura» (lettura riuscita, poi «Sincronizza ora» fallita: `connected` invece di errore)                             | 17 su 17 |
| 4   | lista vuota di Google trattata come «nessuna differenza»                                                      | 1 fallito su 23 | «lista vuota di Google: non è un successo né «nessuna differenza»» (`expected true to be false`)                                    | 23 su 23 |
| 5   | la stima conta anche le `completed` con evento                                                                | 1 fallito su 17 | «conta le sessioni coi filtri dei due server» (`reconcile: 4` invece di `3`)                                                        | 17 su 17 |
| 6   | la rapida dà `ok` con la sola riconciliazione riuscita                                                        | 1 fallito su 23 | «ripristino fallito: non è riuscita anche se la riconciliazione sì» (`expected true to be false`)                                   | 23 su 23 |

## Verifica nel browser

- **Condizioni:** ora fissa 25/09/2026 10:40; desktop 1440×900 e telefono 390×844; finto backend e Google finto. Giro sul codice finale: 77 controlli su 77.
- **A · Accettazione.**
  - Con la lettura fallita: «Errore di connessione» e il riquadro «Google Calendar non risponde», senza «dalle».
  - La lettura fresca fa 2 chiamate: una più un solo nuovo tentativo.
  - «Avvia» apre il dialog, poi dice «Impossibile avviare: Google Calendar non risponde.» e non chiama il ripristino.
  - Con la lettura riuscita: «Collegato», senza riquadro.
  - Nel Calendario desktop nessun pulsante di sincronizzazione completa per `getByRole`. Nel DOM c'è quello del telefono, nascosto: non si corregge.
- **B · «Sincronizza ora».**
  - Senza chiave, «Ultimo aggiornamento» dice «mai da questo browser».
  - Senza differenze:
    - le due chiamate partono insieme, sulla finestra di default;
    - la chiave dei tentativi viene scritta prima;
    - toast «Sincronizzato: nessuna differenza trovata.», e «Ultimo aggiornamento» passa ad «adesso».
  - Con differenze: un solo toast, «Sincronizzato con Google Calendar.» con «1 spostata su Google · 2 eventi ricreati su Google».
  - Fallita:
    - il toast di Google che non risponde;
    - chip in errore e il riquadro;
    - «Ultimo aggiornamento» resta «5 ore fa»;
    - la rilettura automatica dopo la sincronizzazione riesce, e il chip resta in errore.
  - Di nuovo riuscita: «Collegato» e «adesso».
  - Lista vuota:
    - il riquadro «Google Calendar ha risposto senza eventi»;
    - `gcal_reconcile_ok` non cambia;
    - «Avvia» rifiuta col testo della lista vuota.
  - Errore dell'app dopo una lettura riuscita: il chip resta «Collegato», e il toast è quello dell'app.
  - Prima lettura con «Permesso negato»: «Stato non disponibile» col messaggio dell'app, senza riquadro.
- **C · Caselle.**
  - «Eventi da assegnare» dà 2, come il badge della sidebar; il link è `/trainer/calendar?filter=assign`.
  - «Sessioni non su Google» dà 1, con la riga «Sara Neri · Sessione PT» e «ven 2 ott · 11:00–12:00».
  - «Ricrea su Google» fallito: il suo messaggio, senza «Ripristina».
  - Riuscito: chiama `createGoogleEvent` per quella sessione; la riga sparisce e la casella va a 0.
- **D · Eventi solo su Google.**
  - «Eventi solo su Google (2)» in ordine di data, con la riga di spiegazione.
  - Il riconoscimento dal titolo propone cliente e tipologia; nel dialog nessun «NON» maiuscolo.
  - Dopo l'importazione l'evento esce dall'elenco.
  - Nelle tre modalità (cliente, consulenza, personale) il finto riceve dal desktop **lo stesso payload** che riceve dal pannello del telefono.
- **E · Completa.**
  - Descrizione corretta; nel dialog «Vengono controllate circa 7 sessioni.» (5 da riconciliare, 2 da ricreare).
  - Fase 1 «Ricreo su Google gli eventi mancanti: 0 di 2», poi fase 2 «Controllo con Google le sessioni in programma…».
  - Mentre lavora, «Sincronizza ora», «Ricrea su Google» e «Importa» sono fermi.
  - Navigazione bloccata col toast «Attendi la fine della sincronizzazione completa.»:
    - il link della sidebar;
    - la freccia indietro dentro l'app (si entra dalla Disponibilità), senza `beforeunload`.
  - Chiudere la scheda chiede conferma (`beforeunload`).
  - A finestra stretta (600 px) il desktop resta montato durante la completa e fino a «Chiudi»; dopo «Chiudi» torna la pagina del telefono.
  - La riconciliazione è una chiamata sola, `2026-01-01T00:00:00.000Z` → `2026-12-24T08:40:00.000Z`, e `gcal_reconcile_ok` si aggiorna.
  - I sei casi con i loro testi e il chip giusto dopo ognuno:
    - errore dell'app → chip invariato;
    - Google → errore;
    - lista vuota → errore;
    - in parte → collegato;
    - con problemi → collegato;
    - riuscita → collegato.
- **F · Occupato.**
  - Con una rapida lenta: «Sincronizzo…», e «Avvia», «Ricrea su Google» e «Importa» fermi. I clic forzati non fanno partire niente.
  - Con un «Ricrea su Google» lento il resto è fermo.
  - Nel registro del finto nessuna scrittura si sovrappone a un'altra (riconciliazione e ripristino della stessa rapida a parte).
- **G · Calendario desktop.**
  - Col freno dei 10 minuti e senza `gcal_reconcile_ok`: «Google Calendar · non ancora sincronizzato», e nessuna riconciliazione all'apertura.
  - Con la chiave di 4 minuti fa: «sincronizzato 4 min fa».
  - La sincronizzazione a mano fallita dà il toast di Google che non risponde; l'etichetta non cambia, e non compare nessun «allineato».
  - Riuscita: «sincronizzato ora».
- **H · Telefono.** La completa con Google spento dà «Sincronizzazione non riuscita» con «Google Calendar non risponde…», non «Tutto già allineato» né «completata». Le impronte sono sopra, nel Manifesto.
- **Z · Traffico ed errori.** Zero richieste esterne bloccate, zero `/_serverFn`, zero errori in console o nella pagina (a parte i `console.error` voluti della sincronizzazione fallita, esclusi dal conteggio).

## Divergenze

1. **Clausola sulle sovrapposizioni al singolare quando lo spostamento è uno solo**, anche se ci sono altre differenze (`gcal-sync-run.ts:320-323`). Con 1 spostata e 2 annullate: «…le ha allineate, tranne se lo spostamento finirebbe sopra un'altra sessione: in quel caso resta all'orario di prima». La forma plurale del §4.5 («gli spostamenti… quelli restano») sarebbe sbagliata con una spostata sola. Dove il §4.5 dà il testo, esce identico.
2. **«Completata in parte» anche dopo le 20 passate o dopo una passata piena che non crea niente**, non solo col ripristino fallito (`gcal-sync-run.ts:292`, `:396`). In quei casi non si sa quante sessioni restano senza evento, e «completata con qualche problema» lo taceva. Il secondo caso viene dalla revisione.
3. **«Nessun evento ricreato su Google.»** al posto di «Nessun evento da ricreare su Google.» quando il ripristino è a metà o ha avuto fallimenti (`gcal-sync-run.ts`, `summaryLines`): lì «da ricreare» sarebbe falso.
4. **Dialog della completa.**
   - Con N = 1 il testo è «Viene controllata circa 1 sessione.» (`gcal-integration.ts:217`): «Vengono controllate circa 1 sessione» non è italiano.
   - Con le sessioni non ancora lette resta solo la seconda frase (`:213`).
5. **Testi della rapida.**
   - Nei tre fallimenti il tono è d'avviso, come nel prototipo (`tone: "warn"`), e sotto c'è sempre quello che è comunque successo: anche per l'errore dell'app e la lista vuota, non solo per Google che non risponde (`gcal-sync-run.ts:192-198`).
   - Con soli problemi (non ricreati o non aggiornate) il titolo resta «Sincronizzato con Google Calendar.», in tono d'avviso.
6. **Il chip ignora anche la prima lettura, se finisce dopo che una sincronizzazione ha già risposto** (`gcal-integration.ts:63`). È la regola del §4.2 («le letture dopo una sincronizzazione non contano») applicata anche quando la lettura all'apertura è ancora in volo. A parità d'ora vince la sincronizzazione (`:68`).
7. **Il desktop resta montato fino a «Chiudi» dell'esito**, non solo mentre la completa lavora (`integrations-desktop.tsx:291`): altrimenti, a finestra stretta, l'esito sparirebbe col desktop prima di essere letto.
8. **Dialog d'importazione.** Testi riscritti nello stile dei dialog del coach:
   - «Non scala crediti: se serve, gestiscili a parte.», «Tipologia di sessione (facoltativa)», «Predefinita (Sessione PT)» (`integrations-import-dialog.tsx:34-50`, `:149`, `:156`);
   - toast «Evento importato nell'app.», «L'evento era già nell'app.», «Importazione non riuscita» (`integrations-desktop.tsx:300-318`).

   Modalità e payload sono quelli del telefono.

9. **Righe «non su Google» con « · non presente su Google» dopo l'ora** (`integrations-gcal-lists.tsx:49`), come nel prototipo.
10. **Barra in attesa della riconciliazione.** È una barra piena che pulsa, `animate-pulse`, ferma con la riduzione del movimento (`integrations-full-sync-card.tsx:168`). Per una barra che scorre servirebbe un keyframe nuovo in `styles.css`.
11. **«Ultimo aggiornamento» sotto il minuto dice «adesso» esplicito** (`gcal-integration.ts:120`): `formatAgo` arrotonda 30 secondi a «1 min fa». Ogni minuto la pagina rilegge anche la chiave, così vede i successi di altre schede.
12. **La riconciliazione all'apertura del Calendario resta muta quando fallisce senza cambiare niente** (`use-gcal-sync.ts:118-126`), come prima. L'etichetta ora dice l'ora dell'ultimo successo, quindi non mente. Un toast a ogni apertura con Google giù sarebbe rumore; il prompt corregge solo la sincronizzazione a mano.

## Debiti

- **Sovrapposizione contata come spostata e annullamenti falliti non contati.** È il server: `reconcile_gcal_move` e `reconcile_gcal_cancel` sono `RETURNS void`, e `gcal.functions.ts:445` e `:453-462` li contano come riusciti. L'esito lo dice con la clausola sulle sovrapposizioni. Correggerlo vuole una migrazione.
- **Due ripristini insieme.**
  - Fra schede diverse non si può impedire.
  - Nella stessa scheda, un ripristino automatico del Calendario ancora in corso quando si apre Integrazioni può girare insieme a «Sincronizza ora» o alla completa: lo stato «occupato» è della pagina, come chiede il §4.2. C'era già su `origin/main`. Il rilievo della revisione è stato confutato perché fuori specifica, ma il rischio resta.
  - La correzione vera sta nel server: `.is("google_event_id", null)` nelle scritture dell'id (`gcal.functions.ts:196-202`, `:655-663`). La scrittura del ripristino, poi, non guarda l'errore e conta `created` comunque (`:655-664`): un id non salvato dà un evento doppio alla passata dopo.
- **Finestre del ripristino e della riconciliazione da allineare prima del 2027.** Il ripristino parte dal 1° gennaio 2026 fisso (`gcal.functions.ts:526`, copiato in `gcal-integration.ts`, `REPAIR_FROM_ISO`); la riconciliazione dal 1° gennaio dell'anno (`gcal-sync-run.ts`, `fullSyncWindow`).
- **Il telefono dice «Calendario aggiornato» qualunque cosa risponda Google** (`calendar-mobile.tsx:218-220`). Il file non si tocca in questa passata.
- **«Esci» della sidebar non è fermato durante la completa** (`trainer-sidebar.tsx:147-150`). `signOut()` parte prima di `navigate`: il blocco ferma la navigazione, ma la sessione è già chiusa, e le chiamate successive della completa falliscono.
- **`isAllDayEvent` cerca «T00:00:00Z», e dal database arriva «T00:00:00+00:00»** (`all-day-event.ts:17`). La copia del server ha lo stesso difetto (`gcal.functions.ts:563`): un evento giornaliero senza id Google verrebbe spinto su Google alle 02:00. La stima lo conta come lo conta il server, e un test lo fissa.
- **Il `total` del ripristino è contato dopo il filtro dei giornalieri** (`gcal.functions.ts:551-564`). Una passata piena può quindi risultare meno di 50, e allora la completa la considera completa anche se ne restano (`gcal-sync-run.ts:292`).
- **«Ultimo aggiornamento» è di questo browser** (`gcal_reconcile_ok`). Salvarlo sul server vuole una migrazione: revisione del 02/10/2026.
- **La stima della completa è del solo coach, sulle ultime 1000 sessioni** (`gcal-integration.ts:152-160`, `queries.ts:235`). La riconciliazione del server guarda tutti i coach; oggi il coach è uno.
- **`isToAssign` esclude `cancelled` ma non `late_cancelled`** (`to-assign.ts:15`). Badge e casella coincidono, ma possono contare un evento annullato in ritardo. È della 01.

## Cosa non ho fatto e perché

- **Niente «troppo vecchia» nel chip, niente ora salvata sul server.** È il §4.2: servirebbe una migrazione.
- **Nessuna modifica al server oltre a `checked`.** Le correzioni vere di sovrapposizioni, doppioni, finestra fissa e giornalieri stanno in `gcal.functions.ts` e nelle funzioni SQL (§6).
- **Il pulsante della completa del telefono, nascosto nel DOM del Calendario desktop, non l'ho corretto** (§8).
- **Nessun blocco dell'uscita per «Sincronizza ora», «Ricrea su Google» e «Importa»:** il §4.5 lo chiede solo per la completa.
- **Nessuna prova con Google vero o col database vero:** il login Google c'è solo sull'hosting Lovable, e il §6 lo vieta.

## Cosa resta a Nicolò

Prove sull'hosting Lovable, coi dati veri, una alla volta.

1. **Stato di Google.** Aprire Integrazioni dal computer.
   - Atteso: «Verifico…», poi «Collegato» entro un paio di secondi.
   - Poi «Sincronizza ora»: con i dati di oggi, «Sincronizzato: nessuna differenza trovata.».
   - Non scrive niente di irreversibile: al massimo riallinea sessioni spostate o annullate su Google.
2. **Caselle.**
   - «Eventi da assegnare» deve dare lo stesso numero del badge della sidebar (nel backup del 26/09: 2), e il clic porta al Calendario filtrato.
   - «Sessioni non su Google» deve essere 0 (backup: 0).
3. **Completa.** Il dialog deve dire circa 37 sessioni (backup del 26/09).
   - Avviarla scrive sul database vero, come faceva già il pulsante «Sincronizza tutto dal 1° gen».
   - Atteso: «Sincronizzazione completata» con «Controllate 37 sessioni in programma dal 1° gennaio.», se nessuno ha toccato niente dal 26/09.
   - Per tornare indietro: una sessione annullata per errore si ripristina dal Calendario; uno spostamento si riporta a mano.
4. **«Ricrea su Google»**, solo se compare una sessione non su Google. **Manda l'invito al cliente** (`gcalCreateEvent`, con gli inviti attivi).
   - Per tornare indietro: annullare l'evento su Google, e il cliente riceve la cancellazione.
   - Se non vuoi inviti, non provarlo con un cliente vero.
5. **«Importa»**, solo se compare un evento solo su Google. Crea una sessione nell'app senza scalare crediti.
   - Per tornare indietro: eliminare la sessione dal Calendario («Elimina impegno» o «Annulla sessione»); l'evento su Google resta.
6. **Calendario desktop.** L'etichetta «sincronizzato N min fa» deve dire l'ora dell'ultimo successo. Con Google spento (se capita), «Sincronizza ora» deve dirlo.
7. **Telefono.** Integrazioni e Calendario devono restare com'erano.
8. **C:\c.** Se su questo PC esisteva una cartella `C:\c` con qualcosa dentro prima del 27/09 sera, l'ho cancellata io (vedi «Ambiente»). Va recuperata da un backup, se ce n'è uno.
