# Piano di implementazione — lato Cliente mobile

Questo file è il piano da seguire con Claude Code: ordine delle passate, stato, messaggio da mandare per ognuna e punti in cui Code deve fermarsi e aspettare la tua conferma. I dettagli di ogni passata sono in `passes/`, le regole comuni in `README.md`.

## Prima di iniziare
1. Copia la cartella `design_handoff_cliente_mobile/` nella cartella principale di `nc-calendar`, accanto a `design_handoff_coach_redesign/`.
2. Crea da `main` il branch di integrazione `redesign/cliente-mobile`. Le passate 01–05 cambiano la navigazione e, rilasciate una alla volta, lascerebbero pagine a metà: ogni passata parte da questo branch e la sua PR torna qui. Il merge su `main` si fa dopo la passata 09 (o dopo la 05, se vuoi rilasciare prima le pagine principali).
3. Manda un messaggio per sessione, nell'ordine. Prima di passare al successivo controlla la PR, prova la passata sul telefono e fai il merge nel branch di integrazione.

## Ordine e stato

| # | Passata | Punti audit | Dipende da | Si ferma per il backend | Stato |
|---|---|---|---|---|---|
| 00 | [Fondamenta: regole, helper, token](passes/00-fondamenta.md) | O1, O3, B2, H1, H5, H6, T1, T3, T5, V6, V15 | — | sì | [x] |
| 01 | [Shell: barra, intestazioni, fogli, toast](passes/01-shell.md) | N2, N3, N5, O2, T2, V4, V5, V7, V14, H8 (1ª parte) | 00 | — | [x] |
| 02 | [Prenota](passes/02-prenota.md) | B1, B3–B7, N4, O1, D2, V15 | 00, 01 | — | [x] |
| 03 | [Sessioni](passes/03-sessioni.md) | N1, T1, T5, H9, V13 | 00, 01 | — | [x] |
| 04 | [Dettaglio sessione, Sposta, Annulla](passes/04-sessione-e-sposta.md) | D1–D5, O3, O4, B2, H9, V11 | 02, 03 | sì | [x] |
| 05 | [Home](passes/05-home.md) | H1–H7, H9, H10, N1, N5, V1, V2, V8, V9, V10 | 02, 04 | — | [x] |
| 06 | [Booster](passes/06-booster.md) | S1–S5, H7, V12, V14 | 01, 02 | sì | [ ] |
| 07 | [Profilo](passes/07-profilo.md) | R1–R5, H6, N5, O4, V6 | 01 | sì | [ ] |
| 08 | [Notifiche](passes/08-notifiche.md) | H8, O3 | 01, 04 | sì | [ ] |
| 09 | [Verifica finale](passes/09-verifica-finale.md) | V1–V15, O1–O4 | tutte | — | [ ] |

Legenda: [ ] da fare · [~] in corso · [x] fatta e verificata. Code aggiorna la colonna Stato alla fine di ogni passata.

## Punti in cui Code si ferma
Sono le decisioni che dipendono da te o che toccano il database. Code propone, tu confermi, poi Code procede.
- **00** — tre migrazioni: regola 24 ore / 14 giorni anche sul server; conferma automatica della presenza entro 48 ore; nota nella valutazione. Più il modo di leggere telefono ed email del coach.
- **04** — come ripristinare un annullamento («Ripristina» per 8 secondi): nuova RPC o annullamento differito.
- **06** — fino a quando valgono i crediti Booster (oggi il checkout aggiunge 30 giorni se al blocco ne mancano meno di 7, e in prenotazione la scadenza non conta); colonne di `booster_packs`; URL di ritorno di Stripe.
- **07** — collegamento di Google senza uscire: va abilitato «Manual linking» in Supabase Auth.
- **08** — quali azioni del coach generano una notifica al cliente e con quali trigger.

## Messaggi per Claude Code

### Passata 00 · Fondamenta
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 00 seguendo `passes/00-fondamenta.md`. Lavora sul branch `redesign/cliente-00-fondamenta`, creato da `redesign/cliente-mobile`. Parti dalla sezione «Dati e backend»: scrivimi le tre migrazioni proposte (regola lato server, conferma automatica entro 48 ore, nota della valutazione) e come leggerai telefono ed email del coach, poi aspetta la mia conferma. Dopo, crea gli helper e i token senza cambiare il layout delle pagine. Alla fine esegui build, typecheck, lint e i test dei nuovi helper, verifica i criteri di accettazione, spunta la passata in `PIANO.md` e fermati.

