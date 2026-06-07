ALTER TABLE public.bookings DISABLE TRIGGER USER;
UPDATE public.bookings SET event_type_id = 'c82bcab9-33cc-44dc-8f38-44ebf8869d3a' WHERE event_type_id IS NULL AND is_personal = false AND client_id IS NOT NULL AND client_id != coach_id AND session_type = 'PT Session' AND status != 'cancelled';
ALTER TABLE public.bookings ENABLE TRIGGER USER;