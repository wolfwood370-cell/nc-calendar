**Dove ho girato (ultimo ritorno · lato cliente · passata 06 · Booster):** **nel cloud, non sul PC.** Container Linux: `pwd` = `/home/user/nc-calendar`, `uname -s` = `Linux`, `$OS` vuoto, `node_modules` assente (`deps-assenti`), `deno --version` → `deno-assente`; ci sono bun 1.3.14, node 22.22.0 e, globali, `prettier` 3.8.1 e `tsc` 6.0.2. Come chiede il §2 non ho installato niente, né nel repo né fuori. **Cancelli, prove rosse e browser ufficiali: non eseguiti: sessione nel cloud** (li rifà Cowork alla verifica); la riga 06 di `PIANO.md` è a `[~]`. Al loro posto, dichiarate per quello che sono, verifiche nello scratchpad con gli strumenti già presenti (§5, §6).

> **In breve.** La regola dei Booster è una sola, in `supabase/functions/_shared/booster-validity.ts`, e la usano lo Store, `canBuyBooster` e `booster-checkout`: vale fino alla fine del blocco in corso, o 30 giorni dopo se mancano meno di 7 giorni e il percorso continua; la scadenza è l'ultimo istante del giorno a Roma. Compra solo chi ha un blocco in corso oggi (fra le persone cambia solo Nina). Lo Store è riscritto sopra `src/lib/client-store.ts` (puro): prodotti da `booster_packs`, validità, acquisti del blocco, riepilogo, ritorno da Stripe con l'attesa del webhook, errori per persone. Il pagamento decide con la regola condivisa e torna allo Store; il webhook avvisa il coach (`booster.purchased`), e la campanella apre il profilo del cliente. Le due card vecchie sono tolte. **Nel cloud** i cancelli non girano (niente `node_modules`): nello scratchpad, senza installare niente, `bun test` con una sostituta di `date-fns` scritta a mano e calibrata sulla base (266 test della base verdi nei tre fusi) dà **1132 test in 61 file, gli stessi 9 rossi d'ambiente della base** (965 in 59), le **59 prove rosse R1-R59 tutte rosse nei tre fusi e poi verdi**, e una prova di fumo delle due funzioni di Stripe con Stripe e Supabase finti (18 su 18; sulla base 15 su 18 cadono). Prettier passa su tutti i file toccati; un typecheck parziale con `tsc` e dichiarazioni minime dei pacchetti assenti non trova errori nei file nuovi; `bun build` compila le due funzioni. I due semi di Cowork sono sul PC: li ho ricostruiti dal prompt (§9). Un revisore in sola lettura (un agente) ha trovato 5 difetti e 4 note: 4 difetti corretti in `89c24ad` (il più serio: «Prenota ora» lasciava l'esito di Stripe nella cronologia); il quinto, **comprare l'ultimo giorno di un percorso che finisce**, chiede di cambiare la regola di chi compra e resta a Nicolò (§10, §11). Workflow: 0; agenti: 1 (il revisore).

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ⚠️ **Dove giri, la base e il ramo** (§2). Nessun commit.
   - Ambiente: la riga in testa (cloud).
   - `git fetch origin`; `git merge-base --is-ancestor ac44ec2 origin/redesign/cliente-mobile && echo 05-presente` → `05-presente`.
   - `origin/redesign/cliente-mobile` = `a9bf1de` (albero `845498f`), come atteso. `redesign/cliente-06-booster` creato con `git switch --no-track -c redesign/cliente-06-booster origin/redesign/cliente-mobile` (il clone era su `main` @ `14c09e9`, pulito).
   - `git diff --stat b780645 origin/redesign/cliente-mobile -- package.json bun.lock` → vuoto.
   - ⚠️ I quattro cancelli della base: non eseguiti: sessione nel cloud.
   - Le sonde del fuso, con node (`node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"`): `TZ=UTC` → `0`; `TZ=America/Los_Angeles` → `420`; `TZ=Europe/Rome` → `-120`; senza `TZ` → `0` (il container è in UTC).
   - `deno --version` → `deno-assente`.
   - ⚠️ Lo script dei controlli di Cowork è sul PC: ho riscritto i controlli del §6 (salvo C7 e C12) in `scratchpad/controlli.sh`; sulla base riproduce **tutta** la colonna «oggi» del §6 (§5 qui sotto).
