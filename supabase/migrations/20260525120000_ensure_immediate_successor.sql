-- ==========================================================================
-- ensure_client_block_state — create successor block immediately at end_date
-- ==========================================================================
-- Previous semantics (20260523112416_*_block-auto-renew.sql): the successor
-- block was created only when today > end_date + grace_days. That left a
-- 7-day gap where the client had no "current block" — Simone Sambataro
-- (start 20 Apr, end 17 May, grace until 24 May) is in this gap right now
-- and the UI shows him stuck on Blocco 1.
--
-- New semantics:
--   - today <= end_date            → current = last block (no grace yet)
--   - today >  end_date            → mark last as completed, create
--                                    successor immediately (sequence_order+1)
--                                    if auto_renew_blocks=true
--   - today <= end_date + grace    → in_grace_period=true (UI banner about
--                                    residual sessions still bookable)
--   - today >  end_date + grace    → in_grace_period=false; old allocations
--                                    are past their valid_until so the
--                                    booking trigger refuses them
--
-- The successor's allocations are copied from the previous block as
-- template (same week_number, session_type, event_type_id,
-- quantity_assigned) with quantity_booked=0 and valid_until set to the
-- new end + grace. The FIFO ordering in validate_booking_block_allocation
-- (valid_until ASC NULLS LAST) ensures any consumption during grace eats
-- the older block's residuals first.
--
-- Idempotent: re-running with the successor already present (same
-- sequence_order+1) finds it and skips the insert. Single-block creation
-- per call — a multi-month catch-up loop is out of scope.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.ensure_client_block_state(p_client_id uuid)
RETURNS TABLE (
  current_block_id        uuid,
  in_grace_period         boolean,
  previous_block_id       uuid,
  residuals_from_previous int,
  next_renewal_date       date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today     date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_last      public.training_blocks%ROWTYPE;
  v_next_id   uuid;
  v_residual  int;
  v_auto      boolean;
  v_duration  int;
  v_grace     int;
  v_new_start date;
  v_new_end   date;
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

  -- Most recent non-deleted block for this client.
  SELECT * INTO v_last
  FROM public.training_blocks
  WHERE client_id = p_client_id AND deleted_at IS NULL
  ORDER BY sequence_order DESC, start_date DESC
  LIMIT 1;

  IF v_last.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, NULL::uuid, 0, NULL::date;
    RETURN;
  END IF;

  -- ---- Case 1: still inside the current block window ---------------------
  IF v_today <= v_last.end_date THEN
    RETURN QUERY SELECT
      v_last.id,
      false,
      NULL::uuid,
      0,
      v_last.end_date + v_last.grace_days;
    RETURN;
  END IF;

  -- From here: today > end_date. Block has expired (possibly still in
  -- grace from the consumption point of view).

  -- Close the expired block if still marked active.
  IF v_last.status = 'active' THEN
    UPDATE public.training_blocks
    SET status = 'completed'
    WHERE id = v_last.id;
  END IF;

  -- Residuals from the old block (sessions paid but not yet consumed).
  SELECT COALESCE(SUM(quantity_assigned - quantity_booked), 0)
  INTO v_residual
  FROM public.block_allocations
  WHERE block_id = v_last.id;

  -- Profile auto-renew flag.
  SELECT auto_renew_blocks INTO v_auto FROM public.profiles WHERE id = p_client_id;

  -- ---- Case 2: auto-renew disabled ---------------------------------------
  IF COALESCE(v_auto, false) = false THEN
    IF v_today <= v_last.end_date + v_last.grace_days THEN
      -- Still in grace, residuals consumable until valid_until.
      RETURN QUERY SELECT
        NULL::uuid,
        true,
        v_last.id,
        v_residual,
        v_last.end_date + v_last.grace_days;
    ELSE
      RETURN QUERY SELECT NULL::uuid, false, v_last.id, v_residual, NULL::date;
    END IF;
    RETURN;
  END IF;

  -- ---- Case 3: auto-renew enabled — ensure successor exists --------------
  SELECT id INTO v_next_id
  FROM public.training_blocks
  WHERE client_id = p_client_id
    AND sequence_order = v_last.sequence_order + 1
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_next_id IS NULL THEN
    v_duration  := COALESCE(v_last.duration_days, 28);
    v_grace     := COALESCE(v_last.grace_days, 7);
    v_new_start := v_last.end_date + INTERVAL '1 day';
    v_new_end   := v_new_start + (v_duration - 1) * INTERVAL '1 day';

    INSERT INTO public.training_blocks (
      client_id, coach_id, start_date, end_date,
      status, sequence_order, duration_days, grace_days
    ) VALUES (
      p_client_id, v_last.coach_id, v_new_start, v_new_end,
      'active', v_last.sequence_order + 1, v_duration, v_grace
    )
    RETURNING id INTO v_next_id;

    -- Copy template allocations from previous block. valid_until of the
    -- new allocations extends to new_end + grace so consumption during
    -- the successor's own grace period works the same way.
    INSERT INTO public.block_allocations (
      block_id, week_number, session_type, event_type_id,
      quantity_assigned, quantity_booked, valid_until
    )
    SELECT
      v_next_id, week_number, session_type, event_type_id,
      quantity_assigned, 0, v_new_end + v_grace * INTERVAL '1 day'
    FROM public.block_allocations
    WHERE block_id = v_last.id;
  END IF;

  -- Determine grace status w.r.t. the OLD block (residuals consumability).
  IF v_today <= v_last.end_date + v_last.grace_days THEN
    RETURN QUERY SELECT
      v_next_id,
      true,
      v_last.id,
      v_residual,
      v_last.end_date + v_last.grace_days;
  ELSE
    RETURN QUERY SELECT
      v_next_id,
      false,
      v_last.id,
      v_residual,
      NULL::date;
  END IF;
END;
$$;

-- Re-assert grants (CREATE OR REPLACE resets some metadata in older PG).
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.ensure_client_block_state(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.ensure_client_block_state(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON FUNCTION public.ensure_client_block_state(uuid) IS
  'Lazy reconciler for monthly training blocks. As of '
  '20260525120000_ensure_immediate_successor, the successor block is '
  'created immediately at today > end_date (not after the 7-day grace) '
  'so the UI never shows a gap. Old allocations remain bookable until '
  'valid_until = old_end + grace; FIFO ordering in '
  'validate_booking_block_allocation consumes them first.';
