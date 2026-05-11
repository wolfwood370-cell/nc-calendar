// Shared auth helpers for edge functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse } from "./cors.ts";

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
    return jsonResponse({ error: "Non autenticato" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return jsonResponse({ error: "Non autenticato" }, 401);
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
      return jsonResponse({ error: "Permesso negato" }, 403);
    }
  }

  return { userId, role, userClient, admin };
}
