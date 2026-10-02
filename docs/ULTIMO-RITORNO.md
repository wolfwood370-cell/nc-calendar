**Dove ho girato (ultimo ritorno · lato cliente · passata 07 · il Profilo, sul PC):** **sul PC.** Git Bash: `pwd` = `/c/Coworks/NC App Development/repos/nc-calendar`, `uname -s` = `MINGW64_NT-10.0-26300`, `$OS` = `Windows_NT`, `deps-presenti`; bun 1.3.14, node v24.12.0, git 2.54.0.windows.1, gh 2.101.0. Nessuna installazione, nel repo né fuori.

> **In breve.** La 07 è fatta sul PC, dal ramo `redesign/cliente-07-profilo` su `ec64733`: `useMyCoach` legge `get_my_coach` per tutte le pagine del cliente (Home, Prenota, Sessioni, Booster, il dettaglio e il Profilo), `bookCoach` ne fa il coach dei testi, e il Profilo nuovo (identità, «Il tuo coach», «Il tuo percorso», «Notifiche», «Account», «Esci», coi fogli «Cambia password» e «Collega Google») sta tutto sulle regole di `src/lib/client-settings.ts`, sopra gli helper della 00 e la presenza di Sessioni. Google resta il giro di oggi (decisione 11), niente «Scollega», le notifiche dicono cosa arriva oggi; il Profilo di prima e `settings-row.tsx` non ci sono più.
>
> **La stampa di Cowork sul mio ramo dà esattamente `app/atteso-cli-07-2026-10-02.json`** a Roma, in UTC e a Los Angeles. Cancelli: typecheck 0, lint 0 errori e 14 avvisi (gli stessi della base), **1276 test in 62 file** (erano 1239 in 61), build riuscita; i quattro file del §5 verdi nei tre fusi con le sonde a 0, 420 e −120. Lo script dei controlli dà ogni riga all'atteso del §6. **R1-R20 tutte rosse** sui casi previsti e poi verdi (R18 nel lint e in D11, R19 nel browser). Nel browser `giro07.mjs` **147 su 147**, e i quattro giri di prima: `giro04` 104 su 104, `giro-sessioni` 78 su 78, `giro-prenota` 82 su 82, `giro05-cowork` 149 su 152 coi soli tre KO di oggi.
>
> Un revisore in sola lettura ha dato 9 punti: tre veri, corretti in un commit in più (`8ad35fb`: l'errore del server che arrivava a foglio già chiuso, l'interruttore con `disabled` che perdeva il focus da tastiera, il focus fermo sul pulsante dopo un «Salva» con errore); gli altri sono per contratto o fuori perimetro e stanno in §11.
>
> Workflow: 0. Agenti: 1 (il revisore).

## 1 · IL PIANO

☐ da fare · ☑ fatto, con l'hash del commit · ⚠️ deviato, con la misura e il `file:riga`

