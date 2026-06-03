import Stripe from "npm:stripe@^14.0.0";
import { requireAuth, assertUuid } from "../_shared/auth.ts";
import { jsonResponse } from "../_shared/cors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonResponse("ok", 200, req);
  }

  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof Response) return authResult;

    const { userId, admin } = authResult;
    const body = await req.json();
    // MED-B4: type guard sul package_type prima di propagarlo a una query
    // .eq() e a una stringa template HTML. Senza il check, un payload
    // malformato (number, object, null) sarebbe accettato silenziosamente e
    // matcherebbe 0 row, ritornando un 404 confuso invece di un 400 chiaro.
    const package_type: string | null =
      typeof body.package_type === "string" ? body.package_type : null;
    if (!package_type) {
      return jsonResponse({ error: "Invalid or missing package_type" }, 400, req);
    }
    const requested_client_id = body.client_id;

    // Use requested client_id if provided (e.g. coach buying for client),
    // otherwise default to the caller's userId.
    const targetClientId = requested_client_id || userId;
    // Audit 2026-05-22 M2: validate the resolved id upfront so a
    // malformed payload returns a clean 400 instead of a 22P02 from
    // the downstream UPDATE on bookings/extra_credits.
    try {
      assertUuid(targetClientId, "client_id");
    } catch (e) {
      return jsonResponse(
        { error: e instanceof Error ? e.message : "Invalid client_id" },
        400,
        req,
      );
    }

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
        return jsonResponse({ error: "Permesso negato" }, 403, req);
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
      return jsonResponse({ error: "Errore lettura pacchetto." }, 500, req);
    }
    if (!pack) {
      return jsonResponse({ error: "Pacchetto non valido." }, 400, req);
    }

    const amount_cents = pack.amount_cents as number;
    const quantity = pack.quantity as number;
    const event_type_title = pack.event_type_title as string;
    const currency = pack.currency as string;

    // A1 (audit 2026-06-03): risolviamo event_type_id al checkout (coach
    // del target + nome esatto). In assenza di match rifiutiamo SUBITO con
    // 400 invece di lasciare che il webhook scelga "il primo event_type
    // del coach" — quel fallback poteva accreditare crediti su tipologie
    // arbitrarie se il coach aveva rinominato la sessione tra checkout e
    // webhook. Meglio fallire il checkout (Stripe non addebita) che
    // accreditare la tipologia sbagliata.
    const { data: targetProfileForType } = await admin
      .from("profiles")
      .select("coach_id")
      .eq("id", targetClientId)
      .maybeSingle();
    const targetCoachIdForType =
      (targetProfileForType as { coach_id?: string | null } | null)?.coach_id ?? null;
    if (!targetCoachIdForType) {
      return jsonResponse({ error: "Nessun coach assegnato." }, 400, req);
    }
    const { data: resolvedType } = await admin
      .from("event_types")
      .select("id")
      .eq("coach_id", targetCoachIdForType)
      .eq("name", event_type_title)
      .limit(1)
      .maybeSingle();
    if (!resolvedType?.id) {
      console.error("booster-checkout: event_type not found", {
        coach_id: targetCoachIdForType,
        event_type_title,
        package_type,
      });
      return jsonResponse(
        { error: "Tipologia di sessione non disponibile per questo coach." },
        400,
        req,
      );
    }
    const eventTypeId = resolvedType.id as string;

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
        req,
      );
    }

    const expiresAt = new Date(allocation.valid_until);
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
        event_type_id: eventTypeId,
        expires_at: expiresAt.toISOString(),
      },
    });

    return jsonResponse({ checkout_url: session.url }, 200, req);
  } catch (error) {
    // A4 (audit 2026-06-03): non propagare al client il testo dell'errore
    // (può contenere dettagli interni Stripe / network). Log dettagliato
    // lato server, messaggio generico al frontend.
    console.error("booster-checkout error:", error);
    return jsonResponse(
      { error: "Errore durante la creazione del checkout. Riprova più tardi." },
      500,
      req,
    );
  }
