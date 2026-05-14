-- ==========================================================================
-- Migration: Enforce extra_credits validation on bookings INSERT
-- ==========================================================================
-- When a booking is inserted with block_id IS NULL, the trigger validates
-- that the client has available extra_credits for the given event_type_id
-- and atomically increments quantity_booked to prevent race conditions.
--
-- Also adds an RLS policy so clients can UPDATE their own extra_credits
-- (needed for the frontend refund path on cancellation).
-- ==========================================================================

-- 1) Trigger function: validate & auto-deduct extra_credits for independent bookings
CREATE OR REPLACE FUNCTION public.validate_booking_extra_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_id uuid;
BEGIN
  -- Only enforce for bookings without a training block (independent clients / booster).
  -- Bookings WITH a block_id are validated by the existing block_allocations logic.
  -- Also skip validation for coach-created bookings (client_id IS NULL or client_id = coach_id)
  -- since those are imported from Google Calendar.
  IF NEW.block_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  -- If no event_type_id is set, we cannot match to extra_credits, so block the insert.
  IF NEW.event_type_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito: nessun tipo sessione specificato per la prenotazione.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Atomically find and lock the earliest-expiring extra_credit row with remaining capacity.
  SELECT ec.id INTO v_credit_id
  FROM public.extra_credits ec
  WHERE ec.client_id = NEW.client_id
    AND ec.event_type_id = NEW.event_type_id
    AND ec.quantity - ec.quantity_booked > 0
    AND ec.expires_at > now()
  ORDER BY ec.expires_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_credit_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Auto-increment quantity_booked (server-side, race-condition safe)
  UPDATE public.extra_credits
  SET quantity_booked = quantity_booked + 1
  WHERE id = v_credit_id;

  RETURN NEW;
END;
$$;

-- 2) Attach trigger BEFORE INSERT on bookings
DROP TRIGGER IF EXISTS trg_booking_validate_extra_credits ON public.bookings;
CREATE TRIGGER trg_booking_validate_extra_credits
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_extra_credits();


-- 3) RLS: Allow clients to UPDATE their own extra_credits (for refund on cancellation)
DROP POLICY IF EXISTS "Client update own extra_credits" ON public.extra_credits;
CREATE POLICY "Client update own extra_credits"
ON public.extra_credits
FOR UPDATE
TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());
