
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
    COALESCE(et.duration, 60) AS duration,
    COALESCE(et.buffer_minutes, 0) AS buffer_minutes
  FROM public.bookings b
  LEFT JOIN public.event_types et ON et.id = b.event_type_id
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

GRANT EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) TO authenticated;
