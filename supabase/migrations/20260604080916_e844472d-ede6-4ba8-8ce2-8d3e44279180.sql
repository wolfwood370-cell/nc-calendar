-- Wave 6 P5: cap lunghezza page_url e user_agent per evitare row gonfie
-- inserite via bug_reports.
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_page_url_len CHECK (page_url IS NULL OR length(page_url) <= 2048),
  ADD CONSTRAINT bug_reports_user_agent_len CHECK (user_agent IS NULL OR length(user_agent) <= 1024),
  ADD CONSTRAINT bug_reports_description_len CHECK (length(description) <= 10000);

-- Wave 6 P8: la RPC accettava qualunque p_user_id da un caller autenticato.
-- Ora autorizziamo solo:
--   - service_role / postgres / supabase_admin (chiamate da edge function admin)
--   - oppure auth.uid() = p_user_id (caller controlla solo il proprio rate)
CREATE OR REPLACE FUNCTION public.check_email_rate_limit(p_user_id uuid, p_limit integer DEFAULT 20)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  IF current_user NOT IN ('postgres','supabase_admin','service_role')
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.send_email_rate_limit WHERE user_id = p_user_id AND sent_at < (now() - interval '1 minute');
  SELECT COUNT(*) INTO v_count FROM public.send_email_rate_limit WHERE user_id = p_user_id;
  IF v_count >= p_limit THEN RETURN false; END IF;
  INSERT INTO public.send_email_rate_limit (user_id) VALUES (p_user_id);
  RETURN true;
END;
$function$;