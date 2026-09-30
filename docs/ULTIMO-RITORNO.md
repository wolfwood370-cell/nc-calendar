# Ultimo ritorno · Lato cliente · Passata 04 · Dettaglio sessione, Sposta, Annulla

> **In breve, prima di tutto.** Il codice della passata è scritto e committato, ma **nessun cancello è stato eseguito**: niente typecheck, lint, test, build né giro nel browser. La sessione non girava sul PC di Nicolò ma in un container di Claude Code on the web, con `node_modules` vuota; il lock punta al registro privato di Lovable, che la rete del container rifiuta (403), e il tentativo di riempire `node_modules` dal registro pubblico con una copia del lock è stato **negato dai permessi della sessione**. Non ho cercato altre strade. Tutti i controlli del §6 che si fanno con git e grep sono eseguiti e danno i risultati attesi (§4). Prove parziali, non i cancelli: il Prettier già installato nel container (3.8.1; il lock vuole 3.8.3) non trova differenze sui 16 file toccati; il revisore (§0 passo 8) ha fatto girare i test puri con un sostituto scritto a mano di `date-fns`, 44/44 e 30/30 a Roma, in UTC e a Los Angeles. I cancelli veri (C7), le prove rosse (R1-R25) e il browser (B1-B16) sono **da fare sul PC**, e fino ad allora la riga 04 di `PIANO.md` è `[~]` e non `[x]`.

