import { Resend } from "npm:resend@4.0.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  to: string;
  subject: string;
  html: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Auth: only coach/admin may send transactional emails
  const auth = await requireAuth(req, ["coach", "admin"]);
  if (auth instanceof Response) return auth;

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return jsonResponse({ error: "RESEND_API_KEY non configurata" }, 500);

    const { to, subject, html } = (await req.json()) as Payload;
    if (!to || !subject || !html) {
      return jsonResponse({ error: "Parametri mancanti: to, subject, html" }, 400);
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return jsonResponse({ error: "Indirizzo email non valido" }, 400);
    }

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: "NC Training Systems <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    });

    if (error) {
      console.error("[send-email] Resend error:", error);
      return jsonResponse({ error: error.message ?? "Errore Resend" }, 502);
    }

    return jsonResponse({ ok: true, id: data?.id });
  } catch (err) {
    console.error("[send-email] error", err);
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return jsonResponse({ error: message }, 500);
  }
});
