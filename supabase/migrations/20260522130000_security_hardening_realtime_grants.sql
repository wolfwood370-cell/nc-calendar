-- ==========================================================================
-- Security hardening — closes the 7 findings from the Lovable security audit
-- ==========================================================================
-- F1, F4: Tables in the supabase_realtime publication leak via Realtime
--         Any authenticated user can subscribe to channel topics and read
--         row-change payloads. integration_settings exposes Google OAuth
--         refresh/access tokens, WhatsApp tokens, and service-account
--         JSON; bookings exposes every coach's schedule. Drop both from
--         the publication entirely — the app today doesn't use Realtime
--         subscriptions (verified via `grep "supabase.channel" src/`).
--         If/when Realtime is needed it can be re-introduced behind
--         realtime.messages RLS, see G2 in FULL_APP_AUDIT_2026-05-20.md.
--
-- F2, F3: Client UPDATE policies on block_allocations + extra_credits are
--         too permissive. The existing column-whitelist triggers
--         (trg_enforce_block_allocations_client_update,
--         trg_enforce_extra_credits_client_update) DID catch column
--         drift, but the policy by itself reads as "client can UPDATE
--         any column". More importantly, no frontend code does direct
--         client UPDATEs on these tables — every legitimate write path
--         goes through SECURITY DEFINER:
--           - INSERTs validate_booking_block_allocation /
--             validate_booking_extra_credits triggers consume credits
--           - cancel_booking RPC refunds on cancel
--           - mark_booking_special RPC refunds on personal conversion
--           - stripe-webhook (service role) creates new extra_credits
--           - sync-calendar mirror_check (service role) handles refunds
--             on Google-driven cancellation
--         So dropping the client UPDATE policies removes the attack
--         surface without breaking any flow. The enforcement triggers
--         become redundant; we drop them too for tidiness.
--
-- F5, F6: SECURITY DEFINER functions callable by PUBLIC / anon / auth
--         The default GRANT EXECUTE TO PUBLIC was created when each
--         function was defined; previous REVOKEs were scattered and
--         missed several. This migration revokes from all three roles
--         on every SECURITY DEFINER function in the public schema and
--         then GRANTs explicitly to authenticated only for the handful
--         meant to be invoked from the client (cancel_booking,
--         mark_booking_special, has_role, get_user_role, get_coach_for,
--         get_coach_busy). Trigger functions get no grants — they're
--         invoked by the trigger system, never directly.
--
-- F7: btree_gist installed in public schema (linter: extension_in_public)
--     Move to the Supabase-standard `extensions` schema. The
--     bookings_no_overlap_per_coach exclusion constraint (audit phase
--     1) uses btree_gist operators, which resolve via search_path —
--     adding `extensions` to the relevant search_paths keeps the
--     constraint working post-move.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Remove sensitive tables from the Realtime publication.
-- --------------------------------------------------------------------------
-- DROP TABLE IF EXISTS … is not a thing for publications; we have to
-- handle the "not currently a member" case ourselves. Wrap in DO + EXCEPTION
-- so the migration is idempotent.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.integration_settings;
EXCEPTION WHEN undefined_object OR undefined_table THEN
  -- Either the publication doesn't exist (local dev without realtime)
  -- or the table was never in it. Either way: nothing to drop.
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.bookings;
EXCEPTION WHEN undefined_object OR undefined_table THEN
  NULL;
END $$;

-- Defense-in-depth: drop every other publicly sensitive table from the
-- publication too. No frontend code subscribes to Realtime today
-- (verified). When a real Realtime use case lands it should be re-
-- added explicitly with the appropriate realtime.messages RLS.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime
    DROP TABLE
      public.block_allocations,
      public.extra_credits,
      public.training_blocks,
      public.event_types,
      public.profiles,
      public.user_roles,
      public.client_invitations,
      public.push_subscriptions,
      public.trainer_availability,
      public.availability_exceptions,
      public.weekly_schedule,
      public.booster_packs;
EXCEPTION WHEN undefined_object OR undefined_table THEN
  NULL;
END $$;

-- --------------------------------------------------------------------------
-- 2. Lock down block_allocations + extra_credits client UPDATE surface.
-- --------------------------------------------------------------------------
-- All legitimate writes go through SECURITY DEFINER paths. The previous
-- policy + trigger combo provided defense in depth but Lovable's linter
-- can't see through the trigger and flags the policy. Drop both.
DROP POLICY IF EXISTS "Client update own block_allocations booked" ON public.block_allocations;
DROP POLICY IF EXISTS "Client update own extra_credits booked" ON public.extra_credits;

-- Triggers were the column-whitelist enforcement layer behind the now-
-- gone policies. With direct UPDATEs blocked at the policy layer, the
-- triggers can never fire from a client path — they're dead code.
-- Coach + admin paths bypass the trigger explicitly so dropping them
-- doesn't open any new write path.
DROP TRIGGER IF EXISTS trg_enforce_block_allocations_client_update ON public.block_allocations;
DROP TRIGGER IF EXISTS trg_enforce_extra_credits_client_update ON public.extra_credits;
DROP FUNCTION IF EXISTS public.enforce_block_allocations_client_update();
DROP FUNCTION IF EXISTS public.enforce_extra_credits_client_update();

-- --------------------------------------------------------------------------
-- 3. SECURITY DEFINER function grants — REVOKE blanket, GRANT explicit.
-- --------------------------------------------------------------------------
-- Trigger functions: invoked by the trigger system, never callable from
-- the client. REVOKE from everyone.
DO $$
DECLARE
  v_fn text;
  v_fns text[] := ARRAY[
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_fn);
  END LOOP;
EXCEPTION WHEN undefined_function THEN
  -- one or more functions don't exist in this branch — ignore
  NULL;
END $$;

-- Internal SECURITY DEFINER helpers used only by the service role:
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.check_email_rate_limit(uuid, int) FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Client-facing RPCs: REVOKE then GRANT explicitly to authenticated only.
-- The explicit GRANT is what satisfies the linter's "intentional access"
-- check — without it, the default schema-level GRANT TO public still
-- leaks the function as anonymously callable.
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.mark_booking_special(uuid, text) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Pre-existing helpers — re-assert REVOKE then GRANT so the state is
-- the same regardless of which earlier migration shaped them. (Some
-- migrations from 2026-05-09 left these in inconsistent states.)
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_coach_for(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_coach_for(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 4. Move btree_gist out of the public schema.
-- --------------------------------------------------------------------------
-- The audit phase 1 migration created the extension without specifying a
-- schema, so it landed in public (the linter flags as extension_in_public).
-- The bookings_no_overlap_per_coach exclusion constraint uses btree_gist
-- operators (=, &&) which resolve via search_path. Supabase's standard
-- `extensions` schema is on the default search_path, so moving it there
-- is transparent to the constraint.
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  ALTER EXTENSION btree_gist SET SCHEMA extensions;
EXCEPTION WHEN undefined_object THEN
  -- extension not installed in this branch
  NULL;
END $$;
