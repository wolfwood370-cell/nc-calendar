
CREATE OR REPLACE VIEW public.client_exhaustion_forecast
WITH (security_invoker = true) AS
WITH recent AS (
  SELECT client_id, COUNT(*)::numeric AS sessions_30d
  FROM public.bookings
  WHERE deleted_at IS NULL
    AND client_id IS NOT NULL
    AND status IN ('completed','scheduled','late_cancelled')
    AND scheduled_at >= now() - interval '30 days'
    AND scheduled_at <  now() + interval '7 days'
  GROUP BY client_id
),
block_remaining AS (
  SELECT b.client_id,
         COALESCE(SUM(GREATEST(0, a.quantity_assigned - a.quantity_booked)),0) AS remaining
  FROM public.training_blocks b
  JOIN public.block_allocations a ON a.block_id = b.id
  WHERE b.deleted_at IS NULL
  GROUP BY b.client_id
),
extra_remaining AS (
  SELECT client_id,
         COALESCE(SUM(GREATEST(0, quantity - quantity_booked)),0) AS remaining
  FROM public.extra_credits
  WHERE expires_at > now()
  GROUP BY client_id
)
SELECT
  p.id          AS client_id,
  p.coach_id    AS coach_id,
  COALESCE(r.sessions_30d, 0)::numeric                    AS sessions_last_30d,
  ROUND(COALESCE(r.sessions_30d, 0) * 7.0 / 30.0, 2)      AS weekly_avg,
  (COALESCE(br.remaining,0) + COALESCE(er.remaining,0))::int AS remaining_credits,
  CASE
    WHEN COALESCE(r.sessions_30d,0) > 0
     AND (COALESCE(br.remaining,0) + COALESCE(er.remaining,0)) > 0
    THEN CEIL(
      (COALESCE(br.remaining,0) + COALESCE(er.remaining,0))::numeric
      / (r.sessions_30d / 30.0)
    )::int
    ELSE NULL
  END AS days_until_exhaustion,
  CASE
    WHEN COALESCE(r.sessions_30d,0) > 0
     AND (COALESCE(br.remaining,0) + COALESCE(er.remaining,0)) > 0
    THEN (CURRENT_DATE + CEIL(
      (COALESCE(br.remaining,0) + COALESCE(er.remaining,0))::numeric
      / (r.sessions_30d / 30.0)
    )::int)
    ELSE NULL
  END AS predicted_exhaustion_date
FROM public.profiles p
LEFT JOIN recent          r  ON r.client_id  = p.id
LEFT JOIN block_remaining br ON br.client_id = p.id
LEFT JOIN extra_remaining er ON er.client_id = p.id
WHERE p.deleted_at IS NULL
  AND p.status = 'active';

GRANT SELECT ON public.client_exhaustion_forecast TO authenticated;
