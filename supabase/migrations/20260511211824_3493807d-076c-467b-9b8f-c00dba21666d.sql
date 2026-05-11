
CREATE TABLE IF NOT EXISTS public.trainer_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL UNIQUE,
  buffer_minutes integer NOT NULL DEFAULT 15,
  min_notice_hours integer NOT NULL DEFAULT 24,
  booking_horizon_days integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trainer_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access trainer_settings"
  ON public.trainer_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coach manage own trainer_settings"
  ON public.trainer_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'coach'::app_role) AND coach_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'coach'::app_role) AND coach_id = auth.uid());

CREATE POLICY "Client read assigned coach trainer_settings"
  ON public.trainer_settings FOR SELECT TO authenticated
  USING (coach_id = get_coach_for(auth.uid()));

CREATE TRIGGER trainer_settings_set_updated_at
  BEFORE UPDATE ON public.trainer_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
