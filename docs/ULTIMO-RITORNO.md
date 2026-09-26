# Ultimo ritorno · Redesign coach, passata 02 (Dialog condivisi)

26/09/2026 · brief `design_handoff_coach_redesign/passes/02-dialog-condivisi.md` · audit P5, O1, O2.

## Ramo, base e hash

- Ramo: `redesign/coach-02-dialog-condivisi`, creato da `origin/main` dopo `git fetch origin`.
- Base misurata come primo passo: `origin/main` = `6ab1f2d4ed1b142151a6284cc6c86b66b110d920`, cioè il merge della PR #67. `git merge-base --is-ancestor 07ae0c3 origin/main` riesce. Rispetto a `07ae0c3`, l'albero di `6ab1f2d` cambia solo in `docs/ULTIMO-RITORNO.md`.
- Commit della passata, in ordine:
  - `c26bcf4` helper puri e test;
  - `afa8f44` store Supabase;
  - `a1f2106` i tre dialog;
  - `ca1869a` Calendario;
  - `659882b` layout e Panoramica;
  - `f2dfa30` Profilo;
  - `332441b` CHECKLIST;
  - `1717972` articolo davanti alle date del Pacchetto («l'11 gen 2027»).
- Questo file è in un commit a parte, subito dopo.
- PR: https://github.com/wolfwood370-cell/nc-calendar/pull/68, aperta e **non** unita.
- «Commit file per file»: ho aggiunto ogni file per nome, mai con `git add -A`. I commit raggruppano i file per funzione e il typecheck passa su ciascuno, provato commit per commit.
- `bun.lock`: l'ho riscritto solo in locale per l'installazione e l'ho rimesso com'era (`git checkout -- bun.lock`) prima di ogni commit. Non compare mai nel diff.

## File toccati (28)

Nuovi (16):

- `src/lib/cancel-session.ts` + test: la regola unica per annullare ed eliminare, e «Ripristina».
- `src/lib/credit-order.ts` + test: l'ordine del server per scegliere a quale allocazione scalare o restituire un credito.
- `src/lib/assign-event.ts` + test: regole di «Assegna evento».
- `src/lib/package-actions.ts` + test: rinnovo, crediti extra, nuovo percorso e il loro ripristino. Sono le scritture che prima faceva `assignPackage`.
- `src/lib/session-store.ts`, `src/lib/package-store.ts`: store Supabase degli helper.
- `src/lib/session-time.ts` + test: formati di data e ora dei dialog, con l'articolo davanti alla data («l'11 gen 2027», «dal 1° ott 2026»).
- `src/components/coach-dialog.tsx`: guscio comune dei dialog del redesign (overlay, raggi, ombre, titoli, pulsanti).
- `src/components/session-cancel-dialog.tsx`: «Annulla o elimina sessione».
- `src/components/assign-event-dialog.tsx`: «Assegna evento».
- `src/components/package-dialog.tsx`: «Pacchetto».

Modificati (10):

- `src/components/calendar-event-tile.tsx`: tolta la conferma della passata 00; «Annulla» apre il dialog condiviso.
- `src/components/calendar-event-edit-dialog.tsx`: «Annullato» non si sceglie più come stato. Il pulsante dice «Annulla sessione» (o «Elimina impegno») e apre il dialog condiviso.
- `src/components/calendar-gcal-review.tsx`: le sessioni `late_cancelled` non contano più tra quelle «non su Google».
- `src/components/edit-booking-dialog.tsx`: «Annulla sessione» ed «Elimina» aprono il dialog condiviso; tolti gli stati «Cancellata — …».
- `src/routes/trainer.calendar.tsx`: collegamento del dialog. `late_cancelled` esce dalla griglia.
- `src/routes/trainer.clients.$id.tsx`:
  - collega i dialog;
  - `saveBookingEdit` salva senza toccare i crediti;
  - lo scollegamento usa la regola del credito;
  - «Rinnova» nel banner di esaurimento;
  - chip «Annullata tardi».
- `src/routes/trainer.index.tsx`: «Rinnova» e «Assegna» aprono i dialog sulla pagina.
- `src/routes/trainer.tsx`: monta «Assegna evento»; alla chiusura l'URL si pulisce con `replace`.
- `design_handoff_coach_redesign/CHECKLIST.md`: passata 02 spuntata.
- `docs/ULTIMO-RITORNO.md`: questo file.

