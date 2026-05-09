ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'late_cancelled';
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'no_show';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS meeting_link text;