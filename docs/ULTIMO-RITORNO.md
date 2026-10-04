**Dove ho girato (ultimo ritorno · lato cliente · passata 08 · le Notifiche, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0. Nessuna installazione, nel repo né fuori.

> **In breve.** La 08 è fatta sul PC, sul ramo `redesign/cliente-08-notifiche` nato da `5440168`.
> - **Il telefono può ricevere le notifiche.** Il service worker si registra in produzione (`isLovablePreviewHost`). Nella build di Lovable ha in precache il solo manifest, senza pagine in cache, e si installa (B13). Le pagine collegano il manifest. Il tocco su una notifica porta alla sua pagina anche con l'app aperta, l'iscrizione aspetta il service worker attivo, e un service worker nuovo non ricarica le pagine.
> - **La pagina Notifiche** mette insieme i sette promemoria e le quattro azioni del coach (`describeClientNotification`), dalla più recente. Segna letta una voce alla volta, ha lo scheletro e «Riprova», e il badge conta le due fonti.
> - **«Attive»** guarda la riga di chi è entrato, e i due «Esci» la tolgono.
>
> **La stampa di Cowork sul ramo dà esattamente `app/atteso-cli-08-2026-10-04.json`** a Roma, in UTC e a Los Angeles. I cancelli:
> - typecheck 0;
> - lint 0 errori e 14 avvisi, gli stessi della base;
> - **1357 test in 65 file** (erano 1276 in 62);
> - build riuscita, anche con `LOVABLE_SANDBOX=1` su Windows;
> - i sette file del §5 verdi nei tre fusi, con le sonde a 0, 420 e −120.
>
> Lo script dei controlli dà ogni riga all'atteso del §6. **R1-R31 tutte rosse** sui casi previsti e poi verdi. Nel browser: `giro08.mjs` **79 su 79**; i giri di prima uguali alla base (giro04 104 su 104, giro-sessioni 78 su 78, giro-prenota 82 OK e 0 KO, giro05-cowork 149 su 152 coi soli tre KO noti, giro07 147 su 147); B13 «come atteso» nei due versi.
>
> Un revisore in sola lettura ha dato cinque rilievi, tutti veri e corretti in un commit in più (`1bffaa2`). Il più serio: una «Nuova sessione in agenda» arrivata dal realtime portava alla Home invece che al dettaglio, perché le sessioni del cliente non hanno un canale realtime (§1, passo 9; §10, punto 3).
>
> Workflow: 0. Agenti: 1 (il revisore).

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base e il ramo** (§2). `73621be`, il commit del piano (ammesso dal §2).
   - Ambiente: la riga in testa (PC).
   - ⚠️ All'avvio il clone era su `main` @ `3d29634` (`behind 173`), pulito, e non su `redesign/cliente-07-profilo` @ `0ef18e5` come l'aveva misurato Cowork alle 15:24. Non cambia niente: il ramo nasce da `origin/redesign/cliente-mobile`.
   - `git fetch origin` → `ec64733..5440168  redesign/cliente-mobile -> origin/redesign/cliente-mobile`; `git rev-parse --short origin/redesign/cliente-mobile` → **`5440168`** (non più avanti), albero `66700ca`. `origin/main` è su `ac36dec` (il rilascio della 07): non toccato.
   - `git switch --no-track -c redesign/cliente-08-notifiche origin/redesign/cliente-mobile` → `5440168`, nessun upstream.
   - Le sonde del fuso, da PowerShell: `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `5440168`, senza toccare niente: typecheck 0; lint 0 errori e **14** avvisi; **1276 test in 62 file**; build riuscita; `LOVABLE_SANDBOX=1` riuscita anche su Windows, con 88 voci in precache di cui 86 `client/`, la NavigationRoute e la NetworkFirst (§4).
   - Lo script dei controlli su `5440168` dà la colonna «oggi» del §6 riga per riga (§6).
   - Il banco copiato nello scratchpad (`lib-windows.mjs` → `lib.mjs`, l'atteso della 04 accanto, la `DIR` di `giro-prenota.mjs` lì); Playwright e Chromium della cache ci sono.
1. ☑ **Il telefono** (§4.1). `c79fc41`. I tre file di test verdi (19 test al passo 1); D2 tutto all'atteso; `LOVABLE_SANDBOX=1 bun run build` riuscita e B13 «come atteso» nei due versi già qui (`sw.js` con la sola voce `manifest.webmanifest`, «pronto», 1 registrazione; con `--rotto` «non pronto dopo 8 s», 0).
2. ☑ **Le azioni del coach e le parti dell'avviso** (§4.2). `ab28e2c`. `notifications.test.ts` e `client-home.test.ts` verdi (145); D7 `1`; a commit fatto D4 `notifications.ts, righe tolte o cambiate 0`.
3. ☑ **I promemoria, la lista, la cornice, la pagina, la campanella** (§4.3, §4.4). `307521c`. D0 all'atteso salvo `isPushEnabledFor 0 · forgetPushForUser 0`; D3, D5, D11 `avvisi: 0`, D13 `1`; typecheck 0; lint 0 e 14; suite intera verde (1348 in 65 a quel punto). Prima del commit la stampa di Cowork sul ramo: **uguale all'atteso nei tre fusi** (§8), e una prova di fumo nel browser (`giro08 solo=B1` su tre persone, 20 su 20).
   - ⚠️ Lo scheletro aspetta anche il profilo della cornice (`src/hooks/use-client-shell.ts`, `notificationsLoading`): §10, punto 2.
4. ☑ **Il telefono per persona** (§4.5, §4.7). `cb931ac`. D0 tutto all'atteso; D6 `1 · 1 · 2 · 0 · 1 · 1` e, a commit fatto, `righe di codice cambiate 0`; `push.test.ts` verde (11). Prova di fumo `giro08 solo=B10`: 9 su 9.
   - ⚠️ L'interruttore spento, se la riga non si toglie, resta acceso col toast d'errore (`src/routes/client.settings.tsx`, `togglePush`): §10, punto 7.
5. ☑ **`PIANO.md`** (§4.8). `057de9f`: la riga 08 a `[x]` con `sed` (l'hook Prettier riformatterebbe tutto il file), `git diff --numstat` `1 1`, blob `0d1e93a` (lo stesso del ramo simulato di Cowork); D9 le due righe attese.
6. ☑ **I cancelli e le prove rosse** (§2, §7). Nessun commit. I cancelli (§4), i sette file nei tre fusi (§4), R1-R24 tutte rosse sui casi previsti e poi verdi (§7).
7. ☑ **Il browser** (§8). Nessun commit: i file di prova stanno nello scratchpad. `giro08.mjs` **79 su 79**; R25-R31 tutte rosse (7 su 7), su 057de9f e su 1bffaa2; B12 uguali alla base (giro04 104 su 104, giro-sessioni 78 su 78, giro-prenota 82 OK e 0 KO, giro05-cowork 149 su 152 coi soli tre KO noti, giro07 147 su 147); B13 «come atteso» nei due versi; la sonda della revisione 7 su 7.
8. ☑ **Chiusura** (§10). Lo script dei controlli a lavoro committato (§6), questo file (il commit di questo file), `git push -u origin redesign/cliente-08-notifiche`, la PR.
9. ☑ **Passo aggiunto: la revisione.** `1bffaa2`. Un revisore in sola lettura (un agente, circa 24 minuti) ha letto una fotografia del ramo a `057de9f` (`git archive` nello scratchpad) col diff, il prompt e lo SQL di Cowork. Niente di grave e cinque rilievi, tutti veri, tutti corretti:
   - **una «Nuova sessione in agenda» arrivata dal realtime portava alla Home** (media): le sessioni del cliente non hanno un canale realtime, quindi la sessione appena inserita non era fra `bookingIds`. Ora una riga nuova fa rileggere sessioni e crediti (`invalidateBookingScope`), e mentre le sessioni si rileggono la riga tiene il dettaglio. Si aggiornano così anche la conferma di una sessione appena spostata e il badge di Sessioni. Il dettaglio invece funzionava già, perché legge la sessione per id;
   - **il focus dopo «Riprova»** andava sul `body` (riuscito) o restava muto sul pulsante (fallito);
   - **il profilo** stava nello scheletro ma non in «Riprova», e i commenti dicevano il contrario;
   - **i crediti quasi finiti** scendevano sotto una riga più nuova dell'ora della cornice (§10, punto 4);
   - **l'import di `virtual:pwa-register` fallito** taceva.
   - La sonda nel browser (`sonda-revisione08.mjs`, tre casi) dà **3 su 7** sul codice di `057de9f` (con le correzioni messe da parte con `git stash`): la riga porta a `/client`, le sessioni non si rileggono, il focus resta sul pulsante o va sul `body`. Sul codice di `1bffaa2` dà **7 su 7**.
   - Dopo la correzione, rifatto tutto sul commit finale: cancelli, i sette file nei tre fusi, stampa, controlli, R1-R31, `giro08`, B12, B13.

## 2 · RAMO E COMMIT

- Ramo: `redesign/cliente-08-notifiche`, da `origin/redesign/cliente-mobile` @ `5440168` (albero `66700ca`), senza upstream (`--no-track`). L'ultimo commit di codice è `1bffaa2` (la revisione); dopo c'è solo il commit di questo file.
- I commit del ramo, dal primo:
  - `73621be` Il piano della passata 08 in testa a docs/ULTIMO-RITORNO.md (il piano del passo 0)
  - `c79fc41` Notifiche sul telefono: il service worker si registra in produzione, le pagine collegano il manifest, il tocco apre la pagina, l'iscrizione aspetta il service worker attivo
  - `ab28e2c` Notifiche del cliente: le azioni del coach lette da describeClientNotification, le parti dell'avviso dei crediti, la creazione delle sessioni
  - `307521c` Notifiche del cliente: i promemoria nuovi, la lista con le azioni del coach, una letta alla volta, il badge
  - `cb931ac` Notifiche sul telefono: «Attive» guarda la riga di chi è entrato, e all'uscita il telefono smette di riceverle
  - `057de9f` PIANO.md: la passata 08 è fatta
  - `1bffaa2` Revisione: una riga nuova fa rileggere sessioni e crediti, il focus dopo «Riprova», il profilo nel cancello, i crediti quasi finiti in cima
  - il commit di questo file («Riscrive docs/ULTIMO-RITORNO.md per la passata 08»)
- PR: aperta con questo file come descrizione, verso `redesign/cliente-mobile`, **non** unita. Il numero è nella risposta in chat, perché nasce dopo questo file.

## 3 · MANIFESTO

- **NUOVI (4):** `src/lib/pwa-host.ts`, `src/lib/pwa-host.test.ts`, `src/lib/push-sw.test.ts`, `src/lib/push.test.ts`.
- **MODIFICATI (21):**
  - il telefono: `public/push-sw.js`, `src/components/pwa-register.tsx`, `vite.config.ts`, `src/routes/__root.tsx`, `src/lib/push.ts`;
  - le regole: `src/lib/client-notifications.ts` e il suo test (riscritti), `src/lib/notifications.ts` (solo aggiunte) e il suo test, `src/lib/client-home.ts` e il suo test, `src/lib/queries.ts`, `src/lib/contrast.test.ts`;
  - la cornice e le pagine: `src/hooks/use-client-shell.ts`, `src/routes/client.notifications.tsx`, `src/components/client-notifications-bell.tsx`, `src/routes/client.settings.tsx`, `src/routes/client.tsx`;
  - solo un commento: `src/lib/client-settings.ts`;
  - `design_handoff_cliente_mobile/PIANO.md` (la riga 08), `docs/ULTIMO-RITORNO.md`.
- **TOLTI:** nessun file. Spariscono `clientReminderItems`, `ClientReminderItem`, `ReminderBlock` e il tipo `ClientReminderTarget` (sostituito da `ClientNotificationTarget`), `reminders` e `readIds` della cornice.
- **NEL PERIMETRO MA NON TOCCATI:** `src/hooks/use-notifications.ts`, `describeNotification`, `formatAgo`, la campanella e l'header del coach (D4); `src/hooks/use-client-book-state.ts`, `src/hooks/use-my-coach.ts`, `src/lib/query-state.ts`, `src/components/book-blocked-card.tsx`, `src/lib/client-session-status.ts`, `src/lib/session-time.ts`, `src/lib/client-book.ts` (usati così come sono); `src/lib/auth.tsx`, `src/routes/auth.tsx`, `src/integrations/` (§9); `supabase/` (nessuna migrazione: D9); `package.json` e `bun.lock` (D10).

## 4 · I CANCELLI

| | su `5440168` (passo 0) | alla fine, su `1bffaa2` |
|---|---|---|
| typecheck | 0 errori (25 s) | 0 errori (26 s) |
| lint | 0 errori, **14** avvisi | 0 errori, **14** avvisi: gli stessi file e le stesse regole della base (confrontati), nessun `react-hooks/exhaustive-deps` (D11 `avvisi: 0`) |
| test | **1276 in 62 file**, verdi (14 s) | **1357 in 65 file**, verdi (32 s) |
| build | riuscita (57 s) | riuscita (70 s) |
| build `LOVABLE_SANDBOX=1` | riuscita su Windows (25 s): `precache 88 entries`, 86 voci `client/`, NavigationRoute, NetworkFirst | riuscita (70 s): `precache 1 entries`, solo `manifest.webmanifest`, e B13 «come atteso» nei due versi (§8) |

- I tre file nuovi sono `src/lib/pwa-host.test.ts`, `src/lib/push-sw.test.ts`, `src/lib/push.test.ts`; i test in più rispetto al ramo simulato di Cowork (1327) sono casi miei nei file del §5 (per esempio gli orari di jsonb con l'offset e i microsecondi, la seconda finestra che si sposta quando la prima non si può, il pareggio dei momenti).
- Nessun file caduto al caricamento, nessun `heap out of memory`: non è servito `--no-file-parallelism`.
- **I sette file del §5 nei tre fusi, da PowerShell** (una riga per fuso, la sonda prima dei test):
  - `UTC`: sonda `0` · 7 file, **218 test**, verdi;
  - `America/Los_Angeles`: sonda `420` · 7 file, 218 test, verdi;
  - senza `TZ` (Roma): sonda `-120` · 7 file, 218 test, verdi.
  - In più una sonda **dentro i worker di vitest** (un test temporaneo che scriveva `process.env.TZ` e l'offset in un file dello scratchpad, poi tolto; l'albero è rimasto pulito): `UTC 0`, `America/Los_Angeles 420`, `undefined -120`.

## 5 · I PEZZI PER LE PASSATE DOPO

- `isLovablePreviewHost(hostname)` (`src/lib/pwa-host.ts`): vero solo sulle anteprime di Lovable (zone di sviluppo; su `lovable.app` un primo nome con `--` o con l'id del progetto in testa). La produzione e le app dei workspace no.
- `describeClientNotification(n, coachFirst)` (`src/lib/notifications.ts`), coi tipi `ClientCoachNotificationKind` e `ClientNotificationView` (`kind`, `title`, `body`, `target`): le quattro righe dei trigger della 08; ogni altra riga `null`, cioè non si mostra e non si conta. Il nome è la prima parola di `coach_name`, poi `coachFirst`, poi «il tuo coach».
- `clientReminders(input, now)` (`src/lib/client-notifications.ts`), con `ClientReminderInput`, `ClientReminder`, `ReminderBooking`, `ClientReminderKind`, `ClientNotificationKind`, `ClientNotificationTarget`: i sette promemoria. `feedback: null` vuol dire «valutazioni non ancora arrivate», `book: null` «stato dei crediti non ancora arrivato».
- `clientNotificationList(input, now)` e `ClientNotificationItem` (`id`, `rowId`, `kind`, `title`, `body`, `ago`, `unread`, `target`, `aria`): la lista dalla più recente, con le righe di sessioni che non sono più del cliente verso la Home.
- `nextReadIds(readIds, reminders, mark)` e `READ_IDS_CAP = 200`: lo stato «letta» dei promemoria si aggiunge e basta; più `parseReadIds`, `clientNotificationsReadKey`, `unreadCount`, `notificationsSummary`, `emptyNotificationsText`.
- `creditsWarningParts(client, state, now)` e `creditsWarningText(parts)` (`src/lib/client-home.ts`): le parti dell'avviso della Home (`blockId`, `left`, `end`, `from` a mezzanotte locale 7 giorni di calendario prima della fine) e la frase senza punto; `creditsWarning` è la frase col punto.
- `isPushEnabledFor(profileId)` e `forgetPushForUser(profileId)` (`src/lib/push.ts`): «Attive» per persona, e la riga del telefono tolta all'uscita (al più 3 s, mai bloccante).
- `ClientShellState` (`src/hooks/use-client-shell.ts`): `notifications`, `notificationsLoading`, `notificationsLost`, `retryNotifications`, `notificationsRetrying`, `unread` (le due fonti), `markRead(item)`, `markAllRead()`; `reminders` e `readIds` non ci sono più.
- `BookingRow.created_at?` (`src/lib/queries.ts`), nella sola lettura più larga della scala.

## 6 · ACCEPTANCE

`bash "C:/Coworks/NC App Development/app/controlli-cli-08-2026-10-04.sh"` dalla radice del clone: a sinistra la colonna «oggi», misurata al passo 0 su `5440168`, a destra l'uscita a lavoro committato, su `1bffaa2`. Ogni riga di destra è quella attesa dal §6. D1, D8, D9 (salvo le due righe di `PIANO.md`) e D10 non hanno righe. D12 ha in più il commit della revisione (§10, punto 17).

| controllo | oggi, su `5440168` | alla fine, su `1bffaa2` |
|---|---|---|
| **D0** | client-notifications: 3 su 9 · clientReminderItems 1 · describeClientNotification 0 · creditsWarningParts 0 · creditsWarningText 0 · isPushEnabledFor 0 · forgetPushForUser 0 · isLovablePreviewHost 0 | client-notifications: 9 su 9 · clientReminderItems 0 · describeClientNotification 1 · creditsWarningParts 1 · creditsWarningText 1 · isPushEnabledFor 1 · forgetPushForUser 1 · isLovablePreviewHost 1 |
| **D1** | (fine D1) | (fine D1) |
| **D2** | vite.config.ts: globPatterns: [] 0 · navigateFallback: null 0 · navigateFallbackDenylist 1 · importScripts push-sw 1 · runtimeCaching 1 · includeManifestIcons: false 0 | vite.config.ts: globPatterns: [] 1 · navigateFallback: null 1 · navigateFallbackDenylist 0 · importScripts push-sw 1 · runtimeCaching 0 · includeManifestIcons: false 1 |
|  | __root.tsx: rel manifest 0 · pwa-register.tsx: «lovable.app» nel codice 1 · isLovablePreviewHost( 0 · onRegisterError 0 · onNeedReload 0 | __root.tsx: rel manifest 1 · pwa-register.tsx: «lovable.app» nel codice 0 · isLovablePreviewHost( 1 · onRegisterError 1 · onNeedReload 1 |
|  | push-sw.js: navigate( 0 · openWindow( 1 · stessa origine 0 | push-sw.js: navigate( 1 · openWindow( 1 · stessa origine 3 |
| **D3** | campanella: bg-error-bright 1 · bg-error 0 | campanella: bg-error-bright 0 · bg-error 1 |
|  | pagina: markAllRead() 2 · markRead(item) 0 · readIds 2 · formatAgo/localStorage/date-fns/new Date( 0 | pagina: markAllRead() 1 · markRead(item) 1 · readIds 0 · formatAgo/localStorage/date-fns/new Date( 0 |
|  | testi delle regole nella pagina (righe di codice): 2 | testi delle regole nella pagina (righe di codice): 0 |
|  | pagina: tabella icone e colori del §4.4 3 su 11 · descrizione 0 · card della lettura persa: titolo 0 · testo 0 · scheletro h-[72px] rounded-[18px] 0 | pagina: tabella icone e colori del §4.4 11 su 11 · descrizione 1 · card della lettura persa: titolo 1 · testo 1 · scheletro h-[72px] rounded-[18px] 1 |
|  | i testi di prima in src: 2 file | i testi di prima in src: 0 file |
|  | src/lib/client-notifications.test.ts |  |
|  | src/lib/client-notifications.ts |  |
| **D4** | mark_notification_read / mark_all_notifications_read fuori da use-notifications.ts (codice, test esclusi): 0 file | mark_notification_read / mark_all_notifications_read fuori da use-notifications.ts (codice, test esclusi): 0 file |
|  | from("notifications") fuori da use-notifications.ts (codice, test esclusi): 0 file | from("notifications") fuori da use-notifications.ts (codice, test esclusi): 0 file |
|  | lato coach cambiato (use-notifications.ts, trainer-notifications-bell.tsx, trainer-header.tsx, trainer.index.tsx): 0 file | lato coach cambiato (use-notifications.ts, trainer-notifications-bell.tsx, trainer-header.tsx, trainer.index.tsx): 0 file |
|  | notifications.ts, righe tolte o cambiate (deve solo aggiungere): 0 | notifications.ts, righe tolte o cambiate (deve solo aggiungere): 0 |
| **D5** | cornice: clientReminders( 0 · clientNotificationList( 0 · useNotifications( 0 · useClientBookState( 0 · useMyCoach( 0 · nextReadIds( 0 | cornice: clientReminders( 1 · clientNotificationList( 1 · useNotifications( 1 · useClientBookState( 1 · useMyCoach( 1 · nextReadIds( 2 |
|  | regole: creditsWarningParts( 0 · canRate( 0 · getClientSessionStatus( 1 · describeClientNotification( 0 · date dei blocchi e della BIA con new Date (in UTC) 3 | regole: creditsWarningParts( 1 · canRate( 1 · getClientSessionStatus( 1 · describeClientNotification( 1 · date dei blocchi e della BIA con new Date (in UTC) 0 |
| **D6** | client.settings.tsx: isPushEnabledFor( 0 · forgetPushForUser( 0 · signOut() 2 · unsubscribe() 1 · client.tsx: forgetPushForUser( 0 · signOut() 1 | client.settings.tsx: isPushEnabledFor( 1 · forgetPushForUser( 1 · signOut() 2 · unsubscribe() 0 · client.tsx: forgetPushForUser( 1 · signOut() 1 |
|  | client-settings.ts (i testi del Profilo non cambiano): righe di codice cambiate 0 | client-settings.ts (i testi del Profilo non cambiano): righe di codice cambiate 0 |
| **D7** | queries.ts: created_at nella lettura più larga 0 | queries.ts: created_at nella lettura più larga 1 |
| **D8** | (fine D8) | (fine D8) |
| **D9** | (fine D9) | -\| 08 \| [Notifiche](passes/08-notifiche.md) \| H8, O3 \| 01, 04 \| sì \| [ ] \| |
|  |  | +\| 08 \| [Notifiche](passes/08-notifiche.md) \| H8, O3 \| 01, 04 \| sì \| [x] \| |
|  |  | (fine D9) |
| **D10** | (fine D10) | (fine D10) |
| **D11** | avvisi: 0 | avvisi: 0 |
| **D12** | (fine D12) | 1bffaa2 Revisione: una riga nuova fa rileggere sessioni e crediti, il focus dopo «Riprova», il profilo nel cancello, i crediti quasi finiti in cima |
|  |  | 057de9f PIANO.md: la passata 08 è fatta |
|  |  | cb931ac Notifiche sul telefono: «Attive» guarda la riga di chi è entrato, e all'uscita il telefono smette di riceverle |
|  |  | 307521c Notifiche del cliente: i promemoria nuovi, la lista con le azioni del coach, una letta alla volta, il badge |
|  |  | ab28e2c Notifiche del cliente: le azioni del coach lette da describeClientNotification, le parti dell'avviso dei crediti, la creazione delle sessioni |
|  |  | c79fc41 Notifiche sul telefono: il service worker si registra in produzione, le pagine collegano il manifest, il tocco apre la pagina, l'iscrizione aspetta il service worker attivo |
|  |  | 73621be Il piano della passata 08 in testa a docs/ULTIMO-RITORNO.md |
|  |  | (fine D12) |
| **D13** | contrast.test.ts: il caso della campanella del cliente 0 | contrast.test.ts: il caso della campanella del cliente 1 |

## 7 · LE PROVE ROSSE

**R1-R24, sul codice, a Roma.** L'arnese della 07 adattato ai sette file del §5 (`rosse.mjs` + `mutazioni.json` nello scratchpad): ogni mutazione è una sostituzione esatta che deve trovare il testo una volta sola; lancia i sette file col reporter JSON, raccoglie i test caduti, rimette il file e ne confronta lo sha256. Girata due volte: su `057de9f` (217 test) e, dopo la revisione, su `1bffaa2`. Sul commit finale, prima e dopo, senza difetti: **218 su 218 verdi**. Tutte e 24 **rosse** le due volte, tutte coi file rimessi con lo **sha256 uguale**; il verde è la suite di dopo. Nessun file caduto al caricamento. Fra parentesi i test caduti su `1bffaa2`; i nomi sono quelli del §7 del prompt, quando ce n'è uno in più lo dico.

- **R1** `confirm-${b.id}` senza l'inizio (6): «una voce per ogni sessione «Da confermare»…», «spostata, la stessa sessione ha un id nuovo…», «dalla più recente…», «un promemoria letto resta letto finché il suo id non cambia», più «una riga di una sessione che non è più del cliente porta alla Home» e «i crediti quasi finiti restano in cima…» (i due casi cercano la conferma col suo id completo).
- **R2** la data della conferma sempre inizio − 48 ore (1): «la data della voce è l'inizio meno 48 ore, o la creazione se è più recente».
- **R3** «mer 30 set» col formato breve (3): «una voce per ogni sessione…», «oltre domani la data è lunga, col mese», più «senza tipologia il nome è quello del tipo base» (anche lì c'è «oggi»).
- **R4** «da quando» in millisecondi (1, a Roma): ««da quando» sono 7 giorni di calendario, anche a cavallo del cambio d'ora» (`client-home.test.ts`). Rilanciata da sola in `UTC` e a `America/Los_Angeles`: **verde**, come la stampa (il cambio d'ora del caso è quello di Roma).
- **R5** «Ti restano» a percorso concluso (1): «niente voce con 0 o con 3 crediti, a percorso concluso, o senza lo stato dei crediti».
- **R6** il Booster a chi non compra (2): «chi non compra parla col coach, e verso la Home», più «il cliente libero…» (anche lui non compra).
- **R7** «Crediti da usare» e «Ti restano» insieme (1): «con i crediti da usare non c'è anche «Ti restano»». ⚠️ Il mio `creditReminder` restituisce una voce sola, quindi il mutante equivalente aggiunge in `clientReminders` una seconda chiamata che, quando ci sono i crediti da usare, calcola anche quelli quasi finiti.
- **R8** il primo blocco non apre un percorso (1): «il primo blocco del cliente, o quello che comincia con path_start_date, apre un percorso».
- **R9** `<=` al posto di `<` (1): «niente notizia dal settimo giorno…».
- **R10** la BIA col punto (3): «la misurazione più recente, se registrata da meno di 14 giorni…», più «registrata da 14 giorni esatti…» (la seconda metà, «30,1») e «senza la data di registrazione…».
- **R11** la BIA più vecchia (1): «la misurazione più recente…».
- **R12** la valutazione senza `canRate` (1): «valutata, importata da Google (col titolo) o di più di 14 giorni fa: niente voce».
- **R13** `feedback ?? []` (1): «prima che le valutazioni arrivino (feedback null): niente voce».
- **R14** la lista dalla più vecchia (4): «dalla più recente…», «un promemoria letto resta letto…», più «a parità di momento vale l'id…» e «i crediti quasi finiti restano in cima…».
- **R15** la riga di una sessione non più sua apre il dettaglio (1): «una riga di una sessione che non è più del cliente porta alla Home».
- **R16** la regola di prima (tenere solo i promemoria di adesso) (4): i tre casi di `nextReadIds`, più «oltre 200 id escono i più vecchi».
- **R17** «credito scalato» al contrario (1): «sessione annullata: credito restituito o scalato».
- **R18** il nome dal coach di adesso (1): «il nome è di chi ha agito (coach_name del payload), anche se il coach di adesso è un altro».
- **R19** una riga di un tipo sconosciuto si mostra (2): «dalla più recente…», più «un promemoria letto resta letto…».
- **R20** ogni host su `lovable.app` è un'anteprima (1): «la produzione non è un'anteprima».
- **R21** il tocco mette solo il fuoco (7): «con l'app aperta altrove…», «prima il fuoco, poi la pagina…», «col fuoco negato…», «una finestra che non si può spostare: si apre la pagina», più «la prima finestra non si sposta, la seconda sì», «navigate che finisce senza finestra» e «senza indirizzo, o con un indirizzo di un'altra origine, la Home» (la finestra aperta non va più alla Home).
- **R22** «Attive» col solo dispositivo (2): «con l'iscrizione ma senza la riga (di un'altra persona, o scrittura fallita): no», più «con l'iscrizione e la riga…» (che controlla anche la lettura).
- **R23** `bg-error-bright` (1): il caso del badge in `contrast.test.ts`.
- **R24** `getRegistration()` al posto di `ready` (2): «iscrive con la registrazione di ready…», più «senza un service worker attivo entro 10 secondi…» (con `getRegistration()` nullo e `ready` che non arriva, la promessa non finisce più).

**R25-R31, nel browser e nella build** (`banco\rosse-browser08.mjs`, adattato dallo script di Cowork). Ogni mutante si applica prima di avviare Vite; poi gira la parte del giro (o la build di Lovable con `prova-sw-cli-08.mjs`) che lo deve vedere, con accanto la riga dei controlli che il prompt nomina; poi il file torna com'era (sha256 uguale). Girata due volte, su `057de9f` e su `1bffaa2`, con gli stessi esiti: **7 rosse su 7**. Il verde è `giro08.mjs` 79 su 79 e B13 «come atteso» sullo stesso codice; dopo R30 la build è stata rifatta e B13 è tornato «pronto».

- **R25** il tocco chiama anche `markAllRead()`: B2 **5 su 7**. Due RPC (`mark_notification_read` e `mark_all_notifications_read`), e tornando indietro «Tutte lette» invece di «4 da leggere». D3 col mutante: `markAllRead() 2`.
- **R26** «Esci» dell'header desktop senza `forgetPushForUser`: B10 **8 su 9**. Nessuna `DELETE` prima di `/auth/v1/logout`, righe `["sua","altra"]`. D6: `client.tsx: forgetPushForUser( 0`.
- **R27** il Profilo con `getCurrentPushSubscription()` al posto di `isPushEnabledFor`: B10 **7 su 9**. Il dispositivo iscritto senza la riga di Giulia, e con la riga di un'altra persona, dice «Attive» e l'interruttore è acceso. D6: `isPushEnabledFor( 0`.
- **R28** la card di «Riprova» saltata: B8 **4 su 8**. Giulia senza righe mostra una lista a metà (3 voci, i soli promemoria), Marta senza extra 2 voci senza «Crediti da usare»; in nessuno dei due casi c'è «Riprova».
- **R29** le pagine senza il manifest: B1 di Giulia **9 su 10**, `<link rel="manifest">` `null`. D2: `rel manifest 0`.
- **R30** la precache coi file della build: con `LOVABLE_SANDBOX=1`, 86 voci con `client/` (la prima `client/push-sw.js`), `"ready":"non pronto dopo 8 s"`, `"registrations":0`, `ESITO: NON come atteso`. D2: `globPatterns: [] 0`. Rimesso il file e rifatta la build, B13 torna «pronto», 1 registrazione.
- **R31** `bookState.failed` fuori da `notificationsLost`: B8 **6 su 8**. Marta con `extra_credits` in errore mostra 2 voci invece della card, e dopo «Riprova» la lista ha «2 da leggere» invece di «3 da leggere»: manca «Crediti da usare».

## 8 · IL BROWSER

Il banco di Cowork copiato nello scratchpad (§1, passo 0); il codice è quello del ramo a lavoro committato. Nessuna correzione ai giri: il markup della pagina è quello che `giro08.mjs` legge.

- **`giro08.mjs` (B1-B11): 79 su 79**, sia su `057de9f` sia, di nuovo, su `1bffaa2` (`REPO=… DATI05=dati-cli-06-2026-10-01.json node giro08.mjs porta=5508`). B11: zero richieste esterne bloccate, zero funzioni server, zero errori di pagina, nessuna chiave doppia. Schermate: `schermate-08/b1-giulia-390.png`, `b1-marta-390.png`, `b1-davide-390.png`, `b9-giulia-320.png`, nella copia del banco (`…\scratchpad\banco\schermate-08\`).
- **La stampa di Cowork** (`stampa-cli-08-2026-10-04.ts` col suo risolutore, da PowerShell, `node --experimental-transform-types`): **uguale all'atteso** a Roma (sonda −120), in UTC (0) e a Los Angeles (420), con la stessa impronta nei tre fusi. Prima del commit del passo 3 e di nuovo dopo la revisione.
- **La sonda della revisione** (`sonda-revisione08.mjs`):
  - A: una riga «Nuova sessione in agenda» arriva dal realtime per una sessione appena scritta nel finto;
  - B: «Riprova» con la lettura ancora persa;
  - C: «Riprova» riuscito.
  - Su `057de9f` dà **3 su 7**: il tocco va a `/client`, nessuna rilettura delle sessioni, il focus resta su «Riprova» o va sul `body`.
  - Su `1bffaa2` dà **7 su 7**: il dettaglio `/client/bookings/g-nuova-dal-coach`, le sessioni rilette, il focus sul titolo della card e poi su «5 da leggere».
- **R25-R31:** §7.
- **B12, i giri di prima** sul ramo, copiati da `app\` così come sono (salvo `lib.mjs`, la `DIR` di `giro-prenota.mjs` e l'atteso della 04 accanto), uno dopo l'altro:
  - `giro04.mjs` **104 su 104**;
  - `giro-sessioni.mjs` **78 su 78**;
  - `giro-prenota.mjs` **82 OK e 0 KO** (`82/82 OK`);
  - `giro05-cowork.mjs` **149 su 152**, coi soli tre KO noti delle attese della 05 (decisione 14: `giorgio · crediti · righe`, `giorgio · crediti · fondo`, `nina · crediti · fondo`);
  - `giro07.mjs` (con `DATI05=dati-cli-06-2026-10-01.json`) **147 su 147**.
  - Sono gli stessi numeri della base e del ramo simulato di Cowork. Gli errori 500 in fondo alle uscite sono quelli che i giri iniettano apposta. `giro.mjs` (la 01) non l'ho lanciato, come dice il §8.
- **B13, il service worker della build** (`LOVABLE_SANDBOX=1 bun run build` su `1bffaa2`, poi `node prova-sw-cli-08.mjs …/dist/client …/dist 5611`):
  - `{"rotto":false,"precache":["manifest.webmanifest"],"client":false,"navigationRoute":false,"networkFirst":false,"importScripts":"/push-sw.js","register":"ok","ready":"pronto","registrations":1,"state":"activating"}` → `ESITO: come atteso`
  - con `--rotto`: `{"rotto":true,…,"ready":"non pronto dopo 8 s","registrations":0,"state":"redundant"}` → `ESITO: come atteso`
  - Sulla base `5440168` la stessa build aveva 88 voci in precache, 86 con `client/`, la NavigationRoute e la NetworkFirst (§1, passo 0). Alla fine `rm -rf dist .output`.

## 9 · NON FATTO

- **Niente di quello che il prompt chiedeva è rimasto fuori.** Non ho toccato il server (i trigger della 08 sono di Cowork e li applica Nicolò), non ho fatto merge, ho pubblicato solo `redesign/cliente-08-notifiche`.
- Non fatti per scelta, come dice il §9: le preferenze per tipo di notifica, le push per le azioni del coach, una versione nell'URL di `importScripts`, il manifest statico in `public/` per togliere l'ascoltatore `fetch` del service worker, `cancelQueries` nella cornice (la corsa della cache con una lettura in volo resta, dichiarata nel commento di testa di `use-client-shell.ts`), il rimborso nel payload dell'annullamento, il lato coach, `whatsappUrl`, l'`h2` di `BookRetryCard`.
- Le prove nel browser coprono le metà (la pagina con righe scritte dal finto nella forma dei trigger; i trigger nel banco SQL di Cowork): la prova sul database vero, da capo a fondo, è di Nicolò (§12).

## 10 · DIVERGENZE

Nomi, firme e testi del §4 sono quelli del prompt, alla lettera: la stampa di Cowork sul ramo dà l'atteso nei tre fusi, prima e dopo la revisione. Le differenze:

1. **Il clone all'avvio** era su `main` @ `3d29634`, non su `redesign/cliente-07-profilo` @ `0ef18e5` (§1, passo 0). Senza effetti.
2. **Nel cancello della pagina c'è anche il profilo della cornice** (`src/hooks/use-client-shell.ts`, `notificationsLoading`, `notificationsLost`, `notificationsRetrying`, `retryNotifications`). Il §4.4 elenca righe, sessioni, valutazioni, BIA e stato dei crediti, ma dice anche che il cancello copre «tutte le letture da cui vengono le voci». Il profilo è una di quelle: `path_start_date` decide fra «Nuovo percorso» e «È iniziato un nuovo blocco», che hanno id diversi, e `coach_id` dà i nomi delle tipologie. Senza il profilo, un percorso ricominciato comparirebbe come blocco nuovo e poi cambierebbe id, tornando non letto.
3. **Una riga nuova fa rileggere sessioni e crediti**, e mentre le sessioni si rileggono `bookingIds` è `null` (`use-client-shell.ts`, l'effetto su `rowsQ.data` con `invalidateBookingScope`). Il §4.4 dice «gli id di `bookingsQ.data` (o `null`)», ma le sessioni del cliente non hanno un canale realtime. Una «Nuova sessione in agenda» arrivata dal realtime parlava quindi di una sessione che la cache non aveva, e la regola «non è più del cliente» la mandava alla Home: misurato nel banco, prima `/client`, dopo `/client/bookings/<id>` (§8). Lo ha trovato il revisore (passo 9).
4. **I crediti quasi finiti stanno sempre in cima** (`client-notifications.ts`, `clientNotificationList`: senza momento la voce vale +∞, non `now`). Il §4.3 dice «contano come «adesso» e stanno in cima». Con l'ora della cornice ferma a passi di 30 s (`useNow`), una riga appena arrivata è più nuova di `now` e andava sopra; per mantenere «in cima» la voce supera tutto. Le altre voci restano in ordine cronologico vero: il revisore proponeva di fermare i momenti futuri a `now`, ma così le righe degli ultimi 30 s finirebbero in ordine di id. Stampa e attese del browser non cambiano.
5. **Il focus dopo «Riprova»** (`src/routes/client.notifications.tsx`): il prompt non lo chiede, ma la card è nuova. Ho seguito lo schema di Sessioni e della Home: se la rilettura fallisce di nuovo, il focus va al titolo della card; se riesce, va al riepilogo o a «Nessuna notifica».
6. **`describeClientNotification`:** un `coachFirst` vuoto o di soli spazi vale come nessun coach («Il tuo coach»), come un `coach_name` vuoto.
7. **L'interruttore spento** (`src/routes/client.settings.tsx`, `togglePush`): se la `DELETE` della riga fallisce lancia l'errore, quindi compare il toast d'errore e l'interruttore resta acceso. Senza la disiscrizione di prima, una cancellazione fallita lascerebbe arrivare le notifiche con l'interruttore spento.
8. **`public/push-sw.js`:**
   - l'indirizzo della notifica vale solo se è una stringa;
   - nel ramo «già sulla pagina» un fuoco negato si ignora (invece di `return c.focus()`, che faceva fallire `waitUntil`);
   - `openWindow` si aspetta.
   - Le righe con `self.location.origin` sono tre, come vuole D2.
9. **`src/components/pwa-register.tsx`:** anche il `.catch` dell'import di `virtual:pwa-register` scrive l'avviso. Prima taceva: un file del modulo in 404 dopo un rilascio toglieva il service worker senza traccia (revisore, punto 5).
10. **Il commento di `__root.tsx`:** il prompt dice che `virtual:pwa-info` «restituisce un tag HTML, non un indirizzo». In realtà `node_modules/vite-plugin-pwa/info.d.ts` dà anche `webManifest.href`. La scelta non cambia (l'href fisso), e il commento dice il motivo vero: un tipo in più in `tsconfig.json`.
11. **`nextReadIds`** toglie anche i doppioni già presenti nello storage.
12. **`biaReminder`** non fa la voce se i numeri o le date non si leggono, invece di «Peso NaN kg» o di un `toISOString` su una data non valida, che nella cornice di tutte le pagine sarebbe un crash.
13. **`forgetPushForUser`** ferma il suo timer di 3 s quando la cancellazione finisce prima.
14. **I numeri finali:** **1357 test in 65 file**, contro i 1327 del ramo simulato di Cowork (§4).
15. **Le prove rosse:**
    - R7 è un mutante equivalente (§7);
    - dieci prove fanno cadere qualche caso in più di quelli elencati dal §7, e li ho scritti tutti.
16. **`LOVABLE_SANDBOX=1 bun run build` funziona anche su Windows**: B13 e R30 non sono lacune.
17. **D12 ha un commit in più**, quello della revisione (`1bffaa2`); il §6 lo ammette se detto.

## 11 · TROVATI E NON TOCCATI

1. **La sessione scaduta non toglie la riga del telefono** (`src/lib/auth.tsx:36-47`). È l'unica uscita senza `signOut`, e non passa dal codice del cliente (lo dice anche il §4.5, punto 4). Chi riprende il telefono dopo una sessione scaduta riceve ancora le notifiche della persona di prima, finché qualcuno non entra e le spegne.
2. **Nessuna prova di qui fa girare la registrazione dell'app nella build** (`PwaRegister` → `virtual:pwa-register` → `registerSW`). B13 registra `/sw.js` direttamente da Chromium, e il banco gira sul server di sviluppo con `devOptions.enabled: false`. La catena dell'app si vede solo alla rilettura della produzione (§12, punto 2).
3. **`<html lang="en">` per un'app in italiano** (`src/routes/__root.tsx:121`), e il manifest esce con `"lang":"en"`, il valore predefinito di vite-plugin-pwa (`vite.config.ts` non lo dice). Uno screen reader legge i testi italiani con la voce inglese (WCAG 3.1.1). Fuori dalla 08.
4. **La lettura delle righe ne prende 30** (`src/hooks/use-notifications.ts`, `PAGE_SIZE`). Le righe che il cliente non sa leggere (un `booking.no_show` arrivato comunque, un tipo nuovo) occupano posti, quindi con molte righe illeggibili una riga leggibile più vecchia non si vede. Oggi non succede, perché i trigger della 08 scrivono solo i quattro tipi; il file non si tocca (D4).
5. **`useClientBookState().retry` è una funzione nuova a ogni disegno** (`src/hooks/use-client-book-state.ts:176`). `retryNotifications` della cornice cambia insieme a lei, quindi il valore del contesto si rifà a ogni disegno del layout e ridisegna chi lo legge. Nessun difetto visibile, ma la memoizzazione della cornice serve meno di quanto sembri (il revisore lo ha visto pure lui).
6. **Il timer di 10 secondi di `subscribeToPush` non si ferma** quando `ready` arriva prima (`src/lib/push.ts`). È innocuo.
7. **La policy «Coach read clients push subscriptions»** (`supabase/migrations/20260510114859_0a2e8967-…sql:18`) lascia a un coach leggere le iscrizioni dei suoi clienti, con le chiavi `p256dh` e `auth`. Per mandare una push serve anche la chiave privata VAPID, che ha solo il server, ma è un dato che il coach non usa. È per la corsia del coach.

## 12 · RESTA A NICOLÒ

1. **Il merge della PR** in `redesign/cliente-mobile`, dopo la verifica di Cowork (che rilancia la stampa sul ramo: qui dà già l'atteso nei tre fusi, §8).
2. **Al rilascio su `main` e alla pubblicazione**, Cowork rilegge la produzione in sola lettura: `/sw.js` con la precache del solo manifest e il suo `workbox-*.js` che rispondono 200, il `<link rel="manifest">` nelle pagine, una registrazione attiva in Chrome.
3. **Sul telefono:** chi ha già l'icona dell'app sulla schermata Home di un iPhone la toglie e la rimette (iOS legge il manifest quando l'icona si aggiunge).
4. **La push vera, una volta, sul telefono:** nel pannello di Lovable Cloud ci sono i segreti `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (si guardano i nomi, non i valori; senza, `send-push` risponde 500, `supabase/functions/send-push/index.ts`); poi, con l'app aperta dall'icona e un account cliente di prova, «Attive» acceso, una prenotazione: la conferma arriva sul telefono e il tocco apre l'app. Fino a lì «Attive» promette una cosa che nessuno ha visto arrivare.
5. **I trigger della 08** (`app/server-cli-08-notifiche-2026-10-04.sql`, nell'editor SQL di Lovable Cloud, come il giro del 02/10), le letture di controllo, e **una prova da capo a fondo:** dal lato coach si sposta e poi si annulla una sessione del cliente di prova, e sulla pagina Notifiche di quell'account le due voci compaiono senza ricaricare e aprono il dettaglio giusto (il criterio 1 del brief, che le prove di qui coprono in due metà e nella giunzione, mai sul database vero).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
