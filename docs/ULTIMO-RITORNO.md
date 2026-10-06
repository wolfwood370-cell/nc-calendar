# Lato cliente · Passata 11 · Le voci del coach

Ramo `redesign/cliente-11-coach`, base `origin/main` = `62ec56227924bbce3ccfa93f6e265a1ca85e0cda` (PR #93, la passata del `CLAUDE.md`, unita). Sonnet 5.5. Il codice è la patch di Cowork applicata com'è: D11 50/50.

## IL PIANO

0. ☑ **La base**: fetch, base controllata, ramo creato, cancelli e controlli sulla base. Nessun commit.
1. ☑ `f8de34c` **La correzione**: `git apply --index` della patch (sha256 `03b09fc41f2da81a…`, 50 file), typecheck 0, D11 50/50. ⚠️ D11 si legge solo dopo il commit (vedi §9).
2. ☑ **I cancelli, i controlli, le prove rosse**: tutti come attesi, nessun commit di prova.
3. ☑ **Il browser**: `giro11-cowork.mjs` 19/19 sul ramo, 5/19 sulla base; giri 10 e 10b verdi. Nessun commit.
4. ☑ **Chiusura**: questo file, push, PR (non unita), `rm -rf dist .output`.

## 1 · Dove ho girato

`uname -s`: `MINGW64_NT-10.0-26300` · node v24.12.0 · bun 1.3.14 · `git hash-object bun.lock` = `d93afeddf8068057f6d78347267b94b9ffacace6`, uguale a `git rev-parse origin/main:bun.lock`; la patch non tocca `package.json`, `bun.lock`, `supabase/` né `src/integrations/` (0 file).

## 2 · Base, ramo e commit

- Base `62ec56227924bbce3ccfa93f6e265a1ca85e0cda` (merge della PR #93). `git diff --name-only 85c0b39 origin/main`: `.claude/settings.json`, `.gitignore`, `CLAUDE.md`, `docs/ULTIMO-RITORNO.md`: solo file ammessi (il caso buono del §2).
- `git log --oneline <base>..origin/main` all'ultimo fetch: vuoto (`main` non è andato avanti).
- Ramo `redesign/cliente-11-coach`, con `git switch --no-track`:
  - `f8de34c` Passata 11: Google, Disponibilità del telefono, crediti del coach, l'uscita e il Calendario del telefono (le voci del coach)
  - il commit di chiusura che riscrive questo file; l'hash e il numero della PR sono nella PR e nel messaggio di Claude Code.

## 3 · Manifesto

`git diff --name-status origin/main HEAD`: 51 file, 10 nuovi, 41 modificati.

- **NUOVI (10):** `src/hooks/use-availability-draft.ts`, `src/lib/extra-credits.ts`, `src/lib/extra-credits.test.ts`, `src/lib/gcal-repair.ts`, `src/lib/gcal-repair.test.ts`, `src/lib/notification-open.ts`, `src/lib/notification-open.test.ts`, `src/lib/save-bar.ts`, `src/lib/sign-out.ts`, `src/lib/sign-out.test.ts`.
- **MODIFICATI (41):** i 40 file della patch non nuovi, più `docs/ULTIMO-RITORNO.md`. Elenco intero: l'uscita dei controlli (§5), riga D11.
- **NON TOCCATI:** `package.json`, `bun.lock`, `supabase/`, `src/integrations/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.gitignore`.

## 4 · I cancelli

| cancello                        | base `62ec562`        | ramo                      |
| ------------------------------- | --------------------- | ------------------------- |
| typecheck                       | 0                     | 0                         |
| lint                            | 0 errori, 14 avvisi   | 0 errori, **13** avvisi   |
| test, Roma (sonda `-120`)       | 71 file, 1433 passati | **75 file, 1470 passati** |
| test, UTC (sonda `0`)           | —                     | 75 file, 1470 passati     |
| test, Los Angeles (sonda `420`) | —                     | 75 file, 1470 passati     |
| build (`LOVABLE_SANDBOX=1`)     | 0                     | 0                         |

Avvisi per regola: base 10 `react-refresh/only-export-components` + 4 `react-hooks/exhaustive-deps`; ramo 9 + 4. Quello tolto è l'esportazione di `sameDay` da un file di componenti. Le tre suite del ramo sono state lanciate una per volta, senza altro in parallelo: nessun timeout di `clock.test.ts`.

## 5 · I controlli (acceptance)

Sulla base `62ec562` l'uscita è **identica** a `oggi-controlli-cli-11-2026-10-06.txt` (D11 0/50, D9 0). A lavoro committato:

```
diff /tmp/ctl11.txt atteso-controlli-cli-11-2026-10-06.txt
10c10
< D9 file cambiati: 51 · fuori dall'elenco: 0
---
> D9 file cambiati: 50 · fuori dall'elenco: 0
```

L'unica riga diversa è D9, come previsto dal prompt (51 col ritorno committato, 0 fuori dall'elenco). `D11 file uguali al ramo di Cowork: 50/50`; tutte le altre righe (D0-D8, D10) uguali all'atteso.

## 6 · Le prove rosse

`rosse-cli-11-2026-10-06.py` (Python 3.14.5), a lavoro committato: **R1-R23 tutte rosse, ognuna con i test detti che cadono** (R1 4, R2 3, R3 1, R4 2, R5 1, R22 1, R6 1, R7 1, R8 1, R9 1, R10 3, R11 1, R12 8, R13 1, R14 2, R15 1, R23 1, R16 1, R17 1, R18 1, R19 1, R20 1, R21 1).

Ultima riga, tale e quale (la codifica del file di uscita ha mangiato i punti mediani):

`rosse come attese: 23 su 23 · a file rimessi, uscita 0 · Test Files  10 passed (10) · Tests  161 passed (161)`

Dopo le rosse `git status --short` è vuoto.

## 7 · Il browser

Banco copiato da `app\banco-cli-2026-09-30` nello scratchpad (fuori dal repo), `lib-windows.mjs` → `lib.mjs`; Playwright dalla cache di `npx` e Chromium trovati. Un server alla volta, repo non toccato durante i giri.

| giro                            | dove                     | `ESITO`      |
| ------------------------------- | ------------------------ | ------------ |
| `giro11-cowork.mjs` porta 5511  | ramo                     | **19 su 19** |
| `giro10-cowork.mjs` porta 5512  | ramo                     | **30 su 30** |
| `giro10b-cowork.mjs` porta 5513 | ramo                     | **9 su 9**   |
| `giro11-cowork.mjs` porta 5531  | base (worktree staccata) | **5 su 19**  |

I KO sulla base, tutti quelli attesi: B1 (le card del desktop senza i tre campi; `trainer_settings` né letta né scritta), B2 (messaggio, «Riprova», Salva spento), B3 (il mercoledì tornando), B4 (la pagina del telefono resta a 1024 px; il giro si ferma a metà con `TimeoutError: locator.click: Timeout 30000ms exceeded`, il difetto, non il banco), B5 (la barra sopra la navigazione), B6 (occupato durante, e libero a fine: due righe), B7 (la barra BIA · extra, niente PT · extra), B8 (Crediti extra 2 di 2, e «Presenza» in `on-surface-variant`: due righe), B9 (Sara 2 di 3 rimasti), B10 (il compleanno nella striscia «Tutto il giorno»). La worktree della base è stata tolta (giunzione staccata prima del remove).

## 8 · Non fatto

Niente. Provato tutto il contratto; non ho toccato database, Google, Supabase o Stripe.

## 9 · Divergenze dal prompt

- **D11 prima del commit non è misurabile.** Il prompt chiede il controllo «dopo l'applicazione, prima del commit», ma lo script legge `git rev-parse HEAD:<file>` e `git diff <base>...HEAD`, cioè i commit. Prima del commit dava D9 0 e D11 0/50 (misurato); dopo il commit D11 50/50. Ho verificato prima del commit solo typecheck 0 e `git diff --cached --name-only | wc -l` = 50. Se D11 fosse stato diverso avrei dovuto annullare un commit locale non pubblicato.
- Il commit della patch porta anche `docs/ULTIMO-RITORNO.md` col piano (prescritto dal prompt): da qui D9 = 51 e non 50.

## 10 · Trovati e non toccati

Nessun difetto trovato nel codice. Una nota sul banco: lo script delle rosse scrive l'uscita in una codifica che sul PC rovina i caratteri non ASCII (`·`, `«»`, `è`) se rediretta su file: non cambia l'esito, che è nella riga finale.

## 11 · Resta a Nicolò

Il merge della PR `redesign/cliente-11-coach` verso `main` (aperta, non unita: il link è nel messaggio che l'ha creata), il Publish da Lovable, e la prova sul telefono (Disponibilità, Calendario aperto da una notifica già toccata, uscita con rete caduta, crediti extra del Profilo).
