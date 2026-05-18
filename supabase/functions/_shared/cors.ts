// Shared CORS headers. C3 (FULL_APP_AUDIT.md): the previous fallback was
// "*", which silently opened every edge function to any origin whenever
// the ALLOWED_ORIGIN env var was unset or accidentally cleared. The new
// fallback is the production app URL, with a loud warning so operators
// notice the missing env in the function logs. ALLOWED_ORIGIN can still
// be set (single value or comma-separated list) to override per
// environment; an attempt to use it for preview deploys should rely on
// that explicit configuration, not on the "*" wildcard.
const PROD_ORIGIN = "https://nc-calendar.lovable.app";
const ALLOWED_ORIGIN_ENV = Deno.env.get("ALLOWED_ORIGIN");
if (!ALLOWED_ORIGIN_ENV) {
  console.warn(
    "[cors] ALLOWED_ORIGIN env var is not set; defaulting Access-Control-Allow-Origin " +
      `to "${PROD_ORIGIN}". Set ALLOWED_ORIGIN in Supabase secrets to lock CORS to a ` +
      "specific origin or comma-separated list of allowed origins per environment.",
  );
}
const ALLOWED_ORIGIN = ALLOWED_ORIGIN_ENV ?? PROD_ORIGIN;

export const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
