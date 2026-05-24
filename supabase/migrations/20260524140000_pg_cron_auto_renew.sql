-- ==========================================================================
-- Daily pg_cron job for auto-renewing recurring training blocks
-- ==========================================================================
-- Until today the auto-renew of monthly training blocks was LAZY: it ran
-- only when the client opened the booking page (use-current-block hook)
-- or the coach opened the dashboard (ensure_all_recurring_for_coach at
-- mount). If neither happened for days after a block expired, the
-- successor block wasn't created and the client couldn't book.
--
-- This migration adds a PROACTIVE daily job at 04:00 UTC (≈ 05:00 CET /
-- 06:00 CEST) that iterates every recurring client with
-- auto_renew_blocks=true and reconciles their block state (close
-- expired, create successor as needed).
--
-- ## Why a separate function (not the existing RPCs)
-- ensure_client_block_state and ensure_all_recurring_for_coach both
-- enforce auth.uid() checks for security. pg_cron runs as the postgres
-- role with NO authenticated session — auth.uid() returns NULL and the
-- check would refuse the call. We can't relax those checks without
-- weakening the public API. So we ship `_auto_renew_cron_run()` with the
-- same core renewal logic minus the auth gate, REVOKEd from anon and
-- authenticated so it cannot be invoked via PostgREST.
--
-- ## Idempotency
-- - `CREATE EXTENSION IF NOT EXISTS pg_cron` is no-op if already present.
-- - `CREATE OR REPLACE FUNCTION` for the helper.
-- - The schedule is dropped (best-effort) before being recreated so
--   re-running this migration doesn't duplicate the cron entry.
--
-- ## Safety / failure mode
-- - Per-client errors inside the loop are caught and logged via
--   RAISE WARNING; the batch continues. A single broken row won't break
--   the entire nightly renewal.
-- - repair_blocks_alignment is invoked first per client so the date
--   chain is always anchored to path_start_date before the expiry check.
-- - All inserts (training_blocks + block_allocations) mirror the body of
--   ensure_client_block_state v2, ensuring the FIFO consumption invariant
--   in validate_booking_block_allocation keeps holding.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- --------------------------------------------------------------------------
-- 1. Helper function — runs once per night, no auth context
-- --------------------------------------------------------------------------
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
  -- Defense-in-depth: this function MUST NOT be invoked from a user
  -- session. pg_cron runs as a privileged role (postgres / supabase_admin
  -- depending on the project setup), so reject anything else.
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
      -- Auto-repair alignment first (idempotent — no-op when aligned).
      PERFORM 1 FROM public.repair_blocks_alignment(v_client_id);

      -- Most recent non-deleted block.
      SELECT * INTO v_last
      FROM public.training_blocks
      WHERE client_id = v_client_id AND deleted_at IS NULL
      ORDER BY sequence_order DESC, start_date DESC
      LIMIT 1;

      -- No blocks at all for this client (legacy edge case): skip.
      CONTINUE WHEN v_last.id IS NULL;
      -- Still inside the current block window: nothing to renew yet.
      CONTINUE WHEN v_today <= v_last.end_date;

      -- Past end_date: close the expired block if still marked active.
      IF v_last.status = 'active' THEN
        UPDATE public.training_blocks
        SET status = 'completed'
        WHERE id = v_last.id;
      END IF;

      -- Successor already created (e.g. by lazy FE call earlier today)? Skip.
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

        -- Copy template allocations from the previous block. valid_until
        -- extends to new_end + grace so consumption during the successor's
        -- own grace works the same as before.
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
      -- Single client's failure (e.g. trigger conflict on a legacy row)
      -- must NOT abort the entire nightly batch. Log and continue.
      RAISE WARNING '_auto_renew_cron_run: client % skipped: %',
        v_client_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public._auto_renew_cron_run() FROM PUBLIC, anon, authenticated;
  -- pg_cron runs as postgres (or supabase_admin) — no explicit GRANT needed.
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON FUNCTION public._auto_renew_cron_run() IS
  'Daily auto-renew job invoked by pg_cron at 04:00 UTC. Iterates all '
  'recurring clients with auto_renew_blocks=true, closes expired blocks '
  'and creates successors. Mirrors the core body of '
  'ensure_client_block_state minus the auth check (cron has no auth.uid). '
  'REVOKEd from PUBLIC/anon/authenticated; current_user guard prevents '
  'invocation by any role except postgres/supabase_admin.';

-- --------------------------------------------------------------------------
-- 2. Schedule the daily job (idempotent: unschedule prior + reschedule)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('auto_renew_recurring_blocks_daily');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist yet (first-run) — ignore the lookup failure.
  NULL;
END $$;

SELECT cron.schedule(
  'auto_renew_recurring_blocks_daily',
  '0 4 * * *',  -- 04:00 UTC daily = 05:00 CET / 06:00 CEST
  $cron$ SELECT public._auto_renew_cron_run(); $cron$
);
