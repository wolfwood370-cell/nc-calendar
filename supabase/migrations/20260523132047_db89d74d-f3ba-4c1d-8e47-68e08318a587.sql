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
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client_id AND coach_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_last FROM public.training_blocks
  WHERE client_id = p_client_id AND deleted_at IS NULL
  ORDER BY sequence_order DESC, start_date DESC LIMIT 1;

  IF v_last.id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, false, NULL::uuid, 0, NULL::date; RETURN;
  END IF;

  IF v_today <= v_last.end_date THEN
    RETURN QUERY SELECT v_last.id, false, NULL::uuid, 0,
      v_last.end_date + v_last.grace_days;
    RETURN;
  END IF;

  IF v_last.status = 'active' THEN
    UPDATE public.training_blocks SET status = 'completed' WHERE id = v_last.id;
  END IF;

  SELECT COALESCE(SUM(quantity_assigned - quantity_booked), 0)
  INTO v_residual
  FROM public.block_allocations WHERE block_id = v_last.id;

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

  SELECT id INTO v_next_id FROM public.training_blocks
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
    ) RETURNING id INTO v_next_id;

    INSERT INTO public.block_allocations (
      block_id, week_number, session_type, event_type_id,
      quantity_assigned, quantity_booked, valid_until
    )
    SELECT v_next_id, week_number, session_type, event_type_id,
      quantity_assigned, 0, v_new_end + v_grace * INTERVAL '1 day'
    FROM public.block_allocations WHERE block_id = v_last.id;
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