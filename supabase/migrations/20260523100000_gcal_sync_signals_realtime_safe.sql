-- ==========================================================================
-- gcal_sync_signals — Realtime-safe watermark for the gcal-watch webhook
-- ==========================================================================
-- Architectural fix for the conflict between:
--   - 20260522130000_security_hardening_realtime_grants.sql (security)
--     which dropped `integration_settings` from the supabase_realtime
--     publication so OAuth refresh/access tokens + WhatsApp tokens +
--     service-account JSON would never broadcast to subscribers, AND
--   - 20260520203909_*.sql (Lovable) + src/routes/api/public/webhooks/
--     gcal-watch.ts which added `integration_settings.gcal_last_
--     notification_at` and a trainer.calendar.tsx postgres_changes
--     subscription on that table to trigger live import_history syncs.
--
-- Result of the conflict: the webhook wrote the watermark column, but
-- because integration_settings is (correctly) not in the realtime
-- publication, the frontend subscription never fired. The "live sync"
-- promise of gcal-watch was silently broken.
--
-- Fix: split the signaling out into its own table that contains ONLY
-- the watermark (no tokens, no PII beyond the coach UUID). This table
-- is safe to publish because every column it ever has is either the
-- coach scope itself or a non-sensitive timestamp.
--
-- RLS scopes SELECT to the coach themselves; the webhook writes via
-- service role (RLS bypassed). No coach can subscribe to another
-- coach's signal because the realtime channel filter
-- `coach_id=eq.<auth.uid()>` plus the SELECT policy combine to deny.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.gcal_sync_signals (
  coach_id              uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_notification_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gcal_sync_signals ENABLE ROW LEVEL SECURITY;

-- Coach can read only their own row. The frontend subscription uses
-- this policy implicitly when it filters by coach_id.
DROP POLICY IF EXISTS "Coach reads own gcal_sync_signals" ON public.gcal_sync_signals;
CREATE POLICY "Coach reads own gcal_sync_signals"
  ON public.gcal_sync_signals
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies for authenticated. Writes happen
-- through the gcal-watch webhook with the service-role client, which
-- bypasses RLS. Coaches never need to mutate this row themselves.

-- REPLICA IDENTITY FULL is required so Realtime can deliver UPDATE
-- payloads that include the changed columns (only `last_notification_at`
-- changes in practice, plus the PK for filtering).
ALTER TABLE public.gcal_sync_signals REPLICA IDENTITY FULL;

-- Add to the Realtime publication. The previous security hardening
-- migration dropped only the sensitive tables; this new table is
-- explicitly safe to broadcast so we add it.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gcal_sync_signals;
EXCEPTION WHEN duplicate_object THEN
  -- already a member (re-run safety)
  NULL;
WHEN undefined_object THEN
  -- no publication on this branch (local dev w/o realtime) — skip
  NULL;
END $$;

COMMENT ON TABLE public.gcal_sync_signals IS
  'Realtime-safe watermark bumped by the gcal-watch webhook. The trainer '
  'calendar route subscribes to UPDATE events on this table to know when '
  'to re-run an authenticated import_history sync. Contains no tokens or '
  'credentials so it''s safe in supabase_realtime; integration_settings '
  '(which does contain tokens) stays out of the publication.';
