-- ==========================================================================
-- Block auto-renew + use-it-or-lose-it grace period (7 days)
-- ==========================================================================
-- Adds:
--   1. `profiles.auto_renew_blocks` (default true) — coach-controlled toggle.
--      Distinct from the legacy `profiles.auto_renew` column, which is
--      dead-write today and reserved for a future Stripe subscription gate.
--   2. `training_blocks.duration_days` (default 28) + `grace_days`
--      (default 7) — per-block template so future tweaks per cliente are
--      possible without touching code.
--   3. RPC `ensure_client_block_state(uuid)` SECURITY DEFINER — lazy,
--      idempotent state reconciler. Called by the frontend on dashboard
--      mount; closes expired blocks and creates the next one when
--      `auto_renew_blocks=true`. Same RPC handles both runtime and
--      historical cleanup (single source of truth, no ad-hoc scripts).
--   4. Trigger `validate_booking_block_allocation` upgraded to FIFO
--      cross-block consumption: a booking made during the 7-day grace
--      consumes residuals from the previous block first (oldest
--      valid_until wins), preserving "use-it-or-lose-it" semantics.
--   5. Inspection VIEW `client_block_status` for the coach to spot
--      anomalies (residuals, grace period, beyond-grace blocks).
--
-- Retroactive UPDATE: extends valid_until by +7 days on allocations
-- still tied to their block's end_date, but only for blocks ending in
-- the last 30 days — so we don't touch ancient closed blocks.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Schema additions
-- --------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_renew_blocks boolean NOT NULL DEFAULT true;

ALTER TABLE public.training_blocks
  ADD COLUMN IF NOT EXISTS duration_days int NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS grace_days    int NOT NULL DEFAULT 7;

-- --------------------------------------------------------------------------
-- 2. Retroactive valid_until extension
-- --------------------------------------------------------------------------
-- Only touches allocations whose valid_until still equals the block's
-- end_date (i.e. the original default, never customized) AND only on
-- blocks ending recently. Coaches who manually set a custom valid_until
-- are not affected.
UPDATE public.block_allocations ba
SET valid_until = b.end_date + INTERVAL '7 days'
FROM public.training_blocks b
WHERE ba.block_id = b.id
  AND ba.valid_until = b.end_date
  AND b.deleted_at IS NULL
  AND b.end_date >= CURRENT_DATE - INTERVAL '30 days';

-- --------------------------------------------------------------------------
-- 3. ensure_client_block_state — lazy state reconciler
-- --------------------------------------------------------------------------
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
  v_today    date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_last     public.training_blocks%ROWTYPE;
  v_prev_id  uuid;
  v_residual int;
  v_auto     boolean;
  v_new_id   uuid;
  v_new_start date;
  v_new_end   date;
  v_duration  int;
  v_grace     int;
