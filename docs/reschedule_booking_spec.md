# Spec verificata: reschedule_booking + finestra prenotazione 2 settimane

> Prodotta dal workflow `design-booking-window` (design + verifica adversariale a 2 lenti).
> Il **FRONTEND** (finestra prenotazione oggi+14, routing reschedule sul nuovo RPC, copy) e gia
> implementato in questo branch. Questo file serve a Lovable per assemblare la **MIGRATION backend**:
> il nuovo RPC `reschedule_booking` + il DROP del trigger FIX D, integrando le 2 CORREZIONI sotto.

---

## DESIGN COMPLETO

# Design: Finestra prenotazione [oggi, oggi+14] sempre + Reschedule cross-week atomico

Tutto verificato sul codice reale. READ-ONLY: niente è stato modificato.

## Fatti architetturali accertati (load-bearing per il design)

- I trigger di **consumo crediti** sono `BEFORE INSERT` only e NON rifirano su UPDATE:
  - `trg_booking_validate_block_allocation` → `validate_booking_block_allocation()` (canonico: `20260603203525_...sql`)
  - `trg_booking_validate_extra_credits` → `validate_booking_extra_credits()` (canonico: `20260526120000_...sql`)
  - Conseguenza: un RPC che fa release manuale + UPDATE scheduled_at NON innesca doppio consumo né ricorsione.
- `end_at` è mantenuto dal trigger `a_trg_set_booking_duration_defaults` su `BEFORE INSERT OR UPDATE OF scheduled_at, duration_min, buffer_min, event_type_id` (`20260522204517`). Quindi **basta UPDATE su scheduled_at: end_at si ricalcola da solo** — il RPC non deve scriverlo a mano.
- Guard cliente esistente `z_trg_validate_client_booking_update` (`20260522100000`): su UPDATE diretto del cliente impone 24h cutoff + whitelist (solo `scheduled_at`). Fa **bypass quando `current_user <> 'authenticated'`**, cioè dentro un SECURITY DEFINER RPC. Quindi il nuovo RPC reschedule passa pulito.
- FIX D (`zz_trg_revalidate_client_reschedule`, `20260606120000`) è un `BEFORE UPDATE OF scheduled_at` che blocca il cross-week fail-closed. Va RIMOSSO (trigger + funzione).
- Selezione consumo canonica (da replicare nel RPC), da `validate_booking_block_allocation()`:
  - filtro: `quantity_assigned > quantity_booked` AND `(valid_until IS NULL OR valid_until >= v_scheduled_local_date)` AND match `event_type_id` OR `session_type`
  - ORDER BY: `valid_until ASC NULLS LAST`, poi event-type-match, poi `CASE week_number=v_week_number`, poi `ABS(week_number - v_week)`, poi `created_at ASC`
  - week locale: `(scheduled_at AT TIME ZONE 'Europe/Rome')::date`, `LEAST(4,GREATEST(1, FLOOR((local - block_start)/7.0)+1))`
- Refund canonico (da `cancel_booking`, FIX C): block_allocations ORDER BY `valid_until ASC NULLS LAST`, event-type, `created_at ASC`; extra_credits ORDER BY `expires_at ASC`. Il release nel RPC deve usare questo identico ordine per essere l'inverso esatto del consumo.
- Due UI reschedule esistono e finiscono entrambe in un UPDATE diretto su `bookings.scheduled_at`:
  - `src/components/reschedule-drawer.tsx` (aperta da `client-live-booking-card.tsx`) → `useRescheduleBooking()` (`queries.ts ~502`)
  - `src/components/client-reschedule-sheet.tsx` (aperta da `client-booking-detail-view.tsx`) → UPDATE inline
  - Finestra reschedule attuale: `RESCHEDULE_WINDOW_DAYS = 14` (`src/lib/reschedule-slots.ts`) per il drawer; il sheet usa `HORIZON_DAYS = 60` (da ridurre a 14 per coerenza).

---

## 1) MODIFICHE FRONTEND

### 1a. Finestra di prenotazione — `src/routes/client.book.tsx`

Obiettivo: finestra SEMPRE `[max(oggi, block.start_date), oggi+14gg]`, indipendente da isLastWeek.

**`coachBusyQ` (~160-199): rimuovere la logica isLastWeek/lookaheadEnd.**
```diff
   queryFn: async () => {
     if (!coachIdForAvail) return [];
     const today = startOfDay(new Date());
-    const from = block ? new Date(block.start_date) : today;
-    const blockEnd = block ? new Date(block.end_date) : addDays(today, 60);
-    const isLastWeek = block ? today.getTime() >= addDays(blockEnd, -7).getTime() : false;
-    const lookaheadEnd = isLastWeek ? addDays(today, 14) : blockEnd;
-    const to = new Date(Math.max(lookaheadEnd.getTime(), blockEnd.getTime()));
-    to.setHours(23, 59, 59, 999);
+    // Finestra fissa: da max(oggi, inizio blocco) a oggi+14gg SEMPRE.
+    const from = block
+      ? new Date(Math.max(today.getTime(), new Date(block.start_date).getTime()))
+      : today;
+    const to = addDays(today, 14);
+    to.setHours(23, 59, 59, 999);
     const { data, error } = await supabase.rpc("get_coach_busy", { p_coach_id: coachIdForAvail, p_from: from.toISOString(), p_to: to.toISOString() });
```
Nota: la queryKey va lasciata invariata (block id + date) — è già key-stabile.

