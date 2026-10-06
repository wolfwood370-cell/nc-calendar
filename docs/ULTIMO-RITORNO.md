**Dove ho girato (ultimo ritorno · lato cliente · passata 10b · il giorno della notifica, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0 (autenticato come `wolfwood370-cell`). **Le librerie:** `git hash-object bun.lock` = `git rev-parse 096c534:bun.lock` = `d93afeddf8068057f6d78347267b94b9ffacace6`, **nessuna installazione**; react-router 1.170.41, date-fns 4.1.0.

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura

0. ☑ **La base** (§2): `git fetch origin`, `origin/main` = `096c534` (`git log --oneline 096c534..origin/main`: vuoto); ramo `redesign/cliente-10b-giorno-notifica` da `096c534` con `--no-track`; lock uguale; cancelli e controlli sulla base prima di toccare niente (§4, §5). Nessun commit.
1. ☑ **La correzione e il suo test** (§3, §4): `80be56f` «Il Calendario del telefono apre il giorno della notifica, non solo la sua settimana». Il codice è la patch `ramo-simulato-cli-10b-2026-10-06.patch` di Cowork, applicata con `git apply --whitespace=error-all` senza cambiamenti (Prettier già a posto).
2. ☑ **I cancelli, i controlli, le prove rosse** (§5, §6). Nessun commit di prova; ogni file rimesso con lo sha256 di prima.
3. ⚠️ **Il browser** (§7): `giro10b-cowork.mjs` **9 su 9** sul ramo, **6 su 9** sulla base. Deviazione: la base sulla porta **5532**, non 5522, perché la 5522 era occupata da `RGSUpdater.exe` (PID 5588, un servizio di Windows): `netstat -ano` → `0.0.0.0:5522 LISTENING 5588`.
4. ☑ **Chiusura** (§8): questo file, il commit «Riscrive docs/ULTIMO-RITORNO.md per la passata 10b», il push e la PR.

⚠️ Il piano non è stato copiato in `docs/ULTIMO-RITORNO.md` all'avvio: l'ho tenuto nella bozza dello scratchpad e spuntato lì, per non lasciare un file modificato nel clone durante le prove rosse e i giri (HMR). Il file è stato scritto una volta sola, alla chiusura.

## 2 · RAMO E COMMIT

Ramo `redesign/cliente-10b-giorno-notifica`, da `096c534` (Merge pull request #91).

- `80be56f` Il Calendario del telefono apre il giorno della notifica, non solo la sua settimana
- il commit di questo ritorno («Riscrive docs/ULTIMO-RITORNO.md per la passata 10b»)

La PR verso `main` è quella che contiene questo testo; aperta, **non** unita.

## 3 · MANIFESTO

- **NUOVI:** `src/lib/agenda-day.ts` (`dayIndexOf`, `initialAgendaDayIndex`, senza React, `parseISO` + `isValid` di date-fns), `src/lib/agenda-day.test.ts` (3 casi, 10 attese).
- **MODIFICATI:** `src/components/mobile-calendar-agenda.tsx` (+16 −1: l'import, la prop `focusDate?: string` col commento, lo stato iniziale da `initialAgendaDayIndex`, l'effetto su `[focusDate, weekDays]` dopo quello di oggi), `src/components/calendar-mobile.tsx` (+1: `focusDate={date}`), `docs/ULTIMO-RITORNO.md`.
- **NON TOCCATI:** il Calendario del desktop, `trainer-notifications-bell.tsx`, `supabase/`, `package.json`, `bun.lock`, il database.

`git diff --stat 096c534 80be56f`: 4 file, 77 inserimenti, 1 cancellazione.

## 4 · I CANCELLI

| | base `096c534` | fine `80be56f` |
|---|---|---|
| typecheck (`tsc --noEmit`) | 0 | 0 |
| lint (`eslint .`) | 0 errori, 14 avvisi | 0 errori, 14 avvisi |
| suite a Roma (offset −120) | 70 file, 1430 verdi su 1430 | 71 file, **1433** verdi su 1433 |
| suite in UTC (offset 0) | 70 file, 1430 su 1430 | 71 file, 1433 su 1433 |
| suite a Los Angeles (offset 420) | 70 file, 1430 su 1430 | 71 file, 1433 su 1433 |
| build (`vite build`) | 0 | 0 |

- **Avvisi per regola**, uguali su base e fine: `react-refresh/only-export-components` 10, `react-hooks/exhaustive-deps` 4.
- **I fusi** da PowerShell (`$env:TZ = "UTC"` / `"America/Los_Angeles"` / `$null`), una suite per fuso; `node -e "console.log(new Date(2026,9,6).getTimezoneOffset())"` dà `-120`, `0`, `420`.
- **La sonda nei worker:** un test temporaneo `src/lib/zz-sonda-tz.test.ts`, scritto e cancellato dallo script, fuori dal commit, che scrive `process.env.TZ` e l'offset in un file dello scratchpad: `(nessuno) -120`, `UTC 0`, `America/Los_Angeles 420`. Dopo, `git status` pulito.
- I test di prima non perdono righe (D4 = 0): +3 test, tutti in `agenda-day.test.ts`.
- Dopo le prove rosse, la suite nei tre fusi rifatta: 1433 su 1433 in tutti e tre.

## 5 · ACCEPTANCE

`node "C:/Coworks/NC App Development/app/controlli-cli-10b-2026-10-06.mjs"` dalla radice del clone, in Git Bash.

Sulla base (prima di toccare niente), uguale alla colonna «oggi» del prompt:

```
D0 agenda-day.ts: export function dayIndexOf( 0 · export function initialAgendaDayIndex( 0 · parseISO( 0 · new Date(date) 0
D1 calendar-mobile.tsx: focusDate={date} 0 · mobile-calendar-agenda.tsx: focusDate?: string 0 · initialAgendaDayIndex(weekDays, focusDate, today) 0 · dayIndexOf(weekDays, focusDate) 0 · }, [focusDate, weekDays]); 0 · useState<number>(todayIdx >= 0 ? todayIdx : 0) 1
D2 agenda-day.test.ts: «la sessione del 7 apre il 7» 0 · «oggi, poi il lunedì» 0 · «legge il giorno locale» 0
D3 file cambiati: 0 · fuori dall'elenco: 0
D4 righe tolte dai test di prima: 0
```

Dopo `80be56f`: `diff` con `app\atteso-controlli-cli-10b-2026-10-06.txt` **vuoto** (D3 `file cambiati: 4`). Col ritorno committato D3 diventa `file cambiati: 5 · fuori dall'elenco: 0`, come chiede il §5 (unica riga diversa dall'atteso del container, che non ha il ritorno).

## 6 · LE PROVE ROSSE

Script `scratchpad\rosse10b.mjs`: sostituzione esatta e unica nel codice (mai nei test), suite intera con `node node_modules/vitest/vitest.mjs run --reporter=json` e/o il giro, poi il file rimesso e lo sha256 confrontato: **uguale in tutte e quattro**.

- **RB1** · `agenda-day.ts`: `const asked = dayIndexOf(weekDays, date);` → `const asked = -1;`. Suite a Roma: **2 rossi su 1433** («la data di una notifica vince su oggi…», «senza data, o con una data fuori settimana…»); il terzo caso resta verde. Giro `solo=B1,B2,B3`: **9 su 9**, come previsto: l'effetto su `focusDate` sceglie il giorno subito dopo il primo disegno, quindi il browser non vede la rottura dello stato iniziale.
- **RB2** · `calendar-mobile.tsx` senza `focusDate={date}`. Suite: 1433 verdi. Giro `solo=B1,B2,B3`: **6 su 9**; KO B1 «la notifica del 30/09 apre il 30» (visto `28`), B2 «la notifica del 26/09 apre il 26» (visto `25`), B3 «con ?date=2026-09-30: il 30» (visto `28`).
- **RB3** · `mobile-calendar-agenda.tsx`: `}, [focusDate, weekDays]);` → `});`. Giro `solo=B1`: **5 su 6**, KO «B1 · un altro giorno toccato resta scelto» (atteso `1`, visto `30`): senza dipendenze l'effetto rimette il giorno chiesto a ogni disegno.
- **RB4** · `agenda-day.ts`: `const d = parseISO(date);` → `const d = new Date(date);`. A Los Angeles **3 rossi su 1433** (tutti e tre i casi di `agenda-day.test.ts`); a Roma 1433 verdi.

Rimesso il codice: suite nei tre fusi 1433 su 1433, giro intero 9 su 9 (§7).

## 7 · IL BROWSER

Banco copiato da `app\banco-cli-2026-09-30` in `scratchpad\banco\`, con `atteso-cli-04-2026-09-30.json` accanto e `lib-windows.mjs` copiato in `lib.mjs` (Playwright `…/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright`, Chromium `…/ms-playwright/chromium_headless_shell-1200/…`: entrambi presenti). In `app\` non ho scritto niente. Un server di sviluppo alla volta, nessun file del clone toccato durante i giri.

- **Ramo**, `REPO=<clone> DATI05=dati-cli-06-2026-10-01.json node giro10b-cowork.mjs porta=5512`: **`ESITO: 9 su 9`**, e di nuovo 9 su 9 dopo le prove rosse. Le tre voci finali (richieste esterne bloccate 0, funzioni server 0, errori di pagina `[]`) sono fra le 9.
- **Base**, worktree staccata `scratchpad\base-10b` su `096c534`, `node_modules` con una giunzione da PowerShell (`New-Item -ItemType Junction`), porta **5532** (vedi §1, passo 3): **`ESITO: 6 su 9`**, gli stessi KO del container:
  - KO B1 · la notifica del 30/09 apre il 30, non il lunedì — visto `28`
  - KO B2 · la notifica del 26/09 apre il 26, non oggi (25) — visto `25`
  - KO B3 · con ?date=2026-09-30: il 30 — visto `28`
- Alla fine la giunzione staccata con `(Get-Item …\node_modules).Delete()` e `git worktree remove --force`; `git worktree list` mostra solo il clone, `node_modules` del clone intatto.

## 8 · NON FATTO

Niente del contratto. Non ho fatto la prova sul telefono vero (resta a Nicolò, §11).

## 9 · DIVERGENZE DAL PROMPT

- **La porta della base:** 5532 invece di 5522, occupata da `RGSUpdater.exe` (PID 5588). Il giro è lo stesso.
- **Il piano in testa al ritorno:** tenuto nella bozza dello scratchpad e copiato in `docs/` solo alla chiusura (vedi §1).
- **D3** a lavoro finito è `5` (col ritorno) invece del `4` dell'atteso del container: è il valore che il §5 del prompt dà per il PC.

## 10 · TROVATI E NON TOCCATI

- **La stessa notifica toccata due volte, a Calendario aperto:** se il coach apre la notifica del 30, poi tocca a mano giovedì 1 e infine riapre la stessa notifica, l'indirizzo non cambia (`date` ed `event` uguali), quindi né `focusDate` né `weekDays` cambiano e l'agenda resta sull'1. Con una notifica diversa, o dopo un cambio di settimana a mano (che toglie `date`), il giorno chiesto torna. L'ho ricavato dal codice, non misurato nel browser: il giro non ha questo caso.
- `sameDay` ora esiste due volte, in `mobile-calendar-agenda.tsx` (esportato, usato da `calendar-mobile.tsx`) e in `src/lib/agenda-day.ts` (privato). Il prompt vuole `agenda-day.ts` senza React, e importarlo da un file `.tsx` di componenti lo trascinerebbe. Si potrebbe spostare il primo in `src/lib/` in una passata futura.

## 11 · RESTA A NICOLÒ

- la verifica di Cowork, poi il **merge** della PR;
- il **Publish** su Lovable;
- la **prova sul telefono**: toccare la notifica di una sessione di un giorno diverso da oggi (nella settimana e in quella dopo) e controllare che l'agenda apra quel giorno.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
