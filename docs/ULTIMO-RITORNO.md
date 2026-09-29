# Ultimo ritorno · Lato cliente · Passata 03 · Sessioni

## 0 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **La base e il ramo** (§2). Nessun commit.
   - `git fetch origin` (`28c4b93..ef2461f redesign/cliente-mobile`); `git merge-base --is-ancestor 2690385 origin/redesign/cliente-mobile && echo 02-presente` → `02-presente`.
   - `origin/redesign/cliente-mobile` = `ef2461f` (merge della PR 80). `redesign/cliente-03-sessioni` creato con `git switch --no-track -c redesign/cliente-03-sessioni origin/redesign/cliente-mobile`.
   - ⚠️ Il clone non era su `redesign/cliente-02-prenota` @ `2690385` ma su `main` @ `3d29634`, pulito, con `core.autocrlf=false` (come nella 01 e nella 02). Il `redesign/cliente-mobile` locale è fermo a `14c09e9`: non usato.
   - `git diff --stat b780645 origin/redesign/cliente-mobile -- package.json bun.lock` → vuoto. Nessuna installazione.
   - Base misurata su `ef2461f`: typecheck 0 errori · lint 0 errori e 20 avvisi · test coi worker predefiniti **817 in 52 file**, tutti verdi al primo colpo · build riuscita.
   - Sonde del fuso, da PowerShell: `UTC` → `0`, `America/Los_Angeles` → `420`, senza `TZ` → `-120`.
   - Memoria all'avvio: 1,1 GB fisici liberi, 29 GB impegnabili.
   - Controlli C0-C12 sulla base: gli stessi numeri «oggi» del prompt (§4).
1. ☑ **Lo stato dei crediti in un hook** (§4.3). `1b4d450`. `src/hooks/use-client-book-state.ts`, montato da uno script che copia le righe di `client.book.tsx` per numero (così le righe spostate sono uguali byte per byte), e `client.book.tsx` a +17 −149. Typecheck 0, lint 0 errori e 20 avvisi, 817 test verdi. C4 e C5 al §4.
   - ⚠️ Nel primo verso di C5 esce una riga in più delle quattro di Cowork, `onRetry={retryAll}`: la pagina chiama `retry` col nome del hook invece di ribattezzarlo. Le righe tolte sono 149 e non 148: cinque righe vuote se ne vanno coi blocchi, una in più dello spostamento di Cowork; nessuna riga di codice in più.
2. ☑ **Le regole di Sessioni** (§4.1). `8f1ae7b`. `src/lib/client-sessions.ts` e `client-sessions.test.ts` (29 test), verdi a Roma, in UTC e a Los Angeles. R1-R19 rosse e poi verdi (§5). Typecheck 0, lint a 20.
   - In più del prompt: `ratingsById(feedback)` (le valutazioni lette come `ReadonlyMap`, `null` finché non arrivano), così la pagina non costruisce la mappa da sé; il tipo `SessionEventType`; un test che passa `upcomingEmpty` sullo stato vero di `getBookState` coi dati di Giulia della 02 («Hai 4 crediti…», e «Hai 6 crediti…» senza le due Sessioni PT in programma).
