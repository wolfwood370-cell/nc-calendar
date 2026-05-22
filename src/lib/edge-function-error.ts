// ----------------------------------------------------------------------------
// parseEdgeError — extract a useful message from a Supabase Edge Function
// error.
// ----------------------------------------------------------------------------
// `supabase.functions.invoke()` swallows the response body when the function
// returns a non-2xx status code and surfaces a generic
// `FunctionsHttpError("Edge Function returned a non-2xx status code")`.
// The original response is kept on the error's `context` property, so we
// can read it back and prefer the server-provided `error` field — which is
// what every Edge Function in this repo emits via the `jsonResponse({ error
// }, status)` helper.
//
// Fallbacks, in order:
//   1. body.error (string)            → "Cliente non trovato"
//   2. body.message (string)          → covers Supabase / generic shapes
//   3. raw response text (truncated)  → last resort for non-JSON bodies
//   4. err.message                    → generic FunctionsHttpError text
//   5. String(err)                    → if all else fails
//
// Always returns a non-empty string ready to feed into a toast description.
// ----------------------------------------------------------------------------

export async function parseEdgeError(err: unknown): Promise<string> {
  const fallback =
    err instanceof Error
      ? err.message || "Errore sconosciuto"
      : String(err ?? "Errore sconosciuto");

  if (!err || typeof err !== "object" || !("context" in err)) {
    return fallback;
  }

  const ctx = (err as { context?: unknown }).context;
  if (!(ctx instanceof Response)) return fallback;

  // .clone() so callers that also want to read the body later don't get a
  // "body already consumed" error.
  try {
    const body = (await ctx.clone().json()) as Record<string, unknown> | null;
    if (body && typeof body === "object") {
      const e = body.error;
      if (typeof e === "string" && e.length > 0) return e;
      const m = body.message;
      if (typeof m === "string" && m.length > 0) return m;
    }
  } catch {
    // not JSON; fall through
  }

  try {
    const text = (await ctx.clone().text()).trim();
    if (text.length > 0) return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  } catch {
    /* noop */
  }

  return fallback;
}