**`slots` useMemo (~218-246): finestra fissa + daysAhead = 15.**
```diff
   const slots = useMemo(() => {
     const today = startOfDay(new Date());
-    const start = block ? new Date(block.start_date) : today;
-    const blockEnd = block ? new Date(block.end_date) : addDays(today, 60);
-    const isLastWeek = block ? today.getTime() >= addDays(blockEnd, -7).getTime() : false;
-    const lookaheadEnd = isLastWeek ? addDays(today, 14) : blockEnd;
-    const end = new Date(Math.max(lookaheadEnd.getTime(), blockEnd.getTime()));
-    end.setHours(23, 59, 59, 999);
+    // start = max(oggi, inizio blocco): se il blocco parte in futuro, niente slot prima.
+    const start = block
+      ? new Date(Math.max(today.getTime(), new Date(block.start_date).getTime()))
+      : today;
+    const end = addDays(today, 14);
+    end.setHours(23, 59, 59, 999);
     return generateSlots(
-      block ? (isLastWeek ? 35 : 28) : 60,
+      15, // oggi..oggi+14 = 15 giorni
       blockedRanges, availQ.data ?? [], exceptionsQ.data ?? [], candidateMinutes,
       start, end, { enabled: optimizationQ.data ?? true },
     );
-  }, [block, blockedRanges, availQ.data, exceptionsQ.data, optimizationQ.data, candidateMinutes]);
+  }, [block, blockedRanges, availQ.data, exceptionsQ.data, optimizationQ.data, candidateMinutes]);
```
NB su `generateSlots`: `daysAhead` parte da `now` (interno), e `rangeStart`/`rangeEnd` clampano. Con start=oggi e daysAhead=15 + end=oggi+14 il clamp produce esattamente la finestra voluta. Se il blocco parte in futuro, `start` > now: il generatore salta i giorni prima di start (range clamp), mostrando slot solo da block.start_date. 15 è sufficiente perché end è sempre oggi+14.

**`selectedPoolValidUntil` useMemo (~419-439): per pool block ritorna sempre oggi+14 (non più block.end_date).**
```diff
   const selectedPoolValidUntil = useMemo(() => {
     if (!selectedPool) return null;
     if (selectedPool.source === "block" && block) {
       const today = startOfDay(new Date());
-      const blockEnd = new Date(block.end_date);
-      blockEnd.setHours(23, 59, 59, 999);
-      const isLastWeek = today.getTime() >= addDays(blockEnd, -7).getTime();
-      if (isLastWeek) {
-        const lookaheadEnd = addDays(today, 14);
-        lookaheadEnd.setHours(23, 59, 59, 999);
-        return lookaheadEnd.getTime() > blockEnd.getTime() ? lookaheadEnd : blockEnd;
-      }
-      return blockEnd;
+      // Limite cliccabile del calendario = oggi+14 SEMPRE, ma capped al
+      // valid_until reale del credito (grace) per non mostrare giorni che
+      // il backend rifiuterebbe (allocation scaduta).
+      const lookaheadEnd = addDays(today, 14);
+      lookaheadEnd.setHours(23, 59, 59, 999);
+      // selectedPool.validUntil è il MAX valid_until tra le allocations del pool.
+      const credExp = selectedPool.validUntil;
+      if (credExp && credExp.getTime() < lookaheadEnd.getTime()) return credExp;
+      return lookaheadEnd;
     }
     return selectedPool.validUntil;
   }, [selectedPool, block]);
```
Motivazione del cap su `selectedPool.validUntil`: quando `oggi+14` supera la grace del blocco corrente (`valid_until = end_date + grace_days`), il backend `validate_booking_block_allocation` rifiuterebbe (`valid_until >= v_scheduled_local_date`). Il cap evita di mostrare giorni non prenotabili → niente "click → errore". Vedi sezione 3 (cross-block) per il caso "oggi+14 cade nel blocco successivo".

**`nextBlockStartDate` (~445-450): invariato**, ma il messaggio sotto il calendario (in `BookCalendarGrid`) ora ha senso solo quando il credito del blocco corrente è il limite (caso grace), non più "fine blocco". Nessuna modifica logica necessaria, eventualmente solo copy.

### 1b. Allineamento finestra reschedule — `src/lib/reschedule-slots.ts`
`RESCHEDULE_WINDOW_DAYS = 14` è già corretto (oggi..oggi+14). Lasciare invariato. Il `buildSlots` ha già il filtro `slotStartMs < now` (passato escluso) e l'esclusione del booking corrente.

### 1c. `src/components/client-reschedule-sheet.tsx`
Allineare la finestra a 14 e instradare la conferma sul nuovo RPC.
```diff
-const HORIZON_DAYS = 60;
+const HORIZON_DAYS = 14;   // coerente con [oggi, oggi+14]
```
`handleConfirm` (~178-248): sostituire l'UPDATE inline con la chiamata RPC. Mantenere gcalUpdate + notifiche + invalidate.
```diff
-      const { error: updErr } = await supabase
-        .from("bookings")
-        .update({ scheduled_at: selectedISO })
-        .eq("id", booking.id);
-      if (updErr) {
-        toast.error("Riprogrammazione rifiutata", { description: updErr.message });
-        return;
-      }
+      const { data: rpcData, error: updErr } = await supabase.rpc("reschedule_booking", {
+        p_booking_id: booking.id,
+        p_new_scheduled_at: selectedISO,
+      });
+      if (updErr) {
+        // P0001 (24h / credito / finestra) e 23P01 (overlap) arrivano qui
+        // con messaggio italiano già pronto.
+        toast.error("Riprogrammazione rifiutata", { description: updErr.message });
+        return;
+      }
```
Il gcalUpdate resta uguale (usa `booking.google_event_id` + `booking.duration_min`). NB: se in futuro il RPC ritornasse `end_at`, usarlo invece di ricalcolarlo; per ora il calcolo client `selectedISO + duration_min` è equivalente.