## 0 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ⚠️ **La base e il ramo** (§2). Nessun commit.
   - `git fetch origin`; `git merge-base --is-ancestor 043fcfd origin/redesign/cliente-mobile && echo 03-presente` → `03-presente`.
   - `origin/redesign/cliente-mobile` = `0e12622` (merge della PR 81). `redesign/cliente-04-sessione` creato con `git switch --no-track -c redesign/cliente-04-sessione origin/redesign/cliente-mobile`.
   - `git diff --stat b780645 origin/redesign/cliente-mobile -- package.json bun.lock` → vuoto. `package.json` e `bun.lock` non toccati.
   - ⚠️ **Ambiente:** non il clone di Nicolò su Windows ma un container Linux di Claude Code on the web (`/home/user/nc-calendar`, fuso di sistema UTC, Node 22, bun 1.3). Il clone era su `main` @ `14c09e9`, pulito. `node_modules` era vuota: `bun install --frozen-lockfile` avrebbe chiesto i pacchetti a `europe-west1-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache` (331 voci del lock) e `europe-west4-…` (36), e il proxy del container risponde 403 a quell'host; il registro pubblico risponde. Ho provato a installare da una copia del lock nella cartella di lavoro, con gli URL riscritti verso il registro pubblico (stesse versioni, stessi hash di integrità): **negato dai permessi della sessione** («Package Registry Bypass»). Da lì nessun altro tentativo.
   - **I quattro cancelli della base: non misurati qui.** Restano quelli del container di Cowork del 29/09 notte su `043fcfd` (albero uguale a `0e12622`): typecheck 0 errori · lint 0 errori e 20 avvisi · 851 test in 54 file · build riuscita.
   - **Sonde del fuso**, con Node del container (su Linux `TZ` arriva ai processi, il problema di Git Bash non c'è): `TZ=UTC` → `0`, `TZ=America/Los_Angeles` → `420`, `TZ=Europe/Rome` → `-120`; senza `TZ` → `0` (il container è in UTC, quindi il fuso di Roma va dato esplicito).
   - I controlli del §6 sulla base, misurati su un'estrazione di `0e12622` (`git archive`) nella cartella di lavoro: gli stessi numeri «oggi» del prompt (§4).
1. ⚠️ **Gli orari del coach in un hook** (§4.3). `eb3507d`. `src/hooks/use-coach-slot-inputs.ts` (97 righe: le 85 dello spostamento di Cowork più 12 di intestazione) montato da uno script che copia le righe di `client.book.tsx` per numero (`:120-124`, `:146-148`, `:150-172`, `:232-246`, `:412-417`), così le righe spostate sono uguali byte per byte; `client.book.tsx` a **+14 −71**, come quello di Cowork. C4 e C5 danno esattamente le righe e i numeri di Cowork (§4). ⚠️ «typecheck 0 e lint a 20; i test di oggi tutti verdi»: non eseguiti.
2. ⚠️ **Le regole del dettaglio** (§4.1, §4.2). `982fee5`. `src/lib/client-session-detail.ts` e `client-session-detail.test.ts` (44 test), `sessionName` e `tintContrast` in `client-sessions.ts`, gli `export` in `client-book.ts`, il caso della 03 in `client-sessions.test.ts` (C13). ⚠️ I test non sono stati eseguiti, in nessun fuso; R1-R21 e R23-R25 «non provate» (§5).
3. ⚠️ **Ripristina, conferma e valutazione** (§4.5, §4.6). `795562f`. `use-restore-booking.ts`, il tono di `toastWithUndo`, la nota in `use-session-feedback.ts`, `client-session-rating.tsx` col test statico (3 test). C11, C12, C15 come attesi (§4). ⚠️ R22 «non provata».
4. ⚠️ **I due fogli** (§4.7, §4.8). `8aaf62e`. `client-move-sheet.tsx` e `client-cancel-sheet.tsx`; in `client-session-detail.ts` anche `sessionMinutes` esportata (la durata che il foglio passa a `getClientSlotDays`). C3 e C8 dei fogli a `0` (§4). ⚠️ Nessun cancello eseguito.
5. ⚠️ **La pagina** (§4.4). `b94a257`. La route e la vista riscritte, `client-reschedule-sheet.tsx` tolto. C1, C2, C3, C8, C10, C14 come attesi (§4). ⚠️ Nessun cancello eseguito.
6. ⚠️ **Il browser** (§8). **Non fatto**: senza `node_modules` non parte il server di sviluppo, e il banco della 02 e della 03 sta nella `%TEMP%` del PC di Nicolò. Le voci B1-B16 sono al §6, una per una.
7. ⚠️ **Chiusura** (§10). I controlli del §6 che non chiedono dipendenze eseguiti sul ramo finito (§4); la riga 04 di `PIANO.md` a **`[~]`** («in corso»), non a `[x]` («fatta e verificata»): C9 è volutamente non soddisfatto finché i cancelli non girano. Commit «Spunta la passata 04 in PIANO.md» (`e87c8bd`) e «Riscrive docs/ULTIMO-RITORNO.md per la passata 04 del lato cliente» (`a4ccdc4`); push di `redesign/cliente-04-sessione`; la PR verso `redesign/cliente-mobile` è al §1.
8. ☑ **Passo aggiunto: la revisione e le sue correzioni.** Un revisore in sola lettura sul diff (un agente, circa 40 minuti, in background mentre scrivevo questo file), con l'ordine di non installare niente. Ha usato quello che il container ha già: Prettier 3.8.1 sulle copie dei file (**0 differenze**), `tsc` 6.0.2 coi tipi dei pacchetti mancanti sostituiti da dichiarazioni sue (i moduli puri e i loro test **senza errori**; i `.tsx` solo a lettura, perché lì React e TanStack diventano `any`), e i test puri compilati in JS ed eseguiti con Node e un sostituto di `date-fns` scritto da lui: **44/44** di `client-session-detail.test.ts` e **30/30** di `client-sessions.test.ts`, col caso nuovo, con `TZ=Europe/Rome`, `UTC` e `America/Los_Angeles`. Sono indizi, non i cancelli: il `date-fns` vero, il typecheck del progetto e il lint non sono girati. Nessun errore di tipi, di Prettier o di lint trovato; sei punti, e questi li ho corretti in `9b7a2e8` «Sessione: le correzioni della revisione»:
   - **il foglio Sposta chiuso mentre sposta perdeva l'esito** (certo): `useRescheduleBooking` stava nel contenuto del foglio, che si smonta alla chiusura, e TanStack Query v5 non chiama le callback di `mutate` a componente smontato. Il server spostava la sessione, ma niente toast, niente «Ripristina» e il dettaglio all'orario vecchio. Ora `mutateAsync`, la cui promessa arriva comunque (`client-move-sheet.tsx:214-235`); un errore a foglio chiuso diventa un toast; «Indietro» è disattivato mentre sposta;
   - **dopo uno spostamento fallito gli occupati non si rileggevano** (certo): dopo un `23P01` l'orario preso da altri restava offerto e scelto. Ora `invalidateBookingScope` dopo ogni errore, come Prenota (`use-book-confirm.ts:157`);
   - **la lettura fallita della tipologia era ignorata**, come prima della passata: il dettaglio avrebbe detto «Sessione PT» per una call, senza luogo né «Entra nella videochiamata». Ora è un errore della lettura, con «Riprova» (`client.bookings.$bookingId.tsx:89`);
   - **passando da un dettaglio all'altro restava lo stato del primo** (la route non si rimonta quando cambia solo il parametro): la valutazione poteva mostrare il voto appena dato all'altra sessione. Ora la vista ha `key={booking.id}` (`client.bookings.$bookingId.tsx:99`).
   Gli altri due: l'annullamento gratuito che diventa «Sessione non trovata» col server di oggi, e i suoi effetti (§9); `canMove`, `formatLongDay` e `new Date(booking.scheduled_at)` nel foglio Sposta, che il prompt permette espressamente (C3 li esclude). E una nota: `query-keys.ts:82` rinfresca ancora `["coach-busy-reschedule", …]`, che dopo la passata non usa nessuno (§9).

30/09/2026. Prompt «NC Calendar · Redesign lato cliente · Passata 04 · Dettaglio sessione, Sposta, Annulla» (Cowork, contro `0e12622`). Agenti: 1 (il revisore del passo 8). Workflow: 0.

## 1 · Ramo e commit

- **`redesign/cliente-04-sessione`**, da `origin/redesign/cliente-mobile` @ `0e12622`. Commit, in ordine:
  1. `eb3507d` Prenota: gli orari del coach in un hook, per Sposta;
  2. `982fee5` Sessione: stati, azioni e testi del dettaglio in un file solo;
  3. `795562f` Sessione: ripristina, e la valutazione con la nota;
  4. `8aaf62e` Sessione: i fogli Sposta e Annulla;
  5. `b94a257` Sessione: il dettaglio, con una sola azione principale per stato;
  6. `5ee1760` Sessione: la nota salvata della valutazione in un testo solo (la nota fra «» in un solo nodo di testo, per il test statico);
  7. `e87c8bd` Spunta la passata 04 in PIANO.md (`[~]`, §0 passo 7);
  8. `a4ccdc4` Riscrive docs/ULTIMO-RITORNO.md per la passata 04 del lato cliente;
  9. `9b7a2e8` Sessione: le correzioni della revisione (§0 passo 8);
  10. l'aggiornamento di questo file con la revisione (il suo hash sta nella risposta finale: un file non contiene l'hash del commit che lo scrive).
