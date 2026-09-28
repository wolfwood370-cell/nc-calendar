# Ultimo ritorno · Redesign coach, passata 10 (Verifica finale)

## 0 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **La base.** Ramo `redesign/coach-10-verifica-finale` da `origin/main` = `d51eae6` (albero `feface6`), come atteso. Il clone era su `redesign/coach-09-integrazioni`.
   - Misure: typecheck 0 · lint 0 errori e 22 avvisi · 550 test verdi in 36 file, uguali con `TZ=UTC` · build riuscita.
   - `git diff --stat b780645 origin/main -- package.json bun.lock` vuoto; controllo positivo `4434a77..02a4d2a`: 2 file. Nessuna installazione.
   - Memoria libera all'avvio: 2,3 GB fisici, 5,2 GB impegnabili. Tutti i comandi sono girati coi worker predefiniti, senza errori di memoria.
   - Nessun commit.
1. ☑ **La ricognizione** (§5). Verdetti in «2 · I verdetti», correzioni al censimento in «9 · Divergenze». Nessun commit.
2. ☑ **Il guscio di pagina.** `f2e62f3`. C2 e C2b come attesi; typecheck 0; build riuscita.
3. ☑ **I titoli.** `b479a9e`. C1 `0`, C1b somma `10`, C3 `0` e `2`.
4. ☑ **Un componente per i gruppi segmentati e per i tab.** `b40e1a9`. C5 `0`; R3 rossa su Home e su End.
   - ⚠️ Il componente non è stato solo esteso ma riscritto senza Radix: Radix RadioGroup con Home ed End sposta il fuoco senza scegliere (`node_modules/@radix-ui/react-radio-group/dist/index.mjs:157` guarda solo le frecce) e con `orientation="horizontal"` scarta ↑ e ↓ (`react-roving-focus/dist/index.mjs:208`).
5. ☑ **Etichette, focus e contrasto.** `55831ed`. C4b, C6 `0`, C7 coi rapporti sotto.
6. ⚠️ **I due dialog fuori design.** `8fe8113`. C4 dà `1` e `1`, non `0`: sono i gusci del Profilo del telefono, che apre gli stessi due dialog (`client-profile-mobile.tsx:1180` e `:1221`) e resta com'era. Il desktop passa da `CoachDialog` (prop `desktop`).
7. ☑ **I testi.** `4059fe0` e, separato, `4f25dac` (lato cliente). C8 sotto.
   - ⚠️ `UNDO_TOAST_DURATION` era già esportata (`src/lib/toast.ts:11` sulla base): ho solo allargato il suo commento.
8. ☑ **I dati**, un commit per punto, typecheck verde su ognuno: V6 `3c519f4`, V5 `b947fa9`, V7 `3447ace`, V8 `476ca9e`. C9, C10, C11; R1 e R2 rosse.
   - ⚠️ V7 (a): il fuori disponibilità per gli impegni personali non l'ho aggiunto. Il prototipo lo mostra solo per le sessioni coi clienti (`designs/Coach Calendario.dc.html:571`, `if (!warn && !inside && isClient)`), e il testo parla ai clienti.
   - ⚠️ V8: l'«oggi» del Calendario non era fermo. `todayKey` viene da `now` (`calendar-desktop.tsx`), la griglia riceve `now` (`calendar-grid.tsx:76`), e senza `date` nell'URL l'ancora è `startOfDay(now)` (`calendar-search.ts:65`). Non c'era niente da cambiare lì.