### 1d. `src/lib/queries.ts` — `useRescheduleBooking` (~502-561)
Sostituire l'UPDATE diretto con la chiamata RPC; il RPC ritorna i campi che servono per gcal + invalidate. L'optimistic patch resta identico.
```diff
     mutationFn: async (input: { bookingId: string; newScheduledISO: string; }) => {
-      const { data, error } = await supabase
-        .from("bookings")
-        .update({ scheduled_at: input.newScheduledISO })
-        .eq("id", input.bookingId)
-        .select("coach_id, client_id, google_event_id, scheduled_at, end_at")
-        .single();
-      if (error) throw error;
-      return data as {...};
+      const { data, error } = await supabase.rpc("reschedule_booking", {
+        p_booking_id: input.bookingId,
+        p_new_scheduled_at: input.newScheduledISO,
+      });
+      if (error) throw error;
+      // reschedule_booking RETURNS TABLE(coach_id, client_id, google_event_id, scheduled_at, end_at)
+      const row = (Array.isArray(data) ? data[0] : data) as {
+        coach_id: string; client_id: string | null;
+        google_event_id: string | null; scheduled_at: string; end_at: string;
+      };
+      return row;
     },
```
`onMutate`/`onError`/`onSuccess` invariati: l'optimistic shift e il gcalUpdate in onSuccess restano. Il `reschedule-drawer.tsx` non cambia (continua a chiamare `rescheduleMut.mutate`); la gestione errori `23P01`/`P0001` è già presente lì.

---

## 2) SQL IDEMPOTENTE — nuovo RPC + DROP FIX D

```sql
-- ============================================================================
-- reschedule_booking(p_booking_id, p_new_scheduled_at)
-- Sposta una sessione gia prenotata entro [now()+24h, now()+14g], anche
-- cross-week / cross-block, ri-allocando i crediti ATOMICAMENTE:
--   1) rilascia il credito della vecchia data (inverso esatto del consumo)
--   2) consuma il credito valido per la nuova data (stessa selezione di
--      validate_booking_block_allocation: valid_until ASC NULLS LAST ...)
--   3) UPDATE scheduled_at (end_at ricalcolato da a_trg_set_booking_duration_defaults)
-- SECURITY DEFINER -> bypassa z_trg_validate_client_booking_update (whitelist).
-- I trigger di consumo sono BEFORE INSERT -> non rifirano sull'UPDATE -> niente
-- doppio consumo / ricorsione. Tutto in una sola transazione (la funzione).
-- Idempotente: CREATE OR REPLACE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reschedule_booking(
  p_booking_id       uuid,
  p_new_scheduled_at timestamptz
)
RETURNS TABLE(
  coach_id        uuid,
  client_id       uuid,
  google_event_id text,
  scheduled_at    timestamptz,
  end_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_b            record;
  v_caller       uuid := auth.uid();
  v_new_local    date;
  v_block_start  date;
  v_week_number  int;
  v_rel_alloc    uuid;   -- allocation da cui rilasciare (vecchia data)
  v_new_alloc    uuid;   -- allocation da cui consumare (nuova data)
  v_new_block    uuid;
  v_rel_ec       uuid;   -- extra_credit da rilasciare
  v_new_ec       uuid;   -- extra_credit da consumare
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sessione non autenticata.' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Nuova data mancante.' USING ERRCODE = 'P0001';
  END IF;

  -- Lock della riga booking.
  SELECT b.id, b.client_id, b.coach_id, b.block_id, b.event_type_id,
         b.session_type, b.scheduled_at, b.status, b.deleted_at,
         b.google_event_id, b.is_personal, b.category
    INTO v_b
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF v_b.id IS NULL THEN
    RAISE EXCEPTION 'Sessione non trovata.' USING ERRCODE = 'P0001';
  END IF;

  -- Authz: solo il cliente proprietario, il coach assegnato, o admin.
  IF v_b.client_id IS DISTINCT FROM v_caller
     AND v_b.coach_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato.' USING ERRCODE = '42501';
  END IF;

  -- Stato valido: scheduled, non cancellata, non personale, client-session reale.
  IF v_b.deleted_at IS NOT NULL OR v_b.status <> 'scheduled'::public.booking_status THEN
    RAISE EXCEPTION 'Sessione gia annullata o conclusa.' USING ERRCODE = 'P0001';
  END IF;
  IF v_b.is_personal = true OR v_b.client_id IS NULL OR v_b.client_id = v_b.coach_id THEN
    RAISE EXCEPTION 'Questa sessione non e riprogrammabile dal cliente.' USING ERRCODE = 'P0001';
  END IF;

  -- 24h cutoff sulla VECCHIA data (allineato a z_trg_validate_client_booking_update).
  IF v_b.scheduled_at < (now() + interval '24 hours') THEN
    RAISE EXCEPTION 'Non e possibile spostare un appuntamento a meno di 24 ore dall''inizio.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Finestra: la nuova data deve cadere in [now()+24h, now()+14g].
  IF p_new_scheduled_at < (now() + interval '24 hours') THEN
    RAISE EXCEPTION 'Il nuovo orario e troppo vicino (minimo 24 ore).' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_scheduled_at > (now() + interval '14 days') THEN
    RAISE EXCEPTION 'Puoi spostare la sessione al massimo entro 14 giorni.' USING ERRCODE = 'P0001';
  END IF;

  -- No-op se la data non cambia.
  IF v_b.scheduled_at IS NOT DISTINCT FROM p_new_scheduled_at THEN
    RAISE EXCEPTION 'La nuova data coincide con quella attuale.' USING ERRCODE = 'P0001';
  END IF;

  v_new_local := (p_new_scheduled_at AT TIME ZONE 'Europe/Rome')::date;

  -- ========================= RAMO BLOCCO =========================
  IF v_b.block_id IS NOT NULL THEN
    -- (1) RILASCIO sul credito della VECCHIA data (inverso del consumo,
    --     stesso ORDER BY di cancel_booking). Cerca SOLO nel block originale.
    SELECT a.id INTO v_rel_alloc
      FROM public.block_allocations a
     WHERE a.block_id = v_b.block_id
       AND a.quantity_booked > 0
       AND ((v_b.event_type_id IS NOT NULL AND a.event_type_id = v_b.event_type_id)
            OR a.session_type = v_b.session_type)
     ORDER BY a.valid_until ASC NULLS LAST,
              CASE WHEN v_b.event_type_id IS NOT NULL AND a.event_type_id = v_b.event_type_id THEN 0 ELSE 1 END,
              a.created_at ASC
     LIMIT 1 FOR UPDATE;

    -- (2) SELEZIONE del NUOVO credito per la nuova data: replica ESATTA di
    --     validate_booking_block_allocation (cross-block: cerca tra TUTTI i
    --     blocchi attivi del cliente, week_number su block_start del candidato).
    SELECT ba.id, ba.block_id
      INTO v_new_alloc, v_new_block
      FROM public.block_allocations ba
      JOIN public.training_blocks tb ON tb.id = ba.block_id
     WHERE tb.client_id = v_b.client_id
       AND tb.deleted_at IS NULL
       -- residuo disponibile DOPO il rilascio teorico: se il nuovo credito e
       -- LA STESSA riga rilasciata, va comunque considerata libera.
       AND (ba.quantity_assigned > ba.quantity_booked
            OR ba.id = v_rel_alloc)
       AND (ba.valid_until IS NULL OR ba.valid_until >= v_new_local)
       AND ((v_b.event_type_id IS NOT NULL AND ba.event_type_id = v_b.event_type_id)
            OR ba.session_type = v_b.session_type)
     ORDER BY
       ba.valid_until ASC NULLS LAST,
       CASE WHEN v_b.event_type_id IS NOT NULL AND ba.event_type_id = v_b.event_type_id THEN 0 ELSE 1 END,
       -- week_number relativo al blocco del candidato
       CASE WHEN ba.week_number = LEAST(4, GREATEST(1,
              FLOOR((v_new_local - tb.start_date) / 7.0)::int + 1)) THEN 0 ELSE 1 END,
       ABS(ba.week_number - LEAST(4, GREATEST(1,
              FLOOR((v_new_local - tb.start_date) / 7.0)::int + 1))),
       ba.created_at ASC
     LIMIT 1 FOR UPDATE;

    IF v_new_alloc IS NULL THEN
      RAISE EXCEPTION 'Nessun credito disponibile per la nuova data in questa tipologia.'
        USING ERRCODE = 'P0001';
    END IF;

    -- (3) Applica release + reconsume. Se stessa riga e stesso block, e un no-op
    --     netto (release -1 poi +1) -> evitiamo doppio write usando un guard.
    IF v_rel_alloc IS NOT NULL AND v_rel_alloc = v_new_alloc THEN
      NULL; -- credito invariato: stessa allocation copre vecchia e nuova data
    ELSE
      IF v_rel_alloc IS NOT NULL THEN
        UPDATE public.block_allocations
           SET quantity_booked = GREATEST(0, quantity_booked - 1)
         WHERE id = v_rel_alloc;
      END IF;
      UPDATE public.block_allocations
         SET quantity_booked = quantity_booked + 1
       WHERE id = v_new_alloc;
    END IF;

    -- Se il consumo e finito su un blocco diverso, sposta il booking sul nuovo block.
    IF v_new_block IS DISTINCT FROM v_b.block_id THEN
      UPDATE public.bookings SET block_id = v_new_block WHERE id = p_booking_id;
    END IF;

  -- ========================= RAMO EXTRA =========================
  ELSIF v_b.event_type_id IS NOT NULL THEN
    -- Release sul credito extra (ORDER BY expires_at ASC, come refund).
    SELECT e.id INTO v_rel_ec
      FROM public.extra_credits e
     WHERE e.client_id = v_b.client_id
       AND e.event_type_id = v_b.event_type_id
       AND e.quantity_booked > 0
     ORDER BY e.expires_at ASC
     LIMIT 1 FOR UPDATE;

    -- Reconsume su credito valido per la nuova data (expires_at > nuova data).
    SELECT e.id INTO v_new_ec
      FROM public.extra_credits e
     WHERE e.client_id = v_b.client_id
       AND e.event_type_id = v_b.event_type_id
       AND (e.quantity - e.quantity_booked > 0 OR e.id = v_rel_ec)
       AND e.expires_at > p_new_scheduled_at
     ORDER BY e.expires_at ASC
     LIMIT 1 FOR UPDATE;

    IF v_new_ec IS NULL THEN
      RAISE EXCEPTION 'Credito esaurito o scaduto per la nuova data. Acquista un Booster.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_rel_ec IS NOT NULL AND v_rel_ec = v_new_ec THEN
      NULL;
    ELSE
      IF v_rel_ec IS NOT NULL THEN
        UPDATE public.extra_credits
           SET quantity_booked = GREATEST(0, quantity_booked - 1)
         WHERE id = v_rel_ec;
      END IF;
      UPDATE public.extra_credits
         SET quantity_booked = quantity_booked + 1
       WHERE id = v_new_ec;
    END IF;
  END IF;

  -- (4) Sposta la data. end_at viene ricalcolato da a_trg_set_booking_duration_defaults.
  --     L'exclusion constraint bookings_no_overlap_per_coach (23P01) protegge
  --     dal double-booking; esclude la riga da se stessa via UPDATE semantics.
  UPDATE public.bookings
     SET scheduled_at = p_new_scheduled_at, updated_at = now()
   WHERE id = p_booking_id;

  RETURN QUERY
    SELECT b.coach_id, b.client_id, b.google_event_id, b.scheduled_at, b.end_at
      FROM public.bookings b WHERE b.id = p_booking_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) TO authenticated;

-- ============================================================================
-- DROP FIX D (sostituito dall'RPC sopra).
-- ============================================================================
DROP TRIGGER IF EXISTS zz_trg_revalidate_client_reschedule ON public.bookings;
DROP FUNCTION IF EXISTS public.revalidate_client_reschedule_window();
```

Note SQL:
- `RETURNS TABLE`: PostgREST lo serializza come array → il FE prende `data[0]` (gestito nei diff 1c/1d).
- Il guard `OR ba.id = v_rel_alloc` (e `OR e.id = v_rel_ec`) serve a far comparire come "disponibile" la stessa riga appena rilasciata: senza, una allocation satura (assigned=booked) non sarebbe ri-eleggibile per la stessa data/week → si bloccherebbe lo spostamento intra-allocation.
- Il caso `v_rel_alloc = v_new_alloc` evita due UPDATE (-1,+1) ridondanti e mantiene pulito l'audit di `quantity_booked`.
- Manca volutamente la chiamata a `set_booking_duration_defaults` manuale: il trigger BEFORE UPDATE OF scheduled_at lo fa.

