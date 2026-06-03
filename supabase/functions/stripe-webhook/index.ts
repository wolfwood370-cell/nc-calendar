import Stripe from "npm:stripe@^14.0.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response("No signature", { status: 400 });
    }

    const body = await req.text();
    let event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, endpointSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Webhook signature verification failed: ${message}`);
      return new Response(`Webhook Error: ${message}`, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const metadata = session.metadata || {};
      const { client_id, package_type, quantity, event_type_title, expires_at } = metadata;

      if (!client_id || !event_type_title || !expires_at || !quantity) {
        console.error("Missing required metadata", metadata);
        return new Response("Missing metadata", { status: 400 });
      }

      // Find the coach for this client
      const { data: profile } = await adminClient
        .from("profiles")
        .select("coach_id")
        .eq("id", client_id)
        .single();

      if (!profile || !profile.coach_id) {
        console.error("Client has no coach");
        return new Response("Client has no coach", { status: 400 });
      }

      // A1 (audit 2026-06-03): preferiamo event_type_id passato nel metadata
      // dal booster-checkout (risolto al momento del checkout col coach
      // corretto). Fallback a lookup per nome SOLO per sessioni legacy
      // in-flight create prima di questo deploy. Rimosso il fallback
      // "primo event_type del coach": meglio rifiutare l'evento (Stripe
      // ritenta) che accreditare la tipologia sbagliata.
      const metadataEventTypeId = (metadata as { event_type_id?: string }).event_type_id;
      let eventType: { id: string } | null = null;

      if (metadataEventTypeId) {
        const { data: byId } = await adminClient
          .from("event_types")
          .select("id, coach_id")
          .eq("id", metadataEventTypeId)
          .maybeSingle();
        // verifica che l'event_type appartenga al coach del cliente
        if (byId && (byId as { coach_id: string }).coach_id === profile.coach_id) {
          eventType = { id: (byId as { id: string }).id };
        } else {
          console.error("stripe-webhook: metadata event_type_id mismatch", {
            metadata_event_type_id: metadataEventTypeId,
            coach_id: profile.coach_id,
          });
        }
      }

      if (!eventType) {
        const { data: byName } = await adminClient
          .from("event_types")
          .select("id")
          .eq("coach_id", profile.coach_id)
          .eq("name", event_type_title)
          .limit(1)
          .maybeSingle();
        eventType = byName as { id: string } | null;
      }

      if (!eventType) {
        console.error("stripe-webhook: event_type non risolto", {
          coachId: profile.coach_id,
          event_type_title,
          metadata_event_type_id: metadataEventTypeId ?? null,
          stripe_session: session.id,
        });
        // 400 → Stripe non ritenta. Stato corretto: il pagamento esiste
        // ma il credito non può essere assegnato senza intervento manuale.
        return new Response("Event type not resolved", { status: 400 });
      }

      // Insert extra_credits (idempotent via UNIQUE on stripe_payment_id)
      const { error: insertError } = await adminClient.from("extra_credits").insert({
        client_id,
        event_type_id: eventType.id,
        quantity: parseInt(quantity, 10),
        quantity_booked: 0,
        price_paid: session.amount_total ? session.amount_total / 100 : 0,
        expires_at,
        stripe_payment_id: session.id,
      });

      if (insertError) {
        // Postgres unique_violation = 23505 → duplicate Stripe event, already processed.
        if (insertError.code === "23505") {
          console.log("Payment already processed", { stripe_payment_id: session.id });
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        console.error("Failed to insert extra_credits:", insertError);
        return new Response("Failed to insert extra credits", { status: 500 });
      }

      // LOW-1 (audit 2026-05-26): log strutturato invece di interpolazione
      // libera. Allinea il formato a "Payment already processed" sopra e
      // permette a un futuro log filter di mascherare il campo client_id
      // in modo consistente (paid+client_id pairing è rumore in produzione).
      console.log("stripe-webhook: booster credits granted", {
        client_id,
        quantity,
        stripe_payment_id: session.id,
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
