
CREATE OR REPLACE FUNCTION public._auto_renew_cron_run()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_processed int := 0;
  v_last      public.training_blocks%ROWTYPE;
  v_next_id   uuid;
  v_duration  int;
  v_grace     int;
  v_new_start date;
  v_new_end   date;
  v_today     date := (now() AT TIME ZONE 'Europe/Rome')::date;
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION '_auto_renew_cron_run is reserved for the cron scheduler (current_user=%)', current_user
      USING ERRCODE = '42501';
  END IF;

  FOR v_client_id IN
    SELECT p.id FROM public.profiles p
    WHERE p.path_type = 'recurring'
      AND COALESCE(p.auto_renew_blocks, false) = true
  LOOP
    BEGIN
      PERFORM 1 FROM public.repair_blocks_alignment(v_client_id);

      SELECT tb.* INTO v_last
      FROM public.training_blocks tb
      WHERE tb.client_id = v_client_id AND tb.deleted_at IS NULL
      ORDER BY tb.sequence_order DESC, tb.start_date DESC
      LIMIT 1;

      CONTINUE WHEN v_last.id IS NULL;
      CONTINUE WHEN v_today <= v_last.end_date;

      IF v_last.status = 'active' THEN
        UPDATE public.training_blocks SET status = 'completed' WHERE id = v_last.id;
      END IF;

      SELECT tb.id INTO v_next_id
      FROM public.training_blocks tb
      WHERE tb.client_id = v_client_id
        AND tb.sequence_order = v_last.sequence_order + 1
        AND tb.deleted_at IS NULL
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
          v_client_id, v_last.coach_id, v_new_start, v_new_end,
          'active', v_last.sequence_order + 1, v_duration, v_grace
        )
        RETURNING id INTO v_next_id;

        INSERT INTO public.block_allocations (
          block_id, week_number, session_type, event_type_id,
          quantity_assigned, quantity_booked, valid_until
        )
        SELECT
          v_next_id, ba.week_number, ba.session_type, ba.event_type_id,
          ba.quantity_assigned, 0, v_new_end + v_grace * INTERVAL '1 day'
        FROM public.block_allocations ba
        WHERE ba.block_id = v_last.id;
      END IF;

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '_auto_renew_cron_run: client % skipped: %', v_client_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_processed;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_client_block_state(p_client_id uuid)
 RETURNS TABLE(current_block_id uuid, in_grace_period boolean, previous_block_id uuid, residuals_from_previous integer, next_renewal_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
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
  END IF;

  PERFORM 1 FROM public.repair_blocks_alignment(p_client_id);

  SELECT tb.* INTO v_last
  FROM public.training_blocks tb
  WHERE tb.client_id = p_client_id AND tb.deleted_at IS NULL
  ORDER BY tb.sequence_order DESC, tb.start_date DESC
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

  SELECT COALESCE(SUM(ba.quantity_assigned - ba.quantity_booked), 0)
  INTO v_residual
  FROM public.block_allocations ba
  WHERE ba.block_id = v_last.id;

  SELECT p.auto_renew_blocks INTO v_auto FROM public.profiles p WHERE p.id = p_client_id;

  IF COALESCE(v_auto, false) = false THEN
    IF v_today <= v_last.end_date + v_last.grace_days THEN
      RETURN QUERY SELECT NULL::uuid, true, v_last.id, v_residual,
        v_last.end_date + v_last.grace_days;
    ELSE
      RETURN QUERY SELECT NULL::uuid, false, v_last.id, v_residual, NULL::date;
    END IF;
    RETURN;
  END IF;

  SELECT tb.id INTO v_next_id
  FROM public.training_blocks tb
  WHERE tb.client_id = p_client_id
    AND tb.sequence_order = v_last.sequence_order + 1
    AND tb.deleted_at IS NULL
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
      v_next_id, ba.week_number, ba.session_type, ba.event_type_id,
      ba.quantity_assigned, 0, v_new_end + v_grace * INTERVAL '1 day'
    FROM public.block_allocations ba
    WHERE ba.block_id = v_last.id;
  END IF;

  IF v_today <= v_last.end_date + v_last.grace_days THEN
    RETURN QUERY SELECT v_next_id, true, v_last.id, v_residual,
      v_last.end_date + v_last.grace_days;
  ELSE
    RETURN QUERY SELECT v_next_id, false, v_last.id, v_residual, NULL::date;
  END IF;
END;
$function$;
