# Ultimo ritorno · Lato cliente · Passata 00 · Fondamenta

## 0 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **La base e i due rami.** Nessun commit.
   - `git show origin/main:src/lib/renewal.ts | grep -c -E "^export (function|const) clientReferenceBlock"` → `1`: la correzione dell'abbonato è su `main`.
   - `origin/main` = `14c09e9` (merge della PR 77, `fix/abbonato-mese-per-data`, sopra `aa1ebfe`). `redesign/cliente-mobile` creato da lì con `git switch --no-track -c` e pubblicato senza commit: `git ls-remote origin refs/heads/redesign/cliente-mobile` → `14c09e973f3245e7af84c579dfa635162eafb009`, lo stesso hash. `redesign/cliente-00-fondamenta` creato da `redesign/cliente-mobile`.
   - ⚠️ Il clone non era su `redesign/coach-10-verifica-finale` @ `1afeb87` ma su `main` @ `3d29634`, pulito a parte `design_handoff_cliente_mobile/` (non tracciata, 60 file, non toccata). E `origin/main` nel clone era già `14c09e9` prima del fetch, non `d51eae6`: il fetch non ha portato niente di nuovo.
   - `git diff --stat b780645 origin/main -- package.json bun.lock` → vuoto. L'albero di `aa1ebfe` è `977a12c`, come atteso.
   - Base misurata su `14c09e9`: typecheck 0 errori · lint **678 errori e 22 avvisi** col pacchetto presente (tutti `prettier/prettier`: `nc-client.js` 170, `nc-icons.js` 8, `nc-ios-frame.js` 22, `nc-store.js` 231, `support.js` 247), **0 errori e 22 avvisi su 309 file** col pacchetto escluso (`--ignore-pattern "design_handoff_cliente_mobile/**"`) · **628 test in 43 file**, verdi alla prima corsa coi worker predefiniti · build riuscita.
   - `TZ=UTC node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"` → `0` (senza `TZ` → `-120`): il fuso arriva a Node.
   - Memoria all'avvio: 2,5 GB fisici liberi, 6,5 GB impegnabili. Nessun errore di memoria in tutta la passata.
1. ☑ **Il pacchetto e le guardie** (§4.8). `0d019b5` «Pacchetto del lato cliente fuori da lint e prettier» (una riga in `eslint.config.js:19`, sotto il commento del pacchetto del coach, e una in `.prettierignore:11`) e `085f47c` «Aggiunge il pacchetto di handoff del lato cliente mobile».
   - C8 `eslint.config.js:1`, `.prettierignore:1`; C9 `bun run lint` → 0 errori e 22 avvisi; C10 `60` e stato vuoto.
   - I 60 file committati sono byte per byte quelli del disco: `git hash-object` di ognuno uguale al blob di `HEAD` (60 su 60), `sha256sum` del disco uguale prima e dopo il commit.
   - R7 rossa: §5.
2. ☑ **Le regole e i testi** (§4.1). `f267caa` «Regole del cliente: 24 ore e 14 giorni, in un posto solo»; poi `616daf7` (passo 10).
   - C1 7 righe; C2 `0`; C3 `1` e `1`, e `src/lib/reschedule-slots.ts:12` vale `CLIENT_RESCHEDULE_WINDOW_DAYS`. `booking-rules.test.ts` 28 test (erano 4), uguali con `TZ=UTC`.
   - ⚠️ I testi di Prenota (`bookingRulesText`, `src/lib/booking-rules.ts:160`) leggono le finestre dei crediti (`CreditWindow`, definita in `booking-rules.ts`, che resta la foglia e non importa nessun helper del cliente) invece di rifare la regola dei blocchi, e non scrivono una frase che le finestre smentirebbero. Il testo di Sposta (`moveRulesText`) legge la finestra di `getMoveWindow`. Dettagli al §7.
3. ☑ **Il tempo** (§4.5). `ca29384` «Tempo relativo del cliente: Oggi, Domani, tra 25 min».
   - C11 prime due parti `0` e `1`; C5 terza parte `0`. `session-time.test.ts` 13 test (erano 6), uguali con `TZ=UTC`.
   - `formatUntil` restituisce `null`, non la stringa vuota, per «niente» (già iniziata).
4. ☑ **Il generatore di orari** (§4.2). `72bc825` «Orari del cliente: un generatore solo, sopra generateSlots»; poi `f198cbb` (passo 10).
   - `client-slots.test.ts` 24 test, uguali con `TZ=UTC`. R1, R2, R3 rosse: §5.
   - `recommendedReason` c'è solo se il giorno ha almeno un orario consigliato. «Il giorno ha sessioni» è il criterio di `generateSlots` (una sessione che inizia quel giorno, `src/lib/booking-slots.ts:99-104`), così motivo e consigliati non si contraddicono.
   - ⚠️ I motivi dei giorni vuoti partono dagli orari possibili del giorno, calcolati con `generateSlots` stesso (fasce ed eccezioni, senza sessioni né preavviso, `src/lib/client-slots.ts:213`): nessuno → `chiuso`, poi `crediti`, poi `preavviso` se tutti iniziano prima di `now + 24 h`, poi `pieno`.
