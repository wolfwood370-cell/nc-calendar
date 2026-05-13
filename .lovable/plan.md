
# Piano: Endpoint Stripe Webhook + Checkout Crediti Booster

Creo l'infrastruttura backend minima per il flusso "Crediti Booster" usando l'integrazione Stripe BYOK già configurata (`STRIPE_SECRET_KEY` è già presente nei secrets).

## 1. Endpoint pubblico Webhook Stripe

**File:** `src/routes/api/public/stripe-webhook.ts`

Server route TanStack Start (`createFileRoute`) che:
- Riceve `POST` da Stripe
- Verifica la firma con `stripe.webhooks.constructEvent` usando `STRIPE_WEBHOOK_SECRET`
- Gestisce l'evento `checkout.session.completed`:
  - Legge `client_id`, `event_type_id`, `quantity`, `package_id` dai `metadata`
  - Inserisce una riga in `extra_credits` (via `supabaseAdmin`, bypass RLS)
  - Salva `stripe_payment_id` per idempotenza (controllo duplicati prima di inserire)
- Risponde `200 ok` o `400` su firma non valida

**URL finale da incollare nella dashboard Stripe:**
```
https://nc-calendar.lovable.app/api/public/stripe-webhook
```
(URL stabile alternativo: `https://project--81e402d5-14ed-48a5-938a-c89e014f695a.lovable.app/api/public/stripe-webhook`)

## 2. Server function per creare la sessione di checkout

**File:** `src/lib/booster-checkout.functions.ts`

`createServerFn` protetta con `requireSupabaseAuth` che:
- Valida input con Zod: `{ packageId: 'single' | 'pack3' | 'triage' }`
- Mappa il `packageId` a prezzo / quantità / nome (definiti server-side per sicurezza — il client non può manipolare il prezzo)
- Chiama `stripe.checkout.sessions.create` in modalità `payment` con:
  - `success_url`: `/client?booster=success`
  - `cancel_url`: `/client/store?booster=cancel`
  - `metadata`: `{ client_id, package_id, quantity, event_type_id }`
- Ritorna `{ url }` per redirect

## 3. Aggiornamento UI Store

**File:** `src/routes/client.store.tsx`

Sostituisco `handlePurchase` (toast mock) con:
- Chiamata a `createBoosterCheckout` server fn
- Redirect a `data.url` (Stripe Checkout)
- Toast d'errore se fallisce

## 4. Secret necessario

Devo richiedere `STRIPE_WEBHOOK_SECRET` (lo otterrai dopo aver creato il webhook nella dashboard Stripe — Stripe lo mostra subito sotto "Signing secret"). `STRIPE_SECRET_KEY` è già presente.

## Flusso utente

```text
Client app → "Acquista Ora"
  → server fn crea Checkout Session
  → redirect Stripe Checkout
  → utente paga
  → Stripe → POST /api/public/stripe-webhook
  → verifica firma + INSERT in extra_credits
  → utente torna su /client?booster=success
```

## Cosa devi fare tu nella dashboard Stripe

1. **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://nc-calendar.lovable.app/api/public/stripe-webhook`
3. Eventi da ascoltare: `checkout.session.completed`
4. Copia il **Signing secret** (`whsec_...`) e incollalo quando ti chiederò `STRIPE_WEBHOOK_SECRET`

## Note tecniche

- L'endpoint sta sotto `/api/public/*` per bypassare auth sul sito pubblicato (richiesto da Stripe)
- La sicurezza è garantita dalla verifica della firma HMAC — nessun altro può scriverci
- `stripe_payment_id` UNIQUE lookup → idempotenza se Stripe rimanda lo stesso evento
- Uso Stripe SDK Node compatibile con il runtime Worker Cloudflare
