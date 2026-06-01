-- ==========================================================================
-- Estende la grace finestra di prenotazione da 7 a 14 giorni dopo
-- block.end_date così il cliente nell'ultima settimana può prenotare le
-- sessioni residue del blocco corrente fino a 14 giorni nel futuro.
-- ==========================================================================
-- Background:
-- training_blocks.grace_days (migration 20260523112416) era DEFAULT 7. Le
-- allocations correlate hanno valid_until = block.end_date + grace_days.
-- Il backend trigger validate_booking_block_allocation accetta una
-- prenotazione solo se valid_until >= scheduled_at::date.
--
-- Specifica utente: "cliente nell'ultima settimana del blocco può
-- prenotare fino a 2 settimane nel futuro" → richiede grace di almeno
-- 14 giorni così quando now = end_date - 7, il cliente arriva fino a
-- now + 14 = end_date + 7 (entro grace 14 = end_date + 14).
--
-- ## Cosa fa questa migration
-- 1. Cambia DEFAULT di training_blocks.grace_days da 7 a 14 (impatta
--    i blocchi futuri creati da `ensure_client_block_state`, auto-renew
--    pg_cron, manual coach insert ecc.)
-- 2. UPDATE in-place i blocchi attivi esistenti: grace_days da 7 a 14
--    SE il blocco è ancora "future" (end_date >= today). Per i blocchi
--    già completati il valore è irrilevante.
-- 3. Backfill block_allocations.valid_until aggiungendo 7 giorni a quelle
--    che hanno valid_until = end_date + 7 (= grace originale). Salta
--    quelle già extended (es. da Booster acquisti) per non scivolare.
--
-- ## Sicurezza/idempotency
-- - ADD COLUMN IF NOT EXISTS già garantito da 20260523112416 → la column
--   esiste. ALTER COLUMN ... SET DEFAULT è idempotente.
-- - UPDATE WHERE filtra preservando le grace_days già custom (es. coach
--   che ha settato 30 giorni manualmente). Solo grace_days = 7 (= valore
--   default originale) viene aggiornato a 14.
-- - Stesso filtro su valid_until: aggiorno solo dove `valid_until =
--   block.end_date + 7 days` (= grace originale di fabbrica). Booster
--   pack o custom valid_until restano intatti.
-- ==========================================================================

-- 1. Cambia DEFAULT
ALTER TABLE public.training_blocks
  ALTER COLUMN grace_days SET DEFAULT 14;

-- 2. UPDATE blocchi attivi esistenti che hanno grace_days = 7 (default
--    originale) e non sono ancora completati.
UPDATE public.training_blocks
   SET grace_days = 14
 WHERE grace_days = 7
   AND end_date >= CURRENT_DATE;

-- 3. Backfill block_allocations.valid_until per i blocchi che hanno
--    appena ricevuto la grace 14 estesa. Aggiungo 7 giorni alla
--    valid_until corrente SOLO se è uguale a end_date + 7 (= il
--    valore vecchio "auto"). Eventuali Booster con valid_until più
--    lungo restano invariati.
UPDATE public.block_allocations ba
   SET valid_until = ba.valid_until + INTERVAL '7 days'
  FROM public.training_blocks tb
 WHERE ba.block_id = tb.id
   AND tb.grace_days = 14
   AND tb.end_date >= CURRENT_DATE
   AND ba.valid_until = tb.end_date + INTERVAL '7 days';

COMMENT ON COLUMN public.training_blocks.grace_days IS
  'Numero di giorni di grace dopo end_date in cui le sessioni residue '
  'del blocco possono ancora essere prenotate. Default 14 (era 7 fino '
  'a migration 20260527150000) per supportare il flow "lookahead ultima '
  'settimana" del cliente. Valore custom per blocco scelto dal coach.';
