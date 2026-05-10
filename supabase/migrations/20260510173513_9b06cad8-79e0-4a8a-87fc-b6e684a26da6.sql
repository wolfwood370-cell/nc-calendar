ALTER TABLE public.block_allocations ADD COLUMN IF NOT EXISTS valid_until date;

UPDATE public.block_allocations ba
SET valid_until = tb.end_date
FROM public.training_blocks tb
WHERE ba.block_id = tb.id AND ba.valid_until IS NULL;