Eliminati (2): `src/components/review-booking-dialog.tsx` e `src/components/assign-package-dialog.tsx`.

## Controlli

Rieseguiti sull'albero dell'ultimo commit di codice (`1717972`):

- build: `npm run build` esce con 0 (`✓ built in 11.67s`, `✓ built in 3.75s`, `✓ built in 13.68s`).
- typecheck: 0 errori.
- lint: `✖ 24 problems (0 errors, 24 warnings)`. Sulla base erano 24: nessun avviso nuovo.
- test: `Tests  183 passed (183)` in 13 file. Prima erano 98; gli 85 nuovi sono:
  - `credit-order` 18;
  - `cancel-session` 29;
  - `assign-event` 18;
  - `package-actions` 15;
  - `session-time` 5.
- `git diff origin/main..HEAD --stat -- supabase/` → vuoto.
- `git diff origin/main..HEAD --stat -- bun.lock package.json` → vuoto.

## Matrice dei casi dell'helper di annullamento

`src/lib/cancel-session.test.ts`: 29 casi, tutti verdi. Girano su un archivio in memoria che applica le stesse condizioni dello store Supabase. Il blocco di prova parte il 21/09 e ha una allocazione PT per settimana. «Ora» è il 25/09/2026 alle 10:40 di Roma.

| Caso | Atteso | Risultato |
|---|---|---|
| 25 ore e 24h + 1 min all'inizio | nessuna scelta | ✓ |
| 24 ore esatte, 23 ore, 30 minuti | la scelta compare | ✓ |
| sessione iniziata (0 ore) o passata (−2 ore) | la scelta compare | ✓ |
| 25 ore, arriva comunque «Addebita» | `cancelled` e credito restituito alla settimana 1; evento Google tolto; `deleted_at` vuoto | ✓ |
| 23 ore e «Restituisci» | `cancelled` e credito restituito | ✓ |
| 23 ore e «Addebita» | `late_cancelled`, crediti invariati, evento Google tolto | ✓ |
| sessione già iniziata, senza scelta esplicita | «Restituisci» (predefinita) | ✓ |
| stessa tipologia, due allocazioni con scadenza 6/10 e 20/10 | vince il 6/10 | ✓ |
| prova rossa: sessione del 7/10 (terza settimana), una allocazione per settimana | torna alla settimana 3, non alla 1 | ✓ |
| sessione senza blocco | torna all'extra della tipologia con la scadenza più vicina | ✓ |
| nessun credito impegnato da restituire | annulla lo stesso, credito «none» | ✓ |
| sessione già annullata | errore, niente toccato | ✓ |
| sessione cambiata tra lettura e scrittura | errore, nessun credito né evento Google toccati | ✓ |
| Google non risponde | annulla lo stesso e lo segnala | ✓ |
| «Elimina» di una sessione inserita per errore | `deleted_at`, credito restituito, evento tolto | ✓ |
| «Elimina» di una sessione già annullata con rimborso | il credito non torna una seconda volta | ✓ |
| «Elimina» di una sessione annullata tardi | il credito torna | ✓ |
| «Elimina» di un impegno personale | nessun credito | ✓ |
| «Ripristina» dopo «Restituisci» | `scheduled`, stesso credito scalato di nuovo, evento Google ricreato con il nuovo id sulla sessione | ✓ |
| «Ripristina» dopo «Addebita» | `scheduled`, crediti invariati, evento ricreato | ✓ |
| «Ripristina» dopo «Elimina» | `deleted_at` vuoto, credito di nuovo impegnato | ✓ |
| «Ripristina» se Google non aveva tolto l'evento | nessun doppione, si tiene l'id | ✓ |
| «Ripristina» col credito già usato da un'altra prenotazione | resta annullata, crediti invariati | ✓ |
| «Ripristina» su una sessione cambiata dopo l'annullamento | errore, niente toccato | ✓ |
| `holdsCredit` | credito impegnato per `scheduled`, `completed`, `no_show`, `late_cancelled`; non per `cancelled` | ✓ |

## Prova rossa

Ho messo al posto di `pickRefundAllocation` (in `src/lib/credit-order.ts`) il `find` di prima di `saveBookingEdit`, cioè la prima allocazione del blocco con la stessa tipologia e almeno un credito impegnato. Poi ho lanciato `npx vitest run src/lib/cancel-session.test.ts`:

```
× stessa tipologia, due allocazioni: vince quella che scade prima
× prova rossa: con più settimane nello stesso blocco il credito torna alla settimana della sessione, non alla prima trovata
AssertionError: expected { kind: 'allocation', …(1) } to deeply equal { kind: 'allocation', …(1) }
-   "id": "scade-6-ott",
+   "id": "scade-20-ott",
AssertionError: expected { kind: 'allocation', id: 'pt-sett-1' } to deeply equal { kind: 'allocation', id: 'pt-sett-3' }
-   "id": "pt-sett-3",
+   "id": "pt-sett-1",
      Tests  2 failed | 27 passed (29)
```

Con l'helper rimesso: `Tests  29 passed (29)`.

## Verifica nel browser

L'ho fatta su `localhost:5199` (`vite dev`) con Playwright e un **finto backend in memoria**. Playwright intercettava tre cose:

- le chiamate PostgREST, cioè filtri, ordinamenti, `insert`, `update` e `delete`, più il vincolo di sovrapposizione delle sessioni;
- l'auth;
- le server function di Google.

Nessuna richiesta è uscita verso Supabase o Google. Ora fissa: 25/09/2026 10:40, Europe/Rome. I dati sono come quelli del prototipo. Il banco di prova sta fuori dal repo. Sono 64 controlli, tutti riusciti, rilanciati dopo l'ultimo commit di codice.

Panoramica (24):

- «Rinnova» su Marta Conti apre «Pacchetto» sulla pagina, già su «Rinnova lo stesso». Il riquadro mostra:
  - «28 set 2026 – 25 ott 2026»;
  - «11 crediti» e «1 credito»;
  - «Il cliente può prenotare le sessioni del nuovo blocco dal 28 set 2026. I 3 crediti residui…».

  È come la schermata del brief. Il rinnovo crea il blocco 2 (28/09–25/10) con le stesse allocazioni, tutte a 0 prenotati. «Ripristina» lo toglie.
- «Assegna» apre il dialog sulla Panoramica (`?reviewEventId=`).
- «Allenamento» del 28/09 assegnato a Giulia: il credito viene dalla settimana 2 del suo blocco. «Ripristina» rimette l'evento da assegnare e restituisce il credito.
- «Allenamento Sara»: Sara è suggerita dal titolo, con «3 crediti Personal Training disponibili» dagli extra; l'assegnazione scala l'extra.
- «Indietro» del browser non riapre l'evento assegnato.

Calendario (19):

- Andrea Gallo, oggi alle 18:00:
  - il dialog mostra la scelta, con «Restituisci» predefinita;
  - «Addebita» porta a `late_cancelled`: il credito resta usato, l'evento Google viene tolto e il tile sparisce dalla griglia;
  - «Ripristina» riporta la sessione a `scheduled`, con un nuovo evento «Personal Training — Andrea Gallo» il cui id è salvato sulla sessione.
- Giulia, 1/10 (più di 24 ore): nessuna scelta. Il credito torna alla settimana 2: i prenotati passano da [2,2,1,0] a [2,1,1,0].
- Il tile tratteggiato apre «Assegna evento»; Esc lo chiude e pulisce l'URL.
- «Commercialista»: compare «Eliminare l'impegno «Commercialista»?», poi elimina e «Ripristina».

Profilo (19):

- «Pacchetto» → «Nuovo percorso»: 3 blocchi e crediti 16/1/1/0 presi dall'ultimo blocco, «Inizia l'11 gen 2027». Con 4 blocchi nascono 4 blocchi in fila dall'11/01/2027, con 3 allocazioni ciascuno. «Ripristina» li toglie.
- «Crediti extra» BIA × 3, poi «Ripristina».
- Sessione annullata: niente stato da scegliere, niente «Annulla sessione».
- Sessione svolta del 23/09:
  - «Annulla sessione» mostra «La sessione è già iniziata o passata.» con la scelta;
  - «Elimina» imposta `deleted_at` e restituisce il credito;
  - «Ripristina» la rimette svolta e riprende il credito.
- Marta: il banner di esaurimento ha «Rinnova», che apre il dialog su «Rinnova lo stesso».
- Sara (cliente libera): solo «Crediti extra» e «Nuovo percorso».

