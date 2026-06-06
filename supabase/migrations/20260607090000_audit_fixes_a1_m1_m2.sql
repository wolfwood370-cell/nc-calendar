-- ============================================================================
-- Migration: audit fixes A1 + M1 + M2  (2026-06-06)
-- ----------------------------------------------------------------------------
-- Dall'audit completo 2026-06-06 (docs/AUDIT_2026-06-06.md). SQL generato e
-- VERIFICATO ADVERSARIALMENTE (workflow ultracode, 2 verificatori per fix).
--
-- COSA FA:
--   A1  Anti-IDOR su reconcile_gcal_cancel / reconcile_gcal_move:
--       (a) guardia defense-in-depth nel corpo (un utente autenticato diretto
--           deve possedere la sessione o essere admin; il server via
--           service_role ha auth.uid()=NULL e salta il check);
--       (b) chiusura superficie PostgREST: EXECUTE solo a service_role
--           (revoca anche authenticated). Le funzioni sono invocate SOLO dal
--           server (src/lib/gcal.functions.ts -> supabaseAdmin.rpc), quindi
--           non rompe alcun percorso legittimo.
--   M1  validate_client_booking_update: il cliente non puo piu allungare end_at
--       manipolandolo direttamente. end_at puo cambiare SOLO come effetto del
--       ricalcolo legato a un reschedule (scheduled_at cambia); se scheduled_at
--       NON cambia ma end_at si -> RAISE.
--   M2  reschedule_booking fail-closed: la nuova allocazione/credito viene
--       incrementata SOLO se il rilascio del credito vecchio e stato
--       individuato; altrimenti rollback (niente doppio consumo a danno cliente).
--
-- NON INCLUSO:
--   A2 (guardia "phantom refund" su google_event_id) e stato RIGETTATO in
--   verifica: in nc-calendar google_event_id viene scritto anche sui booking
--   normali (dopo il push verso Google), quindi quella guardia avrebbe rotto i
--   rimborsi legittimi (perdita credito a ogni cancellazione). Il phantom-refund
--   teorico e gia auto-protetto (il refund scatta solo se trova un'allocazione
--   con quantity_booked > 0). Nessun intervento necessario.
--
-- PROPRIETA': idempotente / append-only (solo CREATE OR REPLACE col corpo intero
--   + REVOKE/GRANT ripetibili). Nessun BEGIN/COMMIT (gestito da Lovable).
-- ============================================================================


-- ============================================================================
-- A1.1 — reconcile_gcal_cancel: guardia anti-IDOR + EXECUTE solo service_role
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
  -- Authz: ruoli backend OPPURE coach/admin autenticato
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

  -- FIX A1 (anti-IDOR, defense-in-depth): se la chiamata arriva da un utente
  -- autenticato diretto (auth.uid() NON NULL), deve possedere la sessione
  -- (coach_id = auth.uid()) oppure essere admin. Le chiamate del server
  -- (service_role) hanno auth.uid() = NULL e saltano questo controllo.
  IF auth.uid() IS NOT NULL
     AND v_b.coach_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Idempotenza: gia annullata/conclusa -> no-op
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

REVOKE EXECUTE ON FUNCTION public.reconcile_gcal_cancel(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_gcal_cancel(uuid) TO service_role;


-- ============================================================================
-- A1.2 — reconcile_gcal_move: guardia anti-IDOR + EXECUTE solo service_role
-- ============================================================================
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

  SELECT b.id, b.coach_id, b.status, b.deleted_at
    INTO v_b
    FROM public.bookings b
   WHERE b.id = p_booking_id
   FOR UPDATE;

  IF v_b.id IS NULL THEN
    RETURN;
  END IF;

  -- FIX A1 (anti-IDOR, defense-in-depth): utente autenticato diretto deve
  -- possedere la sessione o essere admin. service_role -> auth.uid() = NULL -> skip.
  IF auth.uid() IS NOT NULL
     AND v_b.coach_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
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
      -- 23P01: conflitto con bookings_no_overlap_per_coach -> no-op
      RETURN;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_gcal_move(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reconcile_gcal_move(uuid, timestamptz) TO service_role;


-- ============================================================================
-- M1 — validate_client_booking_update: blocca la modifica diretta di end_at.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_client_booking_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Bypass per chiamate non autenticate (trigger interni, service_role).
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Bypass per caller che non e il client del booking (coach/admin gestiti dalle RLS).
  IF auth.uid() IS DISTINCT FROM OLD.client_id THEN RETURN NEW; END IF;
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
   -- FIX M1: end_at puo cambiare SOLO come effetto del ricalcolo legato a un
   -- reschedule (scheduled_at cambia). Se scheduled_at NON cambia ma end_at si,
   -- e una manipolazione diretta del cliente (allungamento slot) -> blocco.
   OR (NEW.end_at IS DISTINCT FROM OLD.end_at
       AND NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at) THEN
    RAISE EXCEPTION 'Come atleta puoi modificare solo data e orario della sessione.' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$function$;


-- ============================================================================
-- M2 — reschedule_booking fail-closed (no doppio consumo netto).
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
    -- release week-aware (stessa formula del consumo)
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
      -- FIX M2 (fail-closed): la nuova allocazione viene incrementata SOLO se
      -- il rilascio del credito vecchio e stato individuato. Se v_rel_alloc
      -- e NULL non possiamo restituire il credito originale: un increment
      -- unilaterale produrrebbe un doppio consumo netto. Annulliamo (rollback).
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
      -- FIX M2 (fail-closed): increment del nuovo credito SOLO se il rilascio
      -- del credito vecchio e stato individuato. Altrimenti rollback per
      -- evitare il doppio consumo netto a danno del cliente.
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
