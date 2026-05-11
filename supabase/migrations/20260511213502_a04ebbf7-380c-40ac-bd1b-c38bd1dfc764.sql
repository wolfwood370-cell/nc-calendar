-- 1) Tighten bookings client policy: client must be assigned to that coach
DROP POLICY IF EXISTS "Client manage own bookings" ON public.bookings;

CREATE POLICY "Client read own bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (client_id = auth.uid());

CREATE POLICY "Client insert own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  client_id = auth.uid()
  AND coach_id = public.get_coach_for(auth.uid())
);

CREATE POLICY "Client update own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (client_id = auth.uid())
WITH CHECK (
  client_id = auth.uid()
  AND coach_id = public.get_coach_for(auth.uid())
);

CREATE POLICY "Client delete own bookings"
ON public.bookings
FOR DELETE
TO authenticated
USING (client_id = auth.uid());

-- 2) Prevent coach from changing coach_id on a client profile (transfer/hijack)
CREATE OR REPLACE FUNCTION public.prevent_coach_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins may reassign clients freely
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'Non puoi modificare il coach assegnato di un cliente.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_coach_id_change ON public.profiles;
CREATE TRIGGER profiles_prevent_coach_id_change
BEFORE UPDATE OF coach_id ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_coach_id_change();

-- 3) Lock down EXECUTE on SECURITY DEFINER helpers to authenticated only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_coach_for(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_for(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_busy(uuid, timestamptz, timestamptz) TO authenticated;