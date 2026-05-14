-- 1) Remove client INSERT capability on extra_credits (none existed explicitly, but ensure no permissive insert policy is present).
-- Add explicit coach/admin INSERT policies; service_role bypasses RLS so the webhook keeps working.
DROP POLICY IF EXISTS "Client insert extra_credits" ON public.extra_credits;

CREATE POLICY "Coach insert clients extra_credits"
ON public.extra_credits
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = extra_credits.client_id AND p.coach_id = auth.uid()
  )
);

-- 2) Replace the broad "Client update own extra_credits" policy with a strictly scoped one.
-- Clients may only update their own rows, and only the quantity_booked column may change.
DROP POLICY IF EXISTS "Client update own extra_credits" ON public.extra_credits;

CREATE POLICY "Client update own extra_credits booked"
ON public.extra_credits
FOR UPDATE
TO authenticated
USING (client_id = auth.uid())
WITH CHECK (
  client_id = auth.uid()
);

-- Trigger to ensure clients can ONLY change quantity_booked, nothing else.
CREATE OR REPLACE FUNCTION public.enforce_extra_credits_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.event_type_id IS DISTINCT FROM OLD.event_type_id
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.price_paid IS DISTINCT FROM OLD.price_paid
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.stripe_payment_id IS DISTINCT FROM OLD.stripe_payment_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Clients may only modify quantity_booked on extra_credits.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_extra_credits_client_update ON public.extra_credits;
CREATE TRIGGER trg_enforce_extra_credits_client_update
BEFORE UPDATE ON public.extra_credits
FOR EACH ROW EXECUTE FUNCTION public.enforce_extra_credits_client_update();

-- 3) Allow clients to update quantity_booked on block_allocations belonging to their own training_blocks.
CREATE POLICY "Client update own block_allocations booked"
ON public.block_allocations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.training_blocks b
    WHERE b.id = block_allocations.block_id
      AND b.client_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.training_blocks b
    WHERE b.id = block_allocations.block_id
      AND b.client_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.enforce_block_allocations_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  IF has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'coach'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.training_blocks b
    WHERE b.id = NEW.block_id AND b.client_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RETURN NEW; -- RLS will block; safety net
  END IF;

  IF NEW.block_id IS DISTINCT FROM OLD.block_id
     OR NEW.event_type_id IS DISTINCT FROM OLD.event_type_id
     OR NEW.week_number IS DISTINCT FROM OLD.week_number
     OR NEW.session_type IS DISTINCT FROM OLD.session_type
     OR NEW.quantity_assigned IS DISTINCT FROM OLD.quantity_assigned
     OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Clients may only modify quantity_booked on block_allocations.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_block_allocations_client_update ON public.block_allocations;
CREATE TRIGGER trg_enforce_block_allocations_client_update
BEFORE UPDATE ON public.block_allocations
FOR EACH ROW EXECUTE FUNCTION public.enforce_block_allocations_client_update();

-- 4) Webhook idempotency: prevent double-crediting on duplicate Stripe events.
CREATE UNIQUE INDEX IF NOT EXISTS extra_credits_stripe_payment_id_unique
ON public.extra_credits (stripe_payment_id)
WHERE stripe_payment_id IS NOT NULL;