
CREATE OR REPLACE FUNCTION public.enforce_client_booking_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_min_notice   int  := 24;
  v_horizon_days int  := 60;
  v_bookable     boolean;
  v_unavail_msg  text;
BEGIN
  -- Bypass for backend roles and unauthenticated DB callers.
  IF current_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN NEW;
  END IF;
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;
  -- Bypass for admin and coach (the owning coach inserting on behalf of client).
  IF public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF v_caller IS DISTINCT FROM NEW.client_id THEN
    RETURN NEW;
  END IF;

  -- A2: event type explicitly marked non-bookable from the client side.
  IF NEW.event_type_id IS NOT NULL THEN
    SELECT et.client_bookable, et.unavailable_message
      INTO v_bookable, v_unavail_msg
      FROM public.event_types et
     WHERE et.id = NEW.event_type_id;
    IF v_bookable IS NOT NULL AND v_bookable = false THEN
      RAISE EXCEPTION '%',
        COALESCE(NULLIF(v_unavail_msg, ''),
                 'Questa tipologia non è prenotabile online. Contatta il tuo coach.')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- A3: enforce coach's min_notice_hours and booking_horizon_days.
  IF NEW.coach_id IS NOT NULL THEN
    SELECT ts.min_notice_hours, ts.booking_horizon_days
      INTO v_min_notice, v_horizon_days
      FROM public.trainer_settings ts
     WHERE ts.coach_id = NEW.coach_id;
    v_min_notice   := COALESCE(v_min_notice, 24);
    v_horizon_days := COALESCE(v_horizon_days, 60);
  END IF;

  IF NEW.scheduled_at < now() + make_interval(hours => v_min_notice) THEN
    RAISE EXCEPTION 'Il preavviso minimo per prenotare è di % ore.', v_min_notice
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.scheduled_at > now() + make_interval(days => v_horizon_days) THEN
    RAISE EXCEPTION 'Puoi prenotare al massimo entro % giorni.', v_horizon_days
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_client_booking_rules ON public.bookings;
CREATE TRIGGER trg_enforce_client_booking_rules
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_client_booking_rules();
