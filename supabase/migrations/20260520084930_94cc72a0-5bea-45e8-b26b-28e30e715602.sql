CREATE OR REPLACE FUNCTION public.validate_booking_extra_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credit_id uuid;
BEGIN
  -- Skip credit enforcement for events imported/mirrored from Google Calendar.
  -- These are imported as-is; the trainer assigns categories/credits later
  -- via the Review dialog, which goes through dedicated RPCs.
  IF NEW.google_event_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.block_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito: nessun tipo sessione specificato per la prenotazione.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT ec.id INTO v_credit_id
  FROM public.extra_credits ec
  WHERE ec.client_id = NEW.client_id
    AND ec.event_type_id = NEW.event_type_id
    AND ec.quantity - ec.quantity_booked > 0
    AND ec.expires_at > now()
  ORDER BY ec.expires_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_credit_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.extra_credits
  SET quantity_booked = quantity_booked + 1
  WHERE id = v_credit_id;

  RETURN NEW;
END;
$function$;