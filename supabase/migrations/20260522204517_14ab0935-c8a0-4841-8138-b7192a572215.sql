-- ============== 20260514132100_booking_extra_credits_trigger ==============
CREATE OR REPLACE FUNCTION public.validate_booking_extra_credits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_credit_id uuid;
BEGIN
  IF NEW.block_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN RETURN NEW; END IF;
  IF NEW.event_type_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito: nessun tipo sessione specificato per la prenotazione.' USING ERRCODE = 'P0001';
  END IF;
  SELECT ec.id INTO v_credit_id FROM public.extra_credits ec
    WHERE ec.client_id = NEW.client_id AND ec.event_type_id = NEW.event_type_id
      AND ec.quantity - ec.quantity_booked > 0 AND ec.expires_at > now()
    ORDER BY ec.expires_at ASC LIMIT 1 FOR UPDATE;
  IF v_credit_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.extra_credits SET quantity_booked = quantity_booked + 1 WHERE id = v_credit_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_booking_validate_extra_credits ON public.bookings;
CREATE TRIGGER trg_booking_validate_extra_credits
  BEFORE INSERT ON public.bookings FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_extra_credits();

DROP POLICY IF EXISTS "Client update own extra_credits" ON public.extra_credits;
CREATE POLICY "Client update own extra_credits" ON public.extra_credits
  FOR UPDATE TO authenticated USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());

-- ============== 20260518120000_booking_atomic_integrity (adapted) ==============
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS duration_min int,
  ADD COLUMN IF NOT EXISTS buffer_min int;

UPDATE public.bookings b SET
  duration_min = COALESCE(b.duration_min, et.duration, 60),
  buffer_min   = COALESCE(b.buffer_min, et.buffer_minutes, 0)
FROM public.event_types et
WHERE b.event_type_id = et.id AND (b.duration_min IS NULL OR b.buffer_min IS NULL);

UPDATE public.bookings SET
  duration_min = COALESCE(duration_min, 60), buffer_min = COALESCE(buffer_min, 0)
WHERE duration_min IS NULL OR buffer_min IS NULL;

ALTER TABLE public.bookings
  ALTER COLUMN duration_min SET DEFAULT 60,
  ALTER COLUMN buffer_min   SET DEFAULT 0;
ALTER TABLE public.bookings
  ALTER COLUMN duration_min SET NOT NULL,
  ALTER COLUMN buffer_min   SET NOT NULL;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS end_at timestamptz;

UPDATE public.bookings
SET end_at = scheduled_at + make_interval(mins => duration_min + buffer_min)
WHERE end_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_booking_duration_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_type_id IS NOT NULL AND (NEW.duration_min IS NULL OR NEW.buffer_min IS NULL) THEN
    SELECT COALESCE(NEW.duration_min, et.duration, 60),
           COALESCE(NEW.buffer_min, et.buffer_minutes, 0)
    INTO NEW.duration_min, NEW.buffer_min
    FROM public.event_types et WHERE et.id = NEW.event_type_id;
  END IF;
  NEW.duration_min := COALESCE(NEW.duration_min, 60);
  NEW.buffer_min   := COALESCE(NEW.buffer_min, 0);
  NEW.end_at := NEW.scheduled_at + make_interval(mins => NEW.duration_min + NEW.buffer_min);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_set_booking_duration_defaults ON public.bookings;
DROP TRIGGER IF EXISTS a_trg_set_booking_duration_defaults ON public.bookings;
CREATE TRIGGER a_trg_set_booking_duration_defaults
  BEFORE INSERT OR UPDATE OF scheduled_at, duration_min, buffer_min, event_type_id
  ON public.bookings FOR EACH ROW
  EXECUTE FUNCTION public.set_booking_duration_defaults();

ALTER TABLE public.bookings ALTER COLUMN end_at SET NOT NULL;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY coach_id, scheduled_at, end_at
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.bookings
  WHERE status = 'scheduled' AND deleted_at IS NULL
)
UPDATE public.bookings b
SET status = 'cancelled', deleted_at = now()
FROM ranked r
WHERE b.id = r.id AND r.rn > 1;

CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_alloc_id uuid; v_block_start date; v_week_number int;
BEGIN
  IF NEW.block_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN RETURN NEW; END IF;
  SELECT start_date INTO v_block_start FROM public.training_blocks WHERE id = NEW.block_id;
  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.' USING ERRCODE = 'P0001';
  END IF;
  v_week_number := LEAST(4, GREATEST(1, FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)::int + 1));
  SELECT id INTO v_alloc_id FROM public.block_allocations
    WHERE block_id = NEW.block_id AND week_number = v_week_number
      AND quantity_assigned > quantity_booked
      AND (valid_until IS NULL OR valid_until >= NEW.scheduled_at::date)
      AND ((NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id)
           OR session_type = NEW.session_type)
    ORDER BY CASE WHEN NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id THEN 0 ELSE 1 END, created_at ASC
    LIMIT 1 FOR UPDATE;
  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa settimana e tipologia.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.block_allocations SET quantity_booked = quantity_booked + 1 WHERE id = v_alloc_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_booking_validate_block_allocation ON public.bookings;
CREATE TRIGGER trg_booking_validate_block_allocation
  BEFORE INSERT ON public.bookings FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_block_allocation();

-- Dedup remaining overlapping pairs (not exact-match) before constraint
WITH dup_overlaps AS (
  SELECT b2.id
  FROM public.bookings b1
  JOIN public.bookings b2
    ON b1.coach_id = b2.coach_id
   AND b1.id <> b2.id
   AND b1.status='scheduled' AND b2.status='scheduled'
   AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
   AND tstzrange(b1.scheduled_at, b1.end_at, '[)') && tstzrange(b2.scheduled_at, b2.end_at, '[)')
   AND (b1.created_at, b1.id) < (b2.created_at, b2.id)
)
UPDATE public.bookings b
SET status='cancelled', deleted_at = now()
FROM dup_overlaps o
WHERE b.id = o.id;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap_per_coach;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_no_overlap_per_coach
  EXCLUDE USING gist (coach_id WITH =, tstzrange(scheduled_at, end_at, '[)') WITH &&)
  WHERE (status = 'scheduled' AND deleted_at IS NULL);

-- ============== 20260518121500_relax_block_allocation_week_match ==============
CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_alloc_id uuid; v_block_start date; v_week_number int;
BEGIN
  IF NEW.block_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN RETURN NEW; END IF;
  SELECT start_date INTO v_block_start FROM public.training_blocks WHERE id = NEW.block_id;
  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.' USING ERRCODE = 'P0001';
  END IF;
  v_week_number := LEAST(4, GREATEST(1, FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)::int + 1));
  SELECT id INTO v_alloc_id FROM public.block_allocations
    WHERE block_id = NEW.block_id
      AND quantity_assigned > quantity_booked
      AND (valid_until IS NULL OR valid_until >= NEW.scheduled_at::date)
      AND ((NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id)
           OR session_type = NEW.session_type)
    ORDER BY CASE WHEN NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id THEN 0 ELSE 1 END,
             CASE WHEN week_number = v_week_number THEN 0 ELSE 1 END,
             ABS(week_number - v_week_number),
             created_at ASC
    LIMIT 1 FOR UPDATE;
  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa tipologia.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.block_allocations SET quantity_booked = quantity_booked + 1 WHERE id = v_alloc_id;
  RETURN NEW;
END; $$;

-- ============== 20260518122000_data_integrity_fks_and_trigger_tz ==============
UPDATE public.bookings b SET event_type_id = NULL
WHERE event_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = b.event_type_id);
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_event_type_id_fkey;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_event_type_id_fkey
  FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;

UPDATE public.block_allocations a SET event_type_id = NULL
WHERE event_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = a.event_type_id);
ALTER TABLE public.block_allocations DROP CONSTRAINT IF EXISTS block_allocations_event_type_id_fkey;
ALTER TABLE public.block_allocations ADD CONSTRAINT block_allocations_event_type_id_fkey
  FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;

