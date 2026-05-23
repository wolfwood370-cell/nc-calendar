-- ==========================================================================
-- ensure_all_recurring_for_coach — batch wrapper around per-client RPC
-- ==========================================================================
-- The trainer dashboard needs to "wake up" the auto-renew state for every
-- recurring client at mount so expired blocks get closed and successors
-- created without waiting for the client to open their own booking page.
-- A naive N+1 from the frontend (one rpc per client) costs 30+ round-trips
-- on a coach with 30 active clients. This RPC loops server-side and
-- collapses it to a single call.
--
-- Authorization: only the coach themselves or admin may run it for a coach.
-- The inner ensure_client_block_state then re-checks per-client ownership
-- (auth.uid() matches coach_id on each profile), so a coach iterating
-- their own clients is allowed but cannot accidentally target another
-- coach's clients by passing a different p_coach_id.
--
-- Returns the number of clients processed. The renewal side-effects
-- (block insert + status update) happen inside the per-client RPC and
-- are committed when this function returns.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.ensure_all_recurring_for_coach(p_coach_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_processed int := 0;
BEGIN
  -- Outer authz: caller must be the target coach or an admin.
  IF NOT (auth.uid() = p_coach_id OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Loop over clients with auto-renew enabled. The per-client RPC will
  -- internally re-check ownership (profile.coach_id = auth.uid()) so we
  -- don't trust a stale p_coach_id without re-validating each row.
  FOR v_client_id IN
    SELECT id
    FROM public.profiles
    WHERE coach_id = p_coach_id
      AND COALESCE(auto_renew_blocks, false) = true
  LOOP
    BEGIN
      PERFORM public.ensure_client_block_state(v_client_id);
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      -- A single client's failure (e.g. mid-update FK weirdness on a
      -- legacy row) must not abort the entire batch. Log and continue.
      RAISE WARNING 'ensure_all_recurring_for_coach: client % skipped: %',
        v_client_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.ensure_all_recurring_for_coach(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.ensure_all_recurring_for_coach(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON FUNCTION public.ensure_all_recurring_for_coach(uuid) IS
  'Batch wrapper around ensure_client_block_state for every recurring '
  'client of a coach. Used by the trainer dashboard at mount to close '
  'expired blocks and auto-create successors in a single round-trip.';
