CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc_id    uuid;
  v_alloc_block uuid;
  v_block_start date;
  v_week_number int;
  v_scheduled_local_date date;
BEGIN
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  SELECT start_date INTO v_block_start
  FROM public.training_blocks
  WHERE id = NEW.block_id;

  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.' USING ERRCODE = 'P0001';
  END IF;

  v_scheduled_local_date := (NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date;

  v_week_number := LEAST(4, GREATEST(1,
    FLOOR((v_scheduled_local_date - v_block_start) / 7.0)::int + 1));

  -- Nessun vincolo su valid_until: i crediti non scadono.
  SELECT ba.id, ba.block_id
  INTO v_alloc_id, v_alloc_block
  FROM public.block_allocations ba
  JOIN public.training_blocks tb ON tb.id = ba.block_id
  WHERE tb.client_id = NEW.client_id
    AND tb.deleted_at IS NULL
    AND ba.quantity_assigned > ba.quantity_booked
    AND (
      (NEW.event_type_id IS NOT NULL AND ba.event_type_id = NEW.event_type_id)
      OR ba.session_type = NEW.session_type
    )
  ORDER BY
    ba.valid_until ASC NULLS LAST,
    CASE WHEN NEW.event_type_id IS NOT NULL AND ba.event_type_id = NEW.event_type_id THEN 0 ELSE 1 END,
    CASE WHEN ba.week_number = v_week_number THEN 0 ELSE 1 END,
    ABS(ba.week_number - v_week_number),
    ba.created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa tipologia.' USING ERRCODE = 'P0001';
  END IF;

  IF v_alloc_block <> NEW.block_id THEN
    NEW.block_id := v_alloc_block;
  END IF;

  UPDATE public.block_allocations
  SET quantity_booked = quantity_booked + 1
  WHERE id = v_alloc_id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_booking_extra_credits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_credit_id uuid;
BEGIN
  IF NEW.block_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN RETURN NEW; END IF;
  IF NEW.event_type_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito: nessun tipo sessione specificato per la prenotazione.' USING ERRCODE = 'P0001';
  END IF;
  -- Nessun vincolo su expires_at: i crediti extra non scadono.
  SELECT ec.id INTO v_credit_id FROM public.extra_credits ec
    WHERE ec.client_id = NEW.client_id AND ec.event_type_id = NEW.event_type_id
      AND ec.quantity - ec.quantity_booked > 0
    ORDER BY ec.expires_at ASC LIMIT 1 FOR UPDATE;
  IF v_credit_id IS NULL THEN
    RAISE EXCEPTION 'Credito esaurito per questa tipologia di sessione. Acquista un Booster per continuare.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.extra_credits SET quantity_booked = quantity_booked + 1 WHERE id = v_credit_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_client_booking_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller      uuid := auth.uid();
  v_bookable    boolean;
  v_unavail_msg text;
BEGIN
  IF current_user IN ('postgres','supabase_admin','service_role') THEN
    RETURN NEW;
  END IF;
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_caller, 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF v_caller IS DISTINCT FROM NEW.client_id THEN
    RETURN NEW;
  END IF;

  -- Unico vincolo residuo: tipologia non prenotabile online.
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

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_booking(p_booking_id uuid, p_new_scheduled_at timestamp with time zone)
 RETURNS TABLE(coach_id uuid, client_id uuid, google_event_id text, scheduled_at timestamp with time zone, end_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_b            record;
  v_caller       uuid := auth.uid();
  v_new_local    date;
  v_old_local    date;
  v_block_start  date;
  v_week_number  int;
  v_rel_alloc    uuid;
  v_new_alloc    uuid;
  v_new_block    uuid;
  v_rel_ec       uuid;
  v_new_ec       uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sessione non autenticata.' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_scheduled_at IS NULL THEN
    RAISE EXCEPTION 'Nuova data mancante.' USING ERRCODE = 'P0001';
  END IF;

  SELECT b.id, b.client_id, b.coach_id, b.block_id, b.event_type_id,
         b.session_type, b.scheduled_at, b.status, b.deleted_at,
         b.google_event_id, b.is_personal, b.category
    INTO v_b
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF v_b.id IS NULL THEN
    RAISE EXCEPTION 'Sessione non trovata.' USING ERRCODE = 'P0001';
  END IF;

  IF v_b.client_id IS DISTINCT FROM v_caller
     AND v_b.coach_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato.' USING ERRCODE = '42501';
  END IF;

  IF v_b.deleted_at IS NOT NULL OR v_b.status <> 'scheduled'::public.booking_status THEN
    RAISE EXCEPTION 'Sessione gia annullata o conclusa.' USING ERRCODE = 'P0001';
  END IF;
  IF v_b.is_personal = true OR v_b.client_id IS NULL OR v_b.client_id = v_b.coach_id THEN
    RAISE EXCEPTION 'Questa sessione non e riprogrammabile dal cliente.' USING ERRCODE = 'P0001';
  END IF;

  IF v_b.scheduled_at IS NOT DISTINCT FROM p_new_scheduled_at THEN
    RAISE EXCEPTION 'La nuova data coincide con quella attuale.' USING ERRCODE = 'P0001';
  END IF;

  v_new_local := (p_new_scheduled_at AT TIME ZONE 'Europe/Rome')::date;

  IF v_b.block_id IS NOT NULL THEN
    v_old_local := (v_b.scheduled_at AT TIME ZONE 'Europe/Rome')::date;
    SELECT start_date INTO v_block_start FROM public.training_blocks WHERE id = v_b.block_id;
    v_week_number := LEAST(4, GREATEST(1, FLOOR((v_old_local - v_block_start) / 7.0)::int + 1));

    SELECT a.id INTO v_rel_alloc
      FROM public.block_allocations a
     WHERE a.block_id = v_b.block_id
       AND a.quantity_booked > 0
       AND ((v_b.event_type_id IS NOT NULL AND a.event_type_id = v_b.event_type_id)
            OR a.session_type = v_b.session_type)
     ORDER BY a.valid_until ASC NULLS LAST,
              CASE WHEN v_b.event_type_id IS NOT NULL AND a.event_type_id = v_b.event_type_id THEN 0 ELSE 1 END,
              CASE WHEN a.week_number = v_week_number THEN 0 ELSE 1 END,
              ABS(a.week_number - v_week_number),
              a.created_at ASC
     LIMIT 1 FOR UPDATE;

    SELECT ba.id, ba.block_id
      INTO v_new_alloc, v_new_block
      FROM public.block_allocations ba
      JOIN public.training_blocks tb ON tb.id = ba.block_id
     WHERE tb.client_id = v_b.client_id
       AND tb.deleted_at IS NULL
       AND (ba.quantity_assigned > ba.quantity_booked OR ba.id = v_rel_alloc)
       AND ((v_b.event_type_id IS NOT NULL AND ba.event_type_id = v_b.event_type_id)
            OR ba.session_type = v_b.session_type)
     ORDER BY
       ba.valid_until ASC NULLS LAST,
       CASE WHEN v_b.event_type_id IS NOT NULL AND ba.event_type_id = v_b.event_type_id THEN 0 ELSE 1 END,
       CASE WHEN ba.week_number = LEAST(4, GREATEST(1,
              FLOOR((v_new_local - tb.start_date) / 7.0)::int + 1)) THEN 0 ELSE 1 END,
       ABS(ba.week_number - LEAST(4, GREATEST(1,
              FLOOR((v_new_local - tb.start_date) / 7.0)::int + 1))),
       ba.created_at ASC
     LIMIT 1 FOR UPDATE;

    IF v_new_alloc IS NULL THEN
      RAISE EXCEPTION 'Nessun credito disponibile per la nuova data in questa tipologia.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_rel_alloc IS NOT NULL AND v_rel_alloc = v_new_alloc THEN
      NULL;
    ELSE
      IF v_rel_alloc IS NULL THEN
        RAISE EXCEPTION 'Impossibile spostare la sessione: credito originale non individuabile per il rilascio. Riprova o contatta il supporto.'
          USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.block_allocations
         SET quantity_booked = GREATEST(0, quantity_booked - 1)
       WHERE id = v_rel_alloc;
      UPDATE public.block_allocations
         SET quantity_booked = quantity_booked + 1
       WHERE id = v_new_alloc;
    END IF;

    IF v_new_block IS DISTINCT FROM v_b.block_id THEN
      UPDATE public.bookings SET block_id = v_new_block WHERE id = p_booking_id;
    END IF;

  ELSIF v_b.event_type_id IS NOT NULL THEN
    SELECT e.id INTO v_rel_ec
      FROM public.extra_credits e
     WHERE e.client_id = v_b.client_id
       AND e.event_type_id = v_b.event_type_id
       AND e.quantity_booked > 0
     ORDER BY e.expires_at ASC
     LIMIT 1 FOR UPDATE;

    SELECT e.id INTO v_new_ec
      FROM public.extra_credits e
     WHERE e.client_id = v_b.client_id
       AND e.event_type_id = v_b.event_type_id
       AND (e.quantity - e.quantity_booked > 0 OR e.id = v_rel_ec)
     ORDER BY e.expires_at ASC
     LIMIT 1 FOR UPDATE;

    IF v_new_ec IS NULL THEN
      RAISE EXCEPTION 'Credito esaurito per la nuova data. Acquista un Booster.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_rel_ec IS NOT NULL AND v_rel_ec = v_new_ec THEN
      NULL;
    ELSE
      IF v_rel_ec IS NULL THEN
        RAISE EXCEPTION 'Impossibile spostare la sessione: credito originale non individuabile per il rilascio. Riprova o contatta il supporto.'
          USING ERRCODE = 'P0001';
      END IF;
      UPDATE public.extra_credits
         SET quantity_booked = GREATEST(0, quantity_booked - 1)
       WHERE id = v_rel_ec;
      UPDATE public.extra_credits
         SET quantity_booked = quantity_booked + 1
       WHERE id = v_new_ec;
    END IF;
  END IF;

  UPDATE public.bookings
     SET scheduled_at = p_new_scheduled_at, updated_at = now()
   WHERE id = p_booking_id;

  RETURN QUERY
    SELECT b.coach_id, b.client_id, b.google_event_id, b.scheduled_at, b.end_at
      FROM public.bookings b WHERE b.id = p_booking_id;
END;
$function$;