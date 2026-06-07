-- Backfill event_type_id on bookings by matching Google Calendar title
-- prefix against the coach's event_types.name (longest match wins).
-- Disable only USER triggers (not system FK triggers) during bulk update.
ALTER TABLE public.bookings DISABLE TRIGGER USER;

WITH ranked AS (
  SELECT DISTINCT ON (b.id)
    b.id AS booking_id,
    et.id AS et_id
  FROM public.bookings b
  JOIN public.event_types et
    ON et.coach_id = b.coach_id
   AND b.title IS NOT NULL
   AND b.title ILIKE et.name || '%'
  WHERE b.deleted_at IS NULL
  ORDER BY b.id, length(et.name) DESC
)
UPDATE public.bookings b
SET event_type_id = r.et_id,
    updated_at = now()
FROM ranked r
WHERE b.id = r.booking_id
  AND (b.event_type_id IS DISTINCT FROM r.et_id);

ALTER TABLE public.bookings ENABLE TRIGGER USER;