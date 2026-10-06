import { supabase } from "@/integrations/supabase/client";

// La chiave pubblica VAPID della coppia nuova (passata 09 del lato cliente). Con quella di prima Apple
// rifiutava ogni notifica con 403 (04/10/2026, i log di send-push), con ogni probabilità perché la
// privata salvata nei segreti di Lovable Cloud non faceva coppia con lei. La privata sta solo nei
// segreti (VAPID_PRIVATE_KEY), mai nel repo.
export const VAPID_PUBLIC_KEY =
  "BMAawwktEABnlhpEZlqEqMs8wRGNfT1DcFxSAC39zPZ1awDpa_5Zj2UVeVYUXbKEBSg8mygOejjG9SymgtGk1dc";

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

/**
 * L'iscrizione è nata con la chiave pubblica di oggi? true o false se il
 * browser lo dice (`options.applicationServerKey`), null se non lo dice.
 * Un'iscrizione nata con un'altra chiave non riceve niente: il servizio push
 * del browser rifiuta la firma del server (Apple con 403). Passata 09.
 */
export function subscriptionKeyMatches(sub: Pick<PushSubscription, "options">): boolean | null {
  const key = sub.options?.applicationServerKey;
  if (!key) return null;
  const want = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  const have = new Uint8Array(key);
  return have.length === want.length && have.every((b, i) => b === want[i]);
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

  // Passata 09: un'iscrizione nata con un'altra chiave, o che non dice con
  // quale, non si riusa. subscribe() con una chiave diversa rifiuta finché la
  // vecchia c'è, quindi prima la si toglie (un errore si ignora); dopo la
  // scrittura della riga nuova si toglie la riga di questa persona per il
  // vecchio endpoint. Rifarla a un browser che non dice la chiave non costa
  // niente, e garantisce quella giusta.
  let sub = await reg.pushManager.getSubscription();
  let stale: string | null = null;
  if (sub && subscriptionKeyMatches(sub) !== true) {
    stale = sub.endpoint;
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
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

  // La riga del vecchio endpoint: il suo errore non ferma niente (al più
  // resta una riga che il server cancella al primo 404 o 410).
  if (stale && stale !== sub.endpoint) {
    try {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("profile_id", profileId)
        .eq("endpoint", stale);
    } catch {
      // niente: l'iscrizione nuova è scritta
    }
  }

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
 * Passata 09: un'iscrizione nata con un'altra chiave non è attiva, così il
 * Profilo dice «Disattivate» e riaccenderle la rifà con la chiave di oggi; se
 * il browser non dice la chiave, come prima.
 */
export async function isPushEnabledFor(profileId: string): Promise<boolean> {
  const sub = await getCurrentPushSubscription();
  if (!sub) return false;
  if (subscriptionKeyMatches(sub) === false) return false;
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

/**
 * Dove una scheda scrive l'uscita chiesta (markLeaving): l'istante e, se la
 * conosce, la sessione che esce («1234|<session_id>»). Lo leggono anche le
 * altre schede.
 */
export const LEAVING_KEY = "nc-push-leaving-at";

/**
 * Per quanto vale il segno quando non nomina la sessione della scheda che
 * riceve SIGNED_OUT (il segno di prima della passata 10, l'uscita non
 * riuscita, la sessione illeggibile): Supabase manda SIGNED_OUT alle altre
 * schede subito dopo l'uscita. Una scheda ferma in background (Chrome su
 * Android la congela) lo riceve quando torna, anche minuti dopo: per lei
 * decide la sessione scritta nel segno (leftOnPurpose, passata 10), non
 * questo margine.
 */
export const LEAVING_WINDOW_MS = 10_000;

/**
 * La sessione di un access token di Supabase: il claim session_id del JWT
 * (il payload in base64url), che resta lo stesso a ogni rinnovo del token e
 * cambia a ogni nuovo accesso. null se il token non si legge o il claim non
 * è una stringa piena (passata 10).
 */
export function sessionKey(accessToken: string | null | undefined): string | null {
  const part = accessToken?.split(".")[1];
  if (!part) return null;
  try {
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    const payload: unknown = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    const id = (payload as { session_id?: unknown } | null)?.session_id;
    return typeof id === "string" && id !== "" ? id : null;
  } catch {
    return null;
  }
}

/**
 * Quante sessioni uscite il segno ricorda (passata 11 del lato cliente): con
 * una sola, due «Esci» di fila con una scheda ferma in background liberavano il
 * telefono, perché la scheda si svegliava con la prima sessione e il segno
 * nominava solo la seconda.
 */
export const LEAVING_KEEP = 5;

/** Le sessioni nominate dal segno, la più recente prima. */
function markedSessions(raw: string | null): string[] {
  const list = raw?.split("|", 2)[1];
  return list ? list.split(",").filter((s) => s !== "") : [];
}

/**
 * Segna un'uscita chiesta, prima di signOut(): l'istante e, se si conosce, la
 * sessione che esce (passata 10), insieme alle uscite di prima, al massimo
 * LEAVING_KEEP («1234|<la più recente>,<quella prima>»; passata 11). `forget`
 * toglie una sessione dal segno: l'uscita non riuscita non la nomina più. Con
 * lo storage negato la sa solo la scheda che esce.
 */
export function markLeaving(
  now = Date.now(),
  session: string | null = null,
  forget: string | null = null,
): void {
  try {
    const before = markedSessions(localStorage.getItem(LEAVING_KEY)).filter(
      (s) => s !== session && s !== forget,
    );
    const list = (session ? [session, ...before] : before).slice(0, LEAVING_KEEP);
    localStorage.setItem(LEAVING_KEY, list.length > 0 ? `${now}|${list.join(",")}` : String(now));
  } catch {
    // niente: resta il segno in memoria della scheda (auth.tsx)
  }
}

/** Il segno di markLeaving, o null se non c'è o lo storage non si legge. */
export function readLeaving(): string | null {
  try {
    return localStorage.getItem(LEAVING_KEY);
  } catch {
    return null;
  }
}

/**
 * Un'uscita chiesta da poco, in questa scheda o in un'altra (passata 09):
 * Supabase manda SIGNED_OUT a tutte le schede aperte (BroadcastChannel), e
 * solo quella che ha chiamato signOut() ha il segno in memoria. Vale per
 * LEAVING_WINDOW_MS dal segno, e solo per un istante già passato; l'istante
 * si legge anche dal segno che nomina la sessione. Dalla passata 10 la usa
 * leftOnPurpose, quando il segno non nomina la sessione della scheda.
 */
export function leftOnPurposeRecently(raw: string | null, now: number): boolean {
  if (raw === null) return false;
  const at = Number(raw.split("|")[0]);
  return Number.isFinite(at) && now >= at && now - at < LEAVING_WINDOW_MS;
}

/**
 * Un'uscita chiesta, per la scheda che riceve SIGNED_OUT (passata 10): il
 * segno nomina la sessione che la scheda conosceva (`session`, da
 * sessionKey) con un istante già passato, a qualunque distanza; altrimenti
 * vale il margine di leftOnPurposeRecently. Così una scheda ferma in
 * background che si sveglia minuti dopo un «Esci» non libera il telefono,
 * mentre una sessione nata dopo (un nuovo accesso, un altro utente) ha un
 * altro id, e se poi scade il telefono si libera.
 */
export function leftOnPurpose(raw: string | null, now: number, session: string | null): boolean {
  if (raw === null) return false;
  const at = Number(raw.split("|", 2)[0]);
  if (
    session !== null &&
    markedSessions(raw).includes(session) &&
    Number.isFinite(at) &&
    now >= at
  ) {
    return true;
  }
  return leftOnPurposeRecently(raw, now);
}

/** Un'uscita che nessuno ha chiesto: SIGNED_OUT senza il segno di un'uscita chiesta (passata 09). */
export function shouldReleaseOnAuthEvent(event: string, leavingOnPurpose: boolean): boolean {
  return event === "SIGNED_OUT" && !leavingOnPurpose;
}

/**
 * Libera il telefono a un'uscita che nessuno ha chiesto (passata 09): la
 * sessione scaduta o revocata, anche da un «Esci» su un altro dispositivo,
 * perché signOut() di Supabase esce da tutti. La riga del server non si può
 * togliere, perché la policy «Self manage push subscriptions» vuole il JWT del
 * proprietario; si toglie allora l'iscrizione del browser. Alla prossima
 * notifica il servizio push risponde 404 o 410 e il server cancella la riga
 * da sé (supabase/functions/_shared/push.ts), e il telefono smette di
 * ricevere le notifiche di chi è uscito. Chi rientra le riaccende dal
 * Profilo. Mai bloccante: un errore si ignora.
 */
export async function releasePushDevice(): Promise<void> {
  try {
    const sub = await getCurrentPushSubscription();
    await sub?.unsubscribe();
  } catch {
    // niente: l'uscita va avanti comunque
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
