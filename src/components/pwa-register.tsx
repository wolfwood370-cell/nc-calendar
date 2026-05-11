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
      .then((mod: { registerSW: (opts?: { immediate?: boolean }) => void }) => {
        mod.registerSW?.({ immediate: true });
      })
      .catch(() => {
        /* plugin non disponibile in questo ambiente */
      });
  }, []);

  return null;
}
