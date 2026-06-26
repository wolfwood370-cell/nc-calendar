
CREATE OR REPLACE FUNCTION public.repair_blocks_alignment(p_client_id uuid)
 RETURNS TABLE(block_id uuid, sequence_order integer, old_start date, new_start date, old_end date, new_end date, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_path_start date;
  v_blk RECORD;
  v_prev_end date := NULL;
  v_new_start date;
  v_new_end date;
  v_duration int;
  v_grace int;
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
    IF NOT (
      auth.uid() = p_client_id
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = p_client_id AND coach_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    ) THEN
      RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT p.path_start_date INTO v_path_start FROM public.profiles p WHERE p.id = p_client_id;
  IF v_path_start IS NULL THEN RETURN; END IF;
  FOR v_blk IN
    SELECT tb.id AS id,
           tb.sequence_order AS seq,
           tb.start_date AS start_date,
           tb.end_date AS end_date,
           COALESCE(tb.duration_days, 28) AS dd,
           COALESCE(tb.grace_days, 7) AS gd
    FROM public.training_blocks tb
    WHERE tb.client_id = p_client_id AND tb.deleted_at IS NULL
    ORDER BY tb.sequence_order ASC
  LOOP
    v_duration := v_blk.dd;
    v_grace := v_blk.gd;
    IF v_prev_end IS NULL THEN v_new_start := v_path_start;
    ELSE v_new_start := v_prev_end + INTERVAL '1 day';
    END IF;
    v_new_end := v_new_start + (v_duration - 1) * INTERVAL '1 day';
    IF v_blk.start_date <> v_new_start OR v_blk.end_date <> v_new_end THEN
      UPDATE public.training_blocks SET start_date = v_new_start, end_date = v_new_end WHERE id = v_blk.id;
      UPDATE public.block_allocations
      SET valid_until = (v_new_end + v_grace * INTERVAL '1 day')::date
      WHERE block_id = v_blk.id
        AND valid_until IS NOT NULL
        AND valid_until = (v_blk.end_date + v_grace * INTERVAL '1 day')::date;
      RETURN QUERY SELECT v_blk.id, v_blk.seq, v_blk.start_date, v_new_start, v_blk.end_date, v_new_end, 'repaired'::text;
    ELSE
      RETURN QUERY SELECT v_blk.id, v_blk.seq, v_blk.start_date, v_new_start, v_blk.end_date, v_new_end, 'ok'::text;
    END IF;
    v_prev_end := v_new_end;
  END LOOP;
END;
$function$;
