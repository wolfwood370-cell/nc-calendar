ALTER TABLE public.integration_settings
  ADD COLUMN IF NOT EXISTS gcal_access_token text,
  ADD COLUMN IF NOT EXISTS gcal_refresh_token text,
  ADD COLUMN IF NOT EXISTS gcal_token_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS gcal_account_email text;