// Shared auth helpers for edge functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "./cors.ts";

// Audit 2026-05-22 M2: input validation. Edge Function payloads carry
// caller-supplied IDs that get fed straight to SELECT/UPDATE/DELETE
// queries. supabase-js eventually returns 22P02 on a malformed UUID, but
// that surfaces to the client as a generic 400 with no useful description.
// Validating up front (and bailing cleanly) keeps callers honest and the
// logs cleaner. Throws on failure so call sites can do
// `try { assertUuid(id, "client_id") } catch (e) { return jsonResponse(..., 200, req) }`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error(`${fieldName} non è un UUID valido`);
  }
}

export interface AuthContext {
  userId: string;
  role: string | null;
  userClient: SupabaseClient;
  admin: SupabaseClient;
}

/**
 * Validates the caller's JWT. Returns either a Response (401/403) to short-circuit
 * the handler, or an AuthContext with userId, role and ready-to-use clients.
 *
 * @param req incoming request
 * @param requiredRoles optional list of roles allowed (e.g. ["coach","admin"]).
 *                     If omitted, any authenticated user is accepted.
 */
export async function requireAuth(
  req: Request,
  requiredRoles?: string[],
): Promise<AuthContext | Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Non autenticato" }, 401, req);
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return jsonResponse({ error: "Non autenticato" }, 401, req);
  }
  const userId = data.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let role: string | null = null;
  if (requiredRoles && requiredRoles.length > 0) {
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    role = (roleRow as { role?: string } | null)?.role ?? null;
    if (!role || !requiredRoles.includes(role)) {
      return jsonResponse({ error: "Permesso negato" }, 403, req);
    }
  }

  return { userId, role, userClient, admin };
}
