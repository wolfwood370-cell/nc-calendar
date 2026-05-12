# Problema

Nelle card di **Clienti** i contatori restano fermi a "Blocco 1 – 0/X" e molte sessioni non vengono conteggiate, mentre dentro al **profilo del cliente** i numeri sono corretti.

## Causa

Le due viste calcolano in modo diverso:

- **Profilo cliente** (`src/routes/trainer.clients.$id.tsx`, riga ~657): conta le sessioni completate **leggendo direttamente la tabella `bookings`** e filtrando per `status in ('completed','late_cancelled')`. È sempre allineato.
- **Lista clienti** (`src/routes/trainer.clients.index.tsx`, riga ~262): legge il campo **`quantity_booked` della tabella `block_allocations`**. Questo contatore viene incrementato **solo** quando una sessione viene creata/aggiornata tramite il flusso interno del trainer (righe 342, 405, 461, 518). Tutto ciò che entra da altre fonti (Google Calendar sync, prenotazioni cliente, eventi inseriti retroattivamente, eventi non ancora "review-confermati") **non aggiorna** quel contatore → la card sembra ferma.

In più la selezione del blocco attivo nella lista non guarda dove sono effettivamente cadute le prenotazioni reali, quindi rimane sul Blocco 1 (l'unico con `start_date <= oggi <= end_date` per i clienti appena creati).

# Intervento (solo frontend, lista clienti)

File unico: `src/routes/trainer.clients.index.tsx`

1. **Caricare anche le bookings** dei clienti visibili (stesso filtro coach/admin):
   - select: `id, client_id, block_id, event_type_id, session_type, status, scheduled_at`
   - filtro: `client_id in (...)`, `deleted_at is null`, `ignored = false`, `status in ('scheduled','completed','late_cancelled')` (le stesse incluse in `quantity_booked` storico, così non perdiamo le future già pianificate).

2. **Sostituire il calcolo `completed` / `total`** per ciascun blocco attivo:
   - `total` resta = somma di `quantity_assigned` delle allocazioni del blocco.
   - `completed` (Sessione PT completate) = numero di bookings di quel cliente con `block_id = activeBlock.id` e `status in ('completed','late_cancelled')`. Stessa logica del profilo.
   - In aggiunta: contare separatamente le **prenotate non ancora completate** (`status='scheduled'`) per usarle come "consumate" nel fallback di selezione blocco e nel badge "In Scadenza".

3. **Fix selezione blocco attivo** (3 livelli, allineati al reale):
   1. Blocco con `start_date <= oggi <= end_date` **che ha almeno una booking attiva**, oppure se più di uno il primo per `sequence_order`.
   2. Altrimenti il primo blocco con capacità residua calcolata da `quantity_assigned - (completed + scheduled futuri assegnati a quel blocco)`.
   3. Altrimenti l'ultimo blocco per `sequence_order`.

4. **Fallback per bookings senza `block_id`** (eventi sincronizzati che non hanno ancora un blocco): assegnarli logicamente al blocco il cui intervallo `[start_date, end_date]` contiene `scheduled_at`. Solo per il calcolo lato lista, niente scritture in DB.

5. **Etichette** (testo italiano invariato):
   - PT Pack: `N/3 sessioni completate`
   - Fixed: `Blocco X di Y - N/Total Sessione PT completati`
   - Recurring: `Mese Corrente: N/Total sessioni`
   - Empty: `Nessun blocco attivo` (già presente).

6. **Badge "In Scadenza"** ricalcolato sulla nuova `remaining = total - completed` (≤ 1 e total > 0).

# Cosa NON tocchiamo

- Nessuna migrazione DB, nessuna modifica a `quantity_booked` (resta come optimistic counter del flusso interno).
- Nessuna modifica al profilo cliente, alla pagina Panoramica, agli edge function o all'autenticazione.
- Nessuna modifica al calcolo lato cliente (`/client`).

# Verifica

Dopo la patch, sulla card di Valeria/Chiara/ecc. devono comparire le stesse cifre del profilo (es. `Blocco 1 di 6 - 3/5 Sessione PT completati` se nel profilo si vedono 3 sessioni completate sul blocco corrente). Marco Peruzza (PT Pack) e Erica Aldighieri (Abbonamento Mensile) restano con i loro formati dedicati.
