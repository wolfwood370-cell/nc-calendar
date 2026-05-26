import { Resend } from "npm:resend@4.0.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  to: string;
  subject: string;
  html: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, req);

  // Auth: only coach/admin may send transactional emails
  const auth = await requireAuth(req, ["coach", "admin"]);
  if (auth instanceof Response) return auth;

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return jsonResponse({ error: "RESEND_API_KEY non configurata" }, 500, req);

    // M6 (FULL_APP_AUDIT.md): per-caller sliding-window cap (default 20/min).
    // The RPC prunes its own history as it goes, so the table never grows
    // unbounded. Fail-closed on RPC errors — better to surface a transient
    // 500 than to silently un-rate-limit on infra hiccups.
    const { data: allowed, error: rlErr } = await auth.admin.rpc("check_email_rate_limit", {
      p_user_id: auth.userId,
    });
    if (rlErr) {
      console.error("[send-email] rate-limit RPC failed", rlErr);
      return jsonResponse({ error: "Errore controllo limite invio." }, 500, req);
    }
    if (!allowed) {
      console.warn("[send-email] rate-limit exceeded for user", auth.userId);
      return jsonResponse({ error: "Troppe email inviate. Riprova tra un minuto." }, 429, req);
    }

    const { to, subject, html } = (await req.json()) as Payload;
    if (!to || !subject || !html) {
      return jsonResponse({ error: "Parametri mancanti: to, subject, html" }, 400, req);
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return jsonResponse({ error: "Indirizzo email non valido" }, 400, req);
    }

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: "NC Training Systems <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    });

    if (error) {
      // MED-D1 (audit 2026-05-26): non propaghiamo `error.message` di Resend
      // al client. Le risposte error di Resend possono contenere stringhe
      // verbose con header API o frammenti di payload sensibili. Il dettaglio
      // resta nei logs server-side (admin-only) per debug. Status 502 segnala
      // upstream failure così il frontend mostra il toast di errore.
      console.error("[send-email] Resend error:", error);
      return jsonResponse({ error: "Invio email fallito." }, 502, req);
    }

    return jsonResponse({ ok: true, id: data?.id }, 200, req);
  } catch (err) {
    // MED-D1: stesso ragionamento del catch sopra. Una eccezione non
    // controllata (es. Resend SDK throw, JSON parsing) può portarsi
    // dietro lo stack o variabili sensibili nel message. Generic public
    // message, dettaglio nei logs.
    console.error("[send-email] error", err);
    return jsonResponse({ error: "Errore interno del server." }, 500, req);
  }
});
