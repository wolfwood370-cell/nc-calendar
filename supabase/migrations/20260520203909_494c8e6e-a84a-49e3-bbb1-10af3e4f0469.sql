
ALTER TABLE public.integration_settings
  ADD COLUMN IF NOT EXISTS gcal_channel_id text,
  ADD COLUMN IF NOT EXISTS gcal_resource_id text,
  ADD COLUMN IF NOT EXISTS gcal_channel_token text,
  ADD COLUMN IF NOT EXISTS gcal_channel_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS gcal_last_notification_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_integration_settings_gcal_channel_id
  ON public.integration_settings (gcal_channel_id)
  WHERE gcal_channel_id IS NOT NULL;

-- Enable realtime so the trainer UI can react to webhook-driven changes
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.integration_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.integration_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
