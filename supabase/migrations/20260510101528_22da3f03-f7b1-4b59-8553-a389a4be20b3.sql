ALTER TABLE public.block_allocations ADD COLUMN IF NOT EXISTS event_type_id uuid NULL;
CREATE INDEX IF NOT EXISTS idx_block_allocations_event_type_id ON public.block_allocations(event_type_id);
ALTER TABLE public.training_blocks ADD COLUMN IF NOT EXISTS sequence_order integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_training_blocks_sequence_order ON public.training_blocks(client_id, sequence_order);