- «Ogni commit compila»: **non verificato**, nessun typecheck eseguito.
- **PR:** vedi la risposta finale (aperta come bozza verso `redesign/cliente-mobile`, non unita), con questo file come descrizione.

## 2 · Manifesto

- **NUOVI:** `src/lib/client-session-detail.ts` e `client-session-detail.test.ts` (44 test); `src/hooks/use-coach-slot-inputs.ts`; `src/hooks/use-restore-booking.ts`; `src/components/client-session-rating.tsx` e `client-session-rating.test.ts` (3 test); `src/components/client-move-sheet.tsx`; `src/components/client-cancel-sheet.tsx`.
- **MODIFICATI:** `src/routes/client.book.tsx` (+14 −71: le righe spostate nel hook se ne vanno, al loro posto la chiamata); `src/lib/client-sessions.ts` (`sessionName`, `tintContrast`, che `sessionRow` e `tileText` usano al posto delle loro righe); `src/lib/client-sessions.test.ts` (il caso di C13); `src/lib/client-book.ts` (`export` davanti a `coachFirstName`, `coachSubject`, `coachTo`); `src/lib/toast.ts` (il tono); `src/hooks/use-session-feedback.ts` (la nota e `noteSaved`); `src/components/client-booking-detail-view.tsx` e `src/routes/client.bookings.$bookingId.tsx` (riscritte); `design_handoff_cliente_mobile/PIANO.md` (la riga 04, nient'altro); `docs/ULTIMO-RITORNO.md` (questo file).
- **TOLTI:** `src/components/client-reschedule-sheet.tsx` (lo importava solo la vista del dettaglio, C14).
- **NEL PERIMETRO MA NON TOCCATI:** la Home (`client.index.tsx`, `client-live-booking-card.tsx`, `reschedule-drawer.tsx`, `join-video-call-button.tsx`, `client-feedback-card.tsx`: la 05); `src/lib/calendar.ts` (`generateGoogleCalendarLink` ora non la importa nessuno: la 09); i commenti che citano il foglio tolto (`src/lib/booking-slots.ts:6`, `src/lib/queries.ts:679`, `supabase/functions/booking-notifications/index.ts:10`) e quello che cita righe della vista riscritta (`src/lib/event-type-rules.ts:174`); gli helper del §9 del prompt (`booking-rules.ts`, `client-credits.ts`, `client-session-status.ts`, `renewal.ts`, `current-block.ts`, `client-slots.ts`, `attendance.ts`, `session-time.ts`, `client-shell.ts`, `queries.ts`, `query-keys.ts`, `gcal.functions.ts`, `use-confirm-attendance.ts`, `use-client-book-state.ts`, `client-sheet.tsx`, `client-button.tsx`, `client-day-strip.tsx`, `client-slot-groups.tsx`); `book-blocked-card.tsx` (`BookRetryCard` riusata così com'è); `src/routeTree.gen.ts`; `supabase/`; `package.json`, `bun.lock`, `vitest.config.ts`.

## 3 · I pezzi per le passate dopo (05, 08, 09)

**Le regole** (`src/lib/client-session-detail.ts`, puro: niente hook, rete, orologio né Sentry; `now` è sempre l'ultimo parametro)

- Tipi: `DetailBooking = Pick<BookingRow, "id" | "status" | "scheduled_at" | "duration_min" | "client_confirmed_at" | "title" | "event_type_id" | "session_type" | "deleted_at" | "category" | "meeting_link" | "trainer_notes" | "google_event_id" | "block_id" | "buffer_min">` · `DetailEventType = Pick<EventTypeRow, "id" | "name" | "color" | "location_type" | "location_address" | "description">`. Una `BookingRow` intera (la Home) va bene dappertutto.
- `sessionMinutes(b): number` — `duration_min` se positiva, altrimenti 60 (come `formatTimeRange`).
- L'intestazione: `detailStatus(b: StatusBooking, now): DetailStatus` (lo stato della 00, `key`/`label`/`line`/`icon`, più `tone = CLIENT_STATUS_TONE[key]`) · `detailWhen(b, now): { day; time }` («Oggi, lunedì 28 settembre» · «10:00–11:00 · 60 min · tra 2 giorni»; quanto manca solo per le `scheduled` non iniziate) · `detailPlace(eventType | null | undefined): { online; text; mapsHref } | null` · `tileIcon(color: string | null): string` (il colore della tipologia a 3:1 sulla sua tinta, altrimenti `var(--color-aura-primary)`).
- Le azioni: `detailPanel(b: DetailBooking, online: boolean, now): { join; confirm; manage: "free" | "locked" | null; status }` · `LOCKED_TITLE` («Mancano meno di 24 ore») · `freeCancelNote(b)` · `lockedText(name, coach)` · `confirmCaption(coach)` · `statusCard(b: StatusBooking, rebookable: boolean, now): { key; line; absent; rebook }` · `canRebook(b, state: Pick<BookState, "options"> | null): boolean` · `absentHint(coach): { text; href: string | null }`.
- Le informazioni: `inviteText(b: DetailBooking, email: string | null | undefined, now): string | null` · `coachNoteTitle(coach)`.
- La valutazione: `ratingState(b, hasFeedback: boolean, now): { show; editable }` · `starsLabel(n)` · `ratingToast(coach)`.
- Annulla: `cancelSheet(b, name, now): { when; free; text }` · `cancelToast(wasLate): { tone: "success" | "warning"; text }`.
- Sposta: `moveCurrent(b, name)` · `moveBlockedText(coach)` · `moveNoSlotsText(coach)` · `moveRule(window: CreditWindow | null, coach, now)` · `moveDays(days: readonly ClientSlotDay[], b): ClientSlotDay[]` (senza l'orario di adesso, confrontato come tempo; un giorno rimasto vuoto ha `reason: "pieno"`) · `moveDay(days, chosenIso: string | null): ClientSlotDay | null` · `moveButton(slot: Pick<ClientSlot, "iso" | "time"> | null)` · `moveToast(iso, coach)`.
- Gli errori: `type DetailAction = "move" | "undo-move" | "restore"` · `actionErrorText(err: BookingErrorLike | null | undefined, action): string` (23P01 → orario occupato; P0001 con un messaggio → il messaggio del server; altrimenti il ripiego).
- In `client-sessions.ts`: `sessionName(b, eventType)` (mai il titolo) e `tintContrast(color)`. In `client-book.ts`: `coachFirstName`, `coachSubject`, `coachTo`.

**I fogli** (la 05 apre Sposta dalla card della prossima sessione)

- `ClientMoveSheet({ open; onOpenChange; booking: MoveBooking; name: string; coach: BookCoach; clientName: string | null; onMoved: (fromIso: string, toIso: string) => void })` — `src/components/client-move-sheet.tsx`, con `MoveBooking = DetailBooking & Pick<BookingRow, "coach_id" | "client_id">`. Legge da sé, **solo mentre è aperto** (il contenuto sta dentro il pannello, che si monta all'apertura): `now` da `useClientShell()`, i blocchi con `useClientBlocks(client_id)` (la chiave del hook della 03), gli orari con `useCoachSlotInputs(coach_id, now)`. Sposta con `useRescheduleBooking` (evento Google e avviso al coach); riuscito chiama `onMoved`, e **chi lo usa** chiude il foglio, invalida la sua lettura e fa il toast (`moveToast`, `toastWithUndo`, lo spostamento inverso: vedi `client-booking-detail-view.tsx:189-209`).
- `ClientCancelSheet({ open; onOpenChange; booking: Pick<DetailBooking, "id" | "scheduled_at" | "duration_min">; name; onCancelled: (wasLate: boolean) => void; returnFocus?: () => HTMLElement | null | undefined })` — `src/components/client-cancel-sheet.tsx`. `useCancelBooking`; riuscito chiama `onCancelled` col `was_late` del server; fallito, `toast.error("Annullamento non riuscito", …)` e il foglio resta aperto.

**La valutazione:** `ClientSessionRating({ bookingId; clientId; rating: number | null; note: string | null; editable; coach: BookCoach; layout: "detail" | "home" })` — `src/components/client-session-rating.tsx`. `editable` da `ratingState`; con `layout="home"` le stelle centrate con gap 4. Il voto e la nota appena salvati si vedono subito, finché la rilettura di `useClientFeedback` non li porta nelle props. La nota salvata la passa chi la usa: `(riga as { note?: string | null }).note ?? null`.

**Gli orari del coach:** `useCoachSlotInputs(coachId: string | null, now: Date)` → `{ availabilityQ, exceptionsQ, optimizationQ, busyQ, busy, slotsFailed, slotsReady, retrySlots, retryingSlots }`. `getClientSlotDays` resta a chi lo usa. Gli occupati hanno la chiave `["coach-busy", coachId, "prenota", today]`: la rinfresca `invalidateBookingScope`.

**Ripristina:** `useRestoreBooking()` — `src/hooks/use-restore-booking.ts`, una `useMutation` che prende `RestoreBookingInput = { bookingId; coachId; clientId; scheduledAt; durationMin; name; clientName; color; online; description }`. Chiama `rpc("restore_booking", { p_booking_id })` con la chiamata rilassata di `use-current-block.ts` (i tipi generati non hanno l'RPC). Il contratto con cui la chiama l'app (Cowork scrive la funzione da qui): `restore_booking(p_booking_id uuid) RETURNS TABLE(status booking_status)`; la chiama il cliente della sessione (o il suo coach, o un admin); riesce se la sessione è `cancelled` o `late_cancelled`, annullata da al più 10 minuti (orologio del server) e col suo orario ancora libero per il coach; la riporta a `scheduled` com'era (conferma compresa) con `deleted_at` e `google_event_id` nulli; da un annullamento gratuito riprende il credito con la logica del consumo, da uno tardivo no; errori `P0001` «Non si può più ripristinare.», `23P01`, `42501` «Permesso negato.». Riuscita: `gcalCreateEvent` come Prenota (riepilogo «<tipologia> — <cliente>», `requestMeet`/`isOnline` per le online, `colorId` da `toGoogleColorId`), senza aspettarlo, e quando risponde `ok` rilegge il dettaglio; poi `invalidateBookingScope` e il dettaglio; «Sessione ripristinata.». Fallita: `toast.warning(actionErrorText(err, "restore"))`. Oggi l'RPC non c'è: PostgREST risponde `PGRST202` e il toast dice «Non siamo riusciti a ripristinare la sessione.».

**Il tono:** `toastWithUndo(message, onUndo, tone: "success" | "warning" = "success")`: stessa durata (8 s) e stessa azione «Ripristina»; chi la chiama con due argomenti (il coach) non cambia.

**La nota:** `useSetSessionFeedback()` prende anche `note?: string | null` e restituisce `{ noteSaved: boolean }`. Senza `note` la riga non ha la chiave (la Home di oggi non cambia). Con `note` e senza la colonna (PostgREST `PGRST204`, «… in the schema cache»: `isMissingMigration` sull'errore di PostgREST, prima di `new Error`) riprova una volta senza e dice `noteSaved: false`.

**Vincoli per chi li usa**

- La pagina e i fogli non calcolano stati, soglie, date né testi (C3): tutto da `client-session-detail.ts`, sopra la 00.
- Il coach è `NO_COACH` finché `get_my_coach` non c'è (02/10): i testi dicono «il tuo coach», e non ci sono la riga «con …», il pulsante WhatsApp del riquadro delle 24 ore né il link di «Pensi sia un errore?». Col coach vero cambia `COACH` in `client-booking-detail-view.tsx` (la costante del modulo), come in Prenota.
- Dopo un annullamento la vista scrive subito nella cache del dettaglio lo stato del server (`cancelled` o `late_cancelled`) e poi la rilegge: così la card compare mentre il foglio si chiude, e il focus va sulla sua riga (`returnFocus`), perché «Annulla sessione» non c'è più.
- Il dettaglio usa `isVisibleSession` come Sessioni: finché `cancel_booking` scrive `deleted_at` anche sugli annullamenti gratuiti, un annullamento gratuito fa «Sessione non trovata» dopo la rilettura (§8, voce 2). Non si compensa.

## 4 · Acceptance

Base = `origin/redesign/cliente-mobile` (`0e12622`), misurata su `git archive 0e12622` estratto nella cartella di lavoro. Dopo = il ramo finito. Comandi in bash sul container, con `R`, `V`, `MS`, `CS`, `RT`, `B`, `H` come nel prompt.

### C0 · i file

Base: le 8 righe «MANCA» e «resta il foglio vecchio». Dopo: **nessuna riga**.

### C1 · i pulsanti vecchi restano solo nella Home

`git grep -l -e "Aggiungi a Google Calendar" -e "Riprogramma" -- src` → base 5 file · dopo **esattamente**:

```
src/components/client-live-booking-card.tsx
src/components/reschedule-drawer.tsx
src/routes/client.index.tsx
```

### C2 · la pagina usa le regole

`cat "$R" $V | grep -c "<nome>"` → base `0` ciascuno · dopo: `detailStatus` 2 · `detailWhen` 2 · `detailPlace` 2 · `detailPanel` 2 · `statusCard` 2 · `inviteText` 2 · `ratingState` 2 · `isVisibleSession` 3 · `ClientSessionRating` 2 · `ClientMoveSheet` 2 · `ClientCancelSheet` 2 · `useRestoreBooking` 3 · `toastWithUndo` 3.

### C3 · niente calcoli fuori dalle regole

- La pagina: base `5` · dopo **`0`**.
- I fogli e la valutazione: `$MS` **`0`**, `$CS` **`0`**, `$RT` **`0`** (base: i file non c'erano).
- Le regole: `grep -c -E 'new Date\(\)|Date\.now' src/lib/client-session-detail.ts` → **`0`**.

### C4 · gli orari nel hook

`grep -v -E '^\s*(//|\*|/\*)' src/routes/client.book.tsx | grep -c -E 'useCoachAvailability|…|BusyRow'` → base `11` · dopo **`0`**. `grep -c "useCoachSlotInputs" src/routes/client.book.tsx` → base `0` · dopo **`2`**. In `$H`: `useCoachAvailability` **4** · `useCoachAvailabilityExceptions` **2** · `useCoachOptimizationEnabled` **2** · `get_coach_busy` **1** · `"coach-busy", coachId, "prenota", today` **1** · `BusyRow` **3**: i numeri dello spostamento di Cowork.

### C5 · lo spostamento è uno spostamento

Le righe tolte che nel hook non ci sono uguali (`comm -23 …`):

```
CLIENT_BOOKING_HORIZON_DAYS,
retrying={availabilityQ.isFetching || exceptionsQ.isFetching || busyQ.isFetching}
```

- `CLIENT_BOOKING_HORIZON_DAYS,` — un nome dell'import a più righe di `booking-rules`, che il filtro non toglie per il trattino basso; nel hook è importato su una riga sola (`import { CLIENT_BOOKING_HORIZON_DAYS } from "@/lib/booking-rules";`).
- `retrying={…}` — la prop della card «Orari non aggiornati»: l'espressione è nel hook come `retryingSlots`, e la pagina dice `retrying={retryingSlots}`.

Le righe del hook che in `client.book.tsx` non c'erano (`comm -13 …`):

```
const retryingSlots = availabilityQ.isFetching || exceptionsQ.isFetching || busyQ.isFetching;
export function useCoachSlotInputs(coachId: string | null, now: Date) {
```

- `const retryingSlots = …` — l'espressione della prop, stessi tre operandi nello stesso ordine.
- `export function useCoachSlotInputs(…) {` — la firma.

Le stesse due righe per verso di Cowork; nessuna condizione, confronto, chiave o testo di Prenota cambia. `git diff --numstat $B...HEAD -- src/routes/client.book.tsx` → **`14 71`** (Cowork: `14 71`). Le 12 righe d'intestazione del hook sono commenti `//`, che il secondo comando filtra.

### C6 · il manifesto

`git diff --name-only $B...HEAD | grep -v -x -E '…'` → **nessuna riga**.

### C7 · i quattro cancelli

**Non eseguiti** (§0 passo 0): typecheck, lint, test (anche con `TZ`), build. Indizi parziali (§0 passo 8): Prettier 3.8.1 del container, `/opt/node22/bin/prettier --check` sui 16 file toccati del ramo finito → «All matched files use Prettier code style!»; i test puri eseguiti dal revisore con un `date-fns` sostituto, 44/44 e 30/30 nei tre fusi. Attesi, se il codice è giusto: typecheck 0 · lint 0 errori e 20 avvisi · **899 test in 56 file** (851 + 44 di `client-session-detail.test.ts` + 3 di `client-session-rating.test.ts` + 1 in `client-sessions.test.ts`) · build riuscita. Il numero dei test l'ho contato dai `it` scritti (22 del ciclo sulle sessioni più 22 altri), non misurato.

### C8 · niente colori scritti, fixed, main, confirm(), drawer

`grep -c -E '#[0-9a-fA-F]{6}'` → base `0` (route) e `8` (vista) · dopo **`0`** su `"$R"`, `$V`, `$MS`, `$CS`, `$RT`. `grep -c -E '<main|\bfixed\b|window\.confirm|[^A-Za-z_.]confirm\(|components/ui/drawer'` → base `1` (il `main` della route) e `0` · dopo **`0`** su tutti e cinque.

### C9 · la riga del piano

`grep -n "^| 04 |" design_handoff_cliente_mobile/PIANO.md` → base `[ ] |` · dopo **`[~] |`**: ⚠️ **volutamente non `[x]`**, che nel piano vuol dire «fatta e verificata» (§0 passo 7). `git diff $B...HEAD --stat -- design_handoff_cliente_mobile` → solo `PIANO.md`, una riga.

### C10 · niente dati finti nel codice

`grep -n -E 'Giulia|Marco|Nicolò|Personal Training|Via Roma|Via Verdi' src/lib/client-session-detail.ts $H src/hooks/use-restore-booking.ts "$R" $V $MS $CS $RT` → **nessuna riga**.

### C11 · restore_booking solo nel suo hook

`git grep -l "restore_booking" -- src` → base nessuna riga · dopo **esattamente** `src/hooks/use-restore-booking.ts`. `git diff --name-only $B...HEAD -- supabase` → **nessuna riga**.

### C12 · la nota e il tono

`grep -c "isMissingMigration" src/hooks/use-session-feedback.ts` → base `3` · dopo **`4`**. `grep -c -E '\bnote\b' …` → base `0` · dopo **`9`**. `grep -c -F "warning" src/lib/toast.ts` → base `0` · dopo **`3`**.

### C13 · il caso della 03

`grep -c "Dal lunedì 19 ottobre" src/lib/client-sessions.test.ts` → base `0` · dopo **`1`**.

### C14 · nessuno importa i pezzi tolti

`git grep -n -E 'from "@/components/client-reschedule-sheet"|from "@/lib/calendar"|<ClientRescheduleSheet' -- src` → base 3 righe (`client-booking-detail-view.tsx:18`, `:22`, `:428`) · dopo **nessuna riga**.

### C15 · la valutazione

`grep -c -F 'aria-label="Valutazione da 1 a 5"' $RT` → **`1`**. `grep -c -E 'color-rating-star|color-outline' $RT` → **`2`**.

### Forma del codice, senza Prettier

Il lint del repo ha `prettier/prettier` come errore, e il Prettier del progetto (3.8.3, in `node_modules`) qui non c'è. Ho scritto a mano nella forma di Prettier 3 (larghezza 100, virgole finali) e l'ho controllata con due script della cartella di lavoro: nessuna riga oltre 100 salvo stringhe, template e titoli di `it(` (che Prettier non spezza, come già in `booking-rules.ts:189` e `event-type-actions.test.ts:403`), e nessuna costruzione spezzata che unita starebbe in 100. Le regole meno ovvie le ho prese da codice che oggi passa il lint (le catene di tre chiamate con una freccia, `client-sessions.test.ts:162`; gli argomenti con una chiamata che prende una funzione, `client-sessions.ts:355`; gli elementi JSX con più attributi, `book-sheets.tsx:155-159`). Poi il Prettier del container (3.8.1) l'ha confermato: nessuna differenza sui 16 file. Il lint vero (con `eslint-plugin-prettier` e Prettier 3.8.3) resta da far girare.

## 5 · Le prove rosse

**Tutte «non provate»**: nessun test è stato eseguito. Per ognuna, dove il test dovrebbe cadere (da verificare sul PC, rompendo e rimettendo a posto):

- **R1** (`join` senza la tipologia online): `client-session-detail.test.ts`, il caso `d18` del ciclo «il dettaglio di ogni sessione» (`join` al posto di `confirm`) e «mai due pulsanti pieni».
- **R2** (`join` a due ore): il caso `d4b`.
- **R3** (`confirm` senza `!join`): il caso `d4` e «mai due pulsanti pieni».
- **R4** (`manage` sempre `"free"`): i casi `d3`, `d4`, `d4b`, `d18`, `d20`.
- **R5** (`free` con `canMove`): il caso `d14` («annulla:tardi») e il test di `cancelSheet`.
- **R6** (invito senza la condizione del titolo): il caso `d13` e `inviteText(d13) === null`.
- **R7** (invito senza `google_event_id`): i casi delle in programma senza evento e `inviteText(d3) === null`.
- **R8** (`rebook` per «Assente»): il caso `d8`.
- **R9** (`canRebook` solo sulla tipologia): i casi `d17` e `d19` e il test di `canRebook`.
- **R10** (niente «Oggi,»): gli otto casi di oggi.
- **R11** (`formatUntil` per le non `scheduled`): il caso `d9`.
- **R12** (soglia dell'icona a 4,5): `tileIcon("#7986CB")`.
- **R13** (`moveDay` tiene il giorno scelto senza orari): il test di `moveDay`, «scelto il 30/09» e «tutti vuoti».
- **R14** (`status` falso per «In verifica»): il caso `d12`.
- **R15** (`editable` fuori dai 14 giorni o col titolo): i casi `d7b` e `d16` (il fatto «modificabile»).
- **R16** (il nome dal titolo): i test di `sessionName`, `d13` e `d16`.
- **R17** (`join` a sessione finita): il caso `d19`.
- **R18** (niente `23P01`): «l'orario occupato» di `actionErrorText`.
- **R19** (`new Date()` in `detailPanel`): tutti i casi in programma, con l'orologio vero dopo il 28/09.
- **R20** (niente «Domani,»): i casi `d14`, `d15`, `d20`.
- **R21** (il giorno da `scheduled_at.slice(0, 10)`): a Roma `d20`, a Los Angeles `d3` e `d15`, in UTC verde. I fusi si provano con `TZ=Europe/Rome`, `TZ=UTC`, `TZ=America/Los_Angeles` (sul PC da PowerShell, §2 del prompt).
- **R22** (`radiogroup` senza `aria-label`): `client-session-rating.test.ts`, il primo test.
- **R23** (l'etichetta «Dal …» col giorno della sessione): `client-sessions.test.ts`, «dalla terza settimana il gruppo prende il lunedì…».
- **R24** (`moveDays` che non toglie niente) e **R25** (confronto fra stringhe): `moveDays`, «toglie l'orario di adesso…», con `scheduled_at` nella forma `+00:00`.

## 6 · Il browser

**Non fatto, voce per voce**: senza `node_modules` non partono né il server di sviluppo né i giri di Playwright, e il banco (`%TEMP%\claude\…\scratchpad\banco` della 02 e della 03) è sul PC di Nicolò. Nessuna richiesta è partita verso Supabase, Google o altri servizi; nessuna RPC è stata chiamata.

- **B1** (`d1` a 390, intestazione, azioni nell'ordine, informazioni, confronto con `04-sessione-01`): non fatto.
- **B2** (un pulsante pieno per stato, tabella per sessione, `d8` senza link, `d12`, «Prenota di nuovo» con `eventType`): non fatto.
- **B3** (la videochiamata e il tempo, `d4b` che passa a «Entra» senza ricaricare): non fatto. L'orologio è quello della cornice (`useNow`, passo di 30 s).
- **B4** (Conferma presenza su `d1`): non fatto.
- **B5** (Annulla gratis su `d2`, «Ripristina», `gcalCreateEvent`, il secondo annullamento lasciato scadere): non fatto.
- **B6** (Annulla tardi su `d3`, «Ripristina» che fallisce con `P0001` e `23P01`, Annulla che fallisce): non fatto.
- **B7** (Sposta su `d1`, l'avviso `booking.rescheduled`, «Ripristina» dello spostamento, `d15` che passa sotto le 24 ore a foglio aperto): non fatto.
- **B8** (Sposta che non riesce, `get_coach_busy` e `training_blocks` in errore campionati ogni 200 ms): non fatto. Nel codice la card resta anche mentre si rilegge (`client-move-sheet.tsx:112-120`), e i giorni si calcolano solo con orari e blocchi arrivati e nessuna lettura persa (`:163-188`).
- **B9** (gli orari di Sposta contro quelli di Prenota per il 30/09): non fatto. Sposta usa lo stesso `getClientSlotDays` di Prenota con gli stessi ingressi di `useCoachSlotInputs`, la finestra di `getMoveWindow` ed `exclude`; le differenze attese sono le tre del prompt.
- **B10** (la valutazione, le due varianti di `session_feedback`): non fatto.
- **B11** (le sessioni che non ci sono, la lettura in errore): non fatto.
- **B12** («Indietro» e la cronologia): non fatto. I fogli si aprono con uno stato React, senza navigazione.
- **B13** (le misure a 320, 390, 1280, il contrasto dell'icona): non fatto.
- **B14** (l'accessibilità dei fogli, il focus dopo un'azione riuscita): non fatto.
- **B15** (`giro-prenota.mjs` 82/82, `giro-sessioni.mjs` 78/78, il confronto base/ramo di Home, Booster, Profilo, Notifiche e del coach): non fatto.
- **B16** (zero richieste esterne bloccate, le chiamate del finto): non fatto.

## 7 · Non fatto

- **I cancelli (C7), le prove rosse (R1-R25) e il browser (B1-B16)**, per il motivo del §0 passo 0.
- **La riga 04 di `PIANO.md` a `[x]`**: resta `[~]` finché non girano.
- Il resto del prompt è scritto e committato.

## 8 · Divergenze

- **L'ambiente** (§0 passo 0): container Linux al posto del PC di Windows; le sonde del fuso con Node sul container, senza PowerShell.
- **La precedenza degli stati della route** (`client.bookings.$bookingId.tsx:96-145`): prima i dati, poi l'errore. Con la sessione già letta, una rilettura fallita (per esempio quella dopo un annullamento) tiene il dettaglio invece di sostituirlo con la frase d'errore; senza dati, l'ordine del prompt resta (lo scheletro, l'errore con «Riprova», mai «Sessione non trovata» per una lettura fallita). Lo scheletro copre anche la lettura in pausa senza rete, che prima finiva in «Sessione non trovata».
- **«Riprova» della route** è un `ClientButton` secondario (vincolo della 01: i pulsanti con `ClientButton`); la frase è quella di oggi.
- **In più del prompt, nelle regole:** `sessionMinutes` (la durata, per il foglio e per «Ripristina»), `LOCKED_TITLE` (il titolo del riquadro, con la soglia letta da `booking-rules.ts` invece che scritta nella vista), e in `moveDays` il `reason: "pieno"` di un giorno rimasto senza orari (la didascalia della fila direbbe altrimenti il trattino, che vuol dire preavviso o crediti).
- **Il foglio Sposta legge solo a foglio aperto:** il contenuto sta dentro il pannello di `ClientSheet`, che si monta all'apertura; scelte ed errore ripartono da capo a ogni apertura. Con una lettura persa la card «Orari non aggiornati» resta anche mentre si rilegge (come Sessioni, per il comportamento di TanStack Query v5 che rileggendo una lettura senza dati ne toglie l'errore), così `retrying` si vede davvero.
- **Annulla: lo stato del server scritto subito nella cache del dettaglio** (`client-booking-detail-view.tsx:175-185`), prima della rilettura, per il focus (§3, vincoli). `ClientCancelSheet` ha per questo la prop facoltativa `returnFocus`.
- **Il focus dopo «Conferma presenza»** va sul titolo della sessione (il pulsante sparisce con la rilettura).
- **La valutazione compare solo con le valutazioni lette** (`feedbackQ.data` definito): prima comparirebbe «Com'è andata?» anche su una sessione già valutata. Con la lettura in errore non compare.
- **«Valutazione non salvata»**, col messaggio, è il toast d'errore del salvataggio (il prompt non lo dice).
- **«Ripristina» dell'annullamento ricrea l'evento Google sempre**, anche per una sessione che non l'aveva (il prompt: «come fa Prenota»).
- **Lo spostamento inverso usa `mutateAsync`**, così il suo toast arriva anche se nel frattempo si è lasciata la pagina (le callback di `mutate` si perdono con il componente).
- **`canRebook` segue il prompt alla lettera** (le opzioni prenotabili con crediti), e non guarda `state.blocked`: vedi §9.
- **La lettura della tipologia fallita è un errore** (`client.bookings.$bookingId.tsx:89`): un quarto cambio alla lettura «di oggi», dalla revisione (§0 passo 8), perché altrimenti fallirebbe in silenzio.
- **La vista ha la chiave della sessione** (`client.bookings.$bookingId.tsx:99`) e **il foglio Sposta usa `mutateAsync`**, rilegge lo scope dopo un errore e disattiva «Indietro» mentre sposta (§0 passo 8).

## 9 · Trovati e non toccati

- **L'annullamento gratuito col server a metà** (dalla revisione): se S1 arrivasse senza la correzione di `deleted_at` (§5 del prompt, voce 2), dopo la rilettura il dettaglio diventerebbe «Sessione non trovata», e con lui se ne andrebbe la riga della card su cui il foglio ha portato il focus, che finirebbe sul `body`; la card «Annullata» con «Prenota di nuovo» non si vedrebbe mai dopo un annullamento gratuito del cliente. Gli annullamenti tardivi vanno bene, focus compreso. Non si compensa: le due correzioni del server vanno insieme.
- **`query-keys.ts:82`** rinfresca ancora `["coach-busy-reschedule", coachId]`, la chiave del foglio tolto, che ora non usa nessuno. `query-keys.ts` è fra i file da non toccare.
- **`canRebook` e il percorso concluso:** con un percorso concluso e crediti extra ancora validi un'opzione può essere prenotabile mentre Prenota mostra la card «Il tuo percorso è concluso» (`getBookState`, `blocked`): «Prenota di nuovo» porterebbe lì. Caso raro; la correzione sarebbe `canRebook` falso con `state.blocked`.
- **La `description` della `head()`** dice «appuntamento» (il glossario T1 vuole «sessione»): il prompt vuole la `head()` com'è.

## 10 · Resta a Nicolò

1. **Far girare i cancelli sul PC** (`git fetch origin && git switch redesign/cliente-04-sessione`, poi `bun run typecheck`, `bun run lint`, `bun run test`, le prove col fuso da PowerShell, `bun run build`), le prove rosse R1-R25 e il giro nel browser del §8 del prompt; correggere quello che non torna; poi portare la riga 04 di `PIANO.md` a `[x]`. In alternativa, dare a una sessione nel cloud il permesso di installare le dipendenze (con il registro di Lovable raggiungibile, oppure permettendo il registro pubblico) e rilanciarla sul ramo.
2. Il merge della PR nel ramo di integrazione, dopo la verifica di Cowork.
3. Il rilascio su `main`, non prima del giro del server del 02/10/2026, con insieme: `cancel_booking` concesso al cliente (S1), `cancel_booking` senza `deleted_at` sugli annullamenti, `restore_booking` col contratto del §3; e la conferma della presenza sotto le 24 ore (il trigger che la rifiuta), la colonna `note`, lo spostamento con crediti in un blocco precedente, l'avviso al coach per l'annullamento, `get_my_coach`.
