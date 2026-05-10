CREATE TABLE public.trainer_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_trainer_availability_coach_dow ON public.trainer_availability(coach_id, day_of_week);

ALTER TABLE public.trainer_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access trainer_availability"
ON public.trainer_availability FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coach manage own availability"
ON public.trainer_availability FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid())
WITH CHECK (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid());

CREATE POLICY "Client read assigned coach availability"
ON public.trainer_availability FOR SELECT TO authenticated
USING (coach_id = public.get_coach_for(auth.uid()));
