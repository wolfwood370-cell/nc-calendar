-- ==========================================================================
-- STEP 2 (Hybrid bug-tracking) — tabella per le segnalazioni manuali
-- dell'utente.
-- ==========================================================================
-- Sentry cattura già automaticamente i crash JS via STEP 1 (commit
-- 3d669c7 — sentry context enrichment). Questa tabella aggiunge il
-- canale "manual report" dove cliente / coach descrive un problema
-- visibile che NON ha generato un crash (es. calendario vuoto, layout
-- strano, sessione non visibile). Il submit alimenta sia questa
-- tabella sia Sentry (via captureMessage con tag manual=true) — il
-- sentry_event_id linka i due sistemi.
--
-- ## Schema
--   reporter_id       → auth.uid() del segnalatore (derivato dal trigger)
--   reporter_role     → "coach" / "client" / "admin" (derivato da user_roles)
--   coach_id          → coach associato al cliente, o l'utente stesso se è
--                       il coach. NULL per admin. Permette al trainer di
--                       filtrare i report dei propri clienti.
--   severity          → "low" / "medium" / "high" — scelto dall'utente
--   description       → testo libero italiano (5–2000 char)
--   page_url          → es. "/client/book" — il client lo cattura al submit
--   user_agent        → browser/OS dell'utente per debug context
--   sentry_event_id   → id ritornato da Sentry.captureMessage per il link
--   status            → "open" (default) → "in_progress" → "resolved"
--   resolved_at       → set automaticamente quando status → "resolved"
--   created_at, updated_at → standard
--
-- ## Sicurezza (RLS)
--   INSERT  → qualunque user autenticato; reporter_id/role/coach_id sono
--             derivati dal trigger BEFORE INSERT (impossibile spoof).
--   SELECT  → admin tutto · coach propri + dei propri clienti ·
--             client solo i propri.
--   UPDATE  → admin tutto · coach propri + dei propri clienti (per
--             cambiare status). Client read-only post-INSERT.
--   DELETE  → solo admin.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.bug_reports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_role   text        NOT NULL DEFAULT 'client'
                              CHECK (reporter_role IN ('coach', 'client', 'admin')),
  coach_id        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  severity        text        NOT NULL DEFAULT 'medium'
                              CHECK (severity IN ('low', 'medium', 'high')),
  description     text        NOT NULL
                              CHECK (length(description) BETWEEN 5 AND 2000),
  page_url        text,
  user_agent      text,
  sentry_event_id text,
  status          text        NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bug_reports IS
  'Manual bug reports submitted from the in-app "Segnala problema" button. '
  'Pairs with Sentry (sentry_event_id) for crash context. RLS: client sees '
  'own only, coach sees own + own clients, admin sees all.';

-- Index principali per le query del dashboard
CREATE INDEX IF NOT EXISTS ix_bug_reports_status_created
  ON public.bug_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_bug_reports_coach_status
  ON public.bug_reports (coach_id, status, created_at DESC)
  WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_bug_reports_reporter
  ON public.bug_reports (reporter_id, created_at DESC);