0. ☑ **Dove giri, la base e il ramo** (§2). `ea4a658`, il commit del piano (ammesso dal §2).
   - Ambiente: la riga in testa (PC). All'avvio il clone era su `main` @ `3d29634`, pulito, come l'aveva misurato Cowork.
   - `git fetch origin` → `d15f6d4..ec64733  redesign/cliente-mobile -> origin/redesign/cliente-mobile`; `git rev-parse --short origin/redesign/cliente-mobile` → **`ec64733`** (non più avanti), albero `27c5d89`, lo stesso di `c365916`.
   - `git switch --no-track -c redesign/cliente-07-profilo origin/redesign/cliente-mobile` → `ec64733`, nessun upstream.
   - Le sonde del fuso, da PowerShell (`node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"`): `UTC` → `0`; `America/Los_Angeles` → `420`; senza `TZ` (Roma) → `-120`.
   - I cancelli su `ec64733`, senza toccare niente: typecheck 0 errori; lint 0 errori e **14** avvisi; **1239 test in 61 file**, tutti verdi (13,0 s); build riuscita.
   - Lo script dei controlli su `ec64733` dà la colonna «oggi» del §6 riga per riga (§6 qui sotto la riporta accanto all'uscita finale).
1. ☑ **Il coach da `get_my_coach`** (§4.1). `810166b`: `MyCoachRow` e `bookCoach` in `src/lib/coach-contacts.ts` (con la testa riscritta), `src/hooks/use-my-coach.ts`, i quattro casi del §5.2 in `coach-contacts.test.ts` (9 test, verde). D0 `useMyCoach 1 · bookCoach 1`.
2. ☑ **Le pagine leggono il coach** (§4.2, §4.6). `99809b0`: `useMyCoach()` nelle cinque pagine al posto di `NO_COACH`, `coach` nelle dipendenze dei tre `useMemo` dello Store, i commenti del §4.6 (e `book-sheets.tsx`). Typecheck 0, lint 0 e 14, D2 `NO_COACH 0 · useMyCoach 1` nelle cinque pagine, D6 `0 file`, D11 `avvisi: 0`, suite verde (1243), D7 a commit fatto `0` su tutti e cinque.
3. ☑ **Le regole del Profilo** (§4.3). `ef18915`: `src/lib/client-settings.ts`, `clientAttendance` in `client-sessions.ts` (e `attendanceSummary` che la chiama), `validBlockCount` in `client-credits.ts` (e `getClientBlockInfo` che la chiama), `client-settings.test.ts` (30 test) e i casi del §5.3. I quattro file verdi (109), D0 `12 su 12 · … · clientAttendance 1 · validBlockCount 1`, D5 all'atteso nelle prime due righe, D8 vuoto. Prima del commit la stampa di Cowork sul ramo: uguale all'atteso nei tre fusi.
4. ☑ **La pagina, i fogli, l'interruttore** (§4.4). `d6e9490`: `client.settings.tsx` riscritto, `client-settings-sheets.tsx`, `client-switch.tsx`, `settings-row.tsx` tolto. `git add` dei due file nuovi prima dello script: D0 `ClientSwitch 1`, D2 anche per il Profilo, D3 tutto 0 e `assente · 0`, D4 `0 · 0`, D5 `clientAttendance 1 · attendanceSummary 0`, D11 `0`, D13 `0`; typecheck 0, lint 0 e 14. Una prova di fumo nel browser prima del commit (B1 su Giulia, 16 su 16).
   - ⚠️ `max-[360px]:hidden` e non `max-[359px]` per le icone dei contatti (§10, punto 1); `ComponentRef` e `SubmitEvent` al posto dei tipi deprecati (§10, punto 2).
5. ☑ **`PIANO.md`** (§4.7). `35590e5`: la riga 07 a `[x]`, con `sed` (l'hook Prettier riformatterebbe tutto il file), `git diff --numstat` `1 1`; D9 le due righe attese.
6. ☑ **I cancelli e le prove rosse** (§2, §7). Nessun commit. I cancelli su `35590e5` e di nuovo, dopo la revisione, su `8ad35fb` (§4); i quattro file nei tre fusi da PowerShell (§4); R1-R17 e R20 con l'arnese della 06b adattato (§7), R18 con lint e D11 (§7).
7. ☑ **Il browser** (§8). Nessun commit: il banco sta nello scratchpad. `giro07.mjs` 147 su 147; R19 rossa (10 su 11, Giorgio) e verde a file rimesso (11 su 11); B12: `giro04` 104 su 104, `giro-sessioni` 78 su 78, `giro-prenota` 82 su 82, `giro05-cowork` 149 su 152 coi soli tre KO di oggi.
8. ☑ **Chiusura** (§10). Lo script dei controlli a lavoro committato (§6), questo file, `git push -u origin redesign/cliente-07-profilo`, la PR (§2).
9. ☑ **Passo aggiunto: la revisione.** `8ad35fb`. Un revisore in sola lettura (un agente, circa 12 minuti) ha letto una fotografia del ramo a `35590e5` (`git archive` nello scratchpad) col diff e il brief. Nove punti: tre veri e corretti, sei dichiarati (§11).
   - **L'errore del server a foglio chiuso** (`client-settings-sheets.tsx`): chiudendo «Cambia password» (Esc, trascinamento, «Indietro») mentre il salvataggio era in volo, `reset()` svuotava i campi e poi l'errore del server scriveva nel foglio chiuso, che alla riapertura mostrava «È la password che usi già…» su un campo vuoto. Ora un contatore di giri: una risposta arrivata dopo la chiusura si ignora.
   - **L'interruttore con `disabled`** (`client.settings.tsx`, `client-switch.tsx`): attivato da tastiera, il pulsante diventava `disabled` per tutta la richiesta del permesso e il browser mandava il focus sul `body`. Ora `aria-disabled` mentre lavora (il tocco si ignora, come `BookRetryCard` della 05), e `ClientSwitch` ha gli stili anche per `aria-disabled`.
   - **Il focus dopo «Salva» con errore**: restava sul pulsante e uno screen reader non annunciava niente. Ora va sul primo campo in errore (che ha `aria-describedby` verso il testo), e sul primo campo con l'errore del server.
   - Dopo la correzione: typecheck 0, lint 0 e 14, i quattro file 109 su 109, lo script dei controlli all'atteso, `giro07.mjs` di nuovo 147 su 147.

## 2 · RAMO E COMMIT

- Ramo: `redesign/cliente-07-profilo`, da `origin/redesign/cliente-mobile` @ `ec64733` (albero `27c5d89`), senza upstream (`--no-track`). L'ultimo commit di codice è `8ad35fb` (la revisione); dopo c'è solo il commit di questo file.
- I commit del ramo, dal primo:
  - `ea4a658` Il piano della passata 07 in testa a docs/ULTIMO-RITORNO.md (il piano del passo 0)
  - `810166b` Il coach del cliente da get_my_coach: useMyCoach e bookCoach
  - `99809b0` Le pagine del cliente leggono il coach con useMyCoach
  - `ef18915` Profilo: le regole in client-settings.ts
  - `d6e9490` Profilo: la pagina nuova, i fogli e l'interruttore
  - `35590e5` PIANO.md: la passata 07 è fatta
  - `8ad35fb` Revisione: il foglio della password e l'interruttore tengono il focus e ignorano le risposte in ritardo
  - il commit di questo file («Riscrive docs/ULTIMO-RITORNO.md per la passata 07»)
- PR: aperta con questo file come descrizione, verso `redesign/cliente-mobile`, **non** unita (il numero sta nella risposta in chat: nasce dopo questo file).

## 3 · MANIFESTO

- **NUOVI (5):** `src/lib/client-settings.ts`, `src/lib/client-settings.test.ts`, `src/hooks/use-my-coach.ts`, `src/components/client-settings-sheets.tsx`, `src/components/client-switch.tsx`.
- **MODIFICATI (19):**
  - il coach: `src/lib/coach-contacts.ts`, `src/lib/coach-contacts.test.ts`;
  - le pagine: `src/routes/client.index.tsx`, `src/routes/client.book.tsx`, `src/routes/client.sessions.tsx`, `src/routes/client.store.tsx`, `src/components/client-booking-detail-view.tsx`, `src/routes/client.settings.tsx` (riscritto);
  - le regole: `src/lib/client-sessions.ts` (`clientAttendance`), `src/lib/client-sessions.test.ts`, `src/lib/client-credits.ts` (`validBlockCount`), `src/lib/client-credits.test.ts`;
  - solo commenti: `src/lib/client-book.ts`, `src/lib/client-home.ts`, `src/lib/client-session-detail.ts`, `src/lib/client-store.ts`, `src/components/book-sheets.tsx`;
  - `design_handoff_cliente_mobile/PIANO.md` (la riga 07), `docs/ULTIMO-RITORNO.md`.
- **TOLTI (1):** `src/components/settings-row.tsx` (lo importava solo `client.settings.tsx`).
- **NEL PERIMETRO MA NON TOCCATI:** `src/hooks/use-my-coach.test.ts` (ammesso da D1, non scritto: il hook è rete e cache, e lo prova il banco con B3; i test restano in 62 file). `package.json`, `bun.lock`, `supabase/`, `src/lib/testing/*`, `src/integrations/supabase/types.ts` non cambiano (D9, D10).

## 4 · I CANCELLI

| | su `ec64733` (passo 0) | alla fine, su `8ad35fb` |
|---|---|---|
| typecheck | 0 errori | 0 errori |
| lint | 0 errori e 14 avvisi | 0 errori e 14 avvisi, gli stessi della base (nessun `react-hooks/exhaustive-deps`: D11 `avvisi: 0`) |
| test | **1239 in 61 file**, tutti verdi (13,0 s) | **1276 in 62 file**, tutti verdi su `35590e5` e di nuovo su `8ad35fb` (il file nuovo è `src/lib/client-settings.test.ts`; nessun `use-my-coach.test.ts`) |
| build | riuscita | riuscita (`✓ built in 32.01s` su `35590e5`, `✓ built in 24.71s` su `8ad35fb`) |

- I quattro file del §5 nei tre fusi, da PowerShell, con la sonda `node -e "console.log(new Date(2026, 8, 28).getTimezoneOffset())"` prima di ogni giro: `UTC` → sonda `0`, **109 su 109**; `America/Los_Angeles` → sonda `420`, **109 su 109**; senza `TZ` (Roma) → sonda `-120`, **109 su 109** (`client-settings` 30 `it`, `coach-contacts` 9, `client-sessions` 32, `client-credits` 38).
- ⚠️ Un giro della suite intera prima del commit del passo 4 ha dato un rosso in `src/lib/clock.test.ts` (un file non toccato, 9,5 s): da solo passa 7 su 7, e la suite dopo `35590e5` è verde (1276 su 1276). In quel momento era aperto `tlou-i` (1,9 GB) e la memoria fisica libera era 0,3 GB, impegnabile 5,5: il rosso era del carico. Nessun programma di Nicolò chiuso; `--no-file-parallelism` non è servito.
- **La stampa di Cowork sul ramo** (`app/stampa-cli-07-2026-10-02.ts`, lanciata dallo scratchpad col risolutore `app/risolutore-ts-cli`, `node --experimental-transform-types --import register.mjs`, `REPO` sul clone, da PowerShell): a Roma (sonda −120), in UTC (0) e a Los Angeles (420) la stessa uscita, sha `280e70ca2f5fafb7`, **uguale chiave per chiave a `app/atteso-cli-07-2026-10-02.json`** (confronto JSON contro JSON, 0 differenze nei tre fusi). È la prova che nomi, firme e testi del §4 tengono.

## 5 · I PEZZI PER LE PASSATE DOPO

- `useMyCoach(): { coach: BookCoach; row: MyCoachRow | null }` (`src/hooks/use-my-coach.ts`): `useQuery` con chiave `["get_my_coach", meId]`, attiva solo con `meId`, `staleTime` 5 minuti, `retry: 1`; chiama `rpc("get_my_coach")` con la chiamata rilassata; `coach` è `bookCoach(row)` dentro un `useMemo` su `row` (stesso oggetto fra un disegno e l'altro); un errore → `captureMessage("get_my_coach non risponde: i testi del cliente dicono «il tuo coach»", "warning")` una volta per pagina caricata (segno a livello di modulo).
- `MyCoachRow { id, full_name, phone, email }` e `bookCoach(row: MyCoachRow | null): BookCoach` (`src/lib/coach-contacts.ts`): senza riga o senza nome la costante `NO_COACH`.
- `src/lib/client-settings.ts`: `profileIdentity`, `coachCard` (`CoachLinkKind`, `CoachLink`, `CoachCardModel`), `profilePathRows` (`ProfileRow`), `pushRow` (`PushState`, `PushControl`, `PushRowModel`) con `PUSH_ON_TOAST`, `PUSH_OFF_TOAST`, `PUSH_DENIED_TOAST`, `PUSH_ERROR_TOAST`, `calendarInviteText`, `googleLinked` (`AuthIdentityUser`), `googleRow`, `googleLinkText`, `googleLinkToast`, `installRow` (`InstallRowModel`), `passwordCheck` (`PasswordCheck`, `PASSWORD_MIN_LENGTH`), `passwordSaveError`, `PASSWORD_SAVED_TOAST`. La 08, quando il server manderà gli avvisi del coach, cambia il testo «Attive: …» di `pushRow` e il suo test.
- `ClientSwitch` (`src/components/client-switch.tsx`): i primitivi di Radix, 52×32, area di tocco 44 (`::before`), `aria-labelledby` lo dà chi lo usa.
- `PasswordSheet({ open, onOpenChange, onSave: (password) => Promise<string | null> })` e `GoogleLinkSheet({ open, onOpenChange, email, onConfirm })` (`src/components/client-settings-sheets.tsx`).
- `clientAttendance(bookings, now): Attendance | null` (`src/lib/client-sessions.ts`), la presenza di Sessioni e del Profilo; `validBlockCount(blocks): number` (`src/lib/client-credits.ts`), il «di 6» di Home e Profilo.

## 6 · ACCEPTANCE

`bash "C:/Coworks/NC App Development/app/controlli-cli-07-2026-10-02.sh"` dalla radice del clone, contro `origin/redesign/cliente-mobile`, a lavoro committato (`8ad35fb`, l'ultimo commit di codice; la stessa uscita riga per riga su `35590e5`, prima della revisione). L'uscita intera, con la colonna «oggi» (passo 0, su `ec64733`) accanto dove differisce.

```
== D0 · i nomi nuovi
client-settings: 12 su 12 · useMyCoach 1 · bookCoach 1 · clientAttendance 1 · validBlockCount 1 · ClientSwitch 1
   (oggi: 0 su 12 · 0 · 0 · 0 · 0 · 0)
== D1 · il manifesto (file cambiati fuori dall'elenco del §4)
(fine D1)                                                   (oggi: vuoto)
== D2 · il coach: dalle pagine sparisce NO_COACH, arriva useMyCoach, get_my_coach in un posto
src/routes/client.index.tsx: NO_COACH 0 · useMyCoach 1                  (oggi: 2 · 0)
src/routes/client.book.tsx: NO_COACH 0 · useMyCoach 1                   (oggi: 2 · 0)
src/routes/client.sessions.tsx: NO_COACH 0 · useMyCoach 1               (oggi: 2 · 0)
src/routes/client.store.tsx: NO_COACH 0 · useMyCoach 1                  (oggi: 2 · 0)
src/components/client-booking-detail-view.tsx: NO_COACH 0 · useMyCoach 1 (oggi: 2 · 0)
src/routes/client.settings.tsx: NO_COACH 0 · useMyCoach 1               (oggi: 0 · 0)
get_my_coach chiamata fuori da use-my-coach.ts (codice, test esclusi): 0 file · dentro: 1   (oggi: 0 file · dentro: 0)
il coach dei testi da bookCoach: 1                                      (oggi: 0)
== D3 · il Profilo di prima non c'è più
pagina: email_notifications 0 · «Le tue sessioni residue» 0 · «sessioni fatte» 0 · key={p.name} 0 · SettingsRow 0 · findCurrentBlock 0 · useCoachEventTypes 0 · «Esci dall'account» 0 · «Email di conferma» 0
   (oggi: 4 · 1 · 1 · 1 · 3 · 2 · 2 · 1 · 2)
settings-row.tsx: assente · chi lo importa: 0                           (oggi: presente · 1)
== D4 · niente conti né testi delle regole nella pagina e nei fogli
conti: 0                                                                (oggi: 8)
testi delle regole: 0                                                   (oggi: 1)
== D5 · le regole del percorso sugli helper della 00 e di Sessioni
client-settings: getClientBlockInfo 1 · validBlockCount 1 · blockTiming 1 · getCoachContacts 1 · isValidBlock 0 · getAttendance 0 · resolveCurrentBlock/clientReferenceBlock 0
   (oggi: tutto 0, il file non c'era)
client-sessions: getAttendance 1 · clientAttendance 2 · client-credits: validBlockCount 2 · isValidBlock 5
   (oggi: getAttendance 1 · clientAttendance 0 · validBlockCount 0 · isValidBlock 5)
la presenza nella pagina: clientAttendance 1 · attendanceSummary 0     (oggi: 0 · 0)
== D6 · i commenti che dopo il giro del 02/10 direbbero il falso
frasi vecchie: 0 file                                                   (oggi: 10 file)
== D7 · solo commenti in client-book, client-home, client-session-detail, client-store e book-sheets
src/lib/client-book.ts: righe di codice cambiate 0
src/lib/client-home.ts: righe di codice cambiate 0
src/lib/client-session-detail.ts: righe di codice cambiate 0
src/lib/client-store.ts: righe di codice cambiate 0
src/components/book-sheets.tsx: righe di codice cambiate 0              (oggi: 0, tutti)
== D8 · nei test di prima non si toglie niente (le righe tolte dai file di test che c'erano, import esclusi)
(fine D8)                                                               (oggi: vuoto)
== D9 · PIANO.md: solo la riga 07; il resto del pacchetto e le funzioni del server non cambiano
  -| 07 | [Profilo](passes/07-profilo.md) | R1–R5, H6, N5, O4, V6 | 01 | sì | [ ] |
  +| 07 | [Profilo](passes/07-profilo.md) | R1–R5, H6, N5, O4, V6 | 01 | sì | [x] |
(fine D9)                                                               (oggi: nessuna riga)
== D10 · nessuna dipendenza nuova
(fine D10)                                                              (oggi: vuoto)
== D11 · le dipendenze dei hook dove entra il coach (react-hooks/exhaustive-deps nelle pagine)
avvisi: 0                                                               (oggi: 0)
== D12 · i commit del ramo
  8ad35fb Revisione: il foglio della password e l'interruttore tengono il focus e ignorano le risposte in ritardo
  35590e5 PIANO.md: la passata 07 è fatta
  d6e9490 Profilo: la pagina nuova, i fogli e l'interruttore
  ef18915 Profilo: le regole in client-settings.ts
  99809b0 Le pagine del cliente leggono il coach con useMyCoach
  810166b Il coach del cliente da get_my_coach: useMyCoach e bookCoach
  ea4a658 Il piano della passata 07 in testa a docs/ULTIMO-RITORNO.md
(fine D12)                                                              (oggi: vuoto; il commit di questo file viene dopo)
== D13 · il collegamento WhatsApp nasce in un posto (whatsappUrl di calendar-events.ts)
«wa.me» nel codice del cliente (pagine, componenti, hook, regole; commenti e test esclusi): 0   (oggi: 0)
```

Lo stesso script lanciato al passo 0 ha dato la colonna «oggi» del §6 del prompt riga per riga; a ogni passo le righe del passo sono passate all'atteso (D0 e D2 al passo 1 e 2, D6 e D11 al passo 2, D7 a commit fatto, D5 al passo 3, D3, D4 e D13 al passo 4 dopo il `git add` dei due file nuovi, D9 al passo 5).

## 7 · LE PROVE ROSSE

L'arnese è quello della 06b (`rosse.mjs` + `mutazioni.json`, nello scratchpad), adattato ai quattro file del §5: per ogni mutazione una sostituzione esatta che deve trovare il testo una volta sola, i quattro file con `vitest run --reporter=json`, i test caduti raccolti dal JSON, i file rimessi e controllati con lo sha256. Fuso di Roma, come dice il §7. Prima e dopo: **109 su 109** verdi. Ogni mutazione cade sui casi che il §7 prevede; «N file» è il conteggio di vitest, che conta anche i `describe`.

| | cosa ho rotto | rosso |
|---|---|---|
| R1 | `client-settings.ts`: «Blocco in corso» anche per il fisso (`timing === "current"` senza `recurring`) | 4 test: il fisso in corso, l'ultimo giorno e il giorno dopo, il blocco annullato, «senza path_type» (105/109) |
| R2 | «Rinnovo» con `dayText(end)` invece del giorno dopo | 1: l'abbonamento che si rinnova (108/109) |
| R3 | il «di M» con `blocks.length` | 1: il blocco annullato in mezzo, «2 di 3» (108/109) |
| R4 | `timing === "past"` mai vero: il finito trattato come in corso | 1: il percorso finito, «Blocco 2 di 2» e «Fine del blocco» al posto di «Concluso» (108/109) |
| R5 | «Inizio del blocco» con la fine | 1: i due «Inizio del blocco» (fisso e abbonamento) (108/109) |
| R6 | Chiama con `tel:${row.phone}` così com'è | 2: i tre collegamenti di Marco (`tel:+39 347 555 01 23`) e il telefono `javascript:alert(1)`, che diventa un href (107/109) |
| R7 | `bookCoach` con `whatsapp: row.phone` | 2: Marco (`+39 347 555 01 23` al posto di `https://wa.me/…`) e `javascript:alert(1)` non nullo (107/109) |
| R8 | `if (s.supported)` senza `ready` | 2: «Come fare» con `ready` falso (`'switch'` al posto di `'come-fare'`) e l'installata senza push (107/109) |
| R9 | il caso `markedInstalled` saltato | 1: segnata ma aperta nel browser (108/109) |
| R10 | `PASSWORD_MIN_LENGTH - 1`: 7 caratteri bastano | 2: «ora 7» (`firstInvalid` falso) e «1234567» uguali con `canSave` (107/109) |
| R11 | `secondInvalid` senza `tried` | 2: «diverse prima del salvataggio» e «corta mentre si scrive» (107/109) |
| R12 | il ramo `same_password` mai vero | 1: `passwordSaveError` («Non siamo riusciti…» al posto di «È la password che usi già…») (108/109) |
| R13 | `calendarInviteText` senza `trim` | 1: `"  "` dà la frase invece di `null` (108/109) |
| R14 | `googleLinked` senza il ramo dei `providers` | 1: il primo caso, `providers` con google e senza identità (108/109) |
| R15 | `installRow` con `installed` solo | 1: `installRow(false, true)` dice «Installa l'app» (108/109) |
| R16 | `clientAttendance` senza il filtro su `deleted_at` | 2: `clientAttendance` di Giulia (67% al posto di 75%) e `attendanceSummary` (107/109) |
| R17 | `validBlockCount` con `blocks.length` | 3: `validBlockCount` (3 al posto di 2), `getClientBlockInfo` coi blocchi annullati («Blocco 2 di 3») e il blocco annullato del Profilo (106/109) |
| R18 | `client.store.tsx`: `coach` tolto dalle dipendenze di `products` | il lint passa da 14 a **15** avvisi; D11 `avvisi: 1 · src/routes/client.store.tsx:150 React Hook useMemo has a missing dependency: 'coach'`; rimesso: 14 e `avvisi: 0` (`r18.mjs`, sha256 uguale) |
| R19 | `client.store.tsx` su `const coach = NO_COACH` (con l'import) | vedi §8 |
| R20 | `opens: !installed && !markedInstalled` | 1: `installRow(false, true)` con `opens` falso (108/109) |

Tutti i file sono stati rimessi con lo sha256 uguale, a ogni mutazione; `git status` pulito alla fine (salvo questo file).

## 8 · IL BROWSER

Il banco di Cowork (`app\banco-cli-2026-09-30`) copiato nello scratchpad della sessione (`%TEMP%\claude\C--Coworks-NC-App-Development-repos-nc-calendar\f2213923-826d-4679-b6ca-2ad30ea545ba\scratchpad\banco`), con `lib-windows.mjs` rinominato in `lib.mjs` (l'originale in `lib-linux.mjs`), `app\atteso-cli-04-2026-09-30.json` copiato accanto alla cartella del banco, e la cartella fissa di `giro-prenota.mjs` (`DIR`, righe 10-11) puntata allo scratchpad. Playwright dalla cache di `npx` e Chromium `chromium_headless_shell-1200`, come dice `lib.mjs`: nessuna installazione. Il codice è quello del ramo: `35590e5` nel primo giro, in R19 (rotto nell'albero di lavoro e poi rimesso) e in B12; `8ad35fb` nel giro ripetuto dopo la revisione, di nuovo 147 su 147. Nessuna correzione a `giro07.mjs`: il mio markup è quello che il giro legge.

- **`giro07.mjs` (B1-B11), `porta=5507`, `DATI05=dati-cli-06-2026-10-01.json`: `ESITO: 147 su 147`**, come sul ramo simulato di Cowork. Dentro:
  - **B1** · le nove persone a 390×844 (12 prove ciascuna: «Profilo», i tre titoli nell'ordine, le iniziali, nome ed email, la card del coach col solo `mailto:coach@esempio.test`, le righe del percorso uguali alle attese, «Booster» solo per Giulia, Marta, Luca, Sara e Paola, le notifiche del banco con «Come fare», l'invito con l'email della persona, «Accesso con Google» con «Collega», «Cambia password», «Installa l'app», «Esci», nessuno dei testi di prima). Schermate: `banco\schermate-07\b1-giulia-390.png`, `b1-davide-390.png`.
  - **B2** · il coach col telefono: «WhatsApp» (`https://wa.me/393475550123`, `target="_blank"`, `rel="noopener noreferrer"`), «Chiama» (`tel:+393475550123`), «Email»; `b2-giulia-coach-390.png`.
  - **B3** · senza `get_my_coach` (404 `PGRST202`): nessuna card del coach, le righe del percorso di Giulia uguali, **una** segnalazione a Sentry con `get_my_coach` nel messaggio; lo Store di Giorgio dice «… scrivi a Nicolò.» con la funzione e «… scrivi al tuo coach.» senza; la Home di Davide «… scrivi a Nicolò: ti proporrà il prossimo percorso.» con e «… scrivi al tuo coach: …» senza.
  - **B4** · ad app installata col service worker finto: l'interruttore `aria-checked="false"` e «Disattivate: …», «App installata» non è un pulsante; acceso → `aria-checked="true"`, «Attive: …», il toast «Notifiche sul telefono attivate.», una scrittura su `push_subscriptions`; spento → «…disattivate.» e la riga tolta.
  - **B5** · «Cambia password»: «1234567» → «Servono almeno 8 caratteri (ora 7).» e `aria-invalid="true"`; il campo a fuoco ha il contorno `solid` di 2 px; diverse e «Salva» → «Le due password non coincidono.», `aria-invalid` sul secondo, nessuna scrittura; `same_password` dal server → «È la password che usi già: scegline una diversa.» nel foglio e **nessun toast**; «Salva» di nuovo → il foglio si chiude, «Password aggiornata.», due scritture «12345678».
  - **B6** · «Collega» apre «Collega Google» col testo di Giulia; «Esci e collega Google» → `/auth/v1/logout` e `/auth`; collegata: «Collegato: puoi entrare anche con Google», senza «Collega».
  - **B7** · «Installa l'app» apre «Installa NC Calendar» con «…attiva le notifiche da qui»; «Come fare» apre lo stesso foglio; «Ho installato l'app» → «App installata» che resta un pulsante e riapre il foglio, le notifiche dicono «Per riceverle apri l'app dall'icona sulla schermata Home.» senza «Come fare», e il focus non è sul `body` (torna sul titolo «Account»).
  - **B8** · 320×800 col coach col telefono: niente che esce, `scrollWidth` del documento nella finestra, niente `position: fixed` nel contenuto, al più un pulsante pieno per card, icone dei contatti nascoste (`squeezed: []`); `b8-giulia-320.png`.
  - **B9** · `training_blocks` in errore: «Il percorso non si è caricato» con «Riprova», nessuna riga; «Cambia password», «Esci» e «Come fare» ci sono.
  - **B10** · «Esci» → `/auth/v1/logout` e `/auth`.
  - **B11** · zero richieste esterne bloccate, zero funzioni server, zero errori di pagina, nessun avviso di React sulle chiavi doppie.
- **R19** (§7, nel browser): lo Store rotto nell'albero di lavoro con `sed` (`const coach = NO_COACH;` e l'import al posto di `useMyCoach`), `r19.sh`: D2 sullo Store → `NO_COACH 2 · useMyCoach 0`; `giro07.mjs solo=B3` → **10 su 11**, `KO giorgio · B3 Store, get_my_coach ok` (atteso `true`, visto `false`: lo Store di Giorgio dice «scrivi al tuo coach.» anche con la funzione). `git restore src/routes/client.store.tsx` (sha256 uguale, `e87379fa302e4e4b`), D2 → `NO_COACH 0 · useMyCoach 1`, `solo=B3` → **11 su 11**. Nessun commit.
- **B12** · i quattro giri di prima sul mio ramo, copiati da `app\` così come sono (salvo `lib.mjs`, la cartella di `giro-prenota.mjs` e l'atteso della 04 accanto): `giro04.mjs porta=5470` → **104 su 104**; `giro-sessioni.mjs porta=5440` → **78 su 78**; `giro-prenota.mjs porta=5420` → **82 su 82** (i 500 in coda all'uscita sono quelli che B13 inietta apposta); `giro05-cowork.mjs porta=5490` → **149 su 152**, coi soli tre KO di oggi (`giorgio · crediti · righe`, `giorgio · crediti · fondo`, `nina · crediti · fondo`: le attese della 05 dicono «Acquista un Booster» e dalla 06 chi è nell'ultima settimana, o senza un blocco in corso, vede «Per altri crediti scrivi al tuo coach.»). Lanciati dalla copia, senza `DATI05`, uno dopo l'altro; il coach lì resta `NO_COACH` perché i loro finti rispondono vuoto a `get_my_coach`. Le uscite intere in `banco\b12-<giro>.txt`.

## 9 · NON FATTO

- `src/hooks/use-my-coach.test.ts` (facoltativo per D1): non scritto. Il hook è rete e cache (TanStack Query e Supabase), e un test unitario in Node senza React né rete proverebbe poco; quello che conta (NO_COACH finché non arriva, 404 `PGRST202` senza rompere niente, una segnalazione sola a Sentry, le pagine che leggono il coach) lo prova il banco con B3, e `bookCoach` ha i suoi test. I file di test restano 62.
- Nient'altro del prompt è rimasto fuori: R1-R20 fatte (R19 nel browser), B1-B12 fatti.

## 10 · DIVERGENZE

Fra questo prompt e il repo, e fra il mio ramo e il ramo simulato di Cowork (che è la prova, non l'ordine). Nessun nome, firma o testo del §4 cambiato.

1. **`max-[360px]` e non `max-[359px]`** per nascondere le icone dei contatti del coach (`src/routes/client.settings.tsx`, la classe `max-[360px]:hidden`). Il prompt dice «sotto i 360 px le icone si nascondono»; il ramo simulato usa `max-[359px]:hidden`. In Tailwind v4 `max-[X]` compila in `width < X` (misurato: `node_modules/tailwindcss/dist/lib.js`, `width < ${h}`, e nel CSS della build `@media not all and (min-width:360px){.max-\[360px\]\:hidden{display:none}}`): con 359 a 359 px le icone si vedrebbero ancora. A 320 (B8) non cambia niente.
2. **`ComponentRef` e `SubmitEvent` al posto di `ElementRef` e `FormEvent`** (`src/components/client-switch.tsx:14`, `src/components/client-settings-sheets.tsx:20,64`): @types/react 19.2.14 li segna deprecati (`FormEvent doesn't actually exist`); il ramo simulato e `coach-dialog.tsx` del repo usano ancora i vecchi. Solo tipi, stesso JavaScript.
3. **La descrizione `<meta>` della pagina** (`src/routes/client.settings.tsx`, `DESCRIPTION`): «I tuoi dati, il tuo coach, il percorso, le notifiche e l'account.» al posto di «Gestisci i tuoi dati personali, le notifiche e le preferenze dell'account.», come nel ramo simulato: la pagina non gestisce più dati personali (fuori scope del brief). Il titolo resta `clientPageTitle("Profilo")`.
4. **Lo scheletro dell'identità** è un tondo e due righe (`AuraSkeleton`, con `aria-busy`) e non un blocco solo come nel ramo simulato; quello del percorso ha `aria-busy="true"` come gli scheletri della Home. `profileReady` del giro aspetta che non ci siano `aria-busy` e li vede sparire.
5. **Il piano è il primo commit del ramo** (`ea4a658`), come il §2 permette: sette commit (col passo 9, la revisione) più quello di questo file (D12).
6. Il prompt al §3 dice che il Profilo di oggi ha 573 righe con le righe citate: combacia (`client.settings.tsx:357` `key={p.name}`, `:537` `minLength={6}`, ecc.). Il brief `07-profilo.md:63` e `PIANO.md:21,32,59` chiedono `linkIdentity` e la fermata: non fatte, come il §4.5 punto 1 decide.
7. **I casi in più nei test** (ammessi dal §5, nessuna attesa cambiata): in `client-settings.test.ts` l'abbonamento concluso con presenza 0% («0%» si scrive: un oggetto con `percent: 0` è vero), `googleLinked` con `app_metadata: null` e `identities: null`, `calendarInviteText(undefined)`, `pushRow` segnata con un'iscrizione (`checked` falso), `coachCard` con `full_name: null`; in `coach-contacts.test.ts` `bookCoach` con `full_name: null`; in `client-credits.test.ts` `validBlockCount(PATH)` → 6; in `client-sessions.test.ts` `clientAttendance` con una sola sessione futura → `null`.

## 11 · TROVATI E NON TOCCATI

1. `src/lib/calendar-events.ts:207-210` — `whatsappUrl` tiene lo `00` davanti al prefisso (`0039-347-555-0123` → `https://wa.me/00393475550123`, che WhatsApp non apre; `app/atteso-cli-07-2026-10-02.json`, `numeroConTrattini`). È del lato coach (§9 del prompt, `HANDOFF-CLIENTE.md` §6): il test di `bookCoach` non lo fissa apposta.
2. `src/routes/client.sessions.tsx:247` e `src/components/book-blocked-card.tsx:75` — gli `h2` senza `font-sans` prendono Sora e `-0.02em` dalla regola base di `styles.css:239-247`; il Profilo mostra quello di `BookRetryCard` col percorso perso. Non toccati (§4.4, punto 1).
3. `src/lib/initials.ts` — con un'email come `sara@email.it` dà «SE» (la seconda lettera viene dal dominio): è la regola della 00 e dell'atteso di Cowork (`sara` → «SE»); lo dico perché nel Profilo si vede nell'avatar.
4. `src/components/client-install-sheet.tsx:46` — il toast «App installata: attiva le notifiche dal Profilo.» compare anche quando si è già nel Profilo (da «Come fare» o da «Installa l'app»); il brief non lo cambia, e il foglio è della 01.
5. `src/hooks/use-pwa.ts:128-135` — il segno di «Ho installato l'app» non si toglie mai: è il motivo della regola di `installRow` (§4.3, punto 10), e resta così.
6. `src/lib/push.ts:43` — `subscribeToPush` dice «Permesso negato» con un testo italiano che la pagina riconosce con `includes("permesso")`, come oggi: una stringa come contratto fra due file. Non toccato (`push.ts` non è nel perimetro).

Dalla revisione (§1, passo 9), dichiarati e non cambiati:

7. `src/routes/client.settings.tsx` (la card «Il percorso non si è caricato») compare anche se a fallire è solo `extrasQ` o `eventTypesQ` (`use-client-book-state.ts:117-123`), letture che le righe del percorso non usano. È il contratto del §4.4 («con la lettura persa (`failed`) la card»), lo stesso `failed` della Home; e la riga «Booster» ha bisogno di `state`, che senza quelle letture non c'è.
8. `src/hooks/use-my-coach.ts` — senza la migrazione (404 `PGRST202`) la query non ha mai dati, quindi è sempre stantia: ogni montaggio di una scheda e ogni ritorno sulla finestra rifanno la chiamata (due, con `retry: 1`). La segnalazione a Sentry resta una. Tenuto com'è: `staleTime` 5 minuti e `retry: 1` sono del §4.1, e lo stato senza la funzione è di passaggio (il giro del server del 02/10).
9. `src/routes/client.settings.tsx` — `ready` (il service worker registrato) si legge una volta al montaggio (§4.4, punto 2): un Profilo montato prima della registrazione resta su «Come fare» finché non si rimonta. In pratica `pwa-register` registra all'avvio dell'app, prima di qualunque scheda.
10. `src/lib/coach-contacts.ts:42-43` (la 00) — `tel:` tiene ogni carattere che non sia uno spazio (`+39 347/555…` → `tel:+39347/555…`) e `mailto:` non è validato (`x@y.it?cc=…` aggiungerebbe destinatari): schema fisso, niente script, e il dato è del coach nel suo profilo. Non toccato: l'helper è della 00 e il WhatsApp passa comunque da `whatsappUrl`.
11. `src/lib/current-block.ts:55-56` — il commento dice che `findCurrentBlock` «lo usa ancora il lato cliente (client.settings.tsx)»: dopo questo ramo restano solo i test. Il file non è nell'elenco di D1, quindi il commento resta: da sistemare con la prossima passata che tocca `current-block.ts`.
12. `SubmitEvent` da `react` (`client-settings-sheets.tsx`): il revisore dubitava che i tipi lo esportassero; c'è in `@types/react` 19.2.14 (`index.d.ts:2168`) e il typecheck è 0.

## 12 · RESTA A NICOLÒ

- Il merge della PR nel ramo di integrazione `redesign/cliente-mobile`, dopo la verifica di Cowork.
- Al rilascio su `main`, con il giro del server del 02/10 applicato, che `get_my_coach` risponda: senza (404 `PGRST202`) i testi dicono «il tuo coach», la card del coach non c'è e parte una segnalazione a Sentry per pagina caricata. Se nel profilo del coach manca il telefono, WhatsApp e Chiama non compaiono e resta «Email»: è un dato suo, da scrivere in `profiles.phone`.
- Dopo il rilascio: provare sul telefono «Cambia password» con la password vera, e l'interruttore delle push dall'app installata (il banco finge il service worker).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