1. ☑ **La regola condivisa** (§4.1). `ab18476`. 45 test, verdi a Roma, in UTC e a Los Angeles (banco); R1-R18 cadono sui casi del file.
2. ☑ **Chi compra, nell'app** (§4.2). `a850a20`. C4: `client-book.ts` a +7 −9. Tre casi nuovi in `client-book.test.ts` (44 test, erano 41); le due righe di Nina in `client-home.test.ts`. R19, R20 e la regola di oggi cadono (solo Nina fra le persone, più i casi nuovi).
3. ⚠️ **Le regole dello Store** (§4.3) e i dati dei test (§4.9). `5e2e9d2`. 112 test in `client-store.test.ts`, verdi nei tre fusi al primo giro; R1-R57 cadono anche sulle persone. ⚠️ I due semi sono ricostruiti, non copiati (§9).
4. ☑ **Le letture** (§4.4). `2a63ec8`.
5. ☑ **La pagina** (§4.5). `ffdf69c`. C0-C3, C8, C14 e C10 (pagina e regole) come attesi.
6. ☑ **Il pagamento** (§4.6). `01a8fd7`. C5, C11, C12 come attesi; prova di fumo nel banco.
7. ☑ **L'avviso al coach** (§4.7). `ac242ee`. C12, C13 come attesi; R58, R59 cadono.
8. ⚠️ **Il browser** (§8). Non eseguito: sessione nel cloud (senza `node_modules` il server di sviluppo non parte). La lacuna voce per voce al §7.
9. ⚠️ **Chiusura** (§10). I controlli del §6 tutti insieme (§5, rilanciati dopo le correzioni della revisione: stessi valori); `debf56f` «Spunta la passata 06 in PIANO.md» (la riga a `[~]`, cloud); questo file in `e57885e` «Riscrive docs/ULTIMO-RITORNO.md per la passata 06 del lato cliente» e, aggiornato con la revisione, nel commit «Aggiorna docs/ULTIMO-RITORNO.md con la revisione della passata 06» (il suo hash, quello finale del ramo, è nella risposta finale); push; la PR verso `redesign/cliente-mobile` è nella risposta finale. ⚠️ Due commit del ritorno invece di uno: il controllo di fine turno della sessione vuole l'albero pulito e pubblicato, e la revisione è arrivata dopo.
10. ☑ **Passo aggiunto: la revisione e le sue correzioni.** `dde7076` e `89c24ad`. Un revisore in sola lettura (un agente, circa 20 minuti, in background mentre scrivevo questo file) sul diff fino a `e57885e`. Prima del suo esito, rileggendo la pagina, `dde7076`: i giri dell'attesa ripartono da zero a ogni ritorno da Stripe. Il revisore: 5 difetti e 4 note, verificati uno per uno sul codice e sui sorgenti delle librerie.
    - Corretti in `89c24ad` «Store: le correzioni della revisione» (`src/routes/client.store.tsx`):
      - **«Prenota ora» lasciava l'esito nella cronologia** (medio): il link fa il suo `push` nello stesso giro del `replace` di `closeDone`, e `@tanstack/history` 1.162.1 li unisce in un solo `pushState` dell'ultimo indirizzo (`queueHistoryAction`, `next = [href, state, next?.[2] || isPush]`): con Indietro da Prenota tornava `/client/store?booster=success…` e il foglio «Pagamento completato» si riapriva. Adesso `router.history.flush()` scrive il `replace` prima del `push` (verificato nei sorgenti: `navigate` mette in coda la scrittura prima di ogni `await`, e senza blocchi `replace` la mette subito);
      - **il riepilogo rimasto vuoto si riapriva da solo** (basso): `summaryOpen` restava vero se il riepilogo spariva per un altro motivo (il pacchetto non c'è più, lo stato si rilegge); si chiude, come in Prenota (`client.book.tsx:317-320`);
      - **l'attesa del webhook con la rete lenta** (basso): `refetch()` annulla la lettura in corso quando ci sono già dati (`cancelRefetch` vero, query-core 5.100.1); con risposte oltre i 2 secondi nessuna arrivava. Ora `refetch({ cancelRefetch: false })`;
      - **«Paga» bloccato tornando da Stripe** (basso, solo se il browser rimette la pagina dalla cache avanti e indietro): si libera su `pageshow` con `persisted`;
      - (nota) validità, blocco, riepilogo ed esito calcolati una volta per stato (`useMemo`), invece di rifare `getBookState` a ogni disegno.
    - **Non corretto, a Nicolò:** comprare l'ultimo giorno di un percorso che finisce (§10). Le altre tre note sono al §10.
    - Dopo le correzioni: Prettier, typecheck parziale, banco (le suite e le R) e i controlli del §6 rilanciati, stessi esiti.
    - ⚠️ Per leggere il comportamento delle librerie il revisore ha scaricato da registry.npmjs.org, nello scratchpad (fuori dal repo), i sorgenti di `@tanstack/history` 1.162.1, `@tanstack/router-core` 1.171.23, `@tanstack/react-router` 1.170.28 e `@tanstack/query-core` 5.100.1, le versioni del lock. Non gliel'avevo chiesto (gli avevo detto di non installare niente): nel repo non è cambiato niente, ma lo dichiaro.

## 2 · RAMO E COMMIT

- **`redesign/cliente-06-booster`**, da `origin/redesign/cliente-mobile` @ `a9bf1de`. Commit, in ordine:
  1. `ab18476` Booster: la validità e chi compra in un file solo, per lo Store e per il pagamento;
  2. `a850a20` Booster: compra solo chi ha un blocco in corso;
  3. `5e2e9d2` Store: prodotti, validità, riepilogo, acquisti ed esito del pagamento in un file solo;
  4. `2a63ec8` Store: le letture dei pacchetti e degli acquisti;
  5. `ffdf69c` Store: la pagina nuova, dal brief della 06; via le card vecchie;
  6. `01a8fd7` Pagamento dei Booster: la regola dello Store, il ritorno allo Store e il titolo del pacchetto;
  7. `ac242ee` Coach: la notifica dell'acquisto di un Booster, che apre il profilo del cliente;
  8. `dde7076` Store: l'attesa del webhook riparte da zero a ogni ritorno da Stripe (passo 10);
  9. `debf56f` Spunta la passata 06 in PIANO.md;
  10. `e57885e` Riscrive docs/ULTIMO-RITORNO.md per la passata 06 del lato cliente;
  11. `89c24ad` Store: le correzioni della revisione (passo 10);
  12. il commit di questo file aggiornato («Aggiorna docs/ULTIMO-RITORNO.md con la revisione della passata 06»): il suo hash, quello finale del ramo, è nella risposta finale.
- Ogni commit compila per quello che si può misurare qui: Prettier e il typecheck parziale sui file del commit; il typecheck vero non gira nel cloud.
- **PR** verso `redesign/cliente-mobile`, aperta e non unita, con questo file come descrizione: il numero è nella risposta finale (un file non contiene il numero della PR che lo descrive).

## 3 · MANIFESTO

- **NUOVI:** `supabase/functions/_shared/booster-validity.ts`; `src/lib/booster-validity.test.ts` (45 test); `src/lib/client-store.ts`; `src/lib/client-store.test.ts` (112 test); `src/lib/testing/client-home-seed.ts`, `src/lib/testing/client-store-seed.ts` (ricostruiti, §9); `src/components/client-store-cards.tsx`, `src/components/client-store-sheets.tsx`.
- **MODIFICATI:** `src/lib/client-book.ts` (`canBuyBooster` e la sua chiamata); `src/lib/client-book.test.ts` (3 casi); `src/lib/client-home.test.ts` (le due righe di Nina); `src/lib/queries.ts` (`ExtraCreditRow` e `useClientExtraCredits` con le colonne dell'acquisto, `useBoosterPacks`); `src/lib/query-keys.ts` (`shopPacks`); `src/hooks/use-client-book-state.ts` (`extrasQ`, `input`); `src/routes/client.store.tsx` (riscritta); `supabase/functions/booster-checkout/index.ts`; `supabase/functions/stripe-webhook/index.ts`; `src/lib/notifications.ts` e `notifications.test.ts` (7 casi); `src/hooks/use-notifications.ts`; `src/components/trainer-notifications-bell.tsx`; `design_handoff_cliente_mobile/PIANO.md` (la riga 06 a `[~]`); `docs/ULTIMO-RITORNO.md` (questo file).
- **TOLTI** (con `git rm`): `src/components/booster-card.tsx`, `src/components/owned-booster-card.tsx`.
- **NEL PERIMETRO MA NON TOCCATI:** Home e Prenota (`client.index.tsx`, `client.book.tsx`, `client-home-credits.tsx`, `book-sheets.tsx`, `book-blocked-card.tsx`: C15); gli helper del §9 (`client-credits.ts`, `renewal.ts`, `current-block.ts`, `session-time.ts`, `client-home.ts`, `client-sheet.tsx`, `client-button.tsx`, `edge-function-error.ts`, `booking-notifications`); `src/components/ui/aura-progress-ring.tsx` e `--color-cta-dark` (`styles.css:58-59`), coi loro commenti (la 09); `src/lib/testing/memory-calendar-store.ts`; `useActiveShopTitles`; `client-notifications.ts` (la 08); `supabase/migrations/`; `package.json`, `bun.lock`, `vitest.config.ts`, `tsconfig.json`; `src/routeTree.gen.ts`.

## 4 · I PEZZI PER LE PASSATE DOPO (07, 08, 09)

**La regola condivisa** (`supabase/functions/_shared/booster-validity.ts`, senza import: `Date` e `Intl`). La importano `src/lib/client-book.ts`, `src/lib/client-store.ts`, `src/lib/testing/client-store-seed.ts`, i due test (percorso relativo senza estensione) e `supabase/functions/booster-checkout/index.ts` (`../_shared/booster-validity.ts`).
- `BOOSTER_EXTENSION_DAYS = 30`, `BOOSTER_SHORT_BLOCK_DAYS = 7`: solo qui.
- `boosterValidity({ today, blockEnd, continues }: { today: string; blockEnd: string; continues: boolean }): { until: string; extended: boolean }`: giorni `YYYY-MM-DD` contati come date; proroga se `continues` e 0 ≤ giorni alla fine < 7.
- `romeDate(at: Date): string`: il giorno di Roma di un istante.
- `endOfRomeDay(day: string): string`: 23:59:59.999 di quel giorno a Roma, in ISO (ora legale o solare del giorno): è `extra_credits.expires_at`.
- `boosterPackTitle(pack: { title?: string | null; quantity: number; event_type_title: string }): string`.
- `BoosterClient = { path_type: string | null; status: string; pack_label: string | null; auto_renew_blocks?: boolean | null }`, `BoosterBlock = { id; start_date; end_date; status?: string | null; sequence_order: number }`, `BoosterPurchase = { blockId; until; extended; expiresAt }`.
- `boosterPathAllowed(client): boolean` (attivo; fisso senza `pack_label` o abbonamento) e `boosterPurchase(client, blocks, today): BoosterPurchase | null` (la decisione del pagamento: blocchi non annullati per `sequence_order` e, a pari numero, dall'inizio più recente; il primo che contiene oggi; continua se un blocco valido viene dopo o se è un abbonamento col rinnovo).

**Chi compra** (`src/lib/client-book.ts`): `canBuyBooster(client, hasCurrentBlock: boolean)` = `hasCurrentBlock && boosterPathAllowed(client)`; `getBookState` gli passa `reference !== null && blockTiming(reference, now) === "current"`. `BookState.canBuy` lo seguono da soli «Acquista» della Home, il fondo della card dei crediti e la card «Hai usato tutti i crediti» di Prenota.

**Le regole dello Store** (`src/lib/client-store.ts`, puro; il coach è un `BookCoach`):
- `STORE_LOCK_TITLE`; `StoreLockKind = "concluso" | "libero" | "pacchetto" | "altro"`; `StoreLock = { kind; title; text; whatsapp: { label; href } | null }`; `storeLock(client: BookClient, state: Pick<BookState, "reference" | "canBuy">, coach: BookCoach, now: Date): StoreLock | null`.
- `StoreValidity = { blockNumber: number | null; until; extended; expiresAt; text; summary }`; `storeValidity(client: BookClient, state: Pick<BookState, "reference" | "next" | "referenceNumber" | "canBuy">, now: Date): StoreValidity | null`.
- `euro(cents: number): string`.
- `StorePack = { package_type; currency; amount_cents; quantity; event_type_title; active; title?: string | null; description?: string | null }`; `StoreProduct = { key; eventTypeId; typeName; quantity; amountCents; title; description: string | null; meta; price; per; best; highlighted; color: string | null; bookable }`; `storeProducts(packs: readonly StorePack[], eventTypes: readonly PoolEventType[], coach: BookCoach, typeParam: string | null): StoreProduct[]`; `storeEmpty(coach: BookCoach): string`.
- `StorePurchase = PoolExtra & { id; created_at; price_paid: number | null; stripe_payment_id: string | null }`; `StoreBoughtRow = { id; label; meta }`; `storeBought(purchases: readonly StorePurchase[], eventTypes: readonly PoolEventType[], state: Pick<BookState, "reference">): StoreBoughtRow[]`.
- `StoreSummary = { title; price; valid; after; pay }`; `storeSummary(product: StoreProduct, validity: StoreValidity, input: BookStateInput): StoreSummary`.
- `STORE_POLL_MS = 2000`, `STORE_POLL_FOR_MS = 20000`, `STORE_MATCH_WINDOW_MS = 900000`, `STORE_CANCEL_TOAST`, `STORE_FOOTER`, `STORE_DONE_TITLE`; `findPurchase(purchases, session: string | null, typeId: string | null, now: Date): StorePurchase | null`; `StoreDoneAction = { kind: "book"; eventTypeId } | { kind: "whatsapp"; label; href } | { kind: "none" }`; `StoreOutcome = { kind: "waiting"; text } | { kind: "late"; text } | { kind: "arrived"; purchaseId; text; action }`; `storeOutcome({ purchases, session, typeId, elapsedMs, input, coach }): StoreOutcome`.
- `STORE_PAY_ERRORS` (5 frasi), `STORE_PAY_GENERIC`, `storePayError(message: string | null | undefined): string`.
- `StoreSearch = { type?: string; booster?: "success" | "cancel"; session?: string }`, `storeSearch(search: Record<string, unknown>): StoreSearch` (il `validateSearch` di `/client/store`).

**Le letture:** `useBoosterPacks()` (`src/lib/queries.ts`; chiave `queryKeys.shopPacks` = `["booster_packs", "store"]`; `booster_packs` con `select("*")`, `active` vero e `currency` `eur`; `title` e `description` dalla riga, `null` finché le colonne non ci sono; `staleTime` 5 minuti come gli altri dati di configurazione). `ExtraCreditRow` e `useClientExtraCredits` hanno in più `created_at`, `price_paid` (euro), `stripe_payment_id`. `useClientBookState` restituisce in più `extrasQ` e `input` (il `BookStateInput` di `state`, `null` finché `state` è `null`); `state` è `getBookState(input)`, come prima.

**I componenti dello Store:** `StoreLockCard({ lock: StoreLock; titleRef?: Ref<HTMLHeadingElement> })`, `StoreValidityBox({ text })`, `StoreBoughtCard({ rows: readonly StoreBoughtRow[] })`, `StoreProductCard({ product: StoreProduct; onBuy: () => void })`, `StoreEmptyCard({ text })` in `client-store-cards.tsx`; `StoreSummarySheet({ open; onOpenChange; summary: StoreSummary | null; paying: boolean; onPay: () => void; returnFocus })` e `StoreDoneSheet({ open; onOpenChange; outcome: StoreOutcome | null; returnFocus; onBook: () => void })` in `client-store-sheets.tsx`.

**L'avviso al coach:** il payload di `booster.purchased` è `BoosterPurchasedPayload = { client_id; client_name; quantity; session_label; amount?: number; package_type?: string | null }` (`src/hooks/use-notifications.ts`, dove `NotificationType` lo comprende). `NotificationView.kind` ha `"purchase"` e `clientId?: string` solo per quel caso; `isBoosterPurchasedPayload` (in `src/lib/notifications.ts`) vuole `client_id`, `client_name`, `session_label` stringhe e `quantity` intero ≥ 1; `describeNotification` → «Acquisto Booster», «Giulia Bianchi · +3 Sessione PT». La campanella del coach: `Sparkles` e «· Apri il profilo» sul desktop, titolo e testo sul telefono, e il tocco apre `/trainer/clients/$id`.

**Le funzioni di Stripe:**
- `booster-checkout`: dopo il controllo di chi compra per chi legge profilo (`path_type, status, pack_label, auto_renew_blocks`) e blocchi (`training_blocks` non eliminati) e decide con `boosterPurchase(…, romeDate(new Date()))`; senza decisione 400 «Al momento non puoi acquistare Booster: serve un blocco in corso.»; un errore di lettura va nel `catch` (500 generico). Pacchetto con `select("*")`; nome su Stripe `Booster: ${boosterPackTitle(pack)}`; `success_url` `/client/store?booster=success&type=<tipologia>&session={CHECKOUT_SESSION_ID}`, `cancel_url` `/client/store?booster=cancel&type=<tipologia>`; metadati come prima, con `expires_at` = `decision.expiresAt`. Le allocazioni non le legge più.
- `stripe-webhook`: legge anche `profiles.full_name` e `event_types.name`; dopo l'inserimento riuscito di `extra_credits` (non nel doppione) scrive in `notifications` per il coach, in un suo `try`/`catch`: la risposta resta 200.
- **Cosa aspettano dal giro del server (02/10):** le colonne facoltative `booster_packs.title` e `description` (senza, lo Store e Stripe compongono «N crediti <tipologia>»); `validate_booking_extra_credits` che guarda `expires_at`. E la pubblicazione delle due funzioni al rilascio su `main`.

**Vincoli per chi li usa:** il coach è `NO_COACH` finché non c'è `get_my_coach` (una riga, `const COACH = NO_COACH` in `client.store.tsx`); con nome e WhatsApp i testi e i pulsanti compaiono da soli (i test li provano già col coach). La regola dei Booster non si copia: si importa dal file condiviso.

## 5 · ACCEPTANCE

I controlli del §6 li ho riscritti dal prompt in `scratchpad/controlli.sh` (lo script di Cowork è sul PC) e lanciati alla fine, sul ramo a lavoro committato; accanto il valore misurato sulla base al passo 0 con lo stesso script, uguale in tutto alla colonna «oggi» del prompt.

- **C0** · i file nuovi ci sono, i due vecchi no → **nessuna riga** (base: 8 «MANCA» e 2 «RESTA»).
- **C1** · `git grep -n -w -E 'BoosterCard|OwnedBoosterCard|canPurchaseAddons|PACKAGES' -- src | wc -l` → **0** (base 17); `git grep -l -E 'Ricarica crediti|NC Add-on|Acquista Ora|Miglior Valore|Accesso limitato|scadono al termine' -- src ':!*.test.ts'` → **nessun file** (base: `booster-card.tsx`, `client.store.tsx`).
- **C2** · `cat $P $K $F | grep -c -w <nome>` → tutti almeno 1: `storeSearch=2 storeLock=2 storeValidity=2 storeProducts=2 storeBought=2 storeSummary=3 storeOutcome=4 storePayError=2 storeEmpty=2 STORE_FOOTER=2 STORE_CANCEL_TOAST=2 STORE_DONE_TITLE=2 STORE_POLL_MS=3 useClientBookState=3 useBoosterPacks=3 ClientTabHeader=2 ClientSheet=6 ClientButton=16 BookRetryCard=2 parseEdgeError=2 iconForType=2 typeTint=2` (base: 0 ciascuno, `ClientTabHeader` 2).
- **C3** · i calcoli fuori dalle regole in pagina e componenti → **0** (base 2); `new Date()` o `Date.now(` in `$L $V` → **0**.
- **C4** · `blocks.some((b) => b.status === "active")` → **0** (base 1); `boosterPathAllowed` → **3** (l'import, il commento, l'uso; base 0); `git diff --numstat $B...HEAD -- src/lib/client-book.ts` → `7 9`.
- **C5** · `git grep -l 'booster-validity' -- src supabase/functions | grep -v -x "$V"` → **esattamente** `src/lib/booster-validity.test.ts`, `src/lib/client-book.ts`, `src/lib/client-store.test.ts`, `src/lib/client-store.ts`, `src/lib/testing/client-store-seed.ts`, `supabase/functions/booster-checkout/index.ts` (base: nessuno); `block_allocations|valid_until|diffDays|setDate` in `$X` → **0** (base 10); le costanti fuori da `$V` → **0**.
- **C6** · il manifesto → **nessuna riga**.
- **C7** · i cancelli: **non eseguiti: sessione nel cloud.** Al loro posto, nello scratchpad: Prettier 3.8.1 → «All matched files use Prettier code style!» su tutti i file toccati; typecheck parziale (`tsc` 6.0.2 con dichiarazioni minime dei pacchetti assenti) → 0 errori nei file nuovi e cambiati (restano solo errori delle dichiarazioni finte su righe di base: `useAuth`, i callback di Supabase); `bun test` nel banco → ramo **1132 test in 61 file, 1123 verdi**, base 965 in 59 e 956 verdi, gli stessi 9 rossi d'ambiente (§10); i file nuovi e cambiati (`booster-validity`, `client-store`, `client-book`, `client-home`, `notifications`) verdi con `TZ=Europe/Rome`, `TZ=UTC` e `TZ=America/Los_Angeles` (sonde: -120, 0, 420). Attesi da Cowork col repo: 1006 + 167 = **1173 test in 61 file** (45 + 112 + 3 + 7 nuovi), lint 0 errori e 14 avvisi.
- **C8** · per ognuno dei tre file: colori scritti **0**, `<main`/`fixed`/`confirm(`/`drawer` **0** (base, la pagina: 0 e 2).
- **C9** · `grep -n -E "^\| 0[56] \|" design_handoff_cliente_mobile/PIANO.md` → la 05 a `[x] |`, la 06 a **`[~] |`** (cloud); `git diff $B...HEAD --stat -- design_handoff_cliente_mobile` → solo `PIANO.md`, una riga.
- **C10** · i dati del prototipo in pagina, componenti, regole e file condiviso → **nessuna riga**, commenti compresi (base: `client.store.tsx:45`, `:46`, `:53`, `:62`); i nomi scritti a mano in `$X` → **0** (base 1).
- **C11** · `boosterPurchase|romeDate` in `$X` → **2**; l'import con `.ts` → **1**; `client/store?booster=success&type=` → **1**; `{CHECKOUT_SESSION_ID}` → **1**; `client/store?booster=cancel&type=` → **1**; `client?booster=success` → **0** (base 1); la frase nuova → **1**; `boosterPackTitle` → **2** (base 0 ciascuno salvo dove detto).
- **C12** · `deno` assente: `bun build $X --target=bun --external 'npm:*' > /dev/null && echo compila` e lo stesso con `$W` → **compila** e **compila** (sulla base lo stesso). `bun build` controlla sintassi e import, non i tipi.
- **C13** · `"booster.purchased"` in `$W` → **1**; `from("notifications")` → **1**; `new Response(` → **14** (base 14); la riga di `"Failed to insert extra credits"` (**177**) prima di quella di `notifications` (**190**); `booster.purchased` in `notifications.ts` e `use-notifications.ts` → **1** e **1**; nella campanella `Sparkles` → **2**, `Apri il profilo` → **1**, `trainer/clients/$id` → **1** (base 0 ciascuno).
- **C14** · `useQuery` o `.from("` in pagina e componenti → **0** (base 7); `functions.invoke("booster-checkout"` → **1** (base 1).
- **C15** · `git diff --stat $B...HEAD --` sui cinque file di Home e Prenota → **nessuna riga**; `git diff -U0 $B...HEAD -- src/lib/client-home.test.ts | grep -E '^[+-][^+-]'` → **esattamente** le quattro righe di Nina (`canBuy: true` → `canBuy: false`, `footer: [BUY, BUY]` → `footer: [ASK, ASK_COACH]`).
- **C16** · import e simili in `$V` → **0**.

L'uscita intera dello script è in `scratchpad/esiti/controlli-ramo.txt` (base: `controlli-base.txt`).

## 6 · LE PROVE ROSSE

**Ufficiali: non eseguite: sessione nel cloud.** Nel banco dello scratchpad (copia di `src` e di `_shared`, `bun test` con `vitest` mappato su `bun:test`, una sostituta di `date-fns` e una di `lucide-react` scritte a mano; nessuna installazione), con l'harness `scratchpad/mutate.mjs`: per ogni prova il codice rotto nella copia, i test lanciati a Roma, in UTC e a Los Angeles, il file rimesso com'era. **Tutte rosse nei tre fusi**, e verdi dopo il ripristino (le suite intere passano). Cosa ho rotto e cosa cade (i nomi dei test, uguali nei tre fusi):

- **R1** · la proroga con 7 giorni esatti (`left <= 7`): cadono la riga del 05/10 della tabella e Anna.
- **R2** · la proroga anche se il percorso finisce: cadono le due righe «non continua» della tabella, «dopo annullato», «abbonamento senza rinnovo», «fisso col rinnovo acceso», Giorgio e Rita.
- **R3** · senza `left >= 0`: cade la riga del 27/09.
- **R4** · i 30 giorni contati da oggi: cadono le tre righe con la proroga che non finiscono oggi, «dopo con lo stesso numero», «dopo completato», «abbonamento col rinnovo», l'inverno (7 test), Marta e Bruno.
- **R5** · la fine del giorno sempre a +2: cadono le sette attese d'ora solare e del giorno del cambio di `endOfRomeDay`.
- **R6** · la scadenza all'inizio del giorno: cadono tutte le attese di `endOfRomeDay` (10 test con le scadenze del pagamento).
- **R7** · l'«oggi» con `toISOString().slice(0, 10)`: cadono i tre casi alle 22:00 e alle 23:00 UTC.
- **R8** · i blocchi annullati contano: «annullato in corso» e «dopo annullato».
- **R9** · senza il rinnovo automatico: «abbonamento col rinnovo, senza il dopo» e il pagamento di Marta.
- **R10** · il blocco dopo anche annullato: «dopo annullato».
- **R11** · il dopo solo per `sequence_order`: «dopo con lo stesso numero».
- **R12** · `today < end_date`: «finisce oggi», le scadenze e il pagamento di Luca.
- **R13** · il rinnovo anche per il fisso: «fisso col rinnovo acceso».
- **R14** · a pari numero l'ordine d'arrivo: «stesso numero, sovrapposti».
- **R15** · il PT Pack compra: `boosterPathAllowed`, «PT Pack» e Pietro (card, validità, riepiloghi).
- **R16** · l'archiviato compra: `boosterPathAllowed`, «archiviato» e Carlo.
- **R17** · `title` ignorato: `boosterPackTitle` e `PACKS_TITLED`.
- **R18** · sempre «crediti»: `boosterPackTitle` e i riepiloghi delle nove persone che comprano.
- **R19** · `canBuyBooster` con il solo `reference !== null`: i due casi nuovi di `client-book.test.ts`, Davide e Nina nella Home e nello Store.
- **R20** · `canBuyBooster` senza `boosterPathAllowed`: i casi di `canBuyBooster` (PT Pack, libero, archiviato), la variante PT Pack di Giulia, Pietro e Carlo.
- **R21** · il concluso anche per chi deve cominciare: Nina.
- **R22** · il concluso solo senza `pack_label`: Pietro finito.
- **R23** · WhatsApp senza il link: le sei card.
- **R24** · `coachSubject` a metà frase: Elena, Davide, Pietro, Pietro finito e il `meta` del test funzionale.
- **R25** · la validità senza il rinnovo: Marta (validità e pagamento).
- **R26** · il riepilogo della proroga senza «30 giorni dopo la fine»: Marta, Luca, Bruno.
- **R27** · il riquadro della proroga come l'altro: Marta, Luca, Bruno.
- **R28** · il numero dopo l'acquisto senza i crediti comprati: i riepiloghi delle nove persone.
- **R29** · il numero ricalcolando Prenota con la riga nuova: Luca (8 e 8).
- **R30** · sempre «crediti … disponibili»: i riepiloghi con «1 credito … disponibile» (otto persone).
- **R31** · anche i pacchetti in dollari: i prodotti e i riepiloghi (quattro invece di tre).
- **R32** · anche i pacchetti spenti: come R31.
- **R33** · «Più conveniente» a pari prezzo per credito: `PACKS_TIE`.
- **R34** · «Più conveniente» da solo nella tipologia: il test funzionale e `PACKS_TIE`.
- **R35** · il prezzo a sessione anche per un credito: `single`, `triage` e `PACKS_TIE`.
- **R36** · la tipologia di `type` non in testa: l'ordine con `type`.
- **R37** · la descrizione di soli spazi tenuta: `PACKS_TITLED`.
- **R38** · senza « · si prenota con …»: il `meta` del test funzionale, col coach e senza.
- **R39** · sempre i centesimi: `euro`, i prodotti, gli acquisti e i riepiloghi (17 test).
- **R40** · i crediti del coach fra gli acquisti: Giulia (compare il BIA).
- **R41** · gli acquisti dei blocchi prima: Giulia (compare il 10/09).
- **R42** · dal più vecchio: l'ordine di Giulia.
- **R43** · «· 0 €» senza prezzo: l'acquisto di oggi senza prezzo.
- **R44** · l'attesa anche a 20 secondi esatti: i due `late`.
- **R45** · senza `session` non si trova: `findPurchase` per tipologia e «senza sessione ma con la tipologia».
- **R46** · senza `session` anche di 16 minuti fa: il limite di `findPurchase` e `ARRIVED_OLD` senza sessione.
- **R47** · con una `session` diversa, l'acquisto della tipologia: «solo la sua riga» e «con una sessione diversa». In più una variante (la sessione ignorata del tutto): cade anche `ARRIVED_OLD` con la sua sessione.
- **R48** · «Prenota ora» anche per la tipologia del coach: il test funzionale.
- **R49** · «Ora ne hai» con la sola quantità: tutti gli arrivi.
- **R50** · «Ora ne hai» con Prenota di adesso, riga dentro: Luca (8) e la lettura che non ha ancora la riga.
- **R51** · la riga contata due volte: gli arrivi di Giulia (5 e 3) e quello di `zzz`.
- **R52** · senza `trim`: «  Pacchetto non valido.  ».
- **R53** · ogni errore com'è: «Nessun percorso attivo…», «Invalid or missing package_type», «Edge Function returned…».
- **R54** · `type` qualunque: `{ type: "pt" }`.
- **R55** · `session` qualunque: «cs_test_», «cs_test_a1-b2», l'indirizzo.
- **R56** · `booster` qualunque: «SUCCESS» e «ok».
- **R57** · l'id di Stripe col trattino o vuoto: «cs_test_» e «cs_test_a1-b2».
- **R58** · la quantità della campanella anche come testo: `quantitaTesto`.
- **R59** · la quantità non intera: `quantitaMezza`.
- **R60-R62** · non provate: vogliono il browser (§7).

Gli esiti interi, coi conteggi per fuso, sono in `scratchpad/esiti/mut-*.txt`. Oltre alle R, la prova di fumo delle due funzioni (`scratchpad/fn/smoke.test.ts`, Stripe e Supabase finti): sul ramo 18 su 18; sulle funzioni della base cadono 15 casi su 18 (passano solo il pacchetto non valido e l'acquisto per un altro, il doppione, l'inserimento fallito, che non cambiano).

## 7 · IL BROWSER

**Non eseguito: sessione nel cloud.** Il server di sviluppo vuole `node_modules` (assente, e da qui il registro di Lovable risponde 403), quindi né il banco di Cowork né Playwright possono aprire la pagina. B1-B16 e R60-R62 restano a Cowork, voce per voce:

- **B1** · Giulia a 390: non eseguita. Nel codice: `ClientTabHeader` «Booster» col sottotitolo, `StoreValidityBox` (`validity.text`), `StoreBoughtCard` se ci sono righe, una `article` per prodotto nell'ordine di `storeProducts`, «Più conveniente» solo con `best`, `STORE_FOOTER` in fondo; «Acquista» con `aria-describedby` sul titolo della card.
- **B2** · il riepilogo: non eseguita. `StoreSummarySheet` («Riepilogo», titolo e prezzo, `CalendarRange` e `valid`, `Coins` e `after`, «Paga … con Stripe» con `Lock`, «Indietro»); alla chiusura il focus torna a chi l'ha aperto (`ClientSheet`).
- **B3** · Paga: non eseguita. `booster-checkout` con `{ package_type }` e niente `client_id`; mentre aspetta `aria-disabled` e l'indicatore (mai `disabled`), un secondo tocco esce subito (`payingRef`); `window.location.assign` solo per `https://checkout.stripe.com/…`, altrimenti `STORE_PAY_GENERIC`.
- **B4** · gli errori: non eseguita. `parseEdgeError` per le risposte non 2xx, `data.error` per le 2xx, poi `storePayError` (le cinque frasi restano, il resto è il generico); il foglio resta aperto e «Paga» torna attivo.
- **B5** · V12: non eseguita. Con `storeLock` non nullo il foglio si chiude (`open={summaryOpen && !locked}` e l'effetto che rimette `summaryOpen` a falso) e `returnFocus` porta il focus sul titolo della card di chi non compra (`lockTitleRef`).
- **B6** · il ritorno coi crediti che arrivano: non eseguita. Il foglio si apre col caricamento, il testo in `role="status"` `aria-live="polite"`, una rilettura di `extrasQ` e un giro ogni `STORE_POLL_MS` finché l'esito è `waiting`; con `arrived` il riquadro `CircleCheck` e «Prenota ora» verso `/client/book?eventType=…`; alla chiusura l'indirizzo perde `booster` e `session` (`replace`) e tiene `type`; il focus va sull'`h1`. I tempi delle letture: da misurare.
- **B7** · il ritorno in ritardo: non eseguita. Dieci giri (20 secondi), poi `late` e l'intervallo si ferma.
- **B8** · l'annullamento: non eseguita. `toast.info(STORE_CANCEL_TOAST, { id: "booster-cancel" })` una volta (anche col doppio effetto di sviluppo) e `navigate({ replace: true })` senza `booster`.
- **B9** · le altre persone: non eseguita. I testi di Marta, Luca, Sara, Giorgio e Paola sono gli stessi dei test di `client-store.test.ts` (banco verde); `typeTest` con `?type=` del test funzionale: `highlighted` e il bordo del primario.
- **B10** · chi non compra: non eseguita. Solo `StoreLockCard`, senza prodotti; senza il link del coach niente pulsante.
- **B11** · Home e Prenota: non eseguita. Nessun loro file cambia; Nina ha `canBuy` falso (test della Home aggiornati: due righe). `giro05-cowork.mjs` va aggiornato sul fondo dei crediti di Nina.
- **B12** · la campanella del coach: non eseguita. «Acquisto Booster», «Giulia Bianchi · +3 Sessione PT», `Sparkles` e «· Apri il profilo» sul desktop; sul telefono titolo e testo; il tocco segna letta e apre `/trainer/clients/$id`; una `booking.created` apre ancora il Calendario.
- **B13** · le misure: non eseguita. Nessun `position: fixed` (C8); un solo pulsante pieno per card e foglio; l'icona della tipologia col colore di `tileIcon` (il primario quando il colore della tipologia non fa 3:1, come nella Home); il bianco di «Più conveniente» su `aura-primary`. Le larghezze a 320 da misurare.
- **B14** · il focus: non eseguita. Riepilogo: torna all'«Acquista» che l'ha aperto; esito: sull'`h1` (che prende `tabIndex -1`); «Paga» tiene il focus mentre aspetta (`aria-disabled`).
- **B15** · il resto non cambia: non eseguita (`giro-prenota.mjs`, `giro-sessioni.mjs`, `giro04.mjs`, Profilo e Notifiche, le schermate del coach).
- **B16** · richieste esterne: non eseguita. Nessuna richiesta fatta da questa sessione verso Supabase, Stripe o Google: le due funzioni le ho provate solo con moduli finti nello scratchpad.
- **R60-R62**: non provate (vogliono il browser).

## 8 · NON FATTO

- I quattro cancelli con la configurazione del repo (typecheck, lint, test, build) e le prove col fuso da PowerShell: nel cloud senza `node_modules` non girano. Al loro posto, dichiarati come tali: Prettier 3.8.1 globale (stessa configurazione `.prettierrc`) su tutti i file toccati; un typecheck parziale con `tsc` 6.0.2 e dichiarazioni minime di React, router, react-query, date-fns, lucide, sonner e vaul (`scratchpad/tc/`), che non controlla i tipi veri delle librerie; `bun test` nel banco, nei tre fusi.
- Le prove rosse ufficiali (R1-R59 rifatte nel banco, §6) e R60-R62 (browser).
- Il giro nel browser B1-B16 (§7).
- La copia dei due semi di Cowork e la lettura di `atteso-cli-06-2026-10-01.json`: sono sul PC. Ho ricostruito i semi e scritto le attese dal §4 del prompt (§9).
- `deno check`: `deno` assente; C12 con `bun build` (sintassi e import, non i tipi).

## 9 · DIVERGENZE

- **Il cloud** (§2): cancelli, prove rosse e browser non eseguiti; la riga 06 di `PIANO.md` a `[~]`, non a `[x]`.
- **I semi di `src/lib/testing/`** (§4.9 «copi così come sono»): ricostruiti, perché i file di Cowork sono sul PC. `client-home-seed.ts` è il blocco dei dati di `client-home.test.ts` (le nove persone, gli stessi valori), con `NOW`, `TYPES`, `COACH`, `NOC`, i costruttori e `PERSONAS05`. `client-store-seed.ts` l'ho scritto da §4.9 e dalle attese del §4, che tornano tutte (112 test verdi nei tre fusi). Forme mie: `StorePersona = { name; client; blocks; bookings; extras: StorePurchase[] }`, `PERSONAS06` (array delle quindici), `persona(name)`, `inputOf(p, coach, now = NOW)`, `paid(…)`, `BOOSTER_TITLES`. Dati scelti da me: le sei persone nuove (Rita, Anna e Bruno con 2 PT disponibili nel blocco; Carlo fisso archiviato con il blocco dal 14/09 all'11/10; il PT Pack di Pietro con 3 crediti); gli acquisti di Giulia (10/09 17:05, 19/09 11:20, 25/09 18:30, sessioni `cs_test_giulia10/19/25`, tutti usati) e il credito BIA del coach del 20/09, non usato; i crediti del coach delle persone della 05 con `created_at` 01/09 e senza pagamento; `ARRIVED` a 40 €, `ARRIVED_TEST` a 75 €. Se Cowork rimette i suoi semi, `client-store.test.ts` va adattato alle sue forme (i nomi dei campi e degli helper), non le attese.
- **`booster-checkout`**: profilo e blocchi in un `Promise.all`; un errore di lettura diventa un `Error` col nome della tabella (resta nel log), poi il 500 generico di oggi.
- **Il controllo dell'indirizzo di Stripe** (`stripeCheckoutUrl`, `src/routes/client.store.tsx`): oltre all'host `checkout.stripe.com` vuole `https:`, più stretto di quello di oggi.
- **Dopo «Riprova» riuscito** il focus va sul contenuto della pagina (come nella Home della 05): il prompt non lo chiede, ma senza finirebbe sul `body`.
- **`storeEmpty`** sta in una card bianca (`StoreEmptyCard`); il prompt dice solo «al loro posto».
- **`useBoosterPacks`** con `staleTime` di 5 minuti, come `useActiveShopTitles` (il prompt non lo dice).
- **`storeOutcome` con una tipologia che il coach non ha più**: il numero è ancora quello di Prenota per quell'`event_type_id`, senza la riga arrivata, più la quantità (con `zzz` dà 2, come atteso).
- **C4**: `client-book.ts` a +7 −9 (sul ramo simulato 6 e 9): la riga d'import in più. In `client-book.test.ts`, oltre ai due casi chiesti, un terzo: il blocco in corso compra, anche l'ultimo giorno.
- **Il riquadro con `CircleCheck`** del foglio dell'esito c'è solo con `arrived`, come dice il prompt: in attesa e in ritardo il foglio ha titolo, testo e «Chiudi».
- **Lo script dei controlli**: il mio, riscritto dal §6 (stesse righe di comando), non quello di Cowork.

## 10 · TROVATI E NON TOCCATI

- **Comprare l'ultimo giorno di un percorso che finisce** (trovato dal revisore; regola da decidere, non toccata). Con la regola del prompt l'ultimo giorno del blocco, senza blocco dopo e senza rinnovo, il Booster vale fino a oggi (`boosterValidity`, la riga «2026-09-28, fine 2026-09-28, non continua» della tabella): `expires_at` è oggi alle 23:59:59.999 di Roma. Due conseguenze:
  - il credito non si prenota: Prenota vuole 24 ore di preavviso, e lo Store dice lo stesso «Le sessioni si prenotano entro quella data»;
  - se il cliente paga dopo la mezzanotte di Roma (la sessione di Checkout resta aperta 24 ore), `stripe-webhook` risponde 400 per `expires_at` passato (`supabase/functions/stripe-webhook/index.ts:83-91`, il controllo H3), e Stripe ritenta per tre giorni con lo stesso 400: addebito senza crediti e senza avviso al coach. Con la validità di prima (sempre almeno 7 giorni o 30 in più) non succedeva.
  Il prompt dice che compra chi ha un blocco in corso oggi, l'ultimo giorno compreso (§0 punto 2 e §4.2), e che una regola diversa la decide Nicolò (§9): non l'ho cambiata. Opzioni: (a) l'ultimo giorno di un percorso che finisce non si compra (lo Store mostra la card con un testo suo e il pagamento risponde 400): cambia `boosterPurchase` e `canBuyBooster`; (b) `booster-checkout` passa a Stripe `expires_at` della sessione, al più la fine della validità (Stripe vuole fra 30 minuti e 24 ore), e sotto i 30 minuti rifiuta; (c) il webhook, per una sessione pagata con `expires_at` passato, scrive lo stesso i crediti (con una scadenza corretta) invece del 400. La (a) toglie anche il credito inutilizzabile; la (b) o la (c) chiudono l'addebito senza crediti. Da decidere prima del rilascio delle funzioni.
- `supabase/functions/stripe-webhook/index.ts:151` (di prima): il commento «400 → Stripe non ritenta» è sbagliato, Stripe ritenta ogni risposta non 2xx. Conta per il punto sopra.
- Il caso senza `session` del ritorno da Stripe (`findPurchase` per tipologia) guarda `created_at` fino a `input.now`, che si aggiorna ogni 30 secondi (`useNow`): una riga scritta dal webhook dopo il caricamento conta solo al tick dopo, e l'esito può passare da «in ritardo» ad «arrivato». È il contratto di `findPurchase` (fino a `now`) e la pagina non può leggere l'orologio (C3); l'indirizzo di ritorno di Stripe porta sempre la sessione, e lì il limite non c'è.
- Il cliente archiviato con un blocco nelle date di oggi vede «Al momento non hai un blocco attivo…» (il caso `altro`, come vuole il prompt per Carlo): il testo non dice il vero motivo. Da rivedere con la 09.
- `src/lib/client-credits.ts:258`: «La scelta sulla validità dei Booster è della passata 06.» Adesso la scelta c'è (il file condiviso), ma il commento resta: il file è fuori dal manifesto. Per la 09.
- `src/components/client-tab-header.tsx:33`: l'`h1` delle schede non è focalizzabile; lo Store gli dà `tabIndex -1` quando ci torna il focus. Una prop di `ClientTabHeader` sarebbe più pulita (file fuori dal manifesto): per la 09.
- `src/components/ui/aura-progress-ring.tsx` e `--color-cta-dark` (`src/styles.css:58-59`), che tolte le due card non usa più nessuno: come dice il §5 del prompt, per la 09.
- `src/lib/testing/memory-calendar-store.ts:225-232` riproduce `validate_booking_extra_credits` senza `expires_at`: da allineare dopo il giro del server.
- Nel banco, sulla base come sul ramo, 9 rossi d'ambiente: 7 file non si caricano (vogliono `react`, `typescript` o `@tanstack/react-query`), e `isoDateParam > scarta "2026-02-31"` e `URL · lettura > i valori malformati si scartano` cadono perché la mia sostituta di `date-fns` non scarta il 31 febbraio. Non sono del codice.

## 11 · RESTA A NICOLÒ

- **Decidere il caso dell'ultimo giorno di un percorso che finisce** (§10, il primo punto), prima di pubblicare le due funzioni di Stripe.
- Rilanciare la verifica di Cowork sul PC: cancelli, prove rosse R1-R62, giro nel browser B1-B16, con i semi veri di Cowork al posto dei miei (§9); poi la riga 06 di `PIANO.md` da `[~]` a `[x]`.
- Il merge della PR nel ramo di integrazione `redesign/cliente-mobile`, dopo la verifica di Cowork.
- Il giro del server del 02/10/2026 con la proposta di Cowork (`app/server-cli-06-booster-2026-10-01.sql`: `booster_packs.title` e `description`, `validate_booking_extra_credits` con `expires_at`).
- Al rilascio su `main`, non prima del giro: la pubblicazione di `booster-checkout` e `stripe-webhook` e un acquisto di prova dal suo account.
