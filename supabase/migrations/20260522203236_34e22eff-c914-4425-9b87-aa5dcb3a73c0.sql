-- Idempotent security hardening (matches 20260522130000_security_hardening_realtime_grants.sql)

-- 1. Remove sensitive tables from Realtime publication
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.integration_settings;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.bookings;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE
    public.block_allocations, public.extra_credits, public.training_blocks,
    public.event_types, public.profiles, public.user_roles,
    public.client_invitations, public.push_subscriptions,
    public.trainer_availability, public.availability_exceptions,
    public.weekly_schedule;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.booster_packs;
EXCEPTION WHEN undefined_object OR undefined_table THEN NULL; END $$;

-- 2. Drop over-permissive client UPDATE policies + their enforcement triggers
DROP POLICY IF EXISTS "Client update own block_allocations booked" ON public.block_allocations;
DROP POLICY IF EXISTS "Client update own extra_credits booked" ON public.extra_credits;
DROP TRIGGER IF EXISTS trg_enforce_block_allocations_client_update ON public.block_allocations;
DROP TRIGGER IF EXISTS trg_enforce_extra_credits_client_update ON public.extra_credits;
DROP FUNCTION IF EXISTS public.enforce_block_allocations_client_update();
DROP FUNCTION IF EXISTS public.enforce_extra_credits_client_update();

-- 3. SECURITY DEFINER function grants: REVOKE blanket, GRANT explicit
DO $$ DECLARE v_fn text; v_fns text[] := ARRAY[
  'set_booking_duration_defaults()',
  'validate_booking_block_allocation()',
  'validate_booking_extra_credits()',
  'validate_client_booking_update()',
  'prevent_coach_id_change()',
  'handle_new_user()',
  'set_updated_at()'
];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_fn);
    EXCEPTION WHEN undefined_function THEN NULL; END;
  END LOOP;
END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.check_email_rate_limit(uuid, int) FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_coach_for(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_coach_for(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;
DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL; END $$;

-- 4. Move btree_gist out of public into extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$ BEGIN
  ALTER EXTENSION btree_gist SET SCHEMA extensions;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
