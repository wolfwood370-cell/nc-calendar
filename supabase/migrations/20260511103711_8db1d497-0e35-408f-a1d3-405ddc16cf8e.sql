
-- Allow bookings without an assigned client (e.g. imported from Google Calendar)
ALTER TABLE public.bookings ALTER COLUMN client_id DROP NOT NULL;

-- Add title and ignored_by_clients for smart matching
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS ignored_by_clients uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Add status to profiles for archive flow (active|archived)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