5. ☑ **Blocchi, crediti e finestre** (§4.3). `cee5e24` «Crediti del cliente: una definizione sola, e il blocco dopo coi suoi crediti»; poi `2774196` (passo 10).
   - C15 `1`, e `renewal.ts` `1 insertion(+), 1 deletion(-)`. `client-credits.test.ts` 37 test, uguali con `TZ=UTC`. R4, R5, R8, R9, R10 rosse: §5.
   - ⚠️ Due campi in più nella riga, oltre all'elenco del §4.3 punto 3: `extraUntil` (l'ultimo giorno in cui vale un extra della tipologia, serve a `getCreditWindows` per «mai oltre la loro scadenza») e `sessionType` (serve all'inserimento della prenotazione). `getClientPools` restituisce `{ rows, mismatches, concluded }`.
   - `blockNumber` è la regola di `blockChip`, esportata perché i testi vogliono anche il numero del blocco dopo. `getClientBlockInfo` riceve il cliente come `RenewalClient` (`status`, `path_type`, `auto_renew_blocks`) perché passa da `renewsAutomatically`, che vuole quel tipo.
6. ☑ **Gli stati della sessione** (§4.4). `f97ef32` «Stati della sessione del cliente, in un posto solo».
   - `client-session-status.test.ts` 9 test, uguali con `TZ=UTC`. R6 rossa: §5.
   - Contrasti ricalcolati: «In corso» 9,59:1 e «Prenotata» 6,90:1 col colore fuso arrotondato ai pixel (6,92 senza arrotondare), come nel commento di `CLIENT_STATUS_TONE`.
7. ☑ **I contatti del coach** (§4.6). `ccb0f6c` «Contatti del coach: WhatsApp, telefono ed email».
   - C12 `4` e nessuna riga; `coach-contacts.test.ts` 5 test.
   - `tel` è `null` anche col numero troppo corto per `whatsappUrl`: i due pulsanti compaiono o mancano insieme.
8. ☑ **I token** (§4.7). `fde4583` «Token del lato cliente».
   - C6 10 righe (`src/styles.css:110-119`); C7 `0`; `contrast.test.ts` 9 test (erano 7): `warning-ink` su `warning-soft` 6,88:1, `rating-text` su `rating-soft` 6,37:1.
   - La card «Regole di prenotazione» vista nel browser (banco con finto backend della passata 09, fuori dal repo, `/trainer/availability` a 1440×900): «Preavviso minimo 24 ore», «Prenotabile fino a 14 giorni in anticipo» e la nota nuova; nessun errore in console, nessuna richiesta bloccata; dev server chiuso e albero pulito dopo.
9. ☑ **Chiusura** (§9). Dopo il passo 10: controlli del §6 tutti insieme (§4), `f6d75ab` «Spunta la passata 00 in PIANO.md», push, PR [wolfwood370-cell/nc-calendar#78](https://github.com/wolfwood370-cell/nc-calendar/pull/78) verso `redesign/cliente-mobile`, aperta e non unita, e «Riscrive docs/ULTIMO-RITORNO.md per la passata 00 del lato cliente», l'ultimo commit del ramo (il suo hash sta nel blocco finale della risposta: un file non contiene l'hash del commit che lo scrive).
   - ⚠️ Il numero della PR esiste solo dopo averla aperta: l'ho aperta con `--body-file docs/ULTIMO-RITORNO.md` quando questo file non lo conteneva ancora, poi l'ho scritto qui, committato, pubblicato, e ho rimesso questa versione come descrizione con `gh pr edit --body-file`. Nessun `--amend`, nessun push forzato.
10. ☑ **Passo aggiunto: le correzioni della revisione.** Aggiunto in fondo come chiede il prompt, fatto prima della chiusura. Un revisore in sola lettura sul diff ha segnalato otto punti; li ho verificati uno per uno su codice e migrazioni:
    - ⚠️ **Conteggio per tipologia** (`2774196`): il ripiego sull'allocazione senza tipologia diceva «come fa il server», ma `validate_booking_block_allocation` scala qualunque allocazione con lo stesso `session_type`, anche di un'altra tipologia e anche quando quella esatta è solo esaurita (`20260827143053_…sql:41-51`). Tolto: ogni sessione conta nella riga della sua tipologia, e le incoerenze dicono il resto (test con due tipologie PT).
    - **Commenti smentiti** (`2774196`, `616daf7`): il disponibile degli extra non è «quello che il server scala» (il server ignora la scadenza e scala per primo l'extra che scade prima, `:84-88`); «in nessun'altra funzione» vale per la regola per prenotare, quella per spostare sta in `getMoveWindow`; `booking-slots.ts:16-17` diceva che le 24 ore coincidono con un trigger del server, che invece guarda l'ora vecchia della sessione (`20260607191854_…sql:15`), e l'inserimento non ha preavviso.
    - **Date dei testi dalle finestre** (`616daf7`): in d) e f) la data del blocco dopo è l'inizio della sua finestra (coi blocchi accavallati la frase diceva «Fino a 11 ottobre… da 5 ottobre»); a) esplicito sul percorso concluso; `moveRulesText` legge la finestra di `getMoveWindow`.
    - **Motivo «chiuso»** (`f198cbb`): un giorno con una fascia più corta della sessione, o con eccezioni che coprono tutte le fasce, risultava «pieno».
    - **Il server rifiuta spostamenti che `getMoveWindow` permette**: confermato, e scritto nei commenti e al §3. È un difetto del server (§6), la regola di `getMoveWindow` resta quella del prompt.
    - **Il trigger `zz_trg_revalidate_client_reschedule`** (stesso giorno della settimana del blocco): quasi certamente non attivo, da confermare sul backup (§6).
    - Test aggiunti per le lacune: blocchi accavallati, cliente libero con un blocco rimasto, priorità chiuso/crediti e preavviso/pieno, blocco di riferimento coperto solo da extra, percorso concluso con finestre.
    - Dopo le correzioni ho rifatto tutti i controlli e tutte le prove rosse sul codice finale (§4, §5).

28/09/2026. Prompt «NC Calendar · Redesign lato cliente · Passata 00 · Fondamenta» (Cowork, contro `aa1ebfe` più la correzione dell'abbonato). Agenti: 1 (il revisore in sola lettura del passo 10). Workflow: 0: la parola «Ultracode» nel prompt ha fatto scattare l'invito del sistema ai workflow, ma il prompt dice «Ultracode: non serve».

## 1 · Rami e commit

- **`redesign/cliente-mobile`** = `14c09e9`, uguale a `origin/main` (merge della PR 77), pubblicato senza commit sopra; alla chiusura `origin/redesign/cliente-mobile` e `origin/main` sono ancora `14c09e9`.
- **`redesign/cliente-00-fondamenta`**, da `redesign/cliente-mobile`. Commit, in ordine:
  1. `0d019b5` Pacchetto del lato cliente fuori da lint e prettier;
  2. `085f47c` Aggiunge il pacchetto di handoff del lato cliente mobile;
  3. `f267caa` Regole del cliente: 24 ore e 14 giorni, in un posto solo;
  4. `ca29384` Tempo relativo del cliente: Oggi, Domani, tra 25 min;
  5. `72bc825` Orari del cliente: un generatore solo, sopra generateSlots;
  6. `cee5e24` Crediti del cliente: una definizione sola, e il blocco dopo coi suoi crediti;
  7. `f97ef32` Stati della sessione del cliente, in un posto solo;
  8. `ccb0f6c` Contatti del coach: WhatsApp, telefono ed email;
  9. `fde4583` Token del lato cliente;
  10. `2774196` Crediti del cliente: ogni sessione nella sua tipologia, e i limiti del server detti;
  11. `616daf7` Testi del cliente dalle finestre, e i commenti sul server corretti;
  12. `f198cbb` Orari del cliente: chiuso quando la giornata non ha orari possibili;
  13. `f6d75ab` Spunta la passata 00 in PIANO.md;
  14. Riscrive docs/ULTIMO-RITORNO.md per la passata 00 del lato cliente (il commit finale).
- **PR:** [wolfwood370-cell/nc-calendar#78](https://github.com/wolfwood370-cell/nc-calendar/pull/78) da `redesign/cliente-00-fondamenta` verso `redesign/cliente-mobile`, aperta e **non** unita. Descrizione: questo file.

## 2 · Manifesto

- **NUOVI:**
  - `src/lib/client-slots.ts` e `client-slots.test.ts` (24 test);
  - `src/lib/client-credits.ts` e `client-credits.test.ts` (37 test);
  - `src/lib/client-session-status.ts` e `client-session-status.test.ts` (9 test);
  - `src/lib/coach-contacts.ts` e `coach-contacts.test.ts` (5 test);
  - `design_handoff_cliente_mobile/`: i 60 file del pacchetto, come Nicolò li ha messi.
- **MODIFICATI:**
  - `eslint.config.js` (+1) e `.prettierignore` (+1): il pacchetto fuori da lint e prettier;
  - `src/lib/booking-rules.ts`: le sette costanti, il commento su cosa il server non fa ancora, `bookingRulesNote` nuova, i testi di Prenota e di Sposta, il tipo `CreditWindow`; non importa più `reschedule-slots.ts`. `booking-rules.test.ts`: 28 test (erano 4);
  - `src/lib/booking-slots.ts`: il default del preavviso da `CLIENT_MIN_NOTICE_HOURS`, `now` come ultimo parametro facoltativo di `generateSlots`, e il commento delle 24 ore corretto;
  - `src/lib/reschedule-slots.ts`: `RESCHEDULE_WINDOW_DAYS = CLIENT_RESCHEDULE_WINDOW_DAYS` (sempre 14);
  - `src/lib/session-time.ts`: `formatDayRel`, `formatUntil`, e la locale da `date-fns/locale/it`; `session-time.test.ts` +7 test;
  - `src/lib/renewal.ts`: solo `export` su `comesAfter` (`:91`);
  - `src/styles.css`: i dieci token nuovi (`:106-119`, commento compreso), nessuna riga esistente cambiata; `src/lib/contrast.test.ts`: le due coppie nuove;
  - `design_handoff_cliente_mobile/PIANO.md`: la riga 00 spuntata, nient'altro;
  - `docs/ULTIMO-RITORNO.md`: questo file.
- **NEL PERIMETRO MA NON TOCCATI:** nessuna pagina e nessun componente (C4). In particolare `src/components/client-reschedule-sheet.tsx` e `reschedule-drawer.tsx` (li toglie la 04), `availability-preview-card.tsx` (legge già i valori), `availability-mobile.tsx`, `src/routes/client.book.tsx` e `client.index.tsx`; `src/lib/credits.ts`, `current-block.ts`, `attendance.ts`, `client-profile.ts` (`blockChip`), `client-search.ts` (`clientPlanLabel`), `calendar-events.ts` (`whatsappUrl`), `session-type-icon.ts`, `mock-data.ts`, `queries.ts`, `src/hooks/use-now.ts`, `useSetSessionFeedback`, `vitest.config.ts`; niente in `supabase/`.

## 3 · Gli helper

Firme come stanno nel codice; `now` è sempre l'ultimo parametro o un campo dell'input, mai l'orologio.

- **`src/lib/renewal.ts`** (c'erano, la 00 li usa):
  - `clientReferenceBlock<T extends RenewalBlock>(blocks: readonly T[], now: Date = new Date()): T | null` — il blocco di riferimento, per data, per tutti e due i percorsi. **Sempre con `now`**: il default è l'orologio.
  - `comesAfter(b: BlockDates, ref: BlockDates): boolean` — ora esportata. `renewsAutomatically(client: RenewalClient)`, `isValidBlock(b)`.
- **`src/lib/booking-rules.ts`**:
  - `CLIENT_MIN_NOTICE_HOURS` 24 · `CLIENT_BOOKING_HORIZON_DAYS` 14 · `CLIENT_RESCHEDULE_CUTOFF_HOURS` 24 · `CLIENT_RESCHEDULE_WINDOW_DAYS` = `CLIENT_BOOKING_HORIZON_DAYS` · `CLIENT_FREE_CANCEL_HOURS` 24 · `CLIENT_CONFIRM_WINDOW_HOURS` 48 · `CLIENT_FEEDBACK_DAYS` 14;
  - `noticeLabel(hours)`, `horizonLabel(days)`, `bookingRulesNote(cutoffHours = CLIENT_RESCHEDULE_CUTOFF_HOURS, freeCancelHours = CLIENT_FREE_CANCEL_HOURS): string`;
  - `bookingBaseText(): string` — «Si prenota da 24 ore a 14 giorni prima.»;
  - `bookingRulesText(input: BookingTextInput): string` — `{ now, pathType, renews, reference: RulesBlock | null, next: RulesBlock | null, windows: readonly CreditWindow[] }`, con `RulesBlock = { id, number, start_date, end_date }` (numero da `blockNumber`, `windows` da `getCreditWindows`);
  - `moveRulesText(input: MoveTextInput): string` — `{ now, window: CreditWindow | null, coachName?: string | null }`, con `window` da `getMoveWindow`;
  - tipo `CreditWindow = { from, until, source: "block" | "extra", blockId, blockNumber }` (date `YYYY-MM-DD`, estremi inclusi).
- **`src/lib/booking-slots.ts`**: `generateSlots(daysAhead, blockedRanges, availability, exceptions, candidateMinutes, rangeStart?, rangeEnd?, optimization?, minNoticeHours = CLIENT_MIN_NOTICE_HOURS, now = new Date()): Slot[]`.
- **`src/lib/session-time.ts`**: `formatDayRel(d: Date, now: Date): string` · `formatUntil(start: Date, now: Date): string | null`.
- **`src/lib/client-slots.ts`**: `getClientSlotDays(input: ClientSlotInput): ClientSlotDays`.
  - Input `{ now, durationMin, bufferMin, availability, exceptions, busy: readonly BlockedRange[], windows: readonly CreditWindow[], exclude?: Date | null, optimization: boolean }`.
  - Output `{ days, until: string | null, limitedByCredits }`; ogni giorno `{ date, isoDate, slots, reason: "chiuso" | "crediti" | "preavviso" | "pieno" | null, recommendedReason, window }`; ogni orario `{ iso, time, end, part, recommended }`.
  - Anche `dayPart(d)`, `RECOMMENDED_AFTER_SESSIONS`, `RECOMMENDED_COMPACT`.
- **`src/lib/client-credits.ts`**:
  - `getNextBlock<T extends RenewalBlock>(blocks: readonly T[], reference: RenewalBlock | null): T | null`;
  - `getClientPools(input: ClientPoolsInput): ClientPools` — input `{ now, pathType, block: ClientBlock | null, bookings: readonly PoolBooking[], extras?: readonly PoolExtra[], eventTypes: readonly PoolEventType[] }`, output `{ rows: ClientPool[], mismatches: PoolMismatch[], concluded }`;
  - riga `ClientPool`: `key, eventTypeId, sessionType, name, color, durationMin, bufferMin, location, address, bookable, message, total, done, booked, lost, extraUsed, blockAvail, extraAvail, avail, extraUntil`;
  - `blockNumber(blocks, block): number | null` — la numerazione di `blockChip`;
  - `getCreditWindows(input: CreditWindowsInput): CreditWindow[]` — `{ now, pathType, blocks, reference, referencePools, next, nextPools, key }`;
  - `getMoveWindow(session: { block_id }, blocks, now): CreditWindow | null`;
  - `getClientBlockInfo<T extends RenewalBlock>(client: RenewalClient, blocks: readonly T[], now: Date): ClientBlockInfo<T>` — `{ plan, block, subtitle, number, reference }`.
- **`src/lib/client-session-status.ts`**: `getClientSessionStatus(b: StatusBooking, now: Date): ClientSessionStatus` (`{ key, label, line, icon }`) · `CLIENT_STATUS_TONE: Record<key, { bg, fg }>` · `canMove(b, now)` · `isFreeCancel(b, now)` · `freeUntilLabel(b)` · `canRate(b, now)`.
- **`src/lib/coach-contacts.ts`**: `getCoachContacts({ name, phone, email }): { firstName, whatsapp, tel, mail }`.

**Vincoli per chi li usa (passate 01-09):**

- `now` sempre esplicito, da `useNow()`; anche a `clientReferenceBlock`, `blockTiming`, `resolveCurrentBlock`, che senza `now` leggono l'orologio.
- **Le annullate tardi con `deleted_at` vanno passate a `getClientPools`.** `cancel_booking` scrive `deleted_at` anche su di loro, e `useClientBookings` scarta le righe con `deleted_at` (`src/lib/queries.ts:255`): una pagina che legge come oggi perde ogni annullamento tardivo e segna un'incoerenza. Da sistemare nella lettura delle passate 02 e 05.
- Gli extra si passano **solo** col blocco di riferimento (`extras` di `getClientPools`), mai col blocco dopo.
- Ogni giorno di `getClientSlotDays` porta la sua finestra: con `source: "block"` si prenota col `block_id` di `window.blockId`, con `"extra"` coi crediti extra (`block_id` nullo).
- `busy` sono gli intervalli di `get_coach_busy` come `[scheduled_at, scheduled_at + duration + buffer]`; per Sposta `exclude` è l'inizio della sessione che si sposta e `windows` è `[getMoveWindow(...)]`, e la stessa finestra va a `moveRulesText`.
- `optimization` è il valore di `useCoachOptimizationEnabled`: per il cliente oggi sempre `true` (§6).
- **`freeUntilLabel`** dà il minuto da cui annullare costa il credito: la frase dice «prima di lunedì 28 settembre alle 10:00», non «fino a» (passata 04).
- **La prenotazione del blocco dopo (passata 02) non deve arrivare su `main` prima della correzione del server del 02/10:** finché `validate_booking_block_allocation` sceglie il credito fra tutti i blocchi del cliente, una prenotazione sul blocco dopo può scalare il blocco in corso. È un'altra cosa rispetto alla correzione dell'abbonato, che è solo nell'app.
- **Sposta (passata 04) incontra lo stesso difetto:** `reschedule_booking` riprende il credito fra tutti i blocchi del cliente, `valid_until` più vicino per primo (`20260827143053_…sql:214-231`), e riscrive `block_id` (`:253-255`), che `validate_client_booking_update` vieta al cliente (`20260607191854_…sql:20`). Con crediti della tipologia in un blocco precedente (nel backup del 26/09, 10 clienti attivi con 182 crediti avanzati in blocchi finiti) lo spostamento fallisce, oggi come col foglio attuale. E una sessione senza `block_id` e senza un extra impegnato il server non la sposta (`:257-285`). `getMoveWindow` dice la regola voluta; il messaggio d'errore del server la 04 lo deve mostrare.
- Finché il server ignora la scadenza degli extra, un extra scaduto con crediti rimasti viene scalato per primo (`:84-88`) e `extraAvail` non cala: la scelta è della 06.
- Le incoerenze (`mismatches`) le manda a Sentry la prima pagina che usa i crediti (02): gli helper non chiamano Sentry. Con due tipologie sullo stesso `session_type` il server può scalare quella sbagliata, e le incoerenze lo mostrano.
- I colori degli stati sono classi dei token (`CLIENT_STATUS_TONE`), da usare così come stanno perché Tailwind le trovi.

## 4 · Acceptance

Base = `origin/redesign/cliente-mobile` (`14c09e9`), misurata al passo 0 o leggendo i file da lì; dopo = il ramo a `f6d75ab`, con tutte le correzioni.

| Controllo                                             | Base                                         | Dopo                                                                                                    |
| ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **C0** file nuovi                                     | `MANCA` ×4                                   | nessuna riga                                                                                            |
| **C1** regole                                         | 4 righe: 0, 90, 24, `RESCHEDULE_WINDOW_DAYS` | 7 righe: 24, 14, 24, `CLIENT_BOOKING_HORIZON_DAYS`, 24, 48, 14                                          |
| **C2** `booking-rules` non importa `reschedule-slots` | `1`                                          | `0`                                                                                                     |
| **C3** chi importa `booking-rules`                    | `0` e `0`; `11:… = 14;`                      | `1` e `1`; `12:export const RESCHEDULE_WINDOW_DAYS = CLIENT_RESCHEDULE_WINDOW_DAYS;`                    |
| **C4** pagine e componenti                            | —                                            | vuoto                                                                                                   |
| **C5** helper puri                                    | nessuna riga; nessuna riga; `0`              | nessuna riga; nessuna riga; `0`                                                                         |
| **C6** token                                          | 0 righe                                      | 10 righe, i valori del §4.7                                                                             |
| **C7** righe di stile tolte                           | —                                            | `0`                                                                                                     |
| **C8** guardie                                        | `0` e `0`                                    | `eslint.config.js:1`, `.prettierignore:1`                                                               |
| **C9** lint col pacchetto                             | 678 errori, 22 avvisi                        | 0 errori, 22 avvisi (su 317 file; gli stessi 22 della base, confrontati per file, regola e messaggio)   |
| **C10** pacchetto                                     | `0`                                          | `60`, stato vuoto                                                                                       |
| **C11** locale                                        | `1` e `0`                                    | `0` e `1`; nessuno dei 4 file nuovi usa il barile (e gli import del barile in `src` passano da 23 a 22) |
| **C12** WhatsApp                                      | —                                            | `4`; nessuna riga                                                                                       |
| **C13** suite                                         | 628 test in 43 file                          | **736 test in 47 file**, tutti verdi; con `TZ=UTC` i 5 file: 111 test verdi                             |
| **C14** PIANO                                         | non tracciato                                | la riga 00 finisce con `[x] \|`                                                                         |
| **C15** `comesAfter`                                  | `0`                                          | `1`; `renewal.ts \| 2 +-`, `1 insertion(+), 1 deletion(-)`                                              |

Typecheck 0 errori · build riuscita (`✓ built in 16.66s`, `4.24s`, `10.62s`).

Output incollato, sul ramo dopo il commit del PIANO (le righe «fine …» segnano dove un controllo atteso vuoto non ha stampato niente):

```text
### C0
(fine C0: nessuna riga sopra)
### C1
export const CLIENT_MIN_NOTICE_HOURS = 24;
export const CLIENT_BOOKING_HORIZON_DAYS = 14;
export const CLIENT_RESCHEDULE_CUTOFF_HOURS = 24;
export const CLIENT_RESCHEDULE_WINDOW_DAYS = CLIENT_BOOKING_HORIZON_DAYS;
export const CLIENT_FREE_CANCEL_HOURS = 24;
export const CLIENT_CONFIRM_WINDOW_HOURS = 48;
export const CLIENT_FEEDBACK_DAYS = 14;
### C2
0
### C3
src/lib/reschedule-slots.ts:1
src/lib/booking-slots.ts:1
12:export const RESCHEDULE_WINDOW_DAYS = CLIENT_RESCHEDULE_WINDOW_DAYS;
### C4
(fine C4: nessuna riga sopra)
### C5
(fine C5 prima parte: nessuna riga sopra)
(fine C5 seconda parte: nessuna riga sopra)
0
### C6
  --color-warning-ink: #9a3412;
  --color-credit-lost: #f59e0b;
  --color-rating-soft: #fef3c7;
  --color-rating-text: #92400e;
  --color-rating-star: #d97706;
  --color-rating-star-line: #b45309;
  --color-toast: #191c1f;
  --color-toast-ok: #6ee7b7;
  --color-toast-warn: #fdba74;
  --color-scrim: rgba(0, 20, 35, 0.42);
### C7
0
### C8
eslint.config.js:1
.prettierignore:1
### C9
✖ 22 problems (0 errors, 22 warnings)
### C10
60
(fine C10: nessuna riga sopra)
### C11
0
1
(fine C11 terza parte: nessun file sopra)
### C12
4
(fine C12: nessuna riga sopra)
### C13
 Test Files  47 passed (47)
      Tests  736 passed (736)
TZ=UTC:
 Test Files  5 passed (5)
      Tests  111 passed (111)
### C14
14:| 00 | [Fondamenta: regole, helper, token](passes/00-fondamenta.md) | O1, O3, B2, H1, H5, H6, T1, T3, T5, V6, V15 | — | sì | [x] |
### C15
1
 src/lib/renewal.ts | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```

## 5 · Le prove rosse

Rifatte tutte sul codice finale (dopo il passo 10) con uno script fuori dal repo: muta il file, esegue il file di test, rimette il file salvato, controlla che sia uguale byte per byte e che `git diff` sia vuoto, riesegue. Le prime corse, prima delle correzioni, avevano dato lo stesso esito sui test giusti. I test hanno casi con `now` nel 2031 in `booking-rules`, `session-time`, `client-slots`, `client-credits` e `client-session-status`.

- **R1** · `CLIENT_MIN_NOTICE_HOURS = 0` → `client-slots.test.ts` `Tests  4 failed | 20 passed (24)`: «un orario a now + 23:59 è escluso, a now + 24:00 è incluso», «oggi è «preavviso»», «domani è «preavviso» se sono le 18:00…», «chiuso viene prima di crediti, preavviso prima di pieno». Rimesso: `24 passed (24)`.
- **R2** · `CLIENT_BOOKING_HORIZON_DAYS = 90` → `4 failed | 20 passed (24)`: «l'ultimo giorno è oggi + 14, con i suoi orari», «…dal 20/10 si arriva al 03/11», «in un altro anno…», «l'ultima finestra finisce prima di oggi + 14…». Rimesso: `24 passed (24)`.
- **R3** · `rangeEnd` a mezzanotte (`parseISO(until)` invece di `endOfIsoDate(until)`) → `5 failed | 19 passed (24)`, fra cui «l'ultimo giorno di una finestra ha i suoi orari». Rimesso: `24 passed (24)`.
- **R4** · sessioni per data invece che per `block_id` → `client-credits.test.ts` `2 failed | 35 passed (37)`: «una sessione collegata senza credito (block_id nullo) nelle date del blocco non entra», «una sessione di un altro blocco non entra…». Rimesso: `37 passed (37)`.
- **R5** · `late_cancelled` tolto dai persi → `2 failed | 35 passed (37)`: «annullamento tardivo e assenza persi…», «un'annullata tardi con deleted_at è persa lo stesso…». Rimesso: `37 passed (37)`.
- **R6** · `CLIENT_CONFIRM_WINDOW_HOURS = 49` → `client-session-status.test.ts` `1 failed | 8 passed (9)`, sull'asserzione «48:01 → booked»: `expected { key: 'toconfirm', … } to match object { key: 'booked', … }`. Rimesso: `9 passed (9)`.
- **R7** · tolto `design_handoff_cliente_mobile` da `eslint.config.js` **e** da `.prettierignore` → `✖ 700 problems (678 errors, 22 warnings)`, exit 1. Rimesse: `✖ 22 problems (0 errors, 22 warnings)`, exit 0.
- **R8** · `getCreditWindows` senza il blocco dopo → `6 failed | 31 passed (37)`, primo «due blocchi contigui con crediti: il blocco dopo si prenota coi suoi». Rimesso: `37 passed (37)`.
- **R9** · `getMoveWindow` che apre anche il blocco dopo → `3 failed | 34 passed (37)`, primo «l'ultimo credito della tipologia è già impegnato dalla sessione: la finestra c'è, e si ferma al suo blocco» (`- "until": "2026-10-11"`, `+ "until": "2026-11-08"`). Rimesso: `37 passed (37)`.
- **R10** · in `getClientBlockInfo` il riferimento = l'ultimo blocco per `sequence_order`, come l'RPC → `3 failed | 34 passed (37)`, primo «abbonato coi mesi dopo già creati: numero e settimana del mese in corso, non dell'ultimo creato» (`- "block": "Blocco 1"`, `+ "block": "Blocco 3"`). Rimesso: `37 passed (37)`.

## 6 · Non fatto

Rinviato al 02/10/2026 insieme a S1 (decisione di Nicolò del 28/09; su Lovable un file in `supabase/migrations/` dal repo non viene applicato). Nessuna migrazione scritta né proposta:

- O1 · la regola 24 ore / 14 giorni sul server, in `enforce_client_booking_rules` e `reschedule_booking` quando chi scrive è il cliente.
- O3 · la conferma automatica della presenza entro 48 ore, all'inserimento del cliente e allo spostamento.
- H9 · la nota della valutazione (colonna nuova di `session_feedback`); `useSetSessionFeedback` non toccato.
- `get_my_coach` · nome, telefono ed email del coach di chi chiama; senza, niente `useMyCoach`.
- Il server che prende il credito dal blocco che contiene la data della sessione, mai da un blocco finito né da quello sbagliato: `validate_booking_block_allocation` all'inserimento, e (trovato in questa passata) `reschedule_booking` allo spostamento, che oggi fa fallire lo spostamento quando un blocco precedente ha crediti della tipologia (§3).
- La lettura dell'ottimizzazione per il cliente: `integration_settings` ha policy solo per coach e admin, e il cliente legge sempre il default `true` (`useCoachOptimizationEnabled`, `src/lib/queries.ts:465-481`).

Da confermare sul backup (non si chiude dal repo): il trigger `zz_trg_revalidate_client_reschedule`, che limiterebbe lo spostamento del cliente alla stessa settimana del blocco. Lo crea `20260606120000_audit_round2_db_fixes.sql:411-417`, che nell'ordine dei file viene dopo il DROP di `20260606071612_…sql:208-209`. Ma quel file è la sorgente scritta nel repo (`3f2deb9`, 05/06 22:15 UTC) che Lovable ha applicato come sua copia `20260605222541_…` (`26c84e9`, 22:25 UTC: stesse sei funzioni, corpo uguale salvo commenti e a capo), e il DROP di Lovable è arrivato dopo (`11d1266`, 06/06 07:16 UTC). Quindi sul database il trigger non dovrebbe esserci; e anche se ci fosse salterebbe ogni sessione con `google_event_id` (`:344`), cioè, secondo il prompt, tutte le 275 sessioni dei clienti nel backup.

Altro:

- **Contrasto di `credit-lost`:** 2,15:1 sul bianco e 1,85:1 sulla pista `surface-container`, sotto il 3:1 degli elementi grafici. È il valore del README; la barra delle «perse» la disegna la 05, col numero scritto accanto (lo dice anche il commento del token).
- **Validità dei Booster** (§4.3 punto 8): gli helper applicano quella del brief, «vale se ha ancora crediti e `expires_at` non è passato», e la finestra di un extra si ferma alla sua scadenza. Il codice di oggi dice che gli extra non scadono (`src/lib/queries.ts:329`, `src/lib/event-type-usage.ts:14`); quelli del coach scadono nel 2100 (`EXTRA_EXPIRES_AT`, `src/lib/package-actions.ts:41`); il checkout dei Booster scrive una scadenza vera (il `valid_until` di un'allocazione, più 30 giorni se ne mancano meno di 7: `supabase/functions/booster-checkout/index.ts:205-212`), e il server non la guarda e scala per primo l'extra che scade prima, anche scaduto (`validate_booking_extra_credits`, `20260827143053_…sql:84-88`). La scelta è della passata 06.
- **Nessuna pagina e nessun componente** (01-08): quindi nemmeno `useMyCoach`, la chiamata a Sentry delle incoerenze, la lettura delle annullate tardi con `deleted_at`, il foglio Sposta, la Home, l'aggiornamento con `useNow`.
- Dal brief: `useMyCoach()` (manca il dato); l'esclusione della sessione che si sposta «per id» (`get_coach_busy` non lo restituisce: si esclude per ora d'inizio); il campo `icon` delle righe dei crediti (la pagina usa `iconForType(name)`).
- `vitest.config.ts` non fissa il fuso: l'invarianza Roma/UTC dei test nuovi la prova la corsa a mano con `TZ=UTC` di C13, non la suite da sola.
- Gli altri 22 import del barile `date-fns/locale` non sono toccati (fuori perimetro, revisione il 31/10/2026).

## 7 · Divergenze

Dove il prompt, il brief o il prototipo dicevano una cosa e il repo un'altra; vince la misura.

**Base e ancore**

- Il clone era su `main` @ `3d29634`, non su `redesign/coach-10-verifica-finale` @ `1afeb87`; `origin/main` era già `14c09e9` prima del fetch, non `d51eae6`.
- Base: 628 test in 43 file, verdi alla prima corsa coi worker predefiniti (nessun file caduto in import); lint come nel prompt.
- `validate_booking_block_allocation`: la scelta del credito è la `SELECT` di `20260827143053_…sql:35-53` (il prompt diceva `:36-52`); la riscrittura di `block_id` è `:59-61`, come detto.
- Con la correzione dell'abbonato le righe di Prenota e Home sono salite: in `client.book.tsx` le costanti si usano a `:160-161` (non `:171-172`), `generateSlots` è a `:241-251` (non `:252-262`), la lettura del profilo del coach a `:124-139` (non `:135-150`); in `client.index.tsx` il conteggio per data è a `:168-173` e `:234-240` (non `:240-252`), il numero del blocco da `sequence_order` a `:153` e `:309` (non `:314`).
- `client-reschedule-sheet.tsx`: le due copie note sono a `:71-72`, e l'esclusione che confronta anche la fine senza margine a `:132-137`, come detto. Non toccato.

**Scelte sul testo e sulle regole**

- «Blocco 4» contro «Mese 4»: per l'abbonamento `getClientBlockInfo` scrive «Blocco 4» come il brief, il coach «Mese 4» (`blockChip`, `src/lib/client-profile.ts:233`). Lo stesso numero, parola diversa.
- Eventi importati senza titolo: `canRate` riconosce una sessione creata nell'app dal titolo nullo; l'importazione scrive `title: data.summary ?? null` (`src/lib/gcal.functions.ts:896`), quindi un evento senza titolo su Google risulta creato nell'app e si può valutare (un titolo vuoto `""` invece no). Raro, accettato come da prompt; il revisore l'ha segnalato di nuovo.
- `isFreeCancel` è falso a 24:00 esatte: il prototipo usa `>=` (`nc-client.js:154`), `cancel_booking` segna tardivo con `now() >= scheduled_at - interval '24 hours'` (`20260606120000_…sql:174`). `canMove` invece è vero a 24:00 esatte (`validate_client_booking_update`, `20260607191854_…sql:15`).
- Motivi dei giorni vuoti: il prototipo dà `preavviso` solo al giorno che finisce entro `now + 24 h` (`nc-client.js:203`); qui tutti partono dagli orari possibili del giorno. `crediti` è nuovo (giorni senza finestra). `chiuso` vale anche per una fascia più corta della sessione e per eccezioni parziali che coprono tutte le fasce (il prompt diceva solo «nessuna fascia, o eccezione di tutto il giorno»; correzione della revisione).
- `recommendedReason` solo se il giorno ha almeno un orario consigliato (il prototipo lo metteva a ogni giorno con orari, `nc-client.js:201`).
- **Testi di Prenota** (`bookingRulesText`, `src/lib/booking-rules.ts:160`): quali giorni si prenotano e da quando lo leggono dalle finestre di `getCreditWindows`, e una frase che le finestre smentirebbero non si scrive. Coi dati normali le frasi sono quelle del prompt, parola per parola (i test le confrontano intere). Cambiano tre casi che il prompt non prevedeva: in g), se un extra copre i giorni del blocco dopo, niente frase (direbbe «nel blocco 4 non ce ne sono» mentre i giorni del blocco 4 si prenotano col Booster); in f)-k), se i crediti della tipologia finiscono prima della fine del blocco (un extra che scade prima), niente frase; in c), se il blocco di riferimento non ha crediti della tipologia, numero e data sono quelli della prima finestra. In d) e f) la data è l'inizio della finestra del blocco dopo, che coincide con la sua data d'inizio salvo blocchi accavallati. Il blocco dopo oltre i 14 giorni col riferimento esaurito cade in a) (nessuna finestra), non in h).
- Gli extra coprono i giorni del blocco dopo solo se il blocco dopo si qualifica come per i suoi crediti (esiste e inizia entro oggi + 14); il prompt lo diceva per la finestra di blocco, non per quella degli extra.
- Testo di Sposta: legge la finestra di `getMoveWindow` invece del blocco (il prompt diceva «per la sessione che si sposta e il suo blocco»: la finestra viene da lì). Un blocco più corto di 14 giorni e non ancora iniziato avrebbe anche il limite della fine, che la frase non dice (non esiste nei dati: i blocchi sono di 4 settimane o di un mese).
- `getMoveWindow` restituisce `null` se il blocco della sessione non c'è fra i blocchi o è già finito (il prompt non lo diceva).
- Righe dei crediti: in più `extraUntil` e `sessionType`; a percorso concluso anche `blockAvail` ed `extraAvail` valgono 0, e `total = done + booked + lost + extraUsed + avail` non vale più. Il cliente libero ignora un blocco rimasto da un vecchio percorso.
- `getClientBlockInfo` riceve un `RenewalClient` (con `status`) perché `renewsAutomatically` vuole quel tipo, e `renewal.ts` poteva cambiare solo per `comesAfter`.
- `getCoachContacts`: `tel` è `null` anche col numero troppo corto per WhatsApp. `formatUntil` restituisce `null` per «niente».
- `.prettierignore` non ha commenti: la riga nuova sta sotto `design_handoff_coach_redesign`, e il commento condiviso c'è solo in `eslint.config.js:17`.
- Il messaggio della passata 00 in `PIANO.md` («scrivimi le tre migrazioni… poi aspetta») non è stato seguito, come chiesto dal prompt.

## 8 · Resta a Nicolò

- Il merge della PR in `redesign/cliente-mobile`, dopo la verifica di Cowork.
- Da girare a Cowork: il controllo sul backup del trigger `zz_trg_revalidate_client_reschedule` (§6), e la correzione di `reschedule_booking` da mettere nel lavoro del 02/10 (§3 e §6).
