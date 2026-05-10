
CREATE TABLE public.availability_exceptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access availability_exceptions"
ON public.availability_exceptions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coach manage own availability_exceptions"
ON public.availability_exceptions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'coach'::app_role) AND coach_id = auth.uid())
WITH CHECK (has_role(auth.uid(), 'coach'::app_role) AND coach_id = auth.uid());

CREATE POLICY "Client read assigned coach availability_exceptions"
ON public.availability_exceptions FOR SELECT TO authenticated
USING (coach_id = get_coach_for(auth.uid()));

CREATE INDEX idx_availability_exceptions_coach_date ON public.availability_exceptions(coach_id, date);

CREATE TRIGGER trg_availability_exceptions_updated_at
BEFORE UPDATE ON public.availability_exceptions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bookings ADD COLUMN trainer_notes TEXT NULL;
