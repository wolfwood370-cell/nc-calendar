-- 1. Drop client raw DELETE on bookings (cancel_booking RPC handles refunds)
DROP POLICY IF EXISTS "Client delete own bookings" ON public.bookings;

-- 2. Drop client UPDATE on extra_credits (service-role only writes)
DROP POLICY IF EXISTS "Client update own extra_credits"        ON public.extra_credits;
DROP POLICY IF EXISTS "Client update own extra_credits booked" ON public.extra_credits;

-- 3. client_block_status view → security_invoker
DROP VIEW IF EXISTS public.client_block_status;
CREATE VIEW public.client_block_status
WITH (security_invoker = on) AS
SELECT
  p.id              AS client_id,
  p.full_name       AS client_name,
  p.coach_id,
  p.auto_renew_blocks,
  tb.id             AS block_id,
  tb.sequence_order,
  tb.start_date,
  tb.end_date,
  (tb.end_date + tb.grace_days)                                              AS grace_until,
  tb.status,
  (CURRENT_DATE > tb.end_date AND CURRENT_DATE <= tb.end_date + tb.grace_days) AS in_grace,
  (CURRENT_DATE > tb.end_date + tb.grace_days)                               AS expired_beyond_grace,
  COALESCE(SUM(ba.quantity_assigned), 0)                                     AS total_assigned,
  COALESCE(SUM(ba.quantity_booked),   0)                                     AS total_booked,
  COALESCE(SUM(ba.quantity_assigned - ba.quantity_booked), 0)                AS residuals
FROM public.profiles p
JOIN public.training_blocks tb ON tb.client_id = p.id AND tb.deleted_at IS NULL
LEFT JOIN public.block_allocations ba ON ba.block_id = tb.id
GROUP BY p.id, p.full_name, p.coach_id, p.auto_renew_blocks, tb.id;

-- 4. Realtime channel authorization (scope topics by auth.uid())
DO $$
BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE $p$DROP POLICY IF EXISTS "Authenticated subscribe own scoped channels" ON realtime.messages$p$;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  EXECUTE $p$
    CREATE POLICY "Authenticated subscribe own scoped channels"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        realtime.topic() = 'notifications:' || (SELECT auth.uid())::text
        OR realtime.topic() = 'trainer-calendar-' || (SELECT auth.uid())::text
      )
  $p$;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL;
END $$;