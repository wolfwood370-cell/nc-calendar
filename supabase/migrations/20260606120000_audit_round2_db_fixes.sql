-- ============================================================================
-- Audit round 2 — fix DB (verificati adversarialmente dal workflow db-fix-specs)
-- Ogni sezione e idempotente (CREATE OR REPLACE / DROP IF EXISTS / IF NOT EXISTS).
-- NB FIX D: cambia il comportamento UX (cliente non puo spostare cross-week).
-- NB FIX E: se la pipeline non wrappa in transazione, valutare CONCURRENTLY.
-- ============================================================================

-- ============================================================================
-- FIX A — profiles.email immutabile per non-admin (anti-hijack invito GCal)
-- ============================================================================
-- =====================================================================
-- FIX 2: rende profiles.email IMMUTABILE per i non-admin
-- Aggiunge 'email' ai campi protetti dal trigger self-escalation.
-- Idempotente (CREATE OR REPLACE). search_path = public, SECURITY DEFINER.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.prevent_self_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Bypass per chiamate non autenticate (trigger interni, service_role).
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Admin libero.
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN NEW; END IF;
  -- Solo blocchiamo self-update (caller == owner del profilo).
  IF auth.uid() IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;

  IF NEW.auto_renew_blocks IS DISTINCT FROM OLD.auto_renew_blocks
   OR NEW.auto_renew       IS DISTINCT FROM OLD.auto_renew
   OR NEW.path_type        IS DISTINCT FROM OLD.path_type
   OR NEW.path_start_date  IS DISTINCT FROM OLD.path_start_date
   OR NEW.next_billing_date IS DISTINCT FROM OLD.next_billing_date
   OR NEW.status           IS DISTINCT FROM OLD.status
   OR NEW.pack_label       IS DISTINCT FROM OLD.pack_label
   OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at
   OR NEW.email            IS DISTINCT FROM OLD.email   -- <-- FIX: email immutabile per non-admin
   OR NEW.coach_id         IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'Non puoi modificare i campi di abbonamento, email o assegnazione del tuo profilo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Ricrea il trigger in modo idempotente (invariato rispetto all'originale,
-- incluso per garantire che punti alla funzione aggiornata).
DROP TRIGGER IF EXISTS prevent_self_profile_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_self_profile_escalation_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_profile_escalation();

-- ---------------------------------------------------------------------
-- ALTERNATIVA (NON applicare insieme alla precedente): invece di vietare
-- il cambio, forzare profiles.email = auth.users.email su ogni self-update,
-- mantenendo i due sempre sincronizzati. Sostituire la riga del blocco IF
-- sopra con un set esplicito prima del RETURN NEW, es.:
--
--   SELECT u.email INTO NEW.email FROM auth.users u WHERE u.id = OLD.id;
--
-- Sconsigliata qui: richiede SELECT su auth.users ad ogni update e puo'
-- sovrascrivere email legittimamente diverse; la versione 'immutabile' e'
-- piu' semplice e sicura.

-- ============================================================================
-- FIX B — INSERT booking cliente: WITH CHECK + trigger di difesa
-- ============================================================================
-- ============================================================================
-- FIX 2 — Rafforza la policy INSERT del cliente + difesa in profondita via trigger.
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY; CREATE OR REPLACE FUNCTION;
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER.
--
-- NB: il cast in WITH CHECK usa i tipi reali — status e booking_status (enum),
-- category e text con CHECK applicativo. is_personal e boolean NOT NULL.
-- ============================================================================

DROP POLICY IF EXISTS "Client insert own bookings" ON public.bookings;

CREATE POLICY "Client insert own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  client_id = auth.uid()
  AND coach_id = public.get_coach_for(auth.uid())
  AND status = 'scheduled'::public.booking_status
  AND is_personal = false
  AND category = 'client_session'
  AND google_event_id IS NULL
);

