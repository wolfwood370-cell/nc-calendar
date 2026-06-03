// Edge function: invia Web Push notifications a tutti i device di un profilo.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, assertUuid } from "../_shared/auth.ts";
import { isVapidConfigured, sendPushToSubscriptions } from "../_shared/push.ts";

interface Payload {
  profile_id: string;
  title: string;
  body: string;
  url?: string;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { profile_id, title, body, url } = (await req.json()) as Payload;
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
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
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

    const payload = JSON.stringify({ title, body, url: url ?? "/" });
    const results = await Promise.all(
      (subs ?? []).map(async (row: { id: string; subscription: unknown }) => {
        try {
          await webpush.sendNotification(row.subscription as PushSubscriptionJSON, payload);
          return { id: row.id, ok: true };
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await auth.admin.from("push_subscriptions").delete().eq("id", row.id);
          }
          // L6 (FULL_APP_AUDIT.md): log only the message, not the full error
          // object. The error from web-push can include the response body,
          // which often echoes the push provider endpoint URL — a token-
          // bearing string that should not land in long-lived function logs.
          console.error("push failed", {
            id: row.id,
            status,
            message: e instanceof Error ? e.message : String(e),
          });
          return { id: row.id, ok: false, status };
        }
      }),
    );

    return jsonResponse({ ok: true, sent: results.length, results }, 200, req);
  } catch (e) {
    // Audit 2026-05-22 L1: consistent scrubbing with the inner catch
    // (line 76) — never log the full error object since web-push errors
    // can echo subscription endpoint URLs (browser-specific tokens) in
    // their response body.
    const message = e instanceof Error ? e.message : String(e);
    console.error("send-push error", { message });
    return jsonResponse({ error: message }, 500, req);
  }
});
