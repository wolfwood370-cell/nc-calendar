import { Resend } from "npm:resend@4.0.1";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

// Wave N (audit 2026-06-03):
//  - N1: il payload non accetta più `html` raw. Solo template predefiniti
//        renderizzati server-side. Un coach autenticato non può iniettare
//        HTML/JS arbitrario nelle email inviate via dominio mittente.
//  - N3: ogni `subject` passa per `safeSubject()` che strappa CR/LF/TAB
//        per prevenire SMTP header injection.
//  - N10: regex email più stringente + length cap 254 (RFC 5321).

type TemplateId = "invitation" | "booking_confirmation";

interface InvitationParams {
  clientName?: string | null;
  coachName: string;
  appOrigin?: string;
}
interface BookingConfirmationParams {
  recipientName?: string | null;
  sessionLabel: string;
  scheduledAtISO: string;
  coachName: string;
  clientName: string;
  appOrigin?: string;
}

interface Payload {
  to: string;
  template: TemplateId;
  params: InvitationParams | BookingConfirmationParams;
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function esc(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeSubject(s: string): string {
  return String(s).replace(/[\r\n\t]/g, " ").trim().slice(0, 200);
}

function safeOrigin(o: string | undefined): string {
  if (!o || typeof o !== "string") return "";
  if (!/^https?:\/\/[A-Za-z0-9.\-:]+(\/.*)?$/.test(o)) return "";
  return o.replace(/\/+$/, "");
}

function baseLayout(title: string, body: string, cta?: { label: string; href: string }): string {
  const ctaHtml = cta
    ? `<div style="margin-top:24px;"><a href="${esc(cta.href)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;">${esc(cta.label)}</a></div>`
    : "";
  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:20px;font-weight:600;color:#0f172a;">${esc(title)}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#334155;">
            ${body}
            ${ctaHtml}
          </td></tr>
          <tr><td style="padding:16px 32px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
            NC Training Systems · Email automatica, non rispondere a questo messaggio.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderInvitation(p: InvitationParams): { subject: string; html: string } {
  const greeting = p.clientName ? `Ciao ${esc(p.clientName)},` : "Ciao,";
  const coachName = esc(p.coachName);
  const origin = safeOrigin(p.appOrigin);
  const body = `<p>${greeting}</p>
     <p>Sei stato invitato su <strong>NC Training Systems</strong> dal tuo Coach <strong>${coachName}</strong>.</p>
     <p>Clicca sul pulsante qui sotto per creare il tuo account utilizzando questa email.</p>`;
  const html = baseLayout("Sei stato invitato su NC Training Systems", body, {
    label: "Crea il tuo account",
    href: `${origin}/auth`,
  });
  return {
    subject: safeSubject(`${p.coachName} ti ha invitato su NC Training Systems`),
    html,
  };
}

function renderBookingConfirmation(p: BookingConfirmationParams): { subject: string; html: string } {
  const when = new Date(p.scheduledAtISO).toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
  const greeting = p.recipientName ? `Ciao ${esc(p.recipientName)},` : "Ciao,";
  const sessionLabel = esc(p.sessionLabel);
  const coachName = esc(p.coachName);
  const clientName = esc(p.clientName);
  const origin = safeOrigin(p.appOrigin);
  const body = `<p>${greeting}</p>
     <p><strong>Sessione prenotata:</strong> hai prenotato una sessione <strong>${sessionLabel}</strong> per il <strong>${esc(when)}</strong>.</p>
     <p style="margin-top:16px;">Coach: <strong>${coachName}</strong><br/>Cliente: <strong>${clientName}</strong></p>`;
  const html = baseLayout("Sessione Prenotata", body, {
    label: "Vai alla piattaforma",
    href: `${origin}/`,
  });
  return {
    subject: safeSubject(`Sessione Prenotata — ${p.sessionLabel}`),
    html,
  };
}

function validateParams(template: TemplateId, params: unknown): string | null {
  if (!params || typeof params !== "object") return "params mancanti";
  const p = params as Record<string, unknown>;
  const isStr = (v: unknown, max = 200) =>
    typeof v === "string" && v.length > 0 && v.length <= max;
  if (template === "invitation") {
    if (!isStr(p.coachName, 200)) return "coachName richiesto (max 200)";
    if (p.clientName != null && (typeof p.clientName !== "string" || p.clientName.length > 200))
      return "clientName troppo lungo";
    return null;
  }
  if (template === "booking_confirmation") {
    if (!isStr(p.sessionLabel, 200)) return "sessionLabel richiesto";
    if (!isStr(p.coachName, 200)) return "coachName richiesto";
    if (!isStr(p.clientName, 200)) return "clientName richiesto";
    if (!isStr(p.scheduledAtISO, 64)) return "scheduledAtISO richiesto";
    const d = new Date(p.scheduledAtISO as string);
    if (isNaN(d.getTime())) return "scheduledAtISO non valido";
    if (p.recipientName != null && (typeof p.recipientName !== "string" || p.recipientName.length > 200))
      return "recipientName troppo lungo";
    return null;
  }
  return "template non riconosciuto";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, req);

  const auth = await requireAuth(req, ["coach", "admin", "client"]);
  if (auth instanceof Response) return auth;

  try {
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return jsonResponse({ error: "RESEND_API_KEY non configurata" }, 500, req);

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

    const body = (await req.json()) as Partial<Payload>;
    const to = String(body.to ?? "").trim();
    const template = body.template as TemplateId | undefined;
    const params = body.params;

    if (!to || !template) {
      return jsonResponse({ error: "Parametri mancanti: to, template" }, 400, req);
    }
    if (to.length > 254 || !EMAIL_RE.test(to)) {
      return jsonResponse({ error: "Indirizzo email non valido" }, 400, req);
    }
    const paramErr = validateParams(template, params);
    if (paramErr) return jsonResponse({ error: paramErr }, 400, req);

    // Authz per ruolo: client -> solo a sé; coach -> sé o propri clienti; admin -> qualunque.
    if (auth.role === "client") {
      const { data: u } = await auth.userClient.auth.getUser();
      if (u?.user?.email?.toLowerCase() !== to.toLowerCase()) {
        return jsonResponse({ error: "Permesso negato" }, 403, req);
      }
    } else if (auth.role === "coach") {
      const { data: self } = await auth.userClient.auth.getUser();
      const selfEmail = self?.user?.email?.toLowerCase() ?? "";
      const toLower = to.toLowerCase();
      if (selfEmail !== toLower) {
        // Wave 6 P1: escape SQL LIKE metacharacters (`_`, `%`, `\`) prima di
        // passarli a `.ilike`. Senza escape, un coach può inserire pattern
        // come `a_min@example.com` e matchare email di clienti non propri.
        // Usiamo `\` come escape char (default Postgres LIKE).
        const escapedTo = to.replace(/([\\%_])/g, "\\$1");
        const { data: client } = await auth.admin
          .from("profiles")
          .select("id")
          .eq("coach_id", auth.userId)
          .ilike("email", escapedTo)
          .maybeSingle();
        if (!client) {
          console.warn("[send-email] coach attempted to email non-client", {
            coach: auth.userId,
            to: toLower,
          });
          return jsonResponse(
            { error: "Permesso negato: il destinatario non è tra i tuoi clienti." },
            403,
            req,
          );
        }
      }
    }

    const rendered =
      template === "invitation"
        ? renderInvitation(params as InvitationParams)
        : renderBookingConfirmation(params as BookingConfirmationParams);

    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: "NC Training Systems <onboarding@resend.dev>",
      to: [to],
      subject: rendered.subject,
      html: rendered.html,
    });

    if (error) {
      console.error("[send-email] Resend error:", error);
      return jsonResponse({ error: "Invio email fallito." }, 502, req);
    }

    return jsonResponse({ ok: true, id: data?.id }, 200, req);
  } catch (err) {
    console.error("[send-email] error", err);
    return jsonResponse({ error: "Errore interno del server." }, 500, req);
  }
});
