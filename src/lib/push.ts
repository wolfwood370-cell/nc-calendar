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

/**
 * Verifica che il service worker sia effettivamente registrato.
 * In anteprima/iframe `pwa-register` disattiva il SW, quindi le push
 * non possono funzionare anche se le API del browser sono presenti.
 */
export async function isPushReady(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg;
  } catch {
    return false;
  }
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
    const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const buf = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: buf,
    });
  }

  const json = sub.toJSON() as unknown as Record<string, unknown>;
  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("push_subscriptions" as any)
    .upsert(
      { profile_id: profileId, subscription: json as never },
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
