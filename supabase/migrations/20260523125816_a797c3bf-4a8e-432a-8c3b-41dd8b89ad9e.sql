-- ensure_all_recurring_for_coach — batch wrapper around per-client RPC
-- Loops over all clients with auto_renew_blocks=true for a given coach,
-- calling ensure_client_block_state for each. Closes expired blocks past
-- their grace + auto-creates successors in a single round-trip.

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
  -- Outer authz: caller must be the target coach or admin.
  IF NOT (auth.uid() = p_coach_id OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Loop over clients with auto-renew enabled. The per-client RPC
  -- internally re-checks ownership so we don't trust a stale p_coach_id.
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
      -- A single client's failure must not abort the entire batch.
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