ALTER TABLE public.extra_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client read own extra_credits" ON public.extra_credits;
CREATE POLICY "Client read own extra_credits"
ON public.extra_credits
FOR SELECT
TO authenticated
USING (client_id = auth.uid());