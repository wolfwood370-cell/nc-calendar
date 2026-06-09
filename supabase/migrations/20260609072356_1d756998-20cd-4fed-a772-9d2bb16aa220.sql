UPDATE public.bookings
SET deleted_at = now(), status = 'cancelled'
WHERE id = '80f99109-cd9d-48ca-8a94-4d7ee2d4f0fc'
  AND deleted_at IS NULL;