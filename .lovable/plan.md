## Obiettivo
Far funzionare la connessione a Google Calendar eliminando il 403 di Google.

## Problema individuato
La schermata **/trainer/integrations** usa questo flusso:
- `supabase.auth.signInWithOAuth({ provider: "google", ... })`
- scope aggiuntivo: `https://www.googleapis.com/auth/calendar`
- `redirectTo` verso `/trainer/integrations`

Quindi **non** sta usando il broker OAuth Lovable (`oauth.lovable.app/callback`).
Per questo motivo i redirect che hai configurato prima non risolvono questo errore specifico.

## Piano
1. **Correggere la configurazione OAuth Google lato provider**
   - usare come Authorized redirect URI di Google il callback del backend auth:
     `https://mhtiehuxctgcqipleabu.supabase.co/auth/v1/callback`
   - mantenere il Client ID / Client Secret nello stesso provider Google già usato per Calendar.

2. **Verificare i redirect post-login del progetto**
   - controllare che il backend auth accetti come redirect finali almeno:
     - `https://nc-calendar.lovable.app/trainer/integrations`
     - `https://id-preview--81e402d5-14ed-48a5-938a-c89e014f695a.lovable.app/trainer/integrations`
   - questi non sono i redirect di Google, ma le destinazioni finali dopo il callback del backend.

3. **Verificare il consenso OAuth Google**
   - se l’app Google è in stato **Testing**, aggiungere il tuo account in **Test users**
   - confermare che tra gli scope autorizzati ci sia quello Calendar richiesto dal codice
   - se Google blocca ancora l’accesso, è molto probabilmente un problema di consent screen / test users, non di frontend.

4. **Rendere il flusso più chiaro nel codice**
   - aggiornare la UI/integrazione per evitare confusione tra:
     - login Google standard dell’app (`lovable.auth.signInWithOAuth`)
     - connessione Google Calendar con scope Calendar (`supabase.auth.signInWithOAuth`)
   - opzionalmente mostrare un messaggio d’errore più esplicito quando Google rifiuta il consenso.

5. **Validazione finale**
   - testare il collegamento sia su produzione sia su preview
   - verificare che dopo il ritorno su `/trainer/integrations` vengano salvati `provider_token` e `provider_refresh_token` in `integration_settings`.

## Dettagli tecnici
- **Google Authorized redirect URI corretto per questo flusso:**
  `https://mhtiehuxctgcqipleabu.supabase.co/auth/v1/callback`
- **`redirectTo` nel codice:**
  `https://.../trainer/integrations`
  Questo è il redirect finale dell’app, non quello da registrare in Google come callback principale.
- **Motivo del 403 attuale:** Google sta quasi certamente rifiutando il flusso perché il client OAuth / consent screen non corrisponde al flusso diretto usato da `supabase.auth.signInWithOAuth`, oppure l’utente non è autorizzato come test user per uno scope sensibile come Calendar.

## Risultato atteso
Dopo la correzione:
- Google mostra il consenso correttamente
- l’utente torna su `/trainer/integrations`
- il token Google viene salvato e la sincronizzazione Calendar può partire