// Edge function: invia Web Push notifications a tutti i device di un profilo.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  profile_id: string;
  title: string;
  body: string;
  url?: string;
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:nctrainingsystems@gmail.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { profile_id, title, body, url } = (await req.json()) as Payload;
    if (!profile_id || !title) {
      return new Response(JSON.stringify({ error: "Missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, subscription")
      .eq("profile_id", profile_id);
    if (error) throw error;

    const payload = JSON.stringify({ title, body, url: url ?? "/" });
    const results = await Promise.all(
      (subs ?? []).map(async (row: { id: string; subscription: unknown }) => {
        try {
          // deno-lint-ignore no-explicit-any
          await webpush.sendNotification(row.subscription as any, payload);
          return { id: row.id, ok: true };
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // Subscription scaduta/invalida: rimuoviamola.
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", row.id);
          }
          console.error("push failed", row.id, status, e);
          return { id: row.id, ok: false, status };
        }
      }),
    );

    return new Response(JSON.stringify({ ok: true, sent: results.length, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
