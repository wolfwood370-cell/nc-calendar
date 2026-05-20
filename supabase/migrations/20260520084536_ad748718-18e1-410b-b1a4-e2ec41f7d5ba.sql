ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'client_session'
  CHECK (category IN ('client_session', 'personal', 'consulenza'));

UPDATE public.bookings
SET category = 'personal'
WHERE is_personal = true AND category = 'client_session';

CREATE INDEX IF NOT EXISTS idx_bookings_coach_special_category
  ON public.bookings (coach_id, scheduled_at)
  WHERE category != 'client_session';

CREATE OR REPLACE FUNCTION public.mark_booking_special(
  p_booking_id uuid,
  p_category   text DEFAULT 'personal'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking      RECORD;
  v_alloc_id     uuid;
  v_extra_id     uuid;
  v_caller       uuid := auth.uid();
  v_is_admin     boolean;
BEGIN
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'booking_id required' USING ERRCODE = 'P0001';
  END IF;
  IF p_category NOT IN ('personal', 'consulenza') THEN
    RAISE EXCEPTION 'Invalid category: %', p_category USING ERRCODE = 'P0001';
  END IF;

  SELECT id, coach_id, client_id, block_id, event_type_id, session_type
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0001';
  END IF;

  v_is_admin := public.has_role(v_caller, 'admin'::public.app_role);
  IF v_booking.coach_id <> v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

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
      CASE
        WHEN v_booking.event_type_id IS NOT NULL AND event_type_id = v_booking.event_type_id THEN 0
        ELSE 1
      END,
      created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_alloc_id IS NOT NULL THEN
      UPDATE public.block_allocations
      SET quantity_booked = GREATEST(0, quantity_booked - 1)
      WHERE id = v_alloc_id;
    END IF;
  END IF;

  IF v_booking.block_id IS NULL
     AND v_booking.client_id IS NOT NULL
     AND v_booking.client_id <> v_booking.coach_id
     AND v_booking.event_type_id IS NOT NULL THEN
    SELECT id INTO v_extra_id
    FROM public.extra_credits
    WHERE client_id = v_booking.client_id
      AND event_type_id = v_booking.event_type_id
      AND quantity_booked > 0
    ORDER BY expires_at ASC
    LIMIT 1
    FOR UPDATE;

    IF v_extra_id IS NOT NULL THEN
      UPDATE public.extra_credits
      SET quantity_booked = GREATEST(0, quantity_booked - 1)
      WHERE id = v_extra_id;
    END IF;
  END IF;

  UPDATE public.bookings
  SET is_personal    = true,
      category       = p_category,
      client_id      = NULL,
      block_id       = NULL,
      event_type_id  = NULL,
      updated_at     = now()
  WHERE id = p_booking_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;