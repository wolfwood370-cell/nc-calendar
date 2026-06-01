ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gcal_invite_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.gcal_invite_enabled IS
  'Client opt-in: when true, sync-calendar invites the client as Google Calendar attendee (sendUpdates=all → email invite + reminders).';

NOTIFY pgrst, 'reload schema';