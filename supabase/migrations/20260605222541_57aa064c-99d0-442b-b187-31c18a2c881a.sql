-- ============================================================================
-- Audit round 2 — fix DB
-- ============================================================================

-- FIX A
CREATE OR REPLACE FUNCTION public.prevent_self_profile_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;
  IF NEW.auto_renew_blocks IS DISTINCT FROM OLD.auto_renew_blocks
   OR NEW.auto_renew       IS DISTINCT FROM OLD.auto_renew
   OR NEW.path_type        IS DISTINCT FROM OLD.path_type
   OR NEW.path_start_date  IS DISTINCT FROM OLD.path_start_date
   OR NEW.next_billing_date IS DISTINCT FROM OLD.next_billing_date
   OR NEW.status           IS DISTINCT FROM OLD.status
   OR NEW.pack_label       IS DISTINCT FROM OLD.pack_label
   OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at
   OR NEW.email            IS DISTINCT FROM OLD.email
   OR NEW.coach_id         IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'Non puoi modificare i campi di abbonamento, email o assegnazione del tuo profilo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_self_profile_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_self_profile_escalation_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_profile_escalation();

-- FIX B
DROP POLICY IF EXISTS "Client insert own bookings" ON public.bookings;
CREATE POLICY "Client insert own bookings"
ON public.bookings FOR INSERT TO authenticated
WITH CHECK (
  client_id = auth.uid()
  AND coach_id = public.get_coach_for(auth.uid())
  AND status = 'scheduled'::public.booking_status
  AND is_personal = false
  AND category = 'client_session'
  AND google_event_id IS NULL
);

CREATE OR REPLACE FUNCTION public.enforce_client_booking_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin'::public.app_role)
     OR public.has_role(auth.uid(), 'coach'::public.app_role) THEN
    RETURN NEW;
  END IF;
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
DROP TRIGGER IF EXISTS a_trg_enforce_client_booking_insert ON public.bookings;
CREATE TRIGGER a_trg_enforce_client_booking_insert
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_booking_insert();

-- FIX C (A1)
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS TABLE(status booking_status, was_late boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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

-- FIX C (A2)
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

-- FIX C (B1)
UPDATE public.block_allocations SET quantity_booked = 0 WHERE quantity_booked < 0;
ALTER TABLE public.block_allocations DROP CONSTRAINT IF EXISTS block_allocations_booked_range_chk;
ALTER TABLE public.block_allocations DROP CONSTRAINT IF EXISTS block_allocations_booked_nonneg_chk;
ALTER TABLE public.block_allocations ADD CONSTRAINT block_allocations_booked_nonneg_chk CHECK (quantity_booked >= 0) NOT VALID;
ALTER TABLE public.block_allocations VALIDATE CONSTRAINT block_allocations_booked_nonneg_chk;

-- FIX C (B2)
UPDATE public.extra_credits SET quantity_booked = 0 WHERE quantity_booked < 0;
ALTER TABLE public.extra_credits DROP CONSTRAINT IF EXISTS extra_credits_booked_range_chk;
ALTER TABLE public.extra_credits DROP CONSTRAINT IF EXISTS extra_credits_booked_nonneg_chk;
ALTER TABLE public.extra_credits ADD CONSTRAINT extra_credits_booked_nonneg_chk CHECK (quantity_booked >= 0) NOT VALID;
ALTER TABLE public.extra_credits VALIDATE CONSTRAINT extra_credits_booked_nonneg_chk;

-- FIX D
CREATE OR REPLACE FUNCTION public.revalidate_client_reschedule_window()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_block_start  date;
  v_old_local    date;
  v_new_local    date;
  v_old_week     int;
  v_new_week     int;
  v_min_valid    date;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'scheduled'::public.booking_status
     OR NEW.deleted_at IS NOT NULL
     OR NEW.google_event_id IS NOT NULL
     OR NEW.is_personal = true
     OR NEW.category <> 'client_session'
     OR NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;
  IF OLD.scheduled_at IS NOT DISTINCT FROM NEW.scheduled_at THEN
    RETURN NEW;
  END IF;
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
  BEFORE UPDATE OF scheduled_at ON public.bookings
  FOR EACH ROW
  WHEN (OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at)
  EXECUTE FUNCTION public.revalidate_client_reschedule_window();

-- FIX E
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY google_event_id ORDER BY created_at DESC, id DESC) AS rn
    FROM public.bookings
   WHERE google_event_id IS NOT NULL AND deleted_at IS NULL
)
UPDATE public.bookings b SET google_event_id = NULL, updated_at = now()
  FROM ranked r WHERE b.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_google_event_id_active
  ON public.bookings (google_event_id)
  WHERE google_event_id IS NOT NULL AND deleted_at IS NULL;
COMMENT ON INDEX public.uq_bookings_google_event_id_active IS
  'Unicita 1:1 evento Google Calendar -> booking attivo. Parziale su deleted_at IS NULL.';

-- FIX F
CREATE OR REPLACE FUNCTION public.repair_blocks_alignment(p_client_id uuid)
RETURNS TABLE (
  block_id uuid, sequence_order int,
  old_start date, new_start date,
  old_end date, new_end date, action text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_path_start date;
  v_blk RECORD;
  v_prev_end date := NULL;
  v_new_start date;
  v_new_end date;
  v_duration int;
  v_grace int;
BEGIN
  IF NOT (
    auth.uid() = p_client_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client_id AND coach_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;
  SELECT path_start_date INTO v_path_start FROM public.profiles WHERE id = p_client_id;
  IF v_path_start IS NULL THEN RETURN; END IF;
  FOR v_blk IN
    SELECT id, sequence_order, start_date, end_date,
           COALESCE(duration_days, 28) AS dd,
           COALESCE(grace_days, 7) AS gd
    FROM public.training_blocks
    WHERE client_id = p_client_id AND deleted_at IS NULL
    ORDER BY sequence_order ASC
  LOOP
    v_duration := v_blk.dd;
    v_grace := v_blk.gd;
    IF v_prev_end IS NULL THEN v_new_start := v_path_start;
    ELSE v_new_start := v_prev_end + INTERVAL '1 day';
    END IF;
    v_new_end := v_new_start + (v_duration - 1) * INTERVAL '1 day';
    IF v_blk.start_date <> v_new_start OR v_blk.end_date <> v_new_end THEN
      UPDATE public.training_blocks SET start_date = v_new_start, end_date = v_new_end WHERE id = v_blk.id;
      UPDATE public.block_allocations
      SET valid_until = (v_new_end + v_grace * INTERVAL '1 day')::date
      WHERE block_id = v_blk.id
        AND valid_until IS NOT NULL
        AND valid_until = (v_blk.end_date + v_grace * INTERVAL '1 day')::date;
      RETURN QUERY SELECT v_blk.id, v_blk.sequence_order, v_blk.start_date, v_new_start, v_blk.end_date, v_new_end, 'repaired'::text;
    ELSE
      RETURN QUERY SELECT v_blk.id, v_blk.sequence_order, v_blk.start_date, v_new_start, v_blk.end_date, v_new_end, 'ok'::text;
    END IF;
    v_prev_end := v_new_end;
  END LOOP;
END;
$$;
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.repair_blocks_alignment(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.repair_blocks_alignment(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
COMMENT ON FUNCTION public.repair_blocks_alignment(uuid) IS
  'v3: aggiorna block_allocations.valid_until SOLO dove era = old_end + grace, preservando estensioni custom/booster.';