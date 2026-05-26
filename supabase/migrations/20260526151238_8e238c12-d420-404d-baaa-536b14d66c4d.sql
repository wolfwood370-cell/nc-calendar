
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_role   text        NOT NULL DEFAULT 'client'
                              CHECK (reporter_role IN ('coach', 'client', 'admin')),
  coach_id        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  severity        text        NOT NULL DEFAULT 'medium'
                              CHECK (severity IN ('low', 'medium', 'high')),
  description     text        NOT NULL
                              CHECK (length(description) BETWEEN 5 AND 2000),
  page_url        text,
  user_agent      text,
  sentry_event_id text,
  status          text        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;

COMMENT ON TABLE public.bug_reports IS
  'Manual bug reports submitted from the in-app "Segnala problema" button.';

CREATE INDEX IF NOT EXISTS ix_bug_reports_status_created
  ON public.bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_bug_reports_coach_status
  ON public.bug_reports (coach_id, status, created_at DESC)
  WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_bug_reports_reporter
  ON public.bug_reports (reporter_id, created_at DESC);

CREATE OR REPLACE FUNCTION public._bug_reports_derive_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_role     text;
  v_coach_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bug_reports: auth.uid() is NULL — INSERT requires authenticated session'
      USING ERRCODE = '42501';
  END IF;
  NEW.reporter_id := v_uid;
  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;
  NEW.reporter_role := COALESCE(v_role, 'client');
  IF NEW.reporter_role = 'admin' THEN
    NEW.coach_id := NULL;
  ELSIF NEW.reporter_role = 'coach' THEN
    NEW.coach_id := v_uid;
  ELSE
    SELECT coach_id INTO v_coach_id FROM public.profiles WHERE id = v_uid LIMIT 1;
    NEW.coach_id := v_coach_id;
  END IF;
  NEW.updated_at := NEW.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bug_reports_before_insert ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_before_insert
BEFORE INSERT ON public.bug_reports
FOR EACH ROW EXECUTE FUNCTION public._bug_reports_derive_context();

CREATE OR REPLACE FUNCTION public._bug_reports_bump_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at := now();
  END IF;
  IF NEW.status <> 'resolved' AND OLD.status = 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bug_reports_before_update ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_before_update
BEFORE UPDATE ON public.bug_reports
FOR EACH ROW EXECUTE FUNCTION public._bug_reports_bump_updated_at();

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can insert own report" ON public.bug_reports;
CREATE POLICY "Anyone authenticated can insert own report"
  ON public.bug_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admin/coach/client can read scoped reports" ON public.bug_reports;
CREATE POLICY "Admin/coach/client can read scoped reports"
  ON public.bug_reports FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR reporter_id = auth.uid()
    OR coach_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admin/coach can update scoped reports" ON public.bug_reports;
CREATE POLICY "Admin/coach can update scoped reports"
  ON public.bug_reports FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR coach_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR coach_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admin can delete reports" ON public.bug_reports;
CREATE POLICY "Admin can delete reports"
  ON public.bug_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.bug_reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bug_reports;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public._bug_reports_derive_context()
    FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public._bug_reports_bump_updated_at()
    FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
