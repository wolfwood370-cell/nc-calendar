# Ultimo ritorno · Correzione: il mese in corso di un abbonato si sceglie per data

## 0 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **La base.** `git fetch origin`, poi `git switch --no-track -c fix/abbonato-mese-per-data origin/main`: `origin/main` = `aa1ebfe`, come atteso. Nessun commit.
   - ⚠️ Il clone non era su `redesign/coach-10-verifica-finale` @ `1afeb87` ma su `main` @ `3d29634`, pulito a parte `design_handoff_cliente_mobile/` (non tracciata, non toccata).
   - Misure della base: typecheck 0 · lint 0 errori e 22 avvisi su 309 file · 623 test in 43 file · build riuscita. C0 `0`; C1 2 righe; C2 `0`/`0` e `1`/`1`.
   - Memoria all'avvio: 1,1 GB impegnabili liberi, 1,2 GB fisici (WSL acceso, `vmmem` 4,1 GB). Tutti i comandi sono girati coi worker predefiniti, senza errori di memoria e senza il ripiego `--no-file-parallelism`.
1. ☑ **La funzione e i suoi test.** `b0a3e42`. C0 `1`; 36 test del file verdi (31 di prima e 5 nuovi), uguali con `TZ=UTC`; R1 rossa (3 su 36), R2 rossa (1 su 36), più una prova non chiesta sull'orologio implicito (1 su 36).
2. ☑ **Prenota e Home la usano.** `1e31c7d`. C1 nessuna riga; C2 `3`/`3` e `1`/`1`; typecheck 0; lint 0 errori e 22 avvisi su 309 file, gli stessi 22 della base (confrontati per file, regola e messaggio); build riuscita.
   - ⚠️ **Passo aggiunto: tre commenti smentiti.** `053ef2b`, solo commenti, dentro i cinque file di C3. Li ha trovati il revisore (§5), li ho verificati:
     - Prenota e Home dicevano che l'RPC chiude i blocchi «past their grace». Non è così: segna «completed» l'ultimo blocco appena oggi ne supera la fine e subito crea quello dopo; la tolleranza decide solo `in_grace_period` (migrazione `20260827143325…sql:44-53` e `:79-105`). Il commento di Home l'avevo ricopiato io al passo 2.
     - `client.book.tsx:340` diceva «blocco via RPC async», falso dopo questa correzione. È fuori dagli intervalli che il prompt elenca da riscrivere: ⚠️.
     - `renewal.test.ts:367-369`: il test del percorso finito prende l'orologio implicito solo fino all'08/11/2026; dopo lo prende il primo test. Ora il commento lo dice.
     - Dopo: typecheck 0, lint 0/22 identico alla base, 628 test in 43 file, i 36 del file anche con `TZ=UTC`, build riuscita.
3. ☑ **Chiusura.** Cancelli completi su `053ef2b`; push; PR [wolfwood370-cell/nc-calendar#77](https://github.com/wolfwood370-cell/nc-calendar/pull/77), aperta e non unita; questo file nel commit «Riscrive docs/ULTIMO-RITORNO.md per la correzione dell'abbonato», l'ultimo del ramo; C3 con 5 righe.
   - ⚠️ Il numero della PR esiste solo dopo il push. Ho quindi aperto la PR con `--body-file docs/ULTIMO-RITORNO.md` quando questo file era ancora una bozza, poi l'ho committato. Dopo il suo push ho rimesso questa versione come descrizione con `gh pr edit --body-file docs/ULTIMO-RITORNO.md`.
   - ⚠️ Per incollare qui l'output vero di C3 ho dovuto misurarlo dopo il commit di questo file. Ho quindi corretto quel commit con `--amend` una volta, prima del push: l'elenco dei file non cambia. Nessun push forzato.

28/09/2026. Prompt «NC Calendar · Correzione · Il mese in corso di un abbonato si sceglie per data» (Cowork, contro `aa1ebfe`). Agenti: 1 (un revisore in sola lettura sul diff, §5). Workflow: 0: la parola «Ultracode» nel prompt ha fatto scattare l'invito del sistema ai workflow, ma il prompt dice «Ultracode: non serve».

## 1 · Ramo e commit

- **Ramo:** `fix/abbonato-mese-per-data`, da `origin/main` = `aa1ebfe`, pubblicato con `git push -u origin fix/abbonato-mese-per-data`.
- **Commit, in ordine:**
  1. `b0a3e42` Il blocco di riferimento del cliente si sceglie per data;
  2. `1e31c7d` Prenota e Home: il mese in corso di un abbonato per data;
  3. `053ef2b` Corregge tre commenti smentiti dalla correzione dell'abbonato;
  4. Riscrive docs/ULTIMO-RITORNO.md per la correzione dell'abbonato. È il commit finale. Il suo hash è l'ultimo del ramo, e sta nel blocco finale della risposta di Claude Code: un file non può contenere l'hash del commit che lo scrive.
- **PR:** [wolfwood370-cell/nc-calendar#77](https://github.com/wolfwood370-cell/nc-calendar/pull/77) verso `main`, aperta e **non** unita. Descrizione: questo file.

## 2 · Manifesto

- **NUOVI:** nessun file. Una funzione nuova: `clientReferenceBlock` in `src/lib/renewal.ts:79`.
- **MODIFICATI:**
  - `src/lib/renewal.ts` (+16). Aggiunge `clientReferenceBlock<T extends RenewalBlock>(blocks: readonly T[], now: Date = new Date()): T | null`, cioè `resolveCurrentBlock(blocks.filter(isValidBlock), now)`. Il commento dice perché vale anche per l'abbonamento.
  - `src/lib/renewal.test.ts` (+57). Aggiunge `describe("clientReferenceBlock · il blocco in corso di Prenota e Home")` (`:327`): 5 test, uno per caso, con le date in ora locale (`new Date(2026, 8, 28, 10, 40)`).
  - `src/routes/client.book.tsx` (+15 −26):
    - `block` = `clientReferenceBlock(blocksQ.data ?? [])` (`:118`);
    - via `isRecurring` e il suo commento, e via l'import di `resolveCurrentBlock`, rimasto senza uso;
    - riscritti i commenti di `:104-117` e quello di `:340`.
  - `src/routes/client.index.tsx` (+20 −25):
    - `resolvedCurrentBlock` = `clientReferenceBlock(blocksQ.data ?? [])` (`:121-124`);
    - via il memo `currentBlock` e l'import di `resolveCurrentBlock`;
    - `currentWeekLabel` usa `resolvedCurrentBlock` (`:320-326`), sempre solo per l'abbonamento;
    - riscritti i commenti di `:98-111`.
  - `docs/ULTIMO-RITORNO.md`: questo file.
- **NEL PERIMETRO MA NON TOCCATI:**
  - `useCurrentBlock(meId)`. Resta chiamata in tutte e due le pagine (`client.book.tsx:111`, `client.index.tsx:105`). Prenota ne aspetta il caricamento in `poolsSettled` (`client.book.tsx:344`); la Home ne legge lo stato in `graceBanner` (`client.index.tsx:330`).
  - `src/hooks/use-current-block.ts`, `src/lib/current-block.ts`, `src/routes/client.settings.tsx`, la migrazione dell'RPC e `design_handoff_cliente_mobile/`.
  - Il resto di Prenota e Home, compresi il commento di `pathBlocks` e il conteggio dei blocchi annullati (§5).

## 3 · Acceptance

Base = `aa1ebfe` al passo 0; dopo = il ramo (cancelli su `053ef2b`, l'ultimo commit con codice).

| Controllo       | Comando                                                                                  | Base                          | Dopo                          |
| --------------- | ---------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------- |
| C0              | `grep -c -E "^export (function\|const) clientReferenceBlock" src/lib/renewal.ts`         | `0`                           | `1`                           |
| C1              | `grep -rn "currentBlockQ.data?.currentBlockId" src/routes`                               | 2 righe                       | nessuna riga (exit 1)         |
| C2              | `grep -c "clientReferenceBlock" src/routes/client.book.tsx src/routes/client.index.tsx`  | `0` e `0`                     | `3` e `3`                     |
| C2              | `grep -c "useCurrentBlock(meId)" src/routes/client.book.tsx src/routes/client.index.tsx` | `1` e `1`                     | `1` e `1`                     |
| C3              | `git diff --name-only origin/main...HEAD` e il filtro `grep -v -x -E …`                  | —                             | 5 righe; nessuna riga         |
| typecheck       | `bun run typecheck`                                                                      | 0 errori                      | 0 errori                      |
| lint            | `bun run lint --ignore-pattern design_handoff_cliente_mobile`                            | 0 errori, 22 avvisi, 309 file | 0 errori, 22 avvisi, 309 file |
| test            | `bun run test`                                                                           | 623 in 43 file                | 628 in 43 file                |
| test nuovi, UTC | `TZ=UTC bunx vitest run src/lib/renewal.test.ts`                                         | —                             | 36 su 36                      |
| build           | `bun run build`                                                                          | riuscita                      | riuscita                      |

C0-C2, dopo:

```
$ grep -c -E "^export (function|const) clientReferenceBlock" src/lib/renewal.ts
1
$ grep -rn "currentBlockQ.data?.currentBlockId" src/routes
(exit 1)
$ grep -c "clientReferenceBlock" src/routes/client.book.tsx src/routes/client.index.tsx
src/routes/client.book.tsx:3
src/routes/client.index.tsx:3
$ grep -c "useCurrentBlock(meId)" src/routes/client.book.tsx src/routes/client.index.tsx
src/routes/client.book.tsx:1
src/routes/client.index.tsx:1
```

C1 sulla base:

```
src/routes/client.book.tsx:125:      const fromRpc = all.find((b) => b.id === currentBlockQ.data?.currentBlockId);
src/routes/client.index.tsx:106:    const id = currentBlockQ.data?.currentBlockId ?? null;
```

C3, misurato dopo il commit di questo file:

```
$ git diff --name-only origin/main...HEAD
docs/ULTIMO-RITORNO.md
src/lib/renewal.test.ts
src/lib/renewal.ts
src/routes/client.book.tsx
src/routes/client.index.tsx
$ git diff --name-only origin/main...HEAD | grep -v -x -E "docs/ULTIMO-RITORNO.md|src/lib/renewal.test.ts|src/lib/renewal.ts|src/routes/client.book.tsx|src/routes/client.index.tsx"
(nessuna riga, exit 1)
```

Cancelli, dopo, su `053ef2b` (il commit di questo file non tocca codice):

```
$ bun run typecheck
$ tsc --noEmit
(exit 0)
$ bun run lint --ignore-pattern design_handoff_cliente_mobile
✖ 22 problems (0 errors, 22 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.
(exit 0; con -f json: 309 file, 0 errori, 22 avvisi, gli stessi della base per file, regola e messaggio)
$ bun run test
 Test Files  43 passed (43)
      Tests  628 passed (628)
$ TZ=UTC node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"
0
$ TZ=UTC bunx vitest run src/lib/renewal.test.ts
      Tests  36 passed (36)
   Start at  19:53:16        ← ora UTC: il fuso arriva a vitest (alle 21:53 di Roma)
$ bun run build
✓ built (3 volte: client, server, nitro) · exit 0
```

In più, non chiesto: `TZ=UTC bun run test` su `1e31c7d` (da lì a `053ef2b` cambiano solo commenti) dà 628 test su 628 in 43 file.

## 4 · Le prove rosse

Ho fatto ogni rottura in `src/lib/renewal.ts`, l'ho provata con `bunx vitest run src/lib/renewal.test.ts` e poi l'ho tolta. Dopo, `git diff` del file mostrava di nuovo solo la funzione buona e il file tornava a 36 test su 36. Le prove sono girate su `b0a3e42` prima del commit. Dopo è cambiato solo un commento del test (`053ef2b`).

- **R1** · la funzione sceglie l'ultimo blocco valido per `sequence_order`, come l'RPC:
  ```
  × abbonato coi mesi dopo già creati: il mese che contiene oggi, non l'ultimo creato
  × percorso fisso: il blocco che contiene oggi
  × fra due blocchi non contigui: il primo che deve iniziare
  AssertionError: expected { id: 'm3', sequence_order: 3, …(3) } to be { id: 'm1', sequence_order: 1, …(3) }
        Tests  3 failed | 33 passed (36)
  ```
  Uguale alla misura di Cowork (3 su 36).
- **R2** · la funzione non filtra più con `isValidBlock` (`resolveCurrentBlock(blocks, now)`):
  ```
  × un blocco annullato non si sceglie, anche se contiene oggi; nessun blocco → null
  AssertionError: expected 'x' to be 'b2'
        Tests  1 failed | 35 passed (36)
  ```
- **Prova in più, non chiesta** · la funzione ignora `now` e legge l'orologio (`resolveCurrentBlock(blocks.filter(isValidBlock))`):
  ```
  × percorso finito: l'ultimo
  AssertionError: expected 'm1' to be 'm3'
        Tests  1 failed | 35 passed (36)
  ```
- **Verde dopo:** 36 test su 36 col fuso di Roma e con `TZ=UTC`; 628 su 628 in tutta la suite.

## 5 · Non fatto e divergenze

- ⚠️ **Il clone** era su `main` @ `3d29634`, non su `redesign/coach-10-verifica-finale` @ `1afeb87`. Il ramo è partito comunque da `origin/main` dopo il fetch, come chiede il prompt.
- ⚠️ **Il commento di `client.book.tsx:340`** l'ho corretto anche se è fuori dagli intervalli elencati nel prompt: dopo questa correzione era falso (passo 2, punto aggiunto).
- **Il commento di `pathBlocks`** (`client.index.tsx:288-289`) dice che per l'abbonamento «i blocchi futuri non esistono finché auto_renew non li crea». Il caso del difetto mostra che possono esistere. Il codice sotto è giusto comunque: toglie i futuri, e ora il mese in corso non è più tra quelli. Sta nel resto della Home: non toccato.
- **La revisione indipendente.** Un agente in sola lettura ha letto il codice finale, le due migrazioni e i test, senza vedere il diff. Non ha trovato nessun caso deterministico in cui il blocco scelto cambi fuori da (a), (b) e (c). Ha però segnalato cinque punti da conoscere. Nessuno l'ho corretto: sono tutti nel resto delle pagine o in file che non si toccano.
  1. **Home in tolleranza col rinnovo spento.** È il caso (b), chiesto dal contratto. Dopo la fine del mese l'RPC dà `current_block_id` nullo e `in_grace_period` vero. La Home ora mostra il mese finito per data:
     - come «Il tuo mese corrente», con «Settimana 4/4» (clamp di `client.index.tsx:324`);
     - con «Da prenotare entro il <data già passata>» (`:725`) e la stessa data nella campanella (`:412`);
     - accanto al banner «Sessioni del mese precedente: N» (`:592`).

     Prima non mostrava nessun blocco. Ho verificato le righe: i testi si contraddicono per i 7 giorni della tolleranza. Succede lo stesso col rinnovo acceso se l'RPC crea il mese nuovo proprio in quel caricamento. `useCurrentBlock` infatti non invalida `useClientBlocks` (`src/hooks/use-current-block.ts`), e finché la lista non si ricarica la regola a date vede ancora il mese finito. Prenota in quel caso faceva già così. Lo decidono Cowork e la passata 00, che rifà la Home.

  2. **Corsa con `repair_blocks_alignment`** (transitoria; non l'ho verificata io). L'RPC ripara le date dei blocchi disallineati, ma `useClientBlocks` può averle lette prima. Prima un abbonato riceveva l'id calcolato sulle date riparate; ora la scelta usa quelle lette. Serve un disallineamento, e si sistema alla rilettura successiva della lista.
  3. **Blocchi sovrapposti.** Con due blocchi validi che contengono oggi, prima l'RPC sceglieva il `sequence_order` più alto (`ORDER BY sequence_order DESC`, migrazione `:36`); ora vince il più basso (`current-block.ts:63-65`). Righe verificate. Sul backup Cowork ha misurato che il blocco scelto cambia solo per l'abbonato del difetto.
  4. **Blocchi annullati nella Home** (effetto di (c)). Cowork sul backup ne ha contati zero.
     - `blockProgress.total` (`client.index.tsx:154`) e `pathBlocks` contano ancora gli annullati.
     - Un annullato che contiene oggi non è più «current» e prende lo stato predefinito «future» (`:302`): sul percorso fisso diventa una riga futura e spegne `showRenewal` (`:467-471`); sull'abbonamento sparisce.
     - `client.settings.tsx:243` usa ancora `findCurrentBlock` su tutti i blocchi.
  5. **Mezzanotte.** La scelta si ricalcola solo quando cambia `blocksQ.data`. Con la pagina aperta a cavallo fra due mesi già creati, resta il mese vecchio finché la pagina non si rimonta o i dati non cambiano. Sul percorso fisso era già così (commento MED-C3, `client.index.tsx:113`).

  Il revisore ha notato anche che nessun test copre le pagine: se qualcuno rimettesse l'id dell'RPC in Prenota o in Home, cadrebbe solo C1.

- Niente database, niente migrazioni, niente deploy, niente installazioni. `design_handoff_cliente_mobile/` non è stata aggiunta né toccata: ogni `git add` è stato file per file.

## 6 · Resta a Nicolò

1. Dopo la verifica di Cowork, il merge della PR [wolfwood370-cell/nc-calendar#77](https://github.com/wolfwood370-cell/nc-calendar/pull/77) verso `main`.
2. Poi il Publish in Lovable.
3. Poi il lancio della passata 00 del lato cliente, che riusa `clientReferenceBlock` (`src/lib/renewal.ts:79`) e trova al §5, punti 1 e 4, due cose da decidere per la Home.
