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

  // Passata 08: pushManager.subscribe() vuole un service worker attivo
  // (Chrome: «no active Service Worker»; WebKit: «Subscribing for push
  // requires an active service worker»), e getRegistration() restituisce anche
  // una registrazione ancora in installazione; ready aspetta quella attiva. Al
  // più 10 secondi.
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
  ]);
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
  // push_subscriptions exists in the generated Supabase types; the
  // historical `as any` cast was a stale workaround. The `subscription`
  // column is typed as Json in supabase/types.ts so we still need a Json
  // cast here because PushSubscriptionJSON is a structural superset.
  const { error } = await supabase
    .from("push_subscriptions")
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

/**
 * Le notifiche sul telefono sono attive per questa persona su questo
 * dispositivo (passata 08 del lato cliente): il dispositivo ha un'iscrizione e
 * il server ha la riga di push_subscriptions di chi è entrato per
 * quell'iscrizione (la policy «Self manage push subscriptions» lascia leggere
 * a ognuno le sue righe; endpoint è la colonna generata da
 * subscription->>'endpoint'). Prima bastava l'iscrizione del dispositivo: con
 * due persone sullo stesso telefono la seconda vedeva «Attive» senza
 * riceverle, e un'iscrizione rimasta dopo una scrittura fallita diceva
 * «Attive» senza la riga. Se la lettura fallisce vale l'iscrizione, come prima.
 */
export async function isPushEnabledFor(profileId: string): Promise<boolean> {
  const sub = await getCurrentPushSubscription();
  if (!sub) return false;
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("endpoint", sub.endpoint)
    .limit(1);
  if (error) return true;
  return (data ?? []).length > 0;
}

/**
 * All'uscita dall'account (passata 08 del lato cliente: «Esci» del Profilo e
 * dell'header desktop; non «Esci e collega Google», dove si rientra subito
 * nello stesso account) toglie la riga di questa persona per questo
 * dispositivo, così le sue notifiche non arrivano a chi userà il telefono
 * dopo. L'iscrizione del browser resta: può servire a un'altra persona dello
 * stesso telefono, la cui riga punta allo stesso endpoint. Mai bloccante: al
 * più 3 secondi, e un errore si ignora (l'uscita va avanti comunque).
 */
export async function forgetPushForUser(profileId: string): Promise<void> {
  const work = (async () => {
    const sub = await getCurrentPushSubscription();
    if (!sub) return;
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", profileId)
      .eq("endpoint", sub.endpoint);
  })().catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, 3_000);
  });
  try {
    await Promise.race([work, limit]);
  } finally {
    clearTimeout(timer);
  }
}

interface SendPushArgs {
  profileId: string;
  title: string;
  body: string;
  url?: string;
}

/**
 * Fire-and-forget: errori loggati ma non bloccanti.
 * N10: `supabase.functions.invoke` non rigetta su errori HTTP (status non-2xx
 * arrivano come `data.error` o nel `error` field), quindi prima si limitava a
 * intercettare solo gli errori sincroni. Ora logghiamo anche errori applicativi
 * con context per debug (profileId, titolo) senza esporre dettagli all'utente.
 */
export function sendPush({ profileId, title, body, url }: SendPushArgs): void {
  void (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("send-push", {
        body: { profile_id: profileId, title, body, url },
      });
      if (error) {
        console.error("send-push failed", { profileId, title, error });
        return;
      }
      const payload = data as { error?: string; sent?: number } | null;
      if (payload?.error) {
        console.error("send-push returned error", { profileId, title, error: payload.error });
      }
    } catch (err) {
      console.error("send-push invoke threw", { profileId, title, err });
    }
  })();
}
