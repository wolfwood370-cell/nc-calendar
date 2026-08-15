CREATE OR REPLACE FUNCTION public.auto_complete_past_bookings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.bookings
     SET status = 'completed'::booking_status,
         updated_at = now()
   WHERE status = 'scheduled'::booking_status
     AND deleted_at IS NULL
     AND client_id IS NOT NULL
     AND is_personal = false
     AND end_at < now() - interval '15 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'auto_complete_past_bookings',
  '*/15 * * * *',
  $$SELECT public.auto_complete_past_bookings();$$
);