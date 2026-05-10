import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY =
  "BBs68P5VeBxnTmlUz0mkMNJuLe7zMBoptyunIoghZhFpcCvgAV7lh1ydN4f0XJhDRnT5E4lzP0aV_Ac7umIi_R0";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export async function subscribeToPush(profileId: string): Promise<PushSubscription> {
  if (!isPushSupported()) throw new Error("Push non supportato su questo dispositivo");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permesso negato");

  const reg =
    (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
  if (!reg) throw new Error("Service worker non disponibile");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { profile_id: profileId, subscription: json as unknown as Record<string, unknown> },
      { onConflict: "profile_id,endpoint" },
    );
  if (error) throw error;

  return sub;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

interface SendPushArgs {
  profileId: string;
  title: string;
  body: string;
  url?: string;
}

/** Fire-and-forget: errori loggati ma non bloccanti. */
export function sendPush({ profileId, title, body, url }: SendPushArgs): void {
  void supabase.functions
    .invoke("send-push", { body: { profile_id: profileId, title, body, url } })
    .catch((err) => console.error("send-push invoke failed", err));
}
