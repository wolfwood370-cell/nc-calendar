
-- Cleanup: rimuove tutte le colonne/tabelle dedicate all'OAuth Google Calendar
-- per-coach. La nuova integrazione passa dal connettore Lovable Google Calendar
-- gestito server-side dalle TanStack server functions; lo schema sotto era
-- legato all'edge function `sync-calendar` e ai webhook push (entrambi
-- eliminati).

-- 1. integration_settings: drop colonne GCal e webhook
ALTER TABLE public.integration_settings
  DROP COLUMN IF EXISTS gcal_enabled,
  DROP COLUMN IF EXISTS gcal_access_token,
  DROP COLUMN IF EXISTS gcal_refresh_token,
  DROP COLUMN IF EXISTS gcal_token_expires_at,
  DROP COLUMN IF EXISTS gcal_account_email,
  DROP COLUMN IF EXISTS gcal_calendar_id,
  DROP COLUMN IF EXISTS gcal_service_account_json,
  DROP COLUMN IF EXISTS gcal_webhook_url,
  DROP COLUMN IF EXISTS gcal_channel_id,
  DROP COLUMN IF EXISTS gcal_channel_token,
  DROP COLUMN IF EXISTS gcal_channel_expires_at,
  DROP COLUMN IF EXISTS gcal_resource_id,
  DROP COLUMN IF EXISTS gcal_last_notification_at;

-- 2. profiles: drop opt-in invito attendee (con il connettore Lovable il
-- cliente viene SEMPRE aggiunto come attendee se ha un'email)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS gcal_invite_enabled;

-- 3. Tabella di segnalazione watch push (più nessun webhook gcal-watch)
DROP TABLE IF EXISTS public.gcal_sync_signals;

-- 4. Reload schema cache PostgREST
NOTIFY pgrst, 'reload schema';
