# supabase/CLAUDE.md — regole per le migrazioni e le edge functions

Il backend e' **gestito da Lovable Cloud**. Qui si **scrivono** le migration; **non** si applicano
da CLI. Vedi anche il [CLAUDE.md root](../CLAUDE.md).

## Workflow (come si applica davvero)
- Le migration sono **append-only** in `supabase/migrations/` e si applicano **solo via Lovable
  Chat**. **MAI** `supabase db push` / `supabase migration up` / Supabase Dashboard.
- Consegna la migration come **prompt per Lovable Chat** (1 prompt = diagnosi + fix + verifica),
  non come comando da eseguire.
- I **tipi TS** li rigenera Lovable dopo l'applicazione.
- Le **edge functions** con cambi *interni* (body/helper/bugfix, senza nuova export/firma) NON
  vengono re-deployate in automatico → chiedi a Lovable il **re-deploy esplicito** della function.

## Idempotenza (obbligatoria)
Ogni migration deve poter essere riapplicata senza errori:
- `DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;`
- `CREATE TABLE/INDEX ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS`.
- `CREATE OR REPLACE FUNCTION/VIEW`.

## Anti-pattern PL/pgSQL noti (gia' costati tempo)
- **`42803`** — window function (LAG/LEAD/ROW_NUMBER) DENTRO un aggregate (bool_and/sum/count):
  spostare la window in una **CTE** separata, poi aggregare nel SELECT esterno.
- **`42702`** — in `RETURNS TABLE(col1, col2, ...)` se il body fa `FOR ... IN SELECT col1, col2
  FROM tabella` con nomi che collidono → "column reference ambiguous". Risolvere qualificando con
  alias di tabella (`tb.col`) oppure usando OUT column con prefisso (`out_col`).

## Sicurezza
- Per fix che richiederebbero superuser su schema `realtime` o simili: accettare il rischio e
  documentare la mitigazione nel prompt a Lovable — **non** proporre workaround via Dashboard.
