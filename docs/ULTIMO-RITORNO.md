# Ultimo ritorno · Lato cliente · Passata 02 · Prenota

## 0 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **La base e il ramo** (§2). Nessun commit.
   - `git fetch origin`; `git merge-base --is-ancestor c869af9 origin/redesign/cliente-mobile && echo 01-presente` → `01-presente`.
   - `origin/redesign/cliente-mobile` = `28c4b93` (merge della PR 79), albero `747feb4`, lo stesso di `c869af9`. `redesign/cliente-02-prenota` creato con `git switch --no-track -c redesign/cliente-02-prenota origin/redesign/cliente-mobile`.
   - ⚠️ Il clone non era su `redesign/cliente-01-shell` @ `c869af9` ma su `main` @ `3d29634`, pulito (come nella 01). Il `redesign/cliente-mobile` locale è fermo a `14c09e9`: non usato.
   - `git diff --stat b780645 origin/redesign/cliente-mobile -- package.json bun.lock` → vuoto. Nessuna installazione.
   - ⚠️ **Il fuso:** in Git Bash `TZ=UTC node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"` → `0`, ma con `TZ=America/Los_Angeles` → `-120`, e dentro Node `process.env.TZ` è `undefined`: il runtime di MSYS toglie `TZ` quando il valore non è nel formato di Windows (`UTC` passa, `America/Los_Angeles` no). Da PowerShell (`$env:TZ='America/Los_Angeles'`) → `420`, e `UTC` → `0`; una sonda dentro vitest (un test temporaneo, tolto subito) ha letto `420 America/Los_Angeles`, `0 UTC` e `-120` senza `TZ`. Tutte le prove col fuso le ho lanciate da PowerShell.
   - Base misurata su `28c4b93`: typecheck 0 errori · lint 0 errori e 22 avvisi (i due di `client.book.tsx:167`) · build riuscita · test coi worker predefiniti **754 in 48 file su 49**, un file caduto al caricamento · con `--no-file-parallelism` **764 in 49 file**, tutti verdi.
   - **Il file caduto**, coi worker predefiniti (il messaggio che mancava): `Error: [vitest-pool]: Worker forks emitted error.` · `Caused by: Error: Worker exited unexpectedly with exit code 3221226505 during started state while running test file C:/Coworks/NC App Development/repos/nc-calendar/src/lib/current-block.test.ts`. 3221226505 è `0xC0000409` (`STATUS_STACK_BUFFER_OVERRUN`, l'uscita «fail fast» di Windows): muore il processo del worker mentre parte, nessun test fallisce. `current-block.test.ts` importa solo `current-block.ts`, che importa `date-fns` e `session-time.ts` (e questo `date-fns/locale/it`, non il barile). Sul ramo finito tre corse intere coi worker predefiniti sono andate verdi al primo colpo (§4).
   - Memoria all'avvio: 1,8 GB fisici liberi, 6,2 GB impegnabili.
   - Controlli C0-C16 sulla base: gli stessi numeri «oggi» del prompt, salvo C16 (la riga col nome è `client.book.tsx:119`, non `:120`).
1. ☑ **Le regole di Prenota** (§4.1). `352d636`. `src/lib/client-book.ts` e `client-book.test.ts` (39 test), verdi anche con `TZ=UTC` e `TZ=America/Los_Angeles`. R1-R8, R11, R12, R14, R15 rosse e poi verdi (§5).
   - In più del prompt: ogni incoerenza porta il suo `blockId` (`BookMismatch`), così il messaggio a Sentry dice in quale blocco; e `rulesBlock`, `writeToCoach`, `writeOnWhatsApp`, `withCoachLine` per i testi della pagina.
2. ☑ **Giorni e orari** (§4.2). `1cf0938`. `dayCaption`, `dayAriaLabel`, `dayHead`, `slotGroups` in `client-slots.ts` (+82 righe, 0 tolte) e 5 test in `client-slots.test.ts` (+104, 0 tolte); `client-day-strip.tsx` e `client-slot-groups.tsx` con 5 e 4 test statici. Verdi anche in UTC e a Los Angeles. R9, R10, R13 rosse e poi verdi; C12 vuoto.
   - In più: l'anello del focus dei giorni ha `outline-offset: 0` (`client-day-strip.tsx:69`): la fila scorre, e col suo padding di 2 px in alto un anello scostato di 2 px verrebbe tagliato (il prototipo ha lo stesso taglio).
3. ☑ **La lettura dei crediti** (§4.3). `7e353f7`. `useClientBookingsForCredits` in `src/lib/queries.ts` (+29 righe, 0 tolte): `or("deleted_at.is.null,status.eq.late_cancelled")`, chiave `["bookings", "client", id, "credits"]`.
4. ☑ **Tipologie, barra, fogli, card** (§4.6). `9da1133`. `book-type-picker.tsx`, `book-action-bar.tsx`, `book-sheets.tsx` (`BookConfirmSheet`, riepilogo ed esito nello stesso foglio; `BookHowSheet`), `book-blocked-card.tsx` (`BookBlockedCard` e `BookRetryCard` per le letture fallite).
   - `ClientSheet` riceve due prop facoltative, solo aggiunte (+12, 0 tolte): `icon` (il riquadro sopra «Prenotata») e `returnFocus` (dove va il focus quando chi ha aperto il foglio non c'è più). `ClientInstallSheet` non cambia.
   - ⚠️ `typeColor` e `typeTint` stanno in `client-book.ts` e non nel file del componente: esportate da `book-type-picker.tsx` davano due avvisi `react-refresh/only-export-components`.
5. ☑ **La prenotazione e la pagina** (§4.4, §4.5, §4.7, §4.8). Tre commit: `e9cf289` «Prenota in una schermata sola, col credito del giorno scelto» (`use-book-confirm.ts` e `client.book.tsx`), `71ad74c` «Prenota: via calendario, griglia e scelta di prima» (i tre componenti con `git rm`, `findAllocationForWeek` e `findExtraCredit` coi loro tipi), `9c744b9` «Booster: la regola di chi può comprare in un posto solo» (lo Store, +2 −5). C1-C7, C10, C15, C16 al §4.
   - La barra d'azione è `sticky`, non un portal: con un portal nel `body` «Continua» verrebbe dopo le cinque schede della barra in basso nell'ordine di Tab. Per stare attaccata anche con poco contenuto la pagina è una colonna alta quanto lo schermo meno lo spazio che il layout tiene sotto (`client.book.tsx:648`), e la barra ha `mt-auto` e `-mb-6` (`book-action-bar.tsx:32`). Misure al §3 e al §6 (B6).
6. ☑ **Il browser** (§8). B1-B17 fatti col banco della 01 adattato, fuori dal repo: **82 prove su 82** sul codice finale, più il confronto base/ramo del B14 (§6).
   - ⚠️ B17 rosso alla prima corsa (due chiamate a Sentry uguali): durante i 95 secondi avevo modificato `client.book.tsx`, e l'aggiornamento a caldo di Vite ha rivalutato il modulo con un `Set` nuovo. Rifatto senza toccare i file: una chiamata sola. In produzione non c'è aggiornamento a caldo.
   - ⚠️ Memoria: a metà giro sul PC è partito `witcher3` (fino a 3,4 GB) e sono rimasti 0,9 GB impegnabili; il server di Vite non partiva (`VirtualAlloc failed`). Non ho chiuso niente: ho aspettato che la memoria tornasse (7,9 GB).
7. ☑ **Chiusura** (§10). C0-C16 sul ramo finito (§4); `de70178` «Spunta la passata 02 in PIANO.md»; push di `redesign/cliente-02-prenota`; PR [wolfwood370-cell/nc-calendar#80](https://github.com/wolfwood370-cell/nc-calendar/pull/80) verso `redesign/cliente-mobile`, aperta e non unita; «Riscrive docs/ULTIMO-RITORNO.md per la passata 02 del lato cliente», l'ultimo commit (il suo hash sta nella risposta finale: un file non contiene l'hash del commit che lo scrive).
8. ☑ **Passo aggiunto: le correzioni viste nel browser.** `0a2de19` «Prenota: la barra va a capo a 320 e l'esito si vede anche a foglio chiuso».
   - A 320 «mar 29 set · 11:10–12:10» accanto a «Continua» veniva troncato coi puntini, e si perdeva l'ora di fine: ora va a capo e la barra cresce (90,5 px), sempre attaccata (729 su 729).
   - Chiudendo il riepilogo mentre la prenotazione è in volo (Esc, scrim, trascinamento, «Indietro») la prenotazione riusciva senza esito visibile: ora «Indietro» è disattivato mentre conferma, e la risposta riapre il foglio sull'esito o sull'errore (`client.book.tsx`, `onConfirm`).
9. ☑ **Passo aggiunto: le correzioni della revisione.** Un revisore in sola lettura sul diff ha dato 10 punti e una nota; li ho verificati sul codice e nel browser. `5f3b9c3` «Prenota: le correzioni della revisione» corregge i veri; gli altri sono al §9, col perché.
   - **Il riepilogo con un errore si chiudeva da solo** (certo): dopo un P0001 la rilettura rendeva esaurita la tipologia, la scelta cambiava sotto il foglio, l'orario spariva e con lui il riepilogo; poi, alla prima scelta di un orario, il foglio si riapriva da solo con l'errore vecchio. Ora la scelta aspetta la chiusura del riepilogo come quella dell'esito (`client.book.tsx:328`), e un riepilogo rimasto vuoto si chiude (`:486`). Provato nel browser (B9, «l'ultimo credito usato mentre conferma»).
   - **Una falsa incoerenza a Sentry dopo ogni prenotazione** (probabile): sessioni e blocchi si rileggono con risposte separate, e nel mezzo i conteggi non coincidono. Ora le incoerenze partono solo a letture ferme (`:288`). Nel browser: tre prenotazioni riuscite, zero chiamate a Sentry.
   - **Una prenotazione riuscita poteva tornare fallita** (certo sul meccanismo): il `try` avvolgeva anche l'`import` di `gcal-colors`; un errore lì dava `ok: false`, e ritentando la prenotazione raddoppiava. Ora gli effetti di contorno stanno in `announce` (`use-book-confirm.ts:90`) e non possono cambiare l'esito.
   - **La finestra del credito fissata al momento della scelta** (probabile, raro): ora il credito si prende dalla finestra di adesso del giorno scelto (`client.book.tsx:426`).
   - **Il giorno non «restava»** (probabile): il giorno mostrato ora si ricorda (`:395`), così un giorno prima che si libera non gli passa davanti; e a mezzanotte gli occupati di prima restano finché arrivano i nuovi (`placeholderData`, `:189`).
   - **Una rilettura fallita in background buttava via dati buoni**: ora la card d'errore c'è solo senza dati (`lost`, `:227`); TanStack Query tiene i dati di prima.
   - **«Riprova»** segue tutte le letture; **la fila dei giorni** riparte dal giorno scelto a ogni cambio di tipologia (`key`, `:600`).
10. ☑ **Passo aggiunto: C4.** `017e666`: il commento sulla chiave del profilo citava alla lettera la chiave condivisa, e il controllo (che conta anche i commenti) dava 1. Riscritto il commento, non il controllo.

29/09/2026. Prompt «NC Calendar · Redesign lato cliente · Passata 02 · Prenota» (Cowork, contro `28c4b93`). Agenti: 1 (il revisore in sola lettura del passo 9, circa 23 minuti, in background mentre preparavo il banco). Workflow: 0: la parola «Ultracode» nel prompt ha acceso l'invito del sistema ai workflow, ma il prompt dice «Ultracode: non serve».

## 1 · Ramo e commit

- **`redesign/cliente-02-prenota`**, da `origin/redesign/cliente-mobile` @ `28c4b93`. Commit, in ordine:
  1. `352d636` Prenota: tipologie, crediti e testi in un file solo;
  2. `1cf0938` Fila dei giorni e gruppi di orari, riusabili da Sposta;
  3. `7e353f7` Crediti del cliente: anche le annullate tardi con deleted_at;
  4. `9da1133` Prenota: tipologie, barra d'azione, riepilogo, esito e Come si prenota;
  5. `e9cf289` Prenota in una schermata sola, col credito del giorno scelto;
  6. `71ad74c` Prenota: via calendario, griglia e scelta di prima;
  7. `9c744b9` Booster: la regola di chi può comprare in un posto solo;
  8. `0a2de19` Prenota: la barra va a capo a 320 e l'esito si vede anche a foglio chiuso;
  9. `5f3b9c3` Prenota: le correzioni della revisione;
  10. `de70178` Spunta la passata 02 in PIANO.md;
  11. `017e666` Prenota: il commento sulla chiave del profilo non ne scrive più una;
  12. Riscrive docs/ULTIMO-RITORNO.md per la passata 02 del lato cliente (il commit finale).
- Ogni commit compila: typecheck 0 dopo ciascuno. Il passo 1 era nato in due commit (i test dei testi riscritti per R1, che faceva cadere il file intero): riuniti in `352d636` prima del push, niente era pubblicato.
- **PR:** [wolfwood370-cell/nc-calendar#80](https://github.com/wolfwood370-cell/nc-calendar/pull/80) da `redesign/cliente-02-prenota` verso `redesign/cliente-mobile`, aperta e **non** unita. Descrizione: questo file.
- `git diff --stat origin/redesign/cliente-mobile...HEAD` prima di questo file: `22 files changed, 3214 insertions(+), 1216 deletions(-)`.

## 2 · Manifesto

- **NUOVI:**
  - `src/lib/client-book.ts` e `client-book.test.ts` (39 test);
  - `src/components/client-day-strip.tsx` e `client-day-strip.test.ts` (5 test); `src/components/client-slot-groups.tsx` e `client-slot-groups.test.ts` (4 test);
  - `src/components/book-type-picker.tsx`, `book-action-bar.tsx`, `book-sheets.tsx`, `book-blocked-card.tsx`.
- **MODIFICATI:**
  - `src/routes/client.book.tsx`: riscritta (+623 −581);
  - `src/hooks/use-book-confirm.ts`: riscritto (+175 −259);
  - `src/lib/client-slots.ts` (+82) e `client-slots.test.ts` (+104): solo aggiunte;
  - `src/lib/queries.ts`: `useClientBookingsForCredits`, solo aggiunte (+29);
  - `src/components/client-sheet.tsx`: `icon` e `returnFocus`, solo aggiunte (+12);
  - `src/lib/booking-allocation.ts`: resta `allocKey`, col commento di testa riscritto (+5 −78);
  - `src/routes/client.store.tsx`: `canPurchaseAddons` da `canBuyBooster`, più l'import (+2 −5);
  - `design_handoff_cliente_mobile/PIANO.md`: la riga 02 spuntata, nient'altro;
  - `docs/ULTIMO-RITORNO.md`: questo file.
- **TOLTI** (`git rm`): `src/components/book-calendar-grid.tsx`, `book-slots-grid.tsx`, `book-pool-picker.tsx`.
- **NEL PERIMETRO MA NON TOCCATI:** gli helper della 00 (`booking-rules.ts`, `client-credits.ts`, `client-session-status.ts`, `renewal.ts`, `current-block.ts`), `booking-slots.ts`, `client-shell.ts`, `query-keys.ts`, `credits.ts`, `session-time.ts`, `sentry.ts`, `use-current-block.ts`, `use-client-shell.ts`, `use-now.ts`, `use-confirm-attendance.ts`, `gcal.functions.ts`, `calendar.ts` (`generateGoogleCalendarLink` lo usa ancora il dettaglio), `reschedule-slots.ts`, `client-reschedule-sheet.tsx`, `reschedule-drawer.tsx`, `client-install-sheet.tsx`, `client-button.tsx`, `client-tab-header.tsx`, `segmented-control.tsx`, `src/routes/client.tsx` e le altre pagine del cliente, `src/components/ui/*`, `src/styles.css`, `src/routeTree.gen.ts`, le route e i componenti del coach, `supabase/`, `package.json`, `bun.lock`, `vitest.config.ts`; e i due commenti fermi del §9 (`integrations-gcal-card.tsx:7`, `session-create.ts:14`).

## 3 · I pezzi per le passate dopo (04, 05, 06)

**Componenti riusabili** (niente di Prenota dentro: C12 vuoto)

- `ClientDayStrip({ days: readonly ClientSlotDay[]; selectedIso: string | null; onSelect: (isoDate: string) => void; gutter?: number })` — `src/components/client-day-strip.tsx`. I giorni di `getClientSlotDays`, un pulsante 60×80 per giorno (raggio 18; `dow` 12/600, numero Sora 20/700 `tabular-nums`, `dayCaption` 12/600), in una fila che scorre in orizzontale ed esce fino ai bordi (margine `0 -gutter`, padding `2px gutter 6px`, gap 8, barra nascosta; `gutter` predefinito 16, Sposta lo vuole 20). Tre aspetti: disponibile (bianco, bordo `surface-variant`, didascalia `success-text`), scelto (`primary-container`, testo bianco, didascalia `primary-fixed`), non disponibile (`surface-container-low`, testo `outline`, `disabled`). `aria-pressed`, `aria-label` = `dayAriaLabel`; Tab passa da un giorno abilitato all'altro.
  - **Scorrimento:** porta in vista il giorno scelto impostando `scrollLeft` della fila (`useLayoutEffect` su `[selectedIso, gutter]`), all'apertura e quando la scelta cambia, del minimo che basta a vederlo coi margini; mai `scrollIntoView` (misurato: `window.scrollY` fermo, B2). Per ripartire anche a scelta uguale (una tipologia nuova col giorno di prima) chi lo usa gli dà una `key` (Prenota: la tipologia).
  - **Non fa:** non sceglie il giorno (Prenota sceglie il primo con orari, che resta finché ne ha); non mostra la regola sotto la fila; non toglie l'orario quando cambia il giorno.
  - L'anello del focus sta a filo (`outline-offset: 0`): la fila scorre, e 2 px sopra il pulsante c'è il bordo del suo riquadro.
- `ClientSlotGroups({ day: ClientSlotDay; selectedIso: string | null; onSelect: (iso: string) => void })` — `src/components/client-slot-groups.tsx`. I gruppi di `slotGroups` in colonna (gap 12, dentro gap 8): etichetta 13/700 («Consigliati» `aura-primary` con `Sparkles` 14 e sotto il motivo 13 px interlinea 1,4; le altre `on-surface-variant`); ogni gruppo `role="radiogroup"` con la sua `aria-label`, griglia a 3 colonne, orari `role="radio"` alti 48, raggio 14, 16/700: normali, consigliati (`primary-fixed`, bordo `primary-fixed-dim`), scelti (`primary-container`).
  - **Tastiera:** un punto di Tab per gruppo (l'orario scelto, altrimenti il primo); frecce (anche verticali), Home ed End spostano focus e scelta dentro il gruppo, con `segmentKeyTarget`. Niente hook: il focus passa cercando `[data-slot]` nel gruppo.
  - **Non fa:** nessun badge sopra i pulsanti; non sa per cosa si sceglie; una scelta vale solo se `selectedIso` è fra gli orari del giorno.

**Helper** (`src/lib/client-book.ts`, puro; l'ora entra come parametro)

- Tipi: `BookClient = { path_type: string | null; status: string; pack_label: string | null; auto_renew_blocks?: boolean | null }` · `BookCoach = { name: string | null; firstName: string | null; whatsapp: string | null }` · `BookOption` (`key`, `eventTypeId`, `sessionType`, `name`, `color`, `durationMin`, `bufferMin`, `location`, `address`, `message`, `state: "prenotabile" | "coach" | "esaurita"`, `count`, `sub`, `windows: CreditWindow[]`, `buyBooster: boolean`, `referencePool` e `nextPool: ClientPool | null`) · `Blocked = { kind: "concluso" | "nessun-credito" | "crediti-usati"; title; text; buy: boolean }` · `BookMismatch = PoolMismatch & { blockId }` · `BookState = { reference, next: ClientBlock | null; referenceNumber, nextNumber: number | null; options; blocked: Blocked | null; mismatches: BookMismatch[]; canBuy }` · `BookStateInput = { now, client, blocks, bookings, extras, eventTypes, boosterTitles, coach }`.
- `getBookState(input: BookStateInput): BookState` — riferimento (`clientReferenceBlock`, nullo per il libero), blocco dopo (`getNextBlock`; le sue righe solo se inizia entro oggi + 14), opzioni con finestre (`getCreditWindows`), stato, `count` (il pool della prima finestra: `blockAvail` del blocco dopo se la finestra è `source: "block"` **e** col suo `blockId`, altrimenti `avail` del riferimento), `buyBooster`, `blocked` (a, b, c), incoerenze, `canBuy`.
- `initialOption(options, eventType?): BookOption | null` · `rulesBlock(block, number): RulesBlock | null` · `howToBook(option, state, coach): { title; text; buy; whatsapp }`.
- Barra e riepilogo: `barType(option)` · `barWhen(slot)` · `whenLine(slot)` · `placeLine(option): string | null` · `creditLine(option, window, state)` · `summaryRule(iso, now)` · `doneText(name, iso, coach, email)` · `noSlotsText(name, until, coach)`.
- Soglie: `noticeOk(iso, now)` (≥ 24 ore) · `NOTICE_GONE` · `confirmsOnBooking(iso, now)` (≤ 48 ore). Errori: `bookingErrorMessage(err, name)` · `reportPoolMismatches(mismatches, send, seen)`.
- Il coach: `NO_COACH`, `writeToCoach(coach)` («Scrivi a Nicolò» / «Scrivi al tuo coach»), `writeOnWhatsApp(coach)`, `withCoachLine(coach)` («con Nicolò Castello», o null). Colori: `typeColor(color)`, `typeTint(color)` (`#rrggbb1a`).
- `canBuyBooster(client: Pick<BookClient, "path_type" | "status" | "pack_label">, hasActiveBlock: boolean): boolean` — la regola dello Store (`client.store.tsx:109`) e di Prenota: attivo, con un blocco attivo, fisso senza `pack_label` oppure abbonamento. La 06 la legge da qui.

**In `src/lib/client-slots.ts`** (solo aggiunte): `dayCaption(day): string` · `dayAriaLabel(day): string` · `dayHead(day): { dow; num }` (locale da `date-fns/locale/it`) · `slotGroups(day): ClientSlotGroup[]` con `ClientSlotGroup = { key: "consigliati" | DayPart; label; reason: string | null; aria; slots: ClientSlot[] }`.

**In `src/lib/queries.ts`** (solo aggiunte): `useClientBookingsForCredits(clientId?: string)` — le sessioni del cliente come `useClientBookings` più le annullate tardi con `deleted_at` (`or=(deleted_at.is.null,status.eq.late_cancelled)`), chiave `["bookings", "client", id, "credits"]`: la rinfresca `invalidateBookingScope`, e non si sovrappone alla lettura della cornice. La Home (05) la usa per i crediti.

**`ClientSheet`**, due prop nuove e facoltative: `icon?: ReactNode` (decorativa, sopra il titolo) e `returnFocus?: () => HTMLElement | null | undefined` (dove va il focus alla chiusura, se chi ha aperto il foglio non c'è più).

**Il coach e `get_my_coach`.** `client.book.tsx:112` è `const COACH = NO_COACH`. Col 02/10 diventa il coach letto da `get_my_coach`: `{ name: full_name, firstName, whatsapp }`, col link costruito da `getCoachContacts` (`src/lib/coach-contacts.ts`: `https://wa.me/<cifre>`). Da lì i testi dicono il nome, compare la riga «con …» del riepilogo e compaiono i pulsanti WhatsApp (card, riquadro senza orari, «Come si prenota»).

**La conferma della presenza fatta dall'app.** `use-book-confirm.ts:201`: dopo l'inserimento, se l'inizio è entro 48 ore, `confirm_booking_attendance`, aspettata; un errore va in console e la sessione resta «Da confermare». Si toglie con la migrazione O3 (02/10/2026), quando lo farà il server. Fallisce se l'orario è a meno di 24 ore dal momento della chiamata (`validate_client_booking_update`): per Prenota non succede, per i promemoria sì (04, 05, 08).

**La barra d'azione.** `BookActionBar` (`src/components/book-action-bar.tsx`) è `sticky`, ultima in una colonna alta almeno quanto lo schermo (`client.book.tsx:648`): sotto md `bottom: calc(65px + max(6px, env(safe-area-inset-bottom)))`, da md `bottom: env(safe-area-inset-bottom)`; `mt-auto` e `-mb-6` (i 24 px che il layout tiene sotto il contenuto). Misure del banco: a 390 il bordo inferiore a 773 su 773 della barra in basso, in cima e in fondo alla pagina; a 320 alta 90,5 (va a capo) e 729 su 729; a 1280 800 su 800, larga 528 dentro la colonna di 560. Non è un portal: «Continua» segue gli orari nell'ordine di Tab.

**Vincoli per chi usa questi pezzi**

- Sposta (04) passa a `ClientDayStrip` i giorni di `getClientSlotDays` con `windows: [getMoveWindow(...)]` e `exclude`, `gutter={20}`, e sceglie lui il giorno; il testo sotto la fila è `moveRulesText`.
- Una pagina che conta crediti legge le sessioni con `useClientBookingsForCredits`, non con `useClientBookings`; e manda le incoerenze solo a letture ferme (sessioni e blocchi non in rilettura), come `client.book.tsx:288`.
- Il credito di una prenotazione è la finestra di adesso del giorno scelto, non quella del momento della scelta.
- La numerazione dei blocchi nei testi viene da `blockNumber`; un blocco senza numero entra nei testi come `null` (`rulesBlock`).
- Una colonna con la barra `sticky` in fondo dipende dallo spazio che il layout lascia sotto (`client.tsx`): se il layout cambia quei numeri, cambiano anche `client.book.tsx:648` e `book-action-bar.tsx:32`.
- I link WhatsApp vanno in `href` così come arrivano: chi collega `get_my_coach` li costruisce con `getCoachContacts` (§9).

## 4 · Acceptance

Base = `origin/redesign/cliente-mobile` (`28c4b93`), misurata al passo 0. Dopo = il ramo a `017e666`, l'ultimo commit di codice (dopo c'è solo questo file).

| Controllo                   | Base                              | Dopo                                                                   |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| **C0** file nuovi           | 10 righe «MANCA»                  | nessuna riga                                                           |
| **C1** file tolti           | 3 righe; `15`                     | nessuna riga; `0`                                                      |
| **C2** calcoli della pagina | `10`; `0`, `0`, `0`               | `0`; `3`, `4`, `3`                                                     |
| **C3** la prenotazione      | `24`; `0`; `0`                    | `0`; `1`; `2`                                                          |
| **C4** pagina pulita        | `1`, `1`, `3`, `1`, `0`, `2`, `1` | `0` in tutte e sette                                                   |
| **C5** funzioni tolte       | `8`; `1`                          | `0`; `1`                                                               |
| **C6** annullate tardi      | `0`; `0`; `1`                     | `1`; `2`; `0`                                                          |
| **C7** Sentry               | `0`                               | `4`                                                                    |
| **C8** il resto non cambia  | —                                 | vuoto; `0`                                                             |
| **C9** solo aggiunte        | —                                 | `0`                                                                    |
| **C10** lo Store            | `0`; `6`                          | `2`; `6`; `2  5` (7 righe)                                             |
| **C11** cancelli            | 0 · 0 e 22 · 764 in 49 · build ok | 0 · 0 e **20** · **817 in 52** · UTC e Los Angeles 77 verdi · build ok |
| **C12** riusabili           | —                                 | nessuna riga                                                           |
| **C13** PIANO               | `[ ] \|`                          | `[x] \|`; solo `PIANO.md`, una riga                                    |
| **C14** route               | —                                 | nessuna riga                                                           |
| **C15** l'RPC               | `2`                               | `2`                                                                    |
| **C16** dati del prototipo  | 1 riga (`client.book.tsx:119`)    | nessuna riga                                                           |

**C11 · i quattro cancelli**, su `017e666`, in Git Bash:

- `bun run typecheck` → `$ tsc --noEmit`, exit 0, nessun errore.
- `bun run lint` → `✖ 20 problems (0 errors, 20 warnings)`. Confrontati con i 22 della base per file, riga e regola: mancano solo i due `react-hooks/exhaustive-deps` di `client.book.tsx:167`; nessun avviso nuovo.
- `bun run test` → `Test Files  52 passed (52)` · `Tests  817 passed (817)` (764 + 39 + 5 + 5 + 4), coi worker predefiniti, al primo colpo (tre corse intere sul codice finale, tutte verdi).
- Da PowerShell, `$env:TZ='UTC'` e poi `'America/Los_Angeles'` (offset letto: `0` e `420`), `bun run test src/lib/client-book.test.ts src/lib/client-slots.test.ts src/components/client-day-strip.test.ts src/components/client-slot-groups.test.ts` → `Test Files  4 passed (4)` · `Tests  77 passed (77)` tutte e due le volte.
- `bun run build` → `✓ built in 6.94s`, `1.98s`, `5.94s`, exit 0; `src/routeTree.gen.ts` invariato dopo la build (`git status` uguale prima e dopo).

Output dei controlli, incollato (`controlli.sh` fuori dal repo, a lavoro committato su `017e666`; le righe «fine …» segnano dove un controllo atteso vuoto non ha stampato niente; C4 una riga per voce, nell'ordine del prompt):

```text
### C0
(fine C0)
### C1
(fine C1 prima parte)
0
### C2
0
3
4
3
### C3
0
1
2
### C4
<main: 0
Dettagli tecnici: 0
\bfixed\b: 0
\["profile": 0
queryKeys\.profile: 0
trainer_settings: 0
coach-profile: 0
### C5
0
1
### C6
1
2
0
### C7
4
### C8
(fine C8 prima parte)
0
### C9
0
### C10
2
6
2	5	src/routes/client.store.tsx
(fine C10)
### C12
(fine C12)
### C13
16:| 02 | [Prenota](passes/02-prenota.md) | B1, B3–B7, N4, O1, D2, V15 | 00, 01 | — | [x] |
 design_handoff_cliente_mobile/PIANO.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
(fine C13)
### C14
(fine C14)
### C15
2
### C16
(fine C16)
```

## 5 · Le prove rosse

Uno script fuori dal repo (`rosse.mjs`) muta il file, esegue il suo test, rimette il file, controlla che sia uguale byte per byte e che `git diff` sia vuoto, riesegue il test. Fatte al passo 1 e al passo 2, e **rifatte tutte e quindici sul codice finale** (`5f3b9c3`, lo stesso albero di `017e666` per questi file) con lo stesso esito: rosse, rimesse, verdi.

- **R1** · `getBookState` senza le righe del blocco dopo (`const nextRows: ClientPool[] = []`) → `9 failed | 30 passed (39)`: fra gli altri «tutte le tipologie…» con `- "prenotabile", "60 min · 1 disponibile"` / `+ "esaurita", "Crediti esauriti"` per il test. Rimesso: `39 passed (39)`.
- **R2** · `count` sempre dalla riga del riferimento → `3 failed | 36 passed (39)`: `- "60 min · 1 disponibile"` / `+ "60 min · 0 disponibili"`; anche «la PT ha una finestra per blocco…» e «nel 4 anche la call e la BIA…». Rimesso: verde.
- **R3** · il caso c) ignora le tipologie col coach → `1 failed`: «PT esaurita ma BIA col coach con un credito: niente card, la PT col Booster». Rimesso: verde.
- **R4** · ogni P0001 come crediti → `1 failed`: «un P0001 che non parla di crediti, col suo messaggio». Rimesso: verde.
- **R5** · `noticeOk` con `>` → `1 failed`: «preavviso: a 24:00 si prenota, a 23:59 no» (`- true` / `+ false`). Rimesso: verde.
- **R6** · `confirmsOnBooking` con `<` → `1 failed`: «presenza confermata entro 48 ore comprese» (`- true` / `+ false`). Rimesso: verde.
- **R7** · `creditLine` senza «del blocco N» → `1 failed`: «il riepilogo: quando, dove, credito» (il 12/10). Rimesso: verde.
- **R8** · `howToBook` senza il punto finale → `1 failed`: la BIA, `+ "…disponibilità di Michael Hai 1 credito disponibile."`. Rimesso: verde.
- **R9** · `dayAriaLabel` che per `crediti` dice «pieno» → `client-slots.test.ts` `1 failed | 28 passed (29)`: «il test, solo col blocco 4: senza crediti fino all'11/10…». Rimesso: `29 passed`.
- **R10** · `slotGroups` che lascia i consigliati nella loro parte → `4 failed | 29 passed (33)` su `client-slots.test.ts` e `client-slot-groups.test.ts`: «il 29/09: le 11:10 consigliate…», «tre radiogroup…» (`- 3` / `+ 4`), «le 11:10 consigliate compaiono una volta sola», «senza scelta, il punto di Tab…». Rimesso: `33 passed`.
- **R11** · `canBuyBooster` che ignora `pack_label` → `2 failed`: «lo stesso con un PT Pack…» e «fisso sì, fisso con PT Pack no…» (`- false` / `+ true`). Rimesso: verde.
- **R12** · «concluso» con `new Date()` → `1 failed`: «nel 2031, col secondo blocco finito il 7 settembre: percorso concluso». Rimesso: verde.
- **R13** · `ClientDayStrip` senza `disabled` → `client-day-strip.test.ts` `1 failed | 4 passed (5)`: «il 28/09 senza orari è disabilitato, col suo motivo». Rimesso: `5 passed`.
- **R14** · `reportPoolMismatches` che non ricorda (tolto `seen.add(key)`) → `1 failed`: «una volta per ogni insieme diverso…» (`- 1` / `+ 2`). Rimesso: verde.
- **R15** · il blocco dopo riconosciuto dal solo `blockId` → `1 failed`: «con un extra PT: prenotabile coi due blocchi pagati dall'extra», `Expected: "Userai 1 credito Sessione PT: ne resterà 1."` · `Received: "Userai 1 credito Sessione PT del blocco 4: non ne resteranno altri."`. Rimesso: verde.

## 6 · Il browser

**Il banco**, fuori dal repo (`%TEMP%\claude\C--Coworks-NC-App-Development-repos-nc-calendar\e12d7d23-6a9d-4d24-8943-71cffd9f53a9\scratchpad\banco`): quello della 01 copiato (Playwright 1.64 della cache npx, `chromium_headless_shell-1200`, Vite sul repo con una configurazione generata fuori dal repo), con in più:

- **Le funzioni server non girano:** `@/lib/gcal.functions` è sostituito da un modulo finto nel browser (`gcal-finto.js`, alias in testa alla configurazione di Vite): `gcalCreateEvent` risponde `{ ok: true, … }` dal browser e registra la chiamata; nessuna richiesta a `/_serverFn/` (contate: zero). In più il server di Vite gira con `SUPABASE_URL` e `VITE_SUPABASE_URL` su `http://finto-supabase.test`.
- **Sentry finto** (`sentry-finto.js`, alias di `@/lib/sentry`): `captureMessage` registra messaggio e livello in `window.__sentryCalls`.
- **Il finto PostgREST** (`fake.mjs`): filtro `or=(…)`, RPC con gestori (`get_coach_busy` calcolato dalla tabella delle sessioni del coach, `ensure_client_block_state` con l'ultimo blocco o creando il mese dopo, `confirm_booking_attendance` che scrive `client_confirmed_at`), errori con codice (`23P01` con 409, `P0001` con 400), e dopo un inserimento in `bookings` il credito impegnato come i trigger del server (`quantity_booked` del blocco di `block_id`, o dell'extra).
- **I dati** (`seed-prenota.mjs`): le tipologie e Giulia del §4.1 (profilo con `giulia.b@email.it`), i tre `booster_packs`, gli orari da lunedì a sabato 9-13 e 15-20, gli occupati del §8 come sessioni di un altro cliente più quelle di Giulia; le varianti Marta, Davide, Elena, «tutto usato» (anche con la BIA usata e col PT Pack), nessuna allocazione, l'abbonata del B11, l'annullata tardi con `deleted_at`, l'incoerenza. Ora fissa lunedì 28/09/2026 10:40 a Roma (`context.clock.setFixedTime`). Ogni richiesta verso un host diverso da `localhost` è servita dal finto o bloccata e contata.

Esito sul codice finale (`5f3b9c3`; `017e666` cambia solo un commento): `giro-prenota.mjs` **82/82**; in console solo le 11 risposte 400/409/500 forzate dalle prove (B9, B13), nessun errore dell'app; zero richieste bloccate, zero funzioni server. `cattura-prenota.mjs` e `confronto-prenota.mjs` per il B14.

- **B1** · A 390: titoli «Cosa vuoi prenotare?», «Quando?», «Martedì 29 settembre»; le quattro tipologie nell'ordine con `[nome, motivo, aria-checked, aria-disabled]` = Sessione PT «60 min · 3 disponibili» `true`; BIA «Si prenota con il tuo coach» `false` `true`; Test «60 min · 1 disponibile» `false`; Call «Crediti esauriti» `false` `true`; bordo, anello e punto della Sessione PT `rgb(0, 86, 133)`; «Crediti esauriti» `rgb(154, 52, 18)` (`warning-ink`); 15 giorni, premuto il 29/09; nessun «Europe/Rome», «fuso», «Dettagli tecnici», «Consigliato» in pagina. A 320 nessun elemento del contenuto (fila esclusa) con `scrollWidth > clientWidth`. Confronto con `02-prenota-01-giorni-e-orari.png`: stessa struttura, misure e colori; i dati sono quelli del §4.1 (`giro/B1-390-giorni-e-orari.png`).
- **B2** · 28/09 `disabled`, «lun|28|—», `aria-label` «Lunedì 28 settembre, serve 24 ore di preavviso»; 30/09 «pieno»; 04/10 e 11/10 «chiuso»; 12/10 abilitato («7 orari»), ed è l'ultimo; 29/09 «mar|29|4 orari». Scelto il test (clic senza lo scorrimento automatico di Playwright, pagina scorsa di 120 px): premuto il 12/10, il pulsante a 314-374 dentro la fila 0-390, `scrollLeft` 654, `window.scrollY` 120 prima e dopo; URL `?eventType=<test>`. Tornando alla Sessione PT il 29/09 torna in vista.
- **B3** · f) per la Sessione PT e d) per il test, parola per parola (quelle del §4.1).
- **B4** · «Orari consigliati» / «Consigliati» con `Sparkles` e «Subito dopo le altre sessioni della giornata: meno attese per te e per lo studio.» / [11:10]; «Orari pomeriggio» [15:00, 16:00]; «Orari sera» [17:00]; «11:10» una volta sola nel testo della pagina.
- **B5** · BIA: «BIA (Bioimpedenziometria)», «Per prenotare la BIA è necessario passare in reception per verificare la disponibilità di Michael. Hai 1 credito disponibile.», azioni solo «Chiudi». Call: «Crediti Call di consulenza esauriti», «Hai usato tutti i crediti Call di consulenza del blocco 3. Per altre sessioni scrivi al tuo coach.», solo «Chiudi». Nessun link `wa.me` nella pagina; la Sessione PT resta scelta. «Tutto usato»: Sessione PT «Crediti esauriti», BIA col coach, solo la sezione 1; il foglio della Sessione PT ha «Acquista un Booster» → `/client/store?type=<id della Sessione PT>`, e il clic apre lo Store con quel `type`. Confronto con `02-prenota-05-come-si-prenota.png` (`giro/B5-390-come-si-prenota-booster.png`, `…-bia.png`).
- **B6** · Tecnica: **sticky** (§3). Nessuna barra prima di scegliere; dopo le 11:10 «Sessione PT · 60 min» e «mar 29 set · 11:10–12:10». A 390 bordo inferiore della barra 773, bordo superiore della barra in basso 773, sia in cima alla pagina sia in fondo (scorsa di 290 px); in fondo l'ultimo orario (17:00) finisce a 676,1, la barra comincia a 700. A 320 la barra va a capo (alta 90,5), bordo inferiore 729 su 729, «Continua» intero (188-304) e i due testi dentro la loro scatola. Cambiando giorno sparisce; scelto un orario e cambiata tipologia, sparisce. A 1280: bordo inferiore 800 su 800 in cima e in fondo, 376-904 dentro la colonna 360-920 (560). Confronto con `02-prenota-02-orario-scelto.png` (`giro/B6-390-orario-scelto.png`, `B6-320-…`, `B6-1280-…`).
- **B7** · Il riepilogo delle 11:10: «Sessione PT», «60 minuti», «Martedì 29 settembre, 11:10–12:10», «Studio · Via Roma 12, Bologna», «Userai 1 credito Sessione PT: ne resteranno 2.», «Puoi spostarla o annullarla gratis prima di lunedì 28 settembre alle 11:10. La presenza risulta già confermata.»; nessuna riga «con …»; `role="dialog"`, `aria-modal="true"`, focus dentro; «Indietro» chiude e la barra c'è con lo stesso orario, focus su «Continua». Confronto con `02-prenota-03-riepilogo.png` (`giro/B7-390-riepilogo.png`).
- **B8** · Una scrittura su `bookings`: `block_id` del blocco 3, `event_type_id` della Sessione PT, `session_type` «PT Session», `scheduled_at` `2026-09-29T09:10:00.000Z`; poi una chiamata a `confirm_booking_attendance`, e la sessione ha `client_confirmed_at`; una chiamata ciascuno a `gcalCreateEvent` (risposta del banco), `booking-notifications` e `send-push`; l'esito «Prenotata» col testo del §4.1 (con `giulia.b@email.it`), focus nel foglio; la barra sparisce; `get_coach_busy` riletto (1 → 2). «Vedi la sessione» apre `/client/bookings/<id nuovo>`; Indietro torna a Prenota con la Sessione PT scelta, «60 min · 2 disponibili», e le 11:10 non ci sono più. Il 12/10 alle 9:00: riepilogo «Userai 1 credito Sessione PT del blocco 4: ne resteranno 7.» e «Ti chiederemo di confermare la presenza 48 ore prima.»; `block_id` del blocco 4, nessuna chiamata a `confirm_booking_attendance`; «Prenota un'altra sessione» chiude, focus sul titolo «Lunedì 12 ottobre», e le 9:00 del 12/10 non ci sono più. Il test del 12/10 alle 10:10 (il primo libero): `block_id` del blocco 4; dopo la rilettura il test è «Crediti esauriti» e l'esito resta aperto; chiuso, la scelta è la Sessione PT, l'URL `?eventType=<Sessione PT>`, focus sul titolo «Martedì 29 settembre». Dopo le tre prenotazioni, zero chiamate a Sentry. Confronto con `02-prenota-04-prenotata.png` (`giro/B8-390-prenotata.png`, `B8-390-test-ultimo-credito.png`).
- **B9** · `23P01` → «Questo orario non è più libero: scegline un altro.» con `role="alert"` nel foglio, `get_coach_busy` riletto (1 → 2), focus nel pannello; `P0001` «Credito di blocco non disponibile per questa tipologia.» → «Non hai crediti disponibili per Sessione PT.»; dopo gli errori l'orario resta (la barra c'è); due clic sincroni su «Conferma prenotazione» con l'inserimento ritardato di 600 ms → una scrittura sola. Le 11:10 del 29/09 col foglio aperto e l'orologio portato alle 11:11 del 28/09 → «Mancano meno di 24 ore a questo orario: scegline un altro.» e nessuna scrittura. In più (revisione, punto 1): il coach usa l'ultimo credito PT mentre il cliente conferma (P0001, e la rilettura rende la PT esaurita) → il riepilogo resta aperto con l'errore e l'orario; chiuso, la scelta passa al test con l'URL aggiornato, e scegliendo un orario del test il riepilogo non si riapre da solo.
- **B10** · Davide: card «Il tuo percorso è concluso» col testo, nessun pulsante, sottotitolo «Percorso concluso» (confronto con `02-prenota-07-davide-percorso-concluso.png`). «Tutto usato» con la BIA usata: «Hai usato tutti i crediti», «Puoi aggiungere un Booster…», un solo link, «Acquista un Booster» → `/client/store`. Lo stesso col PT Pack: «Per continuare scrivi al tuo coach.», nessun pulsante. Nessuna allocazione: «Nessun credito da prenotare». Marta: «Abbonamento mensile · blocco 4 · fino a domenica 4 ottobre», 7 giorni, la regola i), Sessione PT «60 min · 2 disponibili», test «Crediti esauriti» (confronto con `02-prenota-06-marta-limite-blocco.png`). Elena: «Crediti senza scadenza», la sola frase base, «60 min · 4 disponibili» e «45 min · 1 disponibile»; riepilogo «Userai 1 credito Sessione PT: ne resteranno 3.»; la prenotazione scrive `block_id` `null`.
- **B11** · Orologio al 05/10/2026 10:40, abbonata col rinnovo acceso e il mese 4 fino al 04/10; il finto `ensure_client_block_state` (risposta ritardata di 1,2 s) crea il mese 5 dal 05/10 all'01/11 con 8 Sessioni PT e ne restituisce l'id. Campionato il testo della pagina ogni 150 ms durante il caricamento: mai «percorso concluso». A caricamento finito: «Abbonamento mensile · blocco 5 · fino a domenica 1 novembre», Sessione PT «60 min · 8 disponibili»; tre letture di `training_blocks` (la prima, la rilettura una volta, quella dopo l'RPC).
- **B12** · Con l'assente sostituita da un'annullata tardi con `deleted_at`: la richiesta delle sessioni porta `or=(deleted_at.is.null,status.eq.late_cancelled)`; Sessione PT «60 min · 3 disponibili»; zero chiamate a Sentry.
- **B13** · `get_coach_busy` in errore (sempre, dopo i tre tentativi di TanStack Query) → sezione 1 e «Orari non aggiornati» con «Riprova», nessun giorno; il finto torna a rispondere, «Riprova» → 15 giorni. `training_blocks` in errore → «Prenota non si è caricata» col suo testo; campionato ogni 200 ms fino alla card (38 campioni): mai «Nessun credito da prenotare» né «Il tuo percorso è concluso»; «Riprova» → la prenotazione.
- **B14** · Base (`28c4b93`, l'albero portato lì con `git switch --detach` e riportato sul ramo) contro ramo, stessi dati e stessa ora: il testo del contenuto (la pagina meno i suoi `<header>`) di Home (1185 caratteri), Sessioni (334), Booster (797), Profilo (842) e dettaglio (248) **uguale**, titoli uguali; le schermate del coach `/trainer` a 1440×900 e 390×844 **uguali byte per byte**. Differenze: nessuna. Su tutte e due un avviso di React nel Profilo (§9).
- **B15** · Zero richieste esterne bloccate e zero funzioni server in tutto il giro e nelle due catture.
- **B16** · Nomi accessibili (albero di Chrome, `getByRole`): «Sessione PT 60 min · 3 disponibili», «BIA (Bioimpedenziometria) Si prenota con il tuo coach», «Martedì 29 settembre, 4 orari», «11:10». Tab dal titolo della sezione entra sulla Sessione PT; freccia giù porta il focus sulla BIA e la Sessione PT resta `aria-checked="true"`; anello `solid 2px rgb(0, 86, 133)`, scostato di 2 px; Invio apre «Come si prenota» della BIA, Esc lo chiude e il focus torna sulla BIA; freccia giù sceglie il test (e l'URL). Negli orari la freccia destra sposta focus e scelta (15:00). I giorni abilitati si raggiungono con Tab. Chiuso l'esito con «Prenota un'altra sessione», `document.activeElement` è il titolo della sezione degli orari, non il `body`.
- **B17** · Con un'incoerenza: una sola chiamata a Sentry in 95 secondi (tre passi di `useNow`), livello `warning`, messaggio «Prenota: sessioni e crediti non coincidono (Sessione PT) · <blocco 3>/<Sessione PT>: 4 contate, 5 registrate». Misurato col finto `@/lib/sentry`. (Il primo rosso, dovuto all'aggiornamento a caldo, al passo 6.)

**Schermate** (nella cartella del banco): `giro/B1-320-giorni-e-orari.png`, `B1-390-…`, `B1-1280-…`, `B2-390-test-12-ottobre.png`, `B5-390-come-si-prenota-bia.png`, `B5-390-come-si-prenota-booster.png`, `B6-320-orario-scelto.png`, `B6-390-…`, `B6-1280-…`, `B7-390-riepilogo.png`, `B8-390-prenotata.png`, `B8-390-test-ultimo-credito.png`, `B9-390-23P01.png`, `B10-390-davide-percorso-concluso.png`, `B10-390-crediti-usati.png`, `B10-390-marta-limite-blocco.png`, `B10-390-elena-prenotata.png`, `B11-390-mese-nuovo.png`, `B13-390-orari-non-aggiornati.png`, `B13-390-prenota-non-caricata.png`; base e ramo in `cattura-base/` e `cattura-ramo/`. Esiti completi in `giro-completo.log`, `giro/esito.json`, `confronto.txt`.

## 7 · Non fatto

- **Nessuna prova su un iPhone vero:** la barra `sticky` con `env(safe-area-inset-bottom)` e la fila dei giorni col dito; nel banco le safe area valgono 0.
- **Nessuna misura sulla build di produzione:** l'anteprima passa da workerd di Cloudflare, e non l'ho avviata per non fare richieste di rete dal banco.
- **I pulsanti WhatsApp** non si vedono con `NO_COACH`, e nel browser non li ho provati con un link: li coprono i test dei testi (`writeToCoach`, `writeOnWhatsApp`, `howToBook` con un coach finto).
- **La tastiera degli orari** non ha un test unitario (il componente è provato col markup statico); l'ha provata il browser (B16).
- Dal brief: il nome del coach e la riga «con …» (arrivano con `get_my_coach`).

## 8 · Divergenze

Dove il prompt, il brief o il prototipo dicevano una cosa e il repo un'altra; vince la misura.

**Base e ambiente**

- Il clone era su `main` @ `3d29634`, non su `redesign/cliente-01-shell` @ `c869af9`.
- C16 sulla base: la riga col nome è `client.book.tsx:119` (il commento va a capo a `:120`).
- `TZ=America/Los_Angeles` non arriva a Node da Git Bash (passo 0): prove col fuso da PowerShell.
- La suite: coi worker predefiniti è caduto `current-block.test.ts`, non uno dei cinque del 29/09; sul ramo finito nessuna caduta in tre corse intere.
- Le righe citate dal prompt corrispondono sulla base (`client.book.tsx:105`, `:115-120`, `:127-142`, `:148-160`, `:167`, `:171-174`, `:229-264`, `:266-335`, `:383-400`, `:513`, `:539-566`, `:571-584`, `:611-629`, `:644-667`; `use-book-confirm.ts:78`, `:97`, `:100-117`, `:154-162`, `:179-199`, `:184`, `:201-210`, `:216-227`, `:239-262`, `:266-277`, `:279-284`, `:289-298`, `:301`; `client.store.tsx:108-112`; `booking-allocation.ts:10`, `:21`; `client-credits.ts:165`, `:287`, `:294`, `:334`, `:354`, `:362-367`; `client-slots.ts:33`, `:47`, `:114`; `booking-rules.ts:37`, `:61`, `:112`, `:125`, `:160`; `client-session-status.ts:147`, `:168`; `renewal.ts:79`, `:87`; `current-block.ts:23`, `:75`; `query-keys.ts:68`, `:73`, `:81`; `queries.ts:181`, `:255`, `:275`, `:316`, `:324`, `:368`, `:433`, `:446`, `:465`, `:672`; `sentry.ts:71`; `use-client-shell.ts:121`; `types.ts:1337`; `use-confirm-attendance.ts:20`).

**Scelte sul codice**

- **La barra d'azione `sticky`** (il prompt lasciava la scelta) e la colonna alta quanto lo schermo per tenerla attaccata anche con poco contenuto; a 320 va a capo invece di troncare (il brief non lo dice; B6 chiedeva solo «Continua» intero).
- **Riepilogo ed esito nello stesso foglio** (`BookConfirmSheet`), come il prototipo: «il foglio passa a Prenotata».
- **Mentre conferma, «Indietro» è disattivato**; se il foglio si chiude comunque, la risposta lo riapre sull'esito o sull'errore. Non era nel prompt.
- **`count` e «del blocco N»:** in `howToBook` una tipologia che c'è solo nel blocco dopo dice il numero del blocco dopo (il prompt parlava del riferimento, e taceva di questo caso).
- **Le incoerenze** portano il `blockId` (`BookMismatch`) e partono solo a letture ferme (revisione, punto 2).
- **Le letture fallite:** la card solo senza dati; una rilettura fallita coi dati di prima tiene la pagina (revisione, punto 8). Un profilo che non c'è (`maybeSingle` vuoto) dà la card «Prenota non si è caricata». Senza `coach_id` i giorni risultano chiusi e non si rompe niente. Mentre disponibilità, eccezioni e occupati arrivano, uno scheletro al posto delle sezioni 2 e 3.
- **Il giorno mostrato si ricorda** e resta finché ha orari, anche se un giorno prima si libera; **il credito** si prende dalla finestra di adesso del giorno scelto (revisione, punti 5 e 6).
- **La chiave degli occupati** è `["coach-busy", coachId, "prenota", <oggi>]`, con gli occupati di prima tenuti a mezzanotte (`placeholderData`).
- **`ClientSheet`** con due prop nuove (`icon`, `returnFocus`) invece di mettere l'icona dentro il titolo.
- **L'anello del focus dei giorni** a filo (`outline-offset: 0`).
- **«Riprova»** delle due card è un pulsante secondario (il brief non lo diceva).
- Le divergenze dal brief elencate dal prompt (§5) sono applicate così: giorni fino al 12/10 per Giulia; `crediti` col trattino; «prima di»; «il tuo coach» e niente WhatsApp senza link; la frase del Booster solo col Booster di quella tipologia; le tipologie del blocco dopo e il loro numero; la conferma della presenza fatta dall'app; le due card delle letture fallite; `aria-disabled` nel radiogroup; «Studio» senza indirizzo e nessuna riga del luogo senza tipologia; il contenuto in un `div`; il punto finale al messaggio del coach; `canBuy` con la regola dello Store.

## 9 · Trovati e non toccati

- **Commenti fermi su righe spostate:** `src/components/integrations-gcal-card.tsx:7` cita `use-book-confirm.ts:244` (la chiamata a `gcalCreateEvent` ora sta a `:104`, dentro `announce`); `src/lib/session-create.ts:14` cita `use-book-confirm.ts:179-194` (l'inserimento ora sta a `:160-177`). Fuori dal perimetro.
- **La suite in parallelo:** il messaggio del file caduto sulla base è al passo 0 (`current-block.test.ts`, `0xC0000409`). Non l'ho visto ricadere sul ramo; la causa resta aperta.
- **`count` della prima finestra anche quando quella finestra non ha più giorni prenotabili** (revisione, punto 7): l'ultimo giorno di un blocco con crediti residui, la lista dice «2 disponibili» (il blocco in corso) ma il primo orario prenotabile, per le 24 ore, è già nel blocco dopo, e il riepilogo dice «del blocco 4: ne resteranno 7». È la regola del prompt (§4.1 punto 2) applicata alla lettera, e senza blocco dopo la tipologia risulta prenotabile con la fila senza orari (fino al giorno dopo, quando arriva la card del percorso concluso). Da decidere se `count` debba guardare la prima finestra con giorni prenotabili.
- **Il link WhatsApp va in `href` senza controllo dello schema** (revisione, nota; `book-blocked-card.tsx`, `book-sheets.tsx`, `client.book.tsx`). Oggi è sempre nullo; chi collega `get_my_coach` deve costruirlo con `getCoachContacts` (`https://wa.me/<cifre>`).
- **Avviso di React nel Profilo**, sulla base e sul ramo: «Encountered two children with the same key … Sessione PT» da `client.settings.tsx:357` (`key={p.name}`), con due righe dallo stesso nome. È della 07.
- **I giorni non disponibili** (`outline` su `surface-container-low`) fanno 4,03:1, sotto 4,5 (lo misura già `contrast.test.ts`): sono controlli disabilitati, esclusi dal criterio 1.4.3, e il colore è quello del brief.
- **Focus durante la conferma:** il pulsante disattivato perde il focus (regola del browser), e Radix lo riporta sul pannello del foglio; dopo un errore il focus è sul pannello, non sul pulsante.
- **Limiti del server** (§5 del prompt), invariati: il credito che il server può prendere da un altro blocco (`validate_booking_block_allocation`); la scadenza degli extra; le tipologie col coach che il server non ferma più; la conferma della presenza che fallisce sotto le 24 ore; il cliente libero con gli extra finiti che vede «Nessun credito da prenotare».

## 10 · Resta a Nicolò

- Il merge della PR [wolfwood370-cell/nc-calendar#80](https://github.com/wolfwood370-cell/nc-calendar/pull/80) nel ramo di integrazione `redesign/cliente-mobile`, dopo la verifica di Cowork; e il rilascio su `main`, **non prima della correzione del server del 02/10/2026** (il credito preso da un blocco diverso da quello del giorno).
- Da girare a Cowork: la regola di `count` all'ultimo giorno di un blocco (§9), e il link WhatsApp da costruire con `getCoachContacts` quando arriva `get_my_coach`.
- La prova su un iPhone vero della barra `sticky` con la safe area.
