
-- 1. Rinomina enum vecchio e crea nuovo enum con admin/coach/client
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('admin', 'coach', 'client');

-- 2. Aggiorna user_roles convertendo trainer -> coach
ALTER TABLE public.user_roles
  ALTER COLUMN role TYPE public.app_role
  USING (CASE role::text WHEN 'trainer' THEN 'coach' ELSE role::text END)::public.app_role;

-- 3. Drop funzioni vecchie (dipendenti dal tipo)
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role_old);
DROP FUNCTION IF EXISTS public.get_user_role(uuid);
DROP TYPE public.app_role_old;

-- 4. Aggiungi coach_id a profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS idx_profiles_coach_id ON public.profiles(coach_id);

-- 5. Tabella inviti
CREATE TABLE IF NOT EXISTS public.client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  phone text,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_email_pending
  ON public.client_invitations (lower(email)) WHERE status = 'pending';

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

-- 6. Ricrea funzioni helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
$$;

-- Funzione: il coach del cliente
CREATE OR REPLACE FUNCTION public.get_coach_for(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coach_id FROM public.profiles WHERE id = _user_id;
$$;

-- 7. Aggiorna trigger handle_new_user con logica inviti
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  assigned_role public.app_role;
  inv RECORD;
  v_coach_id uuid := NULL;
  v_full_name text;
  v_phone text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  IF lower(NEW.email) = 'nctrainingsystems@gmail.com' THEN
    assigned_role := 'admin';
  ELSE
    -- Cerca invito pending
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
  END IF;

  INSERT INTO public.profiles (id, email, full_name, coach_id, phone)
  VALUES (NEW.id, NEW.email, v_full_name, v_coach_id, v_phone);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);

  RETURN NEW;
END;
$$;

-- Assicura che il trigger esista
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. Pulisci policy esistenti su profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Profiles RLS
CREATE POLICY "Admin full access profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Self read profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Self update profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Self insert profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Coach read own clients" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid());

CREATE POLICY "Coach update own clients" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid());

-- user_roles RLS
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Self read role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admin manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- client_invitations RLS
CREATE POLICY "Admin full access invitations" ON public.client_invitations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coach manage own invitations" ON public.client_invitations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid());