9. ☑ **I flussi e il browser** (§8). Sette pagine: 87 controlli su 87. Sei flussi percorsi: 29 controlli su 30, e il KO non è di questa passata (§6). Nessun commit: il banco è fuori dal repo.
10. ☑ **Chiusura.** `5d0e03a` CHECKLIST; push; PR [wolfwood370-cell/nc-calendar#76](https://github.com/wolfwood370-cell/nc-calendar/pull/76), aperta e non unita; questo file per ultimo.
11. ☑ **Passo aggiunto: i 28px della BIA** (§4.3 punto 6, che nel piano non aveva un passo). `e74e4b6`.
12. ☑ **Passo aggiunto: il test della catena di `reviewEventId`** (§4.6). `38d67e9`.

28/09/2026. Brief `design_handoff_coach_redesign/passes/10-verifica-finale.md`, audit `designs/Audit Coach Desktop.dc.html#verifica`. Agenti: 0. Workflow: 0 (la parola che ha acceso l'invito del sistema era «Ultracode: non serve»).

## 1 · Ramo e commit

- **Ramo:** `redesign/coach-10-verifica-finale`, pubblicato con `git push -u origin redesign/coach-10-verifica-finale`.
- **Commit, in ordine:**
  1. `f2e62f3` guscio di pagina;
  2. `b479a9e` titoli;
  3. `b40e1a9` gruppi segmentati e tab;
  4. `55831ed` accessibilità;
  5. `8fe8113` i due dialog;
  6. `e74e4b6` 28px della BIA;
  7. `4059fe0` testi coach;
  8. `4f25dac` singolari lato cliente (si toglie da solo);
  9. `3c519f4` V6;
  10. `b947fa9` V5;
  11. `3447ace` V7;
  12. `476ca9e` V8;
  13. `38d67e9` test di `reviewEventId`;
  14. `5d0e03a` CHECKLIST;
  15. questo file, per ultimo.
- **Commit finale del codice:** `38d67e9`. Il commit finale del ramo è quello di questo file.
- **PR:** [wolfwood370-cell/nc-calendar#76](https://github.com/wolfwood370-cell/nc-calendar/pull/76), «Redesign coach · passata 10 · Verifica finale», verso `main`. Aperta con `gh pr create`, non in bozza, **non** unita. Il repo non ha CI.
- File aggiunti per nome, mai `git add -A`. Il commit V8 l'ho corretto con `--amend` prima del push: il test conteneva il testo che C11 cerca, e C11 dava `2`.

## 2 · I verdetti

- **V1 · chiuso prima, e chiuso qui il resto del perimetro.** 228 call-site in 42 file (fuori da `toast.ts`); 20 passano da `toastWithUndo`, 0 label «Annulla». I toast con azione propria sono 4. Quello del desktop, «Collega senza credito» (`client-profile-desktop.tsx:403`), ora dura `UNDO_TOAST_DURATION`. Gli altri 3 sono del lato cliente (`client-sessions-breakdown.tsx:126`, `use-book-confirm.ts:155`, `:290`) e restano a 4 s: aperti, revisione 31/10/2026.
- **V2 · chiuso qui.** I 3 accordi riscritti a mano passano dagli helper. I 2 singolari del lato cliente sono corretti in `4f25dac`. Call-site degli helper fuori da `credits.ts`: da 4 a 9.
- **V3 · chiuso prima.** Stringhe identiche (`overview-desktop.tsx:546`, `calendar-details-panel.tsx:164`) e stessa logica (`session-outcome.ts`). L'asimmetria del gesto gemello è aperta, revisione 31/10/2026: in Panoramica «Assente» è un'icona solo per le sessioni `urgent`, in Calendario un pulsante per ogni sessione di oggi o passata.
- **V4 · chiuso qui per il desktop.** Erano 16 su 18, ora 18 su 18: «Imposta crediti» (col blocco come sottotitolo) e «Aggiungi misurazione». Il telefono tiene «Crediti — Blocco N» e «Nuova misurazione BIA».
- **V5 · chiuso qui.** Una regola sola (`attendanceCoachId`, `profilePresence`). Nei dati veri oggi non cambia nessun numero, perché il coach è uno solo: il verde di C9 è l'unica prova.
- **V6 · chiuso qui.** Una regola per intento, e la superficie dice quale blocco mostra. Resta aperto il debito degli extra dei clienti con percorso, revisione 02/10/2026. Assegna evento ora scrive «N del blocco + M extra».
- **V7 · chiuso qui per il Profilo.** Stessi avvisi, stesse parole, stessa regola del Calendario; la sovrapposizione ferma il salvataggio come nel Calendario. Il punto (a), gli impegni personali, è voluto dal prototipo: vedi Divergenze.
- **V8 · chiuso qui.** Un `useNow` solo (`src/hooks/use-now.ts`), letto da Panoramica, Calendario, Clienti e Profilo. Il fuso resta aperto, revisione 31/10/2026.
- **V9 · chiuso qui.** Guscio 7 su 7, titoli di card 17 su 17 dal token, H1 7 su 7 da `PageTitle`. Misurati nel browser (§6).
- **V10 · chiuso qui.** Tab di pagina 36px (2 su 2) e segmentati 32px (gli 11 punti), tutti dal componente. BIA 28px dichiarata (`h-7`).
- **V11 · chiuso prima.** 460px da `coach-dialog.tsx:99` su 8 call-site su 8. Non toccato.
- **V12 · chiuso qui.** Il cestino di «Imposta crediti» e le due CountPill hanno il nome. Quattro coppie sotto 4.5:1 portate sopra, più la stessa coppia nei conteggi dei tab. Focus: 21 righe → 0. Il token `outline` sotto 4.5 anche sul bianco resta aperto, revisione 31/10/2026.
- **O3 · chiuso qui per i 14 gruppi segmentati e tab.** Aperto per i 12 gruppi di scelta dei dialog fatti con Radix (schede e chip, non segmentati): lì Home ed End spostano il fuoco senza scegliere. Sono in `assign-event-dialog` ×3, `event-type-dialog` ×2, `integrations-import-dialog`, `package-dialog` ×2, `profile-session-dialog`, `session-cancel-dialog` e `session-form-dialog` ×2. Revisione 31/10/2026.

### La ricognizione, per insiemi

- **Guscio (§4.3.1):** i sei call-site confermati (`overview-desktop.tsx:233`, `calendar-desktop.tsx:546`, `clients-desktop.tsx:184`, `event-types-desktop.tsx:159`, `integrations-desktop.tsx:324`, `availability-desktop.tsx:205`). Il Profilo aveva `flex flex-col gap-5` più `pb-24` solo con modifiche non salvate (24 + 96 = 120 soltanto allora).
- **Titoli di card:** 17 nel perimetro, 7 da `card-title` e 10 no, come censito. Ci sono altri 9 titoli con un ruolo diverso, che non ho misurato contro il prototipo:
  - `calendar-toolbar.tsx:152` (periodo);
  - `calendar-details-panel.tsx:103`;
  - `calendar-context-panel.tsx:62`;
  - `clients-desktop.tsx:307` («Inviti in attesa», 15px);
  - `profile-sessions.tsx:62` (16px);
  - `event-type-service-card.tsx:92` (18px);
  - `availability-preview-card.tsx:57` (15px);
  - `integrations-gcal-lists.tsx:79` (13px);
  - `focus-client-panel.tsx:80`.
- **Gruppi e tab:** 14 (8 `SegmentedControl`, 5 a mano, 1 Radix a mano). Prima rispondevano alle frecce orizzontali in 9; Home ed End non sceglievano in nessuno. Ora tutti e 14 passano dal componente e rispondono a frecce, Home ed End.
- **Toast, crediti, dialog, contrasto:** confermati coi numeri del prompt; le differenze sono in «Divergenze».

## 3 · Manifesto

**NUOVI (11)**
- `src/components/coach-page.tsx`: il guscio.
- `src/components/schedule-warning.tsx`: il riquadro dell'avviso di data e ora.
- `src/hooks/use-now.ts`: l'ora.
- `src/lib/segment-keys.ts`: la tastiera dei gruppi.
- Test:
  - `src/components/segmented-control.test.ts`;
  - `src/lib/contrast.test.ts`;
  - `src/lib/reference-block.test.ts` (C10);
  - `src/lib/attendance-scope.test.ts` (C9);
  - `src/lib/profile-schedule.test.ts` (V7);
  - `src/lib/clock.test.ts` (C11);
  - `src/lib/review-event.test.ts`.

**TOLTI (1)**
- `src/components/ui/tabs.tsx`: nessuno lo importava.

**MODIFICATI (49)**
- Pagine e pezzi del desktop:
  - `overview-desktop`, `calendar-desktop`, `calendar-details-panel`;
  - `clients-desktop`, `client-profile-desktop`;
  - `profile-overview`, `profile-path`, `profile-sessions`, `profile-ui`, `profile-notes-card`, `profile-session-dialog`;
  - `event-types-desktop`;
  - `availability-desktop`, `availability-exceptions-desktop`, `availability-preview-card`, `availability-week-card`;
  - `integrations-desktop`, `integrations-gcal-card`, `integrations-full-sync-card`, `integrations-import-dialog`.
- Dialog e componenti condivisi:
  - `assign-event-dialog`, `package-dialog`, `new-client-dialog`, `session-form-dialog`, `block-credits-dialog`, `coach-dialog` (solo `focus:outline-none` del pannello);
  - `segmented-control`, `trainer-bia-panel`, `bia-sparkline`, `trainer-notifications-bell` (solo il badge del desktop), `trainer-client-search`;
  - `ui/dropdown-menu`, `ui/popover`, `ui/select` (solo la riga di `outline-none`).
- Lato cliente, commit a parte: `owned-booster-card.tsx`, `routes/client.index.tsx` (una riga ciascuno).
- Route: `routes/trainer.clients.index.tsx` (la query della presenza e l'ora; nessuna riga con `className`).
- Lib:
  - `assign-event`, `attendance`, `calendar-time`, `client-list`, `client-profile`;
  - `credits` (+ test), `current-block`, `package-actions`, `profile-session`;
  - `renewal` (+ test), `toast`.
- `design_handoff_coach_redesign/CHECKLIST.md` e questo file.

**NEL PERIMETRO MA NON TOCCATI:** `page-title.tsx`, `session-outcome.ts`, `credit-order.ts` (il fuso), `styles.css` (nessun token cambiato), `trainer-sidebar.tsx`, `trainer-header.tsx`, `routes/trainer.tsx`, `event-type-card.tsx`, `calendar-grid.tsx` e `calendar-search.ts`.

**Condivisi col telefono, toccati nella logica o in una riga dichiarata:**
- `event-type-dialog` e `new-client-dialog` usano il `SegmentedControl` nuovo: stesse classi, tastiera nuova.
- `block-credits-dialog` e `trainer-bia-panel`: il ramo del telefono ha le stesse classi della base, verificato per insieme di classi. In più: nome al cestino e `aria-hidden` alle icone.
- `bia-sparkline`: `h-7` (da circa 28,5 a 28px) e i colori della variazione, anche nella BIA del cliente.
- `ui/*`: l'anello di focus solo da tastiera.

## 4 · Acceptance

Sulla base `d51eae6`: typecheck 0 · lint 0 errori e 22 avvisi · 550 test in 36 file · build riuscita.

Sul codice finale `38d67e9`: typecheck `exit 0` · lint `✖ 22 problems (0 errors, 22 warnings)` · `Test Files 43 passed (43)`, `Tests 623 passed (623)`, uguali con `TZ=UTC` · build `exit 0`.

```
$ C1
0
$ C1b
src/components/overview-desktop.tsx:4
src/components/integrations-gcal-card.tsx:1
src/components/integrations-full-sync-card.tsx:1
src/components/integrations-desktop.tsx:1
src/components/availability-desktop.tsx:1
src/components/availability-exceptions-desktop.tsx:1
src/components/availability-preview-card.tsx:1
$ C2   (-m-6 nel Profilo · CoachPage nel Profilo)
0
5
$ C2b
overview-desktop: -m-6 min-h 0 · <CoachPage 1
calendar-desktop: -m-6 min-h 0 · <CoachPage 1
clients-desktop: -m-6 min-h 0 · <CoachPage 1
event-types-desktop: -m-6 min-h 0 · <CoachPage 1
integrations-desktop: -m-6 min-h 0 · <CoachPage 1
availability-desktop: -m-6 min-h 0 · <CoachPage 1
client-profile-desktop: -m-6 min-h 0 · <CoachPage 2   (pagina e stato di caricamento)
$ C3
0
2
$ C4   (i gusci del telefono, vedi il passo 6)
1
1
$ C4b
231:            <Button size="icon" variant="ghost" aria-label={REMOVE} onClick={() => removeRow(r.id)}>
$ C5
0
$ C5 a parte: package-dialog.tsx:403 non esiste più; restano due gruppi Radix che non sono segmentati
363-          aria-label="Tipologia di sessione"
464-          aria-label="Cosa fare del pacchetto"
$ C6
0
$ C8   (composizioni a mano di «credito/crediti» con un numero nei cinque file)
1   → assign-event-dialog.tsx:182, «non ha crediti {tipologia}»: nessun numero, nessun accordo
$ C8   (call-site degli helper fuori da credits.ts e dai test; erano 4)
9
$ C11
1
```

- **C7, il contrasto:** rapporti calcolati con WCAG 2.1 sui token di `src/styles.css`; li rifà `contrast.test.ts` leggendo le classi dai sorgenti.
  - `profile-ui.tsx:13` chip «muted»: 4,03 → **8,46** (`text-on-surface-variant`).
  - `overview-desktop.tsx` CountPill a 0: 3,85 → **8,07**.
  - `trainer-notifications-bell.tsx:94` badge del desktop: 4,23 → **6,46** (`bg-error`).
  - `bia-sparkline.tsx:126`: in su 3,77 → **5,48** (`text-success-text`); in giù 4,83 → **6,47** (`text-danger-text`).
  - Conteggi nei tab di Clienti e nel filtro delle Sessioni, stessa coppia della CountPill: 3,85 → **8,07**.
- **C9** `attendance-scope.test.ts`: con un'assenza di un altro coach, 100% in Clienti e nel Profilo per il coach, 75% in tutte e due per l'admin.
- **C10** `reference-block.test.ts`: buco fra il blocco 2 (finito ieri) e il 3 (dal 5 ott).
  - Panoramica, Clienti, Profilo e Pacchetto mostrano il blocco 3 e dicono «dal 5 ott 2026».
  - Pannello e Assegna mostrano il blocco della data della sessione, e nessuno per una sessione nel buco.
- **C11** `clock.test.ts`: una definizione. Le quattro pagine leggono `useNow`, e `now` è fra le dipendenze del memo della lista (sull'albero di TypeScript). La prossima sessione cambia quando l'orologio supera le 11:00.

## 5 · Le prove rosse

Uno script fuori dal repo rompe, lancia, rimette il file in un `finally` e rilancia. Dopo ogni prova `git status` era pulito.

- **R1** · profilePresence senza filtro (`attendance.ts`): `Tests 2 failed | 3 passed (5)`, «il coach conta solo le sue sessioni, in tutte e due». Verde: `5 passed (5)`.
- **R2** · `findCurrentBlock` nella scheda Clienti (`client-list.ts`): `Tests 1 failed | 8 passed (9)`, «Clienti: la scheda coi crediti del blocco 3». Verde: `9 passed (9)`.
- **R3** · tolto `onKeyDown` dal componente: `Tests 8 failed | 13 passed (21)`, rosse fra le altre «Home va al primo e lo sceglie» e «End va all'ultimo e lo sceglie». Verde: `21 passed (21)`.
- **R4** · chip «muted» di nuovo `text-outline`: `Tests 1 failed | 6 passed (7)`, il calcolo torna a 4,03. Verde: `7 passed (7)`.
- **R5** · `checkAvailability: false` nel Profilo: `Tests 3 failed | 5 passed (8)`, «fuori dalla disponibilità: l'avviso…». Verde: `8 passed (8)`.
- **R6** · `text-xl font-semibold` di nuovo su «Oggi»: C1 = 1 (`overview-desktop.tsx:241`). Rimesso: C1 = 0.

## 6 · Il browser e i sei flussi

Banco fuori dal repo (quello della 09, esteso), nella cartella di lavoro di questa sessione:
- Vite con Supabase su un host finto, PostgREST in memoria;
- il modulo di Google sostituito da un finto;
- ora fissa venerdì 25/09/2026 10:40;
- Playwright della cache npx e headless shell 1200.

Zero richieste esterne, zero funzioni server, zero tabelle finte mancanti.

- **Sette pagine a 1920 e a 1440: 87 controlli su 87.** Su ogni pagina:
  - guscio 28/40/48 (120 per Disponibilità e Profilo);
  - H1 Sora 36/700 con interlinea 41,4px;
  - titoli di card Manrope 20/600;
  - tab 36 e segmentati 32;
  - niente scorrimento orizzontale;
  - console pulita.
- **Flussi: 29 controlli su 30, tutti e sei percorsi.**
  1. **Notifica → Calendario → check-in → Ripristina: ✓.** L'URL porta `date=2026-09-25&event=…`, il pannello mostra Gino, il check-in segna la sessione svolta e «Ripristina» la rimette in programma.
  2. **Panoramica → Rinnova → fuori da «In scadenza»: ✓.**
     - La riga diceva «2 crediti rimasti · Blocco 2, dal 5 ott 2026».
     - La nota del rinnovo: «I 2 crediti del blocco 2, che inizia il 5 ott 2026, restano validi fino alla sua fine».
     - Dopo il rinnovo Marta esce dalla Panoramica, il tab «In scadenza» dei Clienti va a 0 e il Profilo dice «Gestisci pacchetto».
  3. **Calendario → spazio vuoto → sovrapposizione → crea → Profilo: ✓.**
     - Il clic sulla griglia apre «Nuova sessione».
     - Alle 10 compare «Si sovrappone a Marta Conti (10:00–11:00)…» e «Crea sessione» è spento.
     - Alle 15 la sessione si crea e compare in Profilo › Prossime sessioni.
     - L'ho fatta con Gino: Marta il 28/09 è nel buco fra due blocchi e non ha credito.
  4. **Profilo → Percorso → sposta una settimana → «Salva ed esci»: ✓.** Settimana 4 al 5/10, «Spostata · da salvare», barra; uscendo il dialog offre «Salva ed esci» e salva `weekly_schedule`. La prima corsa si era fermata su «Imposta una data di inizio percorso»: mancava nel mio seme.
  5. **Disponibilità → eccezione di 3 giorni → avviso → Calendario tratteggiato: ✓.** L'avviso «1 sessione già prenotata in questo periodo» sta nel modulo, prima di aggiungere. Poi tre righe (30/9-2/10) e i tre giorni tratteggiati per intero (720 px su 720) con «Disponibilità» accesa.
  6. **Tipologie → non prenotabile → il cliente non la prenota: ✓.** L'interruttore scrive `client_bookable = false`. Entrando come Sara, «Prenota» mostra «Prenotazione non disponibile dall'app».
     - ⚠️ L'unico KO del giro: in quella pagina Radix scrive due volte in console «`DialogContent` requires a `DialogTitle`». Viene da `pwa-onboarding.tsx:80` (lato cliente, non toccato da questa passata).
- **Che l'archivio finto non copre:** Google vero (creazione dell'evento), le email e le notifiche push, e un secondo coach nei dati veri (V5).

## 7 · Il mobile

```
$ git diff --stat origin/main..HEAD -- 'src/components/*-mobile.tsx' src/components/mobile-calendar-agenda.tsx src/components/trainer-bottom-nav.tsx src/components/client-bottom-nav.tsx
(vuoto)
$ git diff origin/main..HEAD -- <gli stessi file> | grep -cE '^[+-][^+-].*className'
0
$ git diff origin/main..HEAD -- src/routes | grep -E '^[+-][^+-].*className' | wc -l
0
```

Due route toccate: `client.index.tsx` (un testo) e `trainer.clients.index.tsx` (query e ora). Per i componenti condivisi che il telefono mostra, vedi il Manifesto. Impronte del telefono non rifatte, come chiede il §8.

## 8 · Non fatto

- **Il fuori disponibilità per gli impegni personali** (V7 a): è il comportamento del prototipo.
- **Il `tabpanel` coi suoi `aria-controls` per i tab del Profilo e dei Clienti:** non chiesto dal brief. Metterlo sposta il layout (un contenitore in più nel flex del Profilo).
- **I 12 gruppi di scelta Radix** (O3), **il token `outline` sotto 4.5**, **`warning-text` su `surface-container` (4,46, il conteggio «In scadenza» sul tab non scelto)** e **il testo bianco sui colori delle metriche della BIA** (Massa magra #039be5 3,08, Grasso #ea580c 3,56). Sono decisioni di design o riscritture larghe, nominate con la revisione del 31/10/2026.
- **`defaultStartTime(new Date())` in `calendar-desktop.tsx:222`:** resta, è l'ora del clic dentro l'effetto che apre «Nuova sessione». Metterci `now` farebbe ripartire l'effetto ogni 30 secondi.
- **Il lampo di «Assegna percorso» nel dialog Pacchetto** mentre i blocchi si caricano (`package-dialog.tsx:225`, la scelta ripiega su `path` finché `renewable` è falso). È di prima, l'ho visto nel giro; revisione 31/10/2026.
- **Il censimento di Cowork di pulsanti solo icona (16 su 17) e badge (4 su 6):** non l'ho rimisurato per intero. Ho misurato e chiuso i due aperti.

## 9 · Divergenze

- **§4.4.1:** «9 gruppi su 14 rispondono» vale per le frecce orizzontali. Con Home ed End Radix sposta il fuoco senza scegliere (`react-radio-group` guarda solo le frecce per scegliere), e ↑ ↓ con `orientation="horizontal"` si perdono. Il componente è stato riscritto, non solo esteso.
- **§4.1.1:** `UNDO_TOAST_DURATION` era già esportata (`toast.ts:11`).
- **§4.1.4 e C4:** i due dialog si aprono anche dal Profilo del telefono (`client-profile-mobile.tsx:1180`, `:1221`). Per tenere il telefono invariato ha il guscio nuovo solo il desktop, e C4 dà `1` e `1`.
- **§4.2.4 (a):** l'avviso agli impegni personali contraddice il prototipo (`Coach Calendario.dc.html:571`).
- **§4.2.5:** l'«oggi» del Calendario non era fermo su `anchorKey` (vedi il passo 8).
  - C'era invece un quarto orologio che il censimento non aveva: `client-profile-desktop.tsx:133`, `new Date()` a ogni render. Ora è `useNow`.
  - C'era anche `new Date()` negli inviti in attesa di `trainer.clients.index.tsx`.
- **§4.2.2, trovato misurando:** fra due blocchi il Profilo diceva «Il percorso inizia il …» e segnava tutti i blocchi come futuri (`client-profile.ts`, `packageSummary`). Corretto in V6: «Il blocco 3 inizia il …», coi blocchi passati segnati come passati.
- **§4.2.2, dialog Pacchetto:** con `resolveCurrentBlock` il testo di prima («restano validi fino alla fine del blocco in corso») sarebbe stato falso fra due blocchi e a percorso finito. `renewNote` ora dice quale blocco e, a percorso finito, che il residuo non passa al nuovo. `getCurrentBlockCredits`, rimasta senza chiamanti, è uscita.
- **§4.4.4:** `text-outline` sta sotto 4.5 anche sul bianco (4,47) e sul fondo pagina (4,25); le righe `text-outline` fuori dal telefono e dal lato cliente sono 154. Le quattro coppie sono casi di un problema del token. La stessa coppia della CountPill era anche nei conteggi dei tab di Clienti e del filtro Sessioni: corretti.
- **§4.4.4, badge:** il README indica `--color-error-bright` per il badge notifiche; il prompt chiede `bg-error` per il contrasto. Ho seguito il prompt, solo sul badge del desktop (quello del telefono è `trainer-notifications-bell.tsx:65`, invariato).
- **§4.3.1:** il Profilo ha la barra solo con modifiche non salvate. Prima aveva 120 in basso solo allora (24 + 96); ora 120 sempre, come Disponibilità.
- **§4.3.4:** interlinea dell'H1 del Profilo 1,15 (41,4px) invece dell'1,1 del prototipo: circa 1,8px su una riga.
- **Il prompt dice «Radix con `orientation="horizontal"`»** per tutti i gruppi: i gruppi di scelta dei dialog in parte non hanno `orientation` (frecce in tutte e due le direzioni). Non cambia il verdetto su Home ed End.

## 10 · Resta a Nicolò

- **Il merge della PR #76.** Il commit `4f25dac` (lato cliente) si può togliere da solo.
- **Le prove coi dati veri:**
  - V5 con un secondo coach, o come admin;
  - la creazione della sessione con Google vero (flusso 3);
  - il rinnovo sul database vero (flusso 2).
- **Le decisioni alla revisione del 31/10/2026:**
  - il token `outline` e le due coppie della BIA e del tab «In scadenza»;
  - i 12 gruppi di scelta Radix;
  - il gesto gemello di V3;
  - il fuso;
  - i 3 toast con azione del lato cliente;
  - il lampo del dialog Pacchetto.
- **Alla revisione del 02/10/2026:** gli extra dei clienti con percorso.
