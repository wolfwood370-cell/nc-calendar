// Shared CORS helpers. The previous version exported a static `corsHeaders`
// object pinned to a single origin (defaulting to the production app URL).
// That blocks every other valid surface — the Lovable preview origin
// (`id-preview--<project>.lovable.app`), the stable project URL
// (`project--<project>.lovable.app`), and custom domains — with a CORS
// failure that surfaces in the browser as the generic
// "Failed to send a request to the Edge Function".
//
// Fix: compute headers per-request. We echo the request's Origin back
// only when it matches an allowlist (env-configured list ∪ production URL
// ∪ any `*.lovable.app` subdomain). For unknown origins we fall back to
// the production URL so the browser still sees a non-empty value but the
// preflight fails closed.
//
// API: callers now call `corsHeaders(req)` (function) instead of reading
// a static const. `jsonResponse(body, status, req)` accepts the request
// so it can attach the right headers.

const PROD_ORIGIN = "https://nc-calendar.lovable.app";
const ALLOWED_ORIGIN_ENV = Deno.env.get("ALLOWED_ORIGIN");

// Env-configured allowlist (comma-separated). Empty list = no extra origins.
const ENV_ALLOWLIST: string[] = ALLOWED_ORIGIN_ENV
  ? ALLOWED_ORIGIN_ENV.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === PROD_ORIGIN) return true;
  if (ENV_ALLOWLIST.includes(origin)) return true;
  // Auto-allow Lovable preview / stable project URLs:
  //   https://id-preview--<uuid>.lovable.app
  //   https://project--<uuid>.lovable.app
  //   https://project--<uuid>-dev.lovable.app
  //   https://*.lovable.app (custom subdomains)
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    if (u.hostname === "lovable.app" || u.hostname.endsWith(".lovable.app")) return true;
  } catch {
    return false;
  }
  return false;
}

export function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get("Origin") ?? null;
  const allowOrigin = isAllowedOrigin(origin) ? origin! : PROD_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
