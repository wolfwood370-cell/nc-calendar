// Edge function: invia Web Push notifications a tutti i device di un profilo.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, assertUuid } from "../_shared/auth.ts";
import { isVapidConfigured, sendPushToSubscriptions } from "../_shared/push.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

interface Payload {
  profile_id: string;
  title: string;
  body: string;
  url?: string;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, req);

  // Wave 7 P1: pass requiredRoles so auth.role is populated — otherwise the
  // coach-managed-client branch below is unreachable (role is always null).
  const auth = await requireAuth(req, ["client", "coach", "admin"]);
  if (auth instanceof Response) return auth;

  // Wave 7 P5: max 30 push / minuto per chiamante (coach può legittimamente
  // notificare più clienti in batch, ma 30/min è già molto generoso).
  const allowed = await checkRateLimit(auth.admin, {
    userId: auth.userId,
    action: "send-push",
    limit: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return jsonResponse({ error: "Troppe notifiche inviate, riprova tra poco." }, 429, req);
  }

  try {
    // Wave 7 P2: DoS guard — cap body BEFORE parsing JSON.
    const contentLength = Number(req.headers.get("content-length") ?? "0");
    if (contentLength > 10_000) {
      return jsonResponse({ error: "Payload troppo grande" }, 413, req);
    }
    const rawBody = await req.text();
    if (rawBody.length > 10_000) {
      return jsonResponse({ error: "Payload troppo grande" }, 413, req);
    }
    const { profile_id, title, body, url } = JSON.parse(rawBody) as Payload;
    if (!profile_id || !title) return jsonResponse({ error: "Missing fields" }, 400, req);
    try {
      assertUuid(profile_id, "profile_id");
    } catch (e) {
      return jsonResponse(
        { error: e instanceof Error ? e.message : "Invalid profile_id" },
        400,
        req,
      );
    }

    // Wave 4 (audit 2026-06-03) — N1: cap free-text fields delivered to the
    // browser Notification API to prevent abuse via oversize/binary payloads.
    if (typeof title !== "string" || title.length === 0 || title.length > 200) {
      return jsonResponse({ error: "Invalid title" }, 400, req);
    }
    if (body !== undefined && (typeof body !== "string" || body.length > 500)) {
      return jsonResponse({ error: "Invalid body" }, 400, req);
    }

    // Wave 4 — N1: validate url. Service worker click-handler navigates to
    // this value; a `javascript:` or `data:` URL would be a stored-XSS sink
    // controlled by a coach. Accept only relative app paths or https URLs
    // on our own published origins.
    let safeUrl = "/";
    if (url !== undefined && url !== null && url !== "") {
      if (typeof url !== "string" || url.length > 2048) {
        return jsonResponse({ error: "Invalid url" }, 400, req);
      }
      if (url.startsWith("/") && !url.startsWith("//")) {
        safeUrl = url;
      } else {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "https:") {
            return jsonResponse({ error: "Invalid url protocol" }, 400, req);
          }
          // Only same-app hostnames (mirrors cors.ts allowlist).
          const allowedHosts = new Set([
            "nc-calendar.lovable.app",
            "id-preview--81e402d5-14ed-48a5-938a-c89e014f695a.lovable.app",
            "project--81e402d5-14ed-48a5-938a-c89e014f695a.lovable.app",
            "project--81e402d5-14ed-48a5-938a-c89e014f695a-dev.lovable.app",
          ]);
          if (!allowedHosts.has(parsed.hostname)) {
            return jsonResponse({ error: "Invalid url host" }, 400, req);
          }
          safeUrl = parsed.toString();
        } catch {
          return jsonResponse({ error: "Invalid url" }, 400, req);
        }
      }
    }

    if (!isVapidConfigured()) {
      return jsonResponse({ error: "VAPID keys not configured" }, 500, req);
    }


    // Authorization: caller may push to self, OR coach/admin may push to their managed clients.
    if (profile_id !== auth.userId) {
      if (auth.role !== "coach" && auth.role !== "admin") {
        return jsonResponse({ error: "Permesso negato" }, 403, req);
      }
      if (auth.role === "coach") {
        const { data: target } = await auth.admin
          .from("profiles")
          .select("coach_id")
          .eq("id", profile_id)
          .maybeSingle();
        const coachId = (target as { coach_id?: string } | null)?.coach_id;
        if (coachId !== auth.userId) {
          return jsonResponse({ error: "Permesso negato" }, 403, req);
        }
      }
    }

    const { data: subs, error } = await auth.admin
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("profile_id", profile_id);
    if (error) throw error;

    const payload = JSON.stringify({ title, body: body ?? "", url: safeUrl });
    const results = await sendPushToSubscriptions(
      (subs ?? []) as { id: string; subscription: unknown }[],
      payload,
      auth.admin as unknown as Parameters<typeof sendPushToSubscriptions>[2],
      "push failed",
    );


    return jsonResponse({ ok: true, sent: results.length, results }, 200, req);
  } catch (e) {
    // M6 (audit 2026-06-03): non propagare al chiamante il messaggio interno
    // (può echare URL endpoint push o dettagli web-push). Log strutturato
    // lato server, errore generico al client.
    const message = e instanceof Error ? e.message : String(e);
    console.error("send-push error", { message });
    return jsonResponse({ error: "Errore invio notifica push." }, 500, req);
  }
});

