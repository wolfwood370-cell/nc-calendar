**Dove ho girato (ultimo ritorno · lato cliente · passata 09 · la verifica finale, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0 (autenticato).

> **Lavoro in corso.** Questo file si aggiorna mentre la passata va avanti: il piano qui sotto si spunta passo per passo. Il ritorno completo (§10) lo sostituisce alla chiusura.

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base, le librerie e il ramo** (§2).
   - Ambiente: la riga in testa (PC).
   - `git fetch origin` → `origin/main` = **`7875ff7`** (non più avanti). All'avvio il clone era su `main` @ `3d29634`, pulito.
   - `git switch --no-track -c redesign/cliente-09-verifica 7875ff7` → `7875ff7`, nessun upstream.
   - ⚠️ **La prova del registro:** `307` e `307` (un rimando a `…/artifacts-downloads/namespaces/lovable-core-prod/repositories/sandbox-npm-cache/downloads/…`), non `200`. Strada presa: la procedura del 27/09. `sed` sui 429 indirizzi del lock (403 `europe-west1`, 26 `europe-west4`) verso `registry.npmjs.org`, `bun install --frozen-lockfile` → `+ @tanstack/react-router@1.170.41`, `+ @tanstack/react-start@1.168.60`, `+ @tanstack/router-plugin@1.168.42`, «59 packages installed [155.76s]», poi `git checkout -- bun.lock`: `git status --short` vuoto, `git hash-object bun.lock` = `git rev-parse 7875ff7:bun.lock` = `d93afeddf8068057f6d78347267b94b9ffacace6`.
   - Le versioni in `node_modules/@tanstack/`: react-router **1.170.41**, react-start **1.168.60**, router-plugin **1.168.42** (erano 1.170.28, 1.168.45, 1.168.31).
   - Le sonde del fuso, da PowerShell: `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `7875ff7`, con le librerie di `main`, senza toccare niente: typecheck **0**; lint **1 errore** (`prettier/prettier`, `src/routes/__root.tsx:44`) e **14** avvisi; **1357 test in 65 file**, tutti verdi; build riuscita; `LOVABLE_SANDBOX=1 bun run build` riuscita (`dist/client`, `dist/sw.js`; il manifest ha `"lang":"en"`).
   - Lo script dei controlli su `7875ff7` dà la colonna «oggi» del §6, riga per riga.
   - La stampa di Cowork sulla base si ferma su `Cannot find package '@/lib'`: i moduli nuovi `@/lib/client-type` e `@/lib/safe-email` non ci sono (nessun pacchetto mancante).
   - Il banco copiato nello scratchpad (`lib-windows.mjs` → `lib.mjs`, l'atteso della 04 accanto, la `DIR` di `giro-prenota.mjs` lì); Playwright e Chromium della cache ci sono. `git apply --check` della patch del ramo simulato passa.
1. ☐ **La push** (§4.1).
2. ☐ **I crediti** (§4.2).
3. ☐ **Le notifiche, la cornice, il dettaglio** (§4.3).
4. ☐ **Il focus e l'accessibilità** (§4.4).
5. ☐ **Misure, stili e testi** (§4.5, §4.6).
6. ☐ **WhatsApp e l'email dell'invito** (§4.7).
7. ☐ **La pulizia e `PIANO.md`** (§4.8, §4.9).
8. ☐ **I cancelli, la stampa e le prove rosse** (§2, §4, §7).
9. ☐ **Il browser** (§8).
10. ☐ **Chiusura** (§10).
