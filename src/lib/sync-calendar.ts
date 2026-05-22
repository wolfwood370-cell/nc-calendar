import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseEdgeError } from "@/lib/edge-function-error";

// ----------------------------------------------------------------------------
// Auto-sync throttle (P1 of the sync overhaul)
// ----------------------------------------------------------------------------
// Both auto-sync useEffects in trainer.calendar.tsx fire on every mount of
// the calendar route — including silent token refreshes, fast navigation
// back to /trainer/calendar, and PWA wake-up. Without a gate every visit
// burned a Google Calendar API quota slot. A coach who tabs in and out of
// the calendar a dozen times per hour would chew through the quota by
// mid-morning.
//
// The throttle persists `last_gcal_sync` (ms since epoch) in localStorage.
// shouldSkipAutoSync() returns true when the last successful auto-sync is
// less than 10 minutes old; markAutoSyncDone() stamps the timestamp on
// completion. The manual "Sincronizza ora" button explicitly bypasses
// this gate (see clearAutoSyncThrottle + the call site in
// trainer.integrations.tsx) so a coach who needs fresh data right now
// can always force a refetch.

const AUTO_SYNC_KEY = "last_gcal_sync";
const AUTO_SYNC_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function readTimestamp(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTO_SYNC_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    // localStorage can throw in private-browsing modes; treat as "no record".
    return null;
  }
}

function writeTimestamp(ms: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_SYNC_KEY, String(ms));
  } catch {
    // Quota exceeded / disabled — best-effort persistence.
  }
}

export function shouldSkipAutoSync(now: number = Date.now()): boolean {
  const ts = readTimestamp();
  if (ts === null) return false;
  return now - ts < AUTO_SYNC_WINDOW_MS;
}

export function markAutoSyncDone(now: number = Date.now()): void {
  writeTimestamp(now);
}

/** Manual sync path: clear the gate so the next render-time check passes. */
export function clearAutoSyncThrottle(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTO_SYNC_KEY);
  } catch {
    /* noop */
  }
}

// M7: surface Google Calendar sync failures to the user. Previously every
// call site swallowed errors into console.error and the user was told their
// booking / cancellation had succeeded — even when their mirror Google
// Calendar was out of sync. We now emit a non-blocking warning toast with a
// stable id so repeated failures collapse into a single visible message
// instead of stacking. Callers can opt out by passing { silent: true } for
// background syncs where a user-visible message would be noise.
async function notifySyncFailure(action: SyncInput["action"], err: unknown) {
  // parseEdgeError walks err.context (the original Response) so the toast
  // shows the actual server message ("Google Calendar non collegato",
  // "Token scaduto, riconnetti", "Quota Google esaurita", …) instead of
  // the generic "Edge Function returned a non-2xx status code" that
  // supabase.functions.invoke exposes by default.
  const description = await parseEdgeError(err);
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
  // Native Google Meet integration: when true the server asks Google
  // to spin up a Meet room as part of the event insert, captures the
  // returned URL, and writes it onto the matching booking row.
  // bookingId is required for the write-back to land — otherwise the
  // Meet URL only comes back in the response.
  requestMeet?: boolean;
  bookingId?: string;
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
      request_meet: input.requestMeet ?? false,
      booking_id: input.bookingId ?? undefined,
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
    if (!options.silent) void notifySyncFailure(input.action, err);
  });
}

/** Awaitable: utile per import storico e mirror check. */
export async function syncCalendarAwait(input: SyncInput) {
  return invokeWithAuth(input);
}

/** Toast helper exported so awaitable callers can reuse the same UX. */
export function reportSyncFailure(action: SyncInput["action"], err: unknown): void {
  void notifySyncFailure(action, err);
}
