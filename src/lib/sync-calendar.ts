import { supabase } from "@/integrations/supabase/client";

interface CreateInput {
  action: "create";
  coachId: string;
  clientName: string;
  sessionLabel: string;
  startISO: string;
  endISO?: string;
  meetingLink?: string | null;
  color?: string | null;
}
interface CancelInput {
  action: "cancel";
  coachId: string;
  googleEventId?: string | null;
}
interface ImportHistoryInput {
  action: "import_history";
  coachId: string;
  rangeStartISO?: string;
  rangeEndISO?: string;
}
interface MirrorCheckInput {
  action: "mirror_check";
  coachId: string;
  rangeStartISO?: string;
  rangeEndISO?: string;
}

export type SyncInput = CreateInput | CancelInput | ImportHistoryInput | MirrorCheckInput;

function buildBody(input: SyncInput): Record<string, unknown> {
  const base = { action: input.action, coach_id: input.coachId };
  if (input.action === "create") {
    return {
      ...base,
      client_name: input.clientName,
      session_label: input.sessionLabel,
      start_iso: input.startISO,
      end_iso: input.endISO,
      meeting_link: input.meetingLink ?? null,
      color: input.color ?? null,
    };
  }
  if (input.action === "cancel") {
    return { ...base, google_event_id: input.googleEventId ?? null };
  }
  return {
    ...base,
    range_start_iso: input.rangeStartISO,
    range_end_iso: input.rangeEndISO,
  };
}

/** Fire-and-forget: errori loggati ma non bloccanti. */
export function syncCalendar(input: SyncInput): void {
  void supabase.functions
    .invoke("sync-calendar", { body: buildBody(input) })
    .catch((err) => console.error("sync-calendar invoke failed", err));
}

/** Awaitable: utile per import storico e mirror check. */
export async function syncCalendarAwait(input: SyncInput) {
  return supabase.functions.invoke("sync-calendar", { body: buildBody(input) });
}
