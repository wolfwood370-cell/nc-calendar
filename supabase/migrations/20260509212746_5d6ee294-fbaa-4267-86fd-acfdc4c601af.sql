CREATE TABLE public.integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  wa_phone_id text,
  wa_access_token text,
  gcal_webhook_url text,
  wa_enabled boolean NOT NULL DEFAULT false,
  gcal_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access integration_settings"
ON public.integration_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coach manage own integration settings"
ON public.integration_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid());

CREATE TRIGGER set_updated_at_integration_settings
BEFORE UPDATE ON public.integration_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();