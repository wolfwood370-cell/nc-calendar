import { createFileRoute } from "@tanstack/react-router";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BOOSTER_PACKAGES, type BoosterPackageId } from "@/lib/booster-packages";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripeKey = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
          console.error("[stripe-webhook] env mancanti");
          return new Response("Server misconfigured", { status: 500 });
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return new Response("Missing signature", { status: 400 });
        }

        const rawBody = await request.text();
        const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            webhookSecret,
          );
        } catch (err) {
          console.error("[stripe-webhook] firma non valida:", err);
          return new Response("Invalid signature", { status: 400 });
        }

        if (event.type !== "checkout.session.completed") {
          return new Response("ok", { status: 200 });
        }

        const session = event.data.object as Stripe.Checkout.Session;
        const meta = session.metadata ?? {};
        const clientId = meta.client_id;
        const packageId = meta.package_id as BoosterPackageId | undefined;

        if (!clientId || !packageId || !(packageId in BOOSTER_PACKAGES)) {
          console.error("[stripe-webhook] metadata mancanti", meta);
          return new Response("Missing metadata", { status: 400 });
        }

        const pkg = BOOSTER_PACKAGES[packageId];
        const admin = createClient<Database>(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Idempotenza: se questo payment è già stato registrato, esci.
        const paymentId = session.payment_intent
          ? String(session.payment_intent)
          : session.id;

        const { data: existing } = await admin
          .from("extra_credits")
          .select("id")
          .eq("stripe_payment_id", paymentId)
          .maybeSingle();

        if (existing) {
          return new Response("ok", { status: 200 });
        }

        // Recupera il primo event_type del coach del cliente come fallback.
        // (I crediti booster sono generici PT; più avanti si potrà raffinare.)
        const { data: profile } = await admin
          .from("profiles")
          .select("coach_id")
          .eq("id", clientId)
          .maybeSingle();

        let eventTypeId: string | null = null;
        if (profile?.coach_id) {
          const { data: et } = await admin
            .from("event_types")
            .select("id")
            .eq("coach_id", profile.coach_id)
            .eq("base_type", "PT Session")
            .limit(1)
            .maybeSingle();
          eventTypeId = et?.id ?? null;
        }

        if (!eventTypeId) {
          console.error("[stripe-webhook] event_type PT non trovato per", clientId);
          return new Response("No event type", { status: 200 });
        }

        // Scadenza: 90 giorni dalla data di acquisto (placeholder ragionevole).
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);

        const { error: insertError } = await admin.from("extra_credits").insert({
          client_id: clientId,
          event_type_id: eventTypeId,
          quantity: pkg.quantity,
          quantity_booked: 0,
          price_paid: pkg.amount / 100,
          expires_at: expiresAt.toISOString(),
          stripe_payment_id: paymentId,
        });

        if (insertError) {
          console.error("[stripe-webhook] insert fallita:", insertError);
          return new Response("DB error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