### Passata 01 · Shell
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 01 seguendo `passes/01-shell.md`. Guarda le schermate del brief e apri `designs/Cliente Tab Bar.dc.html`, `designs/Cliente Home.dc.html` e `designs/Cliente Notifiche.dc.html` come riferimento. Lavora sul branch `redesign/cliente-01-shell`, da `redesign/cliente-mobile`. Usa gli helper e i token della passata 00. Non cambiare ancora il contenuto delle pagine, a parte i segnaposto indicati nel brief. Alla fine esegui build, typecheck e lint, prova la barra a 320 e 390 px di larghezza, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 02 · Prenota
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 02 seguendo `passes/02-prenota.md`. Riferimenti: `designs/Cliente Prenota.dc.html` (prova Giulia, Marta e Davide dal pannello di revisione) e le schermate del brief. Lavora sul branch `redesign/cliente-02-prenota`. Costruisci la fila dei giorni e la griglia degli orari come componenti riusabili: la passata 04 li usa per Sposta. Usa `getClientSlotDays` e `getClientPools` della passata 00, senza calcoli paralleli nella pagina. Alla fine esegui build, typecheck e lint, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 03 · Sessioni
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 03 seguendo `passes/03-sessioni.md`. Riferimenti: `designs/Cliente Sessioni.dc.html` e le schermate del brief. Lavora sul branch `redesign/cliente-03-sessioni`. Sostituisci il segnaposto della passata 01. Per la percentuale di presenza usa lo stesso helper del Profilo coach (`src/lib/attendance.ts`). Alla fine esegui build, typecheck e lint, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 04 · Dettaglio sessione, Sposta, Annulla
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 04 seguendo `passes/04-sessione-e-sposta.md`. Riferimenti: `designs/Cliente Sessione.dc.html`, `designs/Cliente Sposta.dc.html` e le schermate del brief. Lavora sul branch `redesign/cliente-04-sessione`. Parti dalla sezione «Dati e backend»: proponimi come ripristinare un annullamento entro 8 secondi e aspetta la mia conferma. Il foglio Sposta sostituisce `client-reschedule-sheet.tsx` e `reschedule-drawer.tsx` e usa i componenti della passata 02; verifica che nessun'altra parte dell'app li usi prima di toglierli. Alla fine esegui build, typecheck e lint, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 05 · Home
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 05 seguendo `passes/05-home.md`. Riferimenti: `designs/Cliente Home.dc.html` con i quattro clienti di prova e le schermate del brief. Lavora sul branch `redesign/cliente-05-home`. È la pagina più grande: prima proponimi un piano in tre parti (1. prossima sessione e stati vuoti; 2. card crediti; 3. valutazione, progressi, installazione e pulizia dei componenti non più usati) e aspetta la mia conferma. Poi procedi una parte alla volta, con un commit per parte. Riusa il foglio Sposta e la valutazione della passata 04. Alla fine esegui build, typecheck e lint, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 06 · Booster
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 06 seguendo `passes/06-booster.md`. Riferimenti: `designs/Cliente Booster.dc.html` (Giulia può acquistare, Elena no) e le schermate del brief. Lavora sul branch `redesign/cliente-06-booster`. Parti dalla sezione «Dati e backend»: dimmi come si comportano oggi la scadenza dei crediti Booster in `booster-checkout`, in `stripe-webhook` e in `validate_booking_extra_credits`, proponimi le due opzioni del brief e aspetta la mia scelta. Prova il pagamento con le chiavi di test di Stripe. Alla fine esegui build, typecheck e lint, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 07 · Profilo
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 07 seguendo `passes/07-profilo.md`. Riferimenti: `designs/Cliente Profilo.dc.html` e le schermate del brief. Lavora sul branch `redesign/cliente-07-profilo`. Prima di togliere il flusso attuale di collegamento a Google, verifica che `linkIdentity` funzioni con la configurazione di Supabase del progetto e dimmelo; se serve abilitare qualcosa, aspetta. Alla fine esegui build, typecheck e lint, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 08 · Notifiche
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi solo la passata 08 seguendo `passes/08-notifiche.md`. Riferimenti: `designs/Cliente Notifiche.dc.html` e le schermate del brief. Lavora sul branch `redesign/cliente-08-notifiche`. Parti dalla sezione «Dati e backend»: proponimi i trigger che scrivono le notifiche al cliente, elencando per ognuno la tabella, la condizione e come escludi importazioni e riconciliazioni di Google, poi aspetta la mia conferma. Non cambiare le notifiche del coach. Alla fine esegui build, typecheck e lint, verifica i criteri di accettazione, spunta la passata e fermati.

### Passata 09 · Verifica finale
Leggi `design_handoff_cliente_mobile/README.md` e `PIANO.md`, poi svolgi la passata 09 seguendo `passes/09-verifica-finale.md`. Lavora sul branch `redesign/cliente-09-verifica`. Esegui tutti i controlli e i sette flussi end-to-end del brief, sul telefono e su desktop. Per ogni problema indica pagina, punto del brief e correzione proposta. Correggi solo testi, misure e stili; per tutto il resto chiedimi prima. Alla fine esegui build, typecheck e lint, riassumi l'esito, spunta la passata e fermati. Poi, se tutto è a posto, prepara la PR da `redesign/cliente-mobile` a `main`.

## Se qualcosa va storto
- **Code va oltre la passata:** «Fermati. Annulla le modifiche fuori da `passes/NN-….md` e tieni solo quelle della passata NN.»
- **Il design non si può realizzare con il backend attuale:** «Non inventare un'alternativa: descrivi il limite, proponi due opzioni e aspetta.»
- **Un numero non torna tra due schermate** (crediti, presenza, giorni prenotabili): «Trova quale calcolo non passa dagli helper della passata 00 e correggilo lì.»
- **Riprendere una passata interrotta:** «Riprendi la passata NN dal branch `redesign/cliente-NN-…`. Rileggi il brief e dimmi cosa manca rispetto ai criteri di accettazione.»
