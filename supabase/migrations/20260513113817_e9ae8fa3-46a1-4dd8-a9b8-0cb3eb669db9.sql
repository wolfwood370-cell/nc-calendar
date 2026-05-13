CREATE TABLE public.extra_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  event_type_id uuid NOT NULL,
  quantity integer NOT NULL,
  quantity_booked integer NOT NULL DEFAULT 0,
  price_paid numeric,
  expires_at timestamptz NOT NULL,
  stripe_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_extra_credits_client ON public.extra_credits(client_id);
CREATE INDEX idx_extra_credits_event_type ON public.extra_credits(event_type_id);

ALTER TABLE public.extra_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access extra_credits"
ON public.extra_credits
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Coach manage clients extra_credits"
ON public.extra_credits
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = extra_credits.client_id AND p.coach_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = extra_credits.client_id AND p.coach_id = auth.uid()
  )
);

CREATE POLICY "Client read own extra_credits"
ON public.extra_credits
FOR SELECT
TO authenticated
USING (client_id = auth.uid());