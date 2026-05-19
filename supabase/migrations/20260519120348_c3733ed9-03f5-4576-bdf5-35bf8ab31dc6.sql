ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_coach_personal
  ON public.bookings (coach_id, scheduled_at)
  WHERE is_personal = true;