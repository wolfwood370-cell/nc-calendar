import Stripe from "npm:stripe@^14.0.0";
import { requireAuth } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse("ok");
  }

  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof Response) return authResult;
    
    const { userId, userClient } = authResult;
    const body = await req.json();
    const package_type = body.package_type;
    const requested_client_id = body.client_id;

    // Use requested client_id if provided (e.g. coach buying for client), 
    // otherwise default to the caller's userId.
    const targetClientId = requested_client_id || userId;

    let amount_cents = 0;
    let quantity = 1;
    let event_type_title = "";

    switch (package_type) {
      case "single":
        amount_cents = 4000;
        quantity = 1;
        event_type_title = "PT";
        break;
      case "pack":
        amount_cents = 9900;
        quantity = 3;
        event_type_title = "PT";
        break;
      case "triage":
        amount_cents = 7500;
        quantity = 1;
        event_type_title = "Triage";
        break;
      default:
        return jsonResponse({ error: "Pacchetto non valido." }, 400);
    }

    // Fetch active training_block end_date
    const today = new Date().toISOString().slice(0, 10);
    const { data: block, error: blockError } = await userClient
      .from("training_blocks")
      .select("end_date")
      .eq("client_id", targetClientId)
      .lte("start_date", today)
      .gte("end_date", today)
      .is("deleted_at", null)
      .order("end_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (blockError || !block) {
      return jsonResponse(
        { error: "Nessun percorso attivo trovato. Devi avere un abbonamento in corso per acquistare i Booster." }, 
        400
      );
    }

    let expiresAt = new Date(block.end_date);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays < 7) {
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    const origin = req.headers.get("origin") || "https://your-domain.com";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Booster: ${package_type === "pack" ? "Pack 3 Sessioni" : package_type === "single" ? "Singola Sessione" : "Triage"}`,
            },
            unit_amount: amount_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/client?booster=success`,
      cancel_url: `${origin}/client/store?booster=cancel`,
      metadata: {
        client_id: targetClientId,
        package_type,
        quantity: quantity.toString(),
        event_type_title,
        expires_at: expiresAt.toISOString(),
      },
    });

    return jsonResponse({ checkout_url: session.url });
  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    return jsonResponse({ error: error.message || "Errore interno del server" }, 500);
  }
});
