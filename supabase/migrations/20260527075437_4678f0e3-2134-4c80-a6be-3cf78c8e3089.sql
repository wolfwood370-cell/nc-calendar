
-- 1. Remove bug_reports and gcal_sync_signals from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.bug_reports;
ALTER PUBLICATION supabase_realtime DROP TABLE public.gcal_sync_signals;

-- 2. Tighten client_invitations invitee SELECT policy: only pending invitations
DROP POLICY IF EXISTS "Invited user reads own invitation" ON public.client_invitations;
CREATE POLICY "Invited user reads own pending invitation"
ON public.client_invitations
FOR SELECT
TO authenticated
USING (
  status = 'pending'
  AND lower(email) = lower(COALESCE(
    (SELECT profiles.email FROM public.profiles WHERE profiles.id = auth.uid()),
    ''::text
  ))
);

-- 3. Defensive trigger on user_roles to block non-admin role mutations
CREATE OR REPLACE FUNCTION public._user_roles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow privileged backend roles (used by handle_new_user trigger and service_role)
  IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- For authenticated callers, only admins may mutate user_roles
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can modify user_roles' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_guard ON public.user_roles;
CREATE TRIGGER trg_user_roles_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public._user_roles_guard();
