-- Fix #1: audit_misaligned_blocks — move LAG() out of aggregate context
CREATE OR REPLACE FUNCTION public.audit_misaligned_blocks(p_coach_id uuid)
 RETURNS TABLE(client_id uuid, client_name text, path_start_date date, expected_block1_start date, actual_block1_start date, drift_days integer, total_blocks integer, contiguous boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (auth.uid() = p_coach_id OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ordered AS (
    SELECT
      tb.client_id,
      tb.sequence_order,
      tb.start_date,
      tb.end_date,
      LAG(tb.end_date) OVER (PARTITION BY tb.client_id ORDER BY tb.sequence_order) AS prev_end
    FROM public.training_blocks tb
    WHERE tb.deleted_at IS NULL
  ),
  blocks_per_client AS (
    SELECT
      o.client_id,
      MIN(o.start_date) FILTER (WHERE o.sequence_order = 1) AS first_block_start,
      COUNT(*) AS total,
      bool_and(o.sequence_order = 1 OR o.start_date = o.prev_end + 1) AS chain_contiguous
    FROM ordered o
    GROUP BY o.client_id
  )
  SELECT
    p.id,
    p.full_name,
    p.path_start_date,
    p.path_start_date AS expected_block1_start,
    bpc.first_block_start,
    (bpc.first_block_start - p.path_start_date)::int AS drift_days,
    bpc.total::int,
    bpc.chain_contiguous
  FROM public.profiles p
  JOIN blocks_per_client bpc ON bpc.client_id = p.id
  WHERE p.coach_id = p_coach_id
    AND p.path_type = 'recurring'
    AND p.path_start_date IS NOT NULL
    AND (
      bpc.first_block_start <> p.path_start_date
      OR bpc.chain_contiguous IS DISTINCT FROM true
    )
  ORDER BY ABS(bpc.first_block_start - p.path_start_date) DESC;
END;
$function$;

-- Fix #2: repair_blocks_alignment — qualify all column refs with table alias
-- to avoid ambiguity with OUT param names (block_id, sequence_order, etc.)
CREATE OR REPLACE FUNCTION public.repair_blocks_alignment(p_client_id uuid)
 RETURNS TABLE(block_id uuid, sequence_order integer, old_start date, new_start date, old_end date, new_end date, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_path_start date;
  v_blk         RECORD;
  v_prev_end    date := NULL;
  v_new_start   date;
  v_new_end     date;
  v_duration    int;
  v_grace       int;
BEGIN
  IF NOT (
    auth.uid() = p_client_id
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = p_client_id AND pr.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT pr.path_start_date INTO v_path_start
  FROM public.profiles pr
  WHERE pr.id = p_client_id;

  IF v_path_start IS NULL THEN
    RETURN;
  END IF;

  FOR v_blk IN
    SELECT
      tb.id             AS blk_id,
      tb.sequence_order AS seq,
      tb.start_date     AS s_date,
      tb.end_date       AS e_date,
      COALESCE(tb.duration_days, 28) AS dd,
      COALESCE(tb.grace_days, 7)     AS gd
    FROM public.training_blocks tb
    WHERE tb.client_id = p_client_id
      AND tb.deleted_at IS NULL
    ORDER BY tb.sequence_order ASC
  LOOP
    v_duration := v_blk.dd;
    v_grace    := v_blk.gd;

    IF v_prev_end IS NULL THEN
      v_new_start := v_path_start;
    ELSE
      v_new_start := v_prev_end + INTERVAL '1 day';
    END IF;
    v_new_end := v_new_start + (v_duration - 1) * INTERVAL '1 day';

    IF v_blk.s_date <> v_new_start OR v_blk.e_date <> v_new_end THEN
      UPDATE public.training_blocks tb
      SET start_date = v_new_start,
          end_date   = v_new_end
      WHERE tb.id = v_blk.blk_id;

      UPDATE public.block_allocations ba
      SET valid_until = v_new_end + v_grace * INTERVAL '1 day'
      WHERE ba.block_id = v_blk.blk_id;

      block_id        := v_blk.blk_id;
      sequence_order  := v_blk.seq;
      old_start       := v_blk.s_date;
      new_start       := v_new_start;
      old_end         := v_blk.e_date;
      new_end         := v_new_end;
      action          := 'repaired';
      RETURN NEXT;
    ELSE
      block_id        := v_blk.blk_id;
      sequence_order  := v_blk.seq;
      old_start       := v_blk.s_date;
      new_start       := v_new_start;
      old_end         := v_blk.e_date;
      new_end         := v_new_end;
      action          := 'ok';
      RETURN NEXT;
    END IF;

    v_prev_end := v_new_end;
  END LOOP;
END;
$function$;