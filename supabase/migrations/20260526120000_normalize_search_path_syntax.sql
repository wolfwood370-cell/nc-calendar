-- ==========================================================================
-- MED-D2 (audit 2026-05-26): normalizza la sintassi `SET search_path` su
-- validate_booking_extra_credits.
--
-- La migration 20260520084930_*.sql usa `SET search_path TO 'public'`
-- (literal singoletto quotato), mentre tutte le altre SECURITY DEFINER
-- functions del progetto usano `SET search_path = public` (identifier
-- non quotato). Le due forme sono semanticamente equivalenti in PostgreSQL,
-- ma la divergenza:
--   1. Aumenta il rischio di typo silenzioso ("SET search_path TO public"
--      senza quote ma con sintassi mista non è un errore di parsing — fa
--      cose diverse).
--   2. Rende grep meno affidabile per audit di sicurezza
--      ("manca SET search_path = public" → false negative).
--
-- Fix: CREATE OR REPLACE con il body letteralmente identico, cambiando
-- solo la clausola SET. Non altera comportamento, non richiede backfill.
-- Migration up-only — la 20260520084930 resta intatta come history.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.validate_booking_extra_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
