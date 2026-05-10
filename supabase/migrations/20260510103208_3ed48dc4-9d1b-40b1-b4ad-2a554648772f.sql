ALTER TABLE public.event_types
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'physical' CHECK (location_type IN ('physical','online')),
  ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 240);