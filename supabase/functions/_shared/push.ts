// Shared Web Push helper used by send-push e booking-notifications.
// A5 (audit 2026-06-03): centralizza il loop sendNotification + il cleanup
// delle subscription scadute (404/410) per eliminare la duplicazione ~30
// righe tra le due edge function.
import webpush from "npm:web-push@3.6.7";

export interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

export interface PushTarget {
  id: string;
  subscription: unknown;
}

export interface PushSendResult {
  id: string;
  ok: boolean;
  status?: number;
}

export interface PushClient {
  from: (table: string) => {
    delete: () => { eq: (col: string, val: string) => Promise<unknown> };
  };
}

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:nctrainingsystems@gmail.com";

let vapidConfigured = false;
export function configureVapid(): boolean {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  vapidConfigured = true;
  return true;
}

export function isVapidConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

/**
 * Invia il `payload` JSON-stringified a tutte le `subs` e pulisce le
 * subscription scadute (404/410). I log scrubbano l'errore web-push per
 * non echare la URL dell'endpoint (token browser-specifico).
 */
export async function sendPushToSubscriptions(
  subs: PushTarget[],
  payload: string,
  admin: PushClient,
  logLabel = "push failed",
): Promise<PushSendResult[]> {
  configureVapid();
  return Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription as PushSubscriptionJSON, payload);
        return { id: row.id, ok: true } satisfies PushSendResult;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", row.id);
        }
        console.error(logLabel, {
          id: row.id,
          status,
          message: e instanceof Error ? e.message : String(e),
        });
        return { id: row.id, ok: false, status } satisfies PushSendResult;
      }
    }),
  );
}
