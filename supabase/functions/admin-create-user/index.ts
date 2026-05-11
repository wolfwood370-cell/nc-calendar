// Edge function: il Coach crea manualmente un account Cliente (email + password temp).
// Usa la service_role key per evitare il logout della sessione corrente del Coach.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Permesso negato" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, first_name, last_name } = (await req.json()) as Payload;
    if (!email || !password || !first_name || !last_name) {
      return new Response(JSON.stringify({ error: "Campi mancanti" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: invErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Crea l'utente con email già confermata
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Creazione fallita" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safety net: assicura che il profilo esista e sia collegato al coach
    await admin
      .from("profiles")
      .upsert({
        id: created.user.id,
        email: cleanEmail,
        full_name: fullName,
        coach_id: coachId,
      }, { onConflict: "id" });

    return new Response(JSON.stringify({ ok: true, user_id: created.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
