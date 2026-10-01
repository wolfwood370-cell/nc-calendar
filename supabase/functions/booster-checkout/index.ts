import Stripe from "npm:stripe@^14.0.0";
import { requireAuth, assertUuid } from "../_shared/auth.ts";
import { boosterPackTitle, boosterPurchase, romeDate } from "../_shared/booster-validity.ts";
import { jsonResponse } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

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

    // Wave 7 P4: max 5 sessioni di checkout / 5 min per utente. Una
    // creazione legittima è rara (1-2 al mese); il limite protegge da
    // automated abuse di Stripe Checkout sessions (DoS + log spam).
    const allowed = await checkRateLimit(admin, {
      userId,
      action: "booster-checkout",
      limit: 5,
      windowSeconds: 300,
    });
    if (!allowed) {
      return jsonResponse({ error: "Troppe richieste, riprova tra qualche minuto." }, 429, req);
    }
    // Wave 7 P2: DoS guard — cap body BEFORE parsing JSON.
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > 10_000) {
      return jsonResponse({ error: "Payload troppo grande" }, 413, req);
    }
    const rawBody = await req.text();
    if (rawBody.length > 10_000) {
      return jsonResponse({ error: "Payload troppo grande" }, 413, req);
    }
    const body = JSON.parse(rawBody);
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

    // P7 (Wave 5): `||` accettava silenziosamente "" come fallback all'utente
    // corrente. Usiamo `??` + check esplicito stringa non vuota.
    const targetClientId =
      typeof requested_client_id === "string" && requested_client_id.trim().length > 0
        ? requested_client_id
        : userId;
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

    // Passata 06: chi compra e fino a quando valgono i crediti, con la regola
    // dello Store (_shared/booster-validity.ts, la stessa che la pagina
    // mostra prima di pagare): cliente attivo, percorso fisso senza
    // pack_label o abbonamento, e un blocco in corso oggi a Roma. La
    // scadenza è l'ultimo istante a Roma della fine del blocco, o di 30
    // giorni dopo se il blocco sta per finire e il percorso continua.
    const [{ data: buyer, error: buyerErr }, { data: blocks, error: blocksErr }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("path_type, status, pack_label, auto_renew_blocks")
          .eq("id", targetClientId)
          .maybeSingle(),
        admin
          .from("training_blocks")
          .select("id, start_date, end_date, status, sequence_order")
          .eq("client_id", targetClientId)
          .is("deleted_at", null),
      ]);
    if (buyerErr) throw new Error(`profiles: ${buyerErr.message}`);
    if (blocksErr) throw new Error(`training_blocks: ${blocksErr.message}`);
    const decision = buyer ? boosterPurchase(buyer, blocks ?? [], romeDate(new Date())) : null;
    if (!decision) {
      return jsonResponse(
        { error: "Al momento non puoi acquistare Booster: serve un blocco in corso." },
        400,
        req,
      );
    }

    // M7 (FULL_APP_AUDIT.md): pricing lives in the booster_packs table now.
    // The request can carry an optional `currency` parameter so a future
    // non-EUR market is a data change rather than a code change. Default
    // stays "eur" so existing clients work unchanged.
    const requestedCurrencyRaw: string =
      typeof body.currency === "string" && body.currency.length > 0
        ? body.currency.toLowerCase()
        : "eur";
    // L2 (audit Wave 3): currency allowlist — prevents arbitrary
    // attacker-chosen values from polluting query/logs.
    const CURRENCY_ALLOWLIST = ["eur", "usd"] as const;
    if (!(CURRENCY_ALLOWLIST as readonly string[]).includes(requestedCurrencyRaw)) {
      return jsonResponse({ error: "Currency non supportata" }, 400, req);
    }
    const requestedCurrency = requestedCurrencyRaw;

    // select("*"): col giro del server arriva anche title, il nome su Stripe.
    const { data: pack, error: packErr } = await admin
      .from("booster_packs")
      .select("*")
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
              // Il titolo del pacchetto, come nello Store: è anche quello
              // che il cliente legge nella ricevuta.
              name: `Booster: ${boosterPackTitle(pack)}`,
            },
            unit_amount: amount_cents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      // Il ritorno allo Store, con la tipologia; il segnaposto della sessione
      // (scritto così, senza $) lo sostituisce Stripe con il suo id, che lo
      // Store cerca fra gli acquisti mentre aspetta il webhook.
      success_url: `${origin}/client/store?booster=success&type=${eventTypeId}&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/client/store?booster=cancel&type=${eventTypeId}`,
      metadata: {
        client_id: targetClientId,
        package_type,
        quantity: quantity.toString(),
        event_type_title,
        event_type_id: eventTypeId,
        expires_at: decision.expiresAt,
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
});
