
CREATE TABLE public.event_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  duration INTEGER NOT NULL DEFAULT 60,
  base_type public.session_type NOT NULL DEFAULT 'PT Session',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access event_types"
  ON public.event_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coach manage own event_types"
  ON public.event_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid());

CREATE POLICY "Client read assigned coach event_types"
  ON public.event_types FOR SELECT TO authenticated
  USING (coach_id = public.get_coach_for(auth.uid()));

CREATE TRIGGER set_event_types_updated_at
  BEFORE UPDATE ON public.event_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_event_types_coach ON public.event_types(coach_id);
