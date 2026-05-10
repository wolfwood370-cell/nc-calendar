ALTER TABLE public.integration_settings
  ADD COLUMN IF NOT EXISTS gcal_service_account_json text,
  ADD COLUMN IF NOT EXISTS gcal_calendar_id text;