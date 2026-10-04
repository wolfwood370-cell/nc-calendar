import { useEffect } from "react";
import { isLovablePreviewHost } from "@/lib/pwa-host";

/**
 * Registra il service worker PWA, mai dentro un iframe e mai sulle anteprime
 * di Lovable (per evitare contenuti stantii). Quali host sono anteprime lo
 * dice isLovablePreviewHost (passata 08 del lato cliente): prima lo era ogni
 * host con «lovable.app», produzione compresa, e lì il service worker veniva
 * tolto a ogni caricamento.
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

    const isPreview = isLovablePreviewHost(window.location.hostname);

    if (inIframe || isPreview) {
      navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister()));
      return;
    }

    // Dynamic import: virtual module fornito da vite-plugin-pwa
    import(/* @vite-ignore */ "virtual:pwa-register" as string)
      .then(
        (mod: {
          registerSW: (opts?: {
            immediate?: boolean;
            onNeedReload?: () => void;
            onRegisterError?: (error: unknown) => void;
          }) => unknown;
        }) => {
          // L7 (FULL_APP_AUDIT.md): surface SW registration failures via
          // console.warn. Without this, iOS Safari rejections (e.g. SW
          // registration outside HTTPS, standalone PWA on iOS < 16, or
          // CSP-blocked SW scripts) failed silently and there was no
          // signal in devtools that the PWA install path had broken.
          // We still don't toast — most users don't need to see this —
          // but it lands in error reporting like other console warnings.
          // Passata 08: registerSW di virtual:pwa-register (vite-plugin-pwa
          // 1.3.0) non restituisce una promessa ma la funzione di
          // aggiornamento, quindi il .catch che c'era qui non partiva mai:
          // l'errore della registrazione arriva solo da onRegisterError.
          // onNeedReload vuoto: con registerType "autoUpdate", quando si attiva
          // un service worker nuovo il plugin fa window.location.reload() su
          // ogni pagina aperta (se onNeedReload manca), e chi sta scrivendo
          // (un cliente nuovo, una nota del coach: PwaRegister sta nella
          // radice) perde quello che ha scritto. Il service worker non tiene
          // in cache nessuna pagina, quindi la pagina aperta va avanti uguale
          // col service worker nuovo.
          mod.registerSW?.({
            immediate: true,
            onNeedReload: () => {},
            onRegisterError: (e: unknown) => console.warn("PWA SW registration failed", e),
          });
        },
      )
      .catch(() => {
        /* plugin non disponibile in questo ambiente */
      });
  }, []);

  return null;
}
