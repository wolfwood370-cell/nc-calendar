ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS last_gcal_error TEXT;

COMMENT ON COLUMN public.bookings.last_gcal_error IS
  'Diagnostica: messaggio raw dell''ultimo errore gcalCreateEvent. NULL = ultima creazione riuscita o mai tentata. Scritto dalla server function gcal.functions.ts (catch finale).';