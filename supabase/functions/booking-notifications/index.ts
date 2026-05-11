// Edge function: invia notifiche WhatsApp e sincronizza Google Calendar per una prenotazione.
// Invocata dal frontend dopo la creazione di una booking.

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  coach_id: string;
  client_name: string;
  client_phone?: string | null;
  scheduled_at: string; // ISO
  session_label: string;
  meeting_link?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const body = (await req.json()) as Payload;
    if (!body.coach_id || !body.scheduled_at) {
      return jsonResponse({ error: "Missing fields" }, 400);
    }

    // Caller must be the coach itself or an admin
    if (body.coach_id !== auth.userId && auth.role !== "admin") {
      return jsonResponse({ error: "Permesso negato" }, 403);
    }

    const supabase = auth.admin;

    const { data: settings, error } = await supabase
      .from("integration_settings")
      .select("wa_phone_id, wa_access_token, wa_enabled, gcal_webhook_url, gcal_enabled")
      .eq("coach_id", body.coach_id)
      .maybeSingle();

    if (error) throw error;
    if (!settings) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_settings" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, unknown> = {};

    // WhatsApp
    if (settings.wa_enabled && settings.wa_phone_id && settings.wa_access_token && body.client_phone) {
      try {
        const dateLabel = new Date(body.scheduled_at).toLocaleString("it-IT", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: "Europe/Rome",
        });
        const text = `Ciao ${body.client_name}, conferma sessione ${body.session_label} il ${dateLabel}.${
          body.meeting_link ? ` Videochiamata: ${body.meeting_link}` : ""
        }`;
        const waRes = await fetch(
          `https://graph.facebook.com/v18.0/${settings.wa_phone_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${settings.wa_access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: body.client_phone,
              type: "text",
              text: { body: text },
            }),
          },
        );
        results.whatsapp = { status: waRes.status, ok: waRes.ok };
        if (!waRes.ok) {
          const errBody = await waRes.text();
          console.error("WhatsApp API error", waRes.status, errBody);
        }
      } catch (e) {
        console.error("WhatsApp send failed", e);
        results.whatsapp = { error: String(e) };
      }
    } else {
      results.whatsapp = { skipped: true };
    }

    // Google Calendar webhook
    if (settings.gcal_enabled && settings.gcal_webhook_url) {
      try {
        const gcalRes = await fetch(settings.gcal_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "booking.created",
            client_name: body.client_name,
            scheduled_at: body.scheduled_at,
            session_label: body.session_label,
            meeting_link: body.meeting_link ?? null,
          }),
        });
        results.gcal = { status: gcalRes.status, ok: gcalRes.ok };
        if (!gcalRes.ok) {
          console.error("GCal webhook error", gcalRes.status, await gcalRes.text());
        }
      } catch (e) {
        console.error("GCal webhook failed", e);
        results.gcal = { error: String(e) };
      }
    } else {
      results.gcal = { skipped: true };
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("booking-notifications error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
