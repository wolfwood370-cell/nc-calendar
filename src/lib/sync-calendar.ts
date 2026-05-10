import { supabase } from "@/integrations/supabase/client";

interface SyncInput {
  action: "create" | "cancel";
  coachId: string;
  clientName: string;
  sessionLabel: string;
  startISO: string;
  endISO?: string;
  meetingLink?: string | null;
}

/**
 * Invoca l'edge function `sync-calendar` in modo fire-and-forget.
 * Eventuali errori sono loggati ma non interrompono mai il flusso utente.
 */
export function syncCalendar(input: SyncInput): void {
  void supabase.functions
    .invoke("sync-calendar", {
      body: {
        action: input.action,
        coach_id: input.coachId,
        client_name: input.clientName,
        session_label: input.sessionLabel,
        start_iso: input.startISO,
        end_iso: input.endISO,
        meeting_link: input.meetingLink ?? null,
      },
    })
    .catch((err) => console.error("sync-calendar invoke failed", err));
}
