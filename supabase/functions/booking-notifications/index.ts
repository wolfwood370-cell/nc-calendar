// Edge function: notifica il coach quando un cliente prenota una sessione.
// Canali attivati per ogni invocazione:
//   - in-app: INSERT in `notifications` (sempre)
//   - Web Push: webpush.sendNotification al coach (sempre, se subscriber)
//   - WhatsApp: messaggio al cliente (opt-in via integration_settings.wa_*)
//   - Webhook esterno: POST a integration_settings.gcal_webhook_url (opt-in)
// Invocata dal frontend (client.book.tsx) dopo INSERT bookings.

import webpush from "npm:web-push@3.6.7";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, assertUuid } from "../_shared/auth.ts";

interface Payload {
  coach_id: string;
  client_name: string;
  client_phone?: string | null;
  scheduled_at: string; // ISO
  session_label: string;
  meeting_link?: string | null;
  booking_id?: string | null;
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
    const body = (await req.json()) as Payload;
    if (!body.coach_id || !body.scheduled_at) {
      return jsonResponse({ error: "Missing fields" }, 400);
    }
    try {
      assertUuid(body.coach_id, "coach_id");
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Invalid coach_id" }, 400);
    }
    if (body.booking_id) {
      try {
        assertUuid(body.booking_id, "booking_id");
      } catch (e) {
        return jsonResponse(
          { error: e instanceof Error ? e.message : "Invalid booking_id" },
          400,
        );
      }
    }

    const supabase = auth.admin;

    // Authorization: caller must be the coach themselves, an admin, or a
    // client whose profile points at this coach. The historical check
    // accepted only "coach or admin" — which meant the only legitimate
    // call site (client.book.tsx, where auth.userId is the client) was
    // failing 403 silently behind the frontend's fire-and-forget .catch.
    if (body.coach_id !== auth.userId && auth.role !== "admin") {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("coach_id")
        .eq("id", auth.userId)
        .maybeSingle();
      const callerCoachId = (callerProfile as { coach_id?: string } | null)?.coach_id;
      if (callerCoachId !== body.coach_id) {
        return jsonResponse({ error: "Permesso negato" }, 403);
      }
    }

    const { data: settings } = await supabase
      .from("integration_settings")
      .select("wa_phone_id, wa_access_token, wa_enabled, gcal_webhook_url, gcal_enabled")
      .eq("coach_id", body.coach_id)
      .maybeSingle();

    const results: Record<string, unknown> = {};

    // ---- 1. In-app notification (always) -------------------------------
    const notifPayload: Record<string, unknown> = {
      client_name: body.client_name,
      scheduled_at: body.scheduled_at,
      session_label: body.session_label,
    };
    if (body.booking_id) notifPayload.booking_id = body.booking_id;
    if (body.meeting_link) notifPayload.meeting_link = body.meeting_link;
    try {
      const { error: notifErr } = await supabase.from("notifications").insert({
        recipient_id: body.coach_id,
        type: "booking.created",
        payload: notifPayload,
      });
      if (notifErr) throw notifErr;
      results.in_app = { ok: true };
    } catch (e) {
      console.error("notification insert failed", e);
      results.in_app = { error: String(e) };
    }

    // ---- 2. Web Push to coach (always, if subscribed) ------------------
    // Duplicates send-push's webpush.sendNotification flow because that
    // handler enforces caller=coach|admin authz and would reject a
    // client→coach push. Refactor into _shared/push.ts deferred to keep
    // this commit focused; the duplication is ~30 lines.
    if (VAPID_PUBLIC && VAPID_PRIVATE) {
      try {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("id, subscription")
          .eq("profile_id", body.coach_id);
        const dateLabel = new Date(body.scheduled_at).toLocaleString("it-IT", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/Rome",
        });
        const pushPayload = JSON.stringify({
          title: "Nuova prenotazione",
          body: `${body.client_name} · ${body.session_label} · ${dateLabel}`,
          url: "/trainer/calendar",
        });
        const pushResults = await Promise.all(
          (subs ?? []).map(async (row: { id: string; subscription: unknown }) => {
            try {
              await webpush.sendNotification(
                row.subscription as PushSubscriptionJSON,
                pushPayload,
              );
              return { id: row.id, ok: true };
            } catch (e) {
              const status = (e as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) {
                await supabase.from("push_subscriptions").delete().eq("id", row.id);
              }
              // L6: log only the message — web-push errors can echo
              // subscription endpoint URLs which are browser-specific tokens.
              console.error("coach push failed", {
                id: row.id,
                status,
                message: e instanceof Error ? e.message : String(e),
              });
              return { id: row.id, ok: false, status };
            }
          }),
        );
        results.push = { sent: pushResults.length };
      } catch (e) {
        console.error("coach push failed", e);
        results.push = { error: String(e) };
      }
    } else {
      results.push = { skipped: "no_vapid" };
    }

    // ---- 3. WhatsApp (opt-in, to client) -------------------------------
    if (
      settings?.wa_enabled &&
      settings.wa_phone_id &&
      settings.wa_access_token &&
      body.client_phone
    ) {
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
          console.error("WhatsApp API error", waRes.status, await waRes.text());
        }
      } catch (e) {
        console.error("WhatsApp send failed", e);
        results.whatsapp = { error: String(e) };
      }
    } else {
      results.whatsapp = { skipped: true };
    }

    // ---- 4. Webhook esterno (opt-in) -----------------------------------
    if (settings?.gcal_enabled && settings.gcal_webhook_url) {
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

    return jsonResponse({ ok: true, results });
  } catch (e) {
    console.error("booking-notifications error", e);
    return jsonResponse({ error: String(e) }, 500);
  }
});
