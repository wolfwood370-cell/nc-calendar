ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS event_type_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_event_type_id ON public.bookings(event_type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_google_event_id ON public.bookings(google_event_id);