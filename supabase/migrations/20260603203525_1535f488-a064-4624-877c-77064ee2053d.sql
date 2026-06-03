-- M8 (FULL_APP_AUDIT.md): il cast `NEW.scheduled_at::date` usava la timezone
-- di sessione (UTC su Supabase). Una prenotazione alle 23:00 Europe/Rome
-- (= 22:00 UTC) sull'ultimo giorno della settimana 1 cadeva nella settimana 2
-- per via dello scarto UTC. Forziamo Europe/Rome così la business-week
-- coincide con quella che il frontend calcola sull'orario locale.
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

  -- M8 fix: usa esplicitamente Europe/Rome (timezone di business della app)
  -- invece del cast implicito dipendente dalla GUC TimeZone del server.
  v_scheduled_local_date := (NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date;

  v_week_number := LEAST(
    4,
    GREATEST(
      1,
      FLOOR((v_scheduled_local_date - v_block_start) / 7.0)::int + 1
    )
  );

  SELECT ba.id, ba.block_id
  INTO v_alloc_id, v_alloc_block
  FROM public.block_allocations ba
  JOIN public.training_blocks tb ON tb.id = ba.block_id
  WHERE tb.client_id = NEW.client_id
    AND tb.deleted_at IS NULL
    AND ba.quantity_assigned > ba.quantity_booked
    AND (ba.valid_until IS NULL OR ba.valid_until >= v_scheduled_local_date)
    AND (
      (NEW.event_type_id IS NOT NULL AND ba.event_type_id = NEW.event_type_id)
      OR ba.session_type = NEW.session_type
    )
  ORDER BY
    ba.valid_until ASC NULLS LAST,
    CASE
      WHEN NEW.event_type_id IS NOT NULL AND ba.event_type_id = NEW.event_type_id THEN 0
      ELSE 1
    END,
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