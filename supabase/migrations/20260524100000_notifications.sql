-- ==========================================================================
-- notifications — in-app notification feed per recipient
-- ==========================================================================
-- Storage for in-app notifications surfaced by the trainer notifications
-- bell (and any future recipient-facing inbox). Writes happen exclusively
-- via Edge Functions running with the service role (e.g. booking-
-- notifications inserts a row when a client books or reschedules); the
-- authenticated user can only SELECT their own rows and toggle read_at
-- via the mark_notification_read / mark_all_notifications_read RPCs.
--
-- Realtime-safe: the table is added to supabase_realtime so the bell
-- can subscribe and live-update. RLS gates each subscriber to their own
-- recipient_id, and the payload jsonb only carries data the recipient
-- already has access to via their own bookings (no tokens, no PII
-- beyond a sender display name).
--
-- Schema rationale: generic (recipient_id, type, payload jsonb) rather
-- than booking-specific so future event types (cancel, coach
-- announcements, …) can reuse the same table without schema churn.
-- Type discriminator + typed payloads documented in
-- src/hooks/use-notifications.ts.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          text        NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- List view: "latest 30 for me, newest first".
CREATE INDEX IF NOT EXISTS ix_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);

-- Badge: "count unread for me". Partial index is tiny and lets the
-- bell COUNT(*) without scanning historical rows.
CREATE INDEX IF NOT EXISTS ix_notifications_recipient_unread
  ON public.notifications (recipient_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: recipient sees only their own. Realtime channels filtered by
-- recipient_id=eq.<auth.uid()> rely on this policy implicitly.
DROP POLICY IF EXISTS "Recipient reads own notifications" ON public.notifications;
CREATE POLICY "Recipient reads own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies for authenticated. Writes happen
-- only through:
--   - service-role Edge Functions (RLS bypassed) for inserts
--   - mark_notification_read / mark_all_notifications_read RPCs
--     (SECURITY DEFINER) for read_at toggles
-- This avoids needing a column-whitelist trigger like the bookings one —
-- the auth path simply can't write directly.

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
WHEN undefined_object THEN
  NULL;
END $$;

COMMENT ON TABLE public.notifications IS
  'In-app notification feed. Writes via service-role Edge Functions or '
  'mark_notification_read RPC; SELECT restricted by RLS to recipient. '
  'Safe to publish on supabase_realtime — payload contains no tokens '
  'and is scoped per recipient.';

-- ==========================================================================
-- mark_notification_read(p_id uuid) — flip read_at for own row only
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
     SET read_at = now()
   WHERE id = p_id
     AND recipient_id = auth.uid()
     AND read_at IS NULL;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ==========================================================================
-- mark_all_notifications_read() — bulk flip for "mark all read" button
-- ==========================================================================
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
     SET read_at = now()
   WHERE recipient_id = auth.uid()
     AND read_at IS NULL;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
