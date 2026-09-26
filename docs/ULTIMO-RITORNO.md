# Ultimo ritorno · Redesign coach, passata 03 (Panoramica)

26/09/2026 · brief `design_handoff_coach_redesign/passes/03-panoramica.md` · audit P1–P7, O4 · regola «in scadenza» del 25/09.

## Ramo e hash

- **Ramo pubblicato:** `redesign/coach-03-panoramica`. È riuscito il primo push proposto, `git push origin HEAD:redesign/coach-03-panoramica`; il secondo non è servito.
- **Ramo della sessione al primo comando** (`git branch --show-current`): `redesign/coach-02-dialog-condivisi`, cioè il ramo della passata 02, fatta in questa stessa sessione e già unita. Il ramo della 03 l'ho creato da `origin/main` prima di ogni modifica.
- **Base misurata:** `git rev-parse origin/main` = `3fe4651cb1c161c932758435b18e984065bd846a`, come atteso. `HEAD` coincideva con `origin/main` prima del primo commit.
- **Commit, in ordine:**
  1. `cbd3e9d` «In scadenza» con la regola del 25/09 in `getRenewalInfo`;
  2. `abbb183` giornata del coach e cambi di stato di check-in e assenza;
  3. `58c6af2` distribuzione servizi ed elenco degli eventi da assegnare;
  4. `5e18432` Panoramica desktop;
  5. `3ce8501` Clienti e Profilo su `getRenewalInfo`;
  6. `f2397ac` CHECKLIST;
  7. questo file, in un commit a parte, per ultimo.
- **Come ho committato:** ogni file aggiunto per nome, mai con `git add -A` o `git add .`. `bun.lock` l'ho rimesso com'era (`git checkout -- bun.lock`) prima di ogni commit. Ho verificato il typecheck commit per commit, in una copia di lavoro separata: `tsc` esce con 0 su tutti e cinque i commit di codice.

## PR

https://github.com/wolfwood370-cell/nc-calendar/pull/69 (numero 69): verso `main`, aperta, non in bozza, **non** unita.

`gh` non c'è nella VM (`which gh` non trova nulla). Ho aperto la PR con lo strumento GitHub della sessione, con lo stesso titolo e la stessa base.

## Manifesto

**NUOVI (7)**

- `src/components/overview-desktop.tsx`: la Panoramica desktop, montata al posto del blocco `hidden md:block`.
- `src/lib/today-agenda.ts` + test: sessioni di oggi, stato della riga, sottotitolo, saluto, prossima sessione per il giorno vuoto.
- `src/lib/session-outcome.ts` + test: check-in, assenza e i loro annullamenti. È una scrittura sola, condizionata allo stato di partenza.
- `src/lib/service-distribution.ts` + test: la distribuzione servizi.

**MODIFICATI (10)**

- `src/lib/renewal.ts` + test: la regola del 25/09 e `listRenewals`.
- `src/lib/to-assign.ts` + test: aggiunto `listToAssign`.
- `src/lib/queries.ts`, solo aggiunte:
  - `auto_renew_blocks` nella query di `useCoachClients` (:123) e in `ProfileRow`;
  - `BOOKINGS_FETCH_LIMIT` esportato (:235).
- `src/routes/trainer.index.tsx`: tolti il blocco desktop e le derivazioni usate solo lì; al loro posto `<OverviewDesktop />`.
- `src/routes/trainer.clients.index.tsx`: lo stato `expiring` viene da `getRenewalInfo` (:597). Alla query dei blocchi si aggiunge `status`.
- `src/routes/trainer.clients.$id.tsx`: «In scadenza» viene da `getRenewalInfo` (:847). Alla query del profilo si aggiungono `status` e `path_type`, a quella dei blocchi `start_date` e `status`.
- `design_handoff_coach_redesign/CHECKLIST.md`: la 03 passa a `[x]`.
- `docs/ULTIMO-RITORNO.md`: questo file.

**NON TOCCATI**

