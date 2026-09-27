# Ultimo ritorno · Redesign coach, passata 08 (Disponibilità)

## IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ⚠️ **La base.** Ramo `redesign/coach-08-disponibilita` da `origin/main` = `4252ab9`. Typecheck 0 errori · lint 0 errori e 22 avvisi · test 441 verdi in 29 file con `TZ=Europe/Rome` e con `TZ=UTC` · build riuscita. **Deviazione:** sul PC la memoria impegnabile libera era 1,3 GB su 40 (un processo `re9demo` ne teneva 10,8 GB privati, `vmmem` 4 GB). `bun run test` coi worker predefiniti (20 core) usciva con `JavaScript heap out of memory` e `bun run build` con `memory allocation of 2220180 bytes failed`. I test della base li ho misurati con `--maxWorkers=2`; Nicolò ha chiuso la demo alle 19:15 e da lì tutto è girato coi comandi normali. Nessun commit.
1. ☑ **La ricognizione** (§5). Cinque letture in parallelo, ognuna ricontrollata da uno scettico: §4.2 e §4.3 confermati, con le precisazioni scritte sotto («Ricognizione»). Nessun commit.
2. ☑ **Le regole pure della settimana e l'anteprima** (§4.4, §4.5). `b6216e8`: 22 test verdi, typecheck 0.
3. ☑ **Le regole pure delle eccezioni** (§4.7). `d501507`. Il fuso passa davvero su Windows (`TZ=UTC` dà `0`, `TZ=Europe/Rome` dà `-120`; vitest stampa l'ora di partenza nel fuso dato); il file è verde con tutti e due. Dalla revisione: `b36d0df`, i periodi si raggruppano confrontando i motivi in byte.
4. ☑ **Le regole di prenotazione in un posto solo** (§4.3). `dae0894`. Controllo del §4.3: `0`; positivo: `1`.
5. ☑ **Le scritture** (§4.6, §4.7). `6335086`: 17 test verdi, errori a metà compresi.
6. ☑ **Google, solo quello che si sa** (§4.8). `56ff5e8`. Controllo del §4.8: `0`; positivo: `2`.
7. ☑ **Le due pagine** (§4.4-§4.10). Estrazione `4bec5ac` (quattro differenze, vedi Manifesto), poi `fcc900b` orario e barra, `b45ec8d` anteprima e regole, `919b7c3` eccezioni, `68f2bf7` pillola. Typecheck 0 su ognuno (vedi Controlli) ed ESLint 0 errori sui file di ogni commit.
8. ☑ **Il telefono scrive con gli helper** (§4.10). `3fdb4e7`: nessuna riga di JSX nel diff dal commit d'estrazione; impronte a 390 px uguali su `origin/main` e sul ramo.
9. ☑ **Prove rosse e browser** (§7, §8). Sei prove rosse, ognuna rossa sul difetto e verde col codice giusto. Giro nel browser sul codice finale: 98 controlli su 98, zero richieste bloccate, zero chiamate alle funzioni server. Impronte del telefono uguali nei tre stati, prese di nuovo sul codice finale. Nessun commit.
10. ☑ **Chiusura** (§9). Controlli del §6 a zero; `b24c48f` CHECKLIST; questo file per ultimo; push e PR [#74](https://github.com/wolfwood370-cell/nc-calendar/pull/74), aperta e non unita.
11. ☑ **Revisione delle pagine** (passo aggiunto, fra il 9 e il 10). Tre letture avversarie in sola lettura (stato e dati, aderenza al prompt, telefono e route), ogni rilievo verificato da uno scettico: 21 rilievi, 16 confermati, cioè 11 difetti diversi. Ne ho chiusi 9 in `93a62fe`, `e70b38b`, `d9399e5`; gli altri 2 sono fra i Debiti. Prima, la stessa revisione sui moduli puri aveva confermato 1 rilievo su 10 (`b36d0df`).

27/09/2026. Brief `design_handoff_coach_redesign/passes/08-disponibilita.md`, prototipo `designs/Coach Disponibilita.dc.html`, schermate `08-disponibilita-01/02/03`. Audit D1-D6, con le correzioni del §4 del prompt.

## Ramo e hash

- **Ramo:** `redesign/coach-08-disponibilita`, pubblicato con `git push -u origin redesign/coach-08-disponibilita`.
- **Base:** `git rev-parse --short origin/main` = `4252ab9`, come atteso (merge della PR #73). Il ramo è partito da lì, prima di ogni modifica. Il clone era su `main` locale, non su `redesign/coach-07-tipologie`: non cambia niente, il ramo viene da `origin/main`.
- **Commit, in ordine:**
  1. `b6216e8` regole pure della settimana e anteprima, coi test;
  2. `d501507` eccezioni su un periodo, regole pure, coi test;
  3. `dae0894` regole di prenotazione in un modulo solo (`client.book.tsx` le importa);
  4. `6335086` salvataggio senza perdite ed eccezioni, store Supabase e archivio in memoria, coi test;
  5. `56ff5e8` Google Calendar: la chiave dell'ultima sincronizzazione riuscita e il testo della pillola;
  6. `4bec5ac` la pagina di prima diventa quella del telefono;
  7. `fcc900b` desktop: orario settimanale con barra di salvataggio;
  8. `b36d0df` dalla revisione dei moduli puri: periodi raggruppati confrontando i motivi in byte;
  9. `b45ec8d` desktop: anteprima e regole di prenotazione;
  10. `919b7c3` desktop: eccezioni su un periodo;
  11. `68f2bf7` desktop: pillola di Google Calendar;
  12. `3fdb4e7` il telefono scrive con gli helper;
  13. `93a62fe` dalla revisione delle pagine: una scrittura dell'orario alla volta, uscita dopo il salvataggio;
  14. `e70b38b` dalla revisione delle pagine: eccezioni e anteprima senza stati a metà;
  15. `d9399e5` dalla revisione delle pagine: il telefono non salva una settimana non confermata;
  16. `b24c48f` CHECKLIST;
  17. questo file, per ultimo.
- **Come ho committato:** file aggiunti per nome, mai `git add -A` o `git add .`.

## PR

https://github.com/wolfwood370-cell/nc-calendar/pull/74: «Redesign coach · passata 08 · Disponibilità», verso `main`, aperta, non in bozza, **non** unita. L'ho aperta con `gh pr create`: `gh auth status` rispondeva autenticato.

## Manifesto

**NUOVI (18)**

- Moduli puri e test (`src/lib/`):
  - `availability-week.ts` + test (22): bozza della settimana dalle righe e ritorno; errori per giorno; interruttore, «+ Fascia», cestino, «Copia su…» e «Lun–Ven»; giorni modificati e testo della barra; opzioni 06:00-22:00 col valore salvato fuori griglia; anteprima (ore, istogramma, tipologia principale, sessioni, frase);
  - `availability-exceptions.ts` + test (23): periodo → una riga per giorno con l'aritmetica del calendario; limite di un anno; validazione del modulo; periodi nella pagina; etichette, dettaglio, cestino; sessioni già prenotate nel periodo e testi degli avvisi;
  - `booking-rules.ts` + test (4): le costanti che Prenota applica e quelle dello spostamento, e i testi della card;
  - `availability-actions.ts` + test (17): salvataggio dell'orario senza perdite e «Ripristina»; eccezioni (aggiunta, rimozione, «Ripristina»);
  - `gcal-sync-status.ts` + test (3): il testo della pillola.
- Resto di `src/lib/`: `availability-store.ts` (store Supabase), `testing/memory-availability-store.ts` (archivio in memoria che registra l'ordine delle richieste e sa fallire a comando).
- Componenti: `availability-desktop.tsx` (la pagina), `availability-week-card.tsx`, `availability-preview-card.tsx` (anteprima e regole), `availability-exceptions-desktop.tsx`, `gcal-sync-pill.tsx`, `availability-mobile.tsx` (la pagina di prima, vedi sotto).

**MODIFICATI (7)**

- `src/routes/trainer.availability.tsx`: resta `head`; sotto md monta `AvailabilityMobile`, da md in su `AvailabilityDesktop`, uno solo alla volta; con orari non salvati il desktop resta montato anche se la finestra si stringe.
- `src/routes/client.book.tsx`: solo l'import di `booking-rules` e le due costanti al posto dei letterali (`:28`, `:171-172`).
- `src/hooks/use-gcal-sync.ts`: solo righe aggiunte, la chiave `gcal_reconcile_ok` (`:24-39`, `:62`, `:126`).
- `src/lib/queries.ts`: `useCoachAvailability` accetta `{ fresh }` (`:441-451`), come `useCoachEventTypes`; gli altri chiamanti non cambiano (`refetchOnMount: true` è il valore predefinito).
- `src/components/availability-exceptions-card.tsx`: la card del telefono scrive con `addException` (Dal = Al) e `removeExceptions` sulla riga sola; nessuna riga di JSX.
- `docs/ULTIMO-RITORNO.md` e `design_handoff_coach_redesign/CHECKLIST.md`.

**NON TOCCATI**

- **Controlli del §6**, sull'ultimo commit di codice:

  ```
  git diff origin/main..HEAD --stat -- supabase/ bun.lock package.json src/integrations/supabase/types.ts .github src/lib/gcal-colors.ts src/lib/gcal.functions.ts src/lib/gcal.server.ts src/lib/booking-slots.ts src/lib/reschedule-slots.ts src/lib/calendar-time.ts src/components/client-reschedule-sheet.tsx src/components/reschedule-drawer.tsx src/components/calendar-desktop.tsx src/components/session-form-dialog.tsx src/components/trainer-header.tsx src/components/trainer-bottom-nav.tsx src/components/trainer-sidebar.tsx src/components/client-profile-desktop.tsx
  ```

  dà **0 righe**. Controllo positivo: lo stesso comando fra `3d29634` e `origin/main` mostra `session-form-dialog.tsx | 12 +++---------`.

- **§4.3:** il controllo del prompt su `client.book.tsx` dà `0`; `grep -c 'from "@/lib/booking-rules"' src/routes/client.book.tsx` dà `1`. `git diff origin/main..HEAD --stat -- 'src/routes/client.*'` nomina solo `client.book.tsx` (3 righe in più, 2 in meno).
- **§4.8:** `git diff -U0 origin/main..HEAD -- src/hooks/use-gcal-sync.ts | grep -c '^-[^-]'` dà `0`; `grep -c 'gcal_reconcile_ok' src/hooks/use-gcal-sync.ts` dà `2`.
- **Lock:** `git diff --stat b780645 origin/main -- package.json bun.lock` vuoto; positivo `4434a77`..`02a4d2a`: 2 file.
- **Il telefono resta com'era.**
  - **Estrazione** (`4bec5ac`): `availability-mobile.tsx` differisce dalla route di `origin/main` solo in quattro punti: commento in testa (8 righe al posto dell'import di `createFileRoute`), definizione della route (tolta, 20 righe), `export function AvailabilityMobile`. Verificato con `diff`.
  - **Dopo** (`3fdb4e7`, `d9399e5`): `git diff 4bec5ac..HEAD -- src/components/availability-mobile.tsx` e `git diff origin/main..HEAD -- src/components/availability-exceptions-card.tsx` toccano solo import, corpi delle `mutationFn`, `onSuccess` e `onError`: nessuna riga di JSX (le righe con `<`, `/>` o `className=` nei due diff sono 0).
  - **Impronte a 390 px**, finto backend e ora fissa, DOM visibile di `<main>` senza `data-tsd-source` e PNG a pagina intera:

    | stato                           | DOM `origin/main`  | DOM ramo           | PNG (uguale)       |
    | ------------------------------- | ------------------ | ------------------ | ------------------ |
    | 1 · settimana, fasce, eccezioni | `b3ad4eb8849f5b9e` | `b3ad4eb8849f5b9e` | `1231f8d3719e2525` |
    | 2 · nessuna fascia              | `2db0fd45e01c2a88` | `2db0fd45e01c2a88` | `94ffac73f3edb4a3` |
    | 3 · errore di caricamento       | `2db0fd45e01c2a88` | `2db0fd45e01c2a88` | `94ffac73f3edb4a3` |

    Gli stati 2 e 3 hanno la stessa impronta anche su `origin/main`: è il difetto di oggi, un errore di lettura sul telefono sembra una settimana vuota. L'aspetto resta così (§4.10); ora è il salvataggio a rifiutarsi (vedi «Verifica nel browser», G).

  - **Cosa cambia sul telefono, per scelta (§4.10):**
    - le scritture passano dal modulo, e i rifiuti del modulo arrivano nel toast «Errore» di sempre («Salvataggio non riuscito: …», «Salvataggio incompleto: …», «Non riesco a leggere l'orario: ricarica la pagina prima di salvare.»);
    - il rifiuto scatta se l'orario non si è mai letto e anche se l'ultima lettura è fallita (`availability-mobile.tsx:233`): il telefono si idrata una volta sola, anche dalla cache;
    - togliere un'eccezione che nel frattempo non c'è più ora è un errore invece di un successo silenzioso, e l'elenco si rilegge; il cestino resta fermo finché l'elenco non è riletto (`availability-exceptions-card.tsx:93`).

## Ambiente

- **Sistema:** Windows 11 Home, clone di Nicolò, senza worktree per il lavoro. Un worktree temporaneo di `origin/main` nella cartella di lavoro della sessione (fuori dal repo, `node_modules` collegato con una giunzione) è servito per le impronte, per il lint della base e per il typecheck commit per commit; l'ho tolto alla fine.
- **Versioni:** Bun 1.3.14, Node v24.12.0.
- **Dipendenze:** nessuna installazione.
- **Memoria:** vedi il passo 0 del PIANO. Dopo la chiusura della demo, 5,9 GB liberi: tutti i comandi coi worker predefiniti.
- **Browser:** niente installazioni e niente download. Playwright 1.64.0-alpha della cache npx del server MCP Playwright e la headless shell di Chromium 143 in `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1200`, gli stessi della 07.
- **Finto backend:** quello della 07 (nella cartella di lavoro della sessione 07), copiato nella cartella di lavoro di questa sessione e adattato; niente nel repo.
  - Vite con `VITE_SUPABASE_URL=http://finto-supabase.test` (host che non si risolve), le stesse variabili senza `VITE_` per il server, `VITE_SENTRY_DSN` vuoto. Le variabili già presenti vincono sul `.env`.
  - PostgREST minimo in memoria (filtri, ordine, `limit`, `return=representation`), realtime finto, Google Fonts vuoti, risposte 500 a comando.
  - Tutto il resto bloccato e contato. In più conta le richieste a `/_serverFn/` (le funzioni server di TanStack Start, che dal server di Vite potrebbero raggiungere Google): zero in ogni giro.
  - Seed del backup: dal lunedì al venerdì 10:00-20:00, sabato 10:00-15:30; «Sessione PT» 60 + 10; eccezioni finite, in corso, di un giorno con fascia, di tre giorni con un doppione; sessioni cliente, un impegno personale, un'annullata e una senza cliente dentro i periodi.

## Controlli

Base (`4252ab9`) e fine (`d9399e5`, ultimo commit di codice), stessi comandi e stesso PC.

|                                 | Base                                                  | Fine                                    |
| ------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| typecheck (`bun run typecheck`) | 0 errori                                              | 0 errori                                |
| lint (`bun run lint`)           | `✖ 22 problems (0 errors, 22 warnings)`               | `✖ 22 problems (0 errors, 22 warnings)` |
| test, `TZ=Europe/Rome`          | `Tests  441 passed (441)`, 29 file (`--maxWorkers=2`) | `Tests  510 passed (510)`, 34 file      |
| test, `TZ=UTC`                  | `Tests  441 passed (441)`, 29 file (`--maxWorkers=2`) | `Tests  510 passed (510)`, 34 file      |
| build (`bun run build`)         | riuscita                                              | riuscita                                |

- **Base:** uguale a quella di Cowork. La base dei test l'ho misurata con 2 worker per la memoria (passo 0); la build dopo la chiusura della demo.
- **Lint:** gli stessi 22 avvisi, file per file (confronto dei due elenchi JSON). Cambiano solo i numeri di riga citati nei due avvisi di `client.book.tsx`, che scendono di uno per l'import.
- **Test nuovi:** 69: `availability-week` 22, `availability-exceptions` 23, `availability-actions` 17, `booking-rules` 4, `gcal-sync-status` 3. Il file delle eccezioni da solo: `23 passed` con `TZ=Europe/Rome` e con `TZ=UTC`.
- **Typecheck commit per commit:** nel worktree temporaneo, `tsc --noEmit` dà 0 errori su tutti e 15 i commit di codice, da `b6216e8` a `d9399e5`.

## Ricognizione (§5)

Righe di `origin/main` (`4252ab9`). Cinque letture indipendenti in sola lettura, ognuna ricontrollata da un secondo lettore che doveva smentirla; qui sotto quello che è rimasto, con le correzioni degli scettici.

1. **Chi legge `availability_exceptions` e `trainer_availability`.**
   - **Per nome:** `availability_exceptions|trainer_availability` in `src/` 25 su 25; `useCoachAvailability*` 20 su 20 (9 e 11). Interrogano le tabelle solo `queries.ts:448` e `:673` e la pagina di prima (`trainer.availability.tsx:96`, con un `useQuery` suo sulla stessa chiave). Scrivono solo la pagina di prima (`:297` delete, `:300` insert) e la card (`availability-exceptions-card.tsx:59` insert, `:78` delete). Nessun `update` né `upsert`.
   - **Chi legge le eccezioni:** i cinque del prompt, confermati (`client.book.tsx:131`, `client-reschedule-sheet.tsx:97`, `reschedule-drawer.tsx:115`, `calendar-desktop.tsx:162`, la card a `:47`), più **un sesto indiretto**: `session-form-dialog.tsx:211` (`isWithinAvailability`), che le riceve da `calendar-desktop.tsx:657`.
   - **Per comportamento** (`start_time|end_time` 47 su 47 fuori dai tipi; `.date` 32 su 32, di cui 6 sono la data di un'eccezione): tutti leggono **una data per riga** (`booking-slots.ts:87-92`, `:112-113`, `:137-147`; `reschedule-slots.ts:80-82`, `:91-96`; `calendar-time.ts:129-138`, `:154-159`; la card `:176`). Lo schema lo impone: una sola colonna `date` (migrazione `20260510104248…:5`).
   - **Precisazione:** «tutto il giorno» è `!start_time || !end_time` ovunque tranne `reschedule-slots.ts:82`, che vuole `&&`: una riga con un solo orario chiude il giorno dappertutto ma non nel cassetto di riprogrammazione. Le righe che scrivono le due pagine hanno sempre tutti e due gli orari o nessuno; il database non lo vieta (nessun CHECK).
   - **Conclusione:** una riga per giorno è giusta senza toccare nessun lettore.
2. **Chi legge `trainer_settings`** (9 su 9 in 5 file): accedono alla tabella solo `trainer.availability.tsx:111` (lettura) e `:305` (upsert) e `client.book.tsx:161` (lettura, in `_trainerSettingsQ`, che nessuno usa). Gli altri tre file la nominano soltanto: i tipi generati (`types.ts:1049`), un commento (`booking-slots.ts:79`) e una chiave mai usata (`query-keys.ts:58`). Il `buffer_minutes` di `trainer_settings` non entra in nessun calcolo fuori dalla pagina di prima (`buffer_minutes` 59 su 59 righe: tutti gli altri sono di `event_types` o `bookings.buffer_min`). Anche lato database nessuna funzione in vigore la legge: `enforce_client_booking_rules` è stata riscritta senza (`20260827143053…:97-137`).
3. **`isClientSession` e `useCoachBookings`.**
   - `isClientSession` (`today-agenda.ts:51-53`): `!!client_id && client_id !== coach_id && !is_personal`; stato ed eliminazione li controlla chi la chiama.
   - `useCoachBookings` (`queries.ts:261-271`): tutte le colonne che servono (`duration_min`, `is_personal`, `client_id`, `coach_id`, `status`, `scheduled_at`), filtro `coach_id` e `deleted_at IS NULL`, dal più recente, limite 1.000, `staleTime` 30 s. Le eliminate non arrivano; annullate, impegni personali e sessioni senza cliente sì, e il conteggio le scarta.
   - **Precisazione dello scettico:** un impegno personale importato da Google ha `client_id = coach_id`, non nullo (`gcal.functions.ts:817`, `:886`): lo scarta comunque `isClientSession`.
   - **Link al Calendario:** `calendar-search.ts:31-44` è `parseCalendarSearch`, che legge l'URL; il link si costruisce con `search={{ date }}`, come fanno la Panoramica e il Profilo.
4. **Affermazioni del §4.3, ricontrollate.**
   - Confermate: `client.book.tsx:170-171` (0 e 90), `:155-167` (`_trainerSettingsQ`), `:178-181` (minimo di durata + margine fra le tipologie); `client-reschedule-sheet.tsx:71` (14 giorni), `:72` e `:83-88` (24 ore, anche alla conferma a `:181-186`); `booking-slots.ts:81` (preavviso predefinito 24 ore); `reschedule-slots.ts:11`, importata a `reschedule-drawer.tsx:62`.
   - Server, ultime definizioni: `validate_client_booking_update` a `20260607191854…:1` (24 ore sull'orario attuale); `enforce_client_booking_rules` a `20260827143053…:97` (solo `client_bookable`, solo in INSERT); `set_booking_duration_defaults` a `20260814102120…:1`; `get_coach_busy` a `20260522204517…:258` (stati `scheduled` e `completed`, solo `bookings`).
   - **In più:** l'ultima `reschedule_booking` (`20260827143053…:139`) non controlla più 24 ore sul nuovo orario né 14 giorni: oggi quelle due sono regole del solo client, e sul server resta il limite delle 24 ore sull'orario attuale. La nota della card dice quello che il cliente vede, e resta vera.

## Prove rosse

Ognuna: difetto messo nel codice con una sostituzione esatta, test che cade, file rimesso con `git checkout`, test di nuovo verde. Tutte con `TZ=Europe/Rome`. Uscite sintetizzate.

1. **Il salvataggio cancella prima di inserire** (in `saveWeek` la cancellazione spostata prima dell'inserimento).
   - **Rosso:** `Tests  5 failed | 12 passed (17)`. Cade «inserimento fallito: righe come prima, nessuna cancellazione…» (le righe del lunedì si perdono), con l'ordine delle richieste e i casi della cancellazione fallita.
   - **Verde:** `Tests  17 passed (17)`.
2. **L'espansione somma 86 400 000 ms alla mezzanotte locale.**
   - **Rosso:** `Tests  1 failed | 22 passed (23)`. Cade «dal 24 al 26 ottobre 2026 (il 25 in Italia dura 25 ore): 24, 25 e 26»: il risultato ripete il 25.
   - **Verde:** `Tests  23 passed (23)`.
   - **Con `TZ=UTC` lo stesso difetto passa** (`23 passed`): per questo il file va lanciato anche con Roma.
3. **I gruppi ignorano il motivo.**
   - **Rosso:** `Tests  3 failed | 20 passed (23)`. Cade «motivo diverso: due periodi» (`expected … to have a length of 2 but got 1`), con due casi vicini.
   - **Verde:** `Tests  23 passed (23)`.
4. **Il conteggio delle sessioni già prenotate prende anche gli impegni personali** (via il controllo `is_personal`).
   - **Rosso:** `Tests  3 failed | 20 passed (23)`. Cade «impegni personali, annullate, senza cliente, eliminate: fuori» (4 sessioni invece di 3 nel periodo).
   - **Verde:** `Tests  23 passed (23)`.
5. **L'anteprima usa 60 minuti al posto di durata più margine.**
   - **Rosso:** `Tests  2 failed | 20 passed (22)`. Cade «coi dati del backup: 55,5 ore e circa 44 sessioni di Sessione PT» con `expected 55 to be 44`.
   - **Verde:** `Tests  22 passed (22)`.
6. **«Copia su…» non accende i giorni spenti.**
   - **Rosso:** `Tests  1 failed | 21 passed (22)`. Cade «accende le destinazioni, ne sostituisce le fasce…» con `expected { active: false, … } to deeply equal { active: true, … }`.
   - **Verde:** `Tests  22 passed (22)`.
7. **In più, dalla revisione** (`b36d0df`): col confronto `localeCompare` di prima, il test nuovo «stesso motivo in byte, qualunque sia l'ordine delle righe» cade con `expected … to have a length of 2 but got 3`; con la correzione è verde.

## Verifica nel browser

- **Condizioni:** finto backend, ora fissa venerdì 25/09/2026 10:40 a Roma, desktop 1440×900 e telefono 390×844.
- **Esito, sul codice finale (`d9399e5`):** **98 controlli, 98 OK. Zero richieste bloccate verso host esterni, zero chiamate alle funzioni server.** In console 26 messaggi «Failed to load resource: 500», uno per ognuna delle 26 risposte d'errore iniettate dal banco; nessun altro errore, nessun `pageerror`, nessun dialog nativo.
- **Schermate** nella cartella di lavoro della sessione (`giro-finale/`): pagina, «Copia su…», modifiche non salvate, errori, salvataggio incompleto, lettura fallita, eccezione aggiunta, dialog d'uscita.

**Accettazione**

- **Riga 1, nessun campo modificabile senza effetto.** Nessun campo numerico nella pagina; la card delle regole non ha controlli; niente «Buffer» né «Orizzonte». I campi rimasti (orari, eccezioni) scrivono quello che i moduli di Prenota leggono. Il desktop non legge né scrive `trainer_settings`.
- **Riga 2, una settimana di ferie è un'eccezione sola.** Dal 12 al 18 ottobre, motivo «Ferie» scritto con spazi ai lati: **una** richiesta `POST availability_exceptions` con **sette** righe (12…18, orari nulli, motivo «Ferie»), e nella pagina una voce sola «12 – 18 ottobre · Tutto il giorno · Ferie».
- **Riga 3, uscire con orari non salvati chiede conferma.**
  - link della sidebar: dialog «Salvare gli orari?» col testo del prompt e i tre pulsanti; «Resta qui» lascia pagina e bozza;
  - freccia indietro: stesso dialog; mentre è aperto l'URL mostra già la pagina di prima (è come TanStack blocca il `popstate`), e «Resta qui» torna alla Disponibilità con la bozza intatta;
  - chiusura della scheda: `beforeunload`;
  - con errori «Salva ed esci» è disabilitato; «Esci senza salvare» esce senza scrivere; «Salva ed esci» salva ed esce.

**Il resto**

- **A · Pagina:** sottotitolo del §4.8; pillola «Google Calendar · non ancora sincronizzato da questo browser» e «Gestisci» verso `/trainer/integrations`, senza «collegato»; regole «Nessuno», «90 giorni in anticipo», «Per tipologia» verso `/trainer/event-types`, e la nota; anteprima «55,5» e «Circa 44 sessioni della tipologia «Sessione PT» (60 min + 10 min di margine)…»; eccezioni «24 – 26 settembre» (in corso, 08:00–10:00), «Giovedì 1 ottobre» con «1 sessione già prenotata… spostala» e «8 – 10 ottobre» con «2 sessioni già prenotate… spostale» (l'impegno personale, l'annullata, quella senza cliente e quella che tocca la fascia alle 14:00 non contano); le finite non compaiono; link a `/trainer/calendar?date=2026-10-01` e `?date=2026-10-08`; interruttori «Disattiva Lunedì» … «Attiva Domenica»; select 06:00-22:00 (33 opzioni); nessuna scrittura all'apertura.
- **B · Valore fuori griglia e pillola:** una domenica 05:30-23:00 salvata compare selezionata (34 opzioni); con `gcal_reconcile_ok` a 4 minuti «sincronizzato 4 min fa», a 30 secondi «sincronizzato ora».
- **C · Copia ed errori:** «+ Fascia» dopo 10-14 dà 15:00-18:00; popover «Copia gli orari di Lunedì su» con sei caselle, «Applica» disabilitato, Esc e clic fuori lo chiudono; «Lun–Ven» sceglie Martedì-Venerdì; con Domenica, «Applica» accende e sostituisce, Sabato resta; barra «6 giorni modificati»; anteprima «65,5». Errori sotto le righe col bordo rosso, fasce che si toccano valide, barra «Correggi gli orari evidenziati per salvare» e «Salva orari» disabilitato; togliere l'ultima fascia spegne il giorno; «Annulla modifiche» riporta tutto, senza scritture.
- **D · Salvataggio:** «1 giorno modificato»; «Salva orari»: rilettura, poi `POST` della sola riga nuova del lunedì, poi `DELETE` per `id` della sola riga vecchia; toast «Orari salvati. I clienti vedono i nuovi slot.»; «Ripristina»: `POST` 10-20 e `DELETE` 10-19, e il database torna esattamente com'era.
- **E · Inserimento rifiutato:** «Salvataggio non riuscito: errore finto del banco», disponibilità intatta, nessuna cancellazione, bozza e barra restano; «Salva orari» riprova e riesce.
- **F · Cancellazione rifiutata:** «Salvataggio incompleto: gli orari nuovi ci sono, ma quelli vecchi non sono stati tolti. Riprova.»; nel finto backend 7 righe (la nuova e la vecchia del lunedì); barra ancora lì, «Salva orari» attivo, bozza intatta; il salvataggio dopo manda solo il `DELETE` della riga vecchia e il database coincide con la bozza.
- **G · Lettura fallita:** desktop «Non riesco a leggere l'orario settimanale.» con «Riprova», niente interruttori né select né barra, anteprima «Anteprima non disponibile…»; «Riprova» rilegge e mostra la settimana. Telefono: la settimana vuota di sempre, ma «Salva modifiche» rifiuta con «Non riesco a leggere l'orario: ricarica la pagina prima di salvare.» e non scrive niente, neanche `trainer_settings`.
- **H · Eccezioni:** valori iniziali 2 ottobre, tutto il giorno; «Dal» con `min` di oggi; spostare «Dal» dopo «Al» sposta «Al»; avviso «Attenzione: 1 sessione già prenotata in questo periodo…» sull'8 ottobre; i tre errori; dopo l'aggiunta il modulo torna ai valori iniziali; «Ripristina» cancella le sette righe con una richiesta. Rimozione di «8 – 10 ottobre»: un `DELETE` con le quattro righe (doppione compreso); «Ripristina» le reinserisce con gli stessi `id`, giorni, orari e motivo. Eccezioni non leggibili: «Non riesco a leggere le eccezioni.» con «Riprova», e il modulo resta; sessioni non leggibili: «Non riesco a leggere le sessioni già prenotate.» nel modulo. Nessuna eccezione: «Nessuna eccezione in programma.».
- **J · Finestra stretta:** con una bozza, a 390 px resta il desktop con la bozza; senza bozza arriva il telefono.
- **K · Telefono, scritture:** accendere la domenica e salvare manda un solo `POST` con la domenica (prima: `DELETE` di tutto e reinserimento), più l'upsert di `trainer_settings` di sempre; «Aggiungi» manda una riga (25 settembre, tutto il giorno); il cestino toglie la riga sola per `id`. Poi: settimana già mostrata, si va sui Clienti e si torna indietro con le letture dell'orario che falliscono: il telefono mostra la settimana dalla cache e «Salva modifiche» rifiuta, senza scritture.
- **L · Dalla revisione delle pagine:**
  - un secondo clic su «Aggiungi eccezione» subito dopo la risposta non aggiunge niente. Col codice di prima (`919b7c3`) lo stesso controllo è **rosso**: aggiungeva un'eccezione di tutto il 2 ottobre mai chiesta (i valori iniziali del modulo);
  - «Ripristina» di un salvataggio cliccato mentre un altro salvataggio è in volo (risposte ritardate di 1,5 s): la card è ferma, le due scritture vanno in fila, niente «Salvataggio incompleto», e il database torna esattamente alla settimana di prima;
  - una bozza tornata uguale al salvato: la barra sparisce.
- **Il link al Calendario e «Gestisci» non li ho cliccati:** Calendario e Integrazioni usano `useGcalSync`, che al montaggio chiama una funzione server verso Google dal server di Vite. Ho controllato gli `href`.

## Divergenze

- **«La data iniziale è già passata.»** (`availability-exceptions.ts:45`, `:128`): un errore in più del modulo desktop. Il `min` dell'input non impedisce di scrivere una data passata a mano, e un periodo finito prima di oggi verrebbe aggiunto («Eccezione aggiunta.») senza comparire nell'elenco. Il modulo condiviso non lo controlla: il telefono può ancora chiudere un giorno passato, come prima.
- **Piano vuoto** (`availability-actions.ts:154`): nessuna scrittura, ma la lettura del passo 1 c'è, perché è lei a dire che il piano è vuoto. La pagina desktop comunque non salva senza modifiche (la barra non c'è).
- **`aria-label` coi nomi dei giorni** (`availability-week-card.tsx:93`, `:228`, `:248`): «Copia su… gli orari di Lunedì», «Rimuovi la fascia 10:00–20:00 di Lunedì», «Aggiungi una fascia a Lunedì». Il prototipo ha «Copia su…», «Rimuovi la fascia 07:00–14:00» e «Fascia», uguali su sette righe; il testo visibile resta quello del prototipo.
- **Select e date nativi** (`<select>`, `<input type="date">`), come i dialog desktop delle passate 04 e 06 e il prototipo, non la `Select` di shadcn. Il popover di «Copia su…» è quello di shadcn (Radix): Esc e clic fuori sono i suoi.
- **Freccia indietro:** mentre il dialog è aperto la barra dell'indirizzo mostra già la pagina di prima; «Resta qui» la rimette. È il modo in cui `useBlocker` di TanStack gestisce il `popstate`, lo stesso del Profilo.
- **Bozza «fresca»** (`availability-desktop.tsx:95`): oltre a `isFetchedAfterMount`, la lettura deve avere `dataUpdatedAt` dopo l'apertura. Se la rilettura all'apertura fallisce, `isFetchedAfterMount` diventa vero ma in cache resta il dato vecchio: così la card dice «Non riesco a leggere l'orario settimanale.» invece di partire dalla cache.
- **Testi che il prompt non dà:** «Orari di prima ripristinati.» dopo «Ripristina» (`availability-desktop.tsx:147`); «Anteprima non disponibile: non riesco a leggere l'orario settimanale.» (`availability-preview-card.tsx:95`); i toast d'errore delle eccezioni «Eccezione non aggiunta», «Eccezione non rimossa», «Eccezione non ripristinata», «Eccezione non tolta», col motivo sotto; «L'eccezione non è stata tolta del tutto: ricarica la pagina e riprova.» quando si cancellano meno righe del previsto (`availability-actions.ts:214`).
- **Pillola, primo istante:** prima di leggere la chiave mostra solo «Google Calendar» (un frame), per non dire «non ancora sincronizzato» a chi lo è.
- **Periodi uniti** (§4.7): due eccezioni aggiunte una dopo l'altra su giorni vicini, con gli stessi orari e lo stesso motivo, diventano un periodo solo, e il cestino le toglie insieme. L'effetto sui clienti è lo stesso. Due motivi uguali per come si leggono ma diversi in byte restano due periodi (`availability-exceptions.ts:192`).
- **Sessioni «già cominciate»:** conta solo chi inizia dopo adesso (`>`, non `>=`).
- **Nessuna riga di JSX, ma alcuni comportamenti del telefono cambiano** (vedi Manifesto): i messaggi d'errore del modulo, il rifiuto anche dopo una lettura fallita con la cache, e la rimozione di un'eccezione già sparita, che ora è un errore (con l'elenco riletto).
- **Dalla revisione delle pagine, comportamenti che il prompt non descrive:**
  - le scritture dell'orario vanno in fila, anche fra «Ripristina» di un toast e «Salva orari» (`availability-desktop.tsx:60`), e barra e card sono ferme anche durante «Ripristina». Un «Ripristina» cliccato mentre un altro salvataggio è in corso riporta, dopo, la settimana di prima di _quel_ salvataggio;
  - il desktop resta montato anche mentre salva o mentre il dialog d'uscita è aperto (`:195`), e un'uscita chiesta durante un salvataggio prosegue da sola quando il salvataggio finisce (`:201`); «Salva ed esci» senza niente da salvare esce (`:327`);
  - una bozza tornata uguale al salvato torna a seguire le letture (`:125`);
  - «adesso» avanza ogni minuto (`:89`); con una rilettura in corso restano gli scheletri (`:102`);
  - dopo un'aggiunta «Aggiungi eccezione» resta fermo 800 ms e i campi sono fermi durante l'invio (`availability-exceptions-desktop.tsx:83`); l'elenco delle eccezioni cambia subito dopo ogni scrittura, poi si rilegge (`:134`, `:177`); mentre sessioni e tipologie arrivano, scheletri al posto di avvisi e stima (`:191`, `availability-preview-card.tsx:69`).

## Debiti

Trovati o confermati, non toccati.

- **Dal §4.3:**
  - `client-reschedule-sheet.tsx:71`: una sua copia dei 14 giorni (`HORIZON_DAYS`), invece di `RESCHEDULE_WINDOW_DAYS`;
  - `client.book.tsx:156-168`: la lettura di `trainer_settings` in `_trainerSettingsQ`, che parte a ogni apertura e non la usa nessuno; i commenti di `:152-155` («Default 24h / 60gg») e `:237` («oggi+14gg») non sono più veri;
  - `trainer_settings` (colonne e policy) resta, scritta solo dal telefono.
- **Dal §4.10, il telefono:**
  - l'avviso «Funzione in arrivo: … 24h di preavviso fino a 2 settimane…» (`availability-mobile.tsx:551-553`) è falso: per prenotare non c'è preavviso e l'orizzonte è 90 giorni;
  - i tre campi «Buffer tra sessioni», «Preavviso minimo», «Orizzonte di prenotazione» (`:559`, `:569`, `:579`) non hanno effetto;
  - l'anteprima conta slot da 60 minuti più il buffer globale (`:129`);
  - la bozza nasce dal primo dato, che può venire dalla cache (`:145`);
  - se `trainer_settings` non si legge, salvare scrive i valori predefiniti 15/24/60 (`:111`, `:304`);
  - un errore di lettura dell'orario sembra una settimana vuota (impronte 2 e 3 uguali): ora non si salva, ma non lo dice finché non si preme «Salva modifiche»;
  - dalla revisione: dopo un «Ripristina» fatto sul desktop (finestra larga, poi stretta entro gli 8 secondi del toast) il telefono non si riallinea, perché si idrata una volta sola (`:145`); il suo salvataggio successivo riscrive la settimana che mostra;
  - dalla revisione: ruotando un telefono o un tablet oltre i 768 px con modifiche non salvate sul telefono, la route passa al desktop e le modifiche del telefono si perdono senza avviso; allo stesso modo il modulo «Nuova eccezione» del desktop torna ai valori iniziali se la finestra passa sotto md e poi torna larga (`trainer.availability.tsx:32-37`). È la divisione delle Tipologie, che il §4.10 chiede; tenere montato il telefono con una bozza vorrebbe un `onHoldChange` anche lì, cioè toccare di più il telefono.
- **Barra in basso sotto md:** se la finestra si stringe con una bozza, il desktop resta montato ma la barra (`availability-desktop.tsx:268`) finisce sotto la navigazione del telefono (`trainer-bottom-nav.tsx:39`, `z-50`) e «Annulla modifiche» non si clicca finché la finestra non torna larga. Succede uguale nel Profilo (`client-profile-desktop.tsx:660`): ho tenuto le stesse classi.
- **Dalla ricognizione:**
  - `reschedule-slots.ts:82`: «tutto il giorno» solo se mancano entrambi gli orari (`&&`), gli altri moduli con uno solo (`||`);
  - `reschedule_booking` (`20260827143053…:139`) non controlla più 24 ore sul nuovo orario né 14 giorni: sono regole del solo client;
  - da verificare sul database vero: se `zz_trg_revalidate_client_reschedule` (ricreato a `20260606120000…:323-417`) è attivo, e se il bypass `current_user` di `enforce_client_booking_rules` (`SECURITY DEFINER`, `20260827143053…:100`, `:108`) rende inerte il controllo di `client_bookable`;
  - commenti superati: `booking-slots.ts:12` («weekly_schedule rows»), `booking-slots.ts:79` (preavviso «configurato dal coach in trainer_settings»), `queries.ts:110` («staleTime: 0»);
  - chiavi mai usate in `query-keys.ts:56-60` (`trainerAvailability`, `trainerSettings`, `availabilityExceptions`);
  - `calendar-desktop.tsx:433-437`: la sincronizzazione a mano mostra «Calendario allineato…» e «sincronizzato ora» anche se Google ha risposto `ok: false`; `use-gcal-sync.ts:141`: la completa dice «Tutto già allineato» anche con la riconciliazione fallita. La pillola della Disponibilità no: legge solo `gcal_reconcile_ok`.
- **La pillola è per browser:** chi sincronizza dal telefono e apre la Disponibilità dal PC vede «non ancora sincronizzato da questo browser». È quello che il testo dice; lo stato vero è della passata 09.

## Cosa non ho fatto e perché

- **Rendere modificabili preavviso e anticipo:** Prenota non li legge da `trainer_settings` (§4.3); la card li mostra coi numeri veri e dice che non si cambiano da qui.
- **Un salvataggio in una transazione:** servirebbe una funzione sul server (migrazione, §6). Il salvataggio a due richieste, prima inserisci poi cancella, non perde mai la disponibilità; nel mezzo, per un attimo, un cliente può vedere le fasce vecchie e nuove insieme.
- **Correggere i testi e i campi del telefono:** il §4.10 li lascia com'erano; sono fra i debiti.
- **Cliccare il link al Calendario e «Gestisci» nel browser:** le due pagine chiamano Google dal server di Vite al montaggio (vedi «Verifica nel browser»).
- **Verifica con dati veri:** il divieto vale anche in lettura. Il finto backend non prova le policy RLS: in particolare `DELETE … RETURNING` su `trainer_availability` e `availability_exceptions` filtrato per `coach_id`, e l'inserimento di eccezioni con l'`id` dato da «Ripristina».

## Cosa resta a Nicolò

Sull'anteprima Lovable, col login vero. Per ognuna, come tornare indietro.

- **Salvare l'orario:** cambiare un giorno, «Salva orari», poi Prenota da un cliente di prova: gli slot seguono. Indietro: «Ripristina» nel toast, o rimettere l'orario a mano.
- **Una settimana di ferie:** aggiungerla, controllare in Prenota che quei giorni non si possano prenotare e nel database che siano sette righe. Indietro: il cestino dell'eccezione (tutte e sette insieme).
- **«Ripristina» dopo la rimozione:** reinserisce le righe con gli stessi `id`; se la policy di `availability_exceptions` non lo permettesse, il toast lo dice e l'eccezione va riaggiunta a mano.
- **Dal telefono:** salvare la settimana e aggiungere e togliere un'eccezione di un giorno. Indietro: le stesse azioni al contrario.
- **La pillola:** dopo una sincronizzazione riuscita dal Calendario, la Disponibilità dello stesso browser dice «sincronizzato ora». Niente da riportare indietro.
- **Decidere i commit `3fdb4e7` e `d9399e5`** (il telefono che scrive con gli helper e rifiuta di salvare una settimana non letta): tenerli (consigliato: il telefono di oggi, se l'inserimento fallisce, lascia il coach senza disponibilità) o toglierli, tutti e due insieme.
- **Revisione del 02/10/2026:** la verifica sul database dei due trigger dei Debiti; una funzione server per salvare l'orario in una transazione, se serve.
