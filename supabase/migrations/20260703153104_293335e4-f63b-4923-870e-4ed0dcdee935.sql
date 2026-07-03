-- Fix 1: SELECT/ALL policy USING branch must also require coach role, not just coach_id match.
DROP POLICY IF EXISTS "Coach can manage own clients bia" ON public.bia_measurements;
CREATE POLICY "Coach can manage own clients bia"
  ON public.bia_measurements
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'coach'::app_role)
      AND coach_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'coach'::app_role)
      AND coach_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = client_id AND p.coach_id = auth.uid()
      )
    )
  );

-- Fix 2: Realtime channel policy scoping bia_measurements topics to the client
-- itself or their coach. The client-side subscribes to channels named
-- "bia:<clientId>[:<seq>]" (seq is per-hook instance to avoid duplicate
-- subscribe crashes), so we authorize any topic starting with "bia:<clientId>".
DROP POLICY IF EXISTS "bia realtime scoped to client or coach" ON realtime.messages;
CREATE POLICY "bia realtime scoped to client or coach"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'bia:%'
    AND (
      -- Extract the client uuid from "bia:<uuid>[:<seq>]"
      split_part(realtime.topic(), ':', 2)::uuid = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = split_part(realtime.topic(), ':', 2)::uuid
          AND p.coach_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );