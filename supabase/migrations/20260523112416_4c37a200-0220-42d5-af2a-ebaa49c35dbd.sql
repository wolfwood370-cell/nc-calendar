-- ==========================================================================
-- Block auto-renew + use-it-or-lose-it grace period (7 days)
-- ==========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_renew_blocks boolean NOT NULL DEFAULT true;

ALTER TABLE public.training_blocks
  ADD COLUMN IF NOT EXISTS duration_days int NOT NULL DEFAULT 28,
  ADD COLUMN IF NOT EXISTS grace_days    int NOT NULL DEFAULT 7;

UPDATE public.block_allocations ba
SET valid_until = b.end_date + INTERVAL '7 days'
FROM public.training_blocks b
WHERE ba.block_id = b.id
  AND ba.valid_until = b.end_date
  AND b.deleted_at IS NULL
  AND b.end_date >= CURRENT_DATE - INTERVAL '30 days';

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

  SELECT * INTO v_last
  FROM public.training_blocks
  WHERE client_id = p_client_id
    AND deleted_at IS NULL
  ORDER BY sequence_order DESC, start_date DESC
  LIMIT 1;

  IF v_last.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, NULL::uuid, 0, NULL::date;
    RETURN;
  END IF;

  IF v_today <= v_last.end_date + v_last.grace_days THEN
    RETURN QUERY SELECT
      v_last.id,
      (v_today > v_last.end_date),
      NULL::uuid,
      0,
      v_last.end_date + v_last.grace_days;
    RETURN;
  END IF;

  IF v_last.status = 'active' THEN
    UPDATE public.training_blocks
    SET status = 'completed'
    WHERE id = v_last.id;
  END IF;

  SELECT v_last.id,
         COALESCE(SUM(quantity_assigned - quantity_booked), 0)
  INTO v_prev_id, v_residual
  FROM public.block_allocations
  WHERE block_id = v_last.id;

  SELECT auto_renew_blocks INTO v_auto
  FROM public.profiles
  WHERE id = p_client_id;

  IF COALESCE(v_auto, false) = false THEN
    RETURN QUERY SELECT NULL::uuid, false, v_prev_id, v_residual, NULL::date;
    RETURN;
  END IF;

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
  'Lazy state reconciler: closes expired blocks past their grace tail and auto-creates the next one when profiles.auto_renew_blocks=true.';

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
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  SELECT start_date INTO v_block_start
  FROM public.training_blocks
  WHERE id = NEW.block_id;

  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.' USING ERRCODE = 'P0001';
  END IF;

  v_week_number := LEAST(
    4,
    GREATEST(
      1,
      FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)::int + 1
    )
  );

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
    ba.valid_until ASC NULLS LAST,
    CASE
      WHEN NEW.event_type_id IS NOT NULL AND ba.event_type_id = NEW.event_type_id THEN 0
      ELSE 1
    END,
    CASE WHEN ba.week_number = v_week_number THEN 0 ELSE 1 END,
    ABS(ba.week_number - v_week_number),
    ba.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa tipologia.' USING ERRCODE = 'P0001';
  END IF;

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
  'Validates and atomically deducts a block_allocation for a booking. FIFO across the client''s non-deleted blocks.';

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
  'Per-client per-block snapshot with grace flags + residuals.';