-- ============================================================================
-- Reverse-sync helpers Google Calendar → DB
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_gcal_cancel(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_b        record;
  v_alloc_id uuid;
  v_ec_id    uuid;
BEGIN
  -- Authz: backend roles OR authenticated coach/admin
  IF NOT (
    current_user IN ('postgres','supabase_admin','service_role')
    OR (
      auth.uid() IS NOT NULL
      AND (
        public.has_role(auth.uid(), 'coach'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    )
  ) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT b.id, b.client_id, b.coach_id, b.block_id, b.event_type_id,
         b.session_type, b.status, b.deleted_at
    INTO v_b
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF v_b.id IS NULL THEN
    RETURN;
  END IF;

  -- Idempotenza: già annullata/conclusa → no-op
  IF v_b.deleted_at IS NOT NULL OR v_b.status <> 'scheduled'::public.booking_status THEN
    RETURN;
  END IF;

  UPDATE public.bookings
     SET status = 'cancelled'::public.booking_status,
         deleted_at = now()
   WHERE id = p_booking_id;

  -- Rimborso credito (stessa logica di cancel_booking ramo non-late)
  IF v_b.block_id IS NOT NULL THEN
    SELECT a.id INTO v_alloc_id
      FROM public.block_allocations a
     WHERE a.block_id = v_b.block_id
       AND a.quantity_booked > 0
       AND ((v_b.event_type_id IS NOT NULL AND a.event_type_id = v_b.event_type_id)
            OR a.session_type = v_b.session_type)
     ORDER BY a.valid_until ASC NULLS LAST,
              CASE WHEN v_b.event_type_id IS NOT NULL
                        AND a.event_type_id = v_b.event_type_id THEN 0 ELSE 1 END,
              a.created_at ASC
     LIMIT 1 FOR UPDATE;
    IF v_alloc_id IS NOT NULL THEN
      UPDATE public.block_allocations
         SET quantity_booked = GREATEST(0, quantity_booked - 1)
       WHERE id = v_alloc_id;
    END IF;
  ELSIF v_b.client_id IS NOT NULL AND v_b.event_type_id IS NOT NULL THEN
    SELECT e.id INTO v_ec_id
      FROM public.extra_credits e
     WHERE e.client_id = v_b.client_id
       AND e.event_type_id = v_b.event_type_id
       AND e.quantity_booked > 0
     ORDER BY e.expires_at ASC
     LIMIT 1 FOR UPDATE;
    IF v_ec_id IS NOT NULL THEN
      UPDATE public.extra_credits
         SET quantity_booked = GREATEST(0, quantity_booked - 1)
       WHERE id = v_ec_id;
    END IF;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_gcal_cancel(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reconcile_gcal_cancel(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.reconcile_gcal_move(
  p_booking_id uuid,
  p_new_scheduled_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_b record;
BEGIN
  IF NOT (
    current_user IN ('postgres','supabase_admin','service_role')
    OR (
      auth.uid() IS NOT NULL
      AND (
        public.has_role(auth.uid(), 'coach'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
    )
  ) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_new_scheduled_at IS NULL THEN
    RETURN;
  END IF;

  SELECT b.id, b.status, b.deleted_at
    INTO v_b
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF v_b.id IS NULL THEN
    RETURN;
  END IF;

  IF v_b.deleted_at IS NOT NULL OR v_b.status <> 'scheduled'::public.booking_status THEN
    RETURN;
  END IF;

  BEGIN
    UPDATE public.bookings
       SET scheduled_at = p_new_scheduled_at,
           updated_at = now()
     WHERE id = p_booking_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      -- 23P01: conflitto con bookings_no_overlap_per_coach → no-op
      RETURN;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_gcal_move(uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reconcile_gcal_move(uuid, timestamptz) TO authenticated;