-- 20260524130100_revoke_definer_exec.sql
-- Lock down SECURITY DEFINER functions: revoke broad EXECUTE,
-- re-grant only to the RPCs that the client actually calls.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      r.nspname, r.proname, r.args
    );
  END LOOP;
END $$;

-- Re-grant EXECUTE only on RPCs explicitly invoked by the client.
-- admin_delete_client is intentionally omitted: it must only be reachable
-- via the admin-delete-user Edge Function (service_role bypasses GRANTs).
GRANT EXECUTE ON FUNCTION public.cancel_booking(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_client_block_state(uuid)  TO authenticated;

-- Already-granted helpers stay reachable (REVOKE above stripped them,
-- restore here to keep current behaviour for client/coach reads).
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_for(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) TO authenticated;

-- Block all writes on realtime.messages — only SELECT subscription is allowed.
DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Deny INSERT to authenticated" ON realtime.messages FOR INSERT TO authenticated WITH CHECK (false)';
EXCEPTION WHEN duplicate_object OR insufficient_privilege OR undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Deny UPDATE to authenticated" ON realtime.messages FOR UPDATE TO authenticated USING (false) WITH CHECK (false)';
EXCEPTION WHEN duplicate_object OR insufficient_privilege OR undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE 'CREATE POLICY "Deny DELETE to authenticated" ON realtime.messages FOR DELETE TO authenticated USING (false)';
EXCEPTION WHEN duplicate_object OR insufficient_privilege OR undefined_table THEN NULL;
END $$;
