-- ==========================================================================
-- Security hardening pass #2 — Lovable linter findings after notifications
-- + auto-renew migrations applied
-- ==========================================================================
-- Closes 4 issues flagged by the database linter:
--   1. Clients could DELETE bookings raw, bypassing cancel_booking RPC
--      (no credit refund, no late-cancel accounting).
--   2. Clients could UPDATE arbitrary columns on extra_credits (quantity,
--      expires_at, price_paid …) — every legitimate write is server-side.
--   3. View client_block_status was created with the default SECURITY
--      DEFINER semantics; switch to security_invoker so it honors the
--      caller's RLS on the underlying tables.
--   4. Realtime channels for `notifications` and `gcal_sync_signals` had
--      no policies on realtime.messages, so any authenticated user could
--      subscribe to another user's topic. Add per-channel SELECT scoped
--      to auth.uid().
--
-- Audit verified before dropping each policy:
--   - DELETE on bookings from frontend: 0 call sites
--     (grep "\.from\(['\"]bookings['\"]\).*\.delete\(\)" → no matches).
--     Soft-delete via cancel_booking RPC + UPDATE deleted_at handles
--     every cancel path.
--   - UPDATE on extra_credits from frontend: all 6 call sites live in
--     trainer.clients.$id.tsx and lib/queries.ts useCoachCancelBooking
--     — i.e. coach paths only, governed by separate "Coach manage
--     extra_credits" policy that is untouched here.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Drop client raw DELETE on bookings — cancel_booking RPC is authoritative
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Client delete own bookings" ON public.bookings;

-- --------------------------------------------------------------------------
-- 2. Drop client UPDATE on extra_credits — service-role only writes
-- --------------------------------------------------------------------------
DROP POLICY IF EXISTS "Client update own extra_credits"        ON public.extra_credits;
DROP POLICY IF EXISTS "Client update own extra_credits booked" ON public.extra_credits;

-- --------------------------------------------------------------------------
-- 3. client_block_status — flip to security_invoker
-- --------------------------------------------------------------------------
-- Views default to SECURITY DEFINER semantics in Postgres < 15 and the
-- Supabase linter (lint 0010) flags this as a policy-bypass risk.
-- security_invoker=on makes the view evaluate RLS against the caller's
-- role, which is what every consumer here actually wants — the coach
-- sees only their clients, the cliente sees only themselves (already
-- enforced by training_blocks + profiles RLS).
DROP VIEW IF EXISTS public.client_block_status;

CREATE VIEW public.client_block_status
WITH (security_invoker = on) AS
SELECT
  p.id              AS client_id,
  p.full_name       AS client_name,
  p.coach_id,
  p.auto_renew_blocks,
  tb.id             AS block_id,
  tb.sequence_order,
  tb.start_date,
  tb.end_date,
  (tb.end_date + tb.grace_days)                                              AS grace_until,
  tb.status,
  (CURRENT_DATE > tb.end_date AND CURRENT_DATE <= tb.end_date + tb.grace_days) AS in_grace,
  (CURRENT_DATE > tb.end_date + tb.grace_days)                               AS expired_beyond_grace,
  COALESCE(SUM(ba.quantity_assigned), 0)                                     AS total_assigned,
  COALESCE(SUM(ba.quantity_booked),   0)                                     AS total_booked,
  COALESCE(SUM(ba.quantity_assigned - ba.quantity_booked), 0)                AS residuals
FROM public.profiles p
JOIN public.training_blocks tb ON tb.client_id = p.id AND tb.deleted_at IS NULL
LEFT JOIN public.block_allocations ba ON ba.block_id = tb.id
GROUP BY p.id, p.full_name, p.coach_id, p.auto_renew_blocks, tb.id;

COMMENT ON VIEW public.client_block_status IS
  'Per-client per-block snapshot. security_invoker=on so the caller''s '
  'RLS on profiles/training_blocks/block_allocations apply — a coach '
  'sees only their clients; a cliente sees only themselves; admin sees '
  'everyone via has_role admin shortcut.';

-- --------------------------------------------------------------------------
-- 4. Realtime channel authorization — scope topics by auth.uid()
-- --------------------------------------------------------------------------
-- Without a policy on realtime.messages, RLS on the source tables only
-- gates the *payload* delivery; the channel subscription itself is
-- open, so any authenticated user can connect to another user's topic
-- name and at minimum see metadata / presence signals. We add an
-- explicit per-topic gate matching the two channel patterns the app
-- uses today:
--   - "notifications:<uid>"        (use-notifications.ts hook)
--   - "trainer-calendar-<uid>"     (trainer.calendar.tsx gcal subscription)
--
-- Future channels should either follow the same "<prefix>:<uid>"
-- pattern + extend this policy, or use a dedicated policy per topic
-- family.
DO $$
BEGIN
  -- realtime.messages comes with RLS ENABLED by default on Supabase,
  -- but most projects ship without a policy, leaving the table in
  -- "deny all" state (or the table itself unprivileged). Enabling
  -- explicitly + adding a scoped policy gives us correct broadcast
  -- behavior AND closes the linter "rls_enabled_no_policy" finding.
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  -- Local dev / branches without realtime extension installed; skip.
  NULL;
END $$;

DO $$
BEGIN
  EXECUTE $policy$
    DROP POLICY IF EXISTS "Authenticated subscribe own scoped channels" ON realtime.messages
  $policy$;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE $policy$
    CREATE POLICY "Authenticated subscribe own scoped channels"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        realtime.topic() = 'notifications:' || (SELECT auth.uid())::text
        OR realtime.topic() = 'trainer-calendar-' || (SELECT auth.uid())::text
      )
  $policy$;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL;
END $$;
