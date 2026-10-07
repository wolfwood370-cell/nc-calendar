# Lato cliente · Passata 12 · I tre difetti del telefono, sul PC

Ramo `redesign/cliente-12-telefono`, base `origin/main` = `ae4ec3a61a5be23b36b575467800efaad8314c49` (PR #94, la passata 11, unita). Sonnet 5.5. Il codice è la patch di Cowork applicata com'è: D9 19/19.

## IL PIANO

0. ☑ **La base** (§2): fetch, base controllata (`ae4ec3a`), ramo creato, librerie com'erano, cancelli sulla base prima di toccare niente. Nessun commit.
1. ☑ `7dd6cb9` **La correzione** (§3): `git apply --index` della patch (sha256 `2aaf3199143ed734…`, 19 file), typecheck 0, commit, poi D9 19/19 sul commit.
2. ☑ **I cancelli, i controlli, le prove rosse**: tutti come attesi, nessun commit di prova.
3. ☑ **Il browser**: `giro12-cowork.mjs` 23/23 sul ramo e 6/23 sulla base (i KO attesi); giri 11, 10, 10b e 08 verdi sul ramo. Nessun commit. ⚠️ Una deviazione sul banco (B7), vedi §9.
4. ☑ **Chiusura**: questo file, push, PR (non unita), `rm -rf dist .output`.

## 1 · Dove ho girato

`uname -s`: `MINGW64_NT-10.0-26300` · node v24.12.0 · bun 1.3.14 · `git hash-object bun.lock` = `d93afeddf8068057f6d78347267b94b9ffacace6`, uguale a `git rev-parse ae4ec3a:bun.lock`. La patch non tocca `package.json`, `bun.lock`, `supabase/` né `src/integrations/` (0 file). Nessuna installazione.

## 2 · Base, ramo e commit

- Base `ae4ec3a61a5be23b36b575467800efaad8314c49`. `git log --oneline ae4ec3a..origin/main`, all'ultimo fetch: vuoto.
- ⚠️ Il `main` locale era fermo a `3d29634` (PR #72), indietro di 230 commit rispetto a `origin/main`: il ramo è nato da `origin/main` come chiede il prompt, e solo dopo il cambio di ramo `bun.lock` del working tree è diventato uguale a quello della base (prima, `git hash-object bun.lock` dava `702e49ad…`). `node_modules` è invariato e i cancelli sulla base sono verdi.
- Ramo `redesign/cliente-12-telefono`, con `git switch --no-track`:
  - `7dd6cb9` Passata 12: la zona sicura del telefono in tutta l'app, la push che apre la sessione, la sessione prenotata nella campanella
  - il commit di chiusura che riscrive questo file; il suo hash e il numero della PR sono nella PR e nel messaggio di Claude Code.

## 3 · Manifesto

`git diff --name-status origin/main HEAD` a correzione committata: 19 file, 1 nuovo, 18 modificati (+525 −35).

- **NUOVI (1):** `src/lib/booked-notice.test.ts` (13 test).
- **MODIFICATI (18):** `src/components/calendar-context-panel.tsx`, `src/components/calendar-details-panel.tsx`, `src/components/client-toaster.tsx`, `src/components/trainer-bottom-nav.tsx`, `src/components/trainer-notifications-bell.tsx`, `src/hooks/use-book-confirm.ts`, `src/hooks/use-client-shell.ts`, `src/lib/client-notifications.test.ts` (una riga: `coachCreated: null`), `src/lib/client-notifications.ts`, `src/lib/notifications.ts`, `src/lib/save-bar.ts`, `src/routes/__root.tsx`, `src/routes/admin.tsx`, `src/routes/auth.tsx`, `src/routes/client.notifications.tsx`, `src/routes/client.tsx`, `src/routes/trainer.index.tsx`, `src/routes/trainer.tsx`; più `docs/ULTIMO-RITORNO.md` col commit di chiusura (20 file in tutto).
- **NON TOCCATI:** `package.json`, `bun.lock`, `supabase/`, `src/integrations/`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.gitignore`.

## 4 · I cancelli

| cancello                        | base `ae4ec3a`        | ramo                      |
| ------------------------------- | --------------------- | ------------------------- |
| typecheck                       | 0                     | 0                         |
| lint                            | 0 errori, 13 avvisi   | 0 errori, **13** avvisi   |
| test, Roma (sonda `-120`)       | 75 file, 1470 passati | **76 file, 1483 passati** |
| test, UTC (sonda `0`)           | —                     | 76 file, 1483 passati     |
| test, Los Angeles (sonda `420`) | —                     | 76 file, 1483 passati     |
| build (`LOVABLE_SANDBOX=1`)     | 0                     | 0                         |

Avvisi per regola, uguali sulla base e sul ramo: 9 `react-refresh/only-export-components` + 4 `react-hooks/exhaustive-deps`. UTC e Los Angeles da PowerShell, una suite per volta, con la sonda prima di ognuna. Nessun timeout di `clock.test.ts`.

## 5 · I controlli (acceptance)

Sulla base `ae4ec3a` l'uscita (worktree staccata) è **identica** a `oggi-controlli-cli-12-2026-10-07.txt`: D6 0/11, D7 0, D8 0, D9 0/19.

A lavoro committato (commit `7dd6cb9`), `diff /tmp/ctl12.txt atteso-controlli-cli-12-2026-10-07.txt` è **vuoto**: D0-D5 come attesi, `D6 test nuovi · booked-notice.test.ts 11/11`, `D7 file cambiati: 19 · fuori dall'elenco: 0`, `D8 righe tolte dai test di prima: 0`, `D9 file uguali al ramo di Cowork: 19/19`. Col ritorno committato D7 salirà a 20, con 0 fuori dall'elenco, come dice il prompt.

## 6 · Le prove rosse

`py -3 rosse-cli-12-2026-10-07.py <clone>`, da PowerShell, a `7dd6cb9`. Cadono tutte:

- R1 il titolo di prima (3 test) · R2 la push apre la Home (2) · R3 id senza codifica (1) · R4 senza nome della tipologia (1) · R5 ogni riga con un `booking_id` vale come sessione del coach (1) · R6 la voce prima che arrivino le righe (1) · R7 due voci per una sessione del coach (2) · R8 la voce resta per sempre (1) · R9 anche le annullate (1) · R10 anche le già iniziate (1) · R11 il momento è l'inizio (2) · R12 la campanella senza la sessione prenotata (5) · R13 una importata da Google diventa «Sessione prenotata» (1) · R14 una sessione del coach creata prima dei trigger della 08 (1).
- Ultima riga: `rosse come attese: 14 su 14 · a file rimessi, uscita 0 · Test Files  1 passed (1) · Tests  13 passed (13)`.
- Dopo le rosse `git status --short` è vuoto.

## 7 · Il browser

Banco: copia di `banco-cli-2026-09-30` fuori dal repo, con `lib-windows.mjs` → `lib.mjs` (Playwright e Chromium ai percorsi del PC, tutti presenti). Un solo dev server alla volta, repo non toccato durante i giri.

| giro                 | ramo         | base `ae4ec3a`                                                   |
| -------------------- | ------------ | ---------------------------------------------------------------- |
| `giro12-cowork.mjs`  | **23 su 23** | **6 su 23**: KO B1, B2, B3, B4, B5, B6, B7, B9, B10, B12 (17 KO) |
| `giro11-cowork.mjs`  | 19 su 19     | —                                                                |
| `giro10-cowork.mjs`  | 30 su 30     | —                                                                |
| `giro10b-cowork.mjs` | 9 su 9       | —                                                                |
| `giro08.mjs`         | 79 su 79     | —                                                                |

Sul ramo, in fondo: zero richieste esterne bloccate, zero funzioni server, zero errori di pagina. Il `ESITO` della base conta 17 KO nelle 10 prove elencate (B1, B3, B5, B6, B10 ne hanno più d'uno), esattamente le prove attese dal prompt.

## 8 · Non fatto, e perché

- Nessun controllo sul telefono vero: la zona sicura è emulata con `Emulation.setSafeAreaInsetsOverride`. La prova sul telefono resta a Nicolò.
- Nessun Publish, nessun merge.

## 9 · Divergenze dal prompt, con la misura

1. **`REPO` nel banco.** `lib-windows.mjs` ha il percorso del clone scritto a mano (`export const REPO = "C:/Coworks/…/nc-calendar"`) e ignora la variabile `REPO=…` del prompt. Il primo giro «sulla base» ha quindi servito il clone (cioè il ramo): 22/23, B7 in KO, **non è il giro della base**. Nella mia copia di `lib.mjs` ora è `process.env.REPO ?? "<clone>"`; il giro della base è stato rifatto su `base-12` (6/23). Il banco di Cowork in `app/` non è toccato.
2. **B7 ballerino nel banco, non nell'app.** Il primo giro completo sul ramo ha dato 23/23. Poi B7 è uscito KO in modo ripetibile («Effettuando l'accesso, accetti i nostri…» a `[45,833,345,849]`, coperto dalla lineetta) in diversi run in cui B7 veniva dopo un'altra prova (un giro completo e due parziali, B12+B7 e B1+B7; da solo passava; con la diagnostica B1+B7 è passato una volta e B12+B7 è caduto tre volte su tre). La misura: `innerHeight 844`, `scrollHeight 919`, `scrollY 0` prima e dopo `inFondo` (il primo `window.scrollTo` è ignorato, probabilmente il ripristino dello scroll del router dopo il caricamento), e **al secondo `inFondo` la pagina scorre (`scrollY 75`) e B7 passa**: con la pagina davvero in fondo, la riga dei termini è a `[758,790]`, sopra la lineetta (810). Nella mia copia di `zona-sicura.mjs`, `inFondo` ora scorre, aspetta 1,5 s e scorre di nuovo. Con questa copia: ramo 23/23, base 6/23. Senza, il giro del ramo è 23/23 o 22/23 a seconda dell'ordine. Cowork decida se portare il ritocco nel banco.
3. Il `main` locale era indietro (§2): nessun effetto sul ramo, che nasce da `origin/main`.

## 10 · Trovati e non toccati

- `src/routes/auth.tsx` (la pagina `/auth`): in verticale, appena caricata, il primo `scrollTo(0, scrollHeight)` non porta in fondo (misurato: `scrollY` resta 0 con `scrollHeight` 919 > 844). Non è la correzione della 12 e non ho verificato se un utente col dito lo noti: se il router ripristina lo scroll a 0 dopo il caricamento, scorrere a mano funziona. Da guardare, non da curare qui.

## 11 · Resta a Nicolò

- Il **merge** della PR (il link è nel messaggio di Claude Code), dopo la verifica di Cowork.
- Il **Publish** da Lovable.
- La **prova sul telefono**: tacca e lineetta in verticale e in orizzontale (coach, `/auth`, `/admin`), la push «Sessione prenotata» che apre la sessione, e la voce nella campanella.
