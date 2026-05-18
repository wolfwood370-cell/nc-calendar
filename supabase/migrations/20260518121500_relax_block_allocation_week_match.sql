-- ==========================================================================
-- Migration: Relax block_allocation week_number match in the booking trigger
-- ==========================================================================
-- Closes audit finding C1 (FULL_APP_AUDIT.md). The previous version of
-- validate_booking_block_allocation, introduced in 20260518120000, required
-- an EXACT week_number match against `LEAST(4, GREATEST(1, FLOOR((dt -
-- start) / 7.0)::int + 1))`. That worked when every block had four
-- per-week allocation rows, but the application has always created blocks
-- with a single `week_number: 1` allocation per training_block (see
-- src/routes/trainer.clients.index.tsx:561). With blocks spanning ~30
-- days, every booking in days 7–29 of a block fell into v_week_number = 2,
-- 3 or 4, found no matching row, and the trigger raised P0001
-- "Credito di blocco non disponibile per questa settimana e tipologia" —
-- breaking ~75% of legitimate bookings.
--
-- This change keeps the per-week granularity as a *preference* but no
-- longer requires it. The trigger now picks the allocation with the
-- highest priority among the eligible rows:
--   1. event_type_id exact match wins over session_type fallback.
--   2. Exact week_number match wins over non-matching weeks.
--   3. Closest week_number to the computed booking week breaks remaining
--      ties (so if both week_number=1 and week_number=4 exist for a
--      week-3 booking, we prefer week_number=4).
--   4. Oldest created_at breaks final ties (deterministic).
--
-- The frontend `findAllocationForWeek` in src/routes/client.book.tsx has
-- always had this exact same fallback semantic, so this realignment makes
-- the trigger match what the rest of the application already does.
--
-- All other behaviors of the trigger are unchanged:
--   - block_id IS NULL bookings (extra_credits path) still bypass.
--   - coach-imported bookings (client_id NULL or = coach_id) still bypass.
--   - quantity_assigned > quantity_booked still enforced.
--   - valid_until expiry still enforced.
--   - The chosen allocation is still locked FOR UPDATE and incremented
--     atomically in the same transaction as the booking INSERT.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc_id    uuid;
  v_block_start date;
  v_week_number int;
BEGIN
  -- Only enforce for bookings tied to a training block; extra_credits
  -- trigger handles the block_id IS NULL case.
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip for coach-imported bookings (Google Calendar mirror inserts with
  -- the coach as their own client_id, or with NULL client_id).
  IF NEW.client_id IS NULL OR NEW.client_id = NEW.coach_id THEN
    RETURN NEW;
  END IF;

  SELECT start_date INTO v_block_start
  FROM public.training_blocks
  WHERE id = NEW.block_id;

  IF v_block_start IS NULL THEN
    RAISE EXCEPTION 'Blocco di allenamento non trovato.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Week number (1..4), clamped — matches the frontend findAllocationForWeek
  -- computation. Used only as an ORDER BY preference now, not a hard
  -- filter, so single-row-per-block allocations still resolve correctly.
  v_week_number := LEAST(
    4,
    GREATEST(
      1,
      FLOOR((NEW.scheduled_at::date - v_block_start) / 7.0)::int + 1
    )
  );

  -- Pick the best eligible allocation. event_type_id match > session_type
  -- fallback; exact week match > non-exact; closest week breaks the tie;
  -- oldest created_at is the final deterministic tiebreaker.
  SELECT id INTO v_alloc_id
  FROM public.block_allocations
  WHERE block_id = NEW.block_id
    AND quantity_assigned > quantity_booked
    AND (valid_until IS NULL OR valid_until >= NEW.scheduled_at::date)
    AND (
      (NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id)
      OR session_type = NEW.session_type
    )
  ORDER BY
    CASE
      WHEN NEW.event_type_id IS NOT NULL AND event_type_id = NEW.event_type_id THEN 0
      ELSE 1
    END,
    CASE WHEN week_number = v_week_number THEN 0 ELSE 1 END,
    ABS(week_number - v_week_number),
    created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Credito di blocco non disponibile per questa tipologia.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.block_allocations
  SET quantity_booked = quantity_booked + 1
  WHERE id = v_alloc_id;

  RETURN NEW;
END;
$$;

-- Trigger binding is preserved from the previous migration — the function
-- name and signature are unchanged, so trg_booking_validate_block_allocation
-- continues to point at the updated definition.

COMMENT ON FUNCTION public.validate_booking_block_allocation() IS
  'Validates and atomically deducts a block_allocation for a booking. Prefers '
  'event_type and exact week_number matches, but falls back to any eligible '
  'allocation in the block — matching the frontend findAllocationForWeek '
  'semantic. See FULL_APP_AUDIT.md C1 for the regression that motivated this.';
