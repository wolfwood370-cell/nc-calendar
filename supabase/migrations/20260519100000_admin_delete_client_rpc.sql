-- ==========================================================================
-- Migration: Transactional admin_delete_client RPC
-- ==========================================================================
-- Closes audit finding H4 (FULL_APP_AUDIT.md). The previous
-- admin-delete-user Edge Function ran ~7 sequential supabase.from(...).delete()
-- calls outside any transaction. If any one of them failed (network,
-- timeout, RLS hiccup), earlier deletes had already committed and the
-- function returned 500 — leaving the database in a partially-deleted
-- state with no recovery path.
--
-- This RPC wraps the data-cascade in a single Postgres transaction.
-- auth.users deletion stays in the Edge Function (it can't participate
-- in the SQL transaction because it goes through Supabase Admin API) but
-- the order is now: RPC succeeds atomically → then admin.auth.admin
-- .deleteUser. If the admin-api call fails, the data is gone but the
-- auth row remains as a tombstone, which is recoverable manually.
--
-- The RPC relies on existing ON DELETE CASCADE foreign keys from
-- profiles to:
--   - bookings.client_id           (cascade)
--   - training_blocks.client_id    (cascade)
--   - push_subscriptions.profile_id (cascade)
--   - block_allocations.block_id   (cascade via training_blocks)
--   - extra_credits.client_id      (cascade, added in 20260518122000)
-- so deleting the profile row drops everything else automatically.
-- Only client_invitations (matched by email, no FK) and user_roles
-- (FK to auth.users, not profiles) need explicit handling.
--
-- The Edge Function (admin-delete-user) is responsible for verifying
-- the caller is a coach owning the target client or an admin. The RPC
-- itself is SECURITY DEFINER so the caller doesn't need direct delete
-- privileges on the target tables.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_client(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;

  -- Snapshot the email BEFORE the profile row is deleted, so we can
  -- match client_invitations afterwards (no FK from invitations).
  SELECT email INTO v_email FROM public.profiles WHERE id = p_client_id;

  -- Invitations are keyed by email (case-insensitive); no FK to cascade.
  IF v_email IS NOT NULL THEN
    DELETE FROM public.client_invitations WHERE LOWER(email) = LOWER(v_email);
  END IF;

  -- user_roles FK points at auth.users, not profiles. Profile deletion
  -- won't touch it; we handle it explicitly so callers don't have to.
  DELETE FROM public.user_roles WHERE user_id = p_client_id;

  -- Deleting the profile cascades to:
  --   bookings (client_id ON DELETE CASCADE)
  --   training_blocks (client_id ON DELETE CASCADE) → block_allocations
  --   push_subscriptions (profile_id ON DELETE CASCADE)
  --   extra_credits (client_id ON DELETE CASCADE, added in prior migration)
  DELETE FROM public.profiles WHERE id = p_client_id;
END;
$$;

-- Defense in depth: the RPC is invoked exclusively from the Edge
-- Function with the service-role client (which bypasses GRANT). We
-- revoke from authenticated so an accidental route exposing this RPC
-- from a user session can't trivially delete arbitrary clients.
REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_client(uuid) FROM authenticated;

COMMENT ON FUNCTION public.admin_delete_client(uuid) IS
  'Transactional cascade delete of a client and all related data. Callers '
  '(Edge Function admin-delete-user) MUST verify authorization before '
  'invoking. auth.users deletion is the responsibility of the caller — this '
  'RPC only handles public-schema data.';
