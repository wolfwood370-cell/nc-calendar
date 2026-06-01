-- Fix: rimuove trigger duplicati su bookings che facevano fire 2x le validazioni
-- causando: (a) conferma prenotazione fallisce con "Credito esaurito" perché
-- il primo trigger consuma il credito e il secondo trova residuo 0;
-- (b) cancellazione coach refunda solo 1 dei 2 crediti consumati per errore.
DROP TRIGGER IF EXISTS set_booking_duration_defaults_trg ON public.bookings;
DROP TRIGGER IF EXISTS validate_booking_block_allocation_trg ON public.bookings;
DROP TRIGGER IF EXISTS validate_booking_extra_credits_trg ON public.bookings;
DROP TRIGGER IF EXISTS validate_client_booking_update_trg ON public.bookings;

-- Stesso pattern duplicato su profiles (innocuo ma sporco)
DROP TRIGGER IF EXISTS prevent_coach_id_change_trg ON public.profiles;