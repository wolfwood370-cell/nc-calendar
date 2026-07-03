-- ==========================================================================
-- DESIGN HANDOFF (design_handoff_nc_calendar) — backend per le sezioni
-- nuove del redesign: misurazioni BIA, feedback post-sessione, nota
-- privata del coach, conferma presenza del cliente.
-- ==========================================================================
-- Il redesign introduce quattro funzioni che il DB non supportava:
--   1. bia_measurements   → grafico "I tuoi progressi" (cliente) e pannello
--                           "Andamento BIA" con add/edit/delete (coach).
--   2. session_feedback   → valutazione 1..5 della sessione completata,
--                           scritta dal cliente, letta dal coach.
--   3. coach_client_notes → "Note & obiettivi": nota privata del coach sul
--                           cliente con autosave. Tabella separata (NON una
--                           colonna su profiles) perché il cliente legge la
--                           propria riga profiles e la nota è riservata.
--   4. bookings.client_confirmed_at → "Conferma presenza": timestamp set
--                           dal cliente via RPC dedicata; il coach vede la
--                           spunta ✓ su calendario e liste.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. BIA — misurazioni corporee (peso / massa muscolare / % grasso)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bia_measurements (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id    uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  measured_on date          NOT NULL,
  weight_kg   numeric(5,2)  NOT NULL CHECK (weight_kg > 0 AND weight_kg < 400),
  muscle_kg   numeric(5,2)  NOT NULL CHECK (muscle_kg > 0 AND muscle_kg < 200),
  fat_pct     numeric(4,1)  NOT NULL CHECK (fat_pct >= 1 AND fat_pct <= 70),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now(),
  -- Una sola misurazione per cliente per data: l'inserimento "anche con
  -- data passata" del design resta possibile, i duplicati no.
  CONSTRAINT uq_bia_client_date UNIQUE (client_id, measured_on)
);

COMMENT ON TABLE public.bia_measurements IS
  'Misurazioni BIA inserite dal coach. Il cliente le legge nel grafico '
  '"I tuoi progressi" della dashboard. RLS: client SELECT proprie, coach '
  'CRUD sui propri clienti.';

CREATE INDEX IF NOT EXISTS ix_bia_client_date
  ON public.bia_measurements (client_id, measured_on DESC);

-- updated_at automatico
CREATE OR REPLACE FUNCTION public._bia_bump_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bia_before_update ON public.bia_measurements;
CREATE TRIGGER trg_bia_before_update
BEFORE UPDATE ON public.bia_measurements
FOR EACH ROW
EXECUTE FUNCTION public._bia_bump_updated_at();

ALTER TABLE public.bia_measurements ENABLE ROW LEVEL SECURITY;

-- Cliente: sola lettura delle proprie misurazioni.
DROP POLICY IF EXISTS "Client can read own bia" ON public.bia_measurements;
CREATE POLICY "Client can read own bia"
  ON public.bia_measurements
  FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

-- Coach: CRUD completo, ma solo su misurazioni proprie e di clienti
-- effettivamente assegnati (previene scritture cross-coach).
DROP POLICY IF EXISTS "Coach can manage own clients bia" ON public.bia_measurements;
CREATE POLICY "Coach can manage own clients bia"
  ON public.bia_measurements
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR coach_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      coach_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = client_id AND p.coach_id = auth.uid()
      )
    )
  );

-- Realtime: il cliente vede la nuova misurazione senza refresh (il coach
-- la inserisce dal proprio profilo cliente).
ALTER TABLE public.bia_measurements REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bia_measurements;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 2. Feedback post-sessione (valutazione 1..5)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_feedback (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid        NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating     smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.session_feedback IS
  'Valutazione 1..5 della sessione completata, scritta dal cliente dalla '
  'dashboard. Il coach la vede nella campanella attività. Un solo feedback '
  'per booking (UNIQUE).';

CREATE INDEX IF NOT EXISTS ix_feedback_client
  ON public.session_feedback (client_id, created_at DESC);

ALTER TABLE public.session_feedback ENABLE ROW LEVEL SECURITY;

-- Cliente: inserisce/aggiorna il feedback solo sui PROPRI booking completati.
DROP POLICY IF EXISTS "Client can insert own feedback" ON public.session_feedback;
CREATE POLICY "Client can insert own feedback"
  ON public.session_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND b.client_id = auth.uid()
        AND b.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "Client can update own feedback" ON public.session_feedback;
CREATE POLICY "Client can update own feedback"
  ON public.session_feedback
  FOR UPDATE
  TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Lettura: il cliente le proprie, il coach quelle dei propri booking.
DROP POLICY IF EXISTS "Client and coach can read scoped feedback" ON public.session_feedback;
CREATE POLICY "Client and coach can read scoped feedback"
  ON public.session_feedback
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id AND b.coach_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 3. Nota privata del coach sul cliente ("Note & obiettivi", autosave)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_client_notes (
  coach_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note       text        NOT NULL DEFAULT '' CHECK (length(note) <= 5000),
  goal       text        NOT NULL DEFAULT '' CHECK (length(goal) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, client_id)
);

COMMENT ON TABLE public.coach_client_notes IS
  'Nota privata + obiettivo del coach per cliente (card "Note & obiettivi" '
  'nel profilo cliente lato coach). NESSUNA policy per il cliente: il '
  'contenuto è riservato al coach.';

ALTER TABLE public.coach_client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach can manage own notes" ON public.coach_client_notes;
CREATE POLICY "Coach can manage own notes"
  ON public.coach_client_notes
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR coach_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      coach_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = client_id AND p.coach_id = auth.uid()
      )
    )
  );

-- --------------------------------------------------------------------------
-- 4. Conferma presenza del cliente
-- --------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS client_confirmed_at timestamptz;

COMMENT ON COLUMN public.bookings.client_confirmed_at IS
  'Timestamp della "Conferma presenza" fatta dal cliente (design handoff). '
  'Set SOLO via RPC confirm_booking_attendance; azzerato automaticamente '
  'dal trigger se la sessione viene riprogrammata.';

-- RPC dedicata invece di allargare la policy UPDATE dei clienti su
-- bookings: il cliente può toccare SOLO questo campo, SOLO sui propri
-- booking futuri ancora programmati.
CREATE OR REPLACE FUNCTION public.confirm_booking_attendance(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'confirm_booking_attendance: sessione non autenticata'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.bookings
     SET client_confirmed_at = now()
   WHERE id = p_booking_id
     AND client_id = auth.uid()
     AND status = 'scheduled'
     AND deleted_at IS NULL
     AND client_confirmed_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_booking_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_booking_attendance(uuid) TO authenticated;

-- Riprogrammazione ⇒ la conferma decade (semantica del design: "reschedule
-- azzera la conferma"). Trigger unico, vale per ogni percorso di update
-- (drag del coach, sheet del cliente, sync GCal).
CREATE OR REPLACE FUNCTION public._bookings_reset_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    NEW.client_confirmed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_reset_confirmation ON public.bookings;
CREATE TRIGGER trg_bookings_reset_confirmation
BEFORE UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public._bookings_reset_confirmation();

-- Lock down trigger helpers (pattern del repo: invocate solo da Postgres).
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public._bia_bump_updated_at()
    FROM PUBLIC, anon, authenticated;
  REVOKE EXECUTE ON FUNCTION public._bookings_reset_confirmation()
    FROM PUBLIC, anon, authenticated;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;
