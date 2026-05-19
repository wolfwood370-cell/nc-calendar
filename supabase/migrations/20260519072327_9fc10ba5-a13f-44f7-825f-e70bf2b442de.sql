-- Re-apply missing schema bits (duration_min/buffer_min columns and cancel_booking RPC)
-- that were defined in earlier migrations but never landed on the DB.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS duration_min int,
  ADD COLUMN IF NOT EXISTS buffer_min int;

UPDATE public.bookings b
SET
  duration_min = COALESCE(b.duration_min, et.duration, 60),
  buffer_min   = COALESCE(b.buffer_min, et.buffer_minutes, 0)
FROM public.event_types et
WHERE b.event_type_id = et.id
  AND (b.duration_min IS NULL OR b.buffer_min IS NULL);

UPDATE public.bookings
SET duration_min = COALESCE(duration_min, 60),
    buffer_min   = COALESCE(buffer_min, 0)
WHERE duration_min IS NULL OR buffer_min IS NULL;

ALTER TABLE public.bookings
  ALTER COLUMN duration_min SET DEFAULT 60,
  ALTER COLUMN buffer_min   SET DEFAULT 0,
  ALTER COLUMN duration_min SET NOT NULL,
  ALTER COLUMN buffer_min   SET NOT NULL;

-- cancel_booking RPC
CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS TABLE (status public.booking_status, was_late boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking  record;
  v_caller   uuid := auth.uid();
  v_is_late  boolean;
  v_status   public.booking_status;
  v_alloc_id uuid;
  v_ec_id    uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sessione non autenticata.' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, client_id, coach_id, block_id, event_type_id, session_type,
         scheduled_at, status, deleted_at
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Sessione non trovata.' USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.deleted_at IS NOT NULL OR v_booking.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Sessione già annullata o conclusa.' USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.client_id IS DISTINCT FROM v_caller
     AND v_booking.coach_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato.' USING ERRCODE = '42501';
  END IF;

  v_is_late := now() >= (v_booking.scheduled_at - interval '24 hours');
  v_status  := CASE WHEN v_is_late THEN 'late_cancelled'::public.booking_status
                                    ELSE 'cancelled'::public.booking_status END;

  UPDATE public.bookings
  SET status = v_status, deleted_at = now()
  WHERE id = p_booking_id;

  IF NOT v_is_late THEN
    IF v_booking.block_id IS NOT NULL THEN
      SELECT id INTO v_alloc_id
      FROM public.block_allocations
      WHERE block_id = v_booking.block_id
        AND quantity_booked > 0
        AND (
          (v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id)
          OR session_type = v_booking.session_type
        )
      ORDER BY
        CASE WHEN v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id THEN 0 ELSE 1 END,
        created_at ASC
      LIMIT 1 FOR UPDATE;

      IF v_alloc_id IS NOT NULL THEN
        UPDATE public.block_allocations
        SET quantity_booked = GREATEST(0, quantity_booked - 1)
        WHERE id = v_alloc_id;
      END IF;
    ELSIF v_booking.client_id IS NOT NULL AND v_booking.event_type_id IS NOT NULL THEN
      SELECT id INTO v_ec_id
      FROM public.extra_credits
      WHERE client_id = v_booking.client_id
        AND event_type_id = v_booking.event_type_id
        AND quantity_booked > 0
      ORDER BY expires_at ASC
      LIMIT 1 FOR UPDATE;

      IF v_ec_id IS NOT NULL THEN
        UPDATE public.extra_credits
        SET quantity_booked = GREATEST(0, quantity_booked - 1)
        WHERE id = v_ec_id;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, v_is_late;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;