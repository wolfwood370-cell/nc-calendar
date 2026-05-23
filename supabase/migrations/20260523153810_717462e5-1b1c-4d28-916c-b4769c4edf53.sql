-- ==========================================================================
-- Path-start-anchored training blocks — single source of truth = path_start_date
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.audit_misaligned_blocks(p_coach_id uuid)
RETURNS TABLE (
  client_id          uuid,
  client_name        text,
  path_start_date    date,
  expected_block1_start date,
  actual_block1_start   date,
  drift_days         int,
  total_blocks       int,
  contiguous         boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (auth.uid() = p_coach_id OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH blocks_per_client AS (
    SELECT
      tb.client_id,
      MIN(tb.start_date) FILTER (WHERE tb.sequence_order = 1) AS first_block_start,
      COUNT(*) AS total,
      bool_and(
        tb.start_date = LAG(tb.end_date) OVER (PARTITION BY tb.client_id ORDER BY tb.sequence_order) + 1
        OR tb.sequence_order = 1
      ) AS chain_contiguous
    FROM public.training_blocks tb
    WHERE tb.deleted_at IS NULL
    GROUP BY tb.client_id
  )
  SELECT
    p.id,
    p.full_name,
    p.path_start_date,
    p.path_start_date AS expected_block1_start,
    bpc.first_block_start,
    (bpc.first_block_start - p.path_start_date)::int AS drift_days,
    bpc.total::int,
    bpc.chain_contiguous
  FROM public.profiles p
  JOIN blocks_per_client bpc ON bpc.client_id = p.id
  WHERE p.coach_id = p_coach_id
    AND p.path_type = 'recurring'
    AND p.path_start_date IS NOT NULL
    AND (
      bpc.first_block_start <> p.path_start_date
      OR bpc.chain_contiguous IS DISTINCT FROM true
    )
  ORDER BY ABS(bpc.first_block_start - p.path_start_date) DESC;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.audit_misaligned_blocks(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.audit_misaligned_blocks(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

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

      UPDATE public.block_allocations
      SET valid_until = v_new_end + v_grace * INTERVAL '1 day'
      WHERE block_id = v_blk.id;

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

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.repair_blocks_alignment(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.repair_blocks_alignment(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

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

  PERFORM 1 FROM public.repair_blocks_alignment(p_client_id);

  SELECT * INTO v_last
  FROM public.training_blocks
  WHERE client_id = p_client_id AND deleted_at IS NULL
  ORDER BY sequence_order DESC, start_date DESC
  LIMIT 1;

  IF v_last.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, NULL::uuid, 0, NULL::date;
    RETURN;
  END IF;

  IF v_today <= v_last.end_date THEN
    RETURN QUERY SELECT
      v_last.id, false, NULL::uuid, 0,
      v_last.end_date + v_last.grace_days;
    RETURN;
  END IF;

  IF v_last.status = 'active' THEN
    UPDATE public.training_blocks SET status = 'completed' WHERE id = v_last.id;
  END IF;

  SELECT COALESCE(SUM(quantity_assigned - quantity_booked), 0)
  INTO v_residual
  FROM public.block_allocations
  WHERE block_id = v_last.id;

  SELECT auto_renew_blocks INTO v_auto FROM public.profiles WHERE id = p_client_id;

  IF COALESCE(v_auto, false) = false THEN
    IF v_today <= v_last.end_date + v_last.grace_days THEN
      RETURN QUERY SELECT NULL::uuid, true, v_last.id, v_residual,
        v_last.end_date + v_last.grace_days;
    ELSE
      RETURN QUERY SELECT NULL::uuid, false, v_last.id, v_residual, NULL::date;
    END IF;
    RETURN;
  END IF;

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

  IF v_today <= v_last.end_date + v_last.grace_days THEN
    RETURN QUERY SELECT v_next_id, true, v_last.id, v_residual,
      v_last.end_date + v_last.grace_days;
  ELSE
    RETURN QUERY SELECT v_next_id, false, v_last.id, v_residual, NULL::date;
  END IF;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.ensure_client_block_state(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.ensure_client_block_state(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;