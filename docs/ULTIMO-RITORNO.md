# Lato cliente · Passata 13 · La parte nell'app del giro del server

Il ramo `redesign/cliente-13-giro-server` porta la correzione di Cowork identica (19 file, D8 19/19) sopra `main` @ `093e88d`. **Non va unito prima della migrazione del giro**: l'app nuova chiama `save_path_schedule`, che sul server nasce con la migrazione.

## Il piano

- [x] **0 · La base**: `git fetch origin`, `origin/main` = `093e88d`, ramo creato da lì, `bun.lock` uguale alla base (`d93afed…`), cancelli sulla base: typecheck 0, lint 0 errori e 13 avvisi, 1483 test in 76 file a Roma, build. Nessun commit.
- [x] **1 · La correzione**: `919dc62`. Patch applicata (sha256 `587b9e9de50a8038…`), 19 file, albero `f48d8703…` come atteso, typecheck 0, D8 19/19 sul commit.
- [x] **2 · Cancelli, controlli, prove rosse**: tutti verdi, nessun commit di prova.
- [x] **3 · La giunzione col server**: 26 su 26, nessun commit.
- [x] **4 · Chiusura**: questo file, push, PR aperta e non unita.

## 1 · Dove ho girato

- `uname -s`: `MINGW64_NT-10.0-26300` (Git Bash); suite nei tre fusi, rosse e giunzione da PowerShell 5.1.
- node `v24.12.0`, bun `1.3.14`.
- Lock: `git hash-object bun.lock` = `d93afeddf8068057f6d78347267b94b9ffacace6`, uguale a `git rev-parse 093e88d:bun.lock`. Nessuna installazione.

## 2 · Base, ramo e commit

- Base: `origin/main` = `093e88d11368e0394e666858b696ffa52235b4ce`.
- Ramo: `redesign/cliente-13-giro-server`.
  - `919dc62` Passata 13: la parte nell'app del giro del server: la campanella del coach, l'id della prenotazione, il calendario del percorso, la riconciliazione con Google
  - il commit di questo ritorno: «Riscrive docs/ULTIMO-RITORNO.md per la passata 13»
- Albero del commit della correzione (`git rev-parse HEAD~1^{tree}` a lavoro chiuso): `f48d8703a8a90ebd0637b7ff4cfbff1d75c38849`.
- PR: vedi il link nell'intestazione della PR stessa (aperta con `gh pr create`, non unita).

## 3 · Manifesto

**Nuovi (3)**: `src/lib/path-schedule.ts`, `src/lib/path-schedule.test.ts`, `src/hooks/use-book-confirm.test.ts`.

**Modificati (16)**:

- `src/components/client-profile-desktop.tsx`, `src/components/client-profile-mobile.tsx`
- `src/components/coach-notes-card.tsx`, `src/components/profile-notes-card.tsx`
- `src/components/trainer-notifications-bell.tsx`
- `src/hooks/use-book-confirm.ts`, `src/hooks/use-gcal-sync.ts`, `src/hooks/use-notifications.ts`
- `src/lib/client-session-detail.ts`
- `src/lib/gcal-repair.ts`, `src/lib/gcal-repair.test.ts`
- `src/lib/gcal-sync-run.ts`, `src/lib/gcal-sync-run.test.ts`
- `src/lib/gcal.functions.ts`
- `src/lib/notifications.ts`, `src/lib/notifications.test.ts`

`git diff --stat 093e88d 919dc62`: 19 file, 1111 inserzioni, 145 cancellazioni.

**Non toccati**: `src/integrations/`, `supabase/`, `package.json`, `bun.lock` (D9 0).

## 4 · I cancelli

|                                           | Sulla base `093e88d` | Sul ramo            |
| ----------------------------------------- | -------------------- | ------------------- |
| typecheck (`tsc --noEmit`)                | 0 errori             | 0 errori            |
| lint                                      | 0 errori, 13 avvisi  | 0 errori, 13 avvisi |
| suite a Roma (sonda `-120`)               | 1483 in 76 file      | **1528 in 78 file** |
| suite UTC (sonda `0`)                     | non misurata         | **1528 in 78 file** |
| suite Los Angeles (sonda `420`)           | non misurata         | **1528 in 78 file** |
| build (`LOVABLE_SANDBOX=1 bun run build`) | uscita 0             | uscita 0            |

