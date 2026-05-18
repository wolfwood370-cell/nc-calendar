-- ==========================================================================
-- Migration: Atomic booking integrity — no-overlap exclusion + trigger-based
--            block_allocations deduction
-- ==========================================================================
-- Addresses audit findings H1 (non-atomic booking + allocation write) and
-- H2 (race condition in pre-INSERT conflict check).
--
-- 1. Adds denormalized duration_min / buffer_min on bookings so an exclusion
--    constraint has a deterministic per-row end time.
-- 2. Adds a generated end_at column = scheduled_at + (duration + buffer) min.
-- 3. Adds a BEFORE INSERT trigger that populates duration_min/buffer_min from
--    event_types when the client doesn't supply them.
-- 4. Adds a partial exclusion constraint preventing two bookings on the same
--    coach with overlapping [scheduled_at, end_at) ranges (status='scheduled',
--    not soft-deleted). This makes double-booking IMPOSSIBLE at the DB level
--    regardless of client-side race conditions.
-- 5. Adds a BEFORE INSERT trigger that atomically validates and deducts
--    block_allocations.quantity_booked when block_id IS NOT NULL — mirroring
--    the existing trg_booking_validate_extra_credits pattern.
--
-- If the data contains existing overlapping scheduled bookings, step 4 will
-- abort the migration. Run the diagnostic query in step 4's comment block to
-- locate them.
-- ==========================================================================

-- 1) Required extension for combining "=" and range-overlap operators in one GIST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2) Denormalized duration columns on bookings.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS duration_min int,
  ADD COLUMN IF NOT EXISTS buffer_min int;

-- 3) Backfill duration/buffer from event_types for existing bookings.
UPDATE public.bookings b
SET
  duration_min = COALESCE(b.duration_min, et.duration, 60),
  buffer_min   = COALESCE(b.buffer_min, et.buffer_minutes, 0)
FROM public.event_types et
WHERE b.event_type_id = et.id
  AND (b.duration_min IS NULL OR b.buffer_min IS NULL);

-- Any leftover rows without an event_type_id (legacy / coach-imported) get the defaults.
UPDATE public.bookings
SET
  duration_min = COALESCE(duration_min, 60),
  buffer_min   = COALESCE(buffer_min, 0)
WHERE duration_min IS NULL OR buffer_min IS NULL;

ALTER TABLE public.bookings
  ALTER COLUMN duration_min SET DEFAULT 60,
  ALTER COLUMN buffer_min   SET DEFAULT 0;

ALTER TABLE public.bookings
  ALTER COLUMN duration_min SET NOT NULL,
  ALTER COLUMN buffer_min   SET NOT NULL;

-- 4) Generated end_at column (STORED so it can participate in the GIST index).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'end_at'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE public.bookings
        ADD COLUMN end_at timestamptz
        GENERATED ALWAYS AS (scheduled_at + (duration_min + buffer_min) * interval '1 minute') STORED
    $sql$;
  END IF;
END $$;

-- 5) BEFORE INSERT trigger to populate duration_min/buffer_min from event_types.
--    Runs before the generated end_at column is materialized.
CREATE OR REPLACE FUNCTION public.set_booking_duration_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type_id IS NOT NULL
     AND (NEW.duration_min IS NULL OR NEW.buffer_min IS NULL) THEN
    SELECT
      COALESCE(NEW.duration_min, et.duration, 60),
      COALESCE(NEW.buffer_min, et.buffer_minutes, 0)
    INTO NEW.duration_min, NEW.buffer_min
    FROM public.event_types et
    WHERE et.id = NEW.event_type_id;
  END IF;

  NEW.duration_min := COALESCE(NEW.duration_min, 60);
  NEW.buffer_min   := COALESCE(NEW.buffer_min, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_booking_duration_defaults ON public.bookings;
-- Name starts with "a_" so it sorts before validators that may rely on the
-- duration values; current validators don't, but this is defensive.
CREATE TRIGGER a_trg_set_booking_duration_defaults
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_booking_duration_defaults();

-- 6) Atomic block_allocations validation + deduction trigger.
--    Mirrors trg_booking_validate_extra_credits but for the block_allocations
--    side. Replaces the previous two-step client-side INSERT + UPDATE pattern.
CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc_id    uuid;
  v_block_start date;
  v_week_number int;