- `git diff origin/main..HEAD --stat -- supabase/ bun.lock package.json src/integrations/supabase/types.ts .github` è vuoto: niente database, niente lock, niente tipi generati, niente CI.
- **Mobile di `trainer.index.tsx`.** Su `3fe4651` il blocco va dalla riga 233 alla 429. I blocchi di `git diff -U0 origin/main..HEAD -- src/routes/trainer.index.tsx` sono:

  ```
  @@ -1,4 +1,2 @@   @@ -12 +9,0 @@   @@ -15,6 +12,2 @@   @@ -26 +18,0 @@   @@ -29,10 +21 @@
  @@ -60,2 +42,0 @@  @@ -65,4 +45,0 @@  @@ -81 +57,0 @@   @@ -99 +75,2 @@   @@ -116,46 +92,0 @@
  @@ -168,6 +98,0 @@ @@ -193,38 +117,0 @@ @@ -431,282 +318,2 @@
  ```

  Tutti finiscono entro la riga 230 della base, oppure partono dalla 431. In più ho confrontato il testo del `<div className="block md:hidden …">` fra base e ramo: è identico, 191 righe.
- `todayItems` (col suo `slice(0, 5)`), `nextBooking`, `todayMobileLabel`, `trainer-header.tsx`, `trainer-bottom-nav.tsx` e `src/routes/client.*`: non toccati.

## Ambiente

- **Dipendenze:** installate da `bun.lock`. Ho riscritto in locale gli indirizzi del registro di Lovable verso `registry.npmjs.org`, poi `bun install --frozen-lockfile` (Bun 1.3.11) ha dato «Checked 724 installs across 846 packages (no changes)». Poi ho rimesso `bun.lock` com'era.
  - Bun ha funzionato, quindi niente ripiego su npm e niente `package-lock.json`. Le versioni sono quelle di `bun.lock`.
- **Browser:** la Chromium di Playwright preinstallata nella VM (`/opt/pw-browsers`). Nessun download.

## Controlli

Base (`3fe4651`, albero non toccato) e fine (`3ce8501`, ultimo commit di codice), nello stesso ambiente e con gli stessi comandi.

| | Base | Fine |
|---|---|---|
| build (`npm run build`) | esce con 0: `✓ built in 11.20s`, `3.76s`, `12.58s` | esce con 0: `✓ built in 10.10s`, `3.16s`, `12.65s` |
| typecheck (`npx tsc --noEmit`) | 0 errori | 0 errori |
| lint (`npx eslint .`) | `✖ 24 problems (0 errors, 24 warnings)` | `✖ 24 problems (0 errors, 24 warnings)` |
| test (`npx vitest run`) | `Tests  183 passed (183)`, 13 file | `Tests  223 passed (223)`, 16 file |

La base coincide con quella misurata da Cowork. I 40 test in più:

- `renewal`: da 18 a 30;
- `to-assign`: da 7 a 10;
- `today-agenda`: 15 (nuovo);
- `session-outcome`: 6 (nuovo);
- `service-distribution`: 4 (nuovo).

## Ricognizione del §4

**1. Query della Panoramica** (`src/lib/queries.ts`)

- `useCoachClients` (:114). Legge `profiles` del coach con `deleted_at` vuoto (:126), archiviati compresi.
  - Campi: id, nome, email, telefono, coach, `status`, `path_type`, `pack_label`. Ora anche `auto_renew_blocks` (:123), che prima mancava.
- `useCoachBookings` (:261) → `selectBookingsByCoach` (:237).
  - Tutte le sessioni del coach, in ogni stato, con `deleted_at` vuoto (:243).
  - Nessuna finestra di date: le più recenti per `scheduled_at` (:244), al più `BOOKINGS_FETCH_LIMIT` = 1000 (:235). Le future vengono per prime.
- `useCoachBlocks` (:308) → `loadBlocks` (:282).
  - Tutti i blocchi non eliminati (:286), futuri compresi, con `status` e `sequence_order` (:285), più le loro allocazioni.
  - `BlockRow.status` è `"active" | "completed"` (:86). L'enum del database ha anche `cancelled`, ma nessuna migrazione e nessun file del front-end lo scrive sui blocchi. `getRenewalInfo` lo scarta comunque.

**2. Badge «Da assegnare» della sidebar**

- `src/components/trainer-sidebar.tsx:61-62`: `countToAssign(useCoachBookings(user.id).data)`, sullo stesso insieme di sessioni della Panoramica.
- Il criterio è `isToAssign` (`src/lib/to-assign.ts:14`): niente cliente, non impegno personale, non `cancelled`. Quindi valgono anche gli eventi passati e quelli segnati svolti.
- La card ora usa `listToAssign` (`to-assign.ts:26`): stesso filtro, ordinato per data, senza tagli.

**3. Parametri del Calendario** (`src/routes/trainer.calendar.tsx`)

- `validateSearch` accetta `date` (YYYY-MM-DD) ed `event` (UUID) (:45-46). Oggi si legge solo `date` (:33): apre la settimana che la contiene (:103). Non c'è una vista giorno.
- «Apri nel calendario →» porta a `?date=<oggi>`. Il link del giorno vuoto porta a `?date=<giorno>&event=<id>`: il Calendario apre la settimana della sessione, e la selezione della sessione arriva con la passata 04, che legge `event`.

**4. Toast e scrittura degli stati**

- Il toast con «Ripristina» è quello della 02: `toastWithUndo` (`src/lib/toast.ts:13`), 8 secondi (:11).
- Non esisteva una scrittura unica dei cambi di stato:
  - `src/lib/attendance.ts:31` legge soltanto;
  - `src/hooks/use-confirm-attendance.ts` è la conferma del cliente, con un'altra RPC;
  - `saveBookingEdit` del Profilo (`trainer.clients.$id.tsx:549`) scrive lo stato insieme a data e tipologia, senza condizioni (:556).
- Ho riusato la scrittura condizionata della 02, `supabaseSessionStore.updateSession` (`src/lib/session-store.ts:138`): scrive solo se lo stato è ancora quello atteso e `deleted_at` è vuoto. `session-outcome.ts` la usa per i tre passaggi.

**5. Trigger su `bookings` e invii al cliente**

I trigger di UPDATE su `bookings` sono sei, nessuno tocca crediti, allocazioni o extra:

| Trigger | Migrazione | Cosa fa |
|---|---|---|
| `trg_bookings_updated_at` | `20260509204116_…sql:75` | solo `updated_at` |
| `a_trg_set_booking_duration_defaults` | `20260522204517_…sql:78` | solo su `UPDATE OF scheduled_at, duration_min, buffer_min, event_type_id` |
| `z_trg_validate_client_booking_update` | `20260522204517_…sql:474`, funzione in `20260607191854_…sql:1-43` | blocca il cliente, lascia passare il coach |
| `zz_trg_revalidate_client_reschedule` | `20260606120000_audit_round2_db_fixes.sql:412` | solo se cambia `scheduled_at` |
| `bookings_prevent_client_restricted_updates` | `20260607173132_…sql:56`, funzione in `20260608090603_…sql` | salta per il coach proprietario |
| `trg_bookings_reset_confirmation` | `20260703152358_…sql:200`, funzione :186-197 | azzera la conferma solo se cambia `scheduled_at` |

Quindi «Annulla check-in», «Annulla assenza» e «Ripristina» li ho fatti, e lato client il credito resta impegnato nei tre stati (`holdsCredit`, `cancel-session.ts:64`).

Il passaggio a `completed` o `no_show` non fa partire niente verso il cliente:

- nessuna migrazione inserisce in `notifications` o chiama `net.http_post`;
- `supabase/functions/booking-notifications` parte solo per `booking.created` e `booking.rescheduled`, chiamata dal front-end del cliente (`index.ts:1-10`).

Il cliente vede lo stato dal vivo nella sua app (sessioni svolte, valutazione dell'ultima sessione), e con «Ripristina» torna com'era. Per questo i toast dicono solo cosa è cambiato.

## Prove rosse

Ogni prova l'ho fatta sul file committato e l'ho rimessa com'era con `git checkout`.

**1. Senza la condizione dell'ultimo blocco** (`renewal.ts`: tolta la riga `if (valid.some(… comesAfter …)) return null;`)

```
× fisso non all'ultimo blocco con 1 credito: mai
× dopo «Rinnova lo stesso» esce; con «Ripristina» rientra
× percorso non ancora iniziato: il primo blocco futuro
AssertionError: expected { …(3) } to be null
      Tests  3 failed | 27 passed (30)
```

Con l'helper rimesso: `Tests  30 passed (30)`.

**2. Senza la condizione su `auto_renew_blocks`** (`renewal.ts`: tolta `if (renewsAutomatically(client)) return null;`)

```
× mensile col rinnovo automatico acceso: mai, nemmeno con 0 crediti e il blocco che scade domani
× tutti i clienti in scadenza, senza tagli, nell'ordine della regola
AssertionError: expected { …(3) } to be null
      Tests  2 failed | 28 passed (30)
```

Con l'helper rimesso: `Tests  30 passed (30)`.

**3. Soglia di *Prossima* da 90 a 60 minuti** (`today-agenda.ts`: `NEXT_SOON_MINUTES = 60`)

```
× Prossima a 90 minuti dice «tra 90 min», a 91 no
× Prossima a 75 minuti: «tra 75 min»
AssertionError: expected 'Prossima' to be 'Prossima · tra 75 min'
      Tests  2 failed | 13 passed (15)
```

Con l'helper rimesso: `Tests  15 passed (15)`.

**4. «Da assegnare» tagliato o filtrato come prima** (`to-assign.ts`)

- (a) Con `.slice(0, 4)`:

  ```
  × con 6 eventi la card ne elenca 6: lo stesso numero del badge
  AssertionError: expected [ …(4) ] to have a length of 6 but got 4
        Tests  2 failed | 8 passed (10)
  ```

- (b) Col filtro `status === "scheduled"` al posto di `isToAssign`:

  ```
  × con 6 eventi la card ne elenca 6: lo stesso numero del badge
  AssertionError: expected [ …(4) ] to have a length of 6 but got 4
        Tests  2 failed | 8 passed (10)
  ```

Con l'helper rimesso: `Tests  10 passed (10)`.

Tutte e quattro sono cadute per la ragione giusta, quindi non ho dovuto riscriverne nessuna.

## Verifica nel browser

**Fatta**, con Chromium headless e il finto backend della 02, sul `vite dev` del ramo.

- Playwright intercettava PostgREST, auth e server function. **Nessuna richiesta è uscita** verso Supabase o Google (ogni scenario lo controlla), e non ci sono stati errori in console.
- Ora fissa: 25/09/2026 10:40, Europe/Rome.
- Dati come il prototipo: 12 clienti, 7 sessioni oggi più impegni, annullate e il coach come cliente, 6 eventi da assegnare, 174 sessioni di storico dall'inizio dell'anno.
- Il banco di prova sta fuori dal repo.

**80 controlli, tutti riusciti.**

**Panoramica (46)**

- Saluto «Buongiorno, Marco». Sottotitolo «Venerdì 25 settembre · 7 sessioni oggi, 1 svolta, 1 da confermare».
- 7 righe in ordine; «1 di 7 svolte». Chip: Svolta, Da confermare, In corso, Prossima, poi nessuno. Pulsanti giusti per ogni stato.
- Impegno, annullata, annullata tardi e il coach come cliente restano fuori.
- **Check-in con salvataggio rallentato di 1,5 s:**
  - la riga resta e diventa «Svolta» subito;
  - si disabilita solo quella riga (0 pulsanti disabilitati altrove);
  - la scrittura è condizionata (`status=eq.scheduled`, `deleted_at=is.null`);
  - toast «Sessione di Giulia Bianchi segnata come svolta.»; «Ripristina» la riporta a `scheduled`;
  - nessuna scrittura su allocazioni o extra.
- **Assente e «Annulla assenza»:** «Assenza registrata per Paolo Moretti.», poi «Stato ripristinato: Paolo Moretti torna in agenda.».
- **Rinnovi:** Marta («Abbonamento Mensile · Il blocco scade tra 2 giorni»), Federico (tra 5 giorni), Sara («Percorso Fisso · 1 credito rimasto»). Pill 3.
  - «Rinnova» apre Pacchetto su «Rinnova lo stesso» senza cambiare pagina. Dopo il rinnovo Marta esce (pill 2); con «Ripristina» rientra (pill 3).
- **Da assegnare:** 6 eventi per data, «mar 29 set · 17:30–18:15». La pill 6 coincide con il badge della sidebar («6 eventi da assegnare»).
  - «Assegna» apre il dialog su `/trainer?reviewEventId=…`.
- **Distribuzione:** «Dal 1° gennaio · 156 sessioni», con 4 tipologie.
- **Col passare del tempo:** portando l'ora alle 11:05, senza ricaricare la pagina, Paolo diventa «Da confermare», Elena «Prossima · tra 85 min» e il sottotitolo «2 da confermare».
- **Conflitto:** una sessione annullata altrove non si segna svolta. Il messaggio dice «La sessione è stata modificata nel frattempo. Riprova.», e dopo il ricaricamento la sessione esce dall'elenco.

**Clienti e Profilo (17)**

- La Panoramica, il tab «In scadenza» di Clienti (conta 3) e il Profilo danno lo stesso insieme: Marta, Federico, Sara.
- Chiara (mensile col rinnovo automatico, 0 crediti, blocco che finisce domani) e Giulia (fisso, 1 credito, non all'ultimo blocco) sono «Attivo» in Clienti e nel Profilo.
- Nel Profilo di Marta, accendendo il rinnovo automatico, l'etichetta passa ad «Attivo» e il banner sparisce. Spegnendolo torna come prima.

**Giorno vuoto, card vuote, saluti (13)**

- Domenica 27/09: «Domenica 27 settembre · nessuna sessione oggi» e «Nessuna sessione in agenda oggi.».
  - Il link dice «Prossima: Lunedì 28 settembre alle 07:30 con Luca Verdi» e porta a `/trainer/calendar?date=2026-09-28&event=…`: il Calendario apre quella settimana, con la sessione visibile.
- Con le card vuote compaiono i testi vuoti del brief, e i contatori a 0 sono neutri (`bg-surface-container text-outline`).
- Saluti: «Buon pomeriggio, Marco» alle 15:00 e «Buonasera, Marco» alle 18:00.

**Larghezze (3)**

- A 1024 px una colonna, a 1280 e a 1920 px due colonne, sempre senza scorrimento orizzontale.

**Mobile a 390 px (1)**

- Ho fotografato la Panoramica mobile con gli stessi dati e la stessa ora su `origin/main` e sul ramo, servendo i due alberi uno dopo l'altro.
- Stessa impronta sha256 (`088d1c6b…fd11be`): identica pixel per pixel, senza scorrimento orizzontale.

**La stessa Panoramica sulla base, con gli stessi dati**

- «Hai 5 sessioni da svolgere», con 5 righe su 7.
- Rinnovi: 4, con dentro Chiara, che ha il rinnovo automatico, e tagliati a 4.
- Da assegnare: 4 contro un badge di 6.
- Distribuzione: «Dal 1° gen · 189 eventi».

## Divergenze

**Dal brief e dal prototipo**

- **Riga sotto «Rinnovi in scadenza».** Dice la regola vera, come proposto dal prompt: «Ultimo blocco con 2 crediti o meno, o che scade entro 7 giorni. Esclusi i rinnovi automatici.». Il brief dice «Clienti con 2 crediti o meno…».
- **Chi è in scadenza.** Vale la regola del 25/09, non quella del brief e di `renewalInfo` in `nc-store.js`, che includevano tutti i mensili.
- **Etichetta del piano nei rinnovi.** È `clientPlanLabel` (`src/lib/client-search.ts:68`), la stessa logica della lista Clienti (`trainer.clients.index.tsx:987-993`).
- **Sottotitolo senza sessioni.** «… · nessuna sessione oggi»: il brief omette le parti a zero, il prototipo scriveva «0 sessioni oggi». Le altre parti a zero si omettono come da brief.
- **«1 di 1 svolta»** al singolare. Il prototipo dice sempre «svolte».
- **«tra N min».** I minuti si arrotondano per eccesso (`Math.ceil`, `today-agenda.ts`); il prototipo arrotondava al più vicino. Una sessione che inizia fra 30 secondi dice «tra 1 min», non «tra 0 min».
- **Durata di una sessione a 0 minuti.** Conta come mancante: si passa alla tipologia, poi a 60 minuti. Prima si usava `??` (`trainer.index.tsx:484` della base). Altrimenti la sessione non sarebbe mai «In corso».
- **Ora di Roma.** Il giorno di appartenenza, il saluto e il giorno nel sottotitolo usano l'ora di Roma, come chiede il prompt. Gli orari delle righe usano l'ora del browser, come il resto dell'app: in Italia coincidono.
- **Riga «Ogni check-in si può annullare dal messaggio di conferma o dalla riga.»** La mostro sotto l'elenco, com'è nella schermata del brief. Nel prototipo compare solo con le etichette dell'audit.
- **Toast dopo «Ripristina» e dopo «Annulla check-in»/«Annulla assenza».** «Stato ripristinato: <Nome> torna in agenda.» (senza «Ripristina»), dal prototipo: il brief non lo dà.
  - In errore resta com'era e il toast dice «La sessione è stata modificata nel frattempo. Riprova.», lo stesso testo della 02.
- **Righe «Da assegnare».** Il fondo è il token `assign-soft` del brief (0,55), più pieno dello 0,22 del prototipo. Molte righe si mostrano tutte, senza scorrimento: il prototipo non dice altro.
- **Distribuzione servizi.** Il prototipo ha numeri fissi (`ytd` in `nc-store.js`), quindi la regola è mia:
  - contano le sessioni cliente già iniziate dal 1° gennaio (Roma) fino a ora, svolte, assenti o da confermare;
  - restano fuori annullate (anche tardi), eliminate, impegni personali, eventi da assegnare, il coach come cliente e le prenotazioni future;
  - sui dati di prova il totale passa da 189 «eventi» (la regola di prima contava tutto tranne `cancelled`, futuro compreso) a 156 sessioni.
  - Se le 1000 sessioni caricate non arrivano al 1° gennaio, l'etichetta diventa «Dall'<data della più vecchia> · N sessioni» invece di dichiarare un totale falso. Sui dati di oggi non succede.
- **«Apri nel calendario →».** Apre la settimana di oggi, non la vista giorno: il Calendario non ha una vista giorno fino alla passata 04. Il link del giorno vuoto passa anche `event`, che il Calendario accetta ma non usa ancora.

**Dal prompt**

- **Il componente sta in un file suo.** La Panoramica desktop è in `src/components/overview-desktop.tsx`, montata da `trainer.index.tsx`, e non scritta dentro la route. Così il diff della route resta fuori dal blocco mobile.
- **Clienti.** «In scadenza» ora viene **prima** di «completed» (`trainer.clients.index.tsx:597-598`); la regola di «completed» non cambia.
  - Senza questo, un cliente con i crediti esauriti ma il blocco ancora in corso sarebbe «Crediti esauriti» in Panoramica e «Completato» in Clienti, e l'Accettazione («un cliente in scadenza qui lo è anche in Clienti») non sarebbe vera.
  - Tolta anche la vecchia regola dei mensili: `next_billing_date` a 5 giorni.
- **Profilo.** `pkg.expiringSoon` decide tre cose (`trainer.clients.$id.tsx`):
  - l'etichetta (:847);
  - il colore della data di scadenza (:985);
  - il banner «Pacchetto in esaurimento — proponi il rinnovo.» con «Rinnova» (:1045).

  Tutte e tre ora seguono l'helper; prima valevano «ultimo blocco e meno di 14 giorni». Lasciare banner e colore sulla regola vecchia avrebbe dato una pagina che dice due cose diverse.
- **Mobile della lista Clienti.** Il layout mobile di Clienti legge lo stesso `status`, quindi anche lì il tab «In scadenza» segue la regola nuova. Sui dati di prova conta 3; sulla base 0, perché la regola vecchia dei fissi guardava tutto il percorso. L'aspetto non cambia.
- **`auto_renew_blocks` a `null`.** Nei profili non può arrivare: la colonna è `NOT NULL DEFAULT true` (`supabase/migrations/20260523112416_…sql:6`). Può essere `null` solo nella vista `client_block_status` (`types.ts:1225`). L'helper tratta comunque `null` come spento, come fa il server (`COALESCE(auto_renew_blocks, false)` in `20260827143325_…sql:62`).
- **Il server rinnova in automatico anche i percorsi fissi col flag acceso.** L'ho misurato, e la tabella del 25/09 non lo dice:
  - `ensure_client_block_state` (`20260827143325_…sql:60-62`) e `ensure_all_recurring_for_coach` (`20260525100000_…sql:39-47`) creano il blocco successivo per **qualsiasi** cliente con `auto_renew_blocks` acceso, senza guardare `path_type`. La seconda la chiama la lista Clienti a ogni apertura (`trainer.clients.index.tsx:435-439`), la prima le pagine del cliente.
  - Il valore predefinito della colonna è `true`, e solo i percorsi assegnati dalla 02 in poi hanno il flag uguale a «è un mensile» (`package-actions.ts:377`).
  - Il cron notturno invece guarda solo i mensili (`20260827143325_…sql:136-139`).
  - **Ho seguito la tabella:** un fisso è in scadenza all'ultimo blocco anche col flag acceso (c'è un test apposta). Ma un fisso col flag acceso, a fine blocco, riceve comunque un blocco nuovo dal server.
- **Query estese in modo additivo:**
  - `auto_renew_blocks` in `useCoachClients`;
  - `status` e `path_type` del profilo, `start_date` e `status` dei blocchi nel Profilo;
  - `status` dei blocchi nella lista Clienti;
  - `BOOKINGS_FETCH_LIMIT` esportato.

  I tipi generati non cambiano.
- **PR aperta con lo strumento GitHub della sessione**, perché `gh` non c'è.

## Cosa non ho fatto e perché

- **Il `slice(0, 5)` del mobile** (`trainer.index.tsx:90` sul ramo, `:113` sulla base). È un debito, per il §5: sui dati di prova il mobile dice «5 Sessioni programmate» con 7 sessioni cliente oggi, di cui 6 programmate. Conta solo le `scheduled` e ne taglia una.
- **La copia locale di `findCurrentBlock` in Clienti** (`trainer.clients.index.tsx:208`, con la tolleranza di 7 giorni) e lo stato «completed» calcolato su tutto il percorso: sono della passata 05. L'helper usa il suo blocco di riferimento, non quella copia.
- **La vista giorno del Calendario e la selezione della sessione da `?event=`:** sono della passata 04.
- **Verifica con dati veri.** Il database è su Lovable Cloud e il divieto vale anche in lettura. Il finto backend non prova le policy RLS, i trigger veri e i tempi di rete.
- **Il banner di rinnovo del cliente** (`src/routes/client.index.tsx:471-475`): non l'ho toccato, come da §5. Segue una regola diversa da quella del coach:
  - solo percorsi fissi;
  - tutte le sessioni del blocco in corso svolte;
  - nessun blocco futuro.

  Non guarda i 2 crediti né i 7 giorni, ed esclude i mensili col rinnovo spento.

## Cosa resta a Nicolò

- **Prova sull'anteprima Lovable, con i dati veri:**
  - check-in e «Ripristina» su una sessione di oggi; assente e «Annulla assenza»;
  - «Rinnova» su un cliente in scadenza: dopo il rinnovo esce dalla card, con «Ripristina» rientra;
  - la pill «Da assegnare» uguale al badge della sidebar;
  - lo stesso cliente «In scadenza» in Panoramica, Clienti e Profilo.
- **Decidere sul rinnovo automatico dei percorsi fissi** (vedi Divergenze). Oggi il server rinnova chiunque abbia il flag acceso, e la colonna parte da `true`. Le strade sono due:
  - spegnere il flag ai fissi (dati, fuori dalla mia portata);
  - far guardare `path_type` alle due funzioni del server (migrazione).
- **L'interruttore del rinnovo automatico nel Profilo** vale per ogni cliente e mostra acceso un valore mancante (`trainer.clients.$id.tsx:262`). Con la colonna `NOT NULL` non succede, ma la scritta «Rinnovo automatico blocchi mensili» compare anche sui percorsi fissi. È della passata 06.
- **Il `slice(0, 5)` del mobile**, da decidere fuori dal redesign desktop.
