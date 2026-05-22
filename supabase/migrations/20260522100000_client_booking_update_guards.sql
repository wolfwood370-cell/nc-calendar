-- ==========================================================================
-- Client self-service reschedule: 24h cutoff + column whitelist trigger
-- ==========================================================================
-- The existing RLS policy "Client update own bookings" (since
-- 20260511213502) allows a client to UPDATE any row where client_id =
-- auth.uid(). That was correct for the booking-creation flow but
-- dangerously broad now that clients can self-reschedule from
-- LiveBookingCard / RescheduleDrawer — they could in principle PATCH
-- notes, status, meeting_link, trainer_notes, even reassign coach_id.
--
-- This trigger locks the client path down to a single legitimate
-- mutation (scheduled_at) while leaving every other update path
-- untouched:
--   - Coach updates (auth.uid() = coach_id, not client_id)         → pass
--   - SECURITY DEFINER RPCs (cancel_booking, mark_booking_special,
--     admin_delete_client, …) run as the function owner so
--     current_user is NOT 'authenticated' on the trigger fire → pass
--   - Client raw UPDATE on their own row                            → enforced:
--       1. Hard 24h cutoff against OLD.scheduled_at (the current
--          time, not the new one — so a client can't "save" a slot
--          by repeatedly bumping it forward).
--       2. Whitelist: only scheduled_at may differ from OLD. Every
--          other column (notes, status, meeting_link, etc.) raises.
--
-- Errors raise SQLSTATE P0001 with Italian message so the UI layer
-- can surface error.message directly in a toast.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.validate_client_booking_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass 1: SECURITY DEFINER callers. The cancel_booking /
  -- mark_booking_special / admin_delete_client RPCs run as the
  -- function owner; current_user is the owner role, not
  -- 'authenticated'. We trust those code paths to validate their own
  -- preconditions.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Bypass 2: coach path. The "Coach manage clients bookings" RLS
  -- policy matches on coach_id = auth.uid(); auth.uid() then is the
  -- coach, never the client. Personal blocks (where client_id is
  -- NULL or = coach_id) also fall through here — the client is not
  -- the row owner, so this branch passes without restrictions.
  IF auth.uid() IS DISTINCT FROM OLD.client_id THEN
    RETURN NEW;
  END IF;

  -- Below: an authenticated client is updating their own booking
  -- directly (no RPC wrapper). Apply the safeguards.

  -- 1. 24h hard cutoff. OLD.scheduled_at is the current booking time;
  --    if it's within 24 hours from now, the client can't reschedule
  --    even if they'd be moving it later. This matches the wording
  --    used by the existing late-cancel cutoff in cancel_booking
  --    (M3 audit fix). The new scheduled_at (NEW.scheduled_at) is
  --    NOT inspected here on purpose: a client who tries to move a
  --    booking that's 25h out, but to a slot that's 3h out, would
  --    still be subject to the no-overlap exclusion constraint +
  --    the coach's availability — but the cutoff itself is about
  --    cancelling the *current* slot, not the new one.
  IF OLD.scheduled_at < (now() + interval '24 hours') THEN
    RAISE EXCEPTION 'Non è possibile spostare un appuntamento a meno di 24 ore dall''inizio.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Whitelist: only scheduled_at may change. Every other column
  --    the client could touch (or that PostgREST could send via a
  --    crafted PATCH) raises. Includes:
  --      - relational pointers (coach_id / client_id / block_id /
  --        event_type_id) — re-assigning the booking would break
  --        ownership + credit accounting
  --      - session_type / duration_min / buffer_min — would
  --        retroactively change pricing and overlap calculations
  --      - status / deleted_at — must go through cancel_booking RPC
  --      - notes / trainer_notes / title / meeting_link — coach-
  --        owned metadata, never client-mutable
  --      - is_personal / category — only mark_booking_special can
  --        flip these (and only for coach-owned rows anyway)
  --      - google_event_id / ignored — sync bookkeeping
  IF NEW.coach_id        IS DISTINCT FROM OLD.coach_id
   OR NEW.client_id      IS DISTINCT FROM OLD.client_id
   OR NEW.block_id       IS DISTINCT FROM OLD.block_id
   OR NEW.session_type   IS DISTINCT FROM OLD.session_type
   OR NEW.event_type_id  IS DISTINCT FROM OLD.event_type_id
   OR NEW.status         IS DISTINCT FROM OLD.status
   OR NEW.notes          IS DISTINCT FROM OLD.notes
   OR NEW.trainer_notes  IS DISTINCT FROM OLD.trainer_notes
   OR NEW.meeting_link   IS DISTINCT FROM OLD.meeting_link
   OR NEW.google_event_id IS DISTINCT FROM OLD.google_event_id
   OR NEW.title          IS DISTINCT FROM OLD.title
   OR NEW.is_personal    IS DISTINCT FROM OLD.is_personal
   OR NEW.category       IS DISTINCT FROM OLD.category
   OR NEW.duration_min   IS DISTINCT FROM OLD.duration_min
   OR NEW.buffer_min     IS DISTINCT FROM OLD.buffer_min
   OR NEW.ignored        IS DISTINCT FROM OLD.ignored
   OR NEW.deleted_at     IS DISTINCT FROM OLD.deleted_at
  THEN
    RAISE EXCEPTION 'Come atleta puoi modificare solo data e orario della sessione.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- Name starts with "z_" so it sorts *after* the existing
-- "trg_set_booking_duration_defaults" (BEFORE INSERT) and the
-- block/credit validators — though the validators don't fire on
-- UPDATE, the ordering makes the dependency story easier to read.
DROP TRIGGER IF EXISTS z_trg_validate_client_booking_update ON public.bookings;
CREATE TRIGGER z_trg_validate_client_booking_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_client_booking_update();
