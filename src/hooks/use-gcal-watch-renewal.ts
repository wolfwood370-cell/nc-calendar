// ----------------------------------------------------------------------------
// use-gcal-watch-renewal — keep the Google push-notification channel alive
// ----------------------------------------------------------------------------
// Google push notification channels (the ones registered by sync-calendar
// action="register_watch") expire ~7 days after creation. There is no
// server-side scheduler that renews them, so without this hook the
// channel silently dies and webhook-driven sync (gcal-watch.ts) goes
// quiet until the coach disconnects and reconnects Google.
//
// This hook polls `integration_settings.gcal_channel_expires_at` at
// mount of the trainer calendar / integrations pages. When the
// expiration is within RENEWAL_THRESHOLD_HOURS, it fires a fresh
// `register_watch` call (idempotent — Google issues a new channel id
// and the edge function persists it). Failures are logged but never
// surfaced to the user: we don't want a noisy renewal toast every
// mount when something transient breaks.
// ----------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { syncCalendar } from "@/lib/sync-calendar";

const RENEWAL_THRESHOLD_HOURS = 48;
const RENEWAL_THRESHOLD_MS = RENEWAL_THRESHOLD_HOURS * 60 * 60 * 1000;

/**
 * Background watch renewal. Safe to call on multiple pages — the
 * `lastCheckedFor` ref skips duplicate work within the same mount
 * cycle of a coach session.
 */
export function useGcalWatchRenewal(coachId: string | null | undefined) {
  const lastCheckedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!coachId) return;
    // Skip if we've already verified this coach in this mount cycle.
    if (lastCheckedFor.current === coachId) return;
    lastCheckedFor.current = coachId;

    let cancelled = false;

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("integration_settings")
          .select("gcal_enabled, gcal_channel_expires_at, gcal_refresh_token")
          .eq("coach_id", coachId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.warn("useGcalWatchRenewal: read failed", error);
          return;
        }
        if (!data) return;
        // Skip: GCal isn't connected (or has been auto-disabled by a
        // refresh failure). Renewing a watch on a dead integration would
        // 401 immediately.
        if (!data.gcal_enabled) return;
        if (!data.gcal_refresh_token) return;

        // Threshold check. NULL expires_at = never set (watch was never
        // registered) → renew. Anything within RENEWAL_THRESHOLD = renew.
        const expiresAtRaw = data.gcal_channel_expires_at;
        if (expiresAtRaw) {
          // Defensive guard: gcal_channel_expires_at è typed `unknown` dal
          // generated schema Supabase. Senza il typeof check, un valore non
          // string/number scivolerebbe in new Date(...) → NaN → la condizione
          // dopo (NaN > threshold) sarebbe false → renew sempre, anche quando
          // il watch è ancora valido (chiamata API sprecata).
          if (typeof expiresAtRaw !== "string" && typeof expiresAtRaw !== "number") return;
          const expiresAtMs = new Date(expiresAtRaw).getTime();
          if (!Number.isFinite(expiresAtMs)) return;
          if (expiresAtMs - Date.now() > RENEWAL_THRESHOLD_MS) return;
        }

        // Fire-and-forget renew. syncCalendar handles its own error toast
        // path (notifySyncFailure) but for register_watch we pass
        // silent:true to avoid spamming the user on every mount when
        // something transient breaks — the next mount will retry.
        syncCalendar({ action: "register_watch", coachId }, { silent: true });
      } catch (e) {
        console.warn("useGcalWatchRenewal: unexpected error", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [coachId]);
}
