import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailArgs) {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: { to, subject, html },
    });
    if (error) throw error;
    return { ok: true as const, id: (data as { id?: string } | null)?.id };
  } catch (err) {
    console.error("[email] invio fallito", err);
    toast.error("Errore durante l'invio dell'email", {
      description: err instanceof Error ? err.message : "Riprova più tardi.",
    });
    return { ok: false as const };
  }
}

function appUrl(path: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path}`;
  }
  return path;
}

function baseLayout(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
          <tr><td style="padding:28px 32px 8px;">
            <h1 style="margin:0;font-size:20px;font-weight:600;color:#0f172a;">${title}</h1>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#334155;">
            ${body}
            ${cta ? `<div style="margin-top:24px;"><a href="${cta.href}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:500;">${cta.label}</a></div>` : ""}
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

export interface InvitationEmailParams {
  to: string;
  clientName?: string | null;
  coachName: string;
}

export async function sendInvitationEmail(params: InvitationEmailParams) {
  const greeting = params.clientName ? `Ciao ${params.clientName},` : "Ciao,";
  const html = baseLayout(
    "Sei stato invitato su NC Training Systems",
    `<p>${greeting}</p>
     <p>Sei stato invitato su <strong>NC Training Systems</strong> dal tuo Coach <strong>${params.coachName}</strong>.</p>
     <p>Clicca sul pulsante qui sotto per creare il tuo account utilizzando questa email.</p>`,
    { label: "Crea il tuo account", href: appUrl("/auth") },
  );
  return sendEmail({
    to: params.to,
    subject: `${params.coachName} ti ha invitato su NC Training Systems`,
    html,
  });
}

export interface BookingEmailParams {
  to: string;
  recipientName?: string | null;
  sessionLabel: string;
  scheduledAt: Date;
  coachName: string;
  clientName: string;
}

export async function sendBookingConfirmationEmail(params: BookingEmailParams) {
  const when = params.scheduledAt.toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const greeting = params.recipientName ? `Ciao ${params.recipientName},` : "Ciao,";
  const html = baseLayout(
    "Conferma Appuntamento",
    `<p>${greeting}</p>
     <p><strong>Conferma Appuntamento:</strong> hai prenotato una sessione <strong>${params.sessionLabel}</strong> per il <strong>${when}</strong>.</p>
     <p style="margin-top:16px;">Coach: <strong>${params.coachName}</strong><br/>Cliente: <strong>${params.clientName}</strong></p>`,
    { label: "Vai alla piattaforma", href: appUrl("/") },
  );
  return sendEmail({
    to: params.to,
    subject: `Conferma Appuntamento — ${params.sessionLabel}`,
    html,
  });
}
