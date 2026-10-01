**Dove ho girato (ultimo ritorno · lato cliente · passata 06 · ripresa sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26200`, `$OS` = `Windows_NT`, `deps-presenti`; `deno --version` → `deno 2.9.1 (stable, release, x86_64-pc-windows-msvc)`, v8 14.9.207.2-rusty, typescript 6.0.3; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1. Nessuna installazione, nel repo né fuori.

> **In breve.** Il lavoro del cloud (`a3f71db`) passa i quattro cancelli veri al primo colpo: typecheck 0, lint 0 errori e 14 avvisi, **1173 test in 61 file**, build riuscita, i cinque file verdi in UTC, a Los Angeles e a Roma. Sopra c'è la **decisione 14**: nell'ultima settimana di un percorso che finisce il Booster non si compra. La regola sta solo nel file condiviso (`boosterSaleClosed`, `boosterRefusal`, una decisione sola per rifiuto e pagamento). La usano `getBookState` (quindi Home e Prenota, senza cambiare i loro file), lo Store (la card «fine») e `booster-checkout` (il 400 con la sua frase). Giorgio, Rita e Vera non comprano più, Paola sì, con 7 giorni esatti. Alla fine: **1205 test in 61 file** verdi, i cinque file verdi nei tre fusi, **71 mutazioni (R1-R59, R63-R72) rosse nei tre fusi** e poi verdi. Nel browser **127 prove su 127** sullo Store (B1-B14, B16, B17), più R60, R61, R62 e R73 rosse. B15: Prenota 82/82, Sessioni 78/78, la 04 103/104 (il suo B9 confronta l'ordine, non le differenze: §11), la Home della 05 154/154. Profilo, Notifiche e coach sono uguali alla base. Un revisore in sola lettura ha dato 6 punti: uno corretto (`731a136`), cinque misurati e lasciati a Nicolò (§11). La PR resta la #84, aperta e non unita. Workflow: 0 (il prompt dice che Ultracode non serve); agenti: 1 (il revisore).

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base e il ramo** (§2). Nessun commit.
   - Ambiente: la riga in testa (PC).
   - ⚠️ All'avvio il clone era su `main` @ `3d29634` (pulito, 64 commit dietro `origin/main`), non su `redesign/cliente-05-home` @ `ac44ec2` come l'aveva misurato Cowork alle 09:21. Il reflog: `checkout: moving from redesign/cliente-05-home to main` alle 11:29:49 del 01/10. Non conta, perché il ramo nasce dal remoto.
   - `git fetch origin` → `* [new branch] redesign/cliente-06-booster`; `git switch -c redesign/cliente-06-booster --track origin/redesign/cliente-06-booster` → **`a3f71db`** (il remoto non era più avanti); `origin/redesign/cliente-mobile` = **`a9bf1de`**, il `merge-base` col ramo.
   - `gh pr view 84 --json state,baseRefName,headRefName` → `OPEN`, `redesign/cliente-mobile`, `redesign/cliente-06-booster`. `git diff --stat b780645 origin/redesign/cliente-06-booster -- package.json bun.lock` → vuoto.
   - Le sonde del fuso, da PowerShell (`node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"`): `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`. In più una sonda dentro i worker di vitest (un test temporaneo, poi cancellato), lanciata da PowerShell: `SONDA 0 UTC`, `SONDA 420 America/Los_Angeles`, `SONDA -120 (senza TZ)`.
   - Lo script dei controlli di Cowork su `a3f71db` dà la colonna «oggi», uguale riga per riga a quella del §6 (§6 qui sotto).
1. ☑ **I cancelli sul lavoro del cloud**, su `a3f71db`: tutti verdi, **nessun commit** (§4).
2. ☑ **La decisione 14 nel file condiviso** (§4.1). `00059e3`. `booster-validity.test.ts` ha **67 test** (erano 45), verdi nei tre fusi; `deno check` del file condiviso verde; C16 `0`. R63, R64, R65, R67, R68 rosse nei tre fusi sui casi del file.
   - ⚠️ Atteso: fino al passo 4 `client-store.test.ts` cade su `lo Store di Giorgio > il pagamento decide come lo Store` e su `lo Store di Rita > …` (`AssertionError: expected null to deeply equal { blockId: 'r1', …(3) }`). Il pagamento non vende più, lo Store sì. Nei tre fusi: `Tests 2 failed | 339 passed (341)`.
3. ☑ **Chi compra, nell'app** (§4.2). `50cbc46`. `client-book.test.ts` ha 48 test (erano 44); in `client-home.test.ts` cambiano solo le tre righe di Giorgio. Verdi nei tre fusi. C4 e C15 come attesi; R66 e R71 rosse nei tre fusi.
   - ⚠️ Atteso: fino al passo 4 `client-store.test.ts` cade su sei casi di Giorgio e Rita (card, validità, riepiloghi), `Tests 6 failed | 339 passed (345)` nei tre fusi.
4. ☑ **Lo Store** (§4.3) e **Vera** (§5). `d303e03`. `client-store.test.ts` ha 118 test (erano 112). La suite intera: 1205 test in 61 file; i cinque file verdi nei tre fusi. R69, R70, R72 rosse; C17 e C19 come attesi.
5. ☑ **Il pagamento e il webhook** (§4.4, §4.5). `4e92b18`. C11, C12, C13, C18 come attesi. In più una prova di fumo della funzione vera, con Stripe e Supabase finti (§6, C12).
6. ☑ **I cancelli e le prove rosse.** Nessun commit (§4, §6, §7).
   - ⚠️ La prima suite intera su `4e92b18` aveva un solo test rosso, fuori dalla passata: `clock.test.ts` in timeout (6485 ms contro 5000), con 0,1 GB di RAM fisica libera (§11). Rilanciata: 1205 su 1205.
   - Le 71 mutazioni sono tutte rosse nei tre fusi, ognuna sui test che dipendono dal file rotto (`vitest related`). Dopo il ripristino la suite intera è verde.
7. ☑ **Il browser** (§8). Nessun commit: i file del banco stanno nello scratchpad.
   - ⚠️ Il B9 di `giro04.mjs` è rosso solo per l'ordine. Con gli orari ordinati è verde (§11).
   - ⚠️ Il B7 di `giro-sessioni.mjs` l'ho aggiornato come nella 05 (`aria-disabled`).
8. ☑ **Chiusura** (§10). I controlli del §6 tutti insieme. `a49550f` «Spunta la passata 06 in PIANO.md» (una riga, il blob `541938a` uguale a quello del ramo simulato di Cowork). Questo file è committato nell'ultimo commit del ramo; poi push e descrizione della PR #84 (§2).
9. ☑ **Passo aggiunto: la revisione.** `731a136`. Un revisore in sola lettura (un agente, circa 11 minuti) su una fotografia del ramo nello scratchpad (`git archive` di `4e92b18`), così non leggeva i file rotti dalle prove rosse. Ha dato 6 punti:
   - il 6 l'ho verificato e corretto in `731a136`: il commento del webhook diceva «riceve sempre lo stesso esito», ma a ogni tentativo `event_types` si rilegge;
   - gli altri cinque li ho misurati e lasciati a Nicolò (§11).

## 2 · RAMO E COMMIT

- **`redesign/cliente-06-booster`**, da `a3f71db`. La base è `origin/redesign/cliente-mobile` @ `a9bf1de`. I commit della ripresa, in ordine:
  1. `00059e3` Booster: nell'ultima settimana di un percorso che finisce non si compra (decisione 14);
  2. `50cbc46` Booster: anche l'app non vende nell'ultima settimana di un percorso che finisce;
  3. `d303e03` Store: la card dell'ultima settimana, e Vera fra le persone dei test;
  4. `4e92b18` Pagamento dei Booster: il rifiuto dell'ultima settimana con la sua frase; il commento del webhook;
  5. `731a136` Webhook: il commento del 400 dice anche che a ogni tentativo la tipologia si cerca di nuovo (passo 9);
  6. `a49550f` Spunta la passata 06 in PIANO.md;
  7. «Riscrive docs/ULTIMO-RITORNO.md per la ripresa della passata 06»: questo file. Il suo hash, che è anche quello finale del ramo, è nella risposta finale.
- Ogni commit compila: typecheck 0 a ogni passo, lint pulito sui file toccati.
- **PR [#84](https://github.com/wolfwood370-cell/nc-calendar/pull/84)** verso `redesign/cliente-mobile`: aperta e **non unita**, con questo file come descrizione (`gh pr edit 84 --body-file docs/ULTIMO-RITORNO.md`).

## 3 · MANIFESTO della ripresa

- **MODIFICATI:**
  - `supabase/functions/_shared/booster-validity.ts` e `src/lib/booster-validity.test.ts`;
  - `src/lib/client-book.ts`, `src/lib/client-book.test.ts` e `src/lib/client-home.test.ts` (le tre righe di Giorgio);
  - `src/lib/client-store.ts`, `src/lib/client-store.test.ts` e `src/lib/testing/client-store-seed.ts` (Vera);
  - `supabase/functions/booster-checkout/index.ts` e `supabase/functions/stripe-webhook/index.ts` (solo il commento);
  - `design_handoff_cliente_mobile/PIANO.md` (la riga 06) e `docs/ULTIMO-RITORNO.md`.
- **NUOVI:** nessuno.
- **NEL PERIMETRO MA NON TOCCATI:**
  - la pagina e i componenti dello Store (`client.store.tsx`, `client-store-cards.tsx`, `client-store-sheets.tsx`: §4.3 punto 5);
  - Home e Prenota (`client.index.tsx`, `client.book.tsx`, `client-home-credits.tsx`, `book-sheets.tsx`, `book-blocked-card.tsx`: C15);
  - `client-home-seed.ts`, `queries.ts`, `query-keys.ts`, `use-client-book-state.ts`, `notifications.ts` e il suo test, `use-notifications.ts`, `trainer-notifications-bell.tsx`;
  - gli helper delle passate prima (`client-credits.ts`, `renewal.ts`, `current-block.ts`, `session-time.ts`, `client-home.ts`);
  - `supabase/migrations/`, `package.json`, `bun.lock`, `src/routeTree.gen.ts`.
- C6 → nessuna riga.

## 4 · I CANCELLI SUL LAVORO DEL CLOUD (passo 1)

Su `a3f71db`, senza toccare niente: **tutti verdi, niente da sistemare, nessun commit.**
- `bun run typecheck` → 0 errori (uscita 0, 64 s).
- `bun run lint` → `✖ 14 problems (0 errors, 14 warnings)`. Sono i 15 della base meno quello di `stripe-webhook/index.ts:57`.
- `bun run test` → `Test Files 61 passed (61)`, `Tests 1173 passed (1173)` (83,5 s, coi worker predefiniti). È il numero che Cowork si aspettava col repo vero.
- `bun run build` → riuscita: uscita 0, tre fasi `built in` da 52,4 s, 14,4 s e 1 min 2 s.
- Le prove col fuso, da PowerShell (`scratchpad\fusi.ps1`, i cinque file del §2, una corsa per fuso): con le sonde `0`, `420` e `-120` → `Test Files 5 passed (5)`, `Tests 319 passed (319)` in tutte e tre.
- C12:
  - `deno check $X $W` → `error: Could not find a matching package for 'npm:stripe@^14.0.0' in the node_modules directory`. Il repo ha `node_modules` e non ha `stripe`, e non ho scaricato niente.
  - Quindi il ripiego: `bun build … --target=bun --external 'npm:*'` → `compila`, `compila`.
  - In più `deno check supabase/functions/_shared/booster-validity.ts` → verde.

## 5 · I PEZZI PER LE PASSATE DOPO

Cambia solo quello che segue; il resto dei pezzi della 06 è com'è nel ritorno del cloud (`git show a3f71db:docs/ULTIMO-RITORNO.md`, §4).

**Il file condiviso** (`supabase/functions/_shared/booster-validity.ts`, sempre senza import; lo importano gli stessi sei file):
- `boosterSaleClosed({ today, blockEnd, continues }: { today: string; blockEnd: string; continues: boolean }): boolean`: vero quando `!continues` e alla fine del blocco mancano da 0 a 6 giorni, contati come in `boosterValidity` (una funzione interna sola, `daysLeft`, per tutte e due); con 7 esatti falso; per un blocco finito falso.
- `type BoosterRefusal = "percorso" | "blocco" | "fine"`; `boosterRefusal(client: BoosterClient, blocks: readonly BoosterBlock[], today: string): BoosterRefusal | null`: il primo che vale fra il percorso (`boosterPathAllowed`), il blocco in corso oggi, l'ultima settimana.
- `boosterPurchase` (firma e risultato di prima) è `null` esattamente quando `boosterRefusal` non è `null`: tutte e due passano da una decisione interna sola (`decide`), e un test lo controlla sui dieci casi dei rifiuti.

**Chi compra** (`src/lib/client-book.ts`): `canBuyBooster(client, hasCurrentBlock: boolean, saleClosed: boolean)` = `hasCurrentBlock && !saleClosed && boosterPathAllowed(client)`. `getBookState` gli passa `current` (il riferimento in corso oggi) e `saleClosed` = `current && boosterSaleClosed({ today: toIsoDate(now), blockEnd: reference.end_date.slice(0, 10), continues: next !== null || renewsAutomatically(client) })`. Home e Prenota lo seguono da sole, dai loro file di prima.

**Lo Store** (`src/lib/client-store.ts`):
- `StoreLockKind = "concluso" | "libero" | "pacchetto" | "fine" | "altro"`;
- `storeLock(client, state: Pick<BookState, "reference" | "next" | "canBuy">, coach, now)`: prima di «altro», per il blocco di riferimento in corso di un percorso che compra con la vendita chiusa, la card «fine»: «Il tuo percorso finisce ‹oggi | sabato 3 ottobre›, e nell'ultima settimana di un percorso i Booster non si acquistano. Per una sessione in più, o per continuare, scrivi ‹al tuo coach | a Nicolò›.», titolo e WhatsApp come le altre;
- il «continua» della card e della validità è una funzione interna sola (`pathContinues`: il blocco dopo, o il rinnovo automatico), lo stesso di `getBookState`;
- `STORE_PAY_ERRORS` ha sei frasi: dopo quella del blocco in corso «Nell'ultima settimana del percorso i Booster non si acquistano: per una sessione in più scrivi al tuo coach.».

**Il pagamento** (`booster-checkout`): `today = romeDate(new Date())` una volta; `boosterRefusal`, e solo senza rifiuto `boosterPurchase`; con `"fine"` il 400 dice la frase dell'ultima settimana, con gli altri rifiuti e senza profilo quella del blocco in corso. Il resto è com'era.

**Il webhook:** solo il commento del 400 «Event type not resolved»: Stripe ritenta ogni consegna senza 2xx (in produzione fino a tre giorni, in sandbox tre volte in qualche ora) e a ogni tentativo la tipologia si cerca di nuovo.

**I dati dei test:** `VERA` in `src/lib/testing/client-store-seed.ts` (fisso, solo `ve1` dal 01/09 al 28/09 con 8 PT assegnati e 6 prenotati, niente sessioni né extra), in fondo a `PERSONAS06`, che ha sedici persone.

**Vincoli per chi li usa:** «oggi» nell'app è il giorno del telefono (`toIsoDate`), nel pagamento quello di Roma (`romeDate`): fuori dal fuso di Roma, vicino a mezzanotte, il confine fra 7 e 6 giorni può cadere in due giorni diversi (misurato, §11). La regola dell'ultima settimana non si copia: si importa `boosterSaleClosed` o si chiama `boosterRefusal`.

## 6 · ACCEPTANCE

- **C7** · i quattro cancelli, a lavoro committato (`a49550f`):
  - `bun run typecheck` → 0 errori (uscita 0);
  - `bun run lint` → `✖ 14 problems (0 errors, 14 warnings)`;
  - `bun run test` → `Test Files 61 passed (61)`, `Tests 1205 passed (1205)` (114 s): 32 test in più dei 1173 del cloud (22 in `booster-validity`, 4 in `client-book`, 6 in `client-store`), negli stessi 61 file;
  - `bun run build` → riuscita: uscita 0, tre fasi `built in` da 1 min 36 s, 25,5 s e 1 min 8 s;
  - da PowerShell, con le sonde `0`, `420` e `-120`, i cinque file del §2 in UTC, `America/Los_Angeles` e Roma → `Test Files 5 passed (5)`, `Tests 351 passed (351)` tutte e tre.
- **C12** · `deno check $X $W` si ferma su `npm:stripe@^14.0.0` (com'era su `a3f71db`), quindi **`bun build`**: `bun build $X --target=bun --external 'npm:*' > /dev/null && echo compila` e lo stesso con `$W` → `compila`, `compila`. In più:
  - `deno check` di `_shared/booster-validity.ts` → verde;
  - la prova di fumo della funzione vera con Deno (§7) → 16 su 16.
- **C0-C6, C8-C11, C13-C19** · `bash "C:/Coworks/NC App Development/app/controlli-cli-06-ripresa-2026-10-01.sh"` dalla radice del clone, a lavoro committato (`a49550f`; il commit di questo file cambia solo `docs/`, che C6 ammette). Ogni sezione è com'è alla fine. Sotto c'è la colonna «oggi» del passo 0 (su `a3f71db`), dove è diversa. C13: il commento del webhook ha spostato insieme le due righe (177 e 190 → 180 e 193), senza cambiarne l'ordine. C4: `client-book.ts` a +24 −13 (§10).

```
== C0 · i file nuovi ci sono, i due vecchi no
(fine C0)
  [uguale a oggi]
== C1 · nessuno usa i pezzi e i testi vecchi
nomi: 0
testi:
(fine C1)
  [uguale a oggi]
== C2 · la pagina e i due file dei componenti usano le regole
storeSearch 2
storeLock 2
storeValidity 2
storeProducts 2
storeBought 2
storeSummary 3
storeOutcome 4
storePayError 2
storeEmpty 2
STORE_FOOTER 2
STORE_CANCEL_TOAST 2
STORE_DONE_TITLE 2
STORE_POLL_MS 3
useClientBookState 3
useBoosterPacks 3
ClientTabHeader 2
ClientSheet 6
ClientButton 16
BookRetryCard 2
parseEdgeError 2
iconForType 2
typeTint 2
  [uguale a oggi]
== C3 · niente calcoli fuori dalle regole
pagina e componenti: 0
regole dello Store senza orologio: 0
  [uguale a oggi]
== C4 · chi compra
regola vecchia: 0
boosterPathAllowed in client-book.ts: 3 · boosterSaleClosed: 3
righe cambiate in client-book.ts: 24+ 13-
  [oggi, su a3f71db:]
  | regola vecchia: 0
  | boosterPathAllowed in client-book.ts: 3 · boosterSaleClosed: 0
  | righe cambiate in client-book.ts: 7+ 9-
== C5 · una regola in un posto
chi importa il file condiviso:
src/lib/booster-validity.test.ts
src/lib/client-book.ts
src/lib/client-store.test.ts
src/lib/client-store.ts
src/lib/testing/client-store-seed.ts
supabase/functions/booster-checkout/index.ts
la validità vecchia nel pagamento: 0
costanti fuori dal file condiviso: 0
  [uguale a oggi]
== C6 · il manifesto
(fine C6)
  [uguale a oggi]
== C8 · niente colori scritti, fixed, main, confirm, drawer
src/routes/client.store.tsx colori 0 altri 0
src/components/client-store-cards.tsx colori 0 altri 0
src/components/client-store-sheets.tsx colori 0 altri 0
  [uguale a oggi]
== C9 · PIANO.md
[x]
[x]
 1 file changed, 1 insertion(+), 1 deletion(-)
  [oggi, su a3f71db:]
  | [x]
  | [~]
  |  1 file changed, 1 insertion(+), 1 deletion(-)
== C10 · niente dati finti nel codice
nomi scritti nel pagamento: 0
(fine C10)
  [uguale a oggi]
== C11 · il pagamento
regola condivisa 4 · import 1 · senza .ts 0
ritorno success 1 · session 1 · cancel 1 · vecchio 0
errore nuovo 1 · titolo 2
ultima settimana: rifiuto 2 · frase 1
  [oggi, su a3f71db:]
  | regola condivisa 2 · import 1 · senza .ts 0
  | ritorno success 1 · session 1 · cancel 1 · vecchio 0
  | errore nuovo 1 · titolo 2
  | ultima settimana: rifiuto 0 · frase 0
== C13 · l'avviso al coach
webhook: tipo 1 · notifications 1 · risposte 14
ordine: la fine dell'inserimento dei crediti alla riga 180, notifications alla riga 193
campanella: regola 1 · tipo 1 · Sparkles 2 · Apri il profilo 1 · profilo 1
  [oggi, su a3f71db:]
  | webhook: tipo 1 · notifications 1 · risposte 14
  | ordine: la fine dell'inserimento dei crediti alla riga 177, notifications alla riga 190
  | campanella: regola 1 · tipo 1 · Sparkles 2 · Apri il profilo 1 · profilo 1
== C14 · lo Store legge solo coi hook
letture: 0 · pagamento: 1
  [uguale a oggi]
== C15 · Home e Prenota non cambiano file
righe cambiate in client-home.test.ts:
      1 +          "nessuna",
      2 +      canBuy: false,
      2 +      footer: [ASK, ASK_COACH],
      1 -          "Acquista (pt)",
      2 -      canBuy: true,
      2 -      footer: [BUY, BUY],
(fine C15)
  [oggi, su a3f71db:]
  | righe cambiate in client-home.test.ts:
  |       1 +      canBuy: false,
  |       1 +      footer: [ASK, ASK_COACH],
  |       1 -      canBuy: true,
  |       1 -      footer: [BUY, BUY],
  | (fine C15)
== C16 · il file condiviso non importa niente
import o Deno: 0
  [uguale a oggi]
== C17 · la decisione 14 nel file condiviso e nello Store
file condiviso: 3 · Store: vendita 3 · tipo fine 2 · frase 1
  [oggi, su a3f71db:]
  | file condiviso: 0 · Store: vendita 0 · tipo fine 0 · frase 0
== C18 · il commento del webhook
non ritenta 0 · risposta 1
  [oggi, su a3f71db:]
  | non ritenta 1 · risposta 1
== C19 · Vera nei dati dei test
Vera 1
  [oggi, su a3f71db:]
  | Vera 0
```

## 7 · LE PROVE ROSSE

**Come:** `scratchpad\rosse.mjs` con `mutazioni.json` (generato da `genera-mutazioni.mjs`; ogni ancora è una sostituzione esatta, contata). Per ogni prova:
- rompe il file;
- lancia `vitest related <file rotto>` (tutti i test che dipendono da quel file, non solo i cinque) a Roma, in UTC e a Los Angeles. `TZ` è passato da Node a vitest, senza Git Bash in mezzo: la sonda nei worker l'ha visto arrivare;
- confronta i test caduti con la corsa senza difetto dello stesso insieme;
- rimette il file e ne controlla l'impronta sha256.

**Esito: 71 prove su 71 rosse, coi test caduti identici nei tre fusi**, e i file rimessi uguali (albero pulito dopo). **Il verde:** dopo il giro, la suite intera `Test Files 61 passed (61)`, `Tests 1205 passed (1205)`.

Coi nomi diversi dal riferimento ho rotto l'equivalente nel codice del ramo. R66 l'ho rotta in due modi: in `canBuyBooster` (R66) e nella chiamata di `getBookState` (R66b). R71 in due: in `getBookState` e nello Store insieme (R71), e nel solo `getBookState` (R71a).

Dove cadono diversamente dal cloud:
- con la decisione 14 Giorgio e Rita non hanno più validità né riepiloghi: R2 cade solo sulle righe della tabella, non più su Giorgio e Rita;
- R23 cade su nove card, non più sei: in più Giorgio, Rita e Vera;
- R28 e R18 su sette riepiloghi, non più nove;
- R15 e R20 cadono anche su «Prenota: Giulia col PT Pack», un test della 02 che dipende da `client-book.ts` (il cloud non lo poteva lanciare);
- R5 qui non fa lanciare `endOfRomeDay`, come nel riferimento: dà un'ora in meno. Cadono le attese d'inverno e del giorno del cambio, e le validità con la proroga a novembre (Marta, Luca, Bruno).

Cosa cade (i nomi accorciati; i nomi interi sono nei file dei test, l'elenco intero in `scratchpad\esiti\rosse-tutte.json`; «Store: X (card, validità, riepiloghi, pagamento=Store)» sono i test di quella persona in `client-store.test.ts`):

- **R1** · V1 · la proroga con 7 giorni esatti (<=) → cadono validità: 09-28→10-05 continua · Store: Anna (validità) [2 test]
- **R2** · V2 · la proroga anche se il percorso finisce → cadono validità: 09-28→10-04; 09-28→09-28 [2 test]
- **R3** · V3 · la proroga anche per un blocco già finito → cadono validità: 09-28→09-27 continua [1 test]
- **R4** · V4 · i 30 giorni contati da oggi → cadono validità: 09-28→10-04 continua; 12-28→01-03 continua; 02-01→02-05 continua · pagamento: dopo con lo stesso numero; dopo completato; abbonamento col rinnovo, senza il dopo; inverno · Store: Marta (validità), Bruno (validità) [9 test]
- **R5** · V5 · la fine del giorno sempre con l'ora legale (+2) → cadono endOfRomeDay: 10-25; 10-26; 03-28; 11-03; 01-02 · pagamento: le scadenze; inverno · Store: Marta (validità), Luca (validità), Bruno (validità) [10 test]
- **R6** · V6 · expires_at all'inizio del giorno → cadono endOfRomeDay: 10-11; 10-24; 10-25; 10-26; 03-28; 03-29; 11-03; 01-02 · pagamento: scadenza dei 7 giorni; le scadenze; inverno · Store: Giulia (validità), Marta (validità), Luca (validità), Sara (validità), Paola (validità), Anna (validità), Bruno (validità) [18 test]
- **R7** · V7 · l'«oggi» di Roma con la data UTC → cadono romeDate: 2026-10-10T22:00; 2026-10-25T23:00; 2026-03-28T23:00 [3 test]
- **R8** · D1 · il pagamento conta i blocchi annullati → cadono pagamento: annullato in corso; dopo annullato · rifiuti: l'ultima settimana, col blocco dopo annullato [3 test]
- **R9** · D2 · il pagamento senza il rinnovo automatico → cadono pagamento: abbonamento col rinnovo, senza il dopo · rifiuti: l'ultima settimana di un abbonamento col rinnovo · Store: Marta (pagamento=Store) [3 test]
- **R10** · D3 · il blocco dopo anche annullato → cadono pagamento: dopo annullato · rifiuti: l'ultima settimana, col blocco dopo annullato [2 test]
- **R11** · D4 · il blocco dopo solo per sequence_order → cadono pagamento: dopo con lo stesso numero [1 test]
- **R12** · D5 · l'ultimo giorno del blocco non più in corso → cadono pagamento: finisce oggi; le scadenze · rifiuti: l'ultimo giorno · Store: Luca (pagamento=Store), Vera (pagamento=Store) [5 test]
- **R13** · D6 · il rinnovo automatico anche per il fisso → cadono pagamento: fisso col rinnovo acceso [1 test]
- **R14** · D7 · a pari sequence_order, l'ordine d'arrivo → cadono pagamento: stesso numero, sovrapposti [1 test]
- **R15** · C2 · il PT Pack compra → cadono booster-validity: boosterPathAllowed (no) · pagamento: PT Pack · rifiuti: PT Pack · client-book: Prenota: Giulia col PT Pack · canBuyBooster: i percorsi · Store: Pietro (card, validità, riepiloghi) [8 test]
- **R16** · C3 · l'archiviato compra → cadono booster-validity: boosterPathAllowed (no) · pagamento: cliente archiviato · rifiuti: archiviato · canBuyBooster: libero, archiviato, senza blocco · Store: Carlo (card, validità, riepiloghi) [7 test]
- **R17** · P7 · il titolo sempre composto (la colonna ignorata) → cadono booster-validity: boosterPackTitle · client-store: PACKS_TITLED [2 test]
- **R18** · P11 · il titolo composto sempre al plurale → cadono booster-validity: boosterPackTitle · client-store: prodotti; PACKS_TITLED; PACKS_TIE · Store: Giulia (riepiloghi), Marta (riepiloghi), Luca (riepiloghi), Sara (riepiloghi), Paola (riepiloghi), Anna (riepiloghi), Bruno (riepiloghi) [11 test]
- **R19** · C1 · chi compra con un blocco di riferimento qualunque → cadono canBuyBooster: blocco futuro; finito ieri · la Home di Davide · la Home di Nina · Store: Davide (card, validità, riepiloghi, pagamento=Store), Nina (card, validità, riepiloghi, pagamento=Store) [14 test]
- **R20** · C4 · canBuyBooster senza la regola del percorso → cadono client-book: Prenota: Giulia col PT Pack · canBuyBooster: i percorsi; libero, archiviato, senza blocco · Store: Pietro (card, validità, riepiloghi, pagamento=Store), Carlo (card, validità, riepiloghi, pagamento=Store) [11 test]
- **R21** · L1 · il concluso anche per chi non ha cominciato → cadono Store: Nina (card) [1 test]
- **R22** · L2 · il PT Pack finito non è concluso → cadono Store: Pietro finito (card) [1 test]
- **R23** · L3 · il WhatsApp anche senza il link del coach → cadono Store: Elena (card), Davide (card), Giorgio (card), Nina (card), Pietro (card), Pietro finito (card), Rita (card), Carlo (card), Vera (card) [9 test]
- **R24** · L4 · «Il tuo coach» maiuscolo a metà frase → cadono client-store: prodotti · Store: Elena (card), Davide (card), Pietro (card), Pietro finito (card) [5 test]
- **R25** · S1 · l'abbonamento col rinnovo che non continua (solo il blocco dopo) → cadono Store: Marta (validità, pagamento=Store) [2 test]
- **R26** · S2 · il riepilogo della proroga senza i 30 giorni → cadono Store: Marta (validità), Luca (validità), Bruno (validità) [3 test]
- **R27** · S3 · il riquadro della proroga uguale a quello senza → cadono Store: Marta (validità), Luca (validità), Bruno (validità) [3 test]
- **R28** · R1 · il numero dopo l'acquisto senza l'acquisto → cadono Store: Giulia (riepiloghi), Marta (riepiloghi), Luca (riepiloghi), Sara (riepiloghi), Paola (riepiloghi), Anna (riepiloghi), Bruno (riepiloghi) [7 test]
- **R29** · R2 · il numero dopo l'acquisto con getBookState e la riga nuova → cadono Store: Luca (riepiloghi) [1 test]
- **R30** · R3 · «crediti … disponibili» anche per uno → cadono Store: Marta (riepiloghi), Luca (riepiloghi), Sara (riepiloghi), Paola (riepiloghi), Anna (riepiloghi), Bruno (riepiloghi) [6 test]
- **R31** · P1 · i pacchetti in un'altra valuta → cadono client-store: prodotti; prodotti con type; prodotti col coach; due tipologie omonime · Store: Giulia (riepiloghi), Marta (riepiloghi), Luca (riepiloghi), Sara (riepiloghi), Paola (riepiloghi), Anna (riepiloghi), Bruno (riepiloghi) [11 test]
- **R32** · P2 · i pacchetti non attivi → cadono client-store: prodotti; prodotti con type; prodotti col coach; due tipologie omonime · Store: Giulia (riepiloghi), Marta (riepiloghi), Luca (riepiloghi), Sara (riepiloghi), Paola (riepiloghi), Anna (riepiloghi), Bruno (riepiloghi) [11 test]
- **R33** · P3 · «Più conveniente» anche a pari prezzo per credito → cadono client-store: PACKS_TIE [1 test]
- **R34** · P4 · «Più conveniente» anche da solo → cadono client-store: prodotti; PACKS_TIE [2 test]
- **R35** · P5 · il prezzo per credito anche per un credito solo → cadono client-store: prodotti; PACKS_TIE [2 test]
- **R36** · P6 · la tipologia di type non in testa → cadono client-store: prodotti con type [1 test]
- **R37** · P8 · la descrizione di soli spazi tenuta com'è → cadono client-store: PACKS_TITLED [1 test]
- **R38** · P9 · senza « · si prenota con …» → cadono client-store: prodotti; prodotti col coach [2 test]
- **R39** · P10 · i centesimi sempre scritti → cadono client-store: euro(4000); euro(9900); prodotti; PACKS_TIE; acquisti di Giulia; acquisto senza prezzo; acquisto di tipologia assente · Store: Giulia (acquisti, riepiloghi), Marta (riepiloghi), Luca (riepiloghi), Sara (riepiloghi), Paola (riepiloghi), Anna (riepiloghi), Bruno (riepiloghi) [15 test]
- **R40** · B1 · i crediti del coach fra gli acquisti → cadono client-store: acquisti di Giulia; acquisto senza prezzo · Store: Giulia (acquisti) [3 test]
- **R41** · B2 · gli acquisti dei blocchi prima → cadono client-store: acquisti di Giulia; acquisto senza prezzo · Store: Giulia (acquisti) [3 test]
- **R42** · B3 · gli acquisti dal più vecchio → cadono client-store: acquisti di Giulia; acquisto senza prezzo · Store: Giulia (acquisti) [3 test]
- **R43** · B4 · il prezzo anche quando manca → cadono client-store: acquisto senza prezzo [1 test]
- **R44** · E1 · l'attesa anche a 20 secondi esatti → cadono client-store: esito attesa/ritardo [1 test]
- **R45** · E2 · senza session l'acquisto non si trova → cadono client-store: findPurchase per tipologia; esito senza sessione [2 test]
- **R46** · E3 · senza session, anche un acquisto di 16 minuti fa → cadono client-store: findPurchase per tipologia; esito di 16 minuti fa [2 test]
- **R47** · E4 · con una session diversa, l'acquisto della tipologia → cadono client-store: findPurchase con sessione; esito con sessione diversa [2 test]
- **R48** · E5 · «Prenota ora» anche per una tipologia del coach → cadono client-store: esito del test funzionale [1 test]
- **R49** · E6 · «Ora ne hai» con la sola quantità → cadono client-store: esito arrivato; esito senza doppio conto; esito senza sessione; esito di 16 minuti fa; esito del test funzionale; esito di Luca [6 test]
- **R50** · E7 · «Ora ne hai» col numero di Prenota di adesso, riga dentro → cadono client-store: esito senza doppio conto; esito di Luca [2 test]
- **R51** · E8 · «Ora ne hai» con la riga contata due volte → cadono client-store: esito arrivato; esito senza sessione; esito di 16 minuti fa; esito del test funzionale; esito di tipologia assente [5 test]
- **R52** · X1 · l'errore del server senza trim → cadono client-store: storePayError (frasi) [1 test]
- **R53** · X2 · ogni errore del server mostrato com'è → cadono client-store: storePayError (generico) [1 test]
- **R54** · Q1 · type qualunque → cadono client-store: storeSearch (altri valori) [1 test]
- **R55** · Q2 · session qualunque → cadono client-store: storeSearch (altri valori) [1 test]
- **R56** · Q3 · booster qualunque → cadono client-store: storeSearch (buoni); storeSearch (altri valori) [2 test]
- **R57** · Q4 · l'id di Stripe col trattino o vuoto → cadono client-store: storeSearch (altri valori) [1 test]
- **R58** · N1 · la quantità della campanella anche come testo → cadono notifications: campanella quantitaTesto [1 test]
- **R59** · N2 · la quantità della campanella anche non intera → cadono notifications: campanella quantitaMezza [1 test]
- **R63** · F1 · la vendita chiusa anche con 7 giorni esatti (<=) → cadono vendita: 09-28→10-05; 12-28→01-04 · pagamento: 7 giorni esatti, senza il blocco dopo; scadenza dei 7 giorni · la Home di Paola · Store: Paola (card, validità, riepiloghi, pagamento=Store) [10 test]
- **R64** · F2 · la vendita chiusa anche se il percorso continua → cadono vendita: 09-28→10-04 continua; 09-28→09-28 continua · pagamento: dopo con lo stesso numero; dopo completato; abbonamento col rinnovo, senza il dopo; finisce oggi; le scadenze; inverno · rifiuti: l'ultima settimana, col blocco dopo; l'ultima settimana di un abbonamento col rinnovo · client-book: Prenota: Marta · canBuyBooster: l'ultimo giorno col dopo; l'ultimo giorno col rinnovo · la Home di Marta · la Home di Luca · Store: Marta (card, validità, riepiloghi, pagamento=Store), Luca (card, validità, riepiloghi, pagamento=Store), Bruno (card, validità, riepiloghi, pagamento=Store) [29 test]
- **R65** · F3 · la vendita chiusa anche per un blocco già finito → cadono vendita: 09-28→09-27 [1 test]
- **R66** · F4 · canBuyBooster che ignora la vendita chiusa → cadono canBuyBooster: vendita chiusa; z1, l'ultimo giorno · la Home di Giorgio · Store: Giorgio (card, validità, riepiloghi, pagamento=Store), Rita (card, validità, riepiloghi, pagamento=Store), Vera (card, validità, riepiloghi, pagamento=Store) [16 test]
- **R66b** · F4 · getBookState che non passa la vendita chiusa → cadono canBuyBooster: z1, l'ultimo giorno · la Home di Giorgio · Store: Giorgio (card, validità, riepiloghi, pagamento=Store), Rita (card, validità, riepiloghi, pagamento=Store), Vera (card, validità, riepiloghi, pagamento=Store) [15 test]
- **R67** · F5 · il pagamento vende anche nell'ultima settimana (il caso fine non scatta) → cadono pagamento: dopo annullato; abbonamento senza rinnovo; fisso col rinnovo acceso; l'ultimo giorno, senza il blocco dopo · rifiuti: l'ultima settimana; l'ultimo giorno; l'ultima settimana, col blocco dopo annullato · Store: Giorgio (pagamento=Store), Rita (pagamento=Store), Vera (pagamento=Store) [10 test]
- **R68** · F6 · il rifiuto dell'ultima settimana col motivo del blocco → cadono rifiuti: l'ultima settimana; l'ultimo giorno; l'ultima settimana, col blocco dopo annullato · Store: Giorgio (pagamento=Store), Rita (pagamento=Store), Vera (pagamento=Store) [6 test]
- **R69** · F7 · la card dell'ultima settimana persa (diventa altro) → cadono Store: Giorgio (card), Rita (card), Vera (card) [3 test]
- **R70** · F8 · «oggi» non detto l'ultimo giorno → cadono Store: Vera (card) [1 test]
- **R71** · F9 · il «continua» dell'app senza il blocco dopo (getBookState e Store) → cadono canBuyBooster: l'ultimo giorno col dopo · la Home di Luca · Store: Luca (card, validità, riepiloghi, pagamento=Store), Bruno (card, validità, riepiloghi, pagamento=Store) [11 test]
- **R71a** · F9 · il «continua» di getBookState senza il blocco dopo → cadono canBuyBooster: l'ultimo giorno col dopo · la Home di Luca · Store: Luca (card, validità, riepiloghi, pagamento=Store), Bruno (card, validità, riepiloghi, pagamento=Store) [11 test]
- **R72** · F10 · la frase dell'ultima settimana fuori da STORE_PAY_ERRORS → cadono client-store: storePayError (frasi); storePayError (ultima settimana) [2 test]

**Le prove del pagamento**, in più (la funzione vera non ha test nel repo). È una prova di fumo di `booster-checkout` con Deno, in `scratchpad\fumo\`:
- `deno run --no-config --cached-only --allow-env --allow-read=<cartella delle funzioni>,. --import-map=import_map.json fumo.ts <index.ts>`, **senza permesso di rete**;
- Stripe e Supabase finti al posto dei pacchetti `npm:`, `Deno.serve` intercettato, l'orologio fermo a lunedì 28/09 10:40 di Roma;
- 16 casi: Giulia, Paola, Luca e Marta comprano con la scadenza giusta; Giorgio, Rita, Vera e il dopo annullato hanno il 400 «fine»; Nina, Carlo, Pietro, un PT Pack nell'ultima settimana e un profilo che manca hanno il 400 del blocco; più il 500 di una lettura persa, il 401 e il `package_type` che manca.

| Codice | Esito |
|---|---|
| ramo | **16 su 16** |
| `a3f71db` (estratto con `git show`) | **12 su 16**: i quattro casi della decisione 14 vendono e aprono una sessione di Stripe |
| copia del ramo con `refusal === "fine"` rotto | 12 su 16: i quattro casi rispondono con la frase del blocco |

**R60-R62 e R73, nel browser** (`scratchpad\banco\rosse-browser.mjs`). Ogni prova rompe il file prima di avviare Vite, gira solo sulle B interessate, rimette il file e ne controlla l'impronta:

| Prova | Cosa ho rotto | Esito |
|---|---|---|
| R60 | `client.store.tsx` senza la rilettura degli acquisti durante l'attesa | B6 **rosso**: 9 su 16 (10 alla seconda corsa). 12 s dopo la riga il testo è ancora quello d'attesa; zero letture durante l'attesa; due righe acquistate invece di tre; cadono anche le varianti (b) e (c) |
| R61 | `canBuyBooster` con la regola di prima della 06, un blocco `active` qualunque | B11 **rosso**: 4 su 9. Nina e Giorgio hanno «Acquista un Booster» nella Home; Giorgio anche «Acquista» sulla PT e nel foglio di Prenota |
| R62 | il toast dell'annullamento senza togliere `booster` | B8 **rosso**: l'indirizzo tiene `booster=cancel`, e ricaricando il toast torna |
| R73 | `canBuyBooster` senza la decisione 14 | B10, B11 e B17 **rossi**: 16 su 23. Lo Store di Giorgio mostra i prodotti, la sua Home e Prenota offrono «Acquista», lo Store di Vera vende |

Rimessi i file, le stesse B sono verdi nel giro intero.

In una delle due corse di R60 è caduto anche B6 (a): dopo «Indietro» la pagina aveva un foglio aperto. Alla seconda corsa no. Sul codice del ramo B6 (a) l'ho ripetuta 10 volte (`giro06.mjs solo=B6A ripeti=10`): 10 su 10 verde, con la cronologia di Prenota a 3 voci (l'esito sostituito, non aggiunto). Più le quattro corse di B6.

## 8 · IL BROWSER

**Il banco** è in `scratchpad\banco\`: la copia di `app\banco-cli-2026-09-30` con `lib-windows.mjs` come `lib.mjs`. In più, solo nella copia:
- `fake06.mjs`: il finto della 04, più `booster-checkout` comandato dalla prova (stato, corpo, ritardo), `checkout.stripe.com` intercettato e contato a parte, l'ora d'arrivo delle richieste, e `snapshotAtStart` (una lettura vede i dati del momento in cui parte);
- `dati-cli-06-ripresa-vera.json`, i dati della 06 più Vera;
- `seed05.mjs` con l'id di Vera;
- `giro06.mjs` (B1-B17), `cattura06.mjs` (B15), `rosse-browser.mjs`.

Il resto: Playwright della cache di npx, `chromium_headless_shell-1200`, Vite col Supabase finto, ora fissa lunedì 28/09/2026 10:40 a Roma. Le schermate sono in `scratchpad\banco\giro06-finale\`.

**Giro intero sul ramo (`731a136`): 127 su 127.** Per B: B1 9, B2 3, B3 5, B4 7, B5 3, B6 13, B7 3, B8 4, B9 25, B10 12, B11 7, B12 5, B13 20, B14 7, B16 2, B17 2.

- **B1** · Giulia a 390: `h1` e sottotitolo, la validità, «Acquistati in questo blocco» con le due righe, i tre `article` nell'ordine single, pack, triage coi testi delle attese, «Più conveniente» solo su pack. Ogni «Acquista» è descritto dal titolo della sua card; in fondo la nota di Stripe; nessun testo vecchio. Confronto con `06-booster-01-pagina.png`: uguale, salvo i titoli composti (manca la colonna `title`), le descrizioni assenti e i caratteri di ripiego (§5 della 06). `B1-giulia-390.png`.
- **B2** · i tre riepiloghi hanno titolo, prezzo, validità, «Dopo l'acquisto avrai 4/6/2…» e «Paga … con Stripe», l'unico pulsante pieno. «Indietro» rimette il focus sull'«Acquista». `B2-riepilogo-single-390.png`, uguale a `06-booster-02-riepilogo.png` salvo la riga «simulato».
- **B3** · mentre aspetta (1,5 s di ritardo del finto) «Paga» è `aria-disabled="true"`, mai `disabled`, con l'indicatore e col focus. Il secondo tocco non fa chiamate: `booster-checkout` una volta, corpo `{"package_type":"single"}`, senza `client_id`. Poi `https://checkout.stripe.com/c/pay/cs_test_banco` (intercettato). Con `https://evil.example/pay` nessuna navigazione e il toast generico.
- **B4** · sei casi, ognuno col suo toast, il foglio che resta aperto, «Paga» attivo e il focus su «Paga»: il 400 del blocco, **il 400 dell'ultima settimana (la frase com'è)**, il 400 «Invalid…», il 500 vuoto, il 500 non JSON e il 500 del pagamento.
- **B5** · V12: il finto passa Giulia ad `archived` e un `visibilitychange` fa rileggere il profilo. Il foglio si chiude, resta la card «altro», il focus va sul suo `h2`.
- **B6** · il ritorno con la riga che arriva:
  - il foglio parte col testo d'attesa in `role="status"` `aria-live="polite"`. Le letture di `extra_credits` partono a 1,51 s e 3,51 s; la riga è scritta a 3,02 s, l'arrivo è a 3,53 s, e dopo nessuna lettura. Ci sono `CircleCheck` e «Prenota ora» → `/client/book?eventType=<PT>`; «Acquistati» ha tre righe, la prima «+1 Personal Training · lun 28 set · 40 €». «Chiudi» porta a `?type=<PT>` e il focus sull'`h1`; ricaricata, nessun foglio. `B6-arrivato-390.png`, uguale a `06-booster-03-pagamento-completato.png` salvo «Marco» → «Il tuo coach»;
  - (a) «Prenota ora» porta a Prenota, e da lì Indietro torna a `/client/store?type=<PT>` senza `booster` né `session`, senza foglio;
  - (b) con le letture lente (3 s) la riga a 3,01 s arriva a 4,56 s, con una lettura sola (1,53→4,54 s) e nessuna annullata;
  - (c), in più: le letture vedono i dati alla partenza. Una lettura è in volo (1,52→4,54 s, senza la riga), la successiva (5,52→8,53 s) porta la riga, arrivo a 8,54 s; nessuna lettura annullata.
- **B7** · le letture a 1,52, 3,52 … 19,52 s, dieci in tutto; il ritardo a 19,52 s, poi nessuna lettura. «Chiudi» chiude.
- **B8** · il toast una volta; l'indirizzo perde `booster` e tiene `type`; ricaricata, nessun toast; la pagina è quella di B1.
- **B9** · Marta, Luca, Sara e **Paola** (fino a lunedì 5 ottobre, 7 giorni esatti): la validità, i prodotti e i tre riepiloghi di ognuna come nelle attese (Luca 9, 11, 1); nessuna ha acquisti. Giulia con `?type=<test>`: triage in testa col bordo del primario.
- **B10** · Elena, Davide, Nina e **Giorgio** vedono solo la card, col testo delle attese («Il tuo percorso finisce sabato 3 ottobre, …»): zero pulsanti e link, zero chiamate a `booster-checkout`. `B10-*.png`.
- **B11** · le Home di Nina e Giorgio finiscono con «Per altri crediti scrivi al tuo coach.» come testo, senza link allo Store né «Acquista». Prenota non ha link allo Store; il foglio della PT esaurita di Giorgio dice «Per altre sessioni scrivi al tuo coach.» senza «Acquista un Booster».
  - `giro05-cowork.mjs` con le attese aggiornate (in `attese-browser-cli-05-ripresa-06.json`: il fondo dei crediti di Nina e Giorgio, la riga PT di Giorgio) → **154 su 154**;
  - con le attese originali della 05 → 104 su 107 nei testi, e cadono proprio quelle tre.
- **B12** · a 1440 «Attività clienti» mostra «Acquisto Booster», «Giulia Bianchi · +3 Sessione PT», `Sparkles` e «· Apri il profilo». Il clic chiama `mark_notification_read` con quell'id e apre `/trainer/clients/<Giulia>`. La `booking.created` apre `/trainer/calendar?date=2026-09-30`. A 390 il foglio «Notifiche» ha titolo e testo, e il tocco apre il profilo.
- **B13** · a 320 niente scorrimento orizzontale per le nove persone, per Vera e per i due fogli. A 1280 la colonna è di 560. Nessun `fixed`; al più un pulsante pieno per card. I contrasti, misurati sui colori dipinti: l'icona PT 4,55:1, l'icona del test 10,28:1 (il primario), il bianco di «Più conveniente» 11,26:1.
- **B14** · il focus: con «Indietro», Esc e trascinamento (orologio vero, per vaul) torna sull'«Acquista» che ha aperto; chiuso l'esito va sull'`h1`; mentre «Paga» aspetta resta sul pulsante.
- **B15** · il resto non cambia:
  - `giro-prenota.mjs` (02) → **82 su 82**;
  - `giro-sessioni.mjs` (03) → **78 su 78**, col B7 aggiornato come nella 05 (`aria-disabled`; la copia di `app/` dava 57 e si fermava al clic su «Riprova»);
  - `giro04.mjs` (04) → **103 su 104**. Il suo B9 è rosso con le differenze giuste nell'ordine della griglia:
    `KO  B9 · le differenze: … — {"diffs":[{"day":"Mercoledì 30 settembre","plus":["09:00","11:00"],"minus":["11:15"]},{"day":"Lunedì 12 ottobre","plus":[],"minus":["09:00","15:00","18:00","10:00","11:00","16:00","17:00"]}],"giorni":12}`
    Con gli orari ordinati (`giro04-ordinati.mjs`, due `.sort()`) è verde (§11);
  - `cattura06.mjs` sulla base `a9bf1de` e sul ramo, con gli stessi dati e la stessa ora:
    - il Profilo ha le stesse due varianti (811 caratteri ×4 e 837 ×1 su cinque corse, la corsa nota della base);
    - Notifiche ha lo stesso testo;
    - `/trainer` a 1440 e a 390 è identico **byte per byte** (`51a6cba2…`, `c1156f28…`).
- **B16** · zero richieste esterne bloccate e zero funzioni server, in tutti i giri. La pagina di Stripe è intercettata una volta (B3). Le chiamate registrate dal finto: `booster-checkout` POST `{"package_type":"single"}` due volte in B3 e sei in B4, altrimenti mai; `mark_notification_read` due in B12; le letture di `booster_packs` due a pagina (lo Store e i titoli della shell); quelle di `extra_credits` 13 in B6 e 11 in B7.
- **B17** · nella mia copia, una persona come Vera (fisso, solo il blocco dal 01/09 al 28/09):
  - lo Store mostra solo la card «Il tuo percorso finisce oggi, e nell'ultima settimana di un percorso i Booster non si acquistano. Per una sessione in più, o per continuare, scrivi al tuo coach.», senza pulsanti;
  - la Home non ha «Acquista» né link allo Store.

## 9 · NON FATTO

- `deno check` delle due funzioni: si ferma sui pacchetti `npm:` (nel repo `stripe` non c'è, e non ho scaricato niente). C12 l'ho fatto con `bun build`, che controlla sintassi e import, non i tipi. In più c'è la prova di fumo con Deno (§7) e `deno check` del file condiviso.
- Niente altro del prompt è rimasto indietro.

## 10 · DIVERGENZE

- **Il clone all'avvio** era su `main` (§1, passo 0).
- **Il file condiviso.** Il ramo simulato aveva `currentBlock` più le due funzioni; qui c'è una decisione interna sola (`decide`). `boosterPurchase` è `null` esattamente quando `boosterRefusal` non lo è, per costruzione. `daysLeft` conta i giorni per `boosterValidity` e per `boosterSaleClosed`. I nomi, le firme e i testi del §4 sono quelli del contratto.
- **Lo Store** ha `pathContinues`, interna: un «continua» solo per la card e per la validità (il ramo simulato lo scriveva due volte).
- **C4** · `client-book.ts` è a +24 −13 sulla base: le 20 e 13 del ramo simulato, più quattro righe di commento.
- **`booster-checkout` senza profilo:** `refusal` è `null` e la frase è quella del blocco in corso, come chiede il §4.4. Il ramo simulato usava `"percorso"`; la risposta è la stessa.
- **Il commento del webhook** dice anche che a ogni tentativo la tipologia si cerca di nuovo. L'esempio del §4.5, «riceve sempre lo stesso esito», non è sempre vero (§1, passo 9).
- **I test in più del prompt:**
  - un test che lega `boosterPurchase` e `boosterRefusal` sui dieci rifiuti;
  - per ognuna delle sedici persone, la card «fine» insieme al rifiuto «fine» del pagamento;
  - `storePayError` con la frase nuova, da sola;
  - la chiamata diretta `canBuyBooster(…, true, true)`.
- **Il banco** (§8): il B7 di Sessioni aggiornato, le attese della Home della 05 aggiornate, il B9 della 04 confrontato anche in ordine, la variante (c) di B6, B6A ripetuta, e la persona di B17 solo nella mia copia.

## 11 · TROVATI E NON TOCCATI

- **Il file caduto nella suite** (una volta, con la RAM fisica a 0,1 GB): `FAIL src/lib/clock.test.ts > V8 · un'ora sola > useNow è definito una volta, in hooks/use-now.ts`, `Error: Test timed out in 5000ms.` (6485 ms). Il test legge tutti i file di `src`; rilanciato, è verde. Non tocca la 06.
- **Il fuso dell'«oggi»** (revisore, punto 1; misurato). L'app conta i giorni col fuso del telefono (`toIsoDate(now)`, il contratto del §4.2), il pagamento con quello di Roma. Con un test temporaneo lanciato da PowerShell, il blocco che finisce domenica 04/10:
  - a New York, domenica 27/09 alle 18:30 (a Roma già lunedì): l'app compra, il pagamento risponde «fine» (la frase arriva nel toast);
  - a Tokyo, lunedì 28/09 alle 06:00 (a Roma ancora domenica): l'app mostra la card «fine», il pagamento venderebbe;
  - a Roma d'accordo sempre.
  Prima c'era lo stesso scarto sulla proroga. Da decidere con la 09: «oggi» di Roma anche nell'app?
- **Il test «il pagamento decide come lo Store»** (revisore, punto 2) dà al pagamento `toIsoDate(NOW)`, non `romeDate`. Con NOW alle 10:40 il giorno è lo stesso nei tre fusi, quindi non può vedere il punto sopra.
- **Con la card «fine» sparisce «Acquistati in questo blocco»** (revisore, punto 3; verificato in `client.store.tsx:344-345`). Chi ha comprato prima nello stesso blocco, nell'ultima settimana non vede più i suoi Booster nello Store (Home e Prenota li contano ancora). La pagina, per il §4.3, non doveva cambiare.
- **La sessione di Stripe dura 24 ore** (revisore, punto 4): `booster-checkout` non passa `expires_at` a Stripe. Un checkout aperto con 7 giorni e pagato il giorno dopo chiude un acquisto nell'ultima settimana, che vale comunque fino a fine blocco (6 giorni). Era l'opzione (b) del cloud.
- **Due blocchi sovrapposti con lo stesso numero** (revisore, punto 5; dati incoerenti): p1 dal 01/09 al 31/10 e p2 dal 14/09 all'11/10, oggi 05/10. App e pagamento scelgono p2 e danno «fine» («finisce domenica 11 ottobre»), ma p1 va avanti. Sono coerenti fra loro; il testo è falso.
- **Il B9 di `giro04.mjs`** (Cowork, 01/10) confronta in ordine di ora. La griglia degli orari (`client-slot-groups.tsx`, 02) mette prima i «Consigliati» (09:00, 15:00, 18:00) e poi mattina e pomeriggio: le differenze sono giuste e il controllo è rosso. Basta ordinare `plus` e `minus` prima del confronto.
- **Il B7 di `giro-sessioni.mjs`** in `app/` si aspetta ancora `disabled`.
- **Il Profilo della base** ha ancora la sua corsa: a volte compare in più «Sessione PT 3 disponibili» (837 caratteri invece di 811), sulla base e sul ramo.

## 12 · RESTA A NICOLÒ

- Il merge della PR #84 nel ramo di integrazione `redesign/cliente-mobile`, dopo la verifica di Cowork.
- Il giro del server del 02/10/2026 con la proposta di Cowork (`app/server-cli-06-booster-2026-10-01.sql`: `booster_packs.title` e `description`, `validate_booking_extra_credits` con `expires_at`).
- Al rilascio su `main`, non prima del giro: la pubblicazione di `booster-checkout` e `stripe-webhook`, e un acquisto di prova dal suo account.
- Le decisioni dei punti del revisore lasciati (§11):
  - «oggi» di Roma anche nell'app;
  - gli acquisti del blocco sotto la card «fine»;
  - la scadenza della sessione di Stripe.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