DELETE FROM public.extra_credits
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = extra_credits.client_id);
ALTER TABLE public.extra_credits DROP CONSTRAINT IF EXISTS extra_credits_client_id_fkey;
ALTER TABLE public.extra_credits ADD CONSTRAINT extra_credits_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.extra_credits ALTER COLUMN event_type_id DROP NOT NULL;
UPDATE public.extra_credits ec SET event_type_id = NULL
WHERE event_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = ec.event_type_id);
ALTER TABLE public.extra_credits DROP CONSTRAINT IF EXISTS extra_credits_event_type_id_fkey;
ALTER TABLE public.extra_credits ADD CONSTRAINT extra_credits_event_type_id_fkey
  FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_alloc_id uuid; v_block_start date; v_booking_date date; v_week_number int;
BEGIN
  IF NEW.block_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN RETURN NEW; END IF;
  SELECT start_date INTO v_block_start FROM public.training_blocks WHERE id = NEW.block_id;
  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.' USING ERRCODE = 'P0001';
  END IF;
  v_booking_date := (NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date;
  v_week_number := LEAST(4, GREATEST(1, FLOOR((v_booking_date - v_block_start) / 7.0)::int + 1));
  SELECT id INTO v_alloc_id FROM public.block_allocations
    WHERE block_id = NEW.block_id
      AND quantity_assigned > quantity_booked
      AND (valid_until IS NULL OR valid_until >= v_booking_date)
      AND ((NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id)
           OR session_type = NEW.session_type)
    ORDER BY CASE WHEN NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id THEN 0 ELSE 1 END,
             CASE WHEN week_number = v_week_number THEN 0 ELSE 1 END,
             ABS(week_number - v_week_number),
             created_at ASC
    LIMIT 1 FOR UPDATE;
  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa tipologia.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.block_allocations SET quantity_booked = quantity_booked + 1 WHERE id = v_alloc_id;
  RETURN NEW;
END; $$;

-- ============== 20260519100000_admin_delete_client_rpc ==============
CREATE OR REPLACE FUNCTION public.admin_delete_client(p_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'client_id is required'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_client_id;
  IF v_email IS NOT NULL THEN
    DELETE FROM public.client_invitations WHERE LOWER(email) = LOWER(v_email);
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_client_id;
  DELETE FROM public.profiles WHERE id = p_client_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM authenticated;

-- ============== 20260519110000_get_coach_busy_snapshot_duration ==============
CREATE OR REPLACE FUNCTION public.get_coach_busy(
  p_coach_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (scheduled_at timestamptz, event_type_id uuid, duration integer, buffer_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.scheduled_at, b.event_type_id,
         b.duration_min AS duration, b.buffer_min AS buffer_minutes
  FROM public.bookings b
  WHERE b.coach_id = p_coach_id AND b.deleted_at IS NULL
    AND b.status IN ('scheduled', 'completed')
    AND b.scheduled_at >= p_from AND b.scheduled_at <= p_to
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR auth.uid() = p_coach_id
         OR public.get_coach_for(auth.uid()) = p_coach_id);
$$;

-- ============== 20260519120000_cancel_booking_rpc ==============
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS TABLE (status public.booking_status, was_late boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_booking record; v_caller uuid := auth.uid();
        v_is_late boolean; v_status public.booking_status;
        v_alloc_id uuid; v_ec_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Sessione non autenticata.' USING ERRCODE='P0001'; END IF;
  SELECT id, client_id, coach_id, block_id, event_type_id, session_type,
         scheduled_at, status, deleted_at
    INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Sessione non trovata.' USING ERRCODE='P0001'; END IF;
  IF v_booking.deleted_at IS NOT NULL OR v_booking.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Sessione già annullata o conclusa.' USING ERRCODE='P0001';
  END IF;
  IF v_booking.client_id IS DISTINCT FROM v_caller
     AND v_booking.coach_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato.' USING ERRCODE='42501';
  END IF;
  v_is_late := now() >= (v_booking.scheduled_at - interval '24 hours');
  v_status := CASE WHEN v_is_late THEN 'late_cancelled'::public.booking_status
                   ELSE 'cancelled'::public.booking_status END;
  UPDATE public.bookings SET status=v_status, deleted_at=now() WHERE id=p_booking_id;
  IF NOT v_is_late THEN
    IF v_booking.block_id IS NOT NULL THEN
      SELECT id INTO v_alloc_id FROM public.block_allocations
        WHERE block_id = v_booking.block_id AND quantity_booked > 0
          AND ((v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id)
               OR session_type = v_booking.session_type)
        ORDER BY CASE WHEN v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1 FOR UPDATE;
      IF v_alloc_id IS NOT NULL THEN
        UPDATE public.block_allocations SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_alloc_id;
      END IF;
    ELSIF v_booking.client_id IS NOT NULL AND v_booking.event_type_id IS NOT NULL THEN
      SELECT id INTO v_ec_id FROM public.extra_credits
        WHERE client_id = v_booking.client_id AND event_type_id = v_booking.event_type_id
          AND quantity_booked > 0
        ORDER BY expires_at ASC LIMIT 1 FOR UPDATE;
      IF v_ec_id IS NOT NULL THEN
        UPDATE public.extra_credits SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_ec_id;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_status, v_is_late;
END; $$;
REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;

-- ============== 20260519130000_send_email_rate_limit ==============
CREATE TABLE IF NOT EXISTS public.send_email_rate_limit (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_send_email_rate_limit_user_time
  ON public.send_email_rate_limit (user_id, sent_at DESC);
ALTER TABLE public.send_email_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_email_rate_limit(p_user_id uuid, p_limit int DEFAULT 20)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  DELETE FROM public.send_email_rate_limit WHERE user_id = p_user_id AND sent_at < (now() - interval '1 minute');
  SELECT COUNT(*) INTO v_count FROM public.send_email_rate_limit WHERE user_id = p_user_id;
  IF v_count >= p_limit THEN RETURN false; END IF;
  INSERT INTO public.send_email_rate_limit (user_id) VALUES (p_user_id);
  RETURN true;
END; $$;
REVOKE EXECUTE ON FUNCTION public.check_email_rate_limit(uuid, int) FROM PUBLIC, anon, authenticated;

-- ============== 20260519140000_booster_packs_table ==============
CREATE TABLE IF NOT EXISTS public.booster_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type text NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  amount_cents int NOT NULL CHECK (amount_cents > 0),
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  event_type_title text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_type, currency)
);
INSERT INTO public.booster_packs (package_type, currency, amount_cents, quantity, event_type_title)
VALUES ('single','eur',4000,1,'PT'),('pack','eur',9900,3,'PT'),('triage','eur',7500,1,'Triage')
ON CONFLICT (package_type, currency) DO NOTHING;
ALTER TABLE public.booster_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read active booster packs" ON public.booster_packs;
CREATE POLICY "Read active booster packs" ON public.booster_packs
  FOR SELECT TO authenticated USING (active = true);
DROP POLICY IF EXISTS "Admin manage booster packs" ON public.booster_packs;
CREATE POLICY "Admin manage booster packs" ON public.booster_packs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============== 20260519150000_bookings_is_personal ==============
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_bookings_coach_personal
  ON public.bookings (coach_id, scheduled_at) WHERE is_personal = true;

-- ============== 20260520100000_bookings_category_special ==============
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='bookings' AND column_name='category') THEN
    ALTER TABLE public.bookings ADD COLUMN category text NOT NULL DEFAULT 'client_session'
      CHECK (category IN ('client_session','personal','consulenza'));
  END IF;
END $$;
UPDATE public.bookings SET category='personal'
WHERE is_personal=true AND category='client_session';
CREATE INDEX IF NOT EXISTS idx_bookings_coach_special_category
  ON public.bookings (coach_id, scheduled_at) WHERE category != 'client_session';

CREATE OR REPLACE FUNCTION public.mark_booking_special(p_booking_id uuid, p_category text DEFAULT 'personal')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      ORDER BY CASE WHEN v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id THEN 0 ELSE 1 END, created_at DESC
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
END; $$;
REVOKE EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;

-- ============== 20260520140000_integration_settings_stripe_account ==============
ALTER TABLE public.integration_settings
  ADD COLUMN IF NOT EXISTS stripe_account_id text;
CREATE INDEX IF NOT EXISTS idx_integration_settings_stripe_connected
  ON public.integration_settings (coach_id) WHERE stripe_account_id IS NOT NULL;

-- ============== 20260522100000_client_booking_update_guards ==============
CREATE OR REPLACE FUNCTION public.validate_client_booking_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM OLD.client_id THEN RETURN NEW; END IF;
  IF OLD.scheduled_at < (now() + interval '24 hours') THEN
    RAISE EXCEPTION 'Non è possibile spostare un appuntamento a meno di 24 ore dall''inizio.' USING ERRCODE='P0001';
  END IF;
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
   OR NEW.client_id IS DISTINCT FROM OLD.client_id
   OR NEW.block_id IS DISTINCT FROM OLD.block_id
   OR NEW.session_type IS DISTINCT FROM OLD.session_type
   OR NEW.event_type_id IS DISTINCT FROM OLD.event_type_id
   OR NEW.status IS DISTINCT FROM OLD.status
   OR NEW.notes IS DISTINCT FROM OLD.notes
   OR NEW.trainer_notes IS DISTINCT FROM OLD.trainer_notes
   OR NEW.meeting_link IS DISTINCT FROM OLD.meeting_link
   OR NEW.google_event_id IS DISTINCT FROM OLD.google_event_id
   OR NEW.title IS DISTINCT FROM OLD.title
   OR NEW.is_personal IS DISTINCT FROM OLD.is_personal
   OR NEW.category IS DISTINCT FROM OLD.category
   OR NEW.duration_min IS DISTINCT FROM OLD.duration_min
   OR NEW.buffer_min IS DISTINCT FROM OLD.buffer_min
   OR NEW.ignored IS DISTINCT FROM OLD.ignored
   OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Come atleta puoi modificare solo data e orario della sessione.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS z_trg_validate_client_booking_update ON public.bookings;
CREATE TRIGGER z_trg_validate_client_booking_update
  BEFORE UPDATE ON public.bookings FOR EACH ROW
  EXECUTE FUNCTION public.validate_client_booking_update();

-- ============== 20260522130000_security_hardening_realtime_grants ==============
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.integration_settings;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.bookings;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE
    public.block_allocations, public.extra_credits, public.training_blocks,
    public.event_types, public.profiles, public.user_roles,
    public.client_invitations, public.push_subscriptions,
    public.trainer_availability, public.availability_exceptions,
    public.weekly_schedule, public.booster_packs;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;

DROP POLICY IF EXISTS "Client update own block_allocations booked" ON public.block_allocations;
DROP POLICY IF EXISTS "Client update own extra_credits booked" ON public.extra_credits;
DROP TRIGGER IF EXISTS trg_enforce_block_allocations_client_update ON public.block_allocations;
DROP TRIGGER IF EXISTS trg_enforce_extra_credits_client_update ON public.extra_credits;
DROP FUNCTION IF EXISTS public.enforce_block_allocations_client_update();
DROP FUNCTION IF EXISTS public.enforce_extra_credits_client_update();

DO $$ DECLARE v_fn text;
  v_fns text[] := ARRAY[
    'set_booking_duration_defaults()','validate_booking_block_allocation()',
    'validate_booking_extra_credits()','validate_client_booking_update()',
    'prevent_coach_id_change()','handle_new_user()','set_updated_at()'];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_fn);
    EXCEPTION WHEN undefined_function THEN NULL; END;
  END LOOP;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.check_email_rate_limit(uuid, int) FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_coach_for(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_coach_for(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
  ALTER EXTENSION btree_gist SET SCHEMA extensions;
EXCEPTION WHEN undefined_object OR invalid_schema_name THEN NULL; END $$;