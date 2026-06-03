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

// Wave N (audit 2026-06-03):
//  - N2: validazione email/password/nomi prima della creazione utente.
//  - N7: cap di lunghezza su nomi (DoS via payload enorme).
//  - N4: catch finale non propaga `e.message` al client.
//  - N12: rilevamento duplicate via SQLSTATE 23505 invece di substring match.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function validateInput(p: Partial<Payload>): string | null {
  const email = String(p.email ?? "").trim();
  const password = String(p.password ?? "");
  const first = String(p.first_name ?? "").trim();
  const last = String(p.last_name ?? "").trim();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return "Email non valida";
  if (!password || password.length < 8 || password.length > 72)
    return "La password deve avere tra 8 e 72 caratteri";
  if (!first || first.length > 100) return "Nome richiesto (max 100 caratteri)";
  if (!last || last.length > 100) return "Cognome richiesto (max 100 caratteri)";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, req);

  // P8 (Wave 5): cap body size prima di req.json() per evitare memory pressure.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    return jsonResponse({ error: "Payload troppo grande" }, 413, req);
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
      return jsonResponse({ error: "Non autenticato" }, 401, req);
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
      return jsonResponse({ error: "Permesso negato" }, 403, req);
    }

    const payload = (await req.json()) as Partial<Payload>;
    const validationErr = validateInput(payload);
    if (validationErr) {
      return jsonResponse({ error: validationErr }, 400, req);
    }
    const { email, password, first_name, last_name } = payload as Payload;

    try {
      assertUuid(coachId, "coach_id");
    } catch (e) {
      return jsonResponse({ error: e instanceof Error ? e.message : "Invalid id" }, 400, req);
    }

    const fullName = `${first_name.trim()} ${last_name.trim()}`.trim();
    const cleanEmail = email.toLowerCase().trim();

    // Prepara un invito (il trigger handle_new_user lo richiede per assegnare role/coach).
    // N12: rilevamento duplicate via SQLSTATE 23505, non substring.
    const { error: invErr } = await admin.from("client_invitations").insert({
      email: cleanEmail,
      full_name: fullName,
      coach_id: coachId,
      status: "pending",
    });
    if (invErr && (invErr as { code?: string }).code !== "23505") {
      console.error("admin-create-user: invitation insert failed", { code: (invErr as { code?: string }).code });
      return jsonResponse({ error: "Impossibile creare l'invito." }, 400, req);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr || !created.user) {
      // N4: niente messaggio interno al client. Log server-side.
      console.error("admin-create-user: createUser failed", { message: createErr?.message });
      const isDuplicate = /already|exists|registered/i.test(createErr?.message ?? "");
      return jsonResponse(
        { error: isDuplicate ? "Email già registrata." : "Creazione utente fallita." },
        400,
        req,
      );
    }

    await admin.from("profiles").upsert(
      {
        id: created.user.id,
        email: cleanEmail,
        full_name: fullName,
        coach_id: coachId,
      },
      { onConflict: "id" },
    );

    return jsonResponse({ ok: true, user_id: created.user.id }, 200, req);
  } catch (e) {
    // N4: log server-side, messaggio generico al client.
    const msg = e instanceof Error ? e.message : "Errore sconosciuto";
    console.error("admin-create-user: unexpected error", { message: msg });
    return jsonResponse({ error: "Errore interno. Riprova." }, 500, req);
  }
});
