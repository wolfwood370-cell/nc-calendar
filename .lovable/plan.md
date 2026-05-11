## Obiettivo

Permettere ai clienti registrati con email/password di collegare il proprio account Google, nonostante "Allow manual linking" non sia esposto nel pannello Lovable Cloud.

## Come funziona (la soluzione)

Supabase collega **automaticamente** due identità (email + Google) quando:

1. L'email dell'account Google è **identica** a quella dell'account email/password esistente
2. L'email è **verificata** (Google le fornisce sempre verificate)

Quindi non serve `linkIdentity()`: basta che l'utente faccia logout e poi login con Google usando la stessa email. Supabase riconosce l'utente esistente e aggiunge l'identità Google al suo account (stesso `user.id`, stesso profilo, stessi dati).

## Modifiche al codice

### `src/routes/client.settings.tsx` — sezione "Integrazioni"

**Caso A — Google già collegato** (rilevato da `app_metadata.providers`):

- Mostra card con check verde: "Account Google collegato" (come ora)

**Caso B — Google non collegato:**

- Sostituire il pulsante attuale (che chiama `linkIdentity` e fallisce) con una card informativa che spiega il flusso in 3 step:
  1. "Esci dal tuo account"
  2. "Nella schermata di accesso, tocca **Continua con Google**"
  3. "Usa la stessa email (`<email utente>`) — il tuo account verrà collegato automaticamente"
- Pulsante: **"Esci e collega Google"** che chiama `signOut()` e reindirizza a `/auth`
- Tooltip/nota piccola: "I tuoi dati, prenotazioni e blocchi rimarranno invariati."

### Nessuna altra modifica richiesta

- `src/routes/auth.tsx` ha già il pulsante "Continua con Google" funzionante
- Il trigger `handle_new_user` non scatta perché l'utente esiste già — Supabase aggiunge solo l'identità
- Profilo e ruolo restano intatti

## Limite da comunicare

Se l'email Google è **diversa** da quella di registrazione, il login Google verrà bloccato dal trigger `handle_new_user` (richiede invito). In quel caso l'unica soluzione è che il cliente usi un indirizzo Google con la stessa email dell'invito, oppure che il coach invii un nuovo invito a quell'indirizzo Google.

## File modificati

- `src/routes/client.settings.tsx` (solo la sezione "Integrazioni" + handler)
