-- ============================================================================
-- reschedule_booking(p_booking_id, p_new_scheduled_at)
-- Spec: docs/reschedule_booking_spec.md (con 2 correzioni adversariali):
--   - Issue 1: bound superiore confrontato per giorno locale Europe/Rome
--   - Issue 2: SELECT di release week-aware (stessa formula del consumo)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reschedule_booking(
  p_booking_id       uuid,
  p_new_scheduled_at timestamptz
)
RETURNS TABLE(
  coach_id        uuid,
  client_id       uuid,
  google_event_id text,
  scheduled_at    timestamptz,
  end_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- 24h cutoff sulla VECCHIA data
  IF v_b.scheduled_at < (now() + interval '24 hours') THEN
    RAISE EXCEPTION 'Non e possibile spostare un appuntamento a meno di 24 ore dall''inizio.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Finestra: nuova data >= now+24h e <= fine giorno locale (oggi+14)
  IF p_new_scheduled_at < (now() + interval '24 hours') THEN
    RAISE EXCEPTION 'Il nuovo orario e troppo vicino (minimo 24 ore).' USING ERRCODE = 'P0001';
  END IF;
  -- CORREZIONE ISSUE 1: confronto per giorno locale Europe/Rome
  IF (p_new_scheduled_at AT TIME ZONE 'Europe/Rome')::date
       > ((now() AT TIME ZONE 'Europe/Rome')::date + 14) THEN
    RAISE EXCEPTION 'Puoi spostare la sessione al massimo entro 14 giorni.' USING ERRCODE = 'P0001';
  END IF;

  IF v_b.scheduled_at IS NOT DISTINCT FROM p_new_scheduled_at THEN
    RAISE EXCEPTION 'La nuova data coincide con quella attuale.' USING ERRCODE = 'P0001';
  END IF;

  v_new_local := (p_new_scheduled_at AT TIME ZONE 'Europe/Rome')::date;

  -- ========================= RAMO BLOCCO =========================
  IF v_b.block_id IS NOT NULL THEN
    -- CORREZIONE ISSUE 2: release week-aware (stessa formula del consumo)
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

    -- Reconsume: stessa logica di validate_booking_block_allocation, cross-block
    SELECT ba.id, ba.block_id
      INTO v_new_alloc, v_new_block
      FROM public.block_allocations ba
      JOIN public.training_blocks tb ON tb.id = ba.block_id
     WHERE tb.client_id = v_b.client_id
       AND tb.deleted_at IS NULL
       AND (ba.quantity_assigned > ba.quantity_booked OR ba.id = v_rel_alloc)
       AND (ba.valid_until IS NULL OR ba.valid_until >= v_new_local)
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
      IF v_rel_alloc IS NOT NULL THEN
        UPDATE public.block_allocations
           SET quantity_booked = GREATEST(0, quantity_booked - 1)
         WHERE id = v_rel_alloc;
      END IF;
      UPDATE public.block_allocations
         SET quantity_booked = quantity_booked + 1
       WHERE id = v_new_alloc;
    END IF;

    IF v_new_block IS DISTINCT FROM v_b.block_id THEN
      UPDATE public.bookings SET block_id = v_new_block WHERE id = p_booking_id;
    END IF;

  -- ========================= RAMO EXTRA =========================
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
       AND e.expires_at > p_new_scheduled_at
     ORDER BY e.expires_at ASC
     LIMIT 1 FOR UPDATE;

    IF v_new_ec IS NULL THEN
      RAISE EXCEPTION 'Credito esaurito o scaduto per la nuova data. Acquista un Booster.'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_rel_ec IS NOT NULL AND v_rel_ec = v_new_ec THEN
      NULL;
    ELSE
      IF v_rel_ec IS NOT NULL THEN
        UPDATE public.extra_credits
           SET quantity_booked = GREATEST(0, quantity_booked - 1)
         WHERE id = v_rel_ec;
      END IF;
      UPDATE public.extra_credits
         SET quantity_booked = quantity_booked + 1
       WHERE id = v_new_ec;
    END IF;
  END IF;

  -- end_at ricalcolato dal trigger BEFORE UPDATE OF scheduled_at
  UPDATE public.bookings
     SET scheduled_at = p_new_scheduled_at, updated_at = now()
   WHERE id = p_booking_id;

  RETURN QUERY
    SELECT b.coach_id, b.client_id, b.google_event_id, b.scheduled_at, b.end_at
      FROM public.bookings b WHERE b.id = p_booking_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reschedule_booking(uuid, timestamptz) TO authenticated;

-- ============================================================================
-- DROP FIX D (sostituito dal RPC sopra).
-- ============================================================================
DROP TRIGGER IF EXISTS zz_trg_revalidate_client_reschedule ON public.bookings;
DROP FUNCTION IF EXISTS public.revalidate_client_reschedule_window();