-- Difesa in profondita: trigger BEFORE INSERT che riapplica gli stessi vincoli
-- per i soli caller-cliente (auth.uid() = client_id). Coach/admin/service_role
-- restano liberi. Cosi il vincolo regge anche se la policy venisse allentata in
-- futuro o se il client_id fosse impostato via percorso diverso.
CREATE OR REPLACE FUNCTION public.enforce_client_booking_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Bypass per chiamate non autenticate (service_role / trigger interni).
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Bypass per coach/admin.
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'coach'::public.app_role) THEN
    RETURN NEW;
  END IF;
  -- Si applica solo quando il caller inserisce un booking per se stesso.
  IF auth.uid() IS DISTINCT FROM NEW.client_id THEN RETURN NEW; END IF;

  IF NEW.status <> 'scheduled'::public.booking_status
     OR NEW.is_personal IS DISTINCT FROM false
     OR NEW.category <> 'client_session'
     OR NEW.google_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Come atleta puoi solo prenotare sessioni standard (stato programmato).'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_client_booking_insert() FROM PUBLIC, anon, authenticated;

-- Prefisso 'a_' per ordinare PRIMA dei trigger di consumo crediti
-- (trg_booking_validate_*), cosi un INSERT-cliente illecito e bloccato prima
-- di toccare i crediti.
DROP TRIGGER IF EXISTS a_trg_enforce_client_booking_insert ON public.bookings;
CREATE TRIGGER a_trg_enforce_client_booking_insert
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_client_booking_insert();

