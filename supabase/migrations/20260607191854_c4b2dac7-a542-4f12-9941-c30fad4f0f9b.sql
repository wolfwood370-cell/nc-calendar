CREATE OR REPLACE FUNCTION public.validate_client_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Bypass quando il chiamante NON è il cliente, oppure è anche il coach
  -- (caso degli eventi importati da Google con client_id == coach_id come placeholder:
  --  il trainer deve poter convertirli in Impegno Personale/Consulenza via mark_booking_special).
  IF auth.uid() IS DISTINCT FROM OLD.client_id OR auth.uid() = OLD.coach_id THEN
    RETURN NEW;
  END IF;
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
   OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
   OR NEW.created_at IS DISTINCT FROM OLD.created_at
   OR (NEW.end_at IS DISTINCT FROM OLD.end_at
       AND NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at) THEN
    RAISE EXCEPTION 'Come atleta puoi modificare solo data e orario della sessione.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$function$;