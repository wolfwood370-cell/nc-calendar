// ----------------------------------------------------------------------------
// Sentry error tracking — client-side only.
// ----------------------------------------------------------------------------
// Inizializzato in RootComponent (src/routes/__root.tsx) via useEffect dopo
// l'idratazione. No-op se VITE_SENTRY_DSN non è settato (dev/staging senza
// quota). Performance monitoring abilitato a 10% sample rate per restare
// dentro al free tier (5K events/month). Session Replay disabilitato — può
// essere abilitato in futuro alzando replaysSessionSampleRate.
// ----------------------------------------------------------------------------

import * as Sentry from "@sentry/react";

let initialized = false;

/**
 * Init idempotente. Da chiamare una sola volta nel client-side mount
 * (RootComponent useEffect). Safe to call multiple times — guard interno
 * impedisce re-init.
 */
export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // Nessun DSN configurato → silent skip. Tipico in dev locale o staging
    // senza quota. Niente errori in console.
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Performance tracing al 10% per stare in free tier. Alzare se serve
    // più visibilità su slow page loads.
    tracesSampleRate: 0.1,
    // Session Replay disabilitato (extra quota cost). Abilitare se serve
    // riprodurre bug visivi: replaysOnErrorSampleRate: 1.0
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    ignoreErrors: [
      // ResizeObserver noise — Chrome bug benigno, non actionable
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // Promise rejections senza Error object — di solito da extensions
      "Non-Error promise rejection captured",
      // Network errors (utente offline / connessione persa) — non actionable
      "NetworkError",
      "Failed to fetch",
      "Load failed",
      // Browser extensions e content script errors
      "chrome-extension://",
      "moz-extension://",
    ],
    beforeSend(event) {
      // Filtra errori da localhost/dev — mai inviati a Sentry quota.
      if (event.request?.url?.includes("localhost")) return null;
      return event;
    },
  });

  // Esponi Sentry su window per testing rapido da DevTools console:
  //   Sentry.captureException(new Error("test"))
  if (typeof window !== "undefined") {
    (window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;
  }
}

/** Re-export comune per uso esterno (es. catch block manuale). */
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
export const setUser = Sentry.setUser;
