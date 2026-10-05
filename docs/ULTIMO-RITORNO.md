**Dove ho girato (ultimo ritorno · lato cliente · passata 09 · la verifica finale, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0 (autenticato). **La prova del registro:** `307` e `307` (un rimando a `…/artifacts-downloads/namespaces/lovable-core-prod/repositories/sandbox-npm-cache/downloads/…`), non `200`; **strada presa:** la procedura del 27/09 (`sed` sui 429 indirizzi del lock verso `registry.npmjs.org`, solo nella copia di lavoro). **`bun install --frozen-lockfile`:** `+ @tanstack/react-router@1.170.41`, `+ @tanstack/react-start@1.168.60`, `+ @tanstack/router-plugin@1.168.42`, «59 packages installed [155.76s]»; installate in `node_modules/@tanstack/`: **1.170.41**, **1.168.60**, **1.168.42**. **Il lock com'era:** `git checkout -- bun.lock`, poi `git status --short` vuoto e `git hash-object bun.lock` = `git rev-parse 7875ff7:bun.lock` = `d93afeddf8068057f6d78347267b94b9ffacace6`.

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base, le librerie e il ramo** (§2). Nessun commit (il piano in testa a questo file: `a01a486`).
   - Ambiente: la riga in testa (PC).
   - `git fetch origin` → `origin/main` = **`7875ff7`** (non più avanti). All'avvio il clone era su `main` @ `3d29634`, pulito.
   - `git switch --no-track -c redesign/cliente-09-verifica 7875ff7` → `7875ff7`, nessun upstream.
   - ⚠️ **La prova del registro:** `307` e `307`, non `200`. Strada presa: la procedura del 27/09. `sed` sui 429 indirizzi del lock (403 `europe-west1`, 26 `europe-west4`) verso `registry.npmjs.org`, `bun install --frozen-lockfile` (uscita nella riga in testa), poi `git checkout -- bun.lock`: il lock identico a quello di `7875ff7`.
   - Le versioni in `node_modules/@tanstack/`: react-router **1.170.41**, react-start **1.168.60**, router-plugin **1.168.42** (erano 1.170.28, 1.168.45, 1.168.31).
   - Le sonde del fuso, da PowerShell: `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `7875ff7`, con le librerie di `main`, senza toccare niente: typecheck **0**; lint **1 errore** (`prettier/prettier`, `src/routes/__root.tsx:44`) e **14** avvisi; **1357 test in 65 file**, tutti verdi; build riuscita; `LOVABLE_SANDBOX=1 bun run build` riuscita (`dist/client`, `dist/sw.js`; il manifest ha `"lang":"en"`).
   - Lo script dei controlli su `7875ff7` dà la colonna «oggi» del §6, riga per riga (§10, punto 6).
   - La stampa di Cowork sulla base si ferma su `Cannot find package '@/lib'`: i moduli nuovi `@/lib/client-type` e `@/lib/safe-email` non ci sono (nessun pacchetto mancante).
   - Il banco copiato nello scratchpad (`lib-windows.mjs` → `lib.mjs`, l'atteso della 04 accanto, la `DIR` di `giro-prenota.mjs` lì); Playwright e Chromium della cache ci sono. `git apply --check` della patch del ramo simulato passa.
1. ☑ **La push** (§4.1). `836c6b0`. La coppia nuova nel file di backup (§10, punto 3); `git -C "C:/Coworks/NC App Development" check-ignore -v -- backup/chiavi-push-nc-calendar.bak.txt` → `.gitignore:2:*.bak*`. `push.test.ts` verde (29: 11 della 08, 18 nuovi); D2 e D22 all'atteso; typecheck 0. Prova di fumo con Deno di `_shared/push.ts` (web-push finto, senza rete): il 403 scrive `reason: {"reason":"BadJwtToken"}`, un corpo lungo si taglia a 300, l'endpoint non compare, il 410 cancella ancora la riga.
2. ☑ **I crediti** (§4.2). `2f05207`. Typecheck 0; suite intera 1396 in 65, verde (anche `session-create` e `session-edit`, che usano il finto del calendario); D18 `0 · 1 · 1`, D21 `5 · 4 e 1 · 1 · 1 · 1 · 1`. Il finto segue `reschedule_booking` dello SQL del 02/10 (`app/server-giro-2026-10-02.sql:951-993`). Gli extra di Sposta si leggono solo per una sessione senza blocco (per le altre la lettura resta spenta). Il commento di `storeSummary` dice anche il caso del Booster prorogato.
3. ☑ **Le notifiche, la cornice, il dettaglio** (§4.3). `ae1e41f`. I due file di test verdi (40); typecheck 0; D9 `1 · 0`, D14 `0 · 1`, D19 `1 · 3 · 0`, D23 `readMemory 4`. I contrasti del §4.3 punto 5 rifatti: 4,38-6,70 per i token, 2,76 per `#039be5`, 4,19 per `#0277bd`.
   - ⚠️ Il focus dopo «Riprova» della pagina Notifiche è andato al passo 4 (`src/routes/client.notifications.tsx`, l'effetto di `retried`): usa `focusIfLost`, che nasce lì, e ogni commit deve compilare da solo.
4. ☑ **Il focus e l'accessibilità** (§4.4). `95fd0f2`. Typecheck 0; lint **0 errori** e 14 avvisi (l'errore di Prettier di `src/routes/__root.tsx:44` è tolto qui); suite intera 1406 in 67, verde; D3 `1 · 0 · 1 · 0 · 1`, D7 `0 · 8`, D12 `1 · 1 · 1`, D16 `7 su 7`, D17 `1 · 1 · 1 · 1`, D23 `3 · 4`, D24 `2 · 0`. Comprende il focus delle Notifiche spostato dal passo 3.
5. ☑ **Misure, stili e testi** (§4.5, §4.6). `8754eb6`. Typecheck 0; lint 0 e 14; 1407 in 68, verde; D4 `29 · 0`, D5 `0 · 1 · 1`, D6 `0 · 1`, D13 `0 · 0 · 3`.
   - ⚠️ **La soglia della pillola è 95, non 98:** misurata prima del commit con Manrope servito davvero (`banco\sonda-pillola09.mjs`, solo GET verso i due host dei font): «WhatsApp» 70,766 px + icona 16 + spazio 6 = **92,766 px**; più 2 = 94,766 → **`@max-[95px]:hidden`** (`src/routes/client.settings.tsx`, la pillola). Sulla base a 360 px la pillola è larga 91,33 px e il testo ne esce (`scrollWidth` 92 > `clientWidth` 91); col codice nuovo l'icona si nasconde a 320, 360 e 368 px (78, 91,33 e 94 px), resta a 375 e 390 (96,33 e 101,33), e nessun testo esce.
   - ⚠️ Sulla base i titoli in Sora per una classe dimenticata erano **17**, non 21: dei 21 che D4 conta, 4 avevano già `font-sans … tracking-normal` scritto a mano (`client-home-credits.tsx:85`, `client-home-install.tsx:90`, `client-home-progress.tsx:42`, `client-page-header.tsx:41`). Il commento di `client-type.ts` dice 17.
6. ☑ **WhatsApp e l'email dell'invito** (§4.7). `8c09b58`. Typecheck 0; lint 0 e 14; 1413 in 69, verde; D10 `0 · 1`, D11 `… new-client-dialog.tsx src/lib/safe-email.ts · 1 · 0 · 3 su 3 · 0`. La regex di `isSafeEmail` è spostata identica (confrontata con `7875ff7:src/lib/gcal.server.ts:91`).
7. ☑ **La pulizia e `PIANO.md`** (§4.8, §4.9). `7a0443a`. 1412 in 69, verde; D8 `0 su 3 · 1`, D15 `1 · righe tolte 1, aggiunte 1` (la riga cambiata con `sed`: l'hook di Prettier riscriverebbe il file), D20 `0`, D25 `3 · booking-rules.test.ts 2 · client-settings.test.ts 1 · 0`; a commit fatto D1 `fuori dall'elenco: 0`, 16 test cambiati o nuovi. Orfani misurati prima di toglierli: nessun import di `calendar.ts` e `aura-progress-ring.tsx`, `reschedule-slots.ts` solo da `booking-rules.test.ts`.
8. ☑ **I cancelli, la stampa e le prove rosse** (§2, §4, §7). Nessun commit di prova; i numeri finali sono su `7fe67ad` (§10, punto 5); R1-R38 cadute tutte (§10, punto 7).
   - ⚠️ **Un commit in più, `7fe67ad`, solo commenti** («Commenti resi falsi dalla 09 stessa…»): una revisione in sola lettura del ramo (un agente separato, su una fotografia di `7a0443a`) ha trovato cinque punti; i commenti resi falsi dalla 09 stessa li ho corretti (`client-book.ts`: `BookStateInput.extras`, la testa di `getBookState`, `creditLine`; `client-credits.ts`: `ClientPoolsInput.extras`; `push.ts`: `LEAVING_WINDOW_MS`; `client-settings.ts`: `coachCard`), il resto sta fra i trovati (§10, punto 11). Che siano solo commenti l'ho misurato: per ogni file, `transpileModule` di TypeScript con `removeComments` dà lo stesso testo su `7a0443a` e su `7fe67ad`. Dopo il commit ho rifatto tutto: i cancelli, i file del §5 nei tre fusi, la stampa nei tre fusi, i controlli, B19 e il giro intero.
9. ☑ **Il browser** (§8). Nessun commit: i file di prova stanno nella copia del banco, nello scratchpad. `giro09.mjs` **132 su 132** su `7fe67ad` (111 su 111 su `7a0443a`, prima della parte B22); R39-R53 **17 su 17** rosse; le prove delle regole nel giro **7 su 7**; B19 «come atteso» nei due versi, col manifest in italiano; B20: giro04 103 su 104 e giro07 138 su 147 come previsto da Cowork, giro-prenota fermo in B5 per il §4.2 punto 6 (la controprova passa), gli altri come sulla 08; B22 voce per voce (§10, punto 8).
10. ☑ **Chiusura** (§10). Il commit di questo file. Lo script dei controlli a lavoro committato (§10, punto 6), D26 lanciato su questo file (la riga al §10, punto 6), `git push -u origin redesign/cliente-09-verifica`, la PR.

## 10 · IL RITORNO

### 0 · Dove ho girato

La riga in testa: sul PC, coi codici del registro (`307` e `307`), la procedura del 27/09, l'uscita di `bun install --frozen-lockfile`, le tre versioni di TanStack e il lock tornato identico (`d93afeddf8068057f6d78347267b94b9ffacace6`).

### 1 · Il piano

Spuntato qui sopra, passo per passo.

### 2 · Ramo e commit

`redesign/cliente-09-verifica`, da `7875ff7` (`origin/main` non era andato avanti: all'inizio e di nuovo alla fine, dopo `git fetch origin`, `origin/main` = `7875ff7`). I commit, in ordine:

- `a01a486` Il piano della passata 09 in testa a docs/ULTIMO-RITORNO.md
- `836c6b0` La push: coppia di chiavi nuova, l'iscrizione si rifà quando la chiave cambia, l'uscita non chiesta libera il telefono, il motivo del rifiuto nei log
- `2f05207` I crediti: il blocco dopo con i suoi extra, l'avviso con gli extra che scadono col blocco, Sposta con l'extra della sessione, «Acquista» solo per i Booster in vendita
- `ae1e41f` Notifiche: una riga nata dopo la lettura tiene il dettaglio, le lette anche in memoria, la cache ferma la lettura in volo, il dettaglio nello scope, i colori del tema
- `95fd0f2` Accessibilità: il focus dopo «Riprova» e «Ripristina», i tab col loro pannello, i pulsanti occupati tengono il focus, il foglio della password annuncia l'errore, la lingua italiana
- `8754eb6` I titoli in Manrope da un posto solo, le icone delle tipologie leggibili, la riga dei crediti e la pillola dei contatti, «sessione» al posto di «appuntamento»
- `8c09b58` WhatsApp col prefisso del paese, l'email dell'invito con la regola del server
- `7a0443a` Pulizia: moduli e token che nessuno usa, commenti che dicevano il falso; PIANO.md: la passata 09 è fatta
- `7fe67ad` Commenti resi falsi dalla 09 stessa: gli extra contano anche nei giorni del blocco dopo, il segno dell'uscita e le schede ferme in background, lo 00 di WhatsApp
- il commit di questo file: «Riscrive docs/ULTIMO-RITORNO.md per la passata 09»

La PR: aperta con questo file come descrizione, verso `main`, non unita. Il numero della PR e l'hash del commit di questo file sono nella risposta in chat.

### 3 · La chiave

Le righe come le ha stampate `genera-chiavi-push-cli-09-2026-10-05.mjs`:

```
chiave pubblica (va in src/lib/push.ts): BMAawwktEABnlhpEZlqEqMs8wRGNfT1DcFxSAC39zPZ1awDpa_5Zj2UVeVYUXbKEBSg8mygOejjG9SymgtGk1dc
privata: solo nel file C:/Coworks/NC App Development/backup/chiavi-push-nc-calendar.bak.txt · impronta sha256 2a8feb08383c1acf · 43 caratteri
coppia verificata: una firma con la privata si verifica con la pubblica
```

Il file: `C:\Coworks\NC App Development\backup\chiavi-push-nc-calendar.bak.txt`, ignorato dal repo dei documenti (`.gitignore:2:*.bak*`). **Coppia verificata.** Il file non l'ho aperto né letto: lo hanno letto solo lo script che lo scrive e quello dei controlli con `--chiave` (D26).

### 4 · Manifesto (`git diff --name-status 7875ff7..HEAD`: 81 file, `docs/ULTIMO-RITORNO.md` compreso)

- **NUOVI (7):** `src/lib/client-type.ts`, `src/lib/client-type.test.ts`, `src/lib/focus.ts`, `src/lib/focus.test.ts`, `src/lib/query-keys.test.ts`, `src/lib/safe-email.ts`, `src/lib/safe-email.test.ts`.
- **MODIFICATI (71):** `design_handoff_cliente_mobile/PIANO.md` (la riga 09), `docs/ULTIMO-RITORNO.md`, `src/styles.css`, `supabase/functions/_shared/push.ts`, `vite.config.ts`; in `src/components/`: `book-blocked-card.tsx`, `book-sheets.tsx`, `book-type-picker.tsx`, `client-booking-detail-view.tsx`, `client-button.tsx`, `client-cancel-sheet.tsx`, `client-home-credits.tsx`, `client-home-install.tsx`, `client-home-next.tsx`, `client-home-progress.tsx`, `client-move-sheet.tsx`, `client-page-header.tsx`, `client-session-rating.tsx`, `client-settings-sheets.tsx`, `client-store-cards.tsx`, `focus-client-panel.tsx`, `integrations-gcal-card.tsx`, `segmented-control.tsx`, `segmented-control.test.ts`; in `src/hooks/`: `use-client-book-state.ts`, `use-client-shell.ts`, `use-confirm-attendance.ts`, `use-move-undo.ts`, `use-pwa.ts`, `use-restore-booking.ts`; in `src/lib/`: `auth.tsx`, `availability-exceptions.ts`, `booking-rules.ts`, `booking-rules.test.ts`, `booking-slots.ts`, `calendar-events.ts`, `calendar-events.test.ts`, `client-book.ts`, `client-book.test.ts`, `client-credits.ts`, `client-credits.test.ts`, `client-home.ts`, `client-home.test.ts`, `client-notifications.ts`, `client-notifications.test.ts`, `client-session-detail.ts`, `client-session-detail.test.ts`, `client-settings.ts`, `client-settings.test.ts`, `client-store.ts`, `client-store.test.ts`, `coach-contacts.test.ts`, `credit-order.ts`, `current-block.ts`, `error-page.ts`, `event-type-rules.ts`, `gcal.server.ts`, `push.ts`, `push.test.ts`, `queries.ts`, `query-keys.ts`, `segment-keys.ts`, `testing/client-store-seed.ts`, `testing/memory-calendar-store.ts`; in `src/routes/`: `__root.tsx`, `client.book.tsx`, `client.bookings.$bookingId.tsx`, `client.index.tsx`, `client.notifications.tsx`, `client.sessions.tsx`, `client.settings.tsx`.
  Di questi, cambiano solo nei commenti (misurato con `transpileModule` di TypeScript e `removeComments`, contro `7875ff7`): `src/components/integrations-gcal-card.tsx`, `src/hooks/use-restore-booking.ts`, `src/lib/availability-exceptions.ts`, `src/lib/booking-slots.ts`, `src/lib/credit-order.ts`, `src/lib/current-block.ts`, `src/lib/event-type-rules.ts`, `src/lib/testing/client-store-seed.ts`.
- **TOLTI (3):** `src/lib/calendar.ts`, `src/lib/reschedule-slots.ts`, `src/components/ui/aura-progress-ring.tsx`.
- **NEL PERIMETRO MA NON TOCCATI:** nessuno dei 65 file dell'elenco di D1 (li tocca tutti il ramo). Lasciati com'erano, come vuole il §9: `src/routes/auth.tsx`, `src/integrations/` (con `supabase/types.ts`), `src/hooks/use-notifications.ts`, `src/lib/testing/` salvo i due file del §4.2, `design_handoff_cliente_mobile/` salvo la riga 09 di `PIANO.md`, il lato coach salvo `whatsappUrl`, `focus-client-panel.tsx` e i commenti del §4.7 e del §4.8. In `src/lib/auth.tsx` il diff ha solo l'import da `@/lib/push`, `useRef`, il commento, il segno in memoria, la riga che libera il telefono e il `try`/`finally` di `signOut`.

### 5 · I cancelli

| | `7875ff7` (passo 0) | `7fe67ad` (fine) |
|---|---|---|
| typecheck | 0 | 0 |
| lint | 1 errore (`prettier/prettier`, `src/routes/__root.tsx:44`), 14 avvisi | **0 errori**, 14 avvisi |
| test | 1357 in 65 file, verdi | **1412 in 69 file**, verdi |
| build | riuscita | riuscita |
| `LOVABLE_SANDBOX=1 bun run build` | riuscita, manifest `"lang":"en"` | riuscita: `dist/client`, `dist/sw.js` (precache 1 voce), manifest `"lang":"it"`; B19 «come atteso» |

**I sedici file del §5 nei tre fusi**, da PowerShell, su `7fe67ad`: `UTC` (sonda `0`) 558 test in 16 file, verdi; `America/Los_Angeles` (sonda `420`) 558 in 16, verdi; Roma, senza `TZ` (sonda `-120`) 558 in 16, verdi. Vitest stampa l'ora d'inizio nel fuso del processo: 06:45, 23:45 e 08:45, cioè `TZ` è arrivato. Su `7a0443a` gli stessi numeri.

**La stampa di Cowork**, col suo risolutore, nei tre fusi, su `7fe67ad`: `UTC` (sonda `0`), `America/Los_Angeles` (`420`) e Roma (`-120`) danno 12546 byte, e `cmp` con `atteso-cli-09-2026-10-05.json` non trova differenze in nessuno dei tre.

Nessun file caduto al caricamento, nessun `heap out of memory`.

### 6 · Acceptance

L'uscita intera di `node "C:/Coworks/NC App Development/app/controlli-cli-09-2026-10-05.mjs"` a lavoro committato (`7fe67ad`), uscita 0:

```
== D0 · i nomi nuovi
16 su 16
== D1 · il manifesto
fuori dall'elenco: 0
test cambiati o nuovi: 16 · src/components/segmented-control.test.ts src/lib/booking-rules.test.ts src/lib/calendar-events.test.ts src/lib/client-book.test.ts src/lib/client-credits.test.ts src/lib/client-home.test.ts src/lib/client-notifications.test.ts src/lib/client-session-detail.test.ts src/lib/client-settings.test.ts src/lib/client-store.test.ts src/lib/client-type.test.ts src/lib/coach-contacts.test.ts src/lib/focus.test.ts src/lib/push.test.ts src/lib/query-keys.test.ts src/lib/safe-email.test.ts
== D2 · la push
chiave: 65 byte, primo 4, diversa da quella di prima 1, diversa da quella della prova di Cowork 1
subscribeToPush: subscriptionKeyMatches( 1 · unsubscribe() 1 · delete del vecchio endpoint 1 · isPushEnabledFor: subscriptionKeyMatches( 1
auth.tsx: shouldReleaseOnAuthEvent( 1 · releasePushDevice() 1 · leaving.current = true 1 · markLeaving() 1 · leftOnPurposeRecently( 1
_shared/push.ts: reason 1
stringhe da 43 caratteri base64url fra virgolette: 0 · file nel repo con chiav/vapid/private/.bak nel nome: 0
== D3 · la lingua
__root.tsx: lang="it" 1 · lang="en" 0 · error-page.ts: lang="it" 1 · testi inglesi 0 · vite.config.ts: lang: "it" 1
== D4 · i titoli
titoli 29 · senza la classe 0
== D5 · la pillola
max-[360px]:hidden 0 · @container 1 · @max-[ 1
== D6 · la riga dei crediti
min-w-24 in una classe 0 · basis-24 in una classe 1
== D7 · i pulsanti occupati
disabled con una richiesta in volo: 0 · busy={ 8
== D8 · gli orfani
ancora presenti 0 su 3 · ui/drawer.tsx 1
== D9 · il dettaglio nello scope
invalidateQueries booking-detail 1 · coach-busy-reschedule nel codice 0
== D10 · WhatsApp
wa.me/${ fuori da calendar-events.ts: 0 · focus-client-panel usa whatsappUrl( 1
== D11 · l'email dell'invito
EMAIL_RE in src/components/new-client-dialog.tsx src/lib/safe-email.ts · gcal.server.ts inviteEmail( 1 · isSafeEmail definita in gcal.server.ts 0 · testi con inviteEmail( 3 su 3 · ?.trim() nei tre testi 0
== D12 · i tab
client.sessions.tsx: role="tabpanel" 1 · idBase= 1 · segmented-control: aria-controls 1
== D13 · i testi
parole tolte dal brief: 0 · «Cancellazione non riuscita» 0 · «Annullamento non riuscito» 3
== D14 · i colori
esadecimali nei componenti del cliente: 0 · info-bia-text in styles.css 1
== D15 · PIANO.md
riga 09 spuntata 1 · righe tolte 1, aggiunte 1
== D16 · il focus
focusIfLost( in 7 file su 7
== D17 · la password
flushSync( 1 · role="alert" 1 · passwordSaveError(null) 1 · catch 1
== D18 · i Booster in vendita
use-client-book-state: useActiveShopTitles 0 · sellablePackTitles( 1 · storeProducts usa isSellablePack 1
== D19 · la cornice
markRowsInCache: cancelQueries prima di setQueryData 1 · bookingIdsAt 3 · bookingsFetching 0
== D20 · i commenti
frasi vecchie ancora presenti: 0
== D21 · i crediti
nextCountPool in client-book.ts 5 · extraAvailUntilEnd in client-credits.ts 4 e client-home.ts 1 · getMoveWindow con gli extra 1 · client-move-sheet legge gli extra 1 · «scadenza del credito» nelle regole di Sposta 1 · il foglio senza finestra moveNoCreditText( 1
== D22 · il Profilo
serviceWorker.ready 1
== D23 · la memoria
use-pwa: markedInMemory 3 · use-client-shell: readMemory 4
== D24 · la presenza
useConfirmAttendance(coach) 2 · «Il tuo coach vedrà» 0
== D25 · i test di prima
righe di codice tolte: 3 · src/lib/booking-rules.test.ts 2 · src/lib/client-settings.test.ts 1 · file di test tolti: 0
```

La colonna «oggi», lo stesso script su `7875ff7` al passo 0:

```
== D0 · i nomi nuovi
0 su 16
== D1 · il manifesto
fuori dall'elenco: 0
test cambiati o nuovi: 0
== D2 · la push
chiave: 65 byte, primo 4, diversa da quella di prima 0, diversa da quella della prova di Cowork 1
subscribeToPush: subscriptionKeyMatches( 0 · unsubscribe() 0 · delete del vecchio endpoint 0 · isPushEnabledFor: subscriptionKeyMatches( 0
auth.tsx: shouldReleaseOnAuthEvent( 0 · releasePushDevice() 0 · leaving.current = true 0 · markLeaving() 0 · leftOnPurposeRecently( 0
_shared/push.ts: reason 0
stringhe da 43 caratteri base64url fra virgolette: 0 · file nel repo con chiav/vapid/private/.bak nel nome: 0
== D3 · la lingua
__root.tsx: lang="it" 0 · lang="en" 1 · error-page.ts: lang="it" 0 · testi inglesi 5 · vite.config.ts: lang: "it" 0
== D4 · i titoli
titoli 29 · senza la classe 21 · src/components/book-blocked-card.tsx:42 src/components/book-blocked-card.tsx:75 src/components/book-type-picker.tsx:53 src/components/client-booking-detail-view.tsx:373 src/components/client-booking-detail-view.tsx:381 src/components/client-home-credits.tsx:85 src/components/client-home-install.tsx:90 src/components/client-home-progress.tsx:42 src/components/client-move-sheet.tsx:263 src/components/client-move-sheet.tsx:272 src/components/client-page-header.tsx:41 src/components/client-session-rating.tsx:148 src/components/client-store-cards.tsx:42 src/components/client-store-cards.tsx:70 src/components/client-store-cards.tsx:113 src/routes/client.book.tsx:404 src/routes/client.book.tsx:419 src/routes/client.bookings.$bookingId.tsx:103 src/routes/client.sessions.tsx:170 src/routes/client.sessions.tsx:203 src/routes/client.sessions.tsx:249
== D5 · la pillola
max-[360px]:hidden 1 · @container 0 · @max-[ 0
== D6 · la riga dei crediti
min-w-24 in una classe 1 · basis-24 in una classe 0
== D7 · i pulsanti occupati
disabled con una richiesta in volo: 8 · busy={ 0
== D8 · gli orfani
ancora presenti 3 su 3 · ui/drawer.tsx 1
== D9 · il dettaglio nello scope
invalidateQueries booking-detail 0 · coach-busy-reschedule nel codice 1
== D10 · WhatsApp
wa.me/${ fuori da calendar-events.ts: 1 · src/components/focus-client-panel.tsx · focus-client-panel usa whatsappUrl( 0
== D11 · l'email dell'invito
EMAIL_RE in src/components/new-client-dialog.tsx src/lib/gcal.server.ts · gcal.server.ts inviteEmail( 0 · isSafeEmail definita in gcal.server.ts 1 · testi con inviteEmail( 0 su 3 · ?.trim() nei tre testi 3
== D12 · i tab
client.sessions.tsx: role="tabpanel" 0 · idBase= 0 · segmented-control: aria-controls 0
== D13 · i testi
parole tolte dal brief: 4 · src/routes/client.bookings.$bookingId.tsx:appuntament src/routes/client.bookings.$bookingId.tsx:appuntament src/routes/client.index.tsx:appuntament src/routes/client.index.tsx:appuntament · «Cancellazione non riuscita» 1 · «Annullamento non riuscito» 2
== D14 · i colori
esadecimali nei componenti del cliente: 11 · src/routes/client.notifications.tsx:"#c2410c" src/routes/client.notifications.tsx:"#c2410c" src/routes/client.notifications.tsx:"#c2410c" src/routes/client.notifications.tsx:"#b45309" src/routes/client.notifications.tsx:"#005685" src/routes/client.notifications.tsx:"#b91c1c" src/routes/client.notifications.tsx:"#005685" src/routes/client.notifications.tsx:"#047857" src/routes/client.notifications.tsx:"#047857" src/routes/client.notifications.tsx:"#047857" src/routes/client.notifications.tsx:"#039be5" · info-bia-text in styles.css 0
== D15 · PIANO.md
riga 09 spuntata 0 · righe tolte 0, aggiunte 0
== D16 · il focus
focusIfLost( in 0 file su 7
== D17 · la password
flushSync( 0 · role="alert" 0 · passwordSaveError(null) 0 · catch 0
== D18 · i Booster in vendita
use-client-book-state: useActiveShopTitles 2 · sellablePackTitles( 0 · storeProducts usa isSellablePack 0
== D19 · la cornice
markRowsInCache: cancelQueries prima di setQueryData 0 · bookingIdsAt 0 · bookingsFetching 3
== D20 · i commenti
frasi vecchie ancora presenti: 18 · oggi il cliente non lo legge | lo usa ancora il lato | il coach di oggi, senza telefono | un telefono che non è | Oggi lo applica solo | la sua chiave non è nello | Il coach non si legge | qui entra nella card vuota | reschedule-slots.ts | gcal.server.ts:1 | client-booking-detail-view.tsx:2 | invalidateBookingScope no | Dichiarato, non corretto | useActiveShopTitles). */ | Cosa il server oggi non fa | reschedule_booking non la guarda | l'inserimento non ne ha | cancel_booking lo scrive anche su di loro
== D21 · i crediti
nextCountPool in client-book.ts 0 · extraAvailUntilEnd in client-credits.ts 0 e client-home.ts 0 · getMoveWindow con gli extra 0 · client-move-sheet legge gli extra 0 · «scadenza del credito» nelle regole di Sposta 0 · il foglio senza finestra moveNoCreditText( 0
== D22 · il Profilo
serviceWorker.ready 0
== D23 · la memoria
use-pwa: markedInMemory 0 · use-client-shell: readMemory 0
== D24 · la presenza
useConfirmAttendance(coach) 0 · «Il tuo coach vedrà» 1
== D25 · i test di prima
righe di codice tolte: 0 · file di test tolti: 0
```

D26, lanciato alla lettera dalla radice del clone dopo aver scritto questo file:

```
impronta 2a8feb08383c1acf · nei commit del ramo 0 · nei file dell'albero 0 · nel corpo della PR 0
```

### 7 · Le prove rosse

Ogni mutante rompe il codice (mai i test) con sostituzioni esatte, ognuna trovata una volta sola; dopo, i file tornano com'erano (sha256 uguale, controllato a ogni prova). Gli arnesi stanno nello scratchpad (`rosse09\`, `banco\`).

Su `7a0443a` (il commit dopo cambia solo commenti). **R1-R27 sulla stampa** (`rosse09\stampa-rosse.mjs`, a Roma): prima e dopo la stampa è uguale all'atteso byte per byte; **27 su 27** cambiano le chiavi attese e nessun'altra. **R1-R38 sui test** (`rosse09\rosse.mjs`: i sedici file del §5, a Roma, col reporter JSON di vitest): prima e dopo 558 su 558 verdi; **38 su 38** rosse.

- **R1** · `poolCount` senza `nextCountPool` → stampa `prenota` (8 percorsi, fra cui ada e teo); test: 4 (client-book: «un Booster appena comprato… 9», «extra del coach di 2 crediti… 10», «un Booster di una tipologia che il blocco dopo non ha», e quello che c'era, «con un extra PT: prenotabile coi due blocchi pagati dall'extra»).
- **R2** · il blocco dopo con tutti gli extra → `prenota` (lia); test: «un Booster che scade con il blocco 1 nel blocco dopo non conta: 8».
- **R3** · l'avviso col solo `blockAvail` → `avviso` (uge, ugo); test: i casi 1 e 2 del §5.4.
- **R4** · l'avviso con tutti gli extra → `avviso` (uga, ugi); test: 4 («conta un Booster che scade con il blocco…», «un extra che scade dentro il blocco ma non il giorno della sua fine…», il caso 3 del §5.4, «la Home di Giorgio › l'intestazione dei crediti e l'avviso»).
- **R5** · Sposta senza blocco sempre a 14 giorni → `sposta` (12 percorsi); test: 5 (quattro di `getMoveWindow` e il caso nuovo di `booking-rules.test.ts`).
- **R6** · l'extra liberato senza il controllo alla data della sessione → `sposta` (scadutoPrima); test: «nessun extra impegnato che valga alla data della sessione…».
- **R7** · il nuovo giorno solo dall'extra liberato → `sposta` (liberaELibero); test: «con un altro extra della tipologia con crediti liberi…».
- **R8** · si libera l'extra che scade per ultimo → `sposta` (ilPiuVicino); test: «si libera l'extra impegnato che scade per primo».
- **R9** · `isSellablePack` col solo `active` → `store`; test: 12 (il caso del §5.7 e undici di `client-store.test.ts`).
- **R10**, **R11**, **R12** · lo `00` tenuto; il cellulare senza `39`; il `+` toccato → `whatsapp` (i casi 1 e 7; 2 e 3; 9); test: il caso del §5.8, punto 1, una volta per ciascuna.
- **R13** · `inviteEmail` senza togliere gli spazi → `email` (i tre testi e l'invito); test: 4. **R14**, **R15**, **R16** · Profilo, dettaglio ed esito con `email?.trim()` → `email` (solo `profilo`, solo `dettaglio`, solo `esito`, 5 percorsi ciascuna); test: il caso del §5.8 punto 3, del §5.6 punto 2 e del §5.2 punto 6, uno per uno.
- **R17** · la regola di `bookingIdsAt` tolta → `lista` (lettaPrima); test: il caso 1 del §5.5. **R18** · `>=` al posto di `>` → `lista` (stessoIstante); test: il caso 2.
- **R19** · `subscriptionKeyMatches` sulla sola lunghezza → `push` (chiaveDiPrima); test: 3. **R20** · senza chiave dà `false` → `push` (senzaChiave, senzaOpzioni); test: 4 (il caso 2 del §5.1 e tre della 08 di `isPushEnabledFor`). **R21** · anche «Esci» libera → `push` (`uscite.1`); test: `("SIGNED_OUT", true)`. **R22** · libera a ogni evento non di ingresso → `push` (`uscite.2`, `.5`, `.6`); test: `TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY`. **R23** · la pubblica di prima rimessa a mano in `push.ts` → `push` (chiave.nuova, chiaveDiPrima); test: 4.
- **R24** · `SANS_HEADING` senza `font-sans` → `piccoli` (i titoli); test: quello di `client-type`. **R25** · il pannello con un altro id → `piccoli` (`tab.2`); test: «con idBase…».
- **R26** · Sposta senza la scadenza nel testo → `sposta` (tre testi); test: il caso nuovo di `booking-rules.test.ts`.
- **R27** · senza finestra «Nessun orario libero nei prossimi giorni…» → `piccoli` e `sposta`; test: il caso 1 del §5.6.
- **R28** · `subscribeToPush` riusa l'iscrizione che c'è → test: 2 («con la chiave di prima: la toglie…», «se il browser non dice la chiave…»); D2 col mutante `subscriptionKeyMatches( 0 · unsubscribe() 1 · …`.
- **R29** · la riga del vecchio endpoint resta → «con la chiave di prima: la toglie…». **R30** · `isPushEnabledFor` senza la chiave → «con un'iscrizione nata con la chiave di prima: no…». **R31** · lo scope senza il dettaglio → il test di `query-keys`; D9 col mutante `0 · 1`. **R32** · `idBase` ignorato → «con idBase…». **R33** · `focusIsLost` sempre vero → i due casi di `focus` col focus altrove. **R34** · senza `preventScroll` → i due casi di `focusIfLost`. **R35** · senza il ripiego sul contenitore → «un titolo che non prende il focus…». **R36** · senza la finestra dei dieci secondi → il primo caso del §5.1 punto 7. **R37** · `markLeaving` senza `try` → il secondo («… con lo storage negato nessuno dei due lancia»). **R38** · `<=` al posto di `===` → «un extra che scade dentro il blocco ma non il giorno della sua fine non conta».

**R39-R53 nel browser**, su `7a0443a` (`banco\rosse-browser09.mjs`, porta 5529: il mutante prima che parta Vite, poi la parte del giro che lo deve vedere, poi i file rimessi). **17 su 17** (R28 e R31 anche con la riga dei controlli). Il verde prima e dopo: il giro intero, 111 su 111 su `7a0443a`, e 132 su 132 su `7fe67ad`.

- **R39** · Sessioni senza `focusIfLost` dopo «Riprova» → B2 (Sessioni): «il focus sul primo titolo di ciò che arriva», visto `{"first":false,"body":true}`.
- **R40** · «Annulla sessione» `disabled` → B5: «occupato per tutta la richiesta, col focus sul pulsante», visto `[null,false,true]` (focus sul body); D7 col mutante `1 · 7`.
- **R41** · senza `flushSync` → B6: il campo prende il focus senza `aria-invalid` né l'errore collegato; D17 `0 · 1 · 1 · 1`.
- **R42** · senza la regione `role="alert"` → B6: Invio dal campo senza annuncio, e il secondo Invio senza nodo nuovo; D17 `1 · 0 · 1 · 1`.
- **R43** · `lang="en"` → B1: 0 su 8 (`"en"` su ogni pagina); D3 `0 · 1 · …`.
- **R44** · `max-[360px]:hidden` → B8: a 360 px un testo esce dalla pillola, la soglia non c'è; D5 `1 · 1 · 0`.
- **R45** · `min-w-24 flex-1` → B9: a 320 px «Elettrostimolazione» fuori dalla colonna; D6 `1 · 0`.
- **R46** · `typeColor` in «Cosa vuoi prenotare?» → B10: l'icona del Test funzionale non è il primario.
- **R47** · tolta la riga che libera il telefono → B16: a sessione scaduta l'iscrizione resta, a pagina aperta e all'apertura; D2 `0 · 0 · 1 · 1 · 0`.
- **R48** · senza la rilettura a `serviceWorker.ready` → B17 (0 su 1); D22 `0`.
- **R49** · Sposta senza gli extra → B18: i giorni fino al 12/10 con la frase dei 14 giorni, e senza credito la fila con gli orari al posto del paragrafo; D21 `… client-move-sheet legge gli extra 0 …`.
- **R50** · senza `leftOnPurposeRecently` → B16: con due schede «Esci» in una toglie l'iscrizione (`unsubscribe` nel log).
- **R51** · senza il `try`/`catch` → B6: dopo il rifiuto «Salva» resta spento e l'errore generico non c'è; D17 `1 · 1 · 0 · 0`.
- **R52** · senza `readMemory` → B23: la voce letta torna non letta; D23 `3 · 3`.
- **R53** · senza `markedInMemory` → B23: la card della Home torna e la voce del Profilo resta; D23 `2 · 4`.

**Le prove delle regole che valgono anche nel giro** (§8; `banco\rosse-regole-giro09.mjs`, coi mutanti del §7 così come sono): **7 su 7** rosse su `7fe67ad`, file rimessi (sha256 uguale), e dopo `git status` col solo questo file.

- **R10** → B13: con `0039 340 118 22 09` ogni WhatsApp è `https://wa.me/00393401182209` (Profilo, Home, Prenota, Booster).
- **R14** → B14: con `giulia b@email.it` la riga del Profilo c'è («… a giulia b@email.it e si aggiornano da sole…»).
- **R16** → B14: l'esito di Prenota finisce a «…; l'invito di Google Calendar arriva a giulia b@email.it.».
- **R24** → B11: i titoli in Sora («Prossima sessione», «I tuoi crediti», «Cosa vuoi prenotare?»…).
- **R31** → B15: il dettaglio resta all'orario di prima (`nuovo: false`), la campanella sale lo stesso.
- **R32** → B4: i tab senza `id` né `aria-controls`.
- **R28** (in più) → B16: accese le notifiche, l'iscrizione con la chiave di prima resta e la riga resta quella del vecchio endpoint.

### 8 · Il browser

La copia del banco: `C:\Users\wolfw\AppData\Local\Temp\claude\C--Coworks-NC-App-Development-repos-nc-calendar\9fc93e2a-5eab-4881-94de-55b665ae1def\scratchpad\banco` (i file di `app\banco-cli-2026-09-30\` uguali byte per byte, salvo `lib.mjs` = `lib-windows.mjs`, la `DIR` di `giro-prenota.mjs` e l'atteso della 04 nella cartella sopra). `giro09.mjs` l'ho scritto lì partendo da `giro08.mjs`, `fake08.mjs` e `seed08.mjs` (nessun `fake09`/`seed09`: le persone nuove e i guasti stanno nel giro). L'ora è quella del banco, lunedì 28/09/2026 alle 10:40, fuso di Roma.

**`giro09.mjs` sul commit finale (`7fe67ad`):** **`ESITO: 132 su 132`**, uscita 0, in 10 minuti e mezzo (su `7a0443a`, prima della parte B22, 111 su 111). Tutte le parti con 0 KO:

- B1 la lingua (sette pagine del cliente e una del coach); B2 le cinque card di «Riprova» (fallito: il focus sul titolo della card; riuscito: sul primo titolo di ciò che arriva; la guardia con la lettura lenta; nel dettaglio la card resta durante la rilettura); B3 «Orari non aggiornati»; B4 i tab di Sessioni; B5 gli otto pulsanti occupati (le richieste contate nel finto: una sola per pulsante); B6 il foglio della password (il rifiuto vero con `setItem` che lancia sulla chiave della sessione); B7 l'interruttore delle notifiche;
- B8 la pillola con Manrope vero; B9 «Elettrostimolazione» a 320, 360 e 390; B10 i colori; B11 i titoli; B12 i testi delle nove persone, le teste, «Annullamento non riuscito.», il toast della conferma; B13 WhatsApp coi tre telefoni; B14 l'invito con le due email; B15 il coach che sposta;
- B16 il telefono (la chiave di prima, la chiave di oggi, la sessione scaduta a pagina aperta e all'apertura, «Esci» dal Profilo e dall'header desktop, le due schede); B17 il Profilo al primo avvio; B18 i crediti degli ultimi giorni e Sposta con l'extra; B21 il bilancio; B22 il brief; B23 lo storage negato.

Gli screenshot: `banco\schermate-09\` (`b2-prenota.png`, `b2-sessioni.png`, `b2-profilo.png`, `b2-notifiche.png`, `b2-dettaglio.png`: le card dopo «Riprova» fallito; `b9-320.png`, `b9-360.png`, `b9-390.png`: la riga dei crediti con «Elettrostimolazione»; `b18-sposta-extra.png`: Sposta con l'extra che scade l'11/10).

- **B8** · la soglia: «WhatsApp» con l'icona e lo spazio **92,766 px** misurati con Manrope vero (12 GET verso `fonts.googleapis.com` e `fonts.gstatic.com`, nient'altro); messa **95 px** (`@max-[95px]:hidden`; Cowork l'aveva stimata 98). A 360, 368, 375 e 390 px nessun testo esce dalla sua pillola, e l'icona c'è solo dove la pillola è larga almeno 95.
- **B10** · i contrasti dell'icona sul suo riquadro (il 10% del colore sulla card, disegnati su un canvas): spostata 6,68; da confermare 4,48; valutazione 4,35; creata 6,68; crediti 4,62; BIA 4,17 (`rgb(2, 119, 189)`); annullata 5,45; crediti da usare 4,48; crediti in esaurimento 4,48. In «Cosa vuoi prenotare?» e nel riepilogo il Personal Training `#D50000`, il Test funzionale il primario.
- **B16** · in più della richiesta: all'apertura dell'app con la sessione già scaduta (rinnovo rifiutato con 400 `invalid_grant`) l'iscrizione si toglie e la pagina va all'accesso (`{"dopo":null,"log":["unsubscribe:https://push.esempio.test/abc"],"rinnovoRifiutato":true,"pagina":"/auth"}`).
- **B19** · da `LOVABLE_SANDBOX=1 bun run build` su `7fe67ad`, `node prova-sw-cli-08.mjs "…/dist/client" "…/dist" 5611`:
  ```
  {"rotto":false,"precache":["manifest.webmanifest"],"client":false,"navigationRoute":false,"networkFirst":false,"importScripts":"/push-sw.js","register":"ok","ready":"pronto","registrations":1,"state":"activating"}
  ESITO: come atteso
  ```
  con `--rotto`:
  ```
  {"rotto":true,"precache":["manifest.webmanifest"],"client":false,"navigationRoute":false,"networkFirst":false,"importScripts":"/push-sw.js","register":"ok","ready":"non pronto dopo 8 s","registrations":0,"state":"redundant"}
  ESITO: come atteso
  ```
  `dist/client/manifest.webmanifest` ha `"lang":"it"`. Poi, dalla radice del clone, `rm -rf dist .output` (prima elencati: solo le uscite delle due build, ignorate da `.gitignore`).
- **B20** · i giri di prima su `7fe67ad`, copiati da `app\` così come sono, uno dopo l'altro (`banco\b20.sh`, uscite in `banco\b20-<giro>.txt`):
  - `giro04.mjs` **103 su 104**: KO B11 «lettura in errore: la frase con «Riprova», mai «Sessione non trovata»» (`{"secs":60,"seen":[]}`): cerca «Impossibile caricare la sessione», che la 09 sostituisce con la card «La sessione non si è caricata» (§4.4, punto 2). Previsto da Cowork.
  - `giro-sessioni.mjs` **78 su 78**.
  - `giro-prenota.mjs` così com'è si ferma in B5 (uscita 1 in 55 s, dopo 21 OK): KO «Acquista un Booster» porta a /client/store?type=<Sessione PT> (il foglio dice «… Per altre sessioni scrivi al tuo coach.», senza il pulsante), poi `locator.click` va in timeout sul pulsante che non c'è. **È il cambio voluto del §4.2 punto 6**, non previsto da Cowork: i tre Booster di `seed-prenota.mjs` (righe 348-357) hanno solo `event_type_title`, `active` e `title`, e senza `currency`, `amount_cents` e `quantity` per `isSellablePack` non sono in vendita (la base leggeva i titoli di tutti i pacchetti attivi). Le altre parti, sempre coi file così come sono (`solo=` tutte salvo B5): **76 OK e 0 KO**. La controprova, con copie a parte (`seed-prenota-vendibili.mjs` coi tre Booster in euro, a 50 € e con quantità 1; `giro-prenota-vendibili.mjs` che la importa): B5 **6 OK su 6**, compreso «il link apre lo Store col type». In tutto, delle 82 prove della 08: 80 OK, 1 KO (voluto) e 1 non eseguita col file com'è («il link apre lo Store col type», che segue il pulsante).
  - `giro05-cowork.mjs` **149 su 152**, coi tre KO noti della 05 (decisione 14: `giorgio · crediti · righe`, `giorgio · crediti · fondo`, `nina · crediti · fondo`), gli stessi della 08.
  - `giro07.mjs` **138 su 147**: i nove KO «B1 inviti», uno per persona, dicono il testo nuovo del §4.6 punto 3 («Le sessioni fissate nell'app arrivano come invito di Google Calendar a … e si aggiornano da sole se vengono spostate o annullate.») al posto di «Ogni sessione arriva…». Previsto da Cowork.
  - `giro08.mjs` **79 su 79**.

  Nessuna copia di un giro di prima l'ho corretta. Le uscite di Vite e i 500 nei log (`B11-errore`, `B13-blocchi`…) sono i guasti voluti dei giri.
- **B21** · nel giro finale zero richieste esterne bloccate (i font di B8 contati a parte: 12 GET, nient'altro), zero funzioni server eseguite dal server di sviluppo, zero errori di pagina, nessun avviso di React sulle chiavi doppie.

**B22 · il brief voce per voce** (`passes/09-verifica-finale.md` e la «Seconda verifica» del prototipo). Le misure a 390 px, sulle viste di Giulia (dal giro finale):

| vista a 390 px | titoli delle card | pulsanti (altezza) | raggi | testo minimo | tocco sotto 44 px |
|---|---|---|---|---|---|
| Home | 17/700 | 44, 48, 52 | card 24 | 12 px | nessuno |
| Prenota | 17/700 | nessuno prima della scelta | opzioni 18, orari 14 | 12 px | nessuno |
| Prenota, orario scelto | 17/700 | 52 | opzioni 18, orari 14 | 12 px | nessuno |
| Riepilogo di Prenota | 17/700 | 44, 52 | opzioni 18, orari 14 | 14 px | nessuno |
| Dettaglio | — (il titolo è in Sora) | 44, 48, 52 | card 24 | 12 px | «Apri in Mappe» 94,2 × 20 |
| Sposta | — | 44, 48, 52 | card 24, orari 14 | 12 px | lo stesso link, nella pagina sotto il foglio |
| Sposta, orario scelto | — | 44, 48, 52 | card 24, orari 14 | 12 px | come sopra |
| Profilo | — (etichette di sezione 14/700) | 44, 52 | card 24 | 12 px | nessuno |
| Foglio «Cambia password» | — | 44, 52 | card 24, campi 14 | 13 px | nessuno |

I principali attivi `rgb(0, 86, 133)` dove ce n'è uno (Home, Prenota con l'orario scelto, il riepilogo, il dettaglio, Sposta con l'orario scelto, il foglio); spenti `rgb(225, 226, 231)` «Invia valutazione» (Home, senza stelle) e «Scegli un nuovo orario» (Sposta, senza orario). Nessuna emoji. Le prove di B22: 21 (19 nella parte B22 e 2 nel giro delle nove persone di B12), tutte OK.

*I controlli del brief*

- **Testi (T1, T4, V6):** B12 (le nove persone, sei pagine ciascuna: nessuna parola tolta), D13 `0 · 0 · 3`; i piani con la sola iniziale maiuscola: B22 V6 (nelle stesse pagine compaiono «Abbonamento mensile» e «Percorso fisso», mai con la maiuscola); i toast annullabili con «Ripristina»: B22 flussi 1 e 2, `giro04` («il toast «Spostata a … Il tuo coach riceve un avviso.» con «Ripristina»», «il toast di successo con «Ripristina»»).
- **Misure (V3, V4, V5, T2):** le misure qui sopra. Il tocco minimo di 44 px manca a due collegamenti di testo, come nel prototipo: «Apri in Mappe» nel dettaglio (94,2 × 20) e «Scrivi a Nicolò» nella riga sotto le 24 ore della Home (87 × 17 px): fra i trovati (§10, punto 11).
- **Colori (V7, V8, T3):** i pulsanti principali attivi sono `rgb(0, 86, 133)` = `#005685` in tutte le viste (quelli spenti sono grigi per disegno: «Invia valutazione» senza stelle, «Scegli un nuovo orario» senza orario); «Si prenota con Nicolò» `rgb(65, 71, 79)`, come le righe prenotabili (B22 V8); «Crediti esauriti» in warning-ink: `giro-prenota` (««Crediti esauriti» in warning-ink»); gli esadecimali scritti a mano: D14 `0 · 1`; nessuna emoji nelle nove viste misurate (B22).
- **Numeri (H1, V9, V13):** Home, Prenota e riepilogo del Booster dicono lo stesso numero: B18 («9 disponibili» in Home e Prenota, «… del blocco 2: ne resteranno 8.» come lo Store dopo il pagamento) e la stampa (`prenota`); il Profilo cliente del coach: lo stesso `getBlockCredits` per il blocco (`client-credits.ts:228-232`), i test `client-credits.test.ts` («una definizione sola del disponibile») e `credits.test.ts`, ma nessun giro del cliente apre il profilo del coach: **lacuna** del banco, va alla lettura di Cowork (§10, punto 12). La presenza: `clientAttendance` (Sessioni e Profilo, `client.settings.tsx:186`) è `getAttendance` sulle righe senza `deleted_at` (`client-sessions.ts:351-358`), la stessa del coach (`client-list.ts:273`, `client-profile-mobile.tsx:806`): `attendance.test.ts`, `giro-sessioni` («Presenza 80%» · «4 sessioni svolte · 1 assenza»). «Perse» in legenda solo quando ci sono: `giro05-cowork` («crediti · legenda «Perse»»).
- **Regola (O1, B2):** una regola sola per Prenota e Sposta (`booking-rules.ts`, `getCreditWindows`, `getMoveWindow`): `booking-rules.test.ts` (le frasi a-k e i testi di Sposta), `giro-prenota` («15 giorni, scelto il 29/09», «Mancano meno di 24 ore…»), `giro04` (Sposta), B18 (Sposta con l'extra); la card della Disponibilità del coach «24 ore» e «14 giorni in anticipo»: `booking-rules.test.ts:33-44`. Il server che rifiuta fuori finestra (O1, B2) non si prova dal banco: è del server, dal giro del 02/10 (§4.10, punto 4).
- **Conferma (O3):** entro 48 ore la sessione risulta confermata: `giro-prenota` («poi confirm_booking_attendance (entro 48 ore), e la sessione risulta confermata»); inserita dal coach, «Da confermare» a 48 ore: `giro04` («chip «Da confermare»») e i test di `client-session-status`; il badge su Sessioni: B22 (a 390 la voce «Sessioni, 1 da confermare» col «1»; a 1280 l'header ha le cinque schede senza badge, come lo descrive `passes/01-shell.md:27`); la voce nelle notifiche: `giro08` B3 («il promemoria letto, le altre no»); il coach che vede la spunta nel calendario: §10, punto 12.

*La seconda verifica del prototipo*

- **V1** · B22 V1 (Marta, sotto le 24 ore: «Dettagli», la riga «Mancano meno di 24 ore: non si può più spostare. Scrivi a Nicolò», nessun «Sposta», un solo pieno, «Conferma presenza»), `giro05-cowork` («prossima»).
- **V2** · `giro05-cowork` («crediti · avviso»), `client-home.test.ts` (`creditsWarningParts`), la stampa (`avviso`).
- **V3** · B22 (i titoli delle card 17/700 in Home e Prenota) e B11 (Manrope e spaziatura normale su ogni titolo che non è in Sora).
- **V4** · B22 (pulsanti a 52, 48 e 44 px, nessun'altra altezza).
- **V5** · B22 (card 24, opzioni 18, orari e campi 14).
- **V6** · B22 V6 (nelle pagine delle nove persone).
- **V7** · B22 (i principali attivi `#005685` in ogni vista).
- **V8** · B22 V8 («Si prenota con Nicolò» neutro).
- **V9** · `giro05-cowork` («crediti · legenda «Perse»», «crediti · righe» con «Non ancora usati»), `client-home.test.ts`.
- **V10** · B22 V10 («Ciao Massimiliana»: una riga a 320 e a 390, con l'ellissi a 320, e la campanella dentro lo schermo; l'ellissi è quella di `passes/01-shell.md:35` e `05-home.md:25`).
- **V11** · B22 V11 (Marta, il dettaglio sotto le 24 ore: un solo pieno, «Conferma presenza» 52 px `#005685` col testo bianco; «Scrivi a Nicolò su WhatsApp» 48 px, fondo bianco e testo `#003e62`).
- **V12** · il cambio di persona c'è solo nel prototipo: in app ognuno vede sé stesso. Quello che si vede: B22 V12 (nessun «undefined», «NaN» o «[object Object]» nelle pagine delle nove persone) e il flusso 5 (Elena: niente «Acquista»).
- **V13** · `giro-sessioni` (Giulia: «Presenza 80%» e «4 sessioni svolte · 1 assenza», la sessione di Google fuori da tutti e due), `attendance.test.ts`.
- **V14** · B22 (le cinque schede, «Booster» compreso, nella barra a 390 e nell'header a 1280).
- **V15** · B22 flusso 1 (in Prenota l'orario preso dai «Consigliati») e V15 (in Sposta «Consigliati» è il primo gruppo).

*I sette flussi*

1. **Giulia** · B22 flusso 1: Home → Prenota → il primo orario dei consigliati → riepilogo → «Prenotata» → «Vedi la sessione» (il dettaglio della sessione nuova) → Sposta → «Ripristina»; nel finto una scrittura su `bookings` e due `reschedule_booking`.
2. **Marta** · B22 flusso 2: «Conferma presenza» dalla Home (una `confirm_booking_attendance`), «Dettagli», «Annulla comunque», «Annullata tardi», «Ripristina» (una `cancel_booking` e una `restore_booking`); il toast della conferma dice «Nicolò vede la conferma nel suo calendario.» (B12). Il coach che vede la conferma: §10, punto 12.
3. **Il coach sposta** · B15: col dettaglio aperto il finto sposta la sessione e manda la riga `booking.moved_by_coach` col realtime: il dettaglio mostra il nuovo orario senza ricaricare, la campanella una non letta in più, aperta la notifica quella è letta e le altre no. La riga che arriva dal database vero: §10, punto 12.
4. **Booster e Stripe** · **lacuna** nel banco: Stripe in modalità test vuole il backend vero (§10, punto 12). Nel banco: B18 (dopo il pagamento Home, Prenota e il riepilogo dicono lo stesso numero) e `giro-prenota` («Acquista un Booster» porta allo Store con la tipologia).
5. **Elena** · B22 flusso 5: il Booster senza «Acquista», in Home «Per altri crediti scrivi a Nicolò».
6. **Davide** · B22 flusso 6: in Home e in Prenota «Il tuo percorso è concluso» col WhatsApp del coach e nessun collegamento al Booster nel contenuto; `giro-prenota` («Davide: «Il tuo percorso è concluso» senza pulsanti»).
7. **La valutazione** · B22 flusso 7: cinque stelle e la nota «Ottima sessione, grazie» su una sessione svolta, e la riga di `session_feedback` le ha; `giro04` («un upsert con la nota, «La tua valutazione», «Valutata 4 su 5»…»). Il coach che vede voto e nota: §10, punto 12.

*Le regressioni*

- **Lato coach invariato** salvo i punti del README: D1 (`fuori dall'elenco: 0`; del coach cambiano solo `whatsappUrl`, `focus-client-panel.tsx` e i commenti del §4.7 e del §4.8), la suite intera verde (1412), B1 sulla pagina del coach (`lang="it"`).
- **Desktop con le cinque schede nell'header:** B22 (a 1280: Home, Prenota, Sessioni, Booster, Profilo), `giro-sessioni` («1280 … schede nell'header»).
- **Link delle push e URL di ritorno di Stripe:** il collegamento di una notifica apre il suo dettaglio (`giro08` B2 e B3); la push vera col suo link e il ritorno da Stripe: **lacuna** nel banco, §10, punto 12.
- **Nessun errore in console; build, typecheck, lint e test puliti:** B21 e i cancelli (§10, punto 5).

### 9 · Non fatto

- B3, B7, B12, B20, B21 e B22 non hanno una prova rossa loro (§8); B19 ha la sua (`--rotto`).
- `cancelQueries` prima di `setQueryData` (§4.3, punto 3) dal banco non si prova in modo stabile: resta D19 (`1 · 3 · 0`).
- Dal banco non si fanno: Stripe in modalità test (flusso 4 e l'URL di ritorno), il coach che vede spunta, voto e nota sul suo lato vero, la push sul telefono e la riga che arriva dal database vero, il profilo cliente del coach coi numeri della stessa persona, il server che rifiuta prenotazioni e spostamenti fuori finestra: §10, punto 12.
- Le prove con le librerie del 25/09 non servono: `bun install` è riuscito.

### 10 · Divergenze

- **Il registro** ha risposto `307` e `307` (non `200`): la procedura del 27/09, come prevede il §2; il lock è tornato identico.
- **La soglia della pillola** è 95 px, non i 98 stimati: è la misura (§8, B8), arrotondata come chiede il prompt.
- **I titoli in Sora per una classe dimenticata** erano 17, non 21 (D4 ne conta 21 perché 4 avevano già le classi scritte a mano).
- **Il focus dopo «Riprova» delle Notifiche** è nel commit del passo 4, non del 3 (`focusIfLost` nasce al passo 4).
- **Un commit in più, `7fe67ad`, solo commenti**, fuori dal piano: i commenti che la 09 stessa aveva reso falsi (§1, passo 8). Il commento di `coachCard` (`src/lib/client-settings.ts:96-98`) non è più il testo del ramo simulato: «almeno sei cifre nel telefono» diventa «almeno sei cifre nel numero, tolto lo 00 davanti», perché `whatsappUrl("0012345")` è `null` (lo `00` si toglie e restano cinque cifre). Il commento di `LEAVING_WINDOW_MS` (`src/lib/push.ts:194-199`) dice anche il caso della scheda ferma in background.
- **Nessun nome, firma o testo del §4 cambiato:** la stampa dà l'atteso byte per byte nei tre fusi.

### 11 · Trovati e non toccati

1. **Una scheda ferma in background libera il telefono dopo un «Esci» chiesto** (`src/lib/push.ts:194-200`, `src/lib/auth.tsx:49-56` e `:101-109`). auth-js 2.105.4 manda `SIGNED_OUT` alle altre schede dopo `/logout`, e una scheda congelata (Chrome su Android, la PWA con una scheda di Chrome aperta) lo riceve quando torna, anche minuti dopo: oltre i 10 secondi di `LEAVING_WINDOW_MS` lo prende per un'uscita non chiesta e toglie l'iscrizione, anche dopo «Esci e collega Google». La regola è quella del §4.1 punto 5; non provato su un telefono.
2. **«Conferma presenza» del dettaglio sposta il focus anche a chi è andato altrove** (`src/components/client-booking-detail-view.tsx:155-159`; lo stesso schema, già prima della 09, in `src/components/client-home-next.tsx:105-114`): ora che il pulsante è occupato e tiene il focus, chi durante la richiesta va su un'altra voce se lo vede portare sul titolo alla risposta. B5 vuole l'esito di oggi; `focusIfLost` lo eviterebbe.
3. **Le lette in memoria con due schede** (`src/hooks/use-client-shell.ts:134-164`): se in una scheda lo storage si riempie (copia in memoria) e poi si libera, le voci che un'altra scheda segna nello storage non si vedono qui, e la prima scrittura riuscita di questa scheda le sovrascrive con la sua copia. È la regola del §4.3 punto 2; caso raro.
4. **Il pannello dei tab di Sessioni ha `tabIndex={-1}`** (`src/routes/client.sessions.tsx:274`), come chiede il §4.4 punto 2 per il contenitore: le linee guida WAI-ARIA vogliono `0` quando il pannello non ha niente di focalizzabile (la card «Nessuna sessione passata»), perché col Tab ci si arrivi.
5. **Due collegamenti di testo sotto i 44 px di tocco**, com'è nel prototipo: «Apri in Mappe» nel dettaglio (`src/components/client-booking-detail-view.tsx:251-258`, 94,2 × 20 px) e «Scrivi a Nicolò» nella riga sotto le 24 ore della Home (`src/components/client-home-next.tsx:229-236`, 87 × 17 px).
6. **I Booster dei semi di `giro-prenota`** (`app\banco-cli-2026-09-30\seed-prenota.mjs:348-357`) non hanno `currency`, `amount_cents` e `quantity`: dopo la 09 per l'app non sono in vendita, e `giro-prenota.mjs` si ferma in B5 (§10, punto 8, B20). Coi tre campi aggiunti B5 passa (`banco\seed-prenota-vendibili.mjs`). È un file di Cowork: non l'ho toccato.

### 12 · Resta a Nicolò, in quest'ordine

1. Il merge della PR in `main`, dopo la verifica di Cowork.
2. Nel pannello di Lovable Cloud, i tre segreti dal file `C:\Coworks\NC App Development\backup\chiavi-push-nc-calendar.bak.txt`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`. Per ognuno si incolla il valore che sta dopo il segno `=`, non il nome, al posto di quello che c'è (o come segreto nuovo, se manca).
3. Il Publish.
4. Nella chat di Lovable, la richiesta di rifare il deploy delle funzioni `send-push` e `booking-notifications` (leggono le chiavi all'avvio).
5. Cowork rilegge la produzione in sola lettura (anche il profilo cliente del coach coi numeri della stessa persona, e il coach che vede spunta, voto e nota).
6. **La prova sul telefono:** il Profilo dice «Disattivate…» (l'iscrizione di oggi ha la chiave di prima); si riaccendono, «Attive…»; una prenotazione; la conferma arriva e il tocco apre l'app; nei log di `send-push` nessun 403. Fino a lì nessuna notifica arriva sul telefono, come oggi. Poi, quando serve, Stripe in modalità test (il flusso 4 e l'URL di ritorno).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
