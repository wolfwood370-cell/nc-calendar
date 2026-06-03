// Edge function: notifica il coach quando un cliente prenota o riprogramma
// una sessione. Canali attivati per ogni invocazione:
//   - in-app:  INSERT in `notifications` (sempre)
//   - Web Push: webpush.sendNotification al coach (sempre, se subscriber)
//   - WhatsApp: messaggio al cliente (opt-in via integration_settings.wa_*,
//               solo per booking.created — non spammiamo i clienti quando
//               riprogrammano essi stessi)
// Invocata dal frontend:
//   - client.book.tsx       → event_type="booking.created" (default)
//   - client-reschedule-sheet → event_type="booking.rescheduled"

import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth, assertUuid } from "../_shared/auth.ts";
import { isVapidConfigured, sendPushToSubscriptions } from "../_shared/push.ts";

type EventType = "booking.created" | "booking.rescheduled";

interface Payload {
  // Optional for back-compat: legacy callers (without the field) are
  // treated as "booking.created".
  event_type?: EventType;
  coach_id: string;
  client_name: string;
  client_phone?: string | null;
  // For created → the new booking time. For rescheduled → the new time.
  scheduled_at: string;
  // For rescheduled only: the previous time (NEW.scheduled_at vs OLD.
  // scheduled_at in the bookings table). The DB trigger
  // validate_client_booking_update enforces a 24h cutoff on OLD; we
  // re-check here as defense-in-depth.
  old_scheduled_at?: string | null;
  session_label: string;
  meeting_link?: string | null;
  booking_id?: string | null;
}


/**
 * Validate a phone number in loose E.164 format prior to handing it to
 * the WhatsApp Graph API. Without this guard, malformed inputs (empty
 * strings, alphanumeric strings, ridiculously long values) reach
 * Facebook's API which either 4xx-loops or — for crafted inputs —
 * becomes an abuse vector. Accepts: optional leading "+", 8–15 digits,
 * first digit non-zero. Whitespace in the input is stripped before
 * matching so user-entered "+39 333 1234567" is accepted and normalized.
 */
