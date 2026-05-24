CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public._auto_renew_cron_run()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT id FROM public.profiles
    WHERE path_type = 'recurring'
      AND COALESCE(auto_renew_blocks, false) = true
  LOOP
    BEGIN
      PERFORM 1 FROM public.repair_blocks_alignment(v_client_id);

      SELECT * INTO v_last
      FROM public.training_blocks
      WHERE client_id = v_client_id AND deleted_at IS NULL
      ORDER BY sequence_order DESC, start_date DESC
      LIMIT 1;

      CONTINUE WHEN v_last.id IS NULL;
      CONTINUE WHEN v_today <= v_last.end_date;

      IF v_last.status = 'active' THEN
        UPDATE public.training_blocks SET status = 'completed' WHERE id = v_last.id;
      END IF;

      SELECT id INTO v_next_id
      FROM public.training_blocks
      WHERE client_id = v_client_id
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
          v_client_id, v_last.coach_id, v_new_start, v_new_end,
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

      v_processed := v_processed + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '_auto_renew_cron_run: client % skipped: %', v_client_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public._auto_renew_cron_run() FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON FUNCTION public._auto_renew_cron_run() IS
  'Daily auto-renew job invoked by pg_cron at 04:00 UTC. Iterates all recurring clients with auto_renew_blocks=true, closes expired blocks and creates successors. REVOKEd from PUBLIC/anon/authenticated.';

DO $$
BEGIN
  PERFORM cron.unschedule('auto_renew_recurring_blocks_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'auto_renew_recurring_blocks_daily',
  '0 4 * * *',
  $cron$ SELECT public._auto_renew_cron_run(); $cron$
);