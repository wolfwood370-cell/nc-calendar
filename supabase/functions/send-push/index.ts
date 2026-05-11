// Edge function: invia Web Push notifications a tutti i device di un profilo.
import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  profile_id: string;
  title: string;
  body: string;
  url?: string;
}

interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:nctrainingsystems@gmail.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const { profile_id, title, body, url } = (await req.json()) as Payload;
    if (!profile_id || !title) return jsonResponse({ error: "Missing fields" }, 400);
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return jsonResponse({ error: "VAPID keys not configured" }, 500);
    }

    // Authorization: caller may push to self, OR coach/admin may push to their managed clients.
    if (profile_id !== auth.userId) {
      if (auth.role !== "coach" && auth.role !== "admin") {
        return jsonResponse({ error: "Permesso negato" }, 403);
      }
      if (auth.role === "coach") {
        const { data: target } = await auth.admin
          .from("profiles")
          .select("coach_id")
          .eq("id", profile_id)
          .maybeSingle();
        const coachId = (target as { coach_id?: string } | null)?.coach_id;
        if (coachId !== auth.userId) {
          return jsonResponse({ error: "Permesso negato" }, 403);
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
          console.error("push failed", row.id, status, e);
          return { id: row.id, ok: false, status };
        }
      }),
    );

    return jsonResponse({ ok: true, sent: results.length, results });
  } catch (e) {
    console.error("send-push error", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