Avvisi del lint, uguali sulla base e sul ramo: 9 `react-refresh/only-export-components`, 4 `react-hooks/exhaustive-deps`.

## 5 · Acceptance (controlli di Cowork)

Sulla base l'uscita è quella di `oggi-controlli-cli-13-2026-10-07.txt` (D8 0/19, D6 0): verificato prima di applicare la patch. A lavoro committato `diff` con l'atteso: **vuoto**.

```
D0 Campanella · i due tipi 2 · le guardie 2 · late booleano 1 · titoli: annullata 1 ripristinata 1 · il credito 1 · il giorno da aprire 3 · icone 2 · il telefono dalla funzione 1 · rami scritti a mano nella campanella 0 · le date del telefono con toDate 3 · la campanella rilegge le sessioni 1
D1 Prenotazione · l'id della sessione nell'avviso al coach 1
D2 Percorso · l'RPC 1 · le settimane coi quattro campi 1 · l'errore al chiamante 1 · i due profili: desktop 1 telefono 1 · scritture dirette rimaste: settimane 0 data d'inizio 0
D3 Riconciliazione · overlaps nei conti 1 · gli esiti: nullo come prima 1 sovrapposta 1 già cambiata 1 sconosciuto nei log 1 · il server passa data 2 · «tranne» nel codice 0 · la rapida 1 · avviso: rapida 1 completa 1 · la sincronizzazione automatica le dice 2
D4 Commenti · frasi vecchie rimaste 0 · frasi nuove 5
D5 test nuovi · notifications.test.ts 10/10 · path-schedule.test.ts 3/3 · use-book-confirm.test.ts 1/1 · gcal-repair.test.ts 5/5 · gcal-sync-run.test.ts 7/7
D6 file cambiati, senza il ritorno: 19 · fuori dall'elenco: 0
D7 righe tolte dai test di prima: 13 · fuori dalle attese: 0
D8 file uguali al ramo di Cowork: 19/19
D9 intoccabili cambiati (src/integrations, supabase, package.json, bun.lock): 0
```

## 6 · Le prove rosse

Lanciate a lavoro committato (`py -3 rosse-cli-13-2026-10-07.py`), uscita 0, `git status --short` vuoto dopo. Ultima riga:

`rosse come attese: 20 su 20 · a file rimessi, uscita 0 · Test Files  5 passed (5) · Tests  134 passed (134)`

