-- ==========================================================================
-- HIGH-1 (audit 2026-05-26): pg_cron daily job per pulire le notifications
-- vecchie e già lette.
-- ==========================================================================
-- La tabella public.notifications crescerebbe indefinitamente senza un
-- archival job — il client paginato (PAGE_SIZE=30) sta benino oggi ma con
-- 6 mesi di uso normale arriva a decine di migliaia di righe, rallentando
-- la query iniziale del feed e l'index ix_notifications_recipient_created.
--
-- Strategia: cancellare le notification che soddisfano TUTTE queste
-- condizioni:
--   1. read_at IS NOT NULL   → l'utente le ha già viste (zero data loss UX)
--   2. created_at < 90 giorni fa → mantiene comunque 3 mesi di storia
-- Le notification non lette restano per sempre (l'utente potrebbe ancora
-- volerle vedere). Le notification più recenti restano per consultazione
-- storica anche se lette.
--
-- ## Idempotency
-- - CREATE EXTENSION IF NOT EXISTS pg_cron (no-op se già presente)
-- - CREATE OR REPLACE FUNCTION
-- - Schedule unschedule-best-effort + re-schedule (no duplicates)
--
-- ## Safety
-- - current_user guard impedisce invocazione da PostgREST
-- - REVOKE su anon/authenticated chiude completamente il path utente
-- - DELETE con WHERE stringente: errore di syntax non causa truncate
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- --------------------------------------------------------------------------
-- 1. Helper function — invocato dal cron, no auth context
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notifications_cleanup_cron_run()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  -- Defense-in-depth: questa funzione MUST NOT essere invocata da una user
  -- session. pg_cron gira come postgres / supabase_admin; tutto il resto
  -- viene rejected con 42501 (insufficient_privilege).
  IF current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION '_notifications_cleanup_cron_run is reserved for the cron scheduler (current_user=%)', current_user
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.notifications
  WHERE read_at IS NOT NULL
    AND created_at < (now() - INTERVAL '90 days');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public._notifications_cleanup_cron_run() FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

COMMENT ON FUNCTION public._notifications_cleanup_cron_run() IS
  'Daily notifications archival job invoked by pg_cron at 04:30 UTC. '
  'Cancella le notification con read_at IS NOT NULL AND '
  'created_at < now() - 90 giorni. REVOKEd da PUBLIC/anon/authenticated; '
  'current_user guard impedisce l''invocazione da qualunque ruolo che '
  'non sia postgres/supabase_admin.';

-- --------------------------------------------------------------------------
-- 2. Schedule daily — 04:30 UTC (sfalsato di 30 min rispetto al job
--    auto_renew per non sovrapporre il carico)
-- --------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('notifications_cleanup_daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'notifications_cleanup_daily',
  '30 4 * * *',  -- 04:30 UTC daily
  $cron$ SELECT public._notifications_cleanup_cron_run(); $cron$
);
