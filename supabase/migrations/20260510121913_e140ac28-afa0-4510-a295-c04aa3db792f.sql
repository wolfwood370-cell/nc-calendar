ALTER TABLE public.block_allocations
  DROP CONSTRAINT IF EXISTS block_allocations_block_id_week_number_session_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS block_allocations_block_week_type_event_uniq
  ON public.block_allocations (
    block_id,
    week_number,
    session_type,
    COALESCE(event_type_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );