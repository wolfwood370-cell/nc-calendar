
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS path_type text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS next_billing_date date;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_path_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_path_type_check CHECK (path_type IN ('fixed','recurring'));
