-- ==========================================================================
-- Phase 3 / H3 follow-up: get_coach_busy must use the per-booking
-- duration_min / buffer_min snapshot, not the live event_types lookup.
-- ==========================================================================
-- The slot generator in src/routes/client.book.tsx computes blocked ranges
-- as [scheduled_at, scheduled_at + duration + buffer] from this RPC's output.
-- Reading those values from event_types means that when a coach edits the
-- duration of a session type, the busy ranges of every past and future
-- booking that referenced that type silently shift — over- or under-blocking
-- adjacent timeslots until the rows are touched.
--
-- Migration 20260518120000_booking_atomic_integrity.sql made duration_min /
-- buffer_min NOT NULL on bookings (backfilled from event_types at that time),
-- and the BEFORE INSERT trigger populates them on every new row. So this
-- swap is just sourcing the now-authoritative snapshot. Signature is
-- unchanged so the frontend keeps working.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.get_coach_busy(
  p_coach_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  scheduled_at timestamptz,
  event_type_id uuid,
  duration integer,
  buffer_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.scheduled_at,
    b.event_type_id,
    b.duration_min AS duration,
    b.buffer_min   AS buffer_minutes
  FROM public.bookings b
  WHERE b.coach_id = p_coach_id
    AND b.deleted_at IS NULL
    AND b.status IN ('scheduled', 'completed')
    AND b.scheduled_at >= p_from
    AND b.scheduled_at <= p_to
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid() = p_coach_id
      OR public.get_coach_for(auth.uid()) = p_coach_id
    );
$$;

-- EXECUTE grants and revokes from 20260511213502 persist across CREATE OR
-- REPLACE; no need to redo them here.
