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
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      
      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false }
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

      // Lookup event_type_id by name (e.g. "PT" or "Triage")
      let { data: eventType } = await adminClient
        .from("event_types")
        .select("id")
        .eq("coach_id", profile.coach_id)
        .ilike("name", `%${event_type_title}%`)
        .limit(1)
        .maybeSingle();

      // Fallback: pick the first available event_type for this coach
      if (!eventType) {
        console.warn(`Event type "${event_type_title}" not found for coach ${profile.coach_id}, using fallback`);
        const { data: fallback } = await adminClient
          .from("event_types")
          .select("id")
          .eq("coach_id", profile.coach_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        eventType = fallback;
      }

      if (!eventType) {
        console.error("No event_types exist for coach:", profile.coach_id);
        return new Response("No event types available", { status: 400 });
      }

      // Insert extra_credits (idempotent via UNIQUE on stripe_payment_id)
      const { error: insertError } = await adminClient.from("extra_credits").insert({
        client_id,
        event_type_id: eventType.id,
        quantity: parseInt(quantity, 10),
        quantity_booked: 0,
        price_paid: session.amount_total ? session.amount_total / 100 : 0,
        expires_at,
        stripe_payment_id: session.id
      });

      if (insertError) {
        // Postgres unique_violation = 23505 → duplicate Stripe event, already processed.
        if ((insertError as any).code === "23505") {
          console.log("Payment already processed", { stripe_payment_id: session.id });
          return new Response(JSON.stringify({ received: true, duplicate: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        console.error("Failed to insert extra_credits:", insertError);
        return new Response("Failed to insert extra credits", { status: 500 });
      }

      console.log(`Successfully added ${quantity} booster credits for client ${client_id}`);
    }

    return new Response(JSON.stringify({ received: true }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    console.error("Webhook processing failed:", err);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