Mobile a 390px (2): «Assegna evento» e «Pacchetto» restano dentro lo schermo e scorrono.

## Cosa non ho fatto e perché

- **Verifica con dati reali.** Il database è su Lovable Cloud, fuori portata. Il finto backend non prova:
  - le policy RLS;
  - i trigger veri;
  - le chiamate a Google.
- **«Rimetti in agenda».** È della passata 06 e non l'ho aggiunto. Nel Profilo il select degli stati permetteva di togliere l'annullamento, ma senza riprendere il credito. L'ho tolto insieme agli stati «Cancellata — …» (una sola regola). Adesso una sessione annullata si rimette com'era solo con «Ripristina» del toast, entro 8 secondi.
  - Non l'ho aggiunto perché i dati non dicono se una sessione `cancelled` ha avuto il credito indietro: il Calendario, prima di questa passata, annullava senza restituirlo. Riprendere un credito in automatico può quindi addebitarlo due volte.
- **Impaginazione delle pagine.** Panoramica, Calendario e Profilo cambiano solo nei punti che aprono i dialog: il resto è delle passate 03, 04 e 06. Il dialog «Modifica sessione» del Profilo tiene il suo aspetto.
- **Dialog «Importa» della riconciliazione Google** (`calendar-gcal-review.tsx`): importa eventi che l'app non ha ancora, quindi non è «Assegna evento». Resta com'è; il pannello passa a Integrazioni con la passata 09.
- **Preset «PT Pack» e data d'inizio scelta a mano** del vecchio dialog. Il preset si ottiene con «Crediti extra» e una quantità. La data non serve: il server rimette comunque i blocchi in fila da `path_start_date` (`repair_blocks_alignment`), quindi un buco tra i blocchi verrebbe chiuso.

## Divergenze dal brief e dal prototipo

- **Backend (§1 del prompt).** Niente parametro nuovo in `cancel_booking`. Il coach annulla con l'helper, e le due scelte scrivono `cancelled` più il rimborso oppure `late_cancelled`.
  - `late_cancelled` resta usato nei contatori perché `quantity_booked` non scende.
  - Nella presenza conta come assenza: `src/lib/attendance.ts:46` e `src/routes/trainer.clients.index.tsx:566-569`.
- **Ordine del rimborso.** Il prompt cita `20260606120000_audit_round2_db_fixes.sql:186`, con l'ordine: scadenza, tipologia, `created_at`. Il consumo attuale del server, `validate_booking_block_allocation` in `20260827143053_4c03121c-40d9-4f2d-8501-15475d9eab70.sql:46-51`, mette due criteri tra tipologia e `created_at`: prima la settimana del blocco, poi la più vicina. Il rilascio del credito in `reschedule_booking`, nello stesso file alle righe 199 e 207-211, fa lo stesso.
  - Ho usato quest'ordine più recente perché è quello che manda il rimborso alla settimana giusta. Con l'ordine della riga 186, e allocazioni settimanali senza `valid_until`, il credito tornerebbe a quella creata per prima, cioè la settimana 1: lo stesso errore del `find`.
- **Rinnovo, nota «da subito».** La nota «Il cliente può prenotare le sessioni del nuovo blocco da subito» non è vera nell'app: il cliente prenota un blocco alla volta (`src/routes/client.book.tsx:449-458`). Ho scritto «Il cliente può prenotare le sessioni del nuovo blocco dal <data>.» (o «dall'8 …», «dall'11 …»); la frase sui residui è quella del brief.
- **«Inizia il <data>».** L'articolo segue la pronuncia del giorno: «Inizia l'11 gen 2027», e «il 1° …» per il primo del mese.
- **Rinnovo, blocco copiato.** «Rinnova lo stesso» copia l'**ultimo** blocco, come il rinnovo automatico del server (`ensure_client_block_state`), e parte il giorno dopo la sua fine. Quando il blocco in corso è l'ultimo, il caso normale di un rinnovo, è la stessa cosa del brief.
- **Nuovo percorso.** I blocchi si accodano dopo l'ultimo, come faceva `assignPackage`, e i vecchi blocchi restano. Per questo la card dice «Sostituisce il percorso attuale.» solo se non ci sono blocchi futuri; altrimenti dice «Parte dopo l'ultimo blocco in programma.».
- **Crediti extra a un cliente senza blocchi.** Il cliente diventa «Cliente Libero», come con la vecchia scelta «Cliente Libero».
- **Assegna evento, da dove viene il credito.** Viene dal blocco che contiene la data dell'evento (a Roma), con l'ordine del server. Se lì non c'è capienza, viene dagli extra della tipologia, come fa `confirmOrphan` del Profilo (`src/routes/trainer.clients.$id.tsx:415`).
  - Il trigger del server cercherebbe in tutti i blocchi del cliente. Mi sono fermato a quello della data per non prendere crediti da blocchi futuri.
  - Il numero mostrato è il residuo del blocco più gli extra; al singolare «1 credito … disponibile».
