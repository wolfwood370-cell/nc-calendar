
-- Reconcile block_allocations.quantity_booked from real bookings to fix
-- "Esauriti" false-positives caused by historical drift (cancel/reschedule
-- paths that didn't always decrement the counter).
WITH actual AS (
  SELECT ba.id AS alloc_id,
         COALESCE(COUNT(b.id), 0)::int AS actual_booked
  FROM public.block_allocations ba
  LEFT JOIN public.training_blocks tb ON tb.id = ba.block_id
  LEFT JOIN public.bookings b
    ON b.block_id = ba.block_id
   AND b.client_id = tb.client_id
   AND b.status IN ('scheduled', 'completed')
   AND (
     (ba.event_type_id IS NOT NULL AND b.event_type_id = ba.event_type_id)
     OR (ba.event_type_id IS NULL AND b.session_type = ba.session_type AND b.event_type_id IS NULL)
   )
  GROUP BY ba.id
)
UPDATE public.block_allocations ba
SET quantity_booked = a.actual_booked
FROM actual a
WHERE ba.id = a.alloc_id
  AND ba.quantity_booked <> a.actual_booked;
