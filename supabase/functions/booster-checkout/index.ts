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

    const { userId, admin } = authResult;
    const body = await req.json();
    const package_type = body.package_type;
    const requested_client_id = body.client_id;

    // Use requested client_id if provided (e.g. coach buying for client),
    // otherwise default to the caller's userId.
    const targetClientId = requested_client_id || userId;

    // C2 (FULL_APP_AUDIT.md): when the caller is buying for someone else
    // than themselves, verify that relationship server-side. Without this
    // check, any authenticated user could pass an arbitrary client_id and
    // have post-payment credits routed to that account (no theft, but
    // attribution fraud and a path to grief other users with credits they
    // didn't ask for). Allowed: the target itself, an admin, or the coach
    // of the target. Mirrors the auth pattern in sync-calendar/index.ts.
    if (targetClientId !== userId) {
      const [{ data: roleRow }, { data: targetProfile }] = await Promise.all([
        admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        admin.from("profiles").select("coach_id").eq("id", targetClientId).maybeSingle(),
      ]);
      const callerRole = (roleRow as { role?: string } | null)?.role ?? null;
      const targetCoachId =
        (targetProfile as { coach_id?: string | null } | null)?.coach_id ?? null;
      if (callerRole !== "admin" && targetCoachId !== userId) {
        console.warn("booster-checkout: forbidden client_id attribution", {
          caller: userId,
          requested_client_id: targetClientId,
          caller_role: callerRole,
          target_coach: targetCoachId,
        });
        return jsonResponse({ error: "Permesso negato" }, 403);
      }
    }

    // M7 (FULL_APP_AUDIT.md): pricing lives in the booster_packs table now.
    // The request can carry an optional `currency` parameter so a future
    // non-EUR market is a data change rather than a code change. Default
    // stays "eur" so existing clients work unchanged.
    const requestedCurrency: string =
      typeof body.currency === "string" && body.currency.length > 0
        ? body.currency.toLowerCase()
        : "eur";

    const { data: pack, error: packErr } = await admin
      .from("booster_packs")
      .select("amount_cents, currency, quantity, event_type_title")
      .eq("package_type", package_type)
      .eq("currency", requestedCurrency)
      .eq("active", true)
      .maybeSingle();

    if (packErr) {
      console.error("booster-checkout: booster_packs lookup failed", packErr);
      return jsonResponse({ error: "Errore lettura pacchetto." }, 500);
    }
    if (!pack) {
      return jsonResponse({ error: "Pacchetto non valido." }, 400);
    }

    const amount_cents = pack.amount_cents as number;
    const quantity = pack.quantity as number;
    const event_type_title = pack.event_type_title as string;
    const currency = pack.currency as string;

    // Fetch active block_allocation valid_until via inner join
    const { data: allocation, error: allocError } = await admin
      .from("block_allocations")
      .select(
        `
        valid_until,
        training_blocks!inner (
          client_id,
          deleted_at
        )
      `,
      )
      .eq("training_blocks.client_id", targetClientId)
      .is("training_blocks.deleted_at", null)
      .gte("valid_until", new Date().toISOString())
      .order("valid_until", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (allocError || !allocation || !allocation.valid_until) {
      return jsonResponse(
        {
          error:
            "Nessun percorso attivo trovato. Devi avere un abbonamento in corso per acquistare i Booster.",
        },
        400,
      );
    }

    let expiresAt = new Date(allocation.valid_until);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    if (diffDays < 7) {
      expiresAt.setDate(expiresAt.getDate() + 30);
    }

    // H1 (FULL_APP_AUDIT.md): the previous logic trusted the request's
    // Origin/Referer header to build success_url and cancel_url. An
    // attacker could pass Origin: https://attacker.com and end up with a
    // Stripe checkout session that redirects to their phishing page after
    // payment. Now: whitelist origins (env-configurable for preview
    // deploys), fall back to the production URL if the header doesn't
    // match any entry.
    const PROD_ORIGIN = "https://nc-calendar.lovable.app";
    const allowedExtra = (Deno.env.get("ALLOWED_ORIGIN") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowedOrigins = new Set([PROD_ORIGIN, ...allowedExtra]);
    const reqOrigin =
      req.headers.get("origin") ?? req.headers.get("referer")?.replace(/\/$/, "") ?? "";
    const origin = allowedOrigins.has(reqOrigin) ? reqOrigin : PROD_ORIGIN;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
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
