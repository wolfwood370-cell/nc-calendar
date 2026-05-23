// Google Calendar push-notification webhook.
//
// Google sends a POST with an empty body and these headers:
//   x-goog-channel-id        — the channel id we passed when registering
//   x-goog-channel-token     — our shared secret, echoed back verbatim
//   x-goog-resource-id       — opaque id of the watched resource
//   x-goog-resource-state    — "sync" (initial) | "exists" | "not_exists"
//   x-goog-message-number    — monotonic per channel
//
// We must answer 200 quickly or Google will retry with backoff and eventually
// kill the channel. Heavy work (re-importing events, reconciling cancels)
// is delegated to the trainer's browser via a Realtime broadcast: the
// webhook bumps `last_notification_at` on the `gcal_sync_signals` table
// (a dedicated Realtime-safe watermark; see migration
// 20260523100000_gcal_sync_signals_realtime_safe.sql), the calendar route
// is subscribed to that row, and on change it kicks off the existing
// authenticated `sync-calendar` import_history flow + cache invalidation.
//
// Why a separate table? `integration_settings` (where the watermark used
// to live) carries OAuth refresh/access tokens, WhatsApp tokens, and the
// service-account JSON. Audit 2026-05-22 dropped it from supabase_realtime
// to avoid broadcasting credentials to any subscriber. The signaling
// channel was rebuilt on a tokens-free table so the live-sync UX
// survives the security hardening.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/webhooks/gcal-watch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const channelId = request.headers.get("x-goog-channel-id");
        const channelToken = request.headers.get("x-goog-channel-token");
        const resourceState = request.headers.get("x-goog-resource-state");
        const resourceId = request.headers.get("x-goog-resource-id");

        // Always 200 — even on error — so Google doesn't retry forever.
        // We log and exit silently when something is off.
        const ok = new Response("ok", { status: 200 });

        if (!channelId) {
          console.warn("[gcal-watch] missing x-goog-channel-id");
          return ok;
        }

        try {
          const { data: row, error } = await supabaseAdmin
            .from("integration_settings")
            .select("coach_id, gcal_channel_token, gcal_resource_id, gcal_enabled")
            .eq("gcal_channel_id", channelId)
            .maybeSingle();

          if (error || !row) {
            console.warn("[gcal-watch] unknown channel", { channelId, error });
            return ok;
          }

          // Constant-time-ish token check. If a token was registered, it
          // MUST match. (Google echoes whatever we passed to watch().)
          if (row.gcal_channel_token && row.gcal_channel_token !== channelToken) {
            console.warn("[gcal-watch] token mismatch", { channelId });
            return ok;
          }
          if (row.gcal_resource_id && resourceId && row.gcal_resource_id !== resourceId) {
            console.warn("[gcal-watch] resource_id mismatch", { channelId });
            return ok;
          }

          if (!row.gcal_enabled) {
            // Integration disabled (token revoked, user disconnected…).
            // Acknowledge and let the next watch refresh clean things up.
            return ok;
          }

          // The "sync" event fires once at channel creation. Skip the
          // expensive refresh — there's nothing to reconcile yet.
          if (resourceState === "sync") return ok;

          // Bump the watermark on the Realtime-safe signal table. The
          // trainer's calendar route subscribes to postgres_changes on
          // gcal_sync_signals and will trigger the authenticated
          // import_history sync on UPDATE. UPSERT (vs UPDATE) covers the
          // first-ever notification per coach where the row doesn't
          // exist yet.
          await supabaseAdmin.from("gcal_sync_signals").upsert(
            {
              coach_id: row.coach_id,
              last_notification_at: new Date().toISOString(),
            },
            { onConflict: "coach_id" },
          );
        } catch (err) {
          // Never surface 5xx to Google.
          console.error("[gcal-watch] handler error", err);
        }

        return ok;
      },
      // Google sends a sync ping; some setups also probe with GET.
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
