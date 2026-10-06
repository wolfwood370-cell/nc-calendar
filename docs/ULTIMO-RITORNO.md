**Dove ho girato (ultimo ritorno · lato cliente · passata 10 · le correzioni, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0 (autenticato). **Le librerie:** `git hash-object bun.lock` = `git rev-parse 1289051:bun.lock` = `d93afeddf8068057f6d78347267b94b9ffacace6`; in `node_modules/@tanstack/` react-router **1.170.41**, react-start **1.168.60**, router-plugin **1.168.42**: coincidono, **nessuna installazione** (la procedura del 27/09 non è servita).

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base, le librerie e il ramo** (§2). Nessun commit.
   - Ambiente: la riga in testa (PC). All'avvio il clone era su `redesign/cliente-09-verifica` @ `b4c9e64`, pulito.
   - `git fetch origin` → `origin/main` = **`1289051`** (non più avanti). `git switch --no-track -c redesign/cliente-10-correzioni 1289051` → `1289051`, nessun upstream.
   - Le sonde del fuso, da PowerShell: `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `1289051`, senza toccare niente: typecheck **0**; lint **0 errori** e **14** avvisi; **1412 test in 69 file** verdi a Roma e in UTC; a Los Angeles **1 rosso** (`src/lib/client-actions.test.ts` «inviato … fa» > oggi, ieri, N giorni: `expected 'inviato ieri' to be 'inviato oggi'`), 1411 verdi; build riuscita.
   - Lo script dei controlli su `1289051`: la colonna «oggi» del §6, riga per riga (§10, punto 5).
   - Il banco copiato nello scratchpad (`lib-windows.mjs` → `lib.mjs`, l'atteso della 04 accanto, la `DIR` di `giro-prenota.mjs` lì); Playwright della cache di `npx` e `chromium_headless_shell-1200` ci sono. `git apply --check` della patch del ramo simulato sul ramo appena creato: passa.
1. ☑ **L'uscita chiesta nomina la sessione** (§4.1). `fa5d18c`. `push.test.ts` verde (33: 29 di prima, 4 nuovi); D0 `4 su 5` (il quinto nome è del passo 3), D2 all'atteso; typecheck 0.
2. ☑ **Accessibilità e contrasti** (§4.2). `f2d1e90`. `contrast.test.ts` verde (12); D3, D4, D5, D6 all'atteso; typecheck 0, lint 0 sui file toccati. I pannelli dei tab del coach presi dalla patch di Cowork (il rientro), confrontati con `git diff -w`: cambiano solo l'import, `TABS_ID`, `idBase` e il `div` del pannello.
3. ☑ **Il cliente dopo il giro del server** (§4.3). `fb4fef5`. `client-session-detail.test.ts` verde (50); D0 `5 su 5`, D7, D8, D9 all'atteso.
4. ☑ **Il coach** (§4.4). `4366695`. Suite intera 1428 in 70, verde; lint 0 e 14; D10-D20 all'atteso; giro di Cowork sul lavoro non ancora committato **30 su 30**.
   - ⚠️ **`hydrated` di `src/routes/auth.tsx` non è uno `useState(false)` messo a `true` da un effetto, ma `useSyncExternalStore`** (`useHydrated`, `src/routes/auth.tsx:56-72`). Misurato con una sonda che registra `pushState`/`replaceState` durante «Esci» (`banco\sonda-esci10.mjs`): con la forma del prompt il percorso era `/auth` (col segno) → **`pushState /trainer`** → `replaceState /auth`. Al primo disegno di `/auth` aperta dall'app `hydrated` è falso, quindi il `<Navigate>` verso l'area del ruolo parte (TanStack lo fa in un `useLayoutEffect`) prima dell'effetto dell'uscita. L'uscita arrivava lo stesso, per una corsa, e nella cronologia restava una voce con `esci: true` (`__TSR_index` 2). B9 passava comunque. Con `useHydrated` (falso sul server e nel disegno che idrata, vero in ogni altro disegno del browser) il percorso è `/auth` → `replaceState /auth`, `__TSR_index` 1, e la pagina idratata resta uguale a quella del server.
   - ⚠️ Lo spazio sopra il contenuto della Panoramica del telefono è 65 + 24 px, non 64 + 24: l'intestazione è alta 65 px (40 + 2×12 + 1 di bordo); prima il contenuto partiva a 88, ora a 89. Clienti resta 64 + 16 = 80.
5. ☑ **Le prove che mancavano** (§5.5). `86037eb`. I due file verdi (39), anche a Los Angeles (sonda `420`); D23 `12 su 12`, D24 all'atteso.
6. ☑ **La pulizia** (§4.5). `6783144`. A commit fatto D21 `0 · 0`, D22 `0 · 0 · 1`, D1 `fuori dall'elenco: 0`, D25 all'atteso; suite 1430 in 70, verde. **L'uscita intera dello script è uguale byte per byte a `atteso-controlli-cli-10-2026-10-05.txt`** (`diff` vuoto).
7. ☑ **I cancelli e le prove rosse** (§2, §7). Nessun commit di prova. I quattro cancelli verdi, la suite verde nei tre fusi (§10, punto 4); R1-R21 **21 rosse su 21**, e sulla base i test nuovi o cambiati danno 16 rossi su 237, come per Cowork (§10, punto 6).
   - ⚠️ **Un commit in più, `a592043`, solo commenti.** Una revisione in sola lettura del ramo (un agente separato, su una fotografia di `6783144`) ha trovato quattro commenti imprecisi, e li ho corretti (§10, punto 10). Il resto sta fra i trovati (§10, punto 11). Dopo il commit ho rifatto i cancelli, la suite nei tre fusi, i controlli e il giro di Cowork (§10, punti 4, 5 e 7).
8. ☑ **Il browser** (§8). Nessun commit: i file di prova stanno nella copia del banco, nello scratchpad. `giro10-cowork.mjs` **30 su 30** sul commit finale `a592043`, e **4 su 28** sulla base, coi 24 KO sui difetti che la 10 corregge; R22-R24 **3 rosse su 3**; B18 come previsto da Cowork (giro-prenota 81 su 82 col solo KO voluto di B8); B19 con Manrope vero: Tipologie 0 sul ramo e 73 sulla base, la nota toccabile su 40 px, «Apri in Mappe» su 44 (§10, punto 7). La worktree della base tolta alla fine.
9. ☑ **Chiusura** (§10). Il commit di questo file. Lo script dei controlli a lavoro committato (§10, punto 5), `git push -u origin redesign/cliente-10-correzioni`, la PR.


## 10 · IL RITORNO

### 0 · Dove ho girato

La riga in testa: sul PC, il lock e le tre versioni di TanStack come su `1289051`, nessuna installazione.

### 1 · Il piano

In testa a questo file, spuntato.

### 2 · Ramo e commit

`redesign/cliente-10-correzioni`, da `1289051` (`origin/main` non era andato avanti). I commit:

- `fa5d18c` L'uscita chiesta nomina la sessione: una scheda ferma in background non libera più il telefono
- `f2d1e90` Accessibilità: il focus dopo «Conferma presenza» solo se perso, i pannelli dei tab nel giro del Tab e del coach, le aree di tocco dei due collegamenti, due contrasti del coach
- `fb4fef5` Il cliente: niente più conferma chiesta dopo la prenotazione (la scrive il server), la nota della valutazione entro i 1.000 caratteri del server, i nomi lunghi delle tipologie vanno a capo
- `4366695` Il coach: i numeri e i testi veri, il telefono nel dialog del telefono, il motivo di una creazione rifiutata, le intestazioni fisse sul telefono, «Clienti» coi filtri, la notifica alla sua data, «Esci» dopo aver lasciato la pagina
- `86037eb` Le prove che mancavano: «Come fare» con un'iscrizione, il fisso col rinnovo acceso, «inviato … fa» in ora locale
- `6783144` Pulizia: commenti che dicevano il falso dopo il giro del server, i rimandi a righe che non ci sono più, quattro chiavi e un modulo che nessuno usa
- `a592043` Commenti resi imprecisi nella 10, trovati da una revisione in sola lettura: l'uscita non riuscita, il blocco preferito dal trigger dei crediti, l'autocompletamento del telefono
- il commit di questo file: Riscrive docs/ULTIMO-RITORNO.md per la passata 10

La PR: aperta con questo file come descrizione, verso `main`, non unita.

### 3 · Manifesto

- **NUOVI (1):** `src/lib/client-stores.test.ts`.
- **MODIFICATI (59 in `src/`, più questo file):** `src/components/` auto-renew-toggle-card, availability-preview-card, book-action-bar, book-type-picker, calendar-mobile, client-booking-detail-view, client-home-next, client-profile-desktop, client-profile-mobile, client-session-rating, client-sheet, clients-desktop, create-client-dialog, event-type-service-card, event-types-mobile, integrations-gcal-card, profile-path, session-form-dialog, trainer-header, trainer-notifications-bell, trainer-sidebar (`.tsx`); `src/hooks/` use-book-confirm, use-client-book-state, use-client-shell, use-session-feedback (`.ts`); `src/lib/` attendance, auth (`.tsx`), booking-slots, calendar-time, client-profile, client-session-detail, client-session-status, client-sessions, client-stores, credit-order, gcal-integration, gcal-sync-run, push, queries, query-keys, session-create, testing/memory-calendar-store, to-assign; `src/routes/` auth, client.sessions, trainer.clients.index, trainer.index, trainer (`.tsx`); i test `src/lib/` attendance, client-actions, client-profile, client-session-detail, client-settings, coach-contacts, contrast, push, session-create, session-edit, to-assign (`.test.ts`); `docs/ULTIMO-RITORNO.md`.
- **TOLTI (1):** `src/lib/datetime.ts`.
- **NEL PERIMETRO MA NON TOCCATI:** nessuno (ogni file dell'elenco del §4 è cambiato).
- Fuori dal perimetro: niente (D1 `fuori dall'elenco: 0`, D26 `0`). `design_handoff_cliente_mobile/PIANO.md`, `supabase/`, `src/integrations/` e `src/lib/testing/` salvo `memory-calendar-store.ts`: non toccati.

### 4 · I cancelli

| | su `1289051` (passo 0) | alla fine (`a592043`) |
|---|---|---|
| typecheck | 0 errori | 0 errori |
| lint | 0 errori, 14 avvisi | 0 errori, 14 avvisi, gli stessi della base per regola e file (10 `react-refresh/only-export-components`, 4 `react-hooks/exhaustive-deps`; `eslint -f json` confrontato) |
| test, Roma (sonda `-120`) | 1412 in 69, verdi | **1430 in 70**, verdi |
| test, UTC (sonda `0`) | 1412 in 69, verdi | 1430 in 70, verdi |
| test, Los Angeles (sonda `420`) | 1411 verdi, **1 rosso** («inviato … fa») | 1430 in 70, verdi |
| build | riuscita | riuscita (le 57 righe con «error» sono gli avvisi «use client» di TanStack e sonner, gli stessi della base) |

Le prove col fuso da PowerShell, una per fuso (`$env:TZ = "…"; node -e "…getTimezoneOffset()"; bun run test; $env:TZ = $null`), con la sonda stampata prima di ogni suite. Nessun file caduto al caricamento, nessun `heap out of memory`. Alla fine `rm -rf dist .output` dalla radice del clone.

### 5 · Acceptance

`node "C:/Coworks/NC App Development/app/controlli-cli-10-2026-10-05.mjs"` dalla radice del clone, in Git Bash. A sinistra l'uscita su `1289051` (passo 0), a destra quella a lavoro committato (`a592043`). **L'uscita di destra è uguale, riga per riga, a `atteso-controlli-cli-10-2026-10-05.txt`** (`diff` vuoto). D1 e D26 confrontano i commit `1289051...HEAD`. Il file di questo ritorno è nell'elenco del §4, quindi non cambia D1.

| | oggi (passo 0) | alla fine |
|---|---|---|
| **D0** i nomi nuovi | `2 su 5` | `5 su 5` |
| **D1** il manifesto | `fuori dall'elenco: 0`<br>`test cambiati o nuovi: 0` | `fuori dall'elenco: 0`<br>`test cambiati o nuovi: 12 · src/lib/attendance.test.ts src/lib/client-actions.test.ts src/lib/client-profile.test.ts src/lib/client-session-detail.test.ts src/lib/client-settings.test.ts src/lib/client-stores.test.ts src/lib/coach-contacts.test.ts src/lib/contrast.test.ts src/lib/push.test.ts src/lib/session-create.test.ts src/lib/session-edit.test.ts src/lib/to-assign.test.ts` |
| **D2** la sessione nel segno | `auth.tsx: leftOnPurpose(readLeaving(), Date.now(), before) 0 · leftOnPurposeRecently( 1 · sessionKey( 0 · markLeaving() 1 · markLeaving(at, knownSession.current) 0 · senza sessione se l'uscita non riesce 0`<br>`push.ts: leftOnPurpose usa leftOnPurposeRecently( 0 · markLeaving scrive la sessione 0 · leftOnPurposeRecently legge l'istante dal segno 0 · session_id 0` | `auth.tsx: leftOnPurpose(readLeaving(), Date.now(), before) 1 · leftOnPurposeRecently( 0 · sessionKey( 2 · markLeaving() 0 · markLeaving(at, knownSession.current) 1 · senza sessione se l'uscita non riesce 1`<br>`push.ts: leftOnPurpose usa leftOnPurposeRecently( 1 · markLeaving scrive la sessione 1 · leftOnPurposeRecently legge l'istante dal segno 1 · session_id 2` |
| **D3** il focus dopo «Conferma presenza» | `client-home-next: focusIfLost(titleRef.current, null, confirmRef.current) 0 · ref={confirmRef} 0 · onSuccess: focusTitle 1`<br>`client-booking-detail-view: focusIfLost(titleRef.current, null, confirmRef.current) 0 · ref={confirmRef} 0 · onSuccess: () => titleRef.current?.focus 1` | `client-home-next: focusIfLost(titleRef.current, null, confirmRef.current) 1 · ref={confirmRef} 1 · onSuccess: focusTitle 0`<br>`client-booking-detail-view: focusIfLost(titleRef.current, null, confirmRef.current) 1 · ref={confirmRef} 1 · onSuccess: () => titleRef.current?.focus 0` |
| **D4** i pannelli dei tab | `client.sessions.tsx: tabIndex={0} 0 · tabIndex={-1} 4 · outline-none sul pannello 1`<br>`clients-desktop.tsx: idBase= 0 · role="tabpanel" 0 · aria-labelledby={tabId( 0`<br>`client-profile-desktop.tsx: idBase= 0 · role="tabpanel" 0 · aria-labelledby={tabId( 0 · tabIndex={0} 0` | `client.sessions.tsx: tabIndex={0} 1 · tabIndex={-1} 3 · outline-none sul pannello 0`<br>`clients-desktop.tsx: idBase= 1 · role="tabpanel" 1 · aria-labelledby={tabId( 1`<br>`client-profile-desktop.tsx: idBase= 1 · role="tabpanel" 1 · aria-labelledby={tabId( 1 · tabIndex={0} 1` |
| **D5** le aree di tocco | `«Apri in Mappe»: relative 0 · before:-inset-y-3 0`<br>`il collegamento della nota della Home: relative 0 · whitespace-nowrap 0 · before:-top-2 0 · before:-bottom-3.5 0` | `«Apri in Mappe»: relative 1 · before:-inset-y-3 1`<br>`il collegamento della nota della Home: relative 1 · whitespace-nowrap 1 · before:-top-2 1 · before:-bottom-3.5 1` |
| **D6** i contrasti | `badge del telefono: bg-error-bright 1 · bg-error 0 · nota delle Regole: text-outline 1 · text-on-surface-variant 0` | `badge del telefono: bg-error-bright 0 · bg-error 1 · nota delle Regole: text-outline 0 · text-on-surface-variant 1` |
| **D7** la conferma dopo la prenotazione | `use-book-confirm.ts: confirm_booking_attendance 3 · confirmsOnBooking 2 · client-book.ts esporta confirmsOnBooking 1` | `use-book-confirm.ts: confirm_booking_attendance 0 · confirmsOnBooking 0 · client-book.ts esporta confirmsOnBooking 1` |
| **D8** la nota della valutazione | `RATING_NOTE_MAX = 1000 0 · maxLength={RATING_NOTE_MAX} 0 · use-session-feedback: as FeedbackInsert 1` | `RATING_NOTE_MAX = 1000 1 · maxLength={RATING_NOTE_MAX} 1 · use-session-feedback: as FeedbackInsert 0` |
| **D9** i nomi lunghi | `book-type-picker [overflow-wrap:anywhere] 0 · book-action-bar [overflow-wrap:anywhere] 0` | `book-type-picker [overflow-wrap:anywhere] 1 · book-action-bar [overflow-wrap:anywhere] 1` |
| **D10** Panoramica e Clienti sul telefono | `trainer.index.tsx: .slice(0, 5) nel filtro di oggi 1 · todayAll.slice(0, 5) 0 · todayAll.length 0 · «Un'altra» / «Altre N nel Calendario» 0 / 0 · fixed top-0 1 · sticky top-0 0 · pt-[88px] 1`<br>`trainer.clients.index.tsx: fixed top-0 1 · sticky top-0 0 · <main className="pt-20 1` | `trainer.index.tsx: .slice(0, 5) nel filtro di oggi 0 · todayAll.slice(0, 5) 1 · todayAll.length 5 · «Un'altra» / «Altre N nel Calendario» 1 / 1 · fixed top-0 0 · sticky top-0 1 · pt-[88px] 0`<br>`trainer.clients.index.tsx: fixed top-0 0 · sticky top-0 1 · <main className="pt-20 0` |
| **D11** la creazione del cliente | `create-client-dialog: id="new-client-phone" 0 · autoComplete="tel" 0 · phone: phone.trim() \|\| undefined 0 · trainer.clients.index: phone: data.phone 1`<br>`client-stores.ts: parseEdgeError( 0 · error?.message ?? 1` | `create-client-dialog: id="new-client-phone" 1 · autoComplete="tel" 0 · phone: phone.trim() \|\| undefined 1 · trainer.clients.index: phone: data.phone 2`<br>`client-stores.ts: parseEdgeError( 1 · error?.message ?? 0` |
| **D12** «Clienti» coi filtri | `trainer-header.tsx: backToListSearch( 0 · search={listSearch} 0` | `trainer-header.tsx: backToListSearch( 1 · search={listSearch} 1` |
| **D13** le assenze | `profileEngagement: late_cancelled 1 · noShow 0 · client-profile-mobile: «Assenze (8 sett.)» 0 · «No-show» 1` | `profileEngagement: late_cancelled 0 · noShow 1 · client-profile-mobile: «Assenze (8 sett.)» 1 · «No-show» 0` |
| **D14** Tipologie | `sottotitolo con «prezzo» 1 · riga «Prezzo» 1 · «Le prenotazioni esistenti non saranno modificate» 1 · «se non è in uso (sessioni future, clienti con» 0`<br>`trainer.tsx: la colonna con min-w-0 0` | `sottotitolo con «prezzo» 0 · riga «Prezzo» 0 · «Le prenotazioni esistenti non saranno modificate» 0 · «se non è in uso (sessioni future, clienti con» 1`<br>`trainer.tsx: la colonna con min-w-0 1` |
| **D15** «Calendario aggiornato» | `calendar-mobile.tsx: «Calendario aggiornato» 1 · await runReconcile() 0 · quickSyncMessage( 0 · void runReconcile() 1` | `calendar-mobile.tsx: «Calendario aggiornato» 0 · await runReconcile() 1 · quickSyncMessage( 1 · void runReconcile() 0` |
| **D16** da assegnare | `isToAssign: late_cancelled 0` | `isToAssign: late_cancelled 1` |
| **D17** «Esci» del coach | `trainer-sidebar.tsx: signOut 2 · state: { esci: true } 0 · esci nell'indirizzo 0`<br>`auth.tsx: validateSearch 0 · location.state.esci 0 · signOut() 0 · state: {}, replace: true 0` | `trainer-sidebar.tsx: signOut 0 · state: { esci: true } 1 · esci nell'indirizzo 0`<br>`auth.tsx: validateSearch 0 · location.state.esci 1 · signOut() 1 · state: {}, replace: true 2` |
| **D18** il rinnovo | `client-profile.ts: fixed-on 2 · shortDateWithArticle( 0 · profile-path.tsx: fixed-on 1`<br>`auto-renew-toggle-card: «4 settimane + 7 giorni» 1 · «quelli non usati non passano al blocco dopo» 0 · client-profile-mobile: la card solo per gli abbonamenti 0` | `client-profile.ts: fixed-on 0 · shortDateWithArticle( 1 · profile-path.tsx: fixed-on 0`<br>`auto-renew-toggle-card: «4 settimane + 7 giorni» 0 · «quelli non usati non passano al blocco dopo» 1 · client-profile-mobile: la card solo per gli abbonamenti 1` |
| **D19** i 60 minuti | `session-form-dialog: showDurationNote 2 · «Con 1h il server salva la durata della tipologia (» 1`<br>`memory-calendar-store: applyDurations(b) 3 · applyDurations(b, "insert", true) 0 · applyDurations(b, "update", 0` | `session-form-dialog: showDurationNote 0 · «Con 1h il server salva la durata della tipologia (» 0`<br>`memory-calendar-store: applyDurations(b) 0 · applyDurations(b, "insert", true) 1 · applyDurations(b, "update", 2` |
| **D20** la notifica alla sua data | `handleItemClick: openInCalendar( 0 · navigate({ to: "/trainer/calendar" }) 1` | `handleItemClick: openInCalendar( 1 · navigate({ to: "/trainer/calendar" }) 0` |
| **D21** i commenti | `frasi vecchie ancora presenti: 27 · client-reschedule-sheet \| reschedule-drawer \| weekly_schedule rows \| stay reactive (staleTime: 0) \| soft-deleted by the RPC \| la usa la Home con altre colonne \| quella di Home e Prenota \| oggi non la mette nessuno \| la scadenza non la guarda \| che il foglio di riprogrammazione usa senza passarlo \| Pure UPDATE on scheduled_at \| No credit refund/re-consume \| sync-calendar action=update \| il coach di oggi, senza telefono \| Oggi validate_booking_block_allocation \| il server non lo fa ancora \| I tipi generati non hanno ancora \| Snapshot the minimal metadata \| grace period \| booking-slots.ts:36 \| use-book-confirm.ts:1 \| use-book-confirm.ts:2 \| gcal.functions.ts:386 \| gcal.functions.ts:525 \| gcal.functions.ts:551 \| queries.ts:235 \| prende un credito da tutti i blocchi del cliente · «cancel_booking scrive» fuori dai test 1` | `frasi vecchie ancora presenti: 0 · «cancel_booking scrive» fuori dai test 0` |
| **D22** gli orfani | `src/lib/datetime.ts 1 · chiavi mai usate in query-keys.ts (profile, trainerAvailability, trainerSettings, availabilityExceptions) 4 · ui/drawer.tsx 1` | `src/lib/datetime.ts 0 · chiavi mai usate in query-keys.ts (profile, trainerAvailability, trainerSettings, availabilityExceptions) 0 · ui/drawer.tsx 1` |
| **D23** i test nuovi | `0 su 12 · mancano: src/lib/push.test.ts: il segno nomina la sessione che esce \| src/lib/contrast.test.ts: badge delle notifiche del telefono del coach \| src/lib/contrast.test.ts: nota della card «Regole di prenotazione» \| src/lib/client-session-detail.test.ts: RATING_NOTE_MAX è il limite del server \| src/lib/to-assign.test.ts: anche un evento annullato tardi \| src/lib/attendance.test.ts: profileEngagement: le assenze del Profilo del telefono \| src/lib/client-stores.test.ts: col 400 di admin-create-user \| src/lib/client-profile.test.ts: l'articolo davanti al giorno \| src/lib/session-edit.test.ts: cambiando tipologia e tenendo 60 minuti \| src/lib/session-edit.test.ts: una sessione creata a 60 minuti di una tipologia da 30 \| src/lib/client-settings.test.ts: senza push ma con un'iscrizione rimasta \| src/lib/client-settings.test.ts: percorso fisso col rinnovo acceso` | `12 su 12` |
| **D24** «inviato … fa» | `orari con +02:00 nel blocco 4 · new Date(2026, 8, 0` | `orari con +02:00 nel blocco 0 · new Date(2026, 8, 2` |
| **D25** i test di prima | `righe di codice tolte: 0 · file di test tolti: 0` | `righe di codice tolte: 10 · src/lib/client-actions.test.ts 4 · src/lib/client-profile.test.ts 2 · src/lib/client-settings.test.ts 1 · src/lib/coach-contacts.test.ts 1 · src/lib/session-create.test.ts 2 · file di test tolti: 0` |
| **D26** fuori dal perimetro | `file di supabase/, src/integrations/, package.json, bun.lock, vite.config.ts cambiati: 0` | `file di supabase/, src/integrations/, package.json, bun.lock, vite.config.ts cambiati: 0` |


### 6 · Le prove rosse

**R1-R21, sui test** (`scratchpad\rosse\rosse10.py`, ricalcato su `rosse-cli-10-2026-10-05.py` di Cowork con le ancore del mio codice): ogni mutante rompe il codice, non i test; vitest gira col reporter JSON sul file di test del caso, a Roma; il file torna com'era (sha256 controllato). **21 rosse su 21**, e a file rimessi i dieci file dei casi danno **222 verdi su 222**, albero pulito. Cosa ho rotto, e cosa cade (il titolo del `describe` e del caso):

| | rotto | cade |
|---|---|---|
| R1 | `leftOnPurpose`: la riga della sessione diventa `if (false) return true;` | push · «leftOnPurpose: la sessione del segno vale a qualunque distanza; senza, il margine di dieci secondi» |
| R2 | la stessa senza `now >= at` | lo stesso caso (l'istante nel futuro) |
| R3 | `marked !== undefined` al posto di `marked === session` | lo stesso caso (il segno di un'altra sessione) |
| R4 | `sessionKey` con `atob(padded)`, senza i due `replace` (base64 e non base64url) | push · «sessionKey legge session_id dal token, e null se non c'è o non si legge» |
| R5 | `sessionKey` con `return id ? String(id) : null;` | lo stesso caso (`session_id: 42`) |
| R6 | `markLeaving` che scrive solo `String(now)` | push · «markLeaving scrive la sessione accanto all'istante, se la conosce» |
| R7 | `leftOnPurposeRecently` con `Number(raw)` | push · «leftOnPurposeRecently legge l'istante anche dal segno con la sessione» e il caso di R1 |
| R8 | il badge del telefono di nuovo `bg-error-bright` | contrast · «badge delle notifiche del telefono del coach…» |
| R9 | la nota delle Regole di nuovo `text-outline` | contrast · «nota della card «Regole di prenotazione» sul bianco…» |
| R10 | `RATING_NOTE_MAX = 2000` | client-session-detail · «RATING_NOTE_MAX è il limite del server…» |
| R11 | `isToAssign` senza `late_cancelled` | to-assign · «anche un evento annullato tardi non è da assegnare…» |
| R12 | `noshow: attendance?.lateCancelled ?? 0` | attendance · «sono le no_show delle ultime 8 settimane, come il desktop; le annullate tardi no» |
| R13 | `noshow` di sempre (`bookings.filter(… "no_show").length`) | attendance · i due casi di `profileEngagement` |
| R14 | `createUser` con `error.message` al posto di `parseEdgeError` | client-stores · «col 400 di admin-create-user…» e «con un corpo che non è JSON…» |
| R15 | `renewalControl` con `pathType === "recurring" \|\| autoRenewBlocks === true` | client-profile · «fisso ancora acceso…» e «cliente libero: niente» |
| R16 | `autoRenewHint` con «il» e il `format` di prima | client-profile · «l'articolo davanti al giorno…» |
| R17 | l'archivio senza l'eccezione dei 60 minuti espliciti all'inserimento | session-create · «il server tiene i 60 minuti scelti…» |
| R18 | la stessa | session-edit · «una sessione creata a 60 minuti di una tipologia da 30 resta di 60, anche spostata» |
| R19 | l'archivio con `if (b.event_type_id)`, senza `typeSet` | session-edit · i due casi di «modifica · la durata» |
| R20 | `pushRow`, «Come fare», con `checked: s.enabled` | client-settings · «senza push ma con un'iscrizione rimasta…» |
| R21 | `renewsAutomatically` senza `path_type === "recurring"` | client-settings · «percorso fisso col rinnovo acceso…» |

Ogni mutante fa cadere solo i casi della tabella (da 1 a 2 per file; per esempio R7: «31 verdi, 2 rossi su 33»). L'uscita intera è in `scratchpad\rosse\esito-r1-r21.txt`.

**Sulla base cadono 16 dei test nuovi o cambiati:** i 12 file di test del ramo lanciati sul codice di `1289051` (nella worktree della base, poi rimessa) danno **16 rossi su 237**: i 4 di `push`, i 2 di `contrast`, `RATING_NOTE_MAX`, `late_cancelled`, il primo di `profileEngagement`, i 2 di `client-stores` col 400 e col testo, «fisso ancora acceso», «l'articolo davanti al giorno», «il server tiene i 60 minuti scelti» e i 2 di «modifica · la durata». Come nel container di Cowork.

**R22-R24, nel browser** (`banco\rosse-browser10.mjs`): il mutante va nel clone prima di avviare Vite, gira la parte del giro di Cowork, il file torna com'era (sha256 uguale), e la stessa parte rigira sul codice giusto.

| | rotto | col difetto | rimesso |
|---|---|---|---|
| R22 | `src/routes/auth.tsx`: `esciState` legge anche `?esci=1` dall'indirizzo | `solo=B9` **6 su 7**: KO «/auth?esci=1 aperto da un collegamento: nessuna uscita», visto `{"sessioneChiusa":true,"area":false}` | 7 su 7 |
| R23 | `src/lib/auth.tsx`: tolta la riga `if (!done) markLeaving(at);` | `solo=B17` **3 su 4**: KO «"Esci" che non riesce: il segno senza la sessione», visto `{"jwt":true,"segnoSenzaSessione":false}` | 4 su 4 |
| R24 | `src/lib/auth.tsx`: `leftOnPurpose(readLeaving(), Date.now(), null)` | `solo=B16` **3 su 4**: KO «la scheda ferma che si sveglia dopo "Esci" non libera il telefono», visto `liberatoDallaSeconda: 1` (col segno che nomina la sessione) | 4 su 4 |

Dopo le tre prove `git status --short` è vuoto. L'uscita intera è in `scratchpad\rosse-browser10.txt`.


### 7 · Il browser

Il banco di Cowork copiato nello scratchpad (`banco\`, `lib-windows.mjs` → `lib.mjs`, `atteso-cli-04-2026-09-30.json` accanto, la `DIR` di `giro-prenota.mjs` lì), Playwright della cache di `npx` e `chromium_headless_shell-1200`. La base in una worktree staccata fuori dal clone (`scratchpad\base-10`, `node_modules` con una giunzione), tolta alla fine. Un server di sviluppo alla volta, e nessun file del clone toccato mentre un giro girava.

**`giro10-cowork.mjs`** (`REPO=… DATI05=dati-cli-06-2026-10-01.json node giro10-cowork.mjs porta=…`), il file di Cowork così com'è:

- **sul ramo (`a592043`): ESITO 30 su 30**, zero KO, zero richieste esterne bloccate, zero funzioni server eseguite dal server di sviluppo, zero errori di pagina. Lo stesso 30 su 30 era già sul lavoro non ancora committato del passo 4.
- **sulla base (`1289051`): ESITO 4 su 28**, come nel container. Passano solo B17 e le tre prove di chiusura; B9 si ferma alla prima prova. I 24 KO sono tutte le prove di B1-B16, ognuna sul difetto che la 10 corregge:
  - B1: il numero `5` invece di `7`, nessun «Altre 2 nel Calendario», l'intestazione a `top: -250`;
  - B2: l'intestazione a `-1500`, nessun campo telefono nel dialog;
  - B3 e B4: nessun `tabpanel`;
  - B5: `q` e `vista` persi;
  - B6: le Tipologie a 820 px scorrono di **63 px** (78 nel container: qui i caratteri di ripiego di Windows), più «Prezzo», il sottotitolo e la conferma di prima;
  - B7: «Calendario aggiornato» con Google che non risponde;
  - B8: il badge `rgb(229, 57, 53)`, e il tocco apre il Calendario senza `date` né `event`;
  - B9: nessuna conferma, la sessione chiusa subito, poi il giro fermo (`locator.click: Timeout 30000ms`);
  - B10: la card del rinnovo, «No-show», l'avviso «ancora acceso»;
  - B11: `tabindex="-1"` con `outline-none`;
  - B12: «Apri in Mappe» non toccabile a ±10 px, e il focus portato sul titolo («Personal Training»);
  - B13: la parola esce dal suo riquadro e la pagina scorre di 43 px;
  - B14: niente `maxlength`, la nota tiene 1.200 caratteri;
  - B15: niente area di tocco;
  - B16: il segno senza sessione, e la seconda scheda chiama `unsubscribe` una volta.

**Le prove rosse del browser:** R22, R23 e R24 nel §10, punto 6.

**Una sonda in più** (`banco\sonda-esci10.mjs`), che registra `pushState` e `replaceState` durante «Esci» del coach, senza e con una modifica non salvata. Sul ramo: `/trainer/availability` → `pushState:/auth:true` → `replaceState:/auth:undefined`, `__TSR_index` 1, sessione chiusa, zero errori. Con la forma del prompt (`useState` + effetto) c'era in mezzo `pushState:/trainer`: vedi il §10, punto 9.

**B18 · I giri di prima**, sul ramo, copiati da `app\` così come sono (salvo `lib.mjs`, la `DIR` di `giro-prenota.mjs` e l'atteso della 04 accanto), uno dopo l'altro (`banco\b18-10.sh`):

| giro | esito sul ramo | lettura |
|---|---|---|
| `giro08.mjs` | **79 su 79** | come nel container |
| `giro07.mjs` | **138 su 147** | i nove KO di «inviti», uno per persona: il testo cambiato dalla 09 («Le sessioni fissate nell'app arrivano come invito…» al posto di «Ogni sessione arriva come invito…») |
| `giro05-cowork.mjs` | **149 su 152** | i tre KO noti: Giorgio «crediti · righe» e «crediti · fondo», Nina «crediti · fondo» («Per altri crediti scrivi al tuo coach.» al posto di «compra») |
| `giro-sessioni.mjs` | **78 su 78** | |
| `giro04.mjs` | **103 su 104** | B11, noto dalla 09 («lettura in errore: la frase con «Riprova», mai «Sessione non trovata»») |
| `giro-prenota.mjs` | **81 su 82** | l'unico KO è B8 «poi confirm_booking_attendance (entro 48 ore), e la sessione risulta confermata», visto `{"confirms":0,"confirmedAt":null}`: **è un KO voluto**, perché la prova aspetta la chiamata che la 10 toglie (§4.3, punto 1); la conferma O3 la scrive il server |

Tutti come nel container di Cowork sulla base e sul ramo simulato; nessun altro KO, quindi nessun difetto da correggere. Gli errori 400, 409 e 500 in fondo a `giro-prenota` e a `giro04` sono quelli che le prove iniettano apposta. I giri sono stati lanciati su `6783144`. `a592043` cambia solo commenti (misurato, §10, punto 10), quindi il codice che hanno provato è lo stesso. Uscite in `scratchpad\b18\`.

**B19 · Con Manrope vero** (`banco\sonda-b19-10.mjs`): passano solo le `GET` verso `fonts.googleapis.com` e `fonts.gstatic.com` (9 per giro, zero altre), tutto il resto lo blocca il finto come sempre; `document.fonts.ready`, `document.fonts.check('700 14px "Manrope"')` vero, `font-family` dei collegamenti `Manrope, …`. L'area toccabile si misura con `elementFromPoint`, un pixel alla volta, sulla verticale a 10 px dal bordo sinistro del collegamento.

| | ramo | base |
|---|---|---|
| Tipologie a 820×1180, `scrollWidth - clientWidth` | **0** | **73** |
| «Scrivi a Nicolò» (Home di Luca), alto | 18 px | 18 px |
| «Scrivi a Nicolò», toccabile in verticale | **40 px** (8,02 sopra, 14,98 sotto: 8 + 18 + 14 dalle classi; la scansione a pixel interi dà 41) | 19 px |
| «Apri in Mappe» (dettaglio di Giulia), alto | 20 px | 20 px |
| «Apri in Mappe», toccabile in verticale | **44 px** (12 sopra, 12 sotto) | 20 px |

Zero richieste bloccate e zero errori di pagina in tutte e due. Il collegamento della nota misura 18 px e non «circa 17»: è l'altezza del riquadro in linea del testo a 13 px con Manrope.


### 8 · Non fatto

Niente di quello che il §4, il §5 e il §8 chiedono. Nessun punto lasciato a metà. Restano fuori, come dice il §4.7, l'avviso al coach quando un cliente annulla, la passata 11 e il giro del server.

### 9 · Divergenze

- **`hydrated` di `src/routes/auth.tsx` (§4.4, punto 11).** Il prompt dice «uno `useState(false)` messo a `true` da un effetto». Ho misurato che così, al primo disegno di `/auth` aperta dall'app, il `<Navigate>` verso l'area del ruolo parte prima dell'uscita. Percorso misurato: `/auth` col segno → `pushState /trainer` → `replaceState /auth`, con una voce in più nella cronologia che porta ancora `esci: true`. L'uscita arrivava solo per una corsa favorevole. Ho scritto `useHydrated()` con `useSyncExternalStore(noSubscription, () => true, () => false)` (`src/routes/auth.tsx:56-72`): è falso sul server e nel disegno che idrata, quindi la pagina idratata resta uguale a quella del server, ed è vero in ogni altro disegno del browser. Dopo: `/auth` → `replaceState /auth`, una voce sola. D17 lo riconosce (`location.state.esci 1 · signOut() 1 · state: {}, replace: true 2`).
- **Lo spazio sopra il contenuto della Panoramica del telefono (§4.4, punto 2).** Il prompt dice 64 + 24. L'intestazione misura 65 px (avatar 40 + `py-3` + 1 px di bordo), quindi prima il contenuto partiva a 88 px dalla cima e ora a 89: un pixel. Clienti: 64 + 16 = 80, come prima.
- **«Apri in Mappe» e il collegamento della nota** (§4.2, punto 4): le classi del prompt, nessuna differenza. Le misure con Manrope vero sono in B19.
- Nessun nome, firma o testo del §4 cambiato.

### 10 · Cosa ho scritto diversamente

Il ramo è mio, scritto file per file sul §4. La patch di Cowork l'ho letta tutta e usata come prova da falsificare. Per i due pannelli dei tab del coach (`clients-desktop.tsx`, `client-profile-desktop.tsx`) ho preso i suoi hunk così come sono: sono quasi tutto rientro, e `git diff -w` mostra solo l'import, `TABS_ID`, `idBase` e il `div` del pannello. Rispetto al ramo simulato (la patch applicata su `1289051`), le righe di codice diverse sono:

- `src/routes/auth.tsx`: `useHydrated()` con `useSyncExternalStore` al posto di `useState` + `useEffect` (§10, punto 9).
- `src/lib/push.ts`, `sessionKey`: `padded = part + "="…` e `id !== ""` al posto di `padding` e `id.length > 0`. Fa lo stesso: R4 e R5 cadono sulle mie righe.
- `src/lib/push.test.ts`: un'asserzione in più, che la codifica del payload `{ session_id: S2, n: "??>>~~" }` contenga davvero `-` o `_`. Senza, il caso del base64url potrebbe smettere di provarlo in silenzio.
- Titoli dei test: «char_length(note) <= 1000» invece di «≤ 1000»; in session-edit «la durata si scrive dopo la tipologia» invece di «il dialog scrive…». Le parole chiave di D23 restano.
- I commenti sono miei, sugli stessi fatti. In più correggo tre teste che la patch lasciava false: `profile-path.tsx` («per i fissi ancora accesi l'avviso con «Spegni»»), `client-home-next.tsx` (il focus dopo «Conferma presenza») e `client-booking-detail-view.tsx` (lo stesso). Correggo anche il commento di `auth.tsx` sulle uscite «senza segno» e quello del campo `noshow` di `Engagement`.

**La revisione in sola lettura.** Un agente separato ha letto una fotografia di `6783144` (`git archive` e diff nello scratchpad), lo SQL del giro e auth-js e router-core installati, in circa 15 minuti. Non ha trovato difetti gravi. Quattro commenti erano imprecisi, e li correggo in un commit di soli commenti (`a592043`). Che siano solo commenti l'ho misurato: per ogni file, `transpileModule` di TypeScript con `removeComments` dà lo stesso testo su `6783144` e dopo (`scratchpad\solo-commenti.mjs`, 4 file su 4 uguali; la controprova su `86037eb..6783144` dà DIVERSO dove cambiano i titoli dei test). I quattro commenti:
- `src/lib/auth.tsx`, il `finally` di `signOut`: diceva «la sessione resta viva», che non vale se auth-js l'ha già tolta (il rinnovo del token rifiutato).
- `src/hooks/use-book-confirm.ts` (punto 2 della testa) e `src/lib/session-create.ts`: il blocco passato è una preferenza dell'ordine, non un filtro. Il trigger prende un credito della tipologia, o dello stesso `session_type`, fra i blocchi che contengono la data, prima quello passato.
- `src/components/create-client-dialog.tsx`: togliere l'autocompletamento non impedisce a Chrome di proporre il numero, che può riconoscere dal tipo e dall'etichetta.

Il resto sta fra i trovati.

### 11 · Trovati e non toccati

- **«Ripristina» di una modifica riporta un 60 esplicito alla durata della tipologia** (`src/lib/session-edit.ts:430-464`, `undoEdit`). Rimette tipologia, durata e note in un solo UPDATE. Dal giro del 02/10, `set_booking_duration_defaults` su un UPDATE che cambia tipologia rimette la durata della tipologia quando `duration_min` è 60 (l'eccezione dei 60 espliciti vale solo all'INSERT). Esempio: una sessione BIA (tipologia da 30) tenuta a 60, cambiata in PT e poi ripristinata, torna BIA da **30**. Succede anche se la durata non era cambiata, perché la riga ha già 60. La modifica in avanti non ha il difetto, perché `editSession` scrive la durata dopo la tipologia. Inoltre `tryGoogle` scrive 60 sull'evento di Google, e database e Google non coincidono più. L'archivio dei test della 10 imita il trigger, quindi un caso di prova lo mostrerebbe; quello che c'è usa PT, che dura 60. È per la passata 11, o per il giro del server (la revisione lo ha trovato in modo indipendente).
- **Una scheda ferma per due «Esci» di fila libera il telefono** (trovato anche dalla revisione). Esempio: «Esci», nuovo accesso, di nuovo «Esci», tutto mentre una seconda scheda resta congelata con la sessione del primo accesso. Il segno nomina solo l'ultima sessione uscita, quindi la scheda che si sveglia col primo SIGNED_OUT non si riconosce, e il margine dei dieci secondi è passato (`src/lib/push.ts`, `leftOnPurpose`). Il caso è raro, e liberare il telefono lì costa una riaccensione dal Profilo.
- **`src/lib/client-book.ts` e il commento di `confirmsOnBooking`**: dice il vero (la stessa soglia di «Da confermare»), ma non dice che O3 ora lo scrive il server; il file non è nel perimetro.
- `supabase/functions/booking-notifications/index.ts:8-10`: lasciato com'è, come dice il §4.5 punto 5.
- **`signOut` che fallisce lascia la sessione nello storage** (c'era già; `src/lib/auth.tsx:112-142`, la parte che il §4.1 dice di lasciare com'è). Con un errore restituito, per esempio con la rete giù, `signOut` azzera lo stato di React e la cache, e `/auth` mostra il form. La sessione di Supabase però resta nel localStorage: ricaricando si rientra, e al primo `TOKEN_REFRESHED` il `<Navigate>` riporta all'area del ruolo. Nessun messaggio. Su un dispositivo condiviso conta (trovato dalla revisione).
- **`signOut()` che lancia, in `/auth`** (`src/routes/auth.tsx`, l'effetto dell'uscita), per esempio con il lock di auth-js scaduto. Il `.finally` toglie `esci` dalla voce della cronologia, la sessione resta, il `<Navigate>` riporta a `/trainer` senza un messaggio, e la promessa rifiutata non la gestisce nessuno. La barra laterale di prima aveva lo stesso rifiuto non gestito (trovato dalla revisione).
- **«Aggiorna» del Calendario del telefono senza attesa** (`src/components/calendar-mobile.tsx`, `onRefresh`). Ora il toast arriva a riconciliazione finita, ma il pulsante non si spegne e non dice che sta lavorando: due tocchi avviano due riconciliazioni e danno due toast. Le riconciliazioni in parallelo c'erano anche prima; il desktop ha `syncing` (trovato dalla revisione).
- **L'archivio dei test e le righe di Google senza durata** (`src/lib/testing/memory-calendar-store.ts`, `applyDurations`): con `duration_min` nullo il trigger mette quella della tipologia, l'archivio la lascia nulla. Un `buffer_minutes` nullo il trigger lo ignora e l'archivio lo copia. Nessun test ci passa (trovato dalla revisione).

### 12 · Resta a Nicolò

1. Il merge della PR in `main`, dopo la verifica di Cowork.
2. Il Publish da Lovable.
3. Poi, quando vuole: sul telefono, le intestazioni della Panoramica e di Clienti restano in cima scorrendo, e una notifica toccata apre il Calendario alla sua data; sul computer, «Esci» con una modifica non salvata in Disponibilità chiede prima di uscire.

Nessun segreto e nessun deploy di funzioni: la 10 non ne tocca.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
