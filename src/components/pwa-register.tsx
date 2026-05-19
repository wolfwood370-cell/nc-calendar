import { useEffect } from "react";

/**
 * Registra il service worker PWA solo in produzione e mai dentro iframe
 * o sui domini di preview di Lovable (per evitare contenuti stantii).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    const host = window.location.hostname;
    const isPreview =
      host.includes("id-preview--") ||
      host.includes("preview--") ||
      host.includes("lovableproject.com") ||
      host.includes("lovableproject-dev.com") ||
      host.includes("lovable.app");

    if (inIframe || isPreview) {
      navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }

    // Dynamic import: virtual module fornito da vite-plugin-pwa
    import(/* @vite-ignore */ "virtual:pwa-register" as string)
      .then(
        (mod: {
          registerSW: (opts?: { immediate?: boolean }) => Promise<ServiceWorkerRegistration | void>;
        }) => {
          // L7 (FULL_APP_AUDIT.md): surface SW registration failures via
          // console.warn. Without this, iOS Safari rejections (e.g. SW
          // registration outside HTTPS, standalone PWA on iOS < 16, or
          // CSP-blocked SW scripts) failed silently and there was no
          // signal in devtools that the PWA install path had broken.
          // We still don't toast — most users don't need to see this —
          // but it lands in error reporting like other console warnings.
          const result = mod.registerSW?.({ immediate: true });
          if (result && typeof result.catch === "function") {
            result.catch((e: unknown) => {
              console.warn("PWA SW registration failed", e);
            });
          }
        },
      )
      .catch(() => {
        /* plugin non disponibile in questo ambiente */
      });
  }, []);

  return null;
}
