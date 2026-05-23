## Plan: applicare migration `notifications`

### 1. Migration SQL
Creare il file `supabase/migrations/20260524100000_notifications.sql` con lo SQL fornito, che:
- Crea la tabella `public.notifications` (`id`, `recipient_id` → `profiles(id)` ON DELETE CASCADE, `type`, `payload` jsonb, `read_at`, `created_at`).
- Aggiunge indici su `(recipient_id, created_at DESC)` e parziale su unread.
- Abilita RLS con policy SELECT per il solo `recipient_id = auth.uid()`.
- Imposta `REPLICA IDENTITY FULL` e aggiunge la tabella a `supabase_realtime` (idempotente).
- Crea le RPC SECURITY DEFINER `mark_notification_read(uuid)` e `mark_all_notifications_read()`, con EXECUTE revocato a PUBLIC/anon e concesso solo ad `authenticated`.

Eseguo la migration tramite il tool `supabase--migration` (richiederà la tua approvazione).

### 2. Regenerazione `types.ts`
Dopo l'approvazione/esecuzione della migration, il file `src/integrations/supabase/types.ts` verrà aggiornato per includere:
- `Tables.notifications` (Row / Insert / Update).
- `Functions.mark_notification_read` (`Args: { p_id: string }`, `Returns: void`).
- `Functions.mark_all_notifications_read` (`Args: Record<string, never>`, `Returns: void`).

Nota: nessun policy INSERT/UPDATE/DELETE viene aggiunta — le scritture devono passare da Edge Function service-role o dalle RPC, coerentemente con il commento sulla tabella.

### Nessun altro file viene toccato
Niente modifiche a route, componenti o Edge Functions in questo passo. Eventuali consumer (badge notifiche, lista, realtime channel) saranno un task successivo.