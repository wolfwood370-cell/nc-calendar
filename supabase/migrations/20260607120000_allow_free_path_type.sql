-- Ammette 'free' in profiles.path_type (Cliente Libero: Free Session / PT Pack).
-- Modello deciso 2026-06-07: i clienti "leggeri" sono path_type='free' + extra_credits
-- (nessun training_block). Il codice (trainer.clients.index.tsx, trainer.clients.$id.tsx)
-- scrive gia' 'free', ma il CHECK originale (20260512080502) ammetteva solo
-- ('fixed','recurring') -> l'UPDATE veniva rifiutato dal DB (errore 23514 check_violation),
-- finendo in un toast generico "assegnazione iniziale non riuscita" e lasciando il cliente
-- a path_type='fixed' (default).
--
-- Idempotente: drop + re-add dello stesso constraint (riapplicabile senza errori).
-- Le funzioni che processano i blocchi filtrano su path_type='recurring'
-- (pg_cron auto-renew, repair_blocks_alignment) -> 'free' resta correttamente escluso.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_path_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_path_type_check CHECK (path_type IN ('fixed','recurring','free'));
