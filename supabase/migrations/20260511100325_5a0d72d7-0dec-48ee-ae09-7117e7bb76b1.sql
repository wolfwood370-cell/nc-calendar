-- Add path_start_date to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS path_start_date date;

-- Weekly schedule table
CREATE TABLE IF NOT EXISTS public.weekly_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  coach_id uuid NOT NULL,
  week_number integer NOT NULL,
  monday_date date NOT NULL,
  block_number integer NOT NULL,
  shifted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, week_number)
);

CREATE INDEX IF NOT EXISTS weekly_schedule_client_idx ON public.weekly_schedule(client_id);

ALTER TABLE public.weekly_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access weekly_schedule"
  ON public.weekly_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coach manage own clients weekly_schedule"
  ON public.weekly_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'coach'::public.app_role) AND coach_id = auth.uid());

CREATE POLICY "Client read own weekly_schedule"
  ON public.weekly_schedule FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE TRIGGER weekly_schedule_set_updated_at
  BEFORE UPDATE ON public.weekly_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
