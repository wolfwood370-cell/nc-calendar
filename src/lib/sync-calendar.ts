import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// M7: surface Google Calendar sync failures to the user. Previously every
// call site swallowed errors into console.error and the user was told their
// booking / cancellation had succeeded — even when their mirror Google
// Calendar was out of sync. We now emit a non-blocking warning toast with a
// stable id so repeated failures collapse into a single visible message
// instead of stacking. Callers can opt out by passing { silent: true } for
// background syncs where a user-visible message would be noise.
function notifySyncFailure(action: SyncInput["action"], err: unknown) {
  const description =
    err instanceof Error ? err.message : "Riprova più tardi o ricollega l'account Google.";
  const verb = action === "cancel" ? "cancellare l'evento su" : "sincronizzare con";
  toast.warning(`Impossibile ${verb} Google Calendar`, {
    id: "gcal-sync-warning",
    description,
  });
}

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
  late?: boolean;
  clientName?: string;
  sessionLabel?: string;
}
interface UpdateInput {
  action: "update";
  coachId: string;
  googleEventId: string;
  startISO: string;
  endISO?: string;
  clientName?: string;
  sessionLabel?: string;
  color?: string | null;
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

export type SyncInput =
  | CreateInput
  | CancelInput
  | UpdateInput
  | ImportHistoryInput
  | MirrorCheckInput;

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
    return {
      ...base,
      google_event_id: input.googleEventId ?? null,
      late: input.late ?? false,
      client_name: input.clientName,
      session_label: input.sessionLabel,
    };
  }
  if (input.action === "update") {
    return {
      ...base,
      google_event_id: input.googleEventId,
      start_iso: input.startISO,
      end_iso: input.endISO,
      client_name: input.clientName,
      session_label: input.sessionLabel,
      color: input.color ?? null,
    };
  }
  return {
    ...base,
    range_start_iso: input.rangeStartISO,
    range_end_iso: input.rangeEndISO,
  };
}

/** Fire-and-forget: errori loggati e segnalati con toast non bloccante. */
async function invokeWithAuth(input: SyncInput) {
  // The edge function requires a Bearer token (verify_jwt=false but the
  // handler itself calls requireAuth). supabase.functions.invoke should
  // attach it automatically when a session exists, but on cold loads /
  // token refreshes the header can be missing — leading to 401
  // "Non autenticato". Read the session explicitly and attach it.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return supabase.functions.invoke("sync-calendar", {
    body: buildBody(input),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function syncCalendar(input: SyncInput, options: { silent?: boolean } = {}): void {
  void invokeWithAuth(input).catch((err) => {
    console.error("sync-calendar invoke failed", err);
    if (!options.silent) notifySyncFailure(input.action, err);
  });
}

/** Awaitable: utile per import storico e mirror check. */
export async function syncCalendarAwait(input: SyncInput) {
  return invokeWithAuth(input);
}

/** Toast helper exported so awaitable callers can reuse the same UX. */
export function reportSyncFailure(action: SyncInput["action"], err: unknown): void {
  notifySyncFailure(action, err);
}