```
R1 ROSSA · il tardivo ha lo stesso titolo dell'annullamento in tempo
    cadono 2: describeNotification · annullamento e ripristino del cliente > annullata a meno di 24 ore: «Annullata a meno di 24 ore», credito scalato | describeMobileNotification · la riga della campanella sul telefono > annullamento e ripristino: titolo, testo e quando come sul desktop, su due righe
R2 ROSSA · il credito al contrario
    cadono 5: describeNotification · annullamento e ripristino del cliente > annullata in tempo: «Sessione annullata», credito restituito | describeNotification · annullamento e ripristino del cliente > annullata a meno di 24 ore: «Annullata a meno di 24 ore», credito scalato | describeNotification · annullamento e ripristino del cliente > le date di jsonb, con l'offset e coi microsecondi, si leggono | describeNotification · annullamento e ripristino del cliente > il giorno da aprire è quello dell'ora locale, non la data scritta nella stringa | describeMobileNotification · la riga della campanella sul telefono > annullamento e ripristino: titolo, testo e quando come sul desktop, su due righe
R3 ROSSA · il ripristino senza l'orario
    cadono 4: describeNotification · annullamento e ripristino del cliente > ripristinata: «Sessione ripristinata», col solo orario | describeNotification · annullamento e ripristino del cliente > le date di jsonb, con l'offset e coi microsecondi, si leggono | describeNotification · annullamento e ripristino del cliente > il giorno da aprire è quello dell'ora locale, non la data scritta nella stringa | describeMobileNotification · la riga della campanella sul telefono > annullamento e ripristino: titolo, testo e quando come sul desktop, su due righe
R4 ROSSA · un annullamento senza late (o con late non booleano) si mostra lo stesso
    cadono 5: describeNotification · annullamento e ripristino del cliente > annullata senza late → riga neutra | describeNotification · annullamento e ripristino del cliente > annullata con late stringa → riga neutra | describeNotification · annullamento e ripristino del cliente > annullata con late 1 → riga neutra | describeNotification · annullamento e ripristino del cliente > un ripristino scritto come annullamento → riga neutra | describeMobileNotification · la riga della campanella sul telefono > un tipo sconosciuto o un payload malformato: «Notifica» col tipo grezzo, come prima
R5 ROSSA · il giorno da aprire letto dalla stringa (UTC) invece che dall'ora locale
    cadono 1: describeNotification · annullamento e ripristino del cliente > il giorno da aprire è quello dell'ora locale, non la data scritta nella stringa
R6 ROSSA · sul telefono l'annullamento senza l'orario
    cadono 1: describeMobileNotification · la riga della campanella sul telefono > annullamento e ripristino: titolo, testo e quando come sul desktop, su due righe
R7 ROSSA · l'avviso della prenotazione senza l'id della sessione (la campanella apre solo il giorno)
    cadono 1: announce · l'avviso al coach > booking-notifications riceve l'id della sessione appena inserita
R8 ROSSA · le settimane passano coi campi del componente (client_id, coach_id)
    cadono 1: savePathSchedule > una chiamata sola, coi tre argomenti e le settimane coi soli quattro campi
R9 ROSSA · un errore del server non arriva al chiamante (il toast direbbe «salvato»)
    cadono 5: savePathSchedule > l'errore 42501 arriva al chiamante, col suo messaggio per il toast | savePathSchedule > l'errore P0001 arriva al chiamante, col suo messaggio per il toast | savePathSchedule > l'errore 23505 arriva al chiamante, col suo messaggio per il toast | savePathSchedule > l'errore 23502 arriva al chiamante, col suo messaggio per il toast | savePathSchedule > l'errore PGRST202 arriva al chiamante, col suo messaggio per il toast
R10 ROSSA · la sovrapposta si conta come spostata (com'era col server muto)
    cadono 1: riconciliazione · l'esito delle due RPC (passata 13) > annullata, spostata e sovrapposta: ognuna nel suo conto, e la sovrapposta non è spostata
R11 ROSSA · col server di prima (void) niente si conta più
    cadono 2: riconciliazione · annullamenti e spostamenti (passata 11) > un annullamento non riuscito si conta fra le sessioni non aggiornate | riconciliazione · l'esito delle due RPC (passata 13) > il server di prima (void): data nullo o assente si conta come allora
R12 ROSSA · una sessione già cambiata si conta come annullata o spostata
    cadono 1: riconciliazione · l'esito delle due RPC (passata 13) > not_scheduled e not_found: la sessione era già cambiata o eliminata, e non si conta
R13 ROSSA · un esito sconosciuto passa in silenzio
    cadono 1: riconciliazione · l'esito delle due RPC (passata 13) > un esito sconosciuto vale come nullo, e va nei log
R14 ROSSA · la sincronizzazione rapida tace le sovrapposizioni
    cadono 2: sincronizzazione rapida > solo sovrapposizioni: non è «nessuna differenza», ed è un avviso | sincronizzazione rapida > sovrapposizioni con spostamenti, annullamenti e ripristini: dopo le spostate, e un avviso
R15 ROSSA · con le sole sovrapposizioni la completa dice «Nessuna differenza con Google.»
    cadono 2: sincronizzazione completa: l'esito > solo sovrapposizioni: quante sono rimaste all'orario di prima e perché, mai «nessuna differenza» | sincronizzazione completa: l'esito > sovrapposizioni con spostamenti e annullamenti: le allineate senza le sovrapposte
R16 ROSSA · le sovrapposizioni non sono un avviso nella rapida
    cadono 2: sincronizzazione rapida > solo sovrapposizioni: non è «nessuna differenza», ed è un avviso | sincronizzazione rapida > sovrapposizioni con spostamenti, annullamenti e ripristini: dopo le spostate, e un avviso
R17 ROSSA · la sincronizzazione automatica tace le sole sovrapposizioni (RA-3 del revisore)
    cadono 1: sincronizzazione rapida > la sincronizzazione automatica parla anche con le sole sovrapposizioni, e tace senza differenze
R18 ROSSA · sul telefono una data che non si legge fa cadere la campanella (RA-6)
    cadono 1: describeMobileNotification · la riga della campanella sul telefono > una data che non si legge: «Notifica» col tipo grezzo, e la campanella non cade
R19 ROSSA · il conto delle settimane è quello locale, non quello del server (RA-7)
    cadono 1: savePathSchedule > una chiamata sola, coi tre argomenti e le settimane coi soli quattro campi
R20 ROSSA · il ripristino apre il giorno UTC, non quello locale (RA-7)
    cadono 1: describeNotification · annullamento e ripristino del cliente > il giorno da aprire è quello dell'ora locale, non la data scritta nella stringa
rosse come attese: 20 su 20 · a file rimessi, uscita 0 · Test Files  5 passed (5) · Tests  134 passed (134)
```

