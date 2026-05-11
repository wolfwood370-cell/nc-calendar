// Edge function: il Coach elimina definitivamente un Cliente e tutti i suoi dati.
// Richiede service_role per cancellare l'utente in auth.users.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  client_id: string;
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
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();
    const role = (roleRow as { role?: string } | null)?.role;
    if (role !== "coach" && role !== "admin") {
      return new Response(JSON.stringify({ error: "Permesso negato" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { client_id } = (await req.json()) as Payload;
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id mancante" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verifica ownership: il cliente deve appartenere al coach (admin bypassa)
    const { data: profile } = await admin
      .from("profiles")
      .select("id, coach_id, email")
      .eq("id", client_id)
      .maybeSingle();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Cliente non trovato" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role !== "admin" && profile.coach_id !== callerId) {
      return new Response(JSON.stringify({ error: "Permesso negato su questo cliente" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Recupera blocchi del cliente per cancellare allocazioni a cascata
    const { data: blocks } = await admin
      .from("training_blocks")
      .select("id")
      .eq("client_id", client_id);
    const blockIds = (blocks ?? []).map((b: { id: string }) => b.id);

    if (blockIds.length > 0) {
      await admin.from("block_allocations").delete().in("block_id", blockIds);
    }
    await admin.from("bookings").delete().eq("client_id", client_id);
    await admin.from("training_blocks").delete().eq("client_id", client_id);
    await admin.from("push_subscriptions").delete().eq("profile_id", client_id);
    if (profile.email) {
      await admin.from("client_invitations").delete().ilike("email", profile.email);
    }
    await admin.from("user_roles").delete().eq("user_id", client_id);
    await admin.from("profiles").delete().eq("id", client_id);

    const { error: delErr } = await admin.auth.admin.deleteUser(client_id);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