BEGIN
  -- Authorization: client themselves, their coach, or admin.
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

  -- Pull the most recent non-deleted block for this client.
  SELECT * INTO v_last
  FROM public.training_blocks
  WHERE client_id = p_client_id
    AND deleted_at IS NULL
  ORDER BY sequence_order DESC, start_date DESC
  LIMIT 1;

  -- Client has never had a block → nothing to do.
  IF v_last.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, NULL::uuid, 0, NULL::date;
    RETURN;
  END IF;

  -- Still within the current window (or its grace tail) → no transition.
  IF v_today <= v_last.end_date + v_last.grace_days THEN
    RETURN QUERY SELECT
      v_last.id,
      (v_today > v_last.end_date),                  -- in_grace_period
      NULL::uuid,                                   -- no separate "previous" — same one
      0,
      v_last.end_date + v_last.grace_days;          -- when current grace ends
    RETURN;
  END IF;

  -- Past the grace tail of the last block → close it out (if still active).
  IF v_last.status = 'active' THEN
    UPDATE public.training_blocks
    SET status = 'completed'
    WHERE id = v_last.id;
  END IF;

  -- Compute residuals on the just-closed block, for the response payload.
  SELECT v_last.id,
         COALESCE(SUM(quantity_assigned - quantity_booked), 0)
  INTO v_prev_id, v_residual
  FROM public.block_allocations
  WHERE block_id = v_last.id;

  -- Check the renewal flag.
  SELECT auto_renew_blocks INTO v_auto
  FROM public.profiles
  WHERE id = p_client_id;

  -- Auto-renew disabled → return nothing as current. The cliente sees
  -- the empty state until the coach manually creates a new block.
  IF COALESCE(v_auto, false) = false THEN
    RETURN QUERY SELECT NULL::uuid, false, v_prev_id, v_residual, NULL::date;
    RETURN;
  END IF;

  -- Build the new block using the previous one as template.
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
  RETURNING id INTO v_new_id;

  -- Copy allocations template (reset quantity_booked, extend valid_until
  -- through the new block's grace tail).
  INSERT INTO public.block_allocations (
    block_id, week_number, session_type, event_type_id,
    quantity_assigned, quantity_booked, valid_until
  )
  SELECT
    v_new_id, week_number, session_type, event_type_id,
    quantity_assigned, 0,
    v_new_end + v_grace * INTERVAL '1 day'
  FROM public.block_allocations
  WHERE block_id = v_last.id;

  RETURN QUERY SELECT v_new_id, false, v_prev_id, v_residual, (v_new_end + v_grace);
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.ensure_client_block_state(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.ensure_client_block_state(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON FUNCTION public.ensure_client_block_state(uuid) IS
  'Lazy state reconciler: closes expired blocks past their grace tail and '
  'auto-creates the next one when profiles.auto_renew_blocks=true. Called '
  'from the frontend on dashboard mount so the same logic handles both '
  'live runtime and historical cleanup. Returns the current block id, '
  'whether the client is in grace, and any unused residuals from the '
  'previous block.';

-- --------------------------------------------------------------------------
-- 4. validate_booking_block_allocation — FIFO across client's blocks
-- --------------------------------------------------------------------------
-- The previous version restricted the allocation search to NEW.block_id,
-- so a booking submitted with the "current" block's id during the grace
-- period of the PREVIOUS block could not consume residuals from that
-- previous block. We now search every non-deleted block of the same
-- client and pick the allocation with the oldest valid_until first
-- (FIFO), so residuals close to expiry burn before fresh ones.
-- If the picked allocation belongs to a different block than NEW.block_id,
-- we re-point NEW.block_id so the booking row reflects reality.
CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc_id    uuid;
  v_alloc_block uuid;
  v_block_start date;
  v_week_number int;
BEGIN
  -- Skip non-block bookings (handled by extra_credits trigger).
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Skip coach-imported / coach-self bookings.
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  SELECT start_date INTO v_block_start
  FROM public.training_blocks
  WHERE id = NEW.block_id;

  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.' USING ERRCODE = 'P0001';
  END IF;

  -- Week number (1..4) within the booking's nominal block — used as a
  -- preference, not a hard filter (allocations may be single-row-per-block).
  v_week_number := LEAST(
    4,
    GREATEST(
      1,
      FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)::int + 1
    )
  );

  -- FIFO across any of the client's non-deleted blocks. valid_until
  -- gating already filters out beyond-grace allocations.
  SELECT ba.id, ba.block_id
  INTO v_alloc_id, v_alloc_block
  FROM public.block_allocations ba
  JOIN public.training_blocks tb ON tb.id = ba.block_id
  WHERE tb.client_id = NEW.client_id
    AND tb.deleted_at IS NULL
    AND ba.quantity_assigned > ba.quantity_booked
    AND (ba.valid_until IS NULL OR ba.valid_until >= NEW.scheduled_at::date)
    AND (
      (NEW.event_type_id IS NOT NULL AND ba.event_type_id = NEW.event_type_id)
      OR ba.session_type = NEW.session_type
    )
  ORDER BY
    -- 1. Oldest valid_until first — FIFO consumption of residuals.
    ba.valid_until ASC NULLS LAST,
    -- 2. event_type exact match preferred.
    CASE
      WHEN NEW.event_type_id IS NOT NULL AND ba.event_type_id = NEW.event_type_id THEN 0
      ELSE 1
    END,
    -- 3. Original heuristics: exact week match, then proximity, then age.
    CASE WHEN ba.week_number = v_week_number THEN 0 ELSE 1 END,
    ABS(ba.week_number - v_week_number),
    ba.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa tipologia.' USING ERRCODE = 'P0001';
  END IF;

  -- Re-point block_id when FIFO landed on a different block. Keeps the
  -- booking row coherent with the allocation that was actually deducted.
  IF v_alloc_block <> NEW.block_id THEN
    NEW.block_id := v_alloc_block;
  END IF;

  UPDATE public.block_allocations
  SET quantity_booked = quantity_booked + 1
  WHERE id = v_alloc_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_booking_block_allocation() IS
  'Validates and atomically deducts a block_allocation for a booking. '
  'FIFO across the client''s non-deleted blocks — oldest valid_until '
  'wins so use-it-or-lose-it residuals burn before fresh credits during '
  'the 7-day grace period. Re-points NEW.block_id when the chosen '
  'allocation belongs to a different block than the caller suggested.';

-- --------------------------------------------------------------------------
-- 5. client_block_status — inspection view for the coach
-- --------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.client_block_status AS
SELECT
  p.id              AS client_id,
  p.full_name       AS client_name,
  p.coach_id,
  p.auto_renew_blocks,
  tb.id             AS block_id,
  tb.sequence_order,
  tb.start_date,
  tb.end_date,
  (tb.end_date + tb.grace_days)                                   AS grace_until,
  tb.status,
  (CURRENT_DATE > tb.end_date AND CURRENT_DATE <= tb.end_date + tb.grace_days) AS in_grace,
  (CURRENT_DATE > tb.end_date + tb.grace_days)                    AS expired_beyond_grace,
  COALESCE(SUM(ba.quantity_assigned), 0)                          AS total_assigned,
  COALESCE(SUM(ba.quantity_booked),   0)                          AS total_booked,
  COALESCE(SUM(ba.quantity_assigned - ba.quantity_booked), 0)     AS residuals
FROM public.profiles p
JOIN public.training_blocks tb ON tb.client_id = p.id AND tb.deleted_at IS NULL
LEFT JOIN public.block_allocations ba ON ba.block_id = tb.id
GROUP BY p.id, p.full_name, p.coach_id, p.auto_renew_blocks, tb.id;

COMMENT ON VIEW public.client_block_status IS
  'Per-client per-block snapshot with grace flags + residuals. '
  'Coach-facing diagnostic — query directly to spot stale blocks or '
  'clients with residuals about to expire.';