- **Cliente suggerito.** Basta il nome completo, oppure nome o cognome da soli (almeno 3 lettere, parola intera, accenti ignorati). Con due clienti a pari merito, come «PT Luca» con due Luca, non suggerisco nessuno: il prototipo prendeva il primo. Il cliente suggerito viene portato in vista nell'elenco.
- **Evento già assegnato.** Da un link o da «Indietro», il dialog lo dice invece di permettere una seconda assegnazione.
- **«Elimina».** Ha anche «Ripristina», come nel prototipo; il brief non ne parla. Restituisce il credito solo se è ancora impegnato. Il vecchio `deleteBookingEverywhere` lo restituiva anche per una sessione già annullata con rimborso, cioè due volte.
- **Scollega dal profilo.** Stessa regola del credito, con il rimborso solo a scollegamento riuscito.
- **Toast in più rispetto al brief:**
  - «Sessione annullata.» se non c'era un credito da restituire;
  - «Il credito non è stato restituito.» (usa «Ripristina» e riprova);
  - «L'evento non è stato rimosso da Google Calendar.»;
  - «Sessione ripristinata.», «Impegno ripristinato.», «Pacchetto ripristinato.», «L'evento è di nuovo da assegnare.».
- **Storico del Profilo.** `late_cancelled` diventa «Annullata tardi» (arancione) e non più «No-show»: è il termine della passata 06. Per una sessione annullata, il dialog di modifica mostra «Sessione annullata.» senza «credito restituito», per il caso delle vecchie annullate dal Calendario.
- **Overlay.** Quello del README, `rgba(25,28,31,0.32)`, vale solo per i dialog nuovi. Gli altri tengono il nero dell'`ui/dialog`, per non cambiare il mobile.

## Cosa resta a Nicolò

- **Prova dopo il deploy, con dati veri:**
  - annullare con meno di 24 ore, sia «Restituisci» sia «Addebita», e con più di 24 ore; poi «Ripristina», anche sull'evento Google;
  - «Assegna» con credito;
  - «Rinnova», «Crediti extra» e «Nuovo percorso», ciascuno con «Ripristina» (il ripristino cancella blocco o extra appena creati).
- **Crediti delle vecchie annullate dal Calendario.** Hanno lo stato `cancelled` ma il credito non è mai tornato. Per rimetterlo serve un riconteggio sul database, fuori dalla mia portata. Quello della migrazione `20260608210907` conta solo `scheduled` e `completed`: dovrebbe contare anche `late_cancelled` e `no_show`. Inoltre dà a ogni allocazione della stessa tipologia il totale delle sessioni del blocco, che con allocazioni settimanali è troppo. Solo dopo un riconteggio pulito «Rimetti in agenda» (passata 06) ha una base affidabile.
- **Sessioni assegnate senza credito.** È il caso di «Assegna» con la casella tolta e dell'import Google in modalità cliente: `block_id` è vuoto e nessun credito è stato scalato.
  - Se poi si annullano con «Restituisci», l'helper restituisce un extra della tipologia, se il cliente ne ha uno impegnato: fa così anche `cancel_booking` del server. Il cliente guadagna un credito.
  - Il database non collega la sessione al credito scalato. Serve una colonna, quindi una modifica al database: da decidere.
- **Cambi dopo la prenotazione.** Cambiare tipologia a una sessione prenotata non sposta il credito, sia dal Profilo sia dal Calendario; il dialog del Calendario permette anche di cambiare cliente. È già così sulla base. La passata 04 blocca il cliente.
- **Rinnovi della Panoramica.** Usano ancora la loro regola, che passa a `getRenewalInfo` con la passata 03. Dopo un rinnovo il cliente sparisce dalla card, perché la regola somma tutti i blocchi attivi.
