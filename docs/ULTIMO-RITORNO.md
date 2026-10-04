**Dove ho girato (ultimo ritorno · lato cliente · passata 08 · le Notifiche, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0. Nessuna installazione, nel repo né fuori.

> Lavoro in corso: questo file si completa alla chiusura (passo 8). Il ritorno della 07 resta in `5440168:docs/ULTIMO-RITORNO.md`.

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base e il ramo** (§2). Nessun commit di codice; questo piano è il commit del passo 0.
   - Ambiente: la riga in testa (PC).
   - ⚠️ All'avvio il clone era su `main` @ `3d29634` (`behind 173`), pulito, e non su `redesign/cliente-07-profilo` @ `0ef18e5` come l'aveva misurato Cowork alle 15:24: qualcuno è tornato su `main` dopo. Non cambia niente: il ramo nasce da `origin/redesign/cliente-mobile`.
   - `git fetch origin` → `ec64733..5440168  redesign/cliente-mobile -> origin/redesign/cliente-mobile`; `git rev-parse --short origin/redesign/cliente-mobile` → **`5440168`** (non più avanti), albero `66700ca`. `origin/main` è su `ac36dec` (il rilascio della 07, PR 87): non mi riguarda.
   - `git switch --no-track -c redesign/cliente-08-notifiche origin/redesign/cliente-mobile` → `5440168`, nessun upstream.
   - Le sonde del fuso, da PowerShell (`node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"`): `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `5440168`, senza toccare niente: typecheck 0 errori (25 s); lint 0 errori e **14** avvisi; **1276 test in 62 file**, tutti verdi (14 s); build riuscita (57 s).
   - `LOVABLE_SANDBOX=1 bun run build` su `5440168`: riuscita anche su Windows (25 s), `precache 88 entries (2119.11 KiB)`; `dist/sw.js` ha 88 voci, **86 col prefisso `client/`**, la `NavigationRoute` verso `index.html`, la `NetworkFirst` e `importScripts("/push-sw.js")`: lo stesso che Cowork ha misurato.
   - Lo script dei controlli su `5440168` dà la colonna «oggi» del §6 riga per riga (§6 qui sotto la riporta accanto all'uscita finale).
   - Il banco copiato nello scratchpad della sessione (`lib-windows.mjs` → `lib.mjs`, `lib.mjs` → `lib-linux.mjs`, `atteso-cli-04-2026-09-30.json` accanto alla cartella, la `DIR` di `giro-prenota.mjs` puntata lì); i due percorsi di Playwright e Chromium ci sono.
1. ☐ **Il telefono** (§4.1).
2. ☐ **Le azioni del coach e le parti dell'avviso** (§4.2).
3. ☐ **I promemoria, la lista, la cornice, la pagina, la campanella** (§4.3, §4.4).
4. ☐ **Il telefono per persona** (§4.5, §4.7).
5. ☐ **`PIANO.md`** (§4.8).
6. ☐ **I cancelli e le prove rosse** (§2, §7).
7. ☐ **Il browser** (§8).
8. ☐ **Chiusura** (§10).