3. ☑ **La riga** (§4.2). `61e1b65`. `src/components/client-session-row.tsx` e `client-session-row.test.ts` (5 test statici). R20 rossa e poi verde. C8 sulla riga: `0` e `0`.
4. ☑ **La pagina** (§4.4). `8c1a3df`. `src/routes/client.sessions.tsx` riscritta. **851 test in 54 file** (817 + 29 + 5). C1-C3, C8, C10-C12 al §4. Al cambio di scheda la pagina torna in cima (il `resetScroll` predefinito di TanStack): l'altro elenco comincia da lì, e l'intestazione con le schede è attaccata in alto.
5. ☑ **Il browser** (§8). B1-B14 fatti col banco della 02 copiato e adattato, fuori dal repo: **78 prove su 78** di `giro-sessioni.mjs` sul codice finale, **82 su 82** di `giro-prenota.mjs` della 02 rieseguito sul ramo, e il confronto base/ramo del B10 con **0 differenze** (§6). Nessun commit.
6. ☑ **Chiusura** (§10). C0-C12 sul ramo finito (§4); `839ee0c` «Spunta la passata 03 in PIANO.md»; push di `redesign/cliente-03-sessioni`; PR **[wolfwood370-cell/nc-calendar#81](https://github.com/wolfwood370-cell/nc-calendar/pull/81)** verso `redesign/cliente-mobile`, aperta e non unita; «Riscrive docs/ULTIMO-RITORNO.md per la passata 03 del lato cliente», l'ultimo commit (il suo hash sta nella risposta finale: un file non contiene l'hash del commit che lo scrive).
7. ☑ **Passo aggiunto: le correzioni della revisione.** Un revisore in sola lettura sul diff (circa 15 minuti, in background mentre preparavo il banco) ha dato 7 punti, senza difetti gravi: lo spostamento del hook l'ha confrontato riga per riga e l'ha trovato fedele. `4ecd48c` «Sessioni: le correzioni della revisione» corregge i due difetti veri, entrambi dovuti a TanStack Query v5, che rileggendo una lettura senza dati la rimette in attesa e ne toglie l'errore (`node_modules/@tanstack/query-core/build/modern/query.js:400-409`, `fetchState`, versione 5.100.1):
   - **«Riprova» toglieva la card** (certo, riprodotto nel browser: fasi card → scheletro → card, focus finito sul `body`): il pulsante col focus spariva e `retrying` non si vedeva mai. Ora la card resta mentre le sessioni si rileggono, col pulsante disattivato (`errorUpdateCount` ricorda che la lettura era fallita, `client.sessions.tsx:93-96`), e dopo un «Riprova» fallito il focus torna sul titolo della card (`:134-148`). Dopo: fasi card → card disattivata → card, focus su «Sessioni non caricate».
   - **Con profilo o tipologie in errore, un ritorno sulla finestra nascondeva l'elenco** (probabile, riprodotto): durante la rilettura `profileArrived` o `eventTypesQ.isError` tornavano falsi e l'elenco spariva dietro lo scheletro. Ora le tipologie contano come arrivate anche con `errorUpdateCount > 0` (`client.sessions.tsx:101-102`), e così il profilo (`use-client-book-state.ts:188`). Provato nel browser in tutti e due i versi: con le condizioni di prima lo scheletro compare durante la rilettura, con quelle nuove no.
   - Corretti due commenti falsi (il hook restituisce anche `bookingsQ`, che Prenota non usa; la riga usa token suoi per annullate, stella e freccia), i titoli dei due test che mordono solo in certi fusi, e tolto un controllo che provava `lucide-react` (che mette `aria-hidden` da sé) invece della riga. Gli altri due punti (la tablist senza pannello, e i test che dipendono dal fuso per disegno del prompt) sono al §9 e al §8.

29/09/2026. Prompt «NC Calendar · Redesign lato cliente · Passata 03 · Sessioni» (Cowork, contro `ef2461f`). Agenti: 1 (il revisore del passo 7). Workflow: 0.

## 1 · Ramo e commit

- **`redesign/cliente-03-sessioni`**, da `origin/redesign/cliente-mobile` @ `ef2461f`. Commit, in ordine:
  1. `1b4d450` Prenota: lo stato dei crediti in un hook, per Sessioni e la Home;
  2. `8f1ae7b` Sessioni: divisione, gruppi, righe e presenza in un file solo;
  3. `61e1b65` Sessioni: la riga della sessione;
  4. `8c1a3df` Sessioni: in programma e passate, con la scheda nell'URL;
  5. `4ecd48c` Sessioni: le correzioni della revisione;
  6. `839ee0c` Spunta la passata 03 in PIANO.md;
  7. Riscrive docs/ULTIMO-RITORNO.md per la passata 03 del lato cliente (il commit finale).
- Ogni commit compila: typecheck 0 dopo ciascuno.
- **PR:** [wolfwood370-cell/nc-calendar#81](https://github.com/wolfwood370-cell/nc-calendar/pull/81) da `redesign/cliente-03-sessioni` verso `redesign/cliente-mobile`, aperta e **non** unita. Descrizione: questo file.
- `git diff --stat origin/redesign/cliente-mobile...HEAD` prima di questo file: `8 files changed, 1638 insertions(+), 171 deletions(-)`.

## 2 · Manifesto

- **NUOVI:** `src/lib/client-sessions.ts` e `client-sessions.test.ts` (29 test); `src/components/client-session-row.tsx` e `client-session-row.test.ts` (5 test); `src/hooks/use-client-book-state.ts`.
- **MODIFICATI:** `src/routes/client.sessions.tsx` (riscritta); `src/routes/client.book.tsx` (+17 −149: le righe spostate nel hook se ne vanno, al loro posto la chiamata); `design_handoff_cliente_mobile/PIANO.md` (la riga 03, nient'altro); `docs/ULTIMO-RITORNO.md` (questo file).
- **TOLTI:** nessuno.
- **NEL PERIMETRO MA NON TOCCATI:** `client-session-timeline.tsx` e `client-sessions-breakdown.tsx` (la Home, 05); `client.bookings.$bookingId.tsx` e `client-booking-detail-view.tsx` (04); `client.settings.tsx` (07); `event-colors.ts`; gli helper della 00 e della 02 (`booking-rules.ts`, `client-credits.ts`, `client-session-status.ts`, `renewal.ts`, `current-block.ts`, `client-slots.ts`, `client-book.ts`, `attendance.ts`, `session-time.ts`, `client-shell.ts`, `queries.ts`); `book-blocked-card.tsx` (`BookRetryCard` riusata così com'è), `segmented-control.tsx`, `client-tab-header.tsx`, `client-page-header.tsx`, `client-button.tsx`, `ui/aura-skeleton.tsx`; `use-client-shell.ts`, `use-session-feedback.ts`, `use-current-block.ts`, `use-now.ts`; `sentry.ts`; `src/routeTree.gen.ts` (la build e il server di sviluppo non l'hanno riscritto); il lato coach; `supabase/`; `package.json`, `bun.lock`, `vitest.config.ts`.

## 3 · I pezzi per le passate dopo (04, 05, 07, 08)

**Le regole** (`src/lib/client-sessions.ts`, puro: niente hook, rete, orologio né Sentry; `now` è sempre un parametro)

- `type SessionsTab = "prossime" | "passate"` · `parseSessionsTab(v: unknown): SessionsTab | undefined` (solo quei due valori) · `upcomingTabLabel(n: number | null): string` («In programma · 8»; «In programma» con `null`).
- `type SessionBooking = Pick<BookingRow, "id" | "status" | "scheduled_at" | "duration_min" | "client_confirmed_at" | "title" | "event_type_id" | "session_type" | "deleted_at" | "category">`.
- `isVisibleSession(b: Pick<SessionBooking, "deleted_at" | "status">): boolean` — `deleted_at` vuoto, oppure `late_cancelled` (l'annullata tardi di `cancel_booking`); le altre con `deleted_at` sono l'«Elimina» del coach.
- `splitSessions<T extends SessionBooking>(bookings: readonly T[], now: Date): { upcoming: T[]; past: T[] }` — sulle visibili; `upcoming` = stato Prenotata, Da confermare, Confermata o In corso, per inizio; `past` = tutte le altre, dalla più recente; a parità di inizio per `id`.
- `interface SessionGroup<T = SessionBooking> { key: string; label: string; items: T[] }` · `upcomingGroups<T extends Pick<SessionBooking, "scheduled_at">>(upcoming: readonly T[], now: Date): SessionGroup<T>[]` (settimane di calendario da lunedì: «Questa settimana», «Settimana prossima», «Dal lunedì 12 ottobre») · `pastGroups<T …>(past: readonly T[]): SessionGroup<T>[]` (mese locale, «Settembre 2026»).
- `type SessionEventType = Pick<EventTypeRow, "id" | "name" | "color" | "location_type">` · `interface SessionRowModel { id; dow; day; range; type; chip; chipTone: { bg; fg }; tile: { bg; fg } | null; rating: string | null; ariaLabel }` · `sessionRow(b: SessionBooking, eventTypes: readonly SessionEventType[], ratings: ReadonlyMap<string, number> | null, now: Date): SessionRowModel` — nome della tipologia (mai il `title`), «Consulenza» o `sessionLabel` senza tipologia; `ratings` nullo = niente «Da valutare» né stelle.
- `tileText(color: string | null): string` — il colore della tipologia se sulla sua tinta al 10% fa almeno 4,5:1, altrimenti `var(--color-aura-primary)`.
- `ratingsById(feedback: readonly { booking_id: string; rating: number }[] | undefined): ReadonlyMap<string, number> | null` — `useClientFeedback(meId).data` così com'è.
- `attendanceSummary(bookings: readonly Pick<SessionBooking, "status" | "scheduled_at" | "deleted_at">[], now: Date): { title: string; sub: string } | null` — `getAttendance` sulle sessioni con `deleted_at` vuoto, importate comprese; filtra da sé, si può passare `bookingsQ.data` intero.
- `upcomingEmpty(state: Pick<BookState, "options" | "blocked"> | null, failed: boolean): { text: string | null; book: boolean }`.

**La riga:** `ClientSessionRow({ row: SessionRowModel; onOpen: (id: string) => void })` — `src/components/client-session-row.tsx`. Un `<button type="button">` a tutta larghezza con `aria-label={row.ariaLabel}`; niente `Link` (la pagina naviga). Alta almeno 72 (74 col bordo), raggio 18, riquadro 50×52; le annullate col fondo `surface-container-low`.

**Lo stato dei crediti:** `useClientBookState(now: Date, coach: BookCoach)` — `src/hooks/use-client-book-state.ts`. Restituisce `{ meId, coachId, profile, profileArrived, client, blocksQ, bookingsQ, eventTypesQ, loading, failed, state, retry, retrying }`.

- Per la Home (05): le sessioni da `bookingsQ` (con le annullate tardi, chiave `["bookings", "client", id, "credits"]`); le incoerenze le manda il hook una volta sola (il `Set` è del modulo): nessuna pagina le rimanda.
- Ogni pagina che lo monta chiama `ensure_client_block_state` (con `staleTime` di 5 minuti): Prenota, Sessioni e la Home. È l'RPC che chiude i blocchi finiti e crea il mese dopo a chi rinnova (idempotente).
- `loading`, `failed`, `arrived` e `lost` sono quelli di Prenota spostati così com'erano, col difetto del §9 (punto 2): per l'interfaccia nuova non vanno copiati. Una lettura persa si riconosce con `data === undefined && (isError || (errorUpdateCount > 0 && fetchStatus !== "idle"))`, come fa Sessioni.
- `profileArrived` resta vero mentre un profilo in errore si rilegge; arrivato con l'errore, `coachId` è nullo anche per chi ha un coach.

**La presenza per il Profilo (07):** `attendanceSummary(bookingsQ.data, now)` dà gli stessi numeri del Profilo del coach e della lista Clienti (stesse sessioni: `deleted_at` vuoto, importate comprese; il cliente ha un coach solo).

**La scheda nell'URL (04, 08):** `/client/sessions?tab=prossime|passate`, validata da `parseSessionsTab`; senza, «In programma». Per un link alle passate: `<Link to="/client/sessions" search={{ tab: "passate" }}>`. Il tocco su una riga fa `navigate({ to: "/client/bookings/$bookingId", params })` senza `replace`: «Indietro» di `ClientPageHeader` (`history.back()`) torna alla stessa scheda; aperto da fuori dell'app, il ripiego è `/client/sessions` (`backFallback`), su «In programma». Il dettaglio (04) non deve usare `replace` per aprire Sposta o Annulla se vuole che «Indietro» torni qui.

**La pagina** (`src/routes/client.sessions.tsx`): stati nell'ordine sessioni perse (card «Sessioni non caricate», che resta anche mentre «Riprova» rilegge) · elenco non pronto (tre righe di scheletro; pronto = sessioni, profilo arrivato e, con un coach, tipologie arrivate o fallite) · elenco o card vuota. Sottotitolo e conteggio nella scheda solo con l'elenco pronto.

## 4 · Acceptance

Base = `origin/redesign/cliente-mobile` (`ef2461f`), misurata al passo 0. Dopo = il ramo a `839ee0c` (tutto il codice e il PIANO; dopo c'è solo questo file). Tutti i comandi in Git Bash, salvo le prove col fuso (PowerShell).

### C0 · i file nuovi

`for f in src/lib/client-sessions.ts src/lib/client-sessions.test.ts src/components/client-session-row.tsx src/components/client-session-row.test.ts src/hooks/use-client-book-state.ts; do test -f "$f" || echo "MANCA $f"; done` → base: 5 righe «MANCA» · dopo: **nessuna riga**.

### C1 · il segnaposto se ne va, la Home no

`grep -c "ClientSessionTimeline" src/routes/client.sessions.tsx` → base `3` · dopo **`0`**. `grep -c "ClientSessionTimeline" src/routes/client.index.tsx` → `2` e **`2`**. `test -f src/components/client-session-timeline.tsx && echo resta` → **`resta`**.

### C2 · la pagina usa le regole

`grep -c "<nome>" src/routes/client.sessions.tsx` → base `0` ciascuno · dopo: `splitSessions` 2 · `upcomingGroups` 2 · `pastGroups` 2 · `sessionRow` 2 · `attendanceSummary` 2 · `upcomingEmpty` 2 · `useClientBookState` 3 · `validateSearch` 1 · `parseSessionsTab` 2.

### C3 · niente calcoli nella pagina

`grep -c -E "getAttendance|getClientSessionStatus|canRate|differenceInCalendar|startOfWeek|toLocale|formatTimeRange|formatLongDay|new Date\(" src/routes/client.sessions.tsx` → base `0` · dopo **`0`**. `grep -c "new Date()" src/lib/client-sessions.ts` → base: il file non c'è · dopo **`0`**.

### C4 · il hook

`grep -v -E '^\s*(//|\*|/\*)' src/routes/client.book.tsx | grep -c -E "useClientBookingsForCredits|useCurrentBlock|getBookState|reportPoolMismatches|useActiveShopTitles|useClientExtraCredits|SENT_MISMATCHES|captureMessage"` → base `15` · dopo **`0`**. `grep -c "useClientBookState" src/routes/client.book.tsx` → base `0` · dopo **`2`**. In `src/hooks/use-client-book-state.ts`: `useClientBookingsForCredits` 3 · `useCurrentBlock` 2 · `getBookState` 4 · `reportPoolMismatches` 2 · `useActiveShopTitles` 2 · `SENT_MISMATCHES` 2.

### C5 · lo spostamento è uno spostamento

Base: il hook non c'è, i due comandi non stampano niente. Dopo, **le righe tolte che nel hook non ci sono uguali** (`comm -23 …`, il comando del prompt):

```
coach: COACH,
const retryAll = () => {
currentBlockQ.isFetching
onRetry={retryAll}
retrying={
```

- `coach: COACH,` — nel hook è `coach,`: il parametro al posto della costante del modulo (§4.3 punto 2).
- `const retryAll = () => {` — nel hook è `const retry = () => {`: stessa funzione, col nome del prompt.
- `currentBlockQ.isFetching` — l'ultimo operando della prop `retrying` di Prenota; nel hook chiude `const retrying = …` col `;`.
- `onRetry={retryAll}` — la pagina ora dice `onRetry={retry}`, il nome che restituisce il hook. È la riga in più rispetto alle quattro di Cowork.
- `retrying={` — la prop diventa `retrying={retrying}`: l'espressione sta nel hook.

**Le righe del hook che in `client.book.tsx` non c'erano** (`comm -13 …`):

```
const retry = () => {
const retrying =
const { user } = useAuth();
currentBlockQ.isFetching;
export function useClientBookState(now: Date, coach: BookCoach) {
profileArrived: arrived(profileQ) || profileQ.errorUpdateCount > 0,
```

- `const retry = () => {` — il `retryAll` di prima, stesse sei righe dentro.
- `const retrying =` — l'espressione che era dentro la prop della card, stessi sei operandi nello stesso ordine.
- `const { user } = useAuth();` — il hook legge l'utente da sé; la pagina tiene il suo `useAuth()` (le serve `user?.email` per `meName`), e prende `meId` dal hook.
- `currentBlockQ.isFetching;` — lo stesso operando col `;`.
- `export function useClientBookState(now: Date, coach: BookCoach) {` — la firma.
- `profileArrived: arrived(profileQ) || profileQ.errorUpdateCount > 0,` — il campo nuovo (§4.3 punto 3). ⚠️ Il prompt diceva `arrived(profileQ)`: il `|| errorUpdateCount > 0` viene dal punto 2 della revisione (§0 passo 7) e riguarda solo Sessioni, perché Prenota non legge questo campo.

Nessuna condizione, confronto, chiave o testo di Prenota cambia. `git diff --numstat origin/redesign/cliente-mobile...HEAD -- src/routes/client.book.tsx` → **`17 149`** (al massimo 25 aggiunte).

### C6 · il manifesto

`git diff --name-only origin/redesign/cliente-mobile...HEAD | grep -v -x -E '…'` → **nessuna riga** (dopo questo file resta vuoto: `docs/ULTIMO-RITORNO.md` è nell'elenco).

### C7 · i quattro cancelli

- `bun run typecheck` → **0 errori** (base 0).
- `bun run lint` → **0 errori e 20 avvisi** (base 20); gli avvisi sono gli stessi della base riga per riga (`diff` delle due uscite vuoto).
- `bun run test`, worker predefiniti → **`Test Files 54 passed (54)` · `Tests 851 passed (851)`** (base 817 in 52; + 29 di `client-sessions.test.ts` e 5 di `client-session-row.test.ts`). Nessun file caduto al caricamento in nessuna delle corse di questa sessione (sei intere, tutte al primo colpo).
- Da PowerShell, `client-sessions.test.ts` e `client-session-row.test.ts`: `TZ=UTC` sonda `0` → `Tests 34 passed (34)`; `TZ=America/Los_Angeles` sonda `420` → `Tests 34 passed (34)`; senza `TZ` sonda `-120` → `Tests 34 passed (34)`.
- `bun run build` → **riuscita** (`✓ built in 8.93s` e `✓ built in 2.69s`, gli stessi avvisi della base su `"use client"`).

### C8 · niente colori scritti, niente `fixed`, niente `main`

`grep -c -E "#[0-9a-fA-F]{6}" src/routes/client.sessions.tsx src/components/client-session-row.tsx` → **`0` e `0`**. `grep -c -E "<main|\bfixed\b" …` → **`0` e `0`**.

### C9 · il PIANO

`grep -n "^| 03 |" design_handoff_cliente_mobile/PIANO.md` → `17:| 03 | [Sessioni](passes/03-sessioni.md) | N1, T1, T5, H9, V13 | 00, 01 | — | [x] |` (base `[ ] |`). `git diff origin/redesign/cliente-mobile...HEAD --stat -- design_handoff_cliente_mobile` → `design_handoff_cliente_mobile/PIANO.md | 2 +-` · `1 file changed, 1 insertion(+), 1 deletion(-)`.

### C10 · niente dati del prototipo nel codice

`grep -rn -E "Giulia|Marco|Personal Training|Via Roma" src/lib/client-sessions.ts src/components/client-session-row.tsx src/routes/client.sessions.tsx src/hooks/use-client-book-state.ts` → **nessuna riga**.

### C11 · la scheda

`grep -c 'kind="tabs"' src/routes/client.sessions.tsx` → base `0` · dopo **`1`**. `grep -c "replace: true" src/routes/client.sessions.tsx` → base `0` · dopo **`1`**.

### C12 · la lettura delle sessioni

`grep "useClientShell()" src/routes/client.sessions.tsx | grep -c -w -E "bookings|bookingsLoading"` → base `1` · dopo **`0`**. `grep -c -E "\.bookings\b|useClientBookings\(" src/routes/client.sessions.tsx` → `0` e **`0`**.

## 5 · Le prove rosse

Ogni prova: il file mutato con una sostituzione di testo, il test del file eseguito, il file rimesso e confrontato byte per byte con l'originale, il test rieseguito (`rosse.mjs` della 02, nello scratchpad). Eseguite due volte: dopo i passi 2 e 3, e alla fine sul codice finale (`4ecd48c`), nei tre fusi da PowerShell con le sonde a `-120`, `0` e `420`. Sul codice finale: **Roma 20 rosse su 20**; **UTC 18**, con R5 e R6 verdi; **Los Angeles 19**, con R5 verde: esattamente i fusi che il prompt prevede. In tutti e tre i fusi le 20 tornano verdi e i file tornano uguali. I messaggi qui sotto sono quelli di Roma.

- **R1** · `isVisibleSession` → `return true;`: 3 test rossi (`isVisibleSession`, «Passate», `pastGroups`), `+ "x1",` fra le passate e `- 10` righe di settembre. Poi verde.
- **R2** · `return !b.deleted_at;`: 3 rossi, `- 20 / + 19` visibili e `p9` sparita dalle passate. Poi verde.
- **R3** · la presenza senza le sessioni col `title`: `+ "title": "Presenza 67% nelle ultime 8 settimane"`, `+ "sub": "4 sessioni svolte · 1 assenza · 1 annullata tardi"`. Poi verde.
- **R4** · la presenza su tutte le visibili: `+ "title": "Presenza 67% …"`, `+ "sub": "6 sessioni svolte · 1 assenza · 2 annullate tardi"`. Poi verde.
- **R5** · le settimane in millisecondi (lunedì meno lunedì, diviso 7 × 24 ore, in giù): rosso **solo a Roma**, «al cambio dell'ora di marzo resta una settimana» (il 29/03 in «Questa settimana»: `- "Settimana prossima"`); verde in UTC e a Los Angeles. Poi verde.
- **R6** · il mese dall'anno e dal mese della stringa ISO: rosso **a Roma** (`- "Ottobre 2026", ["ott"]`: l'annullata dell'1/10 alle 00:30 finisce in settembre) **e a Los Angeles** (`- "Settembre 2026"`: quella del 30/09 alle 23:30 finisce in ottobre); verde in UTC. Poi verde.
- **R7** · «In programma» al contrario: 2 rossi, `upcoming` comincia da `u8` (`- "u1", - "u2", …`). Poi verde.
- **R8** · `toRate` senza i voti: `AssertionError: expected 'Da valutare' to be 'Svolta'` (`p4`). Poi verde.
- **R9** · `tileText` sempre col colore della tipologia: 3 rossi, `expected '#039BE5' to be 'var(--color-aura-primary)'` (`u1`), `expected '#7986CB' …`. Poi verde.
- **R10** · `upcomingEmpty` che conta anche le opzioni col coach: `+ "text": "Hai 5 crediti disponibili: scegli giorno e orario."` (e `[coach 1]` → «Hai 1 credito…»). Poi verde.
- **R11** · con la lettura fallita «Non hai crediti…»: `- "text": null`, `+ "text": "Non hai crediti da prenotare in questo momento."` (il caso `(null, true)`). Poi verde.
- **R12** · `parseSessionsTab` che accetta ogni stringa: `AssertionError: expected 'xyz' to be undefined`. Poi verde.
- **R13** · la settimana da domenica (senza `weekStartsOn`): 2 rossi, la domenica sera mette il lunedì 28 in «Questa settimana» e cambia anche marzo. Poi verde.
- **R14** · il sottotitolo senza le annullate tardi: `+ "sub": "6 sessioni svolte · 1 assenza"`. Poi verde.
- **R15** · lo stato su `new Date()`: 2 rossi, `u1` `+ "In verifica"` e il caso del 2031. Poi verde.
- **R16** · il nome dal `title`: `expected 'PT Giulia' to be 'Sessione PT'` (`u7`) e `expected 'Consulenza Giulia' to be 'Consulenza'`. Poi verde.
- **R17** · senza la regola della consulenza: `expected 'Sessione PT' to be 'Consulenza'` (`p13`). Poi verde.
- **R18** · `ratings` nullo come vuoto: `expected 'Da valutare' to be 'Svolta'` (`p6` coi voti non letti). Poi verde.
- **R19** · il nome accessibile senza il voto: `expected 'Mercoledì 23 settembre, 11:00–12:00, …' to be …` (finisce con «, svolta»). Poi verde.
- **R20** · `ClientSessionRow` senza `aria-label`: 2 rossi nel test statico, `expected '<button type="button" class="flex min…' to contain 'aria-label="Mercoledì 30 settembre, 1…'`. Poi verde.

In più, nel browser (§0 passo 7): la condizione di prima su `typesArrived` e su `profileArrived`, rimessa per un giro, fa comparire lo scheletro durante la rilettura (KO); rimesso il file (uguale byte per byte), OK.

## 6 · Il browser

**Il banco:** il banco della 02 (`…\e12d7d23-…\scratchpad\banco`) copiato in `C:\Users\wolfw\AppData\Local\Temp\claude\C--Coworks-NC-App-Development-repos-nc-calendar\594a7ecd-3c1a-4238-84c3-1fce637ebb48\scratchpad\banco`, fuori dal repo: Playwright della cache npx, Chromium headless 1200, Vite con Supabase su `finto-supabase.test`, PostgREST finto in memoria (più `failAlways`, un errore che dura finché lo si toglie), `@/lib/gcal.functions` e `@/lib/sentry` finti. Ora fissa lunedì 28/09/2026 10:40, fuso `Europe/Rome`; per B5 `clock.install` alle 10:59:40 e `clock.runFor(60_000)`. Dati: `seed-sessioni.mjs` (Giulia del §4.1 punto 13, tutte con `block_id` nullo, id leggibili `u1`…`x1`, i due voti; le varianti Giulia della 02 senza sessioni in programma, Davide, Elena, «vuota»). Script: `giro-sessioni.mjs` (B1-B9 e B11-B14), `cattura-sessioni.mjs` + `confronto-sessioni.mjs` (B9 e B10), `giro-prenota.mjs` della 02 (B9). Schermate in `…\scratchpad\banco\giro\`.

Esiti sul codice finale: **`giro-sessioni.mjs` 78 prove su 78**; **`giro-prenota.mjs` 82/82**; **confronto base/ramo 0 differenze**. Le uniche voci d'errore della pagina sono le risposte 500 volute dei casi di B7.

- **B1** ✅ `h1` «Sessioni», sottotitolo «8 sessioni in programma», scheda «In programma · 8» con `aria-selected="true"` e `tabindex="0"`; gruppi «Questa settimana» 4, «Settimana prossima» 3, «Dal lunedì 12 ottobre» 1; chip In corso, Da confermare, Confermata, Prenotata | Prenotata ×3 | Prenotata; `u1` «Call di consulenza · online», «In corso»; `u7` «Sessione PT» e nessun «Giulia» in pagina. Contrasti dei riquadri (testo e fondo composto sul bianco, letti dipinti su un canvas): Call `rgb(0,62,98)` su `rgb(229,245,252)` **10,08**; Sessione PT `rgb(213,0,0)` su `rgb(251,229,229)` **4,55** (sei righe); Test `rgb(0,62,98)` su `rgb(252,242,241)` **10,24**. Confronto con `03-sessioni-01-in-programma.png`: stessa struttura, misure, colori e testi (salvo i dati: il prototipo ha «Personal Training»); i caratteri sono di ripiego perché il banco serve Google Fonts vuoti. `giro/B1-390-in-programma.png`, `B1-390-in-programma-intera.png`.
- **B2** ✅ «Presenza 75% nelle ultime 8 settimane» · «6 sessioni svolte · 1 assenza · 1 annullata tardi»; «Ottobre 2026» 1, «Settembre 2026» 10, «Agosto 2026» 1 nell'ordine del §4.1; «In verifica» su `p1`, «Da valutare» su `p6`, stelle «5 su 5» (23/09) e «4 su 5» (21/09); `p9` «Annullata tardi»; nessuna riga del 24/09; `p13` «Consulenza». Contrasti: annullate `rgb(65,71,79)` su `rgb(242,243,248)` **8,46**; Sessione PT **4,55**; Consulenza `rgb(0,86,133)` su `rgb(229,238,243)` **6,69**; BIA `rgb(0,62,98)` su `rgb(241,243,250)` **10,15**. Confronto con `03-sessioni-02-passate.png`: stessa struttura. `giro/B2-390-passate.png`, `B2-390-passate-intera.png`.
- **B3** ✅ `tablist` «Sessioni» con due `tab`; dalla campanella, Tab entra sulla scheda scelta; freccia destra → «Passate», `?tab=passate`, `history.length` fermo a 2; Home → `?tab=prossime`; End → `?tab=passate`; il focus segue la scelta. Anello **2 px `rgb(0, 86, 133)`, scostato di 2**, a transizione finita: subito dopo il Tab è ancora `rgb(0, 62, 98)`, perché `transition-colors` di Tailwind v4 anima anche `outline-color` per 150 ms (§9). `giro/B3-390-focus-scheda.png`.
- **B4** ✅ Ricaricata `?tab=passate` apre su «Passate». Tocco sulla riga di `p4` → `/client/bookings/p4`; «Indietro» → `/client/sessions?tab=passate` con «Passate» scelta. Aperto `/client/bookings/p4` come prima pagina, «Indietro» → `/client/sessions` su «In programma». `giro/B4-390-dettaglio-p4.png`.
- **B5** ✅ Alle 10:59:41 `u1` «In corso», «8 sessioni in programma»; dopo `runFor(60_000)` (le 11:00:42) «7 sessioni in programma», «In programma · 7», `u1` fuori da «In programma» e fra le passate come «In verifica», senza ricaricare.
- **B6** ✅ Giulia della 02 senza sessioni in programma: «Nessuna sessione in programma», «Hai 6 crediti disponibili: scegli giorno e orario.», «Prenota una sessione» → `/client/book` (dove la Sessione PT dice «60 min · 5 disponibili»); nelle passate «Presenza 80% nelle ultime 8 settimane» · «4 sessioni svolte · 1 assenza» e quattro «Da valutare». Davide: «Non hai crediti da prenotare in questo momento.», nessun pulsante, e nelle passate «Nessuna sessione passata» col suo testo e nessuna presenza. Elena: «Hai 5 crediti disponibili: scegli giorno e orario.» col pulsante; nelle passate «Presenza 100%» · «1 sessione svolta · 0 assenze». «Vuota» (nessuna sessione): le due card, nessuna riga di presenza. `giro/B6-390-{giulia02,davide,elena,vuota}-{in-programma,passate}.png`.
- **B7** ✅ Sessioni in errore (ogni GET di `bookings` a 500): campionando ogni 200 ms, «Sessioni non caricate» dopo 7,7-10,9 s (i tentativi di TanStack Query), **mai** «Nessuna sessione in programma» né «Nessuna sessione passata», e nell'intestazione mai un sottotitolo (la scheda dice «In programma»), in tutte e due le schede. «Riprova» da tastiera col finto ancora in errore: la card resta col pulsante disattivato, poi il focus è sul titolo «Sessioni non caricate». «Riprova» col finto tornato a rispondere → l'elenco. `training_blocks` in errore (Giulia della 02): la card col solo pulsante, **mai** «Non hai crediti». `session_feedback` in errore: 12 righe, nessun «Da valutare» e nessuna stella. Tipologie o profilo in errore: l'elenco coi nomi di ripiego («Sessione PT», «Test funzionale»), che resta anche mentre il ritorno sulla finestra le rilegge. `giro/B7-390-*.png`.
- **B8** ✅ A 320: pagina larga 320; nel contenuto trabocca solo la riga della tipologia, con l'ellissi; righe alte almeno 74; chip interi (alti 24) e schede intere (134 × 44). Nell'intestazione il badge della campanella esce di 3 px dal suo pulsante, per disegno (§8). Con i chip larghi («Da confermare», «Confermata», «Annullata tardi») l'orario va a capo dopo il trattino e la riga cresce: nessun trabocco, e il prototipo con lo stesso CSS farebbe uguale (§7). A 1280: colonna di 560, le cinque schede nell'header desktop con «Sessioni» `aria-current="page"`, campanella dell'intestazione `display: none`, pista visibile alta 52, intestazione attaccata a 57 px. `giro/B8-320-{prossime,passate}.png` (e `-intera`), `B8-390-*.png`, `B8-1280-*.png`.
- **B9** ✅ `giro-prenota.mjs` della 02 rieseguito sul ramo finito: **82/82**, zero richieste bloccate, zero funzioni server. Le 19 richieste di Prenota al finto sono uguali sulla base e sul ramo (`cattura-sessioni.mjs`). Aperta Sessioni e poi Prenota (Giulia della 02): `ensure_client_block_state` chiamata (già da Sessioni, che monta il hook), «Sessione PT · 60 min · 3 disponibili», nessuna chiamata a Sentry. `giro/B9-390-prenota-dopo-sessioni.png`.
- **B10** ✅ `cattura-sessioni.mjs` sulla base (`git switch --detach origin/redesign/cliente-mobile`, poi ritorno sul ramo) e sul ramo finito, Giulia della 02 alla stessa ora: il testo del contenuto di Home, Prenota, Booster, Profilo, dettaglio e Notifiche **uguale**, titoli uguali; `/trainer` a 1440×900 e 390×844 **uguali byte per byte** (94984 e 42266 byte). Zero bloccate e zero funzioni server da tutte e due. In console, a volte sulla base e a volte sul ramo, un avviso di chiavi duplicate del Profilo (§9). `…\banco\cattura-base\`, `…\banco\cattura-ramo\`.
- **B11** ✅ `getByRole("button", { name, exact: true })` trova una volta ciascuno «Mercoledì 30 settembre, 10:00–11:00, Sessione PT, da confermare», «Lunedì 28 settembre, 10:15–11:00, Call di consulenza, online, in corso», «Venerdì 18 settembre, 07:30–07:45, BIA (Bioimpedenziometria), da valutare», «Mercoledì 23 settembre, 11:00–12:00, Sessione PT, svolta, valutata 5 su 5»; i titoli dei gruppi e dei mesi sono `h2`.
- **B12** ✅ Nei giri dell'elenco zero chiamate a Sentry. Nelle card vuote: Giulia della 02, Elena e «vuota» zero, come Prenota coi loro dati; Davide una chiamata `warning` («Prenota: sessioni e crediti non coincidono (Sessione PT) · …: 0 contate, 8 registrate»), la stessa di Prenota da sola, e **una sola** aprendo Sessioni e poi Prenota.
- **B13** ✅ In fondo alla pagina a 390 l'ultima riga va da 651 a 725, la barra comincia a 773; nessun elemento `position: fixed` dentro la pagina. `giro/B13-390-in-fondo.png`.
- **B14** ✅ Zero richieste esterne bloccate e zero chiamate a `/_serverFn/` in tutti i giri; nel log del server di sviluppo nessuna funzione server.

## 7 · Non fatto

- **A 320 l'orario può andare a capo** (B8): con i chip più larghi la colonna centrale resta sotto i circa 88 px di «10:00–11:00» e l'orario va a capo dopo il trattino (la riga passa da 74 a circa 96 px). Da circa 350 px in su sta su una riga. L'ho lasciato come il prototipo, che ha lo stesso CSS; per tenerlo su una riga a 320 servirebbe cambiare il disegno sotto i 360 px (gap, freccia o chip), e lo decide Cowork.
- **La tablist senza pannello** (punto 5 della revisione): nessun `role="tabpanel"` né `aria-controls`. `SegmentedControl` non dà id alle schede, e gli altri due usi di `kind="tabs"` (`clients-desktop.tsx`, `client-profile-desktop.tsx`) sono uguali: si fa nel componente, per tutti.
- Il confronto con le due schermate del pacchetto è a occhio (struttura, misure, colori, testi), non pixel per pixel: i dati sono quelli del §4.1 e non quelli del prototipo, e il banco non carica Sora e Manrope.

## 8 · Divergenze

- Il clone era su `main` @ `3d29634`, non su `redesign/cliente-02-prenota` @ `2690385` (§2 del prompt).
- **C5:** cinque righe nel primo verso invece di quattro (`onRetry={retryAll}`, spiegata al §4); `client.book.tsx` a +17 −149 invece di +17 −148 (una riga vuota in più tolta coi blocchi).
- **`profileArrived`** è `arrived(profileQ) || profileQ.errorUpdateCount > 0` e non `arrived(profileQ)` (§4.3 punto 3 del prompt), `use-client-book-state.ts:188`: TanStack Query v5 toglie l'errore a una lettura senza dati quando la rilegge, e con la definizione del prompt un profilo in errore tornava «non arrivato» a ogni ritorno sulla finestra, nascondendo l'elenco di Sessioni dietro lo scheletro. Prenota non legge questo campo.
- **Sessioni perse** (§4.4 punto 5: «bookingsQ in errore e senza dati») vale anche mentre una lettura già fallita si rilegge (`errorUpdateCount > 0` e `fetchStatus` non fermo, `client.sessions.tsx:93-96`), per lo stesso motivo: altrimenti «Riprova» toglieva la card. E dopo un «Riprova» fallito il focus va sul titolo della card (`:134-148`), che il prompt non chiedeva.
- **Le tipologie arrivate** contano anche `errorUpdateCount > 0` (`client.sessions.tsx:101-102`), per lo stesso motivo.
- **In più delle regole del prompt:** `ratingsById` e `SessionEventType` in `client-sessions.ts`; un test su `upcomingEmpty` con lo stato vero di `getBookState`.
- **B8, «nessun elemento del contenuto»:** l'ho misurato sul contenuto sotto l'intestazione. Nell'intestazione il badge della campanella (01) esce di 3 px dal suo pulsante (`top: -3px; right: -3px`, come nel prototipo), dentro il padding di 20: nessuno scorrimento orizzontale.
- **B3, l'anello del focus:** `#005685` a transizione finita; per i primi 150 ms dopo il Tab il colore passa da quello del testo della scheda (`#003e62`) a `#005685` (§9).
- **I test che dipendono dal fuso** (punto 6 della revisione): per disegno del prompt, R5 morde solo a Roma e R6 solo a Roma e a Los Angeles; `vitest.config.ts` non fissa `TZ`, quindi la prova vale perché si lancia anche nel fuso del PC. Ho riscritto i due titoli perché non dicano il falso negli altri fusi.
- I riferimenti `file:riga` del §3 e del §4 del prompt li ho controllati tutti (`client-session-status.ts:113/135/180`, `attendance.ts:13/32/49/171`, `session-time.ts:15/52`, `credits.ts:44`, `mock-data.ts:8`, `client-book.ts:68/77/87/131/213/218/277`, `client-shell.ts:98/106/150/159`, `queries.ts:7/296/302`, `use-session-feedback.ts:22`, `segmented-control.tsx:40`, `clients-desktop.tsx:201`, `book-blocked-card.tsx:69`, `event-colors.ts:46`, `profile-load.ts:148`, `client-profile-desktop.tsx:326`, `client-list.ts:273`, `use-client-shell.ts:121/125`, `client.index.tsx:30/823`, la migrazione `:177`, il prototipo `:78`): corrispondono.

## 9 · Trovati e non toccati

1. **Prenota ha lo stesso meccanismo di TanStack Query v5** (dalla 02, spostato così com'era): `arrived` e `lost` (`use-client-book-state.ts:101-102`) tornano indietro quando una lettura senza dati si rilegge. Con una lettura persa, «Riprova» di «Prenota non si è caricata» toglie la card per lo scheletro (il focus finisce sul `body` e `retrying` non si vede mai), e ogni ritorno sulla finestra fa lo stesso. Non toccato: lo spostamento non deve cambiare Prenota. La correzione è quella di Sessioni (`errorUpdateCount`).
2. **`BookRetryCard` disattiva il pulsante mentre rilegge** (`book-blocked-card.tsx:76`, 02): il browser toglie il focus a un pulsante disattivato. Sessioni lo rimette sul titolo dopo un tentativo fallito; con `aria-disabled` al posto di `disabled` il focus resterebbe sul pulsante, per tutte le pagine.
3. **`src/routes/client.settings.tsx:357`** (Profilo, 07): `key={p.name}` sulle righe dei crediti. Se le tipologie arrivano dopo i blocchi, la Sessione PT e la Call di consulenza ripiegano tutte e due su «Sessione PT» e React avvisa di chiavi duplicate (visto nella cattura della base e in una del ramo). Dura finché arrivano le tipologie.
4. **`transition-colors` di Tailwind v4 anima anche `outline-color`**: l'anello del focus di ogni elemento con quella classe (le schede di `SegmentedControl`, anche lato coach) passa in 150 ms dal colore del testo a `#005685`. Non si nota (sono due blu scuri), ma chi misura l'anello deve aspettare la fine della transizione.
5. **Sessioni ora chiama `ensure_client_block_state`** all'apertura, attraverso il hook, come Prenota e la Home: è un'RPC che scrive (chiude i blocchi finiti, crea il mese dopo a chi rinnova), idempotente e con `staleTime` di 5 minuti.
6. **La tablist senza pannello** (§7) e **l'orario a capo a 320** (§7).
7. **`lucide-react` mette `aria-hidden="true"` da sé** sulle icone (`node_modules/lucide-react/dist/esm/Icon.js:33`): un test che lo cerca prova la libreria, non il componente.
8. **La suite in parallelo:** in questa sessione nessun file è caduto al caricamento (sei corse intere coi worker predefiniti); niente da catturare.
9. Il limite del server di `cancel_booking` (`deleted_at` anche sugli annullamenti gratuiti) resta com'è, come dice il §5 del prompt.

## 10 · Resta a Nicolò

- Il merge della PR [wolfwood370-cell/nc-calendar#81](https://github.com/wolfwood370-cell/nc-calendar/pull/81) nel ramo di integrazione `redesign/cliente-mobile`, dopo la verifica di Cowork.
- Il rilascio su `main`, non prima della correzione del server del 02/10/2026.
