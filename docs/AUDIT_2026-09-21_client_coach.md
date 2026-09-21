# Audit approfondito — 21 settembre 2026

Due audit paralleli: lato Cliente e lato Coach. Nessun problema **critico** rilevato.
Sicurezza DB verificata live (`pg_policies`, security scan, linter): nessuna falla nuova.

---

## 1. Lato Cliente

### Alto
- **Disponibilità stantia dopo una prenotazione** — `src/lib/query-keys.ts:63-72`
  `invalidateBookingScope` non invalida la chiave `coach-busy`
  (`src/routes/client.book.tsx:196-203`). Dopo una prenotazione, la griglia può
  continuare a mostrare libero uno slot appena occupato finché la query non scade.
- **Errore silenzioso su `coach-busy`** — `src/routes/client.book.tsx`
  Se la query fallisce, `blockedRanges` resta vuoto e la UI mostra slot occupati come
  liberi: l'utente li sceglie e viene rifiutato solo al momento della conferma.

### Medio
- **Logica "blocco corrente" duplicata in 3 file** — `client.book.tsx:120-137`,
  `client.index.tsx:123-138`, `client.settings.tsx:242-249`. Rischio di drift.
- **Query-key `["profile", meId]` condivisa con `select` diversi** in 3 route:
  la prima route visitata "vince", le altre possono leggere campi mancanti.

### Basso
- `min_notice_hours` / `booking_horizon_days` letti ma scartati
  (`client.book.tsx:164-180`): codice morto fuorviante.
- `isMissingColumnError` (`src/lib/queries.ts:146-153`) troppo permissivo: può
  mascherare errori di schema reali; fino a 4 round-trip in cascata.
- `client.bookings.$bookingId.tsx:38-55` si affida solo a RLS: aggiungere
  `.eq("client_id", meId)` come difesa in profondità.
- Costante cutoff 24h ripetuta in 3 punti (2 SQL + client).

### Positivo
- Nessun controllo pre-INSERT: anti-overlap e crediti delegati a vincoli/trigger DB
  (elimina la race condition).
- Scritture dirette ai crediti rimosse dalle policy client; tutto via trigger/RPC.
- `cancel_booking` rimborsa sullo stesso pool da cui ha scalato.
- Validazione hostname `checkout.stripe.com` prima del redirect.
- Doppio guard anti double-tap in `use-book-confirm.ts:96,118`.

---

## 2. Lato Coach

### Medio
- **Dualismo `load()` imperativo + React Query** in `trainer.clients.$id.tsx` e
  `trainer.clients.index.tsx`: debito architetturale, facile dimenticare
  un'invalidazione in future modifiche.
- **Query admin non paginata** — `admin.tsx:100-109` carica tutti i profili.
- **Throttle sync per-browser** (`trainer.calendar.tsx:106-124`): su più
  dispositivi/schede il throttle di 10 min non è condiviso.

### Basso
- `runForceSync` (`trainer.calendar.tsx:131-178`): fino a 1000 chiamate sequenziali
  a Google lato client, senza resume se il browser si chiude.
- `gcal.server.ts:98-160`: nessun retry/backoff sui 429 di Google.
- Query `["last-note", focusClientId]` mai invalidata dopo il salvataggio di una nota.
- Logica "scala credito" duplicata 4 volte in `trainer.clients.$id.tsx`.
- Payload notifiche malformati degradano in silenzio senza log.
- Nessun de-dup se il coach riassegna un pacchetto per errore.

### Positivo — verificato live
- `validate_booking_block_allocation` valida server-side pool, settimana e
  disponibilità con `FOR UPDATE`: nessun bypass possibile dal client.
- RLS su `profiles`, `bookings`, `training_blocks`, `block_allocations`,
  `extra_credits` correttamente segmentate per cliente/coach/admin.
- `supabaseAdmin` confinato a `gcal.functions.ts` e `client.server.ts`;
  zero import lato client.
- Guard anti-wipe nella riconciliazione Google (`gcal.functions.ts:426-432`).
- Cron di rinnovo mensile con `REVOKE` da `anon`/`authenticated` e gestione
  per-cliente delle eccezioni.
- Prefetch batch in `gcalRepairMissingEvents` (no N+1).

---

## Priorità consigliata
1. Invalidare `coach-busy` in `invalidateBookingScope` + banner di errore sulla
   disponibilità (impatto diretto sull'utente finale).
2. Estrarre la logica "blocco corrente" in un helper condiviso.
3. Differenziare le query-key `profile` per set di colonne.
4. Paginare la lista profili in Amministrazione.
5. Restringere `isMissingColumnError`; invalidare `last-note`.
