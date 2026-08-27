UPDATE public.block_allocations
SET valid_until = DATE '2026-09-30'
WHERE block_id = 'cd8acc2a-add7-4e98-be1c-29dfadb4729d'
  AND quantity_assigned > quantity_booked;