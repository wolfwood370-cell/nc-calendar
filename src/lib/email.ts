import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Wave N (audit 2026-06-03) — N1/N3:
// Il rendering dei template e la sanitizzazione del subject avvengono
// SERVER-SIDE nella edge function `send-email`. Qui passiamo solo
// `template` + `params` strutturati. Niente HTML raw client-side.

type SendArgs =
  | {
      to: string;
      template: "invitation";
      params: { clientName?: string | null; coachName: string; appOrigin?: string };
    }
  | {
      to: string;
      template: "booking_confirmation";
      params: {
        recipientName?: string | null;
        sessionLabel: string;
        scheduledAtISO: string;
        coachName: string;
        clientName: string;
        appOrigin?: string;
      };
    };

async function sendEmail(args: SendArgs) {
  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: args,
    });
    if (error) throw error;
    return { ok: true as const, id: (data as { id?: string } | null)?.id };
  } catch (err) {
    // Non esponiamo all'utente la stringa tecnica
    // "Edge Function returned a non-2xx status code": logghiamo lato dev
    // e mostriamo un messaggio in italiano comprensibile.
    console.error("[email] invio fallito", err);
    toast.error("Impossibile inviare l'email di conferma", {
      description: "La prenotazione è comunque confermata.",
    });
    return { ok: false as const };
  }
}

function currentOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export interface InvitationEmailParams {
  to: string;
  clientName?: string | null;
  coachName: string;
}

export async function sendInvitationEmail(params: InvitationEmailParams) {
  return sendEmail({
    to: params.to,
    template: "invitation",
    params: {
      clientName: params.clientName ?? null,
      coachName: params.coachName,
      appOrigin: currentOrigin(),
    },
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
  return sendEmail({
    to: params.to,
    template: "booking_confirmation",
    params: {
      recipientName: params.recipientName ?? null,
      sessionLabel: params.sessionLabel,
      scheduledAtISO: params.scheduledAt.toISOString(),
      coachName: params.coachName,
      clientName: params.clientName,
      appOrigin: currentOrigin(),
    },
  });
}
