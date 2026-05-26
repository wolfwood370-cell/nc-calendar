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

// ============================================================================
// Context enrichment helpers (audit 2026-05-27)
// ============================================================================
// Ogni evento Sentry deve includere CHI ha causato il bug (user_id + role) e
// DOVE stava (route). Senza questi tag il dashboard Sentry mostra solo lo
// stack trace, costringendo a indovinare il context. Con questi tag posso
// filtrare per "tutti i crash dei client su /client/book" in 1 click.
//
// I 3 helper sono no-op se Sentry non è inizializzato (VITE_SENTRY_DSN
// mancante in dev locale). I call site possono chiamarli incondizionatamente.

/**
 * Imposta l'identità Sentry dell'utente loggato. `null` per signOut
 * (Sentry resetta anche email + tag pregressi). Chiamato dall'AuthProvider
 * a ogni cambio di sessione.
 */
export function setSentryUser(user: { id: string; email?: string | null } | null): void {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
  });
}

/**
 * Tag `role` per filtrare bug per fascia utente (coach/client/admin).
 * "anonymous" quando l'utente non è loggato. Risetta lo stesso tag a
 * ogni cambio ruolo (es. login → fetch role → tag aggiornato).
 */
export function setSentryRoleTag(role: string | null): void {
  if (!initialized) return;
  Sentry.setTag("role", role ?? "anonymous");
}

/**
 * Tag `route` per sapere su quale pagina è esploso il bug. Aggiornato
 * a ogni navigazione (RootComponent hooka useRouterState). Esempio:
 * "/client/book" → vedo subito che il crash è del flow di prenotazione.
 */
export function setSentryRouteTag(routePath: string): void {
  if (!initialized) return;
  Sentry.setTag("route", routePath);
}
