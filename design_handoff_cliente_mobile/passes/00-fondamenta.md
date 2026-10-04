# Passata 00 — Fondamenta: regole, helper, token

## Obiettivo
Stessa regola e stessi numeri in tutte le schermate del cliente prima di toccare l'interfaccia. Dopo questa passata esistono: una regola per prenotare e spostare, un solo generatore di orari, un solo conteggio dei crediti, un solo elenco di stati della sessione, i formati di tempo relativo, i contatti del coach e i token nuovi. Nessuna pagina cambia layout.

## Punti audit
O1 (una regola), B2 (tre generatori di orari), V15 (orari consigliati), H1 (tre conteggi dei crediti), T1 e T5 (stati), O3 (quando chiedere la conferma), H5 (tempo relativo), H6 (contatti del coach), V6 (nomi dei piani), T3 (token).

## Riferimenti design
`designs/nc-client.js`: `RULES`, `slotDays`, `pools`, `block`, `status`, `canMove`, `freeCancel`, `freeUntil`, `canRate`, `until`, `dayRel`, `coach`. È la specifica delle funzioni di questa passata.

## File del repo
- `src/lib/booking-rules.ts` — costanti e testi.
- `src/lib/booking-slots.ts` — `generateSlots` resta la base.
- `src/lib/reschedule-slots.ts` — griglia a 30 minuti senza preavviso: non va più usata dal cliente (si toglie nella passata 04).
- `src/lib/credits.ts`, `src/lib/current-block.ts`, `src/lib/session-time.ts`, `src/lib/attendance.ts`.
- `src/styles.css` — token.
- Nuovi: `src/lib/client-slots.ts`, `src/lib/client-credits.ts`, `src/lib/client-session-status.ts`, `src/lib/coach-contacts.ts` (o i nomi che preferisci, uno per argomento), con test accanto.

## Cosa fare

### 1. Regola unica (O1, B2)
In `booking-rules.ts`:
- `CLIENT_MIN_NOTICE_HOURS = 24` (oggi 0) · `CLIENT_BOOKING_HORIZON_DAYS = 14` (oggi 90) · `CLIENT_RESCHEDULE_CUTOFF_HOURS = 24` · `CLIENT_RESCHEDULE_WINDOW_DAYS = CLIENT_BOOKING_HORIZON_DAYS` · nuove `CLIENT_FREE_CANCEL_HOURS = 24` (quella di `cancel_booking`), `CLIENT_CONFIRM_WINDOW_HOURS = 48`, `CLIENT_FEEDBACK_DAYS = 14`.
- Aggiornare commento e `bookingRulesNote`: la card «Regole di prenotazione» della Disponibilità del coach deve mostrare preavviso «24 ore» e anticipo «14 giorni in anticipo», e la nota deve dire che le stesse regole valgono per spostare.
- Testi per il cliente (funzioni, così Prenota e Sposta non li ricompongono):
  - Prenota: «Si prenota da 24 ore a 14 giorni prima.» Se i giorni sono limitati dalla validità dei crediti si aggiunge: « I crediti del blocco 3 valgono fino a domenica 11 ottobre: le date successive si aprono con il blocco 4.» (abbonamento: «…con il blocco successivo.»; ultimo blocco di un percorso fisso: «…fino a domenica 11 ottobre, fine del percorso.»).
  - Sposta: «Si sposta fino a 24 ore prima, su un orario entro 14 giorni e non oltre domenica 11 ottobre, fine del blocco. Marco riceve un avviso.» (senza limite di blocco: «…entro 14 giorni. Marco riceve un avviso.»).

