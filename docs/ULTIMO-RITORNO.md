# Ultimo ritorno · Redesign coach, passata 01 (Shell: sidebar e header)

25/09/2026 · brief `design_handoff_coach_redesign/passes/01-shell.md` · audit S1, S2, S3, S4, V12.

## Ramo e hash

- Ramo: `redesign/coach-01-shell`, creato da `origin/main` @ `02a4d2a` (merge della PR #66, passata 00) dopo `git fetch origin`. Non dal `main` locale, fermo a `4434a77`.
- Commit della passata: `07ae0c3` «Redesign coach, passata 01: sidebar e header».
- Questo file è in un commit a parte, subito dopo.

## File toccati (17)

Nuovi:

- `src/components/trainer-header.tsx`: header desktop (56px, sticky) con percorso, menu «Nuovo» e campanella.
- `src/components/trainer-client-search.tsx`: «Cerca cliente» con ⌘K / Ctrl+K, combobox ARIA (frecce, Invio, Esc).
- `src/lib/client-search.ts` + test: ricerca per nome, email e telefono (≥ 3 cifre), senza archiviati, max 6; `clientPlanLabel`.
- `src/lib/notifications.ts` + test: guardie del payload (spostate dalla campanella), testi delle righe, «N min fa», «99+», nome accessibile della campanella.
- `src/lib/search-params.ts` + test: `uuidParam`, `isoDateParam` per `validateSearch`.
- `src/lib/to-assign.ts` + test: criterio unico «da assegnare» ed etichetta «N eventi da assegnare».

Modificati:

- `src/components/trainer-sidebar.tsx`: sidebar 256px con gruppi «Area di lavoro» e «Impostazioni», badge su Calendario, card utente.
- `src/components/trainer-notifications-bell.tsx`: popover desktop «Attività clienti» (360px) che apre il Calendario sul giorno dell'evento; ramo mobile invariato.
- `src/routes/trainer.tsx`: layout senza `SidebarProvider`/`SidebarTrigger` e senza l'etichetta fissa, monta `TrainerHeader`.
- `src/routes/trainer.calendar.tsx`: `validateSearch` (`date`, `event`, `new`); `date` sceglie la settimana; il filtro «Da assegnare» usa `isToAssign`.
- `src/routes/trainer.clients.index.tsx`: `validateSearch` per `new=cliente`; invalidazione della cache clienti quando si archivia o ripristina.
- `src/lib/queries.ts`: `useCoachClients` legge anche `path_type` e `pack_label` (piano nei risultati della ricerca).
- `design_handoff_coach_redesign/CHECKLIST.md`: passata 01 spuntata.

## Controlli

Rieseguiti sull'albero del commit, gli stessi numeri del controllo Cowork delle 22:12:

- `npm run typecheck`: 0 errori.
- `npm run lint`: 0 errori, 24 avvisi. Nessuno nuovo: gli unici nei file toccati sono i 4 di `trainer.calendar.tsx` (`?? []` nelle dipendenze di `useMemo`), identici sulla base.
- `npm run test`: 98 test verdi in 8 file (47 nuovi).
- `npm run build`: riuscita.

## Verifica dei criteri di accettazione

Fatta nel browser su `localhost:5199` con **dati di prova**: una patch temporanea, solo in sviluppo, fingeva un coach e caricava in cache clienti, sessioni e notifiche come nelle schermate del brief. Girava sulle route e sui componenti veri. La patch è stata rimossa prima del commit e non ne resta traccia.

- ⌘K / Ctrl+K porta il focus nella ricerca da tutte e 7 le pagine coach. Frecce e Invio aprono il profilo, con percorso «Clienti › Nome». Esc chiude elenco risultati, menu «Nuovo» e popover notifiche. Anche il clic fuori chiude l'elenco.
- Clic su una notifica: porta a `/trainer/calendar?date=2026-09-28&event=<id>` e alla settimana giusta, anche con il Calendario già aperto e dopo aver cambiato settimana a mano. «Sessione spostata» apre il giorno nuovo.
- Il badge «3» su Calendario coincide con gli eventi del filtro «Da assegnare» e con la card della Panoramica. Annullati e impegni personali sono esclusi.
- Con 1024px di contenuto il titolo del percorso non si taglia; si accorcia con l'ellissi solo un nome lunghissimo. Anche con 1024px di finestra (contenuto 768px) il percorso resta intero e la ricerca si restringe per prima.
- Mobile invariato: header e sidebar desktop nascosti, stessa campanella e stessa barra in basso.

## Cosa non ho fatto e perché

- **Verifica con dati reali.** Su localhost il login Google va in 404 su `/~oauth/initiate`, che esiste solo sull'hosting Lovable. `nc-calendar.lovable.app` gira `main`, senza questa passata. Non ho copiato il token di sessione tra i domini. Da provare dopo il deploy:
  - che il clic sulla notifica la segni come letta (stessa mutation di prima);
  - notifiche con payload reali;
  - il percorso con un account admin su clienti di altri coach: il nome viene dalla cache clienti del coach, altrimenti compare «Profilo cliente».
- **Dialog di «Nuova sessione» e «Nuovo cliente».** Il menu porta su `?new=sessione` e `?new=cliente`, ma i dialog si aprono con le passate 04 e 05, come dice il brief.
- **Evento selezionato nel Calendario.** `event` viaggia nell'URL, ma lo legge il pannello dettagli della passata 04.
- **Notifiche su mobile.** Aprono ancora la settimana corrente: il mobile era fuori scope.
- **Card «Da assegnare» della Panoramica.** Il suo conteggio si ferma a 4 (`slice(0, 4)` in `trainer.index.tsx`). Con più di 4 eventi non coincide più con il badge: va corretto nella passata 03.
- **`src/components/ui/sidebar.tsx`.** Resta nel repo ma non è più usato da nessuno.

## Divergenze dal brief e dal prototipo

- **Ricerca per email.** Confronta solo la parte prima della «@», e l'indirizzo intero solo se la ricerca contiene «@». Il criterio del prototipo faceva trovare a «ma» ogni indirizzo `@email.it`.
- **Ordine dei risultati.** Prima i nomi che iniziano con la ricerca, poi l'ordine alfabetico. Nel confronto gli accenti non contano: «nicolo» trova «Nicolò».
- **Scorciatoia ⌘K.** Il chip mostra «⌘K» anche su Windows, come da design, ma funziona anche Ctrl+K. L'ascolto è in fase di cattura, perché uno `stopPropagation` nei menu delle schede clienti la bloccava.
- **Campanella.** Il nome accessibile usa il singolare quando serve («Notifiche, 1 non letta»). Il popover ha anche stato vuoto e caricamento, che il prototipo non mostra.
- **Calendario.** `date` si toglie dall'URL quando si cambia settimana a mano, così riaprire la stessa notifica riporta alla sua settimana. Lo stato completo nell'URL (T4) resta alla passata 04.
- **File di altre passate.** Due righe nella lista Clienti (passata 05): `validateSearch` per `new=cliente` e l'invalidazione della cache all'archiviazione, perché la ricerca escluda subito gli archiviati. Il filtro «Da assegnare» del Calendario ora usa `isToAssign`, con la stessa semantica di prima.
- **Sidebar.** «Installa l'app» è tolto dalla sidebar desktop, dove non compariva mai: `InstallPwaButton` rende `null` fuori dal mobile. Senza `SidebarProvider` sparisce anche la scorciatoia Ctrl+B per comprimere la sidebar.
- **Menu «Nuovo».** Non è modale: niente blocco dello scroll né focus intrappolato.
- **Percorso.** Nel percorso del profilo compare uno scheletro mentre il nome del cliente carica. Il link «Clienti» usa la corrispondenza esatta, così non riceve un secondo `aria-current="page"`.