## 7 · La giunzione col server

Sonda del fuso (senza `TZ`): `-120`. Comando: `npx --yes tsx@4.21.0 --tsconfig tsconfig.json giunzione-giro2.ts giunzione-righe-2026-10-07.txt`, uscita 0.

```
ok      J1 booking.cancelled titolo: "Sessione annullata"
ok      J1 booking.cancelled testo: "Cliente A · Sessione PT"
ok      J1 booking.cancelled quando (sab 10 ott · 07:00 · credito restituito): true
ok      J1 booking.cancelled giorno da aprire: "2026-10-10"
ok      J1 booking.cancelled sessione da aprire: "d0000000-0000-4000-8000-0000000000a1"
ok      J1 booking.cancelled telefono: "Sessione annullata|Cliente A · Sessione PT\nsab 10 ott · 07:00 · credito restituito"
ok      J2 booking.cancelled titolo: "Annullata a meno di 24 ore"
ok      J2 booking.cancelled testo: "Cliente A · Sessione PT"
ok      J2 booking.cancelled quando (mer 7 ott · 20:00 · credito scalato): true
ok      J2 booking.cancelled giorno da aprire: "2026-10-07"
ok      J2 booking.cancelled sessione da aprire: "d0000000-0000-4000-8000-0000000000a2"
ok      J3 booking.restored titolo: "Sessione ripristinata"
ok      J3 booking.restored testo: "Cliente A · Sessione PT"
ok      J3 booking.restored quando (sab 10 ott · 07:00): true
ok      J3 booking.restored giorno da aprire: "2026-10-10"
ok      J3 booking.restored sessione da aprire: "d0000000-0000-4000-8000-0000000000a1"
ok      J3 booking.cancelled titolo: "Sessione annullata"
ok      J3 booking.cancelled testo: "Cliente A · Sessione PT"
ok      J3 booking.cancelled quando (sab 10 ott · 07:00 · credito restituito): true
ok      J3 booking.cancelled giorno da aprire: "2026-10-10"
ok      J3 booking.cancelled sessione da aprire: "d0000000-0000-4000-8000-0000000000a1"
ok      J4 booking.cancelled titolo: "Sessione annullata"
ok      J4 booking.cancelled testo: "Cliente · Sessione PT"
ok      J4 booking.cancelled quando (sab 10 ott · 07:00 · credito restituito): true
ok      J4 booking.cancelled giorno da aprire: "2026-10-10"
ok      J4 booking.cancelled sessione da aprire: "d0000000-0000-4000-8000-0000000000a1"
ESITO: 26 su 26
```

## 8 · Non fatto, e perché

- Browser, database, Google, Supabase, Stripe: esclusi dal prompt (§7, §8). La prova sul telefono la fa Nicolò dopo il Publish.
- La prova rossa della giunzione (21 su 26 senza il fuso): fatta da Cowork, non rifatta.

## 9 · Divergenze dal prompt

- La build l'ho lanciata con `LOVABLE_SANDBOX=1` (come negli arnesi delle passate precedenti su Windows); senza la variabile non l'ho provata.
- La suite sulla base l'ho misurata solo a Roma (come chiede il §2); UTC e Los Angeles solo sul ramo.
- Il `main` locale era indietro (`3d29634`, PR #72) rispetto a `origin/main` (`093e88d`); il ramo nasce da `origin/main`, il `main` locale non è stato toccato.

## 10 · Trovati e non toccati

Nessun difetto trovato nel codice della patch: non ho riletto il codice a mano (non richiesto), mi sono fermato ai controlli, alle rosse e alla giunzione.

## 11 · Resta a Nicolò

1. La seduta del giro del server: backup, letture, migrazione (dall'editor SQL di Lovable).
2. Poi il merge di questa PR, il Publish e la prova sul telefono (campanella con annullamento e ripristino, prenotazione che apre la sessione, calendario del percorso, sincronizzazione con Google con una sovrapposta).
