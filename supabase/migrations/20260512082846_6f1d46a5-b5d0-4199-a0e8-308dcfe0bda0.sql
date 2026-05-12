
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pack_label text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ignored boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bookings_coach_ignored
  ON public.bookings (coach_id, ignored)
  WHERE deleted_at IS NULL AND client_id IS NULL;
