-- ==========================================================================
-- Migration: Data integrity FKs + trigger timezone cast
-- ==========================================================================
-- Closes audit findings H2 and M8 from FULL_APP_AUDIT.md.
--
-- H2 — event_type_id and client_id columns had no foreign-key constraints
--   on bookings / block_allocations / extra_credits. Deleting an event_type
--   (or, for extra_credits, a client profile) left dangling references and
--   broke downstream lookups. While digging in we also discovered that
--   extra_credits.client_id had no FK at all — deleting a client never
--   cascaded their credits.
--
-- M8 — The validate_booking_block_allocation trigger compared dates via
--   `NEW.scheduled_at::date`, which casts the timestamptz using the server's
--   TimeZone GUC (UTC in Supabase by default). For bookings near midnight
--   Italy time this could yield a different calendar day than the frontend
--   computed, occasionally rejecting valid bookings or relaxing
--   valid_until comparisons by one day. The trigger now casts via
--   `AT TIME ZONE 'Europe/Rome'` to match the business timezone.
-- ==========================================================================

-- ----------------------------------------------------------------------------
-- H2 — bookings.event_type_id
-- ----------------------------------------------------------------------------
-- Backfill any dangling refs before constraining; ON DELETE SET NULL keeps
-- historical bookings around when an event_type is removed.
UPDATE public.bookings b
SET event_type_id = NULL
WHERE event_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = b.event_type_id);

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_event_type_id_fkey;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_event_type_id_fkey
  FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- H2 — block_allocations.event_type_id
-- ----------------------------------------------------------------------------
UPDATE public.block_allocations a
SET event_type_id = NULL
WHERE event_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = a.event_type_id);

ALTER TABLE public.block_allocations
  DROP CONSTRAINT IF EXISTS block_allocations_event_type_id_fkey;
ALTER TABLE public.block_allocations
  ADD CONSTRAINT block_allocations_event_type_id_fkey
  FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- H2 — extra_credits.client_id (had NO FK at all)
-- ----------------------------------------------------------------------------
-- Defensive cleanup: drop orphaned credit rows whose client profile no
-- longer exists. CASCADE on FK ensures future client deletions remove
-- their credits automatically (no manual cleanup needed in
-- admin_delete_client either).
DELETE FROM public.extra_credits
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = extra_credits.client_id);

ALTER TABLE public.extra_credits
  DROP CONSTRAINT IF EXISTS extra_credits_client_id_fkey;
ALTER TABLE public.extra_credits
  ADD CONSTRAINT extra_credits_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- H2 — extra_credits.event_type_id
-- ----------------------------------------------------------------------------
-- The column was created NOT NULL; with ON DELETE SET NULL we need it
-- nullable. UI already has a fallback (event_types.find returns undefined,
-- session_type takes over) so making this nullable doesn't break anything.
ALTER TABLE public.extra_credits ALTER COLUMN event_type_id DROP NOT NULL;

UPDATE public.extra_credits ec
SET event_type_id = NULL
WHERE event_type_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.event_types e WHERE e.id = ec.event_type_id);

ALTER TABLE public.extra_credits
  DROP CONSTRAINT IF EXISTS extra_credits_event_type_id_fkey;
ALTER TABLE public.extra_credits
  ADD CONSTRAINT extra_credits_event_type_id_fkey
  FOREIGN KEY (event_type_id) REFERENCES public.event_types(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- M8 — trigger timezone cast
-- ----------------------------------------------------------------------------
-- Re-declares validate_booking_block_allocation. Two changes vs the previous
-- migration (20260518121500_relax_block_allocation_week_match.sql):
--   1. `NEW.scheduled_at::date` → `(NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date`
--      in the week_number computation, so weeks align with Italy local time.
--   2. Same cast applied to the `valid_until >= ...` comparison.
-- Everything else (relaxed week match from C1, event_type preference order,
-- atomic FOR UPDATE deduction) is preserved verbatim.
CREATE OR REPLACE FUNCTION public.validate_booking_block_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alloc_id      uuid;
  v_block_start   date;
  v_booking_date  date;
  v_week_number   int;
BEGIN
  IF NEW.block_id IS NULL THEN
    RETURN NEW;
  END IF;

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

  -- M8: anchor the timestamptz to Europe/Rome before casting to date, so
  -- the calendar-day boundary matches the business timezone instead of
  -- the server's TimeZone GUC (typically UTC on Supabase).
  v_booking_date := (NEW.scheduled_at AT TIME ZONE 'Europe/Rome')::date;

  v_week_number := LEAST(
    4,
    GREATEST(
      1,
      FLOOR((v_booking_date - v_block_start) / 7.0)::int + 1
    )
  );

  SELECT id INTO v_alloc_id
  FROM public.block_allocations
  WHERE block_id = NEW.block_id
    AND quantity_assigned > quantity_booked
    AND (valid_until IS NULL OR valid_until >= v_booking_date)
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