-- ============================================================================
-- FIX C — Refund ordering allineato al consumo + CHECK floor quantity_booked>=0
-- ============================================================================
-- ============================================================================
-- FIX 3 — (A) Allinea l'ORDER BY dei refund a quello del consumo.
--         (B) CHECK difensivi su quantity_booked, con bonifica preventiva.
-- Idempotente: CREATE OR REPLACE delle funzioni; constraint creati come NOT VALID
-- + VALIDATE in modo idempotente; bonifica righe esistenti prima del VALIDATE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (A1) cancel_booking: refund block_allocations ora ordina valid_until ASC
--      NULLS LAST, coerente col consumo. Il resto della funzione e invariato.
--      (firma e RETURNS identici a 20260603194426 per CREATE OR REPLACE pulito)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS TABLE(status booking_status, was_late boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_booking record; v_caller uuid := auth.uid();
        v_is_late boolean; v_status public.booking_status;
        v_alloc_id uuid; v_ec_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Sessione non autenticata.' USING ERRCODE='P0001'; END IF;
  SELECT b.id, b.client_id, b.coach_id, b.block_id, b.event_type_id, b.session_type,
         b.scheduled_at, b.status AS status, b.deleted_at
    INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Sessione non trovata.' USING ERRCODE='P0001'; END IF;
  IF v_booking.deleted_at IS NOT NULL OR v_booking.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Sessione gia annullata o conclusa.' USING ERRCODE='P0001';
  END IF;
  IF v_booking.client_id IS DISTINCT FROM v_caller
     AND v_booking.coach_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato.' USING ERRCODE='42501';
  END IF;
  v_is_late := now() >= (v_booking.scheduled_at - interval '24 hours');
  v_status := CASE WHEN v_is_late THEN 'late_cancelled'::public.booking_status
                   ELSE 'cancelled'::public.booking_status END;
  UPDATE public.bookings AS b SET status = v_status, deleted_at = now() WHERE b.id = p_booking_id;
  IF NOT v_is_late THEN
    IF v_booking.block_id IS NOT NULL THEN
      -- ORDER BY allineato al consumo (20260603203525): valid_until ASC NULLS LAST,
      -- poi match event_type, poi created_at ASC.
      SELECT a.id INTO v_alloc_id FROM public.block_allocations a
        WHERE a.block_id = v_booking.block_id AND a.quantity_booked > 0
          AND ((v_booking.event_type_id IS NOT NULL AND a.event_type_id = v_booking.event_type_id)
               OR a.session_type = v_booking.session_type)
        ORDER BY a.valid_until ASC NULLS LAST,
                 CASE WHEN v_booking.event_type_id IS NOT NULL AND a.event_type_id = v_booking.event_type_id THEN 0 ELSE 1 END,
                 a.created_at ASC
        LIMIT 1 FOR UPDATE;
      IF v_alloc_id IS NOT NULL THEN
        UPDATE public.block_allocations SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_alloc_id;
      END IF;
    ELSIF v_booking.client_id IS NOT NULL AND v_booking.event_type_id IS NOT NULL THEN
      -- extra_credits: il consumo ordina per expires_at ASC -> refund identico.
      SELECT e.id INTO v_ec_id FROM public.extra_credits e
        WHERE e.client_id = v_booking.client_id AND e.event_type_id = v_booking.event_type_id
          AND e.quantity_booked > 0
        ORDER BY e.expires_at ASC LIMIT 1 FOR UPDATE;
      IF v_ec_id IS NOT NULL THEN
        UPDATE public.extra_credits SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_ec_id;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_status, v_is_late;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- (A2) mark_booking_special: stesso allineamento (era created_at DESC -> ora
--      valid_until ASC NULLS LAST + event-type + created_at ASC). Body invariato
--      altrimenti (versione canonica 20260522204517).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_booking_special(p_booking_id uuid, p_category text DEFAULT 'personal')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_booking RECORD; v_alloc_id uuid; v_extra_id uuid;
        v_caller uuid := auth.uid(); v_is_admin boolean;
BEGIN
  IF p_booking_id IS NULL THEN RAISE EXCEPTION 'booking_id required' USING ERRCODE='P0001'; END IF;
  IF p_category NOT IN ('personal','consulenza') THEN
    RAISE EXCEPTION 'Invalid category: %', p_category USING ERRCODE='P0001';
  END IF;
  SELECT id, coach_id, client_id, block_id, event_type_id, session_type
    INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE='P0001'; END IF;
  v_is_admin := public.has_role(v_caller, 'admin'::public.app_role);
  IF v_booking.coach_id <> v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE='42501';
  END IF;
  IF v_booking.block_id IS NOT NULL THEN
    SELECT id INTO v_alloc_id FROM public.block_allocations
      WHERE block_id = v_booking.block_id AND quantity_booked > 0
        AND ((v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id)
             OR session_type = v_booking.session_type)
      ORDER BY valid_until ASC NULLS LAST,
               CASE WHEN v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id THEN 0 ELSE 1 END,
               created_at ASC
      LIMIT 1 FOR UPDATE;
    IF v_alloc_id IS NOT NULL THEN
      UPDATE public.block_allocations SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_alloc_id;
    END IF;
  END IF;
  IF v_booking.block_id IS NULL AND v_booking.client_id IS NOT NULL
     AND v_booking.client_id <> v_booking.coach_id AND v_booking.event_type_id IS NOT NULL THEN
    SELECT id INTO v_extra_id FROM public.extra_credits
      WHERE client_id = v_booking.client_id AND event_type_id = v_booking.event_type_id
        AND quantity_booked > 0
      ORDER BY expires_at ASC LIMIT 1 FOR UPDATE;
    IF v_extra_id IS NOT NULL THEN
      UPDATE public.extra_credits SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_extra_id;
    END IF;
  END IF;
  UPDATE public.bookings
    SET is_personal=true, category=p_category, client_id=NULL,
        block_id=NULL, event_type_id=NULL, updated_at=now()
    WHERE id = p_booking_id;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------

-- ============================================================================
-- FIX 3 (CORRETTO) - Parte (A) invariata: allineare l'ORDER BY dei refund al
-- consumo (valid_until ASC NULLS LAST, event-type, created_at ASC) in
-- cancel_booking e mark_booking_special. [Mantieni le due CREATE OR REPLACE
-- proposte nel fix originale: sono corrette - firme/GRANT identici.]
--
-- Parte (B) RIVISTA: solo floor difensivo quantity_booked >= 0. NIENTE tetto
-- <= quantity_assigned / <= quantity, perche il coach puo legittimamente
-- ridurre quantity_assigned sotto quantity_booked (block-credits-dialog.tsx).
-- ============================================================================

-- (B1) block_allocations: solo floor, nessun tetto.
UPDATE public.block_allocations
SET quantity_booked = 0
WHERE quantity_booked < 0;

ALTER TABLE public.block_allocations
  DROP CONSTRAINT IF EXISTS block_allocations_booked_range_chk;
ALTER TABLE public.block_allocations
  DROP CONSTRAINT IF EXISTS block_allocations_booked_nonneg_chk;
ALTER TABLE public.block_allocations
  ADD CONSTRAINT block_allocations_booked_nonneg_chk
  CHECK (quantity_booked >= 0) NOT VALID;
ALTER TABLE public.block_allocations
  VALIDATE CONSTRAINT block_allocations_booked_nonneg_chk;

-- (B2) extra_credits: solo floor, nessun tetto.
UPDATE public.extra_credits
SET quantity_booked = 0
WHERE quantity_booked < 0;

ALTER TABLE public.extra_credits
  DROP CONSTRAINT IF EXISTS extra_credits_booked_range_chk;
ALTER TABLE public.extra_credits
  DROP CONSTRAINT IF EXISTS extra_credits_booked_nonneg_chk;
ALTER TABLE public.extra_credits
  ADD CONSTRAINT extra_credits_booked_nonneg_chk
  CHECK (quantity_booked >= 0) NOT VALID;
ALTER TABLE public.extra_credits
  VALIDATE CONSTRAINT extra_credits_booked_nonneg_chk;

-- (A) RESTA come nel fix originale: le CREATE OR REPLACE di cancel_booking e
-- mark_booking_special con ORDER BY a.valid_until ASC NULLS LAST, event-type,
-- created_at ASC. Quelle due funzioni sono corrette cosi come proposte.

-- ============================================================================
-- FIX D — Reschedule cliente: blocco cross-week/oltre-scadenza (fail-closed) [DECISIONE UX]
-- ============================================================================
-- ============================================================================
-- FIX 1 (CORRETTO) - Re-validazione credito al RESCHEDULE *del cliente*.
-- Scelta fail-closed: il cliente puo spostare SOLO entro la stessa business-week
-- e dentro la finestra valid_until/expires_at del credito gia consumato.
-- Cross-week o oltre-finestra -> RAISE -> rollback, credito intatto (nessun
-- data-loss, nessun doppio conteggio, nessuna ricorsione, nessuna regressione
-- per il coach che fa UPDATE grezze multi-campo da trainer.clients.$id.tsx).
-- BEFORE UPDATE: nessuna self-UPDATE su bookings, niente ricorsione.
-- Si applica SOLO quando il caller e il cliente proprietario e cambia solo
-- scheduled_at (coerente con z_trg_validate_client_booking_update che gia
-- vieta al cliente di toccare block_id/event_type_id/session_type).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.revalidate_client_reschedule_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_block_start  date;
  v_old_local    date;
  v_new_local    date;
  v_old_week     int;
  v_new_week     int;
  v_min_valid    date;
BEGIN
  -- Solo caller cliente proprietario (il coach/admin/service_role passano).
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;
  -- Solo booking client-session reali, scheduled, non Google, non personali.
  IF NEW.status <> 'scheduled'::public.booking_status
     OR NEW.deleted_at IS NOT NULL
     OR NEW.google_event_id IS NOT NULL
     OR NEW.is_personal = true
     OR NEW.category <> 'client_session'
     OR NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;
  -- Solo se cambia davvero la data (il guard whitelist garantisce che gli altri
  -- campi credito non cambino lato cliente, ma ricontrolliamo per sicurezza).
  IF OLD.scheduled_at IS NOT DISTINCT FROM NEW.scheduled_at THEN
    RETURN NEW;
  END IF;

  -- RAMO BLOCCO: vincola alla stessa business-week + finestra valid_until.
  IF NEW.block_id IS NOT NULL THEN
    SELECT start_date INTO v_block_start FROM public.training_blocks WHERE id = NEW.block_id;
    IF v_block_start IS NULL THEN
      RAISE EXCEPTION 'Blocco di allenamento non trovato.' USING ERRCODE = 'P0001';
    END IF;
    v_old_local := (OLD.scheduled_at AT TIME ZONE 'Europe/Rome')::date;
    v_new_local := (NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date;
    v_old_week  := LEAST(4, GREATEST(1, FLOOR((v_old_local - v_block_start) / 7.0)::int + 1));
    v_new_week  := LEAST(4, GREATEST(1, FLOOR((v_new_local - v_block_start) / 7.0)::int + 1));
    IF v_new_week <> v_old_week THEN
      RAISE EXCEPTION 'Puoi spostare la sessione solo nella stessa settimana del blocco. Per altre settimane contatta il coach.'
        USING ERRCODE = 'P0001';
    END IF;
    -- La finestra di validita del credito consumato deve coprire la nuova data.
    SELECT MIN(a.valid_until) INTO v_min_valid
    FROM public.block_allocations a
    WHERE a.block_id = NEW.block_id
      AND a.valid_until IS NOT NULL
      AND ((NEW.event_type_id IS NOT NULL AND a.event_type_id = NEW.event_type_id)
           OR a.session_type = NEW.session_type);
    IF v_min_valid IS NOT NULL AND v_new_local > v_min_valid THEN
      RAISE EXCEPTION 'La nuova data supera la scadenza del credito. Spostamento non consentito.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- RAMO EXTRA: lo spostamento di data non sposta il credito (legato a
  -- event_type+expires_at). Vincola solo a non superare expires_at.
  IF NEW.event_type_id IS NOT NULL THEN
    v_new_local := (NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date;
    IF EXISTS (
      SELECT 1 FROM public.extra_credits ec
      WHERE ec.client_id = NEW.client_id
        AND ec.event_type_id = NEW.event_type_id
        AND ec.quantity_booked > 0
        AND ec.expires_at < NEW.scheduled_at
    ) AND NOT EXISTS (
      SELECT 1 FROM public.extra_credits ec
      WHERE ec.client_id = NEW.client_id
        AND ec.event_type_id = NEW.event_type_id
        AND ec.quantity_booked > 0
        AND ec.expires_at >= NEW.scheduled_at
    ) THEN
      RAISE EXCEPTION 'La nuova data supera la scadenza del credito. Spostamento non consentito.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.revalidate_client_reschedule_window() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_trg_revalidate_client_reschedule ON public.bookings;
CREATE TRIGGER zz_trg_revalidate_client_reschedule
  BEFORE UPDATE OF scheduled_at
  ON public.bookings
  FOR EACH ROW
  WHEN (OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at)
  EXECUTE FUNCTION public.revalidate_client_reschedule_window();
-- NOTA: se invece si vuole davvero il riallineo del credito cross-week
-- (release+reconsume), va fatto in un RPC dedicato chiamato dal client
-- (come cancel_booking/mark_booking_special), NON in un AFTER UPDATE che
-- ri-scatena se stesso e che intercetta anche le UPDATE multi-campo del coach.

-- ============================================================================
-- FIX E — UNIQUE parziale su bookings.google_event_id (dopo dedup)
-- ============================================================================
-- =====================================================================
-- FIX 1: UNIQUE INDEX parziale su bookings.google_event_id
-- Idempotente. READ-SAFE: prima diagnostica, poi dedup, poi UNIQUE.
-- =====================================================================

-- --- STEP 0 (DIAGNOSTICA, opzionale, READ-ONLY) ----------------------
-- Esegui PRIMA per vedere se ci sono duplicati attivi da risolvere.
-- Se ritorna 0 righe puoi saltare lo STEP 1 (ma e' comunque no-op).
--
--   SELECT google_event_id,
--          count(*)                         AS n_active,
--          array_agg(id ORDER BY created_at) AS booking_ids,
--          array_agg(scheduled_at ORDER BY created_at) AS slots
--     FROM public.bookings
--    WHERE google_event_id IS NOT NULL
--      AND deleted_at IS NULL
--    GROUP BY google_event_id
--   HAVING count(*) > 1
--    ORDER BY n_active DESC;
--
-- Ispeziona ogni gruppo: i booking_ids piu' VECCHI verranno scollegati
-- (google_event_id azzerato), tenendo solo il piu' recente.


-- --- STEP 1: DEDUP SICURA --------------------------------------------
-- Strategia: per ogni google_event_id con piu' di un booking ATTIVO
-- (deleted_at IS NULL), si TIENE la riga piu' recente (created_at piu'
-- grande, tiebreak su id per determinismo) e si AZZERA google_event_id
-- sulle altre. NON cancella ne' soft-delete alcun booking: rimuove solo
-- il legame all'evento Google dai duplicati piu' vecchi, cosi' il
-- mapping evento->booking resta 1:1 senza perdere prenotazioni.
-- Idempotente: dopo l'esecuzione non resta alcun duplicato, quindi una
-- seconda esecuzione e' un no-op.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY google_event_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM public.bookings
   WHERE google_event_id IS NOT NULL
     AND deleted_at IS NULL
)
UPDATE public.bookings b
   SET google_event_id = NULL,
       updated_at      = now()
  FROM ranked r
 WHERE b.id = r.id
   AND r.rn > 1;

-- --- STEP 2: UNIQUE INDEX PARZIALE -----------------------------------
-- Solo righe attive (non soft-deleted) e con google_event_id valorizzato
-- partecipano al vincolo, cosi' soft-delete + ricreazione non collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_google_event_id_active
  ON public.bookings (google_event_id)
  WHERE google_event_id IS NOT NULL
    AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_bookings_google_event_id_active IS
  'Unicita 1:1 evento Google Calendar -> booking attivo. Parziale su '
  'deleted_at IS NULL cosi un evento puo essere riassegnato dopo soft-'
  'delete. Dedup pre-esistente: vince il booking piu recente per '
  'google_event_id (vedi migration di fix).';


-- Nota: l'index non-unique idx_bookings_google_event_id (gia presente)
-- e ridondante col nuovo UNIQUE per le lookup, ma NON va droppato in
-- READ-ONLY/scope corrente per non toccare piani query esistenti.

-- ============================================================================
-- FIX F — repair_blocks_alignment: preserva valid_until estesi (booster/custom)
-- ============================================================================
-- =====================================================================
-- FIX 3: repair_blocks_alignment preserva valid_until estesi (booster/custom)
-- Aggiorna block_allocations.valid_until SOLO quando era = old_end + grace.
-- Idempotente (CREATE OR REPLACE). search_path = public, SECURITY DEFINER.
-- Firma e GRANT invariati rispetto a 20260525130000.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.repair_blocks_alignment(p_client_id uuid)
RETURNS TABLE (
  block_id      uuid,
  sequence_order int,
  old_start     date,
  new_start     date,
  old_end       date,
  new_end       date,
  action        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path_start date;
  v_blk         RECORD;
  v_prev_end    date := NULL;
  v_new_start   date;
  v_new_end     date;
  v_duration    int;
  v_grace       int;
BEGIN
  -- Authz: client themselves, owning coach, or admin.
  IF NOT (
    auth.uid() = p_client_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_client_id AND coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT path_start_date INTO v_path_start
  FROM public.profiles
  WHERE id = p_client_id;

  -- Legacy clients without anchor: nothing to do.
  IF v_path_start IS NULL THEN
    RETURN;
  END IF;

  FOR v_blk IN
    SELECT
      id, sequence_order, start_date, end_date,
      COALESCE(duration_days, 28) AS dd,
      COALESCE(grace_days, 7)     AS gd
    FROM public.training_blocks
    WHERE client_id = p_client_id
      AND deleted_at IS NULL
    ORDER BY sequence_order ASC
  LOOP
    v_duration := v_blk.dd;
    v_grace    := v_blk.gd;

    IF v_prev_end IS NULL THEN
      v_new_start := v_path_start;
    ELSE
      v_new_start := v_prev_end + INTERVAL '1 day';
    END IF;
    v_new_end := v_new_start + (v_duration - 1) * INTERVAL '1 day';

    IF v_blk.start_date <> v_new_start OR v_blk.end_date <> v_new_end THEN
      UPDATE public.training_blocks
      SET start_date = v_new_start,
          end_date   = v_new_end
      WHERE id = v_blk.id;

      -- FIX: riallinea valid_until SOLO per le allocations 'auto', cioe'
      -- quelle ancorate al vecchio end + grace di fabbrica. Le estensioni
      -- custom/booster (valid_until > old_end + grace, oppure NULL) restano
      -- intatte. Stesso pattern di 20260527150000.
      UPDATE public.block_allocations
      SET valid_until = (v_new_end + v_grace * INTERVAL '1 day')::date
      WHERE block_id = v_blk.id
        AND valid_until IS NOT NULL
        AND valid_until = (v_blk.end_date + v_grace * INTERVAL '1 day')::date;

      RETURN QUERY SELECT
        v_blk.id, v_blk.sequence_order,
        v_blk.start_date, v_new_start,
        v_blk.end_date, v_new_end,
        'repaired'::text;
    ELSE
      RETURN QUERY SELECT
        v_blk.id, v_blk.sequence_order,
        v_blk.start_date, v_new_start,
        v_blk.end_date, v_new_end,
        'ok'::text;
    END IF;

    v_prev_end := v_new_end;
  END LOOP;
END;
$$;

-- GRANT invariati (idempotenti).
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.repair_blocks_alignment(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.repair_blocks_alignment(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON FUNCTION public.repair_blocks_alignment(uuid) IS
  'v3: come v2 ma aggiorna block_allocations.valid_until SOLO dove era = '
  'old_end + grace (valore di fabbrica), preservando estensioni custom/'
  'booster. No-op quando path_start_date e NULL.';

