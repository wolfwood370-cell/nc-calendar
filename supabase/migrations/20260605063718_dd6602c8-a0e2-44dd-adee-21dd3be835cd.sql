CREATE TABLE IF NOT EXISTS public.action_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_rate_limits_lookup_idx
  ON public.action_rate_limits (user_id, action, created_at DESC);

GRANT ALL ON public.action_rate_limits TO service_role;

ALTER TABLE public.action_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies: solo service_role (bypass RLS) la legge/scrive.

CREATE OR REPLACE FUNCTION public.check_action_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  IF p_user_id IS NULL OR p_action IS NULL THEN RETURN false; END IF;
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.action_rate_limits
    WHERE user_id = p_user_id
      AND action = p_action
      AND created_at < (now() - make_interval(secs => p_window_seconds));
  SELECT COUNT(*) INTO v_count
    FROM public.action_rate_limits
    WHERE user_id = p_user_id AND action = p_action;
  IF v_count >= p_limit THEN RETURN false; END IF;
  INSERT INTO public.action_rate_limits (user_id, action) VALUES (p_user_id, p_action);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_action_rate_limit(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_action_rate_limit(uuid, text, integer, integer) TO service_role;