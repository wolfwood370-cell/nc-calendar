ALTER TABLE public.event_types ADD COLUMN IF NOT EXISTS client_bookable boolean NOT NULL DEFAULT true;
ALTER TABLE public.event_types ADD COLUMN IF NOT EXISTS unavailable_message text;