BEGIN
  -- Only enforce for bookings tied to a training block; extra_credits trigger
  -- handles the block_id IS NULL case.
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip for coach-imported bookings (Google Calendar mirror inserts with the
  -- coach as their own client_id, or with NULL client_id).
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  SELECT start_date INTO v_block_start
  FROM public.training_blocks
  WHERE id = NEW.block_id;

  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Week number (1..4), clamped — matches the frontend findAllocationForWeek
  -- computation in src/routes/client.book.tsx.
  v_week_number := LEAST(
    4,
    GREATEST(
      1,
      FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)::int + 1
    )
  );

  -- Find a matching allocation row, preferring an exact event_type_id match
  -- and falling back to session_type. FOR UPDATE serializes concurrent inserts
  -- against the same allocation.
  SELECT id INTO v_alloc_id
  FROM public.block_allocations
  WHERE block_id = NEW.block_id
    AND week_number = v_week_number
    AND quantity_assigned > quantity_booked
    AND (valid_until IS NULL OR valid_until >= NEW.scheduled_at::date)
    AND (
      (NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id)
      OR session_type = NEW.session_type
    )
  ORDER BY
    CASE
      WHEN NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id THEN 0
      ELSE 1
    END,
    created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa settimana e tipologia.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.block_allocations
  SET quantity_booked = quantity_booked + 1
  WHERE id = v_alloc_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_validate_block_allocation ON public.bookings;
CREATE TRIGGER trg_booking_validate_block_allocation
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_block_allocation();

-- 7) Diagnostic: report any existing overlaps before adding the constraint.
--    The constraint creation will fail if any are present; this helps locate them.
--
--    To inspect manually:
--      SELECT b1.id, b2.id, b1.coach_id, b1.scheduled_at, b1.end_at, b2.scheduled_at, b2.end_at
--      FROM public.bookings b1
--      JOIN public.bookings b2
--        ON b1.coach_id = b2.coach_id
--        AND b1.id < b2.id
--        AND b1.status = 'scheduled' AND b2.status = 'scheduled'
--        AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
--        AND tstzrange(b1.scheduled_at, b1.end_at, '[)') && tstzrange(b2.scheduled_at, b2.end_at, '[)');
DO $$
DECLARE
  v_overlap_count int;
BEGIN
  SELECT COUNT(*) INTO v_overlap_count
  FROM public.bookings b1
  JOIN public.bookings b2
    ON b1.coach_id = b2.coach_id
   AND b1.id < b2.id
   AND b1.status = 'scheduled' AND b2.status = 'scheduled'
   AND b1.deleted_at IS NULL AND b2.deleted_at IS NULL
   AND tstzrange(b1.scheduled_at, b1.end_at, '[)') && tstzrange(b2.scheduled_at, b2.end_at, '[)');

  IF v_overlap_count > 0 THEN
    RAISE WARNING
      'Found % overlapping scheduled booking pair(s). The no-overlap exclusion constraint creation will fail until these are resolved.',
      v_overlap_count;
  END IF;
END $$;

-- 8) The exclusion constraint — partial, only enforced for live scheduled rows.
ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_no_overlap_per_coach;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap_per_coach
  EXCLUDE USING gist (
    coach_id WITH =,
    tstzrange(scheduled_at, end_at, '[)') WITH &&
  )
  WHERE (status = 'scheduled' AND deleted_at IS NULL);

COMMENT ON CONSTRAINT bookings_no_overlap_per_coach ON public.bookings IS
  'Prevents two scheduled, non-deleted bookings for the same coach from having overlapping time ranges. Violations raise SQLSTATE 23P01 (exclusion_violation).';