### 2. Generatore di orari unico (B1, B2, V15)
`getClientSlotDays(input)` sopra `generateSlots`, usato da Prenota (02), Sposta (04) e dal «primo orario libero» della Home (05).
- **Input:** tipologia (durata, buffer), disponibilità settimanale, eccezioni, intervalli occupati (`get_coach_busy`), data fino a cui valgono i crediti di quella tipologia, ora corrente, sessione da escludere (quando si sposta), flag di ottimizzazione (`useCoachOptimizationEnabled`).
- **Giorni:** da oggi a `min(oggi + 14 giorni, validità dei crediti)`, estremi inclusi. Si restituiscono tutti, anche quelli senza orari, perché la fila dei giorni li mostra disattivati.
- **Validità dei crediti:** crediti di blocco → `end_date` del blocco in corso; crediti Booster → `expires_at` (vedi passata 06); cliente libero → nessun limite oltre i 14 giorni. Se il limite è la validità, `limitedByCredits = true`.
- **Candidati:** come oggi `generateSlots`: griglia a ogni ora dentro le fasce di disponibilità, più un orario alla fine di ogni sessione già in agenda; collisione con durata + buffer; eccezioni intere e parziali; esclusi gli orari che iniziano prima di `ora + 24 h`.
- **Sposta:** la sessione da spostare non occupa il suo orario. Escluderla per id se `get_coach_busy` lo restituisce, altrimenti per ora d'inizio come fa `reschedule-slots.ts`.
- **Motivo del giorno vuoto:** nessuna fascia o eccezione di tutto il giorno → `chiuso`; tutto il giorno prima di `ora + 24 h` → `preavviso`; altrimenti `pieno`.
- **Parte del giorno** di ogni orario: prima delle 13 «Mattina», prima delle 17 «Pomeriggio», poi «Sera».
- **Consigliati** (solo con l'ottimizzazione attiva, regola già in `booking-slots.ts`): nei giorni con altre sessioni gli orari subito dopo di esse; nei giorni vuoti il primo, quello centrale e l'ultimo. Motivo da mostrare: «Subito dopo le altre sessioni della giornata: meno attese per te e per lo studio.» oppure «Tengono compatta la giornata dello studio.»
- **Output:** `{ days, until, limitedByCredits }`; ogni giorno `{ date, isoDate, slots, reason, recommendedReason }`; ogni orario `{ iso, time: "11:10", end: "12:10", part, recommended }`.

### 3. Crediti del cliente (H1)
`getClientPools(...)`: una riga per tipologia del blocco in corso (più i Booster validi della stessa tipologia; per il cliente libero i suoi crediti senza scadenza).
- Campi: `key`, `eventTypeId`, `name`, `color`, `icon`, `durationMin`, `location`, `bookable` (`client_bookable`), `message` (`unavailable_message`), `total`, `done`, `booked`, `lost`, `avail`.
- **Una sola definizione:** `avail = total − done − booked − lost`, che nel database è `quantity_assigned − quantity_booked` (`getBlockCredits`), perché il credito si impegna alla prenotazione, torna con l'annullamento gratuito e resta consumato da assenze e annullamenti tardivi.
- `done`, `booked`, `lost` si contano dalle sessioni del blocco: `completed`, `scheduled`, `no_show` + `late_cancelled`. Se la somma non coincide con `quantity_booked`, per `avail` vale `quantity_booked` e si registra l'incoerenza (Sentry), senza mostrarla.
- Percorso concluso (ultimo blocco finito, nessuno in corso): `avail = 0` per tutte.
- Ordine: per `total` decrescente.
- `getClientBlockInfo(...)` per le etichette (V6): piano «Percorso fisso» / «Abbonamento mensile» / «Cliente libero»; blocco «Blocco 3 di 6» (fisso) o «Blocco 4» (abbonamento); sottotitolo:
  - fisso: «Valgono fino a domenica 11 ottobre · 13 giorni» («· ultimo giorno» a 0, «· domani l'ultimo giorno» a 1);
  - abbonamento: «Settimana 4 di 4 · si rinnova lunedì 5 ottobre» con rinnovo automatico, altrimenti «Settimana 4 di 4 · termina domenica 4 ottobre»;
  - libero: «Crediti senza scadenza»; concluso: «Concluso domenica 6 settembre».

### 4. Stati della sessione (T1, T5, O3)
`getClientSessionStatus(booking, now)`, valutato in quest'ordine:

| key | Etichetta | Colore (fondo / testo) | Icona | Riga nel dettaglio |
|---|---|---|---|---|
| `done` | Svolta | success-soft / success-text | CircleCheck | Svolta · credito usato |
| `noshow` | Assente | danger-soft / danger-text | UserX | Assente · il credito è stato scalato |
| `cancelled` | Annullata | `#eceef2` / `#41474f` | CalendarX | Annullata · il credito è tornato disponibile |
| `late` | Annullata tardi | warning-soft / warning-text | CalendarX | Annullata con meno di 24 ore · credito scalato |
| `verify` | In verifica | `#eceef2` / `#41474f` | Hourglass | In verifica · il coach deve ancora registrarla |
| `now` | In corso | `rgba(0,86,133,0.1)` / `#003e62` | Timer | In corso |
| `confirmed` | Confermata | success-soft / success-text | CircleCheck | Presenza confermata |
| `toconfirm` | Da confermare | warning-soft / warning-text | Clock | Conferma la tua presenza |
| `booked` | Prenotata | `rgba(0,86,133,0.08)` / `#005685` | CalendarCheck | Prenotata |

- `verify`: sessione `scheduled` già finita (T5). `now`: iniziata e non finita. `confirmed`: `client_confirmed_at` presente. `toconfirm`: non confermata e inizio entro 48 ore. `booked`: il resto.
- Helper collegati: `canMove(b)` = `scheduled` e inizio tra almeno 24 ore; `isFreeCancel(b)` = inizio tra almeno 24 ore; `freeUntilLabel(b)` = «lunedì 28 settembre alle 10:00» (inizio − 24 ore); `canRate(b)` = `completed`, non importata da Google, iniziata negli ultimi 14 giorni.

### 5. Tempo e date (H5)
In `session-time.ts`, accanto a quelli esistenti:
- `formatDayRel(d, now)`: «Oggi», «Domani», «Ieri», altrimenti `formatLongDay` («Mercoledì 30 settembre»).
- `formatUntil(start, now)`: niente se già iniziata; «tra 25 min» sotto l'ora; «tra 1 ora» / «tra 3 ore» nello stesso giorno; «domani»; «tra 2 giorni» (giorni di calendario).
- Aggiornamento con `useNow()` (ogni 30 s): nessun intervallo al secondo.

### 6. Contatti del coach (H6)
`useMyCoach()` → `{ name, firstName, phone, email }` e `getCoachContacts(coach)` → `whatsapp: https://wa.me/<solo cifre>`, `tel: tel:<numero senza spazi>`, `mail: mailto:<email>`. Se manca il telefono, i pulsanti WhatsApp e Chiama non compaiono e resta l'email.

### 7. Token (T3)
Aggiungere a `@theme` i token nuovi del README (`warning-ink`, `credit-lost`, `rating-soft/text`, `rating-star/star-line`, `toast`, `toast-ok/warn`, `scrim`). Le passate successive sostituiscono con questi e con quelli esistenti i valori scritti a mano nei componenti del cliente (`#ecfdf5`, `#059669`, `#dc2626`, `#fef2f2`, `rgba(52,199,89,0.12)`, `amber-*`, `emerald-600`, `#f5a623`, `#3b5bde`).

## Dati e backend
Proporre le migrazioni e aspettare conferma prima di scriverle.
1. **Regola lato server (O1).** In `enforce_client_booking_rules` (INSERT, solo quando chi scrive è il cliente): `scheduled_at >= now() + interval '24 hours'` e data locale Europe/Rome non oltre oggi + 14 giorni. Stesso controllo in `reschedule_booking` sulla nuova data quando chi chiama è il cliente. Coach e admin esclusi. Messaggio (P0001): «Si prenota e si sposta da 24 ore a 14 giorni prima.»
2. **Conferma automatica (O3).** INSERT del cliente con `scheduled_at − now() <= 48 ore` → `client_confirmed_at = now()`. In `trg_bookings_reset_confirmation`, quando cambia `scheduled_at`: se chi sposta è il cliente e la nuova data è entro 48 ore → `now()`, altrimenti `NULL` come oggi. Le sessioni inserite dal coach restano da confermare.
3. **Nota della valutazione (H9).** `ALTER TABLE session_feedback ADD COLUMN note text CHECK (char_length(note) <= 1000)`; rigenerare i tipi; `useSetSessionFeedback` accetta `note`.
4. **Contatti del coach (H6).** Verificare che il cliente possa leggere `phone` ed `email` del proprio coach da `profiles`. Se l'RLS non lo permette, RPC `security definer` `get_my_coach()` che restituisce solo nome, telefono ed email del coach del chiamante.

## Accettazione
- Test unitari:
  - `getClientSlotDays`: orario a ora + 23:59 escluso, a ora + 24:00 incluso; ultimo giorno = oggi + 14; limite alla fine del blocco con `limitedByCredits`; giorno chiuso, eccezione parziale, giorno pieno, `preavviso`; orario aggiunto alla fine di una sessione; consigliati in un giorno vuoto = primo, centrale, ultimo; sessione esclusa quando si sposta.
  - `getClientPools`: 0, 1, 2 crediti; annullamento tardivo e assenza contano come persi; annullamento gratuito restituisce il credito; Booster sommati al totale; percorso concluso → 0.
  - `getClientSessionStatus`: tutti gli stati; non confermata a 47:59 → `toconfirm`, a 48:01 → `booked`.
  - `formatUntil`: 59 min, 2 ore nello stesso giorno, domani, 3 giorni.
- La Disponibilità del coach mostra 24 ore e 14 giorni.
- Nessuna pagina del cliente cambia aspetto.
- Build, typecheck e lint puliti.

## Fuori scope
Interfaccia (passate 01–08).