-- --------------------------------------------------------------------------
-- BEFORE INSERT trigger: derive reporter_id/role/coach_id server-side
-- --------------------------------------------------------------------------
-- Il client può solo inviare description/severity/page_url/user_agent/
-- sentry_event_id. Tutti gli altri campi vengono derivati dall'auth context
-- + dalle tabelle user_roles e profiles — così nessun spoof è possibile
-- (un client non può segnalare un bug "a nome del coach", né alterare il
-- coach_id per dirottare report a un altro trainer).
CREATE OR REPLACE FUNCTION public._bug_reports_derive_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_role         text;
  v_coach_id     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bug_reports: auth.uid() is NULL — INSERT requires authenticated session'
      USING ERRCODE = '42501';
  END IF;

  NEW.reporter_id := v_uid;

  -- Resolve role from user_roles. Fallback to 'client' if no row (legacy
  -- users created before user_roles was populated).
  SELECT role::text INTO v_role
  FROM public.user_roles
  WHERE user_id = v_uid
  LIMIT 1;
  NEW.reporter_role := COALESCE(v_role, 'client');

  -- Resolve coach_id:
  --   - if reporter is the client → use profiles.coach_id of the client
  --   - if reporter is the coach  → use the coach's own id (self)
  --   - if reporter is admin      → leave NULL (admin reports are not scoped)
  IF NEW.reporter_role = 'admin' THEN
    NEW.coach_id := NULL;
  ELSIF NEW.reporter_role = 'coach' THEN
    NEW.coach_id := v_uid;
  ELSE
    SELECT coach_id INTO v_coach_id
    FROM public.profiles
    WHERE id = v_uid
    LIMIT 1;
    NEW.coach_id := v_coach_id;
  END IF;

  -- Always stamp updated_at = created_at on INSERT (NEW.created_at uses
  -- the column DEFAULT now() if the client didn't pass one).
  NEW.updated_at := NEW.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bug_reports_before_insert ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_before_insert
BEFORE INSERT ON public.bug_reports
FOR EACH ROW
EXECUTE FUNCTION public._bug_reports_derive_context();

-- --------------------------------------------------------------------------
-- BEFORE UPDATE trigger: bump updated_at + stamp resolved_at automatically
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bug_reports_bump_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  -- Auto-stamp resolved_at when status transitions to 'resolved'.
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at := now();
  END IF;
  -- If reopened (resolved → open/in_progress), clear resolved_at.
  IF NEW.status <> 'resolved' AND OLD.status = 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bug_reports_before_update ON public.bug_reports;
CREATE TRIGGER trg_bug_reports_before_update
BEFORE UPDATE ON public.bug_reports
FOR EACH ROW
EXECUTE FUNCTION public._bug_reports_bump_updated_at();

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- INSERT: qualunque user autenticato. Tutti i campi sensibili (reporter_id,
-- reporter_role, coach_id) vengono sovrascritti dal trigger BEFORE INSERT,
-- quindi il policy WITH CHECK è permissivo — la sicurezza è nel trigger.
DROP POLICY IF EXISTS "Anyone authenticated can insert own report" ON public.bug_reports;
CREATE POLICY "Anyone authenticated can insert own report"
  ON public.bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- SELECT: admin all, coach (own + own clients), client (own only).
DROP POLICY IF EXISTS "Admin/coach/client can read scoped reports" ON public.bug_reports;
CREATE POLICY "Admin/coach/client can read scoped reports"
  ON public.bug_reports
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR reporter_id = auth.uid()
    OR coach_id = auth.uid()
  );

-- UPDATE: admin + coach (per cambiare status sui propri / dei propri
-- clienti). Client NON può modificare i propri report dopo l'invio
-- (mantiene l'audit trail).
DROP POLICY IF EXISTS "Admin/coach can update scoped reports" ON public.bug_reports;
CREATE POLICY "Admin/coach can update scoped reports"
  ON public.bug_reports
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR coach_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR coach_id = auth.uid()
  );

-- DELETE: solo admin (per cleanup di spam / test reports). Coach NON
-- può cancellare perché il flusso normale è status='resolved', che
-- mantiene il record per audit storico.
DROP POLICY IF EXISTS "Admin can delete reports" ON public.bug_reports;
CREATE POLICY "Admin can delete reports"
  ON public.bug_reports
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- --------------------------------------------------------------------------
-- Realtime: pubblicare la tabella così il trainer dashboard può ricevere
-- notifiche live quando un cliente segnala un nuovo bug.
-- --------------------------------------------------------------------------
ALTER TABLE public.bug_reports REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bug_reports;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- Lock down the helper trigger functions: REVOKE da PUBLIC/anon/
-- authenticated. Le trigger functions sono invocate INTERNAMENTE da
-- Postgres (BEFORE INSERT / UPDATE), non via PostgREST, quindi non
-- serve EXECUTE grant ad alcun ruolo cliente.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public._bug_reports_derive_context()
    FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public._bug_reports_bump_updated_at()
    FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
