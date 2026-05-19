-- ==========================================================================
-- M7 (FULL_APP_AUDIT.md): move booster-checkout pricing into a DB table.
-- ==========================================================================
-- The old Edge Function hard-coded the EUR amounts (4000 / 9900 / 7500) and
-- the package metadata (quantity, event_type_title) in a switch statement.
-- That blocked any non-EUR onboarding and meant every price update needed
-- a code change + deploy. The new table is keyed by (package_type, currency)
-- so prices per market live next to each other, and the Edge Function reads
-- the row matching the request.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.booster_packs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  package_type     text        NOT NULL,
  currency         text        NOT NULL DEFAULT 'eur',
  amount_cents     int         NOT NULL CHECK (amount_cents > 0),
  quantity         int         NOT NULL DEFAULT 1 CHECK (quantity > 0),
  event_type_title text        NOT NULL,
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_type, currency)
);

-- Seed with the values previously hard-coded in
-- supabase/functions/booster-checkout/index.ts. ON CONFLICT DO NOTHING so
-- re-running the migration after a manual price tweak is a no-op.
INSERT INTO public.booster_packs (package_type, currency, amount_cents, quantity, event_type_title)
VALUES
  ('single', 'eur', 4000, 1, 'PT'),
  ('pack',   'eur', 9900, 3, 'PT'),
  ('triage', 'eur', 7500, 1, 'Triage')
ON CONFLICT (package_type, currency) DO NOTHING;

ALTER TABLE public.booster_packs ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated may read active packs. The client-store UI uses this
-- so coaches and clients can see the available packages without going
-- through the Edge Function.
CREATE POLICY "Read active booster packs"
ON public.booster_packs
FOR SELECT
TO authenticated
USING (active = true);

-- Mutations restricted to admins. Coaches can request price changes via UI
-- later if needed; for now the table is admin-only writable.
CREATE POLICY "Admin manage booster packs"
ON public.booster_packs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
