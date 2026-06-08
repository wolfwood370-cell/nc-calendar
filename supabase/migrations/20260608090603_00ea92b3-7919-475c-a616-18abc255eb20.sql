CREATE OR REPLACE FUNCTION public.prevent_client_restricted_booking_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Bypass for privileged backend roles (service_role used by server
  -- functions like gcalRepairMissingEvents / gcalCreateEvent writeback,
  -- supabase_admin and postgres for maintenance / migrations). These
  -- callers don't have auth.uid() set and need to perform admin-level
  -- updates such as writing back google_event_id. Without this bypass
  -- the writeback fails silently and the next repair pass re-creates
  -- the Google event => duplicates accumulate.
  IF current_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN NEW;
  END IF;
  -- No authenticated session at all -> not a client mutation. Allow.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Skip for admins and coaches (the owning coach)
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF public.has_role(auth.uid(), 'coach'::app_role) AND NEW.coach_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  -- Client path: forbid changes to sensitive/trainer-controlled columns
  IF NEW.trainer_notes IS DISTINCT FROM OLD.trainer_notes THEN
    RAISE EXCEPTION 'Clients cannot modify trainer_notes';
  END IF;
  IF NEW.ignored_by_clients IS DISTINCT FROM OLD.ignored_by_clients THEN
    RAISE EXCEPTION 'Clients cannot modify ignored_by_clients';
  END IF;
  IF NEW.session_type IS DISTINCT FROM OLD.session_type THEN
    RAISE EXCEPTION 'Clients cannot modify session_type';
  END IF;
  IF NEW.block_id IS DISTINCT FROM OLD.block_id THEN
    RAISE EXCEPTION 'Clients cannot modify block_id';
  END IF;
  IF NEW.event_type_id IS DISTINCT FROM OLD.event_type_id THEN
    RAISE EXCEPTION 'Clients cannot modify event_type_id';
  END IF;
  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
     OR NEW.end_at IS DISTINCT FROM OLD.end_at
     OR NEW.duration_min IS DISTINCT FROM OLD.duration_min
     OR NEW.buffer_min IS DISTINCT FROM OLD.buffer_min THEN
    RAISE EXCEPTION 'Clients cannot modify booking time/duration';
  END IF;
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.is_personal IS DISTINCT FROM OLD.is_personal
     OR NEW.google_event_id IS DISTINCT FROM OLD.google_event_id
     OR NEW.meeting_link IS DISTINCT FROM OLD.meeting_link
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.ignored IS DISTINCT FROM OLD.ignored THEN
    RAISE EXCEPTION 'Clients cannot modify this booking field';
  END IF;

  RETURN NEW;
END;
$function$;