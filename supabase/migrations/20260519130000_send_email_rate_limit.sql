-- ==========================================================================
-- M6 (FULL_APP_AUDIT.md): per-user sliding-window rate limit for send-email
-- ==========================================================================
-- Without a rate limit any authenticated coach or admin can POST to the
-- send-email Edge Function repeatedly and exhaust Resend quota — or use the
-- function as a free transactional email relay against arbitrary `to:`
-- addresses. A simple per-user/per-minute cap blocks both behaviors with
-- minimal infra: no Redis, no KV — just a table + RPC.
--
-- Design: every send writes a row keyed (user_id, sent_at). The check RPC
-- prunes rows older than one minute as it goes (housekeeping) so the table
-- never accumulates unbounded history. The function returns true if the
-- caller is under the limit AND has just been recorded; the Edge Function
-- branches off that.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.send_email_rate_limit (
  id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_email_rate_limit_user_time
  ON public.send_email_rate_limit (user_id, sent_at DESC);

ALTER TABLE public.send_email_rate_limit ENABLE ROW LEVEL SECURITY;
-- The table is internal — only the service role (Edge Function) ever
-- touches it. No policies means anon/authenticated reads/writes are denied.

CREATE OR REPLACE FUNCTION public.check_email_rate_limit(
  p_user_id uuid,
  p_limit   int DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Housekeeping: drop entries older than the window before counting.
  DELETE FROM public.send_email_rate_limit
  WHERE user_id = p_user_id
    AND sent_at < (now() - interval '1 minute');

  SELECT COUNT(*) INTO v_count
  FROM public.send_email_rate_limit
  WHERE user_id = p_user_id;

  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.send_email_rate_limit (user_id) VALUES (p_user_id);
  RETURN true;
END;
$$;

-- Locked down. Only invoked via the service-role admin client from the
-- send-email Edge Function.
REVOKE EXECUTE ON FUNCTION public.check_email_rate_limit(uuid, int) FROM PUBLIC, anon, authenticated;
