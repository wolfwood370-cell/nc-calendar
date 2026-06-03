-- C2: remove auto-admin email shortcut in handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assigned_role public.app_role;
  inv RECORD;
  v_coach_id uuid := NULL;
  v_full_name text;
  v_phone text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  SELECT * INTO inv
  FROM public.client_invitations
  WHERE lower(email) = lower(NEW.email) AND status = 'pending'
  LIMIT 1;

  IF inv.id IS NOT NULL THEN
    assigned_role := 'client';
    v_coach_id := inv.coach_id;
    IF v_full_name = '' AND inv.full_name IS NOT NULL THEN
      v_full_name := inv.full_name;
    END IF;
    v_phone := inv.phone;

    UPDATE public.client_invitations
      SET status = 'accepted', accepted_at = now()
      WHERE id = inv.id;
  ELSE
    RAISE EXCEPTION 'Email non invitata da un Coach. Contatta il tuo coach per ricevere un invito.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, coach_id, phone)
  VALUES (NEW.id, NEW.email, v_full_name, v_coach_id, v_phone);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$function$;

-- C3: restrict column-level SELECT on integration_settings so sensitive tokens
-- (wa_access_token, wa_phone_id) are no longer visible to coaches via PostgREST.
-- Coaches keep INSERT/UPDATE/DELETE on their own row through existing RLS.
REVOKE SELECT ON public.integration_settings FROM authenticated;
GRANT SELECT (
  id,
  coach_id,
  wa_enabled,
  calendar_optimization_enabled,
  stripe_account_id,
  created_at,
  updated_at
) ON public.integration_settings TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.integration_settings TO authenticated;
GRANT ALL ON public.integration_settings TO service_role;