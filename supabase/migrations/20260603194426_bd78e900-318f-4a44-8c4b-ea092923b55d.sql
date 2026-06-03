CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS TABLE(status booking_status, was_late boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_booking record; v_caller uuid := auth.uid();
        v_is_late boolean; v_status public.booking_status;
        v_alloc_id uuid; v_ec_id uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Sessione non autenticata.' USING ERRCODE='P0001'; END IF;
  SELECT b.id, b.client_id, b.coach_id, b.block_id, b.event_type_id, b.session_type,
         b.scheduled_at, b.status AS status, b.deleted_at
    INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_booking.id IS NULL THEN RAISE EXCEPTION 'Sessione non trovata.' USING ERRCODE='P0001'; END IF;
  IF v_booking.deleted_at IS NOT NULL OR v_booking.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Sessione già annullata o conclusa.' USING ERRCODE='P0001';
  END IF;
  IF v_booking.client_id IS DISTINCT FROM v_caller
     AND v_booking.coach_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato.' USING ERRCODE='42501';
  END IF;
  v_is_late := now() >= (v_booking.scheduled_at - interval '24 hours');
  v_status := CASE WHEN v_is_late THEN 'late_cancelled'::public.booking_status
                   ELSE 'cancelled'::public.booking_status END;
  UPDATE public.bookings AS b SET status = v_status, deleted_at = now() WHERE b.id = p_booking_id;
  IF NOT v_is_late THEN
    IF v_booking.block_id IS NOT NULL THEN
      SELECT a.id INTO v_alloc_id FROM public.block_allocations a
        WHERE a.block_id = v_booking.block_id AND a.quantity_booked > 0
          AND ((v_booking.event_type_id IS NOT NULL AND a.event_type_id = v_booking.event_type_id)
               OR a.session_type = v_booking.session_type)
        ORDER BY CASE WHEN v_booking.event_type_id IS NOT NULL AND a.event_type_id = v_booking.event_type_id THEN 0 ELSE 1 END, a.created_at ASC
        LIMIT 1 FOR UPDATE;
      IF v_alloc_id IS NOT NULL THEN
        UPDATE public.block_allocations SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_alloc_id;
      END IF;
    ELSIF v_booking.client_id IS NOT NULL AND v_booking.event_type_id IS NOT NULL THEN
      SELECT e.id INTO v_ec_id FROM public.extra_credits e
        WHERE e.client_id = v_booking.client_id AND e.event_type_id = v_booking.event_type_id
          AND e.quantity_booked > 0
        ORDER BY e.expires_at ASC LIMIT 1 FOR UPDATE;
      IF v_ec_id IS NOT NULL THEN
        UPDATE public.extra_credits SET quantity_booked = GREATEST(0, quantity_booked - 1) WHERE id = v_ec_id;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT v_status, v_is_late;
END; $function$;