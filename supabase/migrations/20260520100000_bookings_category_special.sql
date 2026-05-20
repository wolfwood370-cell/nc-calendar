-- ==========================================================================
-- P3 / sync overhaul: add `category` discriminator + atomic mark-special RPC
-- ==========================================================================
-- The Personal Blocks feature shipped a `is_personal` boolean that handles
-- "this slot is not a client session". Coaches now want to distinguish
-- sub-categories of non-client time — at minimum Impegno Personale vs
-- Consulenza, with room for future additions. A dedicated `category` text
-- column with a CHECK constraint gives a typed enum without losing the
-- existing is_personal short-circuit semantics that the credit-validation
-- triggers and the UI render paths depend on.
--
-- Backward compat:
--   - Default 'client_session' for everything new and for old rows.
--   - Existing is_personal=true rows backfill to 'personal'.
--   - Triggers and UI continue to use is_personal as the binary
--     "skip credit consumption / render in muted style" gate; category
--     only refines the displayed label.
--
-- The RPC mark_booking_special(p_booking_id, p_category) updates the
-- booking atomically and — crucially — refunds any credit that was
-- previously consumed against a training block or extra credit pack.
-- Without the refund, marking a previously-matched event as "personal"
-- would silently leak the credit (block_allocations.quantity_booked
-- stays incremented but the booking row no longer carries the block_id
-- link). RPC body runs inside a single transaction so a refund + update
-- are all-or-nothing.
-- ==========================================================================

-- 1) Column with CHECK enum. Default keeps old rows + new client sessions
--    in the default bucket; the RPC moves rows out into special categories.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'client_session'
  CHECK (category IN ('client_session', 'personal', 'consulenza'));

-- Backfill: existing personal blocks (shipped before this migration)
-- get category='personal' so the UI label stays consistent.
UPDATE public.bookings
SET category = 'personal'
WHERE is_personal = true AND category = 'client_session';

-- Partial index on the special buckets (typical UI filter:
-- "show me my non-client commitments"). The client_session majority
-- isn't indexed because every query that cares about it already
-- filters by coach_id + scheduled_at.
CREATE INDEX IF NOT EXISTS idx_bookings_coach_special_category
  ON public.bookings (coach_id, scheduled_at)
  WHERE category != 'client_session';

-- 2) Atomic mark-as-special RPC. Refunds the consumed credit (block
--    allocation OR extra credit, whichever was used) and then clears
--    the booking's client/block/event_type links + flips is_personal.
--    All in one transaction so partial state can't leak.
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

  -- Authorization: caller must be the coach of the booking OR an admin.
  -- Mirrors the "Coach manage clients bookings" RLS policy intent.
  v_is_admin := public.has_role(v_caller, 'admin'::public.app_role);
  IF v_booking.coach_id <> v_caller AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Refund block allocation (path-based credit) if one was consumed.
  -- Mirrors the resolution order used by the validation trigger:
  -- event_type match wins over session_type, newest row wins on tie
  -- (heuristic for "the one we most recently incremented").
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

  -- Refund extra credit (booster) if the booking wasn't path-backed
  -- and had a real client + event type assignment. Coach-owned mirror
  -- events (client_id = coach_id) never consumed extras to begin with.
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

  -- Finally clear the links and stamp the new category.
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

-- Locked down. Only invoked from authenticated UI; the SECURITY DEFINER
-- body re-checks coach ownership before mutating anything.
REVOKE EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;
