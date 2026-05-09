/**
 * Placeholder email service.
 * In produzione queste funzioni invocheranno una Edge Function (es. Resend via Supabase).
 * Per ora loggano il payload in console e ritornano una risposta di successo simulata.
 */

interface EmailResponse {
  ok: true;
  id: string;
}

async function fakeSend(payload: Record<string, unknown>): Promise<EmailResponse> {
  // simula latenza di rete
  await new Promise((r) => setTimeout(r, 500));
  // eslint-disable-next-line no-console
  console.info("[email] invio simulato", payload);
  return { ok: true, id: crypto.randomUUID() };
}

export interface InvitationEmailParams {
  to: string;
  clientName?: string | null;
  coachName: string;
}

export async function sendInvitationEmail(params: InvitationEmailParams) {
  return fakeSend({
    type: "client_invitation",
    to: params.to,
    subject: `Sei stato invitato da ${params.coachName}`,
    body: `Ciao ${params.clientName ?? ""}, ${params.coachName} ti ha invitato sulla piattaforma. Registrati con questa email per iniziare.`,
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
    hour: "2-digit",
    minute: "2-digit",
  });
  return fakeSend({
    type: "booking_confirmation",
    to: params.to,
    subject: `Prenotazione confermata — ${params.sessionLabel}`,
    body: `Ciao ${params.recipientName ?? ""}, la sessione "${params.sessionLabel}" tra ${params.coachName} e ${params.clientName} è confermata per ${when}.`,
  });
}
