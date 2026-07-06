-- Fix: il buffer configurato in event_types.buffer_minutes non veniva mai
-- applicato ai booking. La colonna bookings.buffer_min ha DEFAULT 0, che
-- Postgres materializza PRIMA dei trigger BEFORE INSERT: quindi la guardia
-- `NEW.buffer_min IS NULL` era sempre falsa e il fallback su event_types
-- non partiva mai. Risultato: buffer sempre 0, end_at troppo corto,
-- get_coach_busy restituisce range di 60 min "puri", il generatore di
-- slot non blocca l'ora successiva e due sessioni back-to-back finiscono
-- attaccate senza pausa.
--
-- Fix: il trigger ora, quando event_type_id è impostato, prende SEMPRE
-- buffer_min dall'event type (fonte di verità della configurazione).
-- Per duration_min manteniamo il comportamento "rispetta il valore
-- passato dal caller" (serve a gcalImportEvent per usare la durata
-- effettiva dell'evento Google) ma con fallback all'event type quando
-- il caller non specifica nulla (arriva col DEFAULT 60).
--
-- Nota: NON facciamo backfill delle sessioni gia' esistenti perche'
-- allargare a posteriori end_at genera collisioni con la sessione
-- adiacente (esclusione bookings_no_overlap_per_coach). Il coach
-- dovra' riprogrammare manualmente le eventuali coppie attaccate.

CREATE OR REPLACE FUNCTION public.set_booking_duration_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_et_duration int;
  v_et_buffer   int;
BEGIN
  IF NEW.event_type_id IS NOT NULL THEN
    SELECT et.duration, et.buffer_minutes
      INTO v_et_duration, v_et_buffer
      FROM public.event_types et
     WHERE et.id = NEW.event_type_id;

    -- Buffer: l'event type e' la fonte di verita'. Il DEFAULT 0 della
    -- colonna rendeva impossibile distinguere "non passato" da "passato
    -- esplicitamente 0", quindi allineiamo sempre al valore configurato.
    IF v_et_buffer IS NOT NULL THEN
      NEW.buffer_min := v_et_buffer;
    END IF;

    -- Duration: rispetta un valore esplicito (usato da gcalImportEvent
    -- per riflettere la durata dell'evento Google), ma se il caller non
    -- passa nulla la colonna arriva col DEFAULT 60 -> in quel caso
    -- prendiamo la durata dell'event type se disponibile.
    IF NEW.duration_min IS NULL OR NEW.duration_min = 60 THEN
      NEW.duration_min := COALESCE(v_et_duration, NEW.duration_min, 60);
    END IF;
  END IF;

  NEW.duration_min := COALESCE(NEW.duration_min, 60);
  NEW.buffer_min   := COALESCE(NEW.buffer_min, 0);
  NEW.end_at := NEW.scheduled_at + make_interval(mins => NEW.duration_min + NEW.buffer_min);
  RETURN NEW;
END;
$function$;
