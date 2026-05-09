
-- 1. Enum session_type
DO $$ BEGIN
  CREATE TYPE public.session_type AS ENUM ('PT Session', 'BIA', 'Functional Test');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.block_status AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.booking_status AS ENUM ('scheduled', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. deleted_at su profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 3. training_blocks
CREATE TABLE IF NOT EXISTS public.training_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.block_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_training_blocks_client ON public.training_blocks(client_id);
CREATE INDEX IF NOT EXISTS idx_training_blocks_coach ON public.training_blocks(coach_id);

-- 4. block_allocations
CREATE TABLE IF NOT EXISTS public.block_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid NOT NULL REFERENCES public.training_blocks(id) ON DELETE CASCADE,
  week_number int NOT NULL CHECK (week_number BETWEEN 1 AND 4),
  session_type public.session_type NOT NULL,
  quantity_assigned int NOT NULL DEFAULT 0,
  quantity_booked int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (block_id, week_number, session_type)
);
CREATE INDEX IF NOT EXISTS idx_block_allocations_block ON public.block_allocations(block_id);

-- 5. bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.training_blocks(id) ON DELETE SET NULL,
  session_type public.session_type NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status public.booking_status NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON public.bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_bookings_coach ON public.bookings(coach_id);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON public.bookings(scheduled_at);

-- 6. Trigger per updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_training_blocks_updated_at ON public.training_blocks;
CREATE TRIGGER trg_training_blocks_updated_at BEFORE UPDATE ON public.training_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Enable RLS
ALTER TABLE public.training_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.block_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- 8. RLS training_blocks
DROP POLICY IF EXISTS "Admin full access blocks" ON public.training_blocks;
CREATE POLICY "Admin full access blocks" ON public.training_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Coach manage own clients blocks" ON public.training_blocks;
CREATE POLICY "Coach manage own clients blocks" ON public.training_blocks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Client read own blocks" ON public.training_blocks;
CREATE POLICY "Client read own blocks" ON public.training_blocks
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- 9. RLS block_allocations (basato su block_id -> training_blocks)
DROP POLICY IF EXISTS "Admin full access allocations" ON public.block_allocations;
CREATE POLICY "Admin full access allocations" ON public.block_allocations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Coach manage allocations" ON public.block_allocations;
CREATE POLICY "Coach manage allocations" ON public.block_allocations
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.training_blocks b
    WHERE b.id = block_id AND b.coach_id = auth.uid()
      AND public.has_role(auth.uid(), 'coach')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.training_blocks b
    WHERE b.id = block_id AND b.coach_id = auth.uid()
      AND public.has_role(auth.uid(), 'coach')
  ));

DROP POLICY IF EXISTS "Client read own allocations" ON public.block_allocations;
CREATE POLICY "Client read own allocations" ON public.block_allocations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.training_blocks b
    WHERE b.id = block_id AND b.client_id = auth.uid()
  ));

-- 10. RLS bookings
DROP POLICY IF EXISTS "Admin full access bookings" ON public.bookings;
CREATE POLICY "Admin full access bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Coach manage clients bookings" ON public.bookings;
CREATE POLICY "Coach manage clients bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'coach') AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Client manage own bookings" ON public.bookings;
CREATE POLICY "Client manage own bookings" ON public.bookings
  FOR ALL TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());
