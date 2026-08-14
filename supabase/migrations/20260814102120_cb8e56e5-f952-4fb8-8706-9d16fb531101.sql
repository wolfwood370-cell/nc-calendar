CREATE OR REPLACE FUNCTION public.set_booking_duration_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_et_duration int;
  v_et_buffer   int;
BEGIN
  IF NEW.event_type_id IS NOT NULL THEN
    SELECT et.duration, et.buffer_minutes
      INTO v_et_duration, v_et_buffer
      FROM public.event_types et
     WHERE et.id = NEW.event_type_id;

    -- Buffer: l'event type e' la fonte di verita'.
    IF v_et_buffer IS NOT NULL THEN
      NEW.buffer_min := v_et_buffer;
    END IF;

    -- Duration: la colonna ha DEFAULT 60, quindi non si puo' distinguere
    -- "non passato" da "passato esplicitamente 60". Le righe importate da
    -- Google (google_event_id valorizzato all'INSERT) portano SEMPRE la
    -- durata reale dell'evento Google -> non va mai sovrascritta.
    IF NEW.google_event_id IS NULL
       AND (NEW.duration_min IS NULL OR NEW.duration_min = 60) THEN
      NEW.duration_min := COALESCE(v_et_duration, NEW.duration_min, 60);
    ELSIF NEW.duration_min IS NULL THEN
      NEW.duration_min := COALESCE(v_et_duration, 60);
    END IF;
  END IF;

  NEW.duration_min := COALESCE(NEW.duration_min, 60);
  NEW.buffer_min   := COALESCE(NEW.buffer_min, 0);
  NEW.end_at := NEW.scheduled_at + make_interval(mins => NEW.duration_min + NEW.buffer_min);
  RETURN NEW;
END;
$function$;