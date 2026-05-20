-- ==========================================================================
-- integration_settings.stripe_account_id — flag so the trainer UI can show
-- a real "Connesso" badge for Stripe instead of the hardcoded false state.
-- ==========================================================================
-- The platform Stripe key (STRIPE_SECRET_KEY) is shared across all coaches
-- via the booster-checkout Edge Function — there's no per-coach Stripe
-- Connect onboarding shipping yet. Until that ships, this column lets ops
-- mark individual trainers as "Stripe-connected" so the dashboard badge
-- reflects whether they've configured packs / agreed to fee terms / etc.
--
-- The frontend treats `stripe_account_id IS NOT NULL` as connected. The
-- value itself is opaque text (could be a real Stripe `acct_…` id later
-- when Connect ships, or a manual sentinel like 'platform-managed' for
-- now). UI never displays it.
-- ==========================================================================

ALTER TABLE public.integration_settings
  ADD COLUMN IF NOT EXISTS stripe_account_id text;

-- Optional ops convenience: index for "which trainers have Stripe?" queries.
-- Partial so the (currently most common) null state doesn't bloat the index.
CREATE INDEX IF NOT EXISTS idx_integration_settings_stripe_connected
  ON public.integration_settings (coach_id)
  WHERE stripe_account_id IS NOT NULL;

-- Manual flip helper, documented inline so the README stays one-stop:
--
--   -- Mark trainer <coach-uuid> as Stripe-connected:
--   UPDATE public.integration_settings
--   SET stripe_account_id = 'platform-managed'
--   WHERE coach_id = '<coach-uuid>';
--
--   -- Unflip:
--   UPDATE public.integration_settings
--   SET stripe_account_id = NULL
--   WHERE coach_id = '<coach-uuid>';