---

## 3) IMPATTO CREDITI / BLOCCHI

- **Cross-week, stesso blocco**: il release pesca dalla vecchia allocation, il reconsume ripesca con la stessa logica del consumo (week_number-aware). Se entrambe le date cadono nella stessa allocation (caso comune: 1 allocation per blocco, vedi `20260518121500` "single week_number=1 allocation"), il branch `v_rel_alloc = v_new_alloc` rende l'operazione un no-op sui crediti → nessuna oscillazione di `quantity_booked`.
- **Cross-block (oggi+14 cade nel blocco successivo)**: il SELECT del reconsume cerca tra TUTTI i blocchi attivi del cliente. Se la nuova data ha un'allocation valida nel blocco N+1 (`valid_until >= v_new_local`), il credito viene consumato lì e `bookings.block_id` viene spostato sul nuovo blocco (stesso comportamento di `validate_booking_block_allocation` che fa `NEW.block_id := v_alloc_block`). Il release avviene sul blocco originale. **Atomico**: tutto nella stessa transazione.
- **Grace (oggi+14 oltre la fine del blocco corrente, ma dentro grace)**: `valid_until = end_date + grace_days` (grace ora 14, `20260527150000`). Finché `valid_until >= v_new_local` il reconsume sulla stessa allocation passa. Il FE (sez. 1a) cappa il calendario a `selectedPool.validUntil` per non mostrare giorni oltre grace.
- **week_number Europe/Rome**: il RPC calcola `v_new_local = (p_new_scheduled_at AT TIME ZONE 'Europe/Rome')::date` e usa `FLOOR((v_new_local - tb.start_date)/7.0)+1` clampato `[1,4]` — identico al trigger di consumo (fix M8). Niente drift UTC sulle sessioni serali a cavallo settimana.
- **Refund coerenza**: il release usa l'ORDER BY del refund canonico (`cancel_booking`, FIX C: valid_until ASC NULLS LAST, event-type, created_at ASC) → un reschedule annullato in seguito con `cancel_booking` rimborsa la riga giusta.

---

## 4) EDGE CASE

1. **Spostamento oltre il blocco senza credito nel blocco successivo**: reconsume `v_new_alloc IS NULL` → RAISE P0001 "Nessun credito disponibile per la nuova data" → rollback, credito vecchio intatto. Il FE (cap su validUntil) di norma non mostra nemmeno quei giorni; il RPC è la difesa in profondità.
2. **Nessun credito nella nuova settimana ma residuo in altra settimana stesso blocco**: con 1 allocation/blocco (week-relaxed) il credito è uno solo → passa. Con allocation per-settimana, se la nuova week è satura ma un'altra week ha residuo, il selettore (ABS(week_diff)) pesca la più vicina con residuo — **stesso comportamento del booking originale**, coerente.
3. **Sessione online vs presenza per gcalUpdate**: `gcalUpdateEvent` aggiorna SOLO start/end (`UpdateSchema` non tocca location/conference). Online (Meet) e presenza si distinguono al CREATE (`isOnline`/`requestMeet`), e quel setting resta invariato nell'evento Google → reschedule sposta l'orario senza perdere il Meet link o la modalità. Nessuna modifica necessaria. Solo se `google_event_id IS NULL` si salta gcal (mirror sweep riconcilia) — già gestito.
4. **24h cutoff**: doppia barriera — `withinCutoff` nel sheet/drawer (UX) + RAISE nel RPC sulla vecchia data (sicurezza). La nuova data ha cutoff 24h proprio per impedire di spostarsi su uno slot imminente.
5. **Overlap (23P01)**: l'UPDATE finale può violare `bookings_no_overlap_per_coach`. Essendo nella stessa transazione del RPC, il release/reconsume crediti viene **rollbackato** insieme → niente credito perso. Il FE mappa già `23P01` a "Slot già occupato".
6. **Blocco che parte in futuro (booking flow)**: `start = max(oggi, block.start_date)`. Se block.start_date > oggi+14, la finestra `[start, oggi+14]` è vuota → 0 slot, gestito dal fallback diagnostico esistente + `nextBlockStartDate` mostrato.
7. **path_type fixed con più blocchi attivi**: il reconsume cross-block potrebbe pescare un blocco "sbagliato" (stesso bug di Marco Golinelli lato book). Mitigazione: l'ORDER BY `valid_until ASC` + il filtro `valid_until >= v_new_local` restringe ai blocchi la cui finestra copre la nuova data → tendenzialmente il blocco corretto. È coerente col comportamento di create già in produzione.

---

## 5) RISCHI E COSA TESTARE

**Rischi**
- **Doppia UI reschedule**: drawer (`useRescheduleBooking`) e sheet (`client-reschedule-sheet`) vanno aggiornati ENTRAMBI al RPC, altrimenti uno resta su UPDATE diretto e (a) non ri-alloca i crediti cross-week, (b) ora che FIX D è rimosso, sposterebbe cross-week SENZA toccare i crediti → credito consumato sulla week vecchia, sessione in week nuova (mismatch). Questo è il rischio principale: il DROP di FIX D senza instradare l'UPDATE sul RPC riapre il bug di disallineamento. Vanno cambiati nello stesso deploy.
- **PostgREST array vs object**: `RETURNS TABLE` → `data` è array. Se il FE assume oggetto singolo (vecchio `.single()`), rompe. Gestito con `Array.isArray(data) ? data[0] : data`.
- **week-per-settimana con allocations multiple**: oscillazione `quantity_booked` se release e reconsume cadono su righe diverse della stessa week — corretto ma genera 2 write; verificare i CHECK `quantity_booked >= 0` (FIX C) reggano (il release usa GREATEST(0, ...)).
- **Concorrenza**: `FOR UPDATE` su booking + allocations serializza; ok. Ma due reschedule concorrenti sullo stesso slot target → uno prende 23P01.

