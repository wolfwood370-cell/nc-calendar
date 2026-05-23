-- ==========================================================================
-- notifications — in-app notification feed per recipient
-- ==========================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          text        NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_notifications_recipient_unread
  ON public.notifications (recipient_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Recipient reads own notifications" ON public.notifications;
CREATE POLICY "Recipient reads own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

COMMENT ON TABLE public.notifications IS
  'In-app notification feed. Writes via service-role Edge Functions or mark_notification_read RPC; SELECT restricted by RLS to recipient. Safe to publish on supabase_realtime — payload contains no tokens and is scoped per recipient.';

-- ==========================================================================
-- mark_notification_read(p_id uuid)
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
-- mark_all_notifications_read()
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