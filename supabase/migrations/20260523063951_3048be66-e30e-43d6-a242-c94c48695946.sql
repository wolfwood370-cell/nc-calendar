CREATE TABLE IF NOT EXISTS public.gcal_sync_signals (
  coach_id              uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_notification_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gcal_sync_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach reads own gcal_sync_signals" ON public.gcal_sync_signals;
CREATE POLICY "Coach reads own gcal_sync_signals"
  ON public.gcal_sync_signals
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

ALTER TABLE public.gcal_sync_signals REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.gcal_sync_signals;
EXCEPTION WHEN duplicate_object THEN NULL;
WHEN undefined_object THEN NULL;
END $$;

COMMENT ON TABLE public.gcal_sync_signals IS
  'Realtime-safe watermark bumped by the gcal-watch webhook.';