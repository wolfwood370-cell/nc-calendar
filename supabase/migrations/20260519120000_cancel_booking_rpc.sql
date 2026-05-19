-- ==========================================================================
-- M3 (FULL_APP_AUDIT.md): server-side cancel_booking decides late vs
-- regular cancel using the DB clock, refunds atomically, and returns the
-- final status to the caller.
-- ==========================================================================
-- Before: client.bookings.$bookingId.tsx computed `within24h` via
-- differenceInHours(start, new Date()) and passed a client-chosen `late`
-- flag to useCancelBooking, which then updated bookings.status. There was
-- no server-side check — a hand-crafted RPC with `late: false` could
-- bypass the late-cancel penalty entirely, and a user on a misconfigured
-- system clock could trip the dialog at the wrong moment.
--
-- This function moves the decision into the DB. now() and scheduled_at
-- are both timestamptz, so the comparison is timezone-safe regardless of
-- where the caller's browser thinks "now" is. Ownership is enforced
-- (caller must be the client themselves, the coach, or an admin), the
-- booking is locked FOR UPDATE so concurrent cancels serialize, and the
-- refund happens in the same transaction as the status change.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.cancel_booking(p_booking_id uuid)
RETURNS TABLE (status public.booking_status, was_late boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking  record;
  v_caller   uuid := auth.uid();
  v_is_late  boolean;
  v_status   public.booking_status;
  v_alloc_id uuid;
  v_ec_id    uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sessione non autenticata.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Serialize concurrent cancels of the same booking.
  SELECT id, client_id, coach_id, block_id, event_type_id, session_type,
         scheduled_at, status, deleted_at
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Sessione non trovata.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.deleted_at IS NOT NULL OR v_booking.status <> 'scheduled' THEN
    RAISE EXCEPTION 'Sessione già annullata o conclusa.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Ownership: caller is the client, the coach, or an admin.
  IF v_booking.client_id IS DISTINCT FROM v_caller
     AND v_booking.coach_id IS DISTINCT FROM v_caller
     AND NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Permesso negato.'
      USING ERRCODE = '42501';
  END IF;

  -- Server-clock decision. "Within 24h of scheduled time" → late cancel.
  v_is_late := now() >= (v_booking.scheduled_at - interval '24 hours');
  v_status  := CASE WHEN v_is_late THEN 'late_cancelled'::public.booking_status
                                    ELSE 'cancelled'::public.booking_status END;

  UPDATE public.bookings
  SET status     = v_status,
      deleted_at = now()
  WHERE id = p_booking_id;

  -- Refund only on in-time (free) cancellations. Mirrors the resolution
  -- order the existing client code used so observable behavior is the same.
  IF NOT v_is_late THEN
    IF v_booking.block_id IS NOT NULL THEN
      SELECT id INTO v_alloc_id
      FROM public.block_allocations
      WHERE block_id = v_booking.block_id
        AND quantity_booked > 0
        AND (
          (v_booking.event_type_id IS NOT NULL
            AND event_type_id = v_booking.event_type_id)
          OR session_type = v_booking.session_type
        )
      ORDER BY
        CASE WHEN v_booking.event_type_id IS NOT NULL
              AND event_type_id = v_booking.event_type_id THEN 0
             ELSE 1 END,
        created_at ASC
      LIMIT 1
      FOR UPDATE;

      IF v_alloc_id IS NOT NULL THEN
        UPDATE public.block_allocations
        SET quantity_booked = GREATEST(0, quantity_booked - 1)
        WHERE id = v_alloc_id;
      END IF;
    ELSIF v_booking.client_id IS NOT NULL
       AND v_booking.event_type_id IS NOT NULL THEN
      -- Extra credit refund — FIFO by expires_at, same as the legacy code.
      SELECT id INTO v_ec_id
      FROM public.extra_credits
      WHERE client_id = v_booking.client_id
        AND event_type_id = v_booking.event_type_id
        AND quantity_booked > 0
      ORDER BY expires_at ASC
      LIMIT 1
      FOR UPDATE;

      IF v_ec_id IS NOT NULL THEN
        UPDATE public.extra_credits
        SET quantity_booked = GREATEST(0, quantity_booked - 1)
        WHERE id = v_ec_id;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, v_is_late;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_booking(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_booking(uuid) TO authenticated;
