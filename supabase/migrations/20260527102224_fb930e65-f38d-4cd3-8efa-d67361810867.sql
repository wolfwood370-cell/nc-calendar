
-- 1) Tighten bug_reports INSERT policy: enforce reporter_id = auth.uid()
DROP POLICY IF EXISTS "Anyone authenticated can insert own report" ON public.bug_reports;
CREATE POLICY "Authenticated insert own bug report"
ON public.bug_reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());

-- 2) Extend client booking update guard to also block ignored_by_clients changes.
CREATE OR REPLACE FUNCTION public.validate_client_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF auth.uid() IS DISTINCT FROM OLD.client_id THEN RETURN NEW; END IF;
  IF OLD.scheduled_at < (now() + interval '24 hours') THEN
    RAISE EXCEPTION 'Non è possibile spostare un appuntamento a meno di 24 ore dall''inizio.' USING ERRCODE='P0001';
  END IF;
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
   OR NEW.client_id IS DISTINCT FROM OLD.client_id
   OR NEW.block_id IS DISTINCT FROM OLD.block_id
   OR NEW.session_type IS DISTINCT FROM OLD.session_type
   OR NEW.event_type_id IS DISTINCT FROM OLD.event_type_id
   OR NEW.status IS DISTINCT FROM OLD.status
   OR NEW.notes IS DISTINCT FROM OLD.notes
   OR NEW.trainer_notes IS DISTINCT FROM OLD.trainer_notes
   OR NEW.meeting_link IS DISTINCT FROM OLD.meeting_link
   OR NEW.google_event_id IS DISTINCT FROM OLD.google_event_id
   OR NEW.title IS DISTINCT FROM OLD.title
   OR NEW.is_personal IS DISTINCT FROM OLD.is_personal
   OR NEW.category IS DISTINCT FROM OLD.category
   OR NEW.duration_min IS DISTINCT FROM OLD.duration_min
   OR NEW.buffer_min IS DISTINCT FROM OLD.buffer_min
   OR NEW.ignored IS DISTINCT FROM OLD.ignored
   OR NEW.ignored_by_clients IS DISTINCT FROM OLD.ignored_by_clients
   OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Come atleta puoi modificare solo data e orario della sessione.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END; $function$;
