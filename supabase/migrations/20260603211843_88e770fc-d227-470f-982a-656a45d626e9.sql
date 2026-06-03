-- P1 (Wave 5): blocca self-escalation di campi sensibili in profiles.
-- RLS WITH CHECK non vede OLD: implementiamo via trigger BEFORE UPDATE.
-- Coach e admin restano liberi (gestiti da RLS + prevent_coach_id_change).

CREATE OR REPLACE FUNCTION public.prevent_self_profile_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Bypass per chiamate non autenticate (trigger interni, service_role).
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Admin libero.
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN NEW; END IF;
  -- Solo blocchiamo self-update (caller == owner del profilo).
  IF auth.uid() IS DISTINCT FROM OLD.id THEN RETURN NEW; END IF;

  IF NEW.auto_renew_blocks IS DISTINCT FROM OLD.auto_renew_blocks
   OR NEW.auto_renew       IS DISTINCT FROM OLD.auto_renew
   OR NEW.path_type        IS DISTINCT FROM OLD.path_type
   OR NEW.path_start_date  IS DISTINCT FROM OLD.path_start_date
   OR NEW.next_billing_date IS DISTINCT FROM OLD.next_billing_date
   OR NEW.status           IS DISTINCT FROM OLD.status
   OR NEW.pack_label       IS DISTINCT FROM OLD.pack_label
   OR NEW.deleted_at       IS DISTINCT FROM OLD.deleted_at
   OR NEW.coach_id         IS DISTINCT FROM OLD.coach_id THEN
    RAISE EXCEPTION 'Non puoi modificare i campi di abbonamento o assegnazione del tuo profilo.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_profile_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_self_profile_escalation_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_profile_escalation();