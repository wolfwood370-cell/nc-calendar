-- ==========================================================================
-- Personal Blocks: let coaches mark a slot as their own impegno personale
-- (e.g. "Dentista") rather than a client session.
-- ==========================================================================
-- Storage choice: a dedicated `is_personal` boolean discriminator. The
-- existing "isExternal" pattern overloads client_id = coach_id which is
-- hacky and conflicts with the desired UX (a personal block shouldn't
-- pretend to be a client). With an explicit flag:
--   - block_id stays NULL (no path/credit consumption)
--   - event_type_id stays NULL (no per-type rendering — generic gray)
--   - client_id stays NULL (no client lookup, no RLS confusion)
--   - is_personal = true marks the row for the UI
--
-- The two existing INSERT triggers already exit early when block_id IS NULL
-- (validate_booking_block_allocation) and when client_id IS NULL OR
-- client_id = coach_id (validate_booking_extra_credits), so personal
-- inserts pass through without consuming credits.
--
-- The no-overlap exclusion constraint (bookings_no_overlap_per_coach) and
-- the get_coach_busy RPC continue to treat personal blocks like any other
-- scheduled booking — coaches should not be double-booked over a personal
-- commitment.
-- ==========================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_personal boolean NOT NULL DEFAULT false;

-- Partial index: the predicate filters in the UI are "show personal" /
-- "exclude personal", so a small index on the true subset speeds the
-- common rendering path without bloating writes for the (vast) majority
-- of false rows.
CREATE INDEX IF NOT EXISTS idx_bookings_coach_personal
  ON public.bookings (coach_id, scheduled_at)
  WHERE is_personal = true;
