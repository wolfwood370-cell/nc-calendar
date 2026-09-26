# Ultimo ritorno · Redesign coach, passata 05 (Clienti)

26/09/2026. Brief: `design_handoff_coach_redesign/passes/05-clienti.md`, prototipo `designs/Coach Clienti.dc.html`. Audit: L1–L8, T4, V5.

## Ramo e hash

- **Ramo pubblicato:** `redesign/coach-05-clienti`, col primo push, `git push origin HEAD:redesign/coach-05-clienti`.
- **Base:** `git rev-parse origin/main` = `ee8ecb93a95e921b6edc809ba7074a96898a3a31`, come atteso (merge della PR #70). Il ramo l'ho creato da lì, prima di ogni modifica.
- **Commit, in ordine:**
  1. `025bd93` stati, tab, crediti, presenza, ordinamenti e URL: helper puri e test;
  2. `3a62763` creazione, inviti e archivio con le scritture di prima: helper, archivi Supabase e test;
  3. `369ed23` lista Clienti desktop e «Nuovo cliente». Si tolgono i tre componenti che usava solo il desktop di prima;
  4. `cdf5ab3` Profilo: presenza da `getAttendance` e ritorno alla lista;
  5. `0da8050` CHECKLIST;
  6. questo file, in un commit a parte, per ultimo.
- **Come ho committato:** file aggiunti per nome, mai `git add -A` o `git add .`. Prima di ogni commit ho rimesso `bun.lock` com'era.
- **Typecheck commit per commit:** in una copia di lavoro separata, `tsc --noEmit` esce con 0 su tutti e quattro i commit di codice.

## PR

https://github.com/wolfwood370-cell/nc-calendar/pull/71: verso `main`, aperta, non in bozza, **non** unita. `gh` non c'è nella VM, quindi l'ho aperta con lo strumento GitHub della sessione.

## Manifesto

**NUOVI (14)**

- Helper puri e test (`src/lib/`):
  - `client-list.ts` + test: stato del cliente, conteggi dei tab, crediti in scheda, presenza, prossima e ultima sessione, ricerca, i cinque ordinamenti, i parametri dell'URL e la ricerca con cui il Profilo torna alla lista;
  - `client-create.ts` + test: da «crediti per blocco» alle regole di prima; le scritture della creazione di prima, spostate qui; la password;
  - `client-actions.ts` + test: «Annulla invito» e «Archivia» con «Ripristina», scritture condizionate allo stato di partenza.
- Resto di `src/lib/`:
  - `client-stores.ts`: gli archivi Supabase, con le stesse chiamate di prima;
  - `testing/clients-seed.ts`: dati di prova, ora 25/09/2026 10:40.
- Componenti:
  - `clients-desktop.tsx`: la lista desktop;
  - `new-client-dialog.tsx`: scelta, invito, «Crea l'account» a tre passi;
  - `client-row-menu.tsx`: il menu ⋮;
  - `delete-client-dialog.tsx`: «Eliminare definitivamente <Nome>?».

**MODIFICATI (6)**

- `src/routes/trainer.clients.index.tsx`:
  - `validateSearch` passa a `parseClientsSearch`;
  - stati e crediti vengono da `buildClientRows`, al posto di `cardData` e della copia locale di `findCurrentBlock`;
  - il blocco `block md:hidden` non cambia, e il desktop passa a `ClientsDesktop`;
  - la creazione passa da `writeNewClient`;
  - «Annulla invito» e «Archivia» hanno «Ripristina»;
  - si aggiunge la lettura di `extra_credits` per i «Crediti extra».
- `src/routes/trainer.clients.$id.tsx`: solo il calcolo della presenza (:879) e la freccia «Torna ai clienti» (:882, :899).
- `src/lib/attendance.ts`: `profileEngagement`, il riquadro Engagement del Profilo con la presenza di `getAttendance` (:81-106).
- `src/lib/client-search.ts`: `matchesClient`, la stessa regola della ricerca dell'header, archiviati compresi.
- `design_handoff_coach_redesign/CHECKLIST.md`: la 05 passa a `[x]`.
- `docs/ULTIMO-RITORNO.md`: questo file.

**ELIMINATI (3)**

- `src/components/client-card-menu.tsx`, `pending-invitations-card.tsx`, `invite-client-dialog.tsx`. Li usava solo il desktop di prima (`grep` senza altri import).

**NON TOCCATI**

- **Niente database, lock, dipendenze, tipi generati o CI.** `git diff origin/main..HEAD --stat -- supabase/ bun.lock package.json src/integrations/supabase/types.ts .github` è vuoto (0 righe).
- **Altri file:** `src/routes/client.*`, `trainer-header.tsx`, `trainer-bottom-nav.tsx`, `create-client-dialog.tsx`, `credentials-dialog.tsx`, `client-status-tabs.tsx`.
- **Il telefono resta com'era.** A 390 px ho confrontato 5 stati, due giri su `origin/main` e due sul ramo, col finto backend e l'ora fissa:
  1. lista;
  2. tab «In scadenza»;
  3. ricerca «gi»;
  4. «+» con il dialog di creazione del telefono;
  5. `?new=cliente`.

  Risultati:
  - **impronta del DOM visibile** (tag, riquadro, testo e stili che si vedono di ogni elemento mostrato): identica in tutti i giri;
  - **hash del PNG a pagina intera:** uguale negli stati 1, 3, 4 e 5. Nello stato 2 cinque pixel (x 18–20, y 87–89, sul bordo dell'icona di ricerca) differiscono di 1–2 unità RGB fra i due alberi. È antialiasing, come già nella 04: il DOM è identico.

  | stato | DOM base (2 giri) | DOM ramo (2 giri) |
  |---|---|---|
  | 1 · lista | `d44e32606c5a1033` | `d44e32606c5a1033` |
  | 2 · In scadenza | `2807fcf97e4ff4cd` | `2807fcf97e4ff4cd` |
  | 3 · ricerca | `d3dfdc317b781830` | `d3dfdc317b781830` |
  | 4 · «+» | `7f0054295aa0884f` | `7f0054295aa0884f` |
  | 5 · `new=cliente` | `7e4705a04a312300` | `7e4705a04a312300` |

## Ambiente

- **Dipendenze:** ho riscritto in `bun.lock` gli indirizzi del registro di Lovable (`europe-west1/4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/`) verso `https://registry.npmjs.org/`. Poi `bun install --frozen-lockfile` (Bun 1.3.11) ha dato «Checked 724 installs across 846 packages (no changes)». Infine ho rimesso `bun.lock` com'era.
- **Browser:** la Chromium di Playwright preinstallata (`/opt/pw-browsers`).
- **Finto backend:** quello delle passate 02-04, esteso per la 05. Ora ha:
  - la selezione annidata `training_blocks → block_allocations`;
  - il default `status = 'pending'` degli inviti;
  - le funzioni edge `admin-create-user`, `admin-delete-user` e `send-email`, finte;
  - `ensure_all_recurring_for_coach`.

  Vive nella cartella di lavoro della sessione, non nel repo. Nessuna richiesta è uscita verso Supabase, Google o l'invio email: il banco le conta, zero.

## Controlli

Base (`ee8ecb9`, albero non toccato) e fine (`cdf5ab3`, ultimo commit di codice), stessi comandi e stesso ambiente.

| | Base | Fine |
|---|---|---|
| build (`npm run build`) | esce con 0: `✓ built in 11.28s`, `3.61s`, `11.33s` | esce con 0: `✓ built in 9.86s`, `3.32s`, `11.25s` |
| typecheck (`npx tsc --noEmit`) | 0 errori | 0 errori |
| lint (`npx eslint .`) | `✖ 22 problems (0 errors, 22 warnings)` | `✖ 22 problems (0 errors, 22 warnings)` |
| test (`npx vitest run`) | `Tests  297 passed (297)`, 21 file | `Tests  334 passed (334)`, 24 file |

- **Base:** uguale a quella misurata da Cowork.
- **Lint:** gli avvisi sono gli stessi file per file.
- **Test nuovi (37):**
  - `client-list`: 19;
  - `client-create`: 12;
  - `client-actions`: 6.

## Ricognizione del §4

**1. Cosa scrive la creazione, e quanti blocchi per durata.** Su `ee8ecb9`, `trainer.clients.index.tsx:747-892`:

- **account:** funzione edge `admin-create-user` con email, password, nome e cognome (:749-756). Crea anche un invito, che la registrazione segna subito «accepted» (`supabase/functions/admin-create-user/index.ts:109-147`);
- **cliente libero** (:765-790): una riga `extra_credits` (tipologia scelta, quantità, `expires_at` 2100-01-01) e il profilo con `path_type free`, `auto_renew` e `auto_renew_blocks` a false, `pack_label` «Cliente Libero»;
- **fisso e mensile:**
  - N blocchi da 30 giorni da oggi (:792-811);
  - un'allocazione per blocco e per regola, «dal blocco X al blocco Y», settimana 1 (:820-847);
  - il profilo (:849-873): `path_type`; `auto_renew` e `auto_renew_blocks` uguali a `autoRenew`; `pack_label`; `path_start_date` a oggi; `next_billing_date` a +30 giorni solo per il mensile.

Il dialog di prima (`create-client-dialog.tsx`) decideva durata e rinnovo:

- **blocchi:** mensile 1, fisso quanti i mesi del preset (1, 3, 6, 12) o il numero scelto con «Manuale» (:58-64, :128-133), libero 0 (:229);
- **rinnovo:** `autoRenew: pathType === "recurring"` (:231);
- **«PT Pack»:** fisso, 1 blocco, 3 PT, `pack_label` «Pacchetto 3 sessioni» (:135-151).

Adesso queste scritture stanno in `client-create.ts:229-325` (`writeNewClient`), riga per riga:

- **da dove si chiamano:** dal dialog nuovo e da quello del telefono (`trainer.clients.index.tsx:454`);
- **durata:** 3, 6 e 12 mesi danno 3, 6 e 12 blocchi; «Personalizzata» il numero scelto (`blocksOf`, :79);
- **crediti per blocco:** una regola per tipologia dal blocco 1 al blocco N (`creationPayload`, :95);
- **rinnovo:** `autoRenewFor` (:87).

**2. Come si annulla un invito, e il suo «Ripristina».**

- **Oggi:** `client_invitations.status = 'cancelled'` per id (`ee8ecb9`, `trainer.clients.index.tsx:691-703`).
- **Com'è fatto un invito:** non ha token né link suo. L'email porta a `appOrigin` (`src/lib/email.ts:54-64`), e la registrazione aggancia l'invito per email finché è `pending` (`handle_new_user`, `20260603201215_…sql:17-31`).
- **«Ripristina»:** rimettere la stessa riga a `pending` ridà lo stesso invito (`client-actions.ts:42`). La scrittura è condizionata a `status = 'cancelled'`.
- **Quando non si può:** se nel frattempo è partito un altro invito alla stessa email, l'indice unico `idx_client_invitations_email_pending` (`20260509203659_…sql:35-36`) lo impedisce. Il toast lo dice («C'è già un altro invito in attesa per questa email.») e non si toccano inviti.

**3. Presenza del Profilo contro `getAttendance`.**

- **Profilo prima:** `ee8ecb9`, `trainer.clients.$id.tsx:870-894`, presenza a :873. Contava le svolte su tutte le sessioni non programmate, annullate dal coach comprese, senza limite di tempo, e dava 100 senza dati.
- **`getAttendance`:** conta svolte / (svolte + assenze + annullate tardi), solo nelle ultime 8 settimane, e dà null senza dati.
- **Esempio** (`clients-seed.ts`, Giulia): 5 svolte e 1 assenza nelle ultime 8 settimane, più 1 sessione annullata dal coach. Il Profilo diceva **71%** (5/7); `getAttendance` dice **83%** (5/6), e ora lo dicono tutte e due le pagine.
- **La lista prima:** usava un terzo calcolo, senza limite di tempo.
- **Quando mancano i dati:** nel Profilo compare «—», come in scheda.

**4. Come il Profilo tornava alla lista.**

- **Prima:** `<Link to="/trainer/clients">` senza parametri (`ee8ecb9`, `trainer.clients.$id.tsx:911`), quindi ricerca, tab, ordine e vista si perdevano. La ricerca e il tab erano stato locale, non nell'URL.
- **Adesso:** la lista scrive lo stato nell'URL (`replace`). Aprendo il Profilo, la scheda porta nello stato della cronologia la ricerca della lista (`clients-desktop.tsx:162`). La freccia del Profilo la rilegge con `backToListSearch` (`client-list.ts:419`) e torna lì. Anche il «Indietro» del browser ritrova l'URL.
- **Da altre pagine:** Panoramica e ricerca dell'header non portano quello stato, e si torna alla lista di base.

**5. Cosa condivide il telefono col desktop, e la prova.**

- **Prima:** in `ee8ecb9`, `trainer.clients.index.tsx`, il blocco `block md:hidden` (:909-1024) usava gli stessi `q`, `activeTab`, `tabs` (4 tab, senza «Completati», :894-899), `visibleCards` (:623-660), `loading` e `createOpen`. Il suo «+» apriva `CreateClientDialog`, e dopo la creazione compariva `CredentialsDialog`. Tutti e due erano montati dentro il blocco desktop (:1039-1066) ma in un portale, quindi visibili anche sul telefono.
- **Adesso:**
  - il telefono tiene ricerca e tab locali;
  - tiene i 4 tab e il filtro di prima (nome o email) con l'ordine per nome (:317);
  - legge gli stati dallo stesso `buildClientRows`, che per lo stato fa lo stesso conto di prima;
  - `CreateClientDialog` e `CredentialsDialog` sono montati fuori dai due blocchi (:633-635).
- **Prova:** l'impronta a 390 px (Manifesto) e il confronto degli stati (Verifica nel browser).

## Prove rosse

Ogni difetto l'ho messo nel file e poi l'ho tolto rimettendo la copia originale. Ho rifatto il test anche col codice giusto.

**1. Rinnovo automatico acceso anche per il fisso** (`client-create.ts`: `return pathType === "recurring" || pathType === "fixed";`)

```
× fisso e libero spenti, mensile acceso
× un percorso fisso nasce senza rinnovo automatico nel profilo scritto
× scorciatoia PT Pack: 1 blocco, 3 PT e la sua etichetta
AssertionError: expected true to be false // Object.is equality
      Tests  3 failed | 9 passed (12)
```

Col codice giusto: `Tests  12 passed (12)`.

**2. Gli archiviati dentro «Tutti»** (`client-list.ts`: `return tab === "all" ? true : status === tab;`)

```
× conteggi dei tab, «Tutti» senza archiviati
AssertionError: expected [ 'giulia', 'luca', 'marta', …(6) ] to not include 'roberto'
× nome, con la parità risolta per id   (e gli altri quattro ordinamenti: Roberto entra in lista)
      Tests  6 failed | 13 passed (19)
```

Col codice giusto: `Tests  19 passed (19)`.

**3. «Presenza più bassa» al contrario** (`client-list.ts`: `attendance: (r) => (r.attendance === null ? null : -r.attendance)`)

```
× presenza più bassa in cima, senza dati in fondo, parità per nome
AssertionError: expected [ [ 'davide', 100 ], …(7) ] to deeply equal [ [ 'andrea', 50 ], …(7) ]
      Tests  1 failed | 18 passed (19)
```

Col codice giusto: `Tests  19 passed (19)`.

**4. Il Profilo col calcolo vecchio della presenza** (`attendance.ts`, in `profileEngagement`: la formula di prima)

```
× per ogni cliente
AssertionError: giulia: expected 71 to be 83 // Object.is equality
      Tests  1 failed | 18 passed (19)
```

Col codice giusto: `Tests  19 passed (19)`.

**5. `ordina` tolto dalla scrittura dell'URL** (`client-list.ts`: `ordina: undefined,`)

```
× legge e scrive tutti i parametri
× tornando dal Profilo ricerca, tab, ordine e vista sono quelli di prima
AssertionError: expected { q: 'giulia', tab: 'active', …(2) } to deeply equal { q: 'giulia', tab: 'active', …(2) }
      Tests  2 failed | 17 passed (19)
```

Col codice giusto: `Tests  19 passed (19)`.

## Verifica nel browser

Il banco ha il seme delle passate 03-04, simile al prototipo: 11 clienti (uno archiviato), 4 tipologie, 2 inviti in attesa. Ora fissa venerdì 25/09/2026 10:40 a Roma, viewport 1440×900. **36 controlli, 36 OK, 0 KO.**

**Accettazione**

- **Ritorno dal Profilo.** Con tab «Attivi», ricerca «a», «Presenza più bassa» e tabella, si apre Giulia e si torna con la freccia: l'URL ha gli stessi parametri, il campo dice «a» e il tab è «Attivi».
- **Stessi «In scadenza» della Panoramica:** Federico Galli, Marta Conti e Sara Neri sulle due pagine.
- **Presenza scheda = Profilo:** controllata su Giulia, Paolo, Sara e Chiara.

**Il resto**

- **Testata e tab.** Un solo «Nuovo cliente» e nessun «Invita». Tab «Tutti 10 · Attivi 7 · In scadenza 3 · Completati 0 · Archiviati 1», e «Tutti» senza Roberto. La barra riepilogo non c'è più.
- **Nuovo cliente, percorso fisso.** Si parte da `?new=cliente`, che apre la scelta e si toglie dall'URL. Poi Dati, Percorso (6 mesi, 8 PT e 1 BIA) e Riepilogo («Percorso fisso · 6 blocchi», «Sessioni totali 54»).
  - **Riga scritta:** 6 blocchi e 12 allocazioni; `auto_renew` e `auto_renew_blocks` a **false**, anche se il finto `admin-create-user` crea il profilo con `true`, come fa il default vero; `next_billing_date` vuoto.
  - **Password:** 10 caratteri, mostrata una volta. Non compare in URL, `localStorage`, `sessionStorage`, stato della cronologia, toast, console o registro delle richieste del finto backend; chiuso il dialog, non si vede più.
- **Nuovo cliente, mensile:** 1 blocco, rinnovo acceso, prossima fatturazione scritta.
- **Invito.**
  - La riga è scritta come prima (email, nome, telefono, coach) e l'email parte.
  - «Reinvia» manda una seconda email, con toast.
  - «Annulla invito» scrive `cancelled` e la riga sparisce; «Ripristina» rimette la stessa riga in attesa.
- **Archivio ed eliminazione.** «Archivia» su Paolo è immediato, con toast; «Ripristina» lo rimette attivo. «Elimina…» apre «Eliminare definitivamente Paolo Moretti?» con Annulla, Archivia invece ed Elimina. Con Annulla non parte nessuna eliminazione.
- **Scheda.** Il ⋮ non apre il Profilo. Il clic sull'email o Invio sulla scheda sì.
- **Tabella** a 1000 px: il riquadro scorre (`scrollWidth` 880, `clientWidth` 664) e la pagina no.
- **Stati uguali a `origin/main`** (`s2-stati.mjs`, stessi dati sui due alberi): stato di ogni cliente identico. Anche nella variante con Chiara che ha svolto tutte le 8 sessioni, dove diventa «Completato» su tutti e due.
- **Telefono a 390 px:** vedi Manifesto.
- **Rete ed errori.** 0 dialog nativi, 0 richieste esterne, 0 errori nella pagina.

## Divergenze

- **Il telefono tiene il dialog di creazione di prima e `CredentialsDialog`.** Il brief toglie `CredentialsDialog`, ma il suo solo uso è il «+» del telefono, che deve restare identico (§5). Il telefono scrive comunque attraverso `writeNewClient`, come il desktop (`trainer.clients.index.tsx:477`, :633-635). Sul desktop il `CredentialsDialog` non c'è più.
- **«Crea l'account» non chiede il telefono.** Il brief e il prototipo hanno «Telefono (facoltativo)» fra i dati. La creazione di oggi non lo scrive: `admin-create-user` non lo accetta, e l'aggiornamento del profilo non lo tocca. Aggiungerlo sarebbe una scrittura in più, contro il punto 4 del §0. Il telefono resta nell'invito, dove si scrive già (`new-client-dialog.tsx:172`).
- **Blocchi da 30 giorni, non «4 settimane»** (`new-client-dialog.tsx:213-214`, :437, :444). Il prototipo dice «blocchi da 4 settimane», ma il codice che scrive fa blocchi da 30 giorni (`client-create.ts`, `BLOCK_DAYS`). Il testo dice quello che succede.
- **Sessioni omaggio del cliente libero per tipologia.** Il dialog di prima ne dava una tipologia sola; il brief chiede −/+ per tipologia. Scrivo una riga `extra_credits` per ogni tipologia con sessioni, ognuna uguale a quella di prima (`client-create.ts:248-259`). Con una tipologia sola la scrittura è identica.
- **La password** si genera con la stessa regola di prima (10 caratteri, maiuscola, minuscola, cifra, simbolo, senza caratteri ambigui), ma con `crypto.getRandomValues` al posto di `Math.random` (`client-create.ts:136`).
- **La presenza del Profilo senza dati è «—»,** non più 100%. È la conseguenza di `getAttendance` (null senza sessioni concluse); il resto del riquadro non cambia. Resta com'era una stranezza: «No-show» conta le annullate tardi (`attendance.ts`, `profileEngagement`), roba della passata 06.
- **«Invito inviato a …» senza «Ripristina».** Il prototipo ne mette uno anche all'invio, ma l'email è già partita e annullare l'invito non la richiama. «Annulla invito» resta nella card degli inviti.
- **L'ordine «Scadenza del blocco»** usa la fine del blocco di riferimento (`resolveCurrentBlock`, lo stesso di «In scadenza»). I clienti liberi vanno in fondo. **«Crediti residui»** usa i crediti del blocco in corso, del mese o extra, e chi non ne ha va in fondo (`client-list.ts:323-332`).
- **Il messaggio di lista vuota di «In scadenza»** è «Nessun cliente in scadenza.». Il prototipo dice «…nei prossimi 7 giorni», ma «In scadenza» conta anche i crediti.
- **La tabella scorre grazie a `contain: inline-size`** (`clients-desktop.tsx:557`). Senza, il riquadro si allargava col contenuto e la pagina intera scorreva, perché il layout `/trainer` non ha `min-w-0` (e non l'ho toccato).
- **La freccia del Profilo riporta i filtri, il «Clienti» dell'header no.** Il breadcrumb è in `trainer-header.tsx`, che non si tocca (§5): da lì si torna alla lista di base. Il «Indietro» del browser ritrova l'URL coi filtri.

## Cosa non ho fatto e perché

- **Il telefono non passa al dialog nuovo:** il §5 lo vieta; vedi Divergenze.
- **Il telefono nella creazione dell'account:** vedi Divergenze. Serve una decisione (e forse un parametro in più in `admin-create-user`, cioè `supabase/`).
- **Il redesign del Profilo:** è della passata 06. Qui cambiano solo la presenza e la freccia.
- **`ensure_all_recurring_for_coach`** l'ho lasciata dov'era (`trainer.clients.index.tsx:281-285`), come chiede il §3.2.
- **Verifica con dati veri.** Il divieto vale anche in lettura. Il finto backend riproduce le chiamate e i default che ho letto nelle migrazioni e nella funzione edge. Non prova le policy RLS e le risposte vere di `admin-create-user` e `send-email`.

## Cosa resta a Nicolò

- **Prova sull'anteprima Lovable, con dati veri:**
  - creare un cliente con percorso fisso: nel Profilo l'interruttore del rinnovo deve essere spento;
  - un invito, «Reinvia», «Annulla invito» e «Ripristina»;
  - «Archivia» e «Ripristina»;
  - aprire un profilo con ricerca e filtri, e tornare con la freccia;
  - confrontare «In scadenza» con la Panoramica e la presenza in scheda col Profilo.
- **Decidere il telefono nella creazione dell'account:** o si scrive nel profilo dopo la creazione (una colonna in più nella stessa scrittura), o `admin-create-user` lo accetta (tocca `supabase/functions`).
- **Decidere se il «+» del telefono passa al dialog nuovo.** Allora `CredentialsDialog` e `create-client-dialog.tsx` si possono togliere.
- **I percorsi fissi già creati col rinnovo acceso** restano da spegnere sui dati, come deciso il 26/09. Da oggi il desktop li crea spenti, come già faceva il dialog di prima.
