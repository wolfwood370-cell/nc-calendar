/// <reference types="vite/client" />

// Custom env var types — Vite carica solo le VITE_* prefixed nel client bundle.
interface ImportMetaEnv {
  /** DSN Sentry per error tracking client-side. Settato via Lovable env var. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
