**Dove ho girato (ultimo ritorno · lato cliente · passata 07 · il Profilo, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0. Nessuna installazione, nel repo né fuori.

> **In lavorazione.** Questo file si riempie passo per passo: il piano qui sotto si spunta mentre lavoro, il resto (§2-§12) arriva alla chiusura.

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base e il ramo** (§2). Nessun commit di codice; questo piano è il primo commit del ramo.
   - Ambiente: la riga in testa (PC). All'avvio il clone era su `main` @ `3d29634`, pulito, come l'aveva misurato Cowork.
   - `git fetch origin` → `d15f6d4..ec64733  redesign/cliente-mobile -> origin/redesign/cliente-mobile`; `git rev-parse --short origin/redesign/cliente-mobile` → **`ec64733`** (non più avanti), albero `27c5d89`, lo stesso di `c365916`.
   - `git switch --no-track -c redesign/cliente-07-profilo origin/redesign/cliente-mobile` → `ec64733`, nessun upstream.
   - Le sonde del fuso, da PowerShell (`node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"`): `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `ec64733`, senza toccare niente: typecheck 0 errori; lint 0 errori e **14** avvisi; **1239 test in 61 file**, tutti verdi (13,0 s); build riuscita.
   - Lo script dei controlli su `ec64733` dà la colonna «oggi» del §6 riga per riga: D0 `0 su 12 · 0 · 0 · 0 · 0 · 0`, D2 `NO_COACH 2 · useMyCoach 0` nelle cinque pagine e `0 · 0` nel Profilo, `0 file · dentro: 0`, `bookCoach 0`; D3 `4 · 1 · 1 · 1 · 3 · 2 · 2 · 1 · 2`, `presente · 1`; D4 `conti: 8`, `testi: 1`; D5 tutto 0 salvo `getAttendance 1` e `isValidBlock 5`; D6 `10 file`; D7, D8, D9, D10, D12 vuoti; D11 `avvisi: 0`; D13 `0`.
1. ☐ **Il coach da `get_my_coach`** (§4.1): `MyCoachRow` e `bookCoach` in `src/lib/coach-contacts.ts`, `src/hooks/use-my-coach.ts`, i casi del §5.2.
2. ☐ **Le pagine leggono il coach** (§4.2, §4.6): `useMyCoach()` nelle cinque pagine, `coach` nelle dipendenze dei `useMemo` dello Store, i commenti che dicevano «oggi NO_COACH».
3. ☐ **Le regole del Profilo** (§4.3): `src/lib/client-settings.ts`, `clientAttendance`, `validBlockCount`, i casi del §5.1 e del §5.3.
4. ☐ **La pagina, i fogli, l'interruttore** (§4.4): `client.settings.tsx` riscritto, `client-settings-sheets.tsx`, `client-switch.tsx`, `settings-row.tsx` tolto.
5. ☐ **`PIANO.md`** (§4.7): la riga 07 a `[x]`.
6. ☐ **I cancelli e le prove rosse** (§2, §7): i quattro cancelli, i quattro file nei tre fusi, R1-R18 e R20.
7. ☐ **Il browser** (§8): `giro07.mjs` (B1-B11), R19 e i quattro giri di prima (B12).
8. ☐ **Chiusura** (§10): lo script dei controlli a lavoro committato, questo file completo, il push, la PR.