function normalizeAndValidatePhoneE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/[\s\-().]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(trimmed)) return null;
  return trimmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  try {
    const body = (await req.json()) as Payload;
    const eventType: EventType = body.event_type ?? "booking.created";
    if (eventType !== "booking.created" && eventType !== "booking.rescheduled") {
      return jsonResponse({ error: "Unknown event_type" }, 400, req);
    }
    if (!body.coach_id || !body.scheduled_at) {
      return jsonResponse({ error: "Missing fields" }, 400, req);
    }
    // L4 (audit Wave 3): validate scheduled_at unconditionally — was only
    // checked in the reschedule branch.
    if (!Number.isFinite(new Date(body.scheduled_at).getTime())) {
      return jsonResponse({ error: "Invalid scheduled_at" }, 400, req);
    }
    // M1 (audit Wave 3): cap free-text fields that flow into push payloads,
    // notifications.payload and WhatsApp message bodies.
    if (typeof body.client_name !== "string" || body.client_name.length > 200) {
      return jsonResponse({ error: "Invalid client_name" }, 400, req);
    }
    if (typeof body.session_label !== "string" || body.session_label.length > 200) {
      return jsonResponse({ error: "Invalid session_label" }, 400, req);
    }
    try {
      assertUuid(body.coach_id, "coach_id");
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Invalid coach_id" }, 400, req);
    }
    if (body.booking_id) {
      try {
        assertUuid(body.booking_id, "booking_id");
      } catch (e) {
        return jsonResponse(
          { error: e instanceof Error ? e.message : "Invalid booking_id" },
          400,
          req,
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
        return jsonResponse({ error: "Permesso negato" }, 403, req);
      }
    }

    // --------------------------------------------------------------------
    // Reschedule-specific validation (defense in depth on top of the DB
    // trigger validate_client_booking_update — see
    // supabase/migrations/20260522100000_client_booking_update_guards.sql).
    // --------------------------------------------------------------------
    if (eventType === "booking.rescheduled") {
      if (!body.old_scheduled_at) {
        return jsonResponse({ error: "Missing old_scheduled_at" }, 400, req);
      }
      if (!body.booking_id) {
        return jsonResponse({ error: "Missing booking_id" }, 400, req);
      }
      const oldTime = new Date(body.old_scheduled_at).getTime();
      if (!Number.isFinite(oldTime)) {
        return jsonResponse({ error: "Invalid old_scheduled_at" }, 400, req);
      }
      // Same semantic as the DB trigger: cutoff against OLD, not NEW.
      // A client who tries to "save" a slot by repeatedly bumping it
      // forward is blocked because OLD < now+24h fails before NEW is
      // considered.
      if (oldTime - Date.now() < 24 * 60 * 60 * 1000) {
        return jsonResponse(
          { error: "Non è possibile spostare un appuntamento a meno di 24 ore dall'inizio." },
          403,
          req,
        );
      }
      // Verify the booking exists and the caller owns it (client side)
      // or coaches it. Prevents a malicious client from forging a
      // notification about someone else's booking.
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, client_id, coach_id")
        .eq("id", body.booking_id)
        .maybeSingle();
      if (!booking) {
        return jsonResponse({ error: "Booking inesistente" }, 404, req);
      }
      const b = booking as { client_id: string | null; coach_id: string };
      if (b.client_id !== auth.userId && b.coach_id !== auth.userId && auth.role !== "admin") {
        return jsonResponse({ error: "Permesso negato" }, 403, req);
      }
      if (b.coach_id !== body.coach_id) {
        // The booking's coach must match the notification's coach_id —
        // otherwise the caller could redirect a notification to an
        // unrelated coach.
        return jsonResponse({ error: "coach_id non coerente" }, 400, req);
      }
    }

    const { data: settings } = await supabase
      .from("integration_settings")
      .select("wa_phone_id, wa_access_token, wa_enabled")
      .eq("coach_id", body.coach_id)
      .maybeSingle();

    const results: Record<string, unknown> = {};

    // ---- 1. In-app notification (always) -------------------------------
    const notifPayload: Record<string, unknown> = {
      client_name: body.client_name,
      session_label: body.session_label,
    };
    if (body.booking_id) notifPayload.booking_id = body.booking_id;
    if (body.meeting_link) notifPayload.meeting_link = body.meeting_link;
    if (eventType === "booking.rescheduled") {
      notifPayload.old_scheduled_at = body.old_scheduled_at;
      notifPayload.new_scheduled_at = body.scheduled_at;
    } else {
      notifPayload.scheduled_at = body.scheduled_at;
    }
    try {
      const { error: notifErr } = await supabase.from("notifications").insert({
        recipient_id: body.coach_id,
        type: eventType,
        payload: notifPayload,
      });
      if (notifErr) throw notifErr;
      results.in_app = { ok: true };
    } catch (e) {
      console.error("notification insert failed", e);
      results.in_app = { error: String(e) };
    }

    // ---- 2. Web Push to coach (always, if subscribed) ------------------
    // A5 (audit 2026-06-03): logica unificata in _shared/push.ts.
    if (isVapidConfigured()) {
      try {
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("id, subscription")
          .eq("profile_id", body.coach_id);
        const newDateLabel = new Date(body.scheduled_at).toLocaleString("it-IT", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Europe/Rome",
        });
        let pushTitle: string;
        let pushBody: string;
        if (eventType === "booking.rescheduled" && body.old_scheduled_at) {
          const oldDateLabel = new Date(body.old_scheduled_at).toLocaleString("it-IT", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/Rome",
          });
          pushTitle = "Sessione spostata";
          pushBody = `${body.client_name}: ${oldDateLabel} → ${newDateLabel}`;
        } else {
          pushTitle = "Nuova prenotazione";
          pushBody = `${body.client_name} · ${body.session_label} · ${newDateLabel}`;
        }
        const pushPayload = JSON.stringify({
          title: pushTitle,
          body: pushBody,
          url: "/trainer/calendar",
        });
        const pushResults = await sendPushToSubscriptions(
          (subs ?? []) as { id: string; subscription: unknown }[],
          pushPayload,
          supabase as unknown as Parameters<typeof sendPushToSubscriptions>[2],
          "coach push failed",
        );
        results.push = { sent: pushResults.length };
      } catch (e) {
        console.error("coach push failed", e);
        results.push = { error: String(e) };
      }
    } else {
      results.push = { skipped: "no_vapid" };
    }


    // ---- 3. WhatsApp (opt-in, to client, only on first creation) -------
    // We deliberately don't WhatsApp the client on reschedule: the
    // client just performed the reschedule themselves, so a
    // confirmation message would be redundant. Coach is informed via
    // in-app + Web Push above.
    const waPhoneNormalized = normalizeAndValidatePhoneE164(body.client_phone);
    if (body.client_phone && !waPhoneNormalized) {
      // CRIT-2 fix: phone was provided but failed E.164 validation.
      // Log so coaches can spot bad data in profiles.phone; do NOT crash
      // and do NOT forward malformed input to Facebook (4xx loop / abuse).
      console.warn("booking-notifications: skipping WhatsApp — invalid phone format", {
        bookingId: body.booking_id,
      });
    }
    if (
      eventType === "booking.created" &&
      settings?.wa_enabled &&
      settings.wa_phone_id &&
      settings.wa_access_token &&
      waPhoneNormalized
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
              to: waPhoneNormalized,
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



    return jsonResponse({ ok: true, results }, 200, req);
  } catch (e) {
    console.error("booking-notifications error", e);
    return jsonResponse({ error: String(e) }, 500, req);
  }
});
