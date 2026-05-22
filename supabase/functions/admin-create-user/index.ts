// Edge function: il Coach crea manualmente un account Cliente (email + password temp).
// Usa la service_role key per evitare il logout della sessione corrente del Coach.
//
// Audit 2026-05-22 H1: previously this function had a local
// `corsHeaders = { "Access-Control-Allow-Origin": "*", ... }` block that
// bypassed the shared CORS hardening from audit phase 1 (C3). Now it uses
// the shared helper which respects ALLOWED_ORIGIN and degrades to the
// production origin instead of "*".
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { assertUuid } from "../_shared/auth.ts";

interface Payload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identifica il Coach chiamante dall'Authorization header
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return jsonResponse({ error: "Non autenticato" }, 401);
    }
    const coachId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verifica che il chiamante sia coach o admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", coachId)
      .maybeSingle();
    const role = (roleRow as { role?: string } | null)?.role;
    if (role !== "coach" && role !== "admin") {
      return jsonResponse({ error: "Permesso negato" }, 403);
    }

    const { email, password, first_name, last_name } = (await req.json()) as Payload;
    if (!email || !password || !first_name || !last_name) {
      return jsonResponse({ error: "Campi mancanti" }, 400);
    }
    // Audit 2026-05-22 M2: defensive UUID format check on the caller id —
    // here it comes from getUser() so it's already a real UUID, but
    // running it through assertUuid() makes the pattern uniform with the
    // other Edge Functions and catches future code paths that might
    // accept it from a payload.
    try {
      assertUuid(coachId, "coach_id");
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Invalid id" }, 400);
    }

    const fullName = `${first_name.trim()} ${last_name.trim()}`.trim();
    const cleanEmail = email.toLowerCase().trim();

    // Prepara un invito (il trigger handle_new_user lo richiede per assegnare role/coach)
    const { error: invErr } = await admin.from("client_invitations").insert({
      email: cleanEmail,
      full_name: fullName,
      coach_id: coachId,
      status: "pending",
    });
    if (invErr && !String(invErr.message).toLowerCase().includes("duplicate")) {
      return jsonResponse({ error: invErr.message }, 400);
    }

    // Crea l'utente con email già confermata
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) {
      return jsonResponse({ error: createErr?.message ?? "Creazione fallita" }, 400);
    }

    // Safety net: assicura che il profilo esista e sia collegato al coach
    await admin.from("profiles").upsert(
      {
        id: created.user.id,
        email: cleanEmail,
        full_name: fullName,
        coach_id: coachId,
      },
      { onConflict: "id" },
    );

    return jsonResponse({ ok: true, user_id: created.user.id }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    console.error("admin-create-user: unexpected error", { message: msg });
    return jsonResponse({ error: msg }, 500);
  }
});
