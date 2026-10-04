**Dove ho girato (ultimo ritorno · lato cliente · passata 06b · la chiusura della 06, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26200`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0. Nessuna installazione, nel repo né fuori.

> **In breve.** I tre punti della 06b sono fatti, e la stampa di Cowork (`app/stampa-cli-06b-2026-10-01.ts`, lanciata col suo risolutore sul mio ramo) dà **esattamente `app/atteso-cli-06b-2026-10-01.json`** in UTC, a Los Angeles e a Roma.
> - **Lo Store:** «Acquistati in questo blocco» resta sotto la card dell'ultima settimana (`storeBoughtVisible`).
> - **Le regole del coach:** un credito extra vale solo per una sessione che inizia entro la sua scadenza, in un posto solo (`extraValidAt`), quando si scala, si conta e si restituisce.
> - **L'archivio dei test del Calendario** inserisce come il trigger del 02/10.
>
> Cancelli: typecheck 0, lint 0 errori e 14 avvisi (gli stessi della base), **1239 test in 61 file** (erano 1205), build riuscita; gli otto file verdi in UTC, a Los Angeles e a Roma, con le sonde a 0, 420 e −120. Lo script dei controlli dà tutto come atteso (§6). **R1-R14 rosse** sui casi che il §7 prevede, più quattro mie (R13b, X1-X3), poi verdi. Nel browser B18, B10 e B16 **22 su 22** (B16 a zero), la 04 **104 su 104**, Sessioni **78 su 78**; R15 e R16 rosse.
>
> Un revisore in sola lettura ha trovato un punto serio, che **non ho cambiato**: `reschedule_booking` sposta ancora oltre la scadenza dell'extra, e su una sessione spostata così Annulla del coach non restituisce niente. La regola è quella del prompt e di `HANDOFF-CALENDAR.md` §6, e si chiude con la correzione di `reschedule_booking` nel giro del 02/10 (§11, punto 1). Dalla revisione: commenti veri e test più forti, in un commit in più (`b937554`).
>
> Workflow: 0. Agenti: 1 (il revisore).

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base e il ramo** (§2). Nessun commit.
   - Ambiente: la riga in testa (PC).
   - ⚠️ All'avvio il clone era su `main` @ `3d29634` (pulito, 64 commit dietro `origin/main`), non su `redesign/cliente-06-booster` @ `f4d9987` come l'aveva misurato Cowork alle 16:45. Il reflog: `checkout: moving from redesign/cliente-06-booster to main` alle 23:33:49 del 01/10, 42 secondi prima del ramo nuovo. Non conta: il ramo nasce dal remoto.
   - `git fetch origin` → `a9bf1de..d15f6d4  redesign/cliente-mobile -> origin/redesign/cliente-mobile`; `git rev-parse --short origin/redesign/cliente-mobile` → **`d15f6d4`** (non più avanti), albero `3bdabc9`, lo stesso di `f4d9987`.
   - `git switch --no-track -c redesign/cliente-06b-chiusura origin/redesign/cliente-mobile` → `d15f6d4`, nessun upstream.
   - Le sonde del fuso, da PowerShell (`node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"`): `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `d15f6d4`, senza toccare niente: typecheck 0 errori; lint 0 errori e **14** avvisi; **1205 test in 61 file**; build riuscita.
   - Lo script dei controlli su `d15f6d4` dà la colonna «oggi», uguale riga per riga a quella del §6 del prompt.
1. ☑ **Lo Store** (§4.1). `5f87e9c`. `storeBoughtVisible` in `src/lib/client-store.ts:396`; la pagina la chiama nei due rami (`src/routes/client.store.tsx:350` e `:357`). `client-store.test.ts` ha 123 test (erano 118), verde. D0 `storeBoughtVisible: 1`, D2 `3 · 0 · 2` e `0`.
   - ⚠️ Due commenti in più del prompt. La testa di `client-store.ts` nomina `storeBoughtVisible`. Quella della pagina (`src/routes/client.store.tsx:5-7`) ora dice che nell'ultima settimana chi non compra vede anche gli acquisti del blocco; prima diceva «Chi non compra vede solo il perché», che diventava falso. Nella pagina non cambia nient'altro.
2. ☑ **La scadenza nelle regole del coach** (§4.2). `3a49ca6`.
   - Prodotto: `extraValidAt` (`src/lib/credit-order.ts:201`), le due firme a tre argomenti, le quattro chiamate, `availableCredits`, i commenti di testa di `credit-order.ts` e `cancel-session.ts`.
   - Test: i casi del §5.2; nei test di prima solo il terzo argomento e `expires_at`.
   - I sette file (`credit-order`, `assign-event`, `reference-block`, `profile-session`, `cancel-session`, `session-create`, `session-edit`) verdi. D3 `3 · 1 · 0`, D4 le quattro righe attese, D8 vuoto.
   - ⚠️ In più del prompt:
     - in `credit-order.test.ts` un caso che prova che `extraValidAt` confronta istanti e non testi (`+00:00` di PostgREST contro la `Z` di `toISOString`);
     - in `assign-event.test.ts` `memoryAssignStore` prende `blocks` facoltativo, per il «cliente senza blocchi» del §4.2.
3. ☑ **L'archivio in memoria** (§4.3). `f73e9bb`.
   - `takeExtraCredit` come `validate_booking_extra_credits` del 02/10, con le stesse due frasi (`src/lib/testing/memory-calendar-store.ts:221-254`). `reschedule` non cambia.
   - I casi del §5.3 sono in `session-create.test.ts`; questo file e `session-edit.test.ts` sono verdi. D5 `1 · 1 · 1`, `0`, `0`.
   - ⚠️ Il commento di testa dice «se gli extra con residuo sono tutti scaduti per quella data lo dice», non «se l'unico extra con residuo è scaduto». È più preciso: la frase scatta anche con più extra, tutti scaduti.
4. ☑ **I commenti e il messaggio del cliente** (§4.4). `b02bc91`. I testi del §4.4 com'erano nel ramo simulato. Il caso del §5.4 è in `client-book.test.ts`. D6 `0 file` e quattro volte `0`; D7 come atteso.
5. ☑ **I cancelli e le prove rosse** (§2, §7). Nessun commit.
   - I cancelli, gli otto file nei tre fusi e R1-R14 sono misurati sull'ultimo commit di codice, `b937554` (§4, §7).
   - ⚠️ Il primo giro delle prove rosse è caduto al caricamento: «The service was stopped» di esbuild su cinque file, zero test falliti. Intanto era partito un gioco (`tlou-i`) e la memoria impegnabile era scesa da 26 a 6,4 GB. La stessa suite lanciata a mano dava 1236 su 1236. Ho aggiunto all'arnese un nuovo tentativo, contato, per un giro che cade al caricamento; nel giro finale non ne è servito nessuno.
6. ☑ **Il browser** (§8): B18, B10, i due giri del banco, B16, R15 e R16 (§8). Nessun commit: i file del banco stanno nello scratchpad.
7. ☑ **Chiusura** (§10). Lo script dei controlli a lavoro committato (§6). Poi questo file, committato nell'ultimo commit del ramo («Riscrive docs/ULTIMO-RITORNO.md per la passata 06b»), `git push -u origin redesign/cliente-06b-chiusura` e la PR (§2).
8. ☑ **Passo aggiunto: la revisione.** `b937554`. Un revisore in sola lettura (un agente, circa 12 minuti) ha letto una fotografia del ramo in `b02bc91`, presa nello scratchpad con `git archive`, insieme al diff e allo SQL del 02/10. Ha dato 11 punti. Ho cambiato quello che dava torto ai commenti o ai test; il resto è in §11.
   - **Commenti:** `credit-order.ts:15-24` e il commento di `pickRefundExtraCredit` (`:208-215`) dicevano che una sessione la paga sempre un extra valido alla sua data. Dopo uno Sposta oltre la scadenza non è vero: ora lo dicono. Anche l'esito «none» di `cancel-session.ts:171-176` comprende «nessun extra impegnato che valga alla data della sessione».
   - **La seconda frase dell'archivio non si vedeva:** `coachWriteError` rende le due frasi lo stesso messaggio per il coach. Togliendo il ramo `left.length > 0`, o scambiando le frasi, i test restavano verdi. Ora `insertSession` dell'archivio tiene l'errore del trigger in `cause` (`memory-calendar-store.ts:446`), e i casi 3, 4 e 6 controllano anche quale frase ha detto. Sono X1 e X2 del §7, rosse.
   - **Test che invecchiano:** con un «oggi» al posto della data della sessione, dal 4/10 (dall'11/10 per A11) diversi casi sarebbero passati per caso. Nei blocchi della 06b l'orologio è fermo al 1/10/2026, con `vi.useFakeTimers({ toFake: ["Date"] })` e `vi.setSystemTime`, API misurate in `node_modules/vitest/dist/index.d.ts` (vitest 5.0.2). È X3, rossa.
   - **Flussi senza prova:** Elimina, Scollega, e Annulla seguito da Rimetti in agenda, ora con scadenze vere.

## 2 · RAMO E COMMIT

- Ramo: `redesign/cliente-06b-chiusura`, da `origin/redesign/cliente-mobile` @ `d15f6d4`. L'ultimo commit di codice è `b937554`; dopo c'è solo il commit di questo file («Riscrive docs/ULTIMO-RITORNO.md per la passata 06b»).
- I commit del ramo, dal primo:
  - `5f87e9c` Store: gli acquisti del blocco restano sotto la card dell'ultima settimana
  - `3a49ca6` Coach: un credito extra vale solo per una sessione entro la sua scadenza
  - `f73e9bb` Test del Calendario: l'archivio in memoria inserisce come il server del 02/10
  - `b02bc91` Commenti: la scadenza degli extra dopo il giro del server del 02/10
  - `b937554` Revisione: i commenti dicono cosa succede dopo uno Sposta, i test reggono nel tempo
  - il commit di questo file
- PR: **#85**, verso `redesign/cliente-mobile`, aperta e **non** unita, con questo file come descrizione.

## 3 · MANIFESTO

- **MODIFICATI (21):**
  - lo Store: `src/lib/client-store.ts`, `src/lib/client-store.test.ts`, `src/routes/client.store.tsx`;
  - le regole del coach: `src/lib/credit-order.ts`, `src/lib/assign-event.ts`, `src/lib/cancel-session.ts`, `src/lib/profile-session.ts`, `src/lib/session-create.ts`, con `credit-order.test.ts`, `assign-event.test.ts`, `cancel-session.test.ts`, `profile-session.test.ts`, `session-create.test.ts`, `reference-block.test.ts`;
  - l'archivio: `src/lib/testing/memory-calendar-store.ts`;
  - i commenti: `src/lib/booking-rules.ts`, `src/lib/client-credits.ts`, `src/lib/queries.ts`, `src/lib/client-book.ts`, più il caso in `src/lib/client-book.test.ts`;
  - `docs/ULTIMO-RITORNO.md`.
- **NUOVI:** nessuno (D1 vuoto, 61 file di test come prima).
- **NEL PERIMETRO MA NON TOCCATI:** nessuno, tutti i file dell'elenco di D1 sono cambiati. `design_handoff_cliente_mobile/PIANO.md` non cambia (la riga 06 è `[x]` dalla #84), come `package.json`, `bun.lock` e `supabase/` (D9, D10).

## 4 · I CANCELLI

| | su `d15f6d4` (passo 0) | alla fine, su `b937554` |
|---|---|---|
| typecheck | 0 errori | 0 errori |
| lint | 0 errori e 14 avvisi | 0 errori e 14 avvisi, riga per riga gli stessi della base |
| test | **1205 in 61 file**, tutti verdi | **1239 in 61 file**, tutti verdi |
| build | riuscita | riuscita |

- I 34 test in più: `client-store` 5, `credit-order` 4, `assign-event` 4, `profile-session` 4, `cancel-session` 4, `session-create` 12, `client-book` 1. In `reference-block.test.ts` cambia solo il dato (`expires_at`).
- **I tre fusi**, da PowerShell, una corsa per fuso con la sonda prima (`$env:TZ = "…"; node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"; bun run test <gli otto file>`). In tutti e tre: `Test Files 8 passed (8) · Tests 308 passed (308)`.
  - `UTC` → sonda `0`;
  - `America/Los_Angeles` → sonda `420`;
  - senza `TZ` (Roma) → sonda `-120`.
- **La stessa sonda dentro i worker di vitest:** un test temporaneo `src/lib/zz-sonda-fuso.test.ts` scriveva l'offset in un file dello scratchpad, ed è stato cancellato subito. Ha dato `SONDA 0 UTC`, `SONDA 420 America/Los_Angeles`, `SONDA -120 (senza TZ)`.
- **La stampa di Cowork sul ramo:**
  - comando, da PowerShell, con `REPO` sul clone: `node --experimental-transform-types --no-warnings --import <risolutore>/register.mjs stampa-cli-06b-2026-10-01.ts`, con stampa e risolutore copiati da `app\` nello scratchpad;
  - nei tre fusi l'uscita è **uguale** ad `app/atteso-cli-06b-2026-10-01.json`, confronto JSON contro JSON.

## 5 · I PEZZI PER LE PASSATE DOPO

- `storeBoughtVisible(lock: Pick<StoreLock, "kind"> | null, bought: readonly StoreBoughtRow[]): boolean` (`src/lib/client-store.ts:396`): `bought.length > 0 && (lock === null || lock.kind === "fine")`.
- `extraValidAt(credit: Pick<OrderedExtraCredit, "expires_at">, scheduledAt: string): boolean` (`src/lib/credit-order.ts:201`): `expires_at >= scheduledAt` come istanti, all'istante della scadenza compreso. È l'unico posto della regola: D3 conta zero confronti con `expires_at` in `assign-event`, `session-create`, `profile-session` e `cancel-session`.
- `pickRefundExtraCredit(eventTypeId, credits, scheduledAt)` e `pickConsumeExtraCredit(eventTypeId, credits, scheduledAt)` (`credit-order.ts:216` e `:234`): gli extra della tipologia che valgono alla data, il più vicino a scadere. Il rimborso restituisce `null` quando nessun extra impegnato vale alla data della sessione.
- `availableCredits`: negli argomenti gli extra sono `Pick<OrderedExtraCredit, "event_type_id" | "quantity" | "quantity_booked" | "expires_at">` (`assign-event.ts:172-191`), e `fromExtras` conta solo quelli validi alla data.
- **L'archivio (`memory-calendar-store.ts`):**
  - frase nuova «Il credito extra non vale per questa data: scade prima della sessione.» quando ci sono extra con residuo ma nessuno vale alla data;
  - altrimenti la frase di prima;
  - l'errore di `insertSession` porta in `cause` quello del trigger, con `code` e `message`.
- Nei test: `fixClockBeforeExpiries()` in `assign-event.test.ts` e `session-create.test.ts`, e lo stesso `beforeEach`/`afterEach` negli altri blocchi della 06b, per fermare `Date` al 1/10/2026.

## 6 · ACCEPTANCE

Lo script di Cowork (`bash "C:/Coworks/NC App Development/app/controlli-cli-06b-2026-10-01.sh"`, contro `origin/redesign/cliente-mobile`), sul passo 0 e alla fine a lavoro committato (`b937554`, prima del commit di questo file).

| | «oggi», su `d15f6d4` | alla fine | atteso |
|---|---|---|---|
| D0 | `0 · 0` | `1 · 1` | `1 · 1` |
| D1 | nessuna riga | nessuna riga | nessuna riga |
| D2 | `0 · 1 · 1`, `0` | `3 · 0 · 2`, `0` | `3 · 0 · 2`, `0` |
| D3 | `0 · 0`, `0` | `3 · 1`, `0` | almeno `3`, almeno `1`, `0` |
| D4 | le quattro chiamate a due argomenti | le quattro righe attese | le quattro righe attese |
| D5 | `0 · 1 · 1`, `0`, `0` | `1 · 1 · 1`, `0`, `0` | `1 · 1 · 1`, `0`, `0` |
| D6 | `4 file`, quattro volte `0` | `0 file`, quattro volte `0` | `0 file`, `0` |
| D7 | tutto `0`, salvo `client-store` 11/10 `2` | vedi sotto | i minimi del §6 |
| D8 | nessuna riga | nessuna riga | nessuna riga |
| D9, D10 | nessuna riga | nessuna riga | nessuna riga |
| D11 | nessuna riga | `src/routes/client.store.tsx` | solo quella |
| D12 | nessun commit | cinque commit (§2) | i passi 1-4 (⚠️ più `b937554`, §10) |

L'uscita intera, alla fine:

```
== D0 · i due nomi nuovi
storeBoughtVisible: 1 · extraValidAt: 1
== D1 · il manifesto (file cambiati fuori dall'elenco del §4)
(fine D1)
== D2 · lo Store: la regola nel file delle regole, la pagina la chiama
pagina: storeBoughtVisible 3 · bought.length 0 · StoreBoughtCard 2
calcoli in pagina e componenti: 0
== D3 · la regola della scadenza in un posto (credit-order.ts)
credit-order: extraValidAt 3 · assign-event: extraValidAt 1
confronti di expires_at fuori da credit-order (assign-event, session-create, profile-session, cancel-session): 0
== D4 · le chiamate, col giorno della sessione (fuori da credit-order.ts e dai test)
src/lib/assign-event.ts: pickConsumeExtraCredit(type.id, await store.listExtraCredits(clientId, type.id), e.scheduled_at);
src/lib/cancel-session.ts: pickRefundExtraCredit(s.event_type_id, await store.listExtraCredits(s.client_id, s.event_type_id), s.scheduled_at);
src/lib/profile-session.ts: pickConsumeExtraCredit(s.event_type_id, await store.listExtraCredits(s.client_id, s.event_type_id), s.scheduled_at);
src/lib/session-create.ts: pickConsumeExtraCredit(input.eventTypeId, input.extras, input.scheduledAt);
(fine D4)
== D5 · l'archivio in memoria come il server del 02/10
frase nuova 1 · credito esaurito 1 · nuova data 1
righe cambiate dentro reschedule (righe 244-320 della base): 0
regole del coach nell'archivio (deve restare indipendente): 0
== D6 · i commenti che dopo il 02/10 direbbero il falso
frasi vecchie: 0 file
src/lib/booking-rules.ts: righe di codice cambiate 0
src/lib/client-credits.ts: righe di codice cambiate 0
src/lib/queries.ts: righe di codice cambiate 0
src/lib/client-book.ts: righe di codice cambiate 0
== D7 · i test nuovi (i casi del §5, per le stringhe che li distinguono)
src/lib/client-store.test.ts · storeBoughtVisible 8 · extraValidAt 0 · 04/10 0 · 11/10 2 · frase nuova 0
src/lib/credit-order.test.ts · storeBoughtVisible 0 · extraValidAt 7 · 04/10 1 · 11/10 1 · frase nuova 0
src/lib/session-create.test.ts · storeBoughtVisible 0 · extraValidAt 0 · 04/10 1 · 11/10 1 · frase nuova 1
src/lib/assign-event.test.ts · storeBoughtVisible 0 · extraValidAt 0 · 04/10 1 · 11/10 0 · frase nuova 0
src/lib/profile-session.test.ts · storeBoughtVisible 0 · extraValidAt 0 · 04/10 1 · 11/10 0 · frase nuova 0
src/lib/cancel-session.test.ts · storeBoughtVisible 0 · extraValidAt 0 · 04/10 1 · 11/10 0 · frase nuova 0
src/lib/client-book.test.ts · storeBoughtVisible 0 · extraValidAt 0 · 04/10 0 · 11/10 0 · frase nuova 2
== D8 · nei test di prima nessuna attesa sparisce (le attese della base che sul ramo non ci sono più)
(fine D8)
== D9 · PIANO.md, il pacchetto e le funzioni del server non cambiano
(fine D9)
== D10 · nessuna dipendenza nuova
(fine D10)
== D11 · componenti e route: cambia solo la pagina dello Store
src/routes/client.store.tsx
(fine D11)
== D12 · i commit del ramo
b937554 Revisione: i commenti dicono cosa succede dopo uno Sposta, i test reggono nel tempo
b02bc91 Commenti: la scadenza degli extra dopo il giro del server del 02/10
f73e9bb Test del Calendario: l'archivio in memoria inserisce come il server del 02/10
3a49ca6 Coach: un credito extra vale solo per una sessione entro la sua scadenza
5f87e9c Store: gli acquisti del blocco restano sotto la card dell'ultima settimana
```

## 7 · LE PROVE ROSSE

**Come.** Un arnese nello scratchpad (`rosse\rosse.mjs` con `rosse\mutazioni.json`) lavora sul codice vero, a Roma:
- ogni mutazione è una sostituzione esatta, che deve trovare il suo testo una volta sola;
- poi lancia la suite intera di vitest col reporter JSON e raccoglie i test caduti;
- rimette i file e ne controlla lo sha256, sempre uguale.

Prima e dopo, senza difetti, **1239 su 1239**. Il giro finale è su `b937554`. Un primo giro su `b02bc91`, prima della revisione, aveva dato R1-R14 rosse sugli stessi casi. Qui sotto, per ognuna, cosa ho rotto e quali test sono caduti; dopo ogni prova, verde.

- **R1** · `storeBoughtVisible` → `return bought.length > 0;`. Cadono 2 test in `client-store.test.ts`:
  - la variante di Davide («il percorso concluso con un Booster comprato nell'ultimo blocco: solo la card»: `visible` diventa `true`);
  - il caso delle card («non sotto le altre card»: `expected true to be false`).
- **R2** · `return bought.length > 0 && lock === null;`. Cadono 2 test:
  - la variante di Giorgio («l'ultima settimana con un Booster comprato nel blocco: la lista sotto la card»);
  - lo stesso caso delle card, dalla parte di «fine» (`expected false to be true`).
- **R3** · `extraValidAt` con `>`. Cadono 6 test:
  - `extraValidAt` ad A11 (`false` invece di `true`);
  - il caso «istanti, non testi»;
  - `scalare` all'istante della scadenza (`null` invece di `A`);
  - `conta` ad A04 (`[0, 2, null]` invece di `[0, 3, null]`);
  - `annulla` con A che scade a IL20, in `credit-order.test.ts` e in `cancel-session.test.ts` (B invece di A).
- **R4** · `pickConsumeExtraCredit` senza `extraValidAt`. Cadono 7 test:
  - `scalare` (A invece di B);
  - i due `previsto` con A scaduto (il previsto è A, e col solo A non è `null`);
  - i due `assegna` (A invece di B, e A scalato invece del rifiuto);
  - i due `rimetti` (lo stesso).
- **R5** · l'archivio senza il filtro della scadenza (`.filter(() => true)`). Cadono 4 test:
  - `archivio` 3 e 4 (prenotate);
  - `archivio` 5 (A invece di B);
  - `previsto` con A scaduto e B valido (l'archivio prende A).
- **R6** · l'archivio con `>`. Cade 1 test: `archivio` 2b.
- **R7** · `planSessionCredit` con `"1970-01-01T00:00:00.000Z"`. Cadono i due `previsto` con A scaduto.
- **R8** · `availableCredits` senza `extraValidAt`. Cade 1 test, il caso con un millisecondo dopo A04 e con dopo B03 (`[0, 3, null]` invece di `[0, 2, null]`).
- **R9** · Assegna evento con la data del 1970. Cadono i due `assegna`.
- **R10** · Rimetti in agenda con la data del 1970. Cadono i due `rimetti`.
- **R11** · `pickRefundExtraCredit` senza `extraValidAt`. Cadono 6 test:
  - `annulla` con A scaduto e B valido (A invece di B), e col solo A (`refunded` invece di `none`);
  - il caso del rimborso in `credit-order.test.ts`;
  - i tre nuovi della revisione: Elimina, Scollega, Annulla seguito da Rimetti.
- **R12** · `findCreditToReturn` con la data del 1970. Cadono gli stessi cinque in `cancel-session.test.ts` e `profile-session.test.ts`.
- **R13** · `coachWriteError` con `/^credito|booster/i`. Cadono 3 test:
  - il caso del §5.3 punto 3;
  - `archivio` 3 e 4, dove il messaggio del trigger arriva com'è.
  
  **Non** cade il 6.
- **R13b** (mia) · R13 più le due frasi dell'archivio scambiate. Cadono il 6 e il caso del §5.3 punto 3, come dice il §7, **e anche il 3 e il 4**. Dalla revisione quei casi controllano la frase del trigger in `cause` (§10).
- **R14** · `bookingErrorMessage` con `/credito/i.test(message ?? "")`. Cade 1 test, il caso del §5.4 (`Non hai crediti disponibili per Sessione PT.`).
- **X1** (mia) · l'archivio senza la frase nuova (`if (left.length < 0)`). Cadono `archivio` 3 e 4. Prima della revisione restava verde.
- **X2** (mia) · le due frasi dell'archivio scambiate, con `coachWriteError` vero. Cadono `archivio` 3, 4 e 6. Prima della revisione restava verde.
- **X3** (mia) · `findCreditToReturn` con `new Date().toISOString()` al posto della data della sessione. Cadono i cinque di R12. Con l'orologio fermo al 1/10 cadono anche dopo il 4/10.

## 8 · IL BROWSER

**Il banco.** È quello di Cowork, `app\banco-cli-2026-09-30`, copiato nello scratchpad (`…\b3dcae63-…\scratchpad\banco`):
- `lib-windows.mjs` come `lib.mjs`;
- `atteso-cli-04-2026-09-30.json` copiato accanto alla cartella, perché `giro04.mjs` lo legge da `../`;
- `seed05.mjs` coi dati, `fake04.mjs`, l'ora fissa di lunedì 28/09/2026 alle 10:40 di Roma;
- il codice è quello del ramo a lavoro committato (`b937554`).

Il giro di B18, B10 e B16 l'ho scritto io: `giro06b.mjs`. I dati di B18 sono `dati-cli-06b-b18.json`, cioè `dati-cli-06-2026-10-01.json` con le due righe del §8 in fondo agli extra di Giorgio e di Davide.

**B18 · la lista sotto la card dell'ultima settimana: 12 su 12.**
- **Giorgio a 390×844:**
  - la card col titolo «I Booster si aggiungono a un percorso» e il testo di `giorgio.lock.text`;
  - sotto, «Acquistati in questo blocco» con una riga sola, `["+1 Personal Training", "ven 25 set · 40 €"]`, dopo la card nel DOM e più in basso (card fino a 317,7 px, lista da 333,7);
  - solo quelle due card;
  - nessun `article`, nessun «Acquista», nessun riquadro della validità, nessun errore in console.
- **Davide a 390:** solo la card, col testo di `davide.lock.text`, e nessuna «Acquistati in questo blocco», anche se l'acquisto c'è.
- **Giulia a 390:** nessuna card, la lista con le due righe di `giulia.bought`.
- **Giorgio a 320×800:**
  - nessun elemento del contenuto con `scrollWidth > clientWidth` (elenco vuoto) e la pagina senza scorrimento orizzontale (0);
  - in ogni card zero pulsanti pieni, e la lista senza pulsanti;
  - la lista sotto la card (da 381,7 px).
- **Le schermate:**
  - `…\scratchpad\banco\giro06b\ramo\B18-giorgio-390.png`
  - `…\scratchpad\banco\giro06b\ramo\B18-davide-390.png`
  - `…\scratchpad\banco\giro06b\ramo\B18-giorgio-320.png`
  
  Le cartelle temporanee possono sparire: le ho mandate anche nella conversazione.

**B10 · chi non compra, coi dati originali: 8 su 8.** Elena, Davide, Nina e Giorgio vedono solo la card, coi testi delle attese della 06; nessuna lista, nessun prodotto, nessun pulsante.

**I due giri del banco corretti il 01/10**, copiati così come sono, salvo `lib.mjs`:
- `giro04.mjs` → **104 su 104**. Il suo B9 ora è verde: 30/09 `+09:00, +11:00, −11:15`; 12/10 i sette orari di Prenota che Sposta non apre. Gli errori 500/409/400 in fondo all'uscita sono quelli che B8, B10 e B11 iniettano apposta.
- `giro-sessioni.mjs` → **78 su 78**. Il suo B7 accetta «Riprova» con `aria-disabled`.

**B16:**
- nel mio giro, zero richieste esterne bloccate e zero `/_serverFn/`;
- nel B16 di `giro04.mjs`, zero richieste bloccate, zero funzioni server chiamate e nessuna nel log del server di sviluppo.

**R15 e R16.** `rosse-browser06b.mjs` rompe `storeBoughtVisible` nel repo **prima** di avviare Vite, lancia B18, rimette il file e ne controlla lo sha256 (uguale tutte e due le volte).
- **R15** (R1 nel browser) → **13 su 14**: KO «Davide 390: nessuna "Acquistati in questo blocco"», perché la lista compare sotto la card «concluso».
- **R16** (R2 nel browser) → **10 su 14**: quattro KO su Giorgio. A 390 e a 320 la lista non c'è e le card sono una sola.

Le schermate del coach non le ho rifatte, come dice il §8.

## 9 · NON FATTO

- **Un test del cambio di tipologia con scadenze vere** (`session-edit.test.ts`, punto 6 del revisore): il file è fuori dall'elenco di D1. Il caso che non va è in §11, punto 1.
- **Le prove rosse negli altri due fusi:** il §7 chiede solo Roma. I casi del §5 sono istanti, e gli otto file sono verdi nei tre fusi.

## 10 · DIVERGENZE

1. **Il clone all'avvio** era su `main`, non sul ramo della 06 (passo 0). Non conta: il ramo nasce dal remoto.
2. **Nomi, firme e testi del §4:** nessuno cambiato. `storeBoughtVisible`, `extraValidAt`, le due firme a tre argomenti, il tipo di `availableCredits` e le due frasi dell'archivio sono quelli del contratto, e la stampa di Cowork dà l'atteso nei tre fusi.
3. **Commenti oltre il §4:**
   - la testa di `client-store.ts`;
   - la testa della pagina (`client.store.tsx:5-7`): l'unica riga della pagina oltre al codice, mentre il §4.1 dice «nient'altro cambia nella pagina»;
   - la testa dell'archivio, con «tutti scaduti» invece di «l'unico».

   Dalla revisione:
   - `credit-order.ts:15-24` e `:208-215` sono diversi dal ramo simulato: dicono che `reschedule_booking` non guarda ancora la scadenza, e che una sessione spostata oltre quella del suo extra non trova un extra a cui restituire il credito;
   - `cancel-session.ts:171-176`, il commento dell'esito «none».
4. **L'archivio:** oltre al §4.3, `insertSession` lancia `new Error(coachWriteError(e), { cause: e })` (`memory-calendar-store.ts:446`). Il comportamento non cambia: il messaggio è lo stesso, e `cause` serve ai test. D5 resta come atteso, perché la riga sta fuori da `reschedule`.
5. **Test oltre il §5:**
   - «istanti, non testi»;
   - `blocks` in `memoryAssignStore`;
   - l'orologio fermo al 1/10/2026 nei blocchi della 06b. Nel repo nessun test usava i timer finti, quindi è un'abitudine nuova;
   - la frase del trigger nei casi 3, 4 e 6 (per questo R13b fa cadere anche il 3 e il 4, non solo il 6 come prevede il §7);
   - Elimina, Scollega, Annulla seguito da Rimetti.

   D8 è vuoto: nei test di prima non sparisce nessuna attesa.
6. **D12:** cinque commit invece di quattro. Il quinto, `b937554`, è il passo 8 del piano.
7. **Clienti nei test:** in `assign-event.test.ts` il cliente è `sara` e in `cancel-session.test.ts` `andrea`, i clienti dei due file; l'atteso usa Vera. Gli esiti sono quelli dell'atteso.
8. **Il commento di `queries.ts`**, testo del §4.4.3: «sulla data della sessione» vale per i giorni di Prenota, che finiscono con la scadenza (`client-credits.ts:336-367`). I conteggi di `getClientPools` guardano invece l'adesso (`client-credits.ts:262-263`), quindi la frase va letta così. Il codice non l'ho toccato (D6).

## 11 · TROVATI E NON TOCCATI

1. **Una sessione spostata oltre la scadenza del suo extra** (il punto più grave del revisore).
   - **La causa:** `reschedule_booking` sposta il credito senza guardare la scadenza (`app/server-cli-06-booster-2026-10-01.sql:23-25`, `HANDOFF-CALENDAR.md` §6; nell'archivio `reschedule`, `memory-calendar-store.ts:258` e seguenti, che non cambia). E Sposta, per una sessione senza blocco, apre da oggi a oggi + 14 (`client-credits.ts:406-408`). Un Booster che scade l'11/10, con la sessione del 10/10, si sposta al 20/10 e il credito resta su di lui.
   - **(a) Annulla, Elimina e Scollega del coach** su quella sessione non trovano un extra valido alla data. Il credito non torna (`credit: "none"`, il dialog dice solo «Sessione annullata.») e il Booster resta usato, anche se annullando prima dell'11/10 si potrebbe ancora usare. Rimetti in agenda poi prende un altro extra valido, se c'è: una sessione, due crediti.
   - **(b) Il cambio di tipologia:**
     - `retype` (`session-edit.ts:254-262`) non trova un credito da restituire e cambia solo la tipologia, senza scalare quella nuova;
     - con data e tipologia cambiate insieme, `checkEditCredit` guarda la data vecchia (`session-edit.ts:335`, su `first`) e `retype` la sessione riletta dopo lo spostamento (`:348-353`). Il controllo passa e nessun credito si muove.

     Prima della 06b il Booster tornava e la tipologia nuova si pagava.
   - **Perché non l'ho toccato:** la regola del rimborso è quella del §0.3 e del §4.2.3. Il giro del 02/10 la porta anche in `cancel_booking`, e lì corregge `reschedule_booking` («per la nuova data, solo un extra con `expires_at >= p_new_scheduled_at`», `HANDOFF-CALENDAR.md` §6). Con quella correzione una sessione non si sposta più oltre la scadenza, e il caso resta solo per le sessioni spostate prima. La 06b arriva su `main` dopo quel giro. `session-edit.ts` è fuori dall'elenco di D1.
   - **Da decidere:** se per le sessioni già spostate prima della correzione serve un ripiego, cioè restituire all'extra impegnato più vicino a scadere quando nessuno vale alla data.
2. **`client-home.ts:367`:** «Gli extra non contano: non scadono col blocco». Per i Booster è falso: scadono con il blocco (`boosterValidity`), salvo i 30 giorni in più. E `creditsWarning` («3 crediti da prenotare entro…») non conta i crediti dei Booster che scadono con il blocco. È la Home della 05, fuori dall'elenco di D1.
3. **Extra con la stessa scadenza:** i Booster comprati nello stesso blocco hanno di norma la stessa `expires_at`. `listClientExtraCredits` (`calendar-store.ts:58-64`) non ordina, e il server prende `ORDER BY expires_at LIMIT 1` senza un secondo criterio. Il credito previsto dal dialog può quindi essere un'altra riga rispetto a quella del server; i saldi sono gli stessi. C'era già prima.
4. **`event-type-usage.ts:14`** «gli extra non scadono», con `profile-overview.tsx:85` e `client-list.ts:185`: il debito già scritto da Cowork (`HANDOFF-CALENDAR.md` §7, revisione 08/10), lasciato com'è come dice il §9.
5. **La suite e la memoria:** con un gioco aperto (memoria impegnabile a 6,4 GB) un giro intero di vitest è caduto al caricamento, con esbuild morto e zero test falliti (§1, passo 5). È l'ambiente, come nelle passate di prima.

## 12 · RESTA A NICOLÒ

- Il merge della PR #85 nel ramo di integrazione `redesign/cliente-mobile`, dopo la verifica di Cowork.
- Il giro del server del 02/10: `app/server-cli-06-booster-2026-10-01.sql`, con le altre voci. Fra queste, come scrive `HANDOFF-CALENDAR.md` §6, la scadenza anche in `cancel_booking` e in `reschedule_booking`: con quest'ultima si chiude il punto 1 del §11.
- Al rilascio su `main`, non prima del giro: la pubblicazione delle due funzioni di Stripe (`booster-checkout`, `stripe-webhook`) e un acquisto di prova.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