**Cosa testare**
1. Booking: oggi+14 sempre cliccabile in settimana 1, 2, 3, 4 del blocco (non solo ultima).
2. Booking con blocco che parte in futuro: slot solo da start_date, non prima.
3. Booking con oggi+14 dentro grace: cliccabile fino a valid_until; oltre valid_until grigio.
4. Booking con oggi+14 nel blocco N+1: slot mostrati, consumo dal blocco N+1.
5. Reschedule intra-week stesso blocco: `quantity_booked` invariato (no-op branch).
6. Reschedule cross-week stesso blocco: credito week vecchia -1, week nuova +1 (o no-op se 1 allocation).
7. Reschedule cross-block: block_id del booking aggiornato, credito spostato sul blocco giusto, atomicità su rollback (forzare overlap → verificare crediti intatti).
8. Reschedule senza credito nella nuova data: P0001, credito vecchio intatto.
9. Reschedule extra_credit: release+reconsume su pack giusto (expires_at ASC); reschedule oltre expires_at → P0001.
10. Reschedule a <24h (vecchia e nuova data): bloccato.
11. gcal: online (Meet preservato) e presenza, evento Google spostato; google_event_id NULL → skip senza errore.
12. Coach UPDATE multi-campo da `trainer.clients.$id.tsx`: NON deve essere intercettato (FIX D rimosso → nessuna regressione; il guard whitelist cliente bypassa per il coach).
13. cancel_booking dopo un reschedule cross-block: rimborsa l'allocation corretta del nuovo blocco.


---

## VERIFICA ADVERSARIALE — CORREZIONI DA INTEGRARE NELLO SQL

Entrambe le lenti hanno restituito `approved:false` con difetti reali. Le correzioni vanno
integrate nello SQL del RPC PRIMA di applicarlo.

### Lente: crediti-regressioni — approved: false

**Problemi trovati:**

Fatti architetturali del design TUTTI confermati sul codice reale: trigger consumo BEFORE INSERT only (validate_booking_block_allocation 20260603203525, validate_booking_extra_credits 20260526120000) -> nessun doppio consumo/ricorsione su UPDATE; a_trg_set_booking_duration_defaults e BEFORE INSERT OR UPDATE OF scheduled_at... (20260522204517:78-81) -> end_at si ricalcola da solo sull'UPDATE finale; guard cliente z_trg_validate_client_booking_update bypassa con current_user<>'authenticated' (20260522100000:41); FIX D = revalidate_client_reschedule_window + zz_trg_revalidate_client_reschedule esiste in 20260606120000:323-417 (BEFORE UPDATE OF scheduled_at); EXCLUDE bookings_no_overlap_per_coach esiste (20260518120000); refund canonico cancel_booking/mark_booking_special FIX C confermato; has_role(uuid, app_role) firma corretta; schema block_allocations (week_number, valid_until, event_type_id, quantity_assigned/booked, UNIQUE block_id+week_number+session_type+event_type_id) e extra_credits (quantity/quantity_booked, NO quantity_assigned) confermati; CHECK quantity_booked>=0 floor-only confermati (FIX C 20260606120000:274-302); selectedPool.validUntil per source=block e davvero il MAX valid_until allocations (client.book.tsx:285); le DUE UI reschedule confermate (reschedule-drawer->useRescheduleBooking queries.ts:502; client-reschedule-sheet handleConfirm:190 UPDATE inline); coach saveBookingEdit (trainer.clients.$id.tsx:585-603) fa UPDATE multi-campo diretto e NON e intercettato ne da FIX D (guard auth.uid()<>OLD.client_id) ne dal nuovo RPC -> nessuna regressione coach, corretto. gcalUpdateEvent resta chiamato dal FE dopo il RPC in entrambe le UI (queries.ts:551, sheet:222) -> ok.

DIFETTI REALI (motivo del rifiuto):

ISSUE 1 (CRITICO - click->errore sulla finestra, mismatch FE/RPC). Il booking flow ridisegnato (1a) e le UI reschedule usano end = addDays(startOfDay(now()), 14): mostrano cliccabili gli slot fino alle 23:59 del giorno oggi+14. Il RPC invece rifiuta con P0001 tutto cio che e > now()+interval '14 days' (now() = istante corrente, non mezzanotte). Quindi uno slot legittimamente mostrato il giorno oggi+14 alle ore > now() viene rifiutato. Esempio: ora 10:00, slot oggi+14 alle 18:00 -> now()+14g = giorno+14 10:00 -> 18:00 > 10:00 -> RAISE 'Puoi spostare la sessione al massimo entro 14 giorni'. Il drawer/sheet mostrano proprio quei giorni (RESCHEDULE_WINDOW_DAYS=14 a partire da startOfDay). Regressione UX deterministica nella fascia oraria pomeridiana/serale dell'ultimo giorno.

ISSUE 2 (CRITICO - de-sync conteggio crediti per-settimana). Nel ramo blocco il RILASCIO (sezione 1 del RPC) usa l'ORDER BY di cancel_booking (valid_until ASC, event-type, created_at ASC) SENZA week_number; il RECONSUME (sezione 2) usa week-awareness (CASE week_number, ABS(week_diff)). Con allocazioni separate per week_number (consentite: UNIQUE include week_number, il coach puo crearle - block-credits-dialog), il release puo scaricare -1 dalla settimana SBAGLIATA mentre il reconsume carica +1 sulla settimana della nuova data: quantity_booked diverge dalle prenotazioni reali week-by-week, anche su un semplice spostamento. cancel_booking ha lo stesso difetto preesistente, ma il RPC lo trasforma in una divergenza NETTA garantita (release-no-week + reconsume-con-week nella stessa transazione). Il guard v_rel_alloc=v_new_alloc no-op NON salva: con allocazioni per-settimana le due righe sono diverse per costruzione.

ISSUE 3 (MEDIO - cross-block non raggiungibile dal FE, difesa non testabile end-to-end). Il caso 'oggi+14 cade nel blocco N+1' descritto in sez.3/edge-case 4 NON e attivabile dal booking flow: client.book.tsx seleziona UN SOLO block corrente (riga 106-123) e i pool derivano da block.allocations del solo blocco N (riga 271-299); selectedPoolValidUntil viene cappato a selectedPool.validUntil del blocco N (grace di N). Quindi il calendario non mostra mai i giorni del blocco N+1. Il ramo cross-block del RPC (sposta bookings.block_id su v_new_block) e codice di sola difesa che il FE non puo esercitare -> rischio di regressione silente non coperta dai test FE. Non e un bug del RPC in se, ma il design afferma 'slot mostrati, consumo dal blocco N+1' (test #4) che e FALSO col FE proposto.

ISSUE 4 (MINORE - finestra reschedule sheet busyQ). In client-reschedule-sheet il design cambia solo HORIZON_DAYS=14 ma busyQ/generateSlots usano HORIZON_DAYS come daysAhead E come end addDays(now,14): coerente; nessun problema aggiuntivo. Segnalato solo per completezza: ok.

**Correzioni:**

CORREZIONE ISSUE 1 (allineare la finestra del RPC al FE: fine-giornata di oggi+14, timezone business Europe/Rome). Sostituire il check superiore nel RPC:

  -- invece di: IF p_new_scheduled_at > (now() + interval '14 days') ...
  IF (p_new_scheduled_at AT TIME ZONE 'Europe/Rome')::date
       > ((now() AT TIME ZONE 'Europe/Rome')::date + 14) THEN
    RAISE EXCEPTION 'Puoi spostare la sessione al massimo entro 14 giorni.' USING ERRCODE = 'P0001';
  END IF;

Cosi il confronto e per-giorno-locale, identico a end=addDays(startOfDay(now()),14) del FE. (Il limite inferiore 24h va tenuto su now()+interval '24 hours', e gia coerente col cutoff del guard.)

CORREZIONE ISSUE 2 (rendere il release week-aware, inverso ESATTO del consumo, eliminando la de-sync). Nel ramo blocco, calcolare la settimana della VECCHIA data e usarla nell'ORDER BY del release con la stessa formula del consumo:

  v_old_local := (v_b.scheduled_at AT TIME ZONE 'Europe/Rome')::date;
  -- week relativa al blocco ORIGINALE (per il release)
  SELECT start_date INTO v_block_start FROM public.training_blocks WHERE id = v_b.block_id;
  v_week_number := LEAST(4, GREATEST(1, FLOOR((v_old_local - v_block_start)/7.0)::int + 1));

  SELECT a.id INTO v_rel_alloc
    FROM public.block_allocations a
   WHERE a.block_id = v_b.block_id
     AND a.quantity_booked > 0
     AND ((v_b.event_type_id IS NOT NULL AND a.event_type_id = v_b.event_type_id)
          OR a.session_type = v_b.session_type)
   ORDER BY a.valid_until ASC NULLS LAST,
            CASE WHEN v_b.event_type_id IS NOT NULL AND a.event_type_id = v_b.event_type_id THEN 0 ELSE 1 END,
            CASE WHEN a.week_number = v_week_number THEN 0 ELSE 1 END,
            ABS(a.week_number - v_week_number),
            a.created_at ASC
   LIMIT 1 FOR UPDATE;

Cosi release e reconsume condividono i medesimi criteri (incluso week_number) e, quando la sessione resta nella stessa settimana/allocazione, v_rel_alloc=v_new_alloc -> no-op reale; quando cambia settimana, scarica dalla settimana giusta. Nota: questo migliora ANCHE cancel_booking ma quello e fuori scope (preesistente); per il RPC e indispensabile per non introdurre la divergenza netta.

CORREZIONE ISSUE 3 (coerenza FE/test). Due opzioni: (a) declassare il cross-block a 'difesa-in-profondita non esposta dal FE' nei test (rimuovere il test #4 'slot mostrati, consumo dal blocco N+1' o marcarlo come SQL-only), oppure (b) se si vuole davvero esporlo, in client.book.tsx far derivare i pool/slot anche dal blocco successivo quando oggi+14 cade in esso (aggregare block.allocations dei blocchi con valid_until >= giorno target). Minimo indispensabile: correggere la sezione 3/edge-#4 del design dichiarando che col FE attuale il ramo cross-block del RPC non e raggiungibile dal cliente (solo coach/admin via chiamata diretta), evitando falsa fiducia.

Tutto il resto del design (DROP FIX D, SECURITY DEFINER bypass guard, no doppio consumo, RETURNS TABLE -> data[0] gestito in 1c/1d, GREATEST(0,...) sul floor, gcalUpdate invariato, authz proprietario/coach/admin, atomicita su 23P01 con rollback crediti) e corretto e verificato. Applicare le 2 correzioni SQL (Issue 1+2) e chiarire Issue 3 prima del deploy: il DROP di FIX D + instradamento di ENTRAMBE le UI sul RPC vanno nello stesso deploy (gia evidenziato correttamente nei rischi del design).

---

### Lente: finestra-blocchi-ux — approved: false

**Problemi trovati:**

Verificato sul codice reale. La maggior parte del design regge (fatti architetturali corretti: trigger consumo BEFORE INSERT-only confermati in 20260522204517 e 20260603203525; a_trg_set_booking_duration_defaults è BEFORE INSERT OR UPDATE OF scheduled_at e ricalcola end_at, righe 78-81 di 20260522204517; z_trg_validate_client_booking_update bypassa con current_user<>'authenticated', riga 41 di 20260522100000; FIX D presente sia in 20260605222541 sia 20260606120000, il DROP singolo è sufficiente perché oggetti omonimi; selectedPool.validUntil per source=block è effettivamente il MAX valid_until, client.book.tsx:285; entrambe le UI reschedule sono in uso e finiscono in UPDATE diretto su scheduled_at). MA ci sono difetti concreti:

ISSUE A (CRITICO — auto-contraddizione): Il cap proposto in selectedPoolValidUntil (sez. 1a) su selectedPool.validUntil ROMPE l'obiettivo cross-block del design stesso. selectedPool.validUntil per un pool 'block' è calcolato SOLO sulle allocations del blocco corrente (client.book.tsx:268-300, il loop itera solo block.allocations del singolo `block`); NON include il blocco N+1. Quando oggi+14 cade nel blocco successivo (edge-case 4 / sez. 3 'Cross-block'), il valid_until del blocco corrente (= end_date_N + 14 grace) è PRIMA di oggi+14, quindi `if (credExp && credExp.getTime() < lookaheadEnd.getTime()) return credExp` capperebbe il calendario proprio ai giorni del blocco N che il design vuole rendere cliccabili nel blocco N+1. BookCalendarGrid.tsx:101 (`expired = isBefore(selectedPoolValidUntil, day)`) griglia quei giorni. Risultato: il caso cross-block che il design dichiara di supportare non è mai raggiungibile dalla UI. Cap e cross-block sono mutuamente esclusivi come scritti.

ISSUE B (ALTO — click→errore al bordo +14 nel reschedule): Il RPC rifiuta p_new_scheduled_at > now() + interval '14 days' (timestamp rolling, istante della chiamata). Ma le UI reschedule generano slot con buildSlots (reschedule-slots.ts:104, solo `slotStartMs < now` come lower bound) e generateSlots (booking-slots.ts:179, solo minLead 24h), entrambe con orizzonte a giorno intero (today_midnight + 14 giorni). Uno slot al giorno+14 alle 18:00 = midnight+14d+18h è > now()+14d quando l'istante di chiamata è prima delle 18:00 → il RPC alza P0001 'Puoi spostare la sessione al massimo entro 14 giorni' su uno slot che la UI ha mostrato come cliccabile. Regressione UX reale al bordo della finestra.

ISSUE D (MEDIO — copy incoerente nel book flow): Con il nuovo selectedPoolValidUntil che per source=block può valere oggi+14 (data rolling), BookCalendarGrid.tsx:128 continua a stampare 'Da prenotare entro il {data} (fine del blocco corrente)'. La data non è più la fine del blocco → messaggio falso. Il design dice 'eventualmente solo copy' ma non fornisce la correzione.

NOTA (non bloccante, confermata): nessun call-site client su UPDATE diretto di scheduled_at viene dimenticato (solo i due reschedule UI + il path coach trainer.clients.$id.tsx:598 via edit-booking-dialog). Il path coach NON è regressione nuova: FIX D restringeva solo il cliente e il trigger di consumo è INSERT-only, quindi il coach che sposta cross-week un client-session non riallinea i crediti già prima di questo design. Resta un mismatch crediti pre-esistente lato coach, fuori scope ma da segnalare.

**Correzioni:**

FIX ISSUE A — NON cappare a selectedPool.validUntil. Per abilitare davvero il cross-block, il limite cliccabile del calendario deve essere oggi+14 SECCO (la difesa in profondità è il backend trigger validate_booking_block_allocation che, cross-block, accetta finché esiste un'allocation con valid_until >= v_new_local). Sostituire il blocco proposto in selectedPoolValidUntil con:

  const selectedPoolValidUntil = useMemo(() => {
    if (!selectedPool) return null;
    if (selectedPool.source === "block" && block) {
      const today = startOfDay(new Date());
      const lookaheadEnd = addDays(today, 14);
      lookaheadEnd.setHours(23, 59, 59, 999);
      // oggi+14 SECCO: niente cap sul valid_until del blocco corrente,
      // altrimenti i giorni nel blocco N+1 (coperti da un'altra allocation)
      // verrebbero grigiati. Il backend rifiuta i giorni realmente non
      // coperti da alcuna allocation; il fallback no-slots gestisce il caso.
      return lookaheadEnd;
    }
    return selectedPool.validUntil;
  }, [selectedPool, block]);

(Se si teme il 'click→errore' quando NON c'è blocco successivo e oggi+14 supera la grace del blocco corrente: quei giorni o non hanno slot — generati comunque ma — l'INSERT alza P0001 già gestito in use-book-confirm.ts:207-208. Accettabile e coerente col comportamento attuale di create.)

FIX ISSUE B — Allineare il bound superiore del RPC alla granularità-giorno della UI. Nel reschedule_booking sostituire:

  IF p_new_scheduled_at > (now() + interval '14 days') THEN ...

con un confronto su data locale Europe/Rome (stesso fuso del resto del RPC):

  IF (p_new_scheduled_at AT TIME ZONE 'Europe/Rome')::date
       > ((now() AT TIME ZONE 'Europe/Rome')::date + 14) THEN
    RAISE EXCEPTION 'Puoi spostare la sessione al massimo entro 14 giorni.' USING ERRCODE = 'P0001';
  END IF;

Così qualunque orario del giorno+14 mostrato dalla UI è accettato (la UI mostra fino a oggi+14 23:59). Lasciare invariato il lower bound 24h (è una soglia di sicurezza, non un bordo-finestra).

FIX ISSUE D — Correggere la copy in BookCalendarGrid.tsx:128 per il ramo block. Sostituire la stringa 'Da prenotare entro il {data} (fine del blocco corrente)' con un wording neutro che non menzioni 'fine del blocco', es.: `Prenotabile fino al ${format(selectedPoolValidUntil, "d MMMM yyyy", { locale: it })}.` Mantenere invariata la riga nextBlockStartDate (130-135).

NOTA SQL (verifica, non difetto): le colonne usate nel SELECT del RPC (bookings.is_personal, category, block_id, event_type_id, session_type, google_event_id) esistono tutte (confermato in 20260519150000, 20260520100000, 20260518122000). Il guard `OR ba.id = v_rel_alloc` / `OR e.id = v_rel_ec` e il ramo no-op `v_rel_alloc = v_new_alloc` sono corretti. RETURNS TABLE → PostgREST array, gestito con Array.isArray(data)?data[0]:data nei diff 1c/1d: corretto.

---

