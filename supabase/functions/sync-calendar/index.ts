// Edge function: sincronizzazione bidirezionale con Google Calendar (OAuth 2.0).
// Azioni supportate: create | cancel | update | import_history | mirror_check
// Auth: usa access_token / refresh_token utente salvati in integration_settings.

import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

interface SyncPayload {
  action:
    | "create"
    | "cancel"
    | "update"
    | "import_history"
    | "mirror_check"
    | "register_watch";
  coach_id: string;
  client_name?: string;
  session_label?: string;
  start_iso?: string;
  end_iso?: string;
  meeting_link?: string | null;
  color?: string | null;
  google_event_id?: string | null;
  late?: boolean;
  range_start_iso?: string;
  range_end_iso?: string;
  calendar_id?: string;
  // Native Google Meet integration: when true, the create branch asks
  // Google to spin up a Meet room on event insert and persists the
  // returned URL onto the matching booking row (booking_id).
  request_meet?: boolean;
  booking_id?: string;
  // register_watch only: override the webhook callback URL. Defaults to
  // the stable Lovable-published URL for this project.
  webhook_url?: string;
}

type ClientLite = { id: string; full_name: string | null; email: string | null };
type EventTypeLite = { id: string; name: string; base_type: string };

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

/**
 * Refresh the Google access_token when it's within the 60s safety margin.
 * Mutates `tokensRef.current` on success so callers downstream see the new
 * token without re-querying the DB. On a 400/401 from Google (the refresh
 * token has been revoked / expired), the integration is auto-disabled so
 * the coach is prompted to reconnect on their next visit to Settings,
 * instead of accumulating an indefinite series of silent failures.
 */
async function ensureFreshAccessToken(
  supabase: SupabaseClient,
  coachId: string,
  tokensRef: { current: GoogleTokens },
): Promise<string | null> {
  const tokens = tokensRef.current;
  const now = Date.now();
  const expMs = tokens.expires_at ? new Date(tokens.expires_at).getTime() : 0;
  // 60s safety margin
  if (tokens.access_token && expMs - now > 60_000) return tokens.access_token;

  if (!tokens.refresh_token) {
    console.error("sync-calendar: access token expired and no refresh_token available", {
      coachId,
    });
    return null;
  }
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    console.error("sync-calendar: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET secrets not configured");
    return tokens.access_token || null;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("sync-calendar: refresh token request failed", {
      coachId,
      status: res.status,
      body: errText,
    });
    // 400 "invalid_grant" means the refresh token was revoked or the
    // user removed app access from their Google account; 401 means the
    // OAuth client credentials are bad. In either case, retrying with the
    // same data is pointless — disable the integration so future syncs
    // short-circuit at the "not_configured" gate above and the UI in
    // trainer.integrations.tsx can prompt for a reconnect.
    if (res.status === 400 || res.status === 401) {
      await supabase
        .from("integration_settings")
        .update({ gcal_enabled: false })
        .eq("coach_id", coachId);
      tokensRef.current = { access_token: "", refresh_token: null, expires_at: null };
    }
    return null;
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  const newExpiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString();
  const newRefreshToken = data.refresh_token ?? tokens.refresh_token;

  const { error: updateErr } = await supabase
    .from("integration_settings")
    .update({
      gcal_access_token: data.access_token,
      gcal_token_expires_at: newExpiresAt,
      // Google occasionally rotates refresh_tokens; persist when present.
      ...(data.refresh_token ? { gcal_refresh_token: data.refresh_token } : {}),
    })
    .eq("coach_id", coachId);
  if (updateErr) {
    console.error("sync-calendar: integration_settings update after refresh failed", updateErr);
  }

  // Keep the in-memory ref in lockstep with the DB so subsequent gcalFetch
  // calls inside the same invocation reuse the new token instead of
  // hammering the refresh endpoint once per page (e.g. import_history with
  // pagination would otherwise refresh on every iteration).
  tokensRef.current = {
    access_token: data.access_token,
    refresh_token: newRefreshToken,
    expires_at: newExpiresAt,
  };
  return data.access_token;
}

/** Wrapper fetch verso Google Calendar API con auto-refresh on 401. */
async function gcalFetch(
  supabase: SupabaseClient,
  coachId: string,
  tokensRef: { current: GoogleTokens },
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const doFetch = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(`${GOOGLE_CALENDAR_API}${path}`, { ...init, headers });
  };

  let token = await ensureFreshAccessToken(supabase, coachId, tokensRef);
  if (!token) throw new Error("No valid Google access token");
  let res = await doFetch(token);
  if (res.status === 401 && tokensRef.current.refresh_token) {
    // Force a refresh by zeroing the expiry on the ref. ensureFreshAccessToken
    // updates the ref in-place on success.
    tokensRef.current = { ...tokensRef.current, expires_at: new Date(0).toISOString() };
    token = await ensureFreshAccessToken(supabase, coachId, tokensRef);
    if (!token) return res;
    res = await doFetch(token);
  } else if (res.status === 403) {
    // 403 from Google typically means insufficient scope or the user revoked
    // access without invalidating the refresh_token. Log so this shows up
    // distinctly from 401 (token-expired) cases. Use res.clone() so the
    // caller's `await res.json()` / `res.text()` still works downstream.
    const errText = await res
      .clone()
      .text()
      .catch(() => "");
    console.error("sync-calendar: Google API returned 403", { path, body: errText });
  }
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  let body: SyncPayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.coach_id || !body.action) return json({ error: "Missing required fields" }, 400);

  const supabase = auth.admin;

  // Authorization
  // ---------------------------------------------------------------------
  // Previously this branch was `body.coach_id !== auth.userId && auth.role
  // !== "admin"`, but `requireAuth(req)` was called without `requiredRoles`
  // so `auth.role` was ALWAYS null — meaning admins could not bypass, AND
  // clients invoking sync-calendar for their own coach (the booking flow in
  // client.book.tsx and useCancelBooking in queries.ts both do this from
  // the client session) got rejected with 403 on every booking. That was
  // the production failure: bookings saved, but the mirror to Google
  // Calendar never happened.
  //
  // The new check uses the service-role client (which bypasses RLS) to
  // verify one of three legitimate caller relationships:
  //   1. The coach is invoking for their own integration.
  //   2. The caller is an admin.
  //   3. The caller is a client assigned to body.coach_id (profile.coach_id
  //      matches), so this is their coach's calendar being updated for a
  //      booking they own.
  if (body.coach_id !== auth.userId) {
    const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", auth.userId).maybeSingle(),
      supabase.from("profiles").select("coach_id").eq("id", auth.userId).maybeSingle(),
    ]);
    const callerRole = (roleRow as { role?: string } | null)?.role ?? null;
    const callerCoachId = (profileRow as { coach_id?: string | null } | null)?.coach_id ?? null;

    if (callerRole !== "admin" && callerCoachId !== body.coach_id) {
      console.warn("sync-calendar: forbidden", {
        caller: auth.userId,
        target_coach: body.coach_id,
        caller_role: callerRole,
        caller_coach: callerCoachId,
      });
      return json({ error: "Permesso negato" }, 403);
    }
  }

  // Carica tokens OAuth + calendar_id
  const { data: settings, error: settingsErr } = await supabase
    .from("integration_settings")
    .select(
      "gcal_enabled, gcal_calendar_id, gcal_access_token, gcal_refresh_token, gcal_token_expires_at",
    )
    .eq("coach_id", body.coach_id)
    .maybeSingle();

  if (settingsErr) {
    console.error("sync-calendar: settings lookup failed", settingsErr);
    return json({ skipped: true, reason: "settings_error" }, 200);
  }
  if (!settings) return json({ skipped: true, reason: "no_settings" }, 200);
  if (!settings.gcal_enabled || !settings.gcal_access_token) {
    return json({ skipped: true, reason: "not_configured" }, 200);
  }

  const calendarId = body.calendar_id ?? settings.gcal_calendar_id ?? "primary";
  const tokensRef = {
    current: {
      access_token: settings.gcal_access_token as string,
      refresh_token: (settings.gcal_refresh_token ?? null) as string | null,
      expires_at: (settings.gcal_token_expires_at ?? null) as string | null,
    },
  };

  // Helper Calendar API tipizzati
  const calendar = {
    events: {
      insert: async (params: {
        calendarId: string;
        requestBody: Record<string, unknown>;
        /** Set 1 to opt the event into Google Meet auto-creation when
            requestBody.conferenceData is present. Google requires this
            query param explicitly — the field in the body alone is
            silently ignored without it. */
        conferenceDataVersion?: 0 | 1;
      }) => {
        const qs = new URLSearchParams();
        if (params.conferenceDataVersion !== undefined) {
          qs.set("conferenceDataVersion", String(params.conferenceDataVersion));
        }
        const qsStr = qs.toString();
        const path = `/calendars/${encodeURIComponent(params.calendarId)}/events${
          qsStr ? `?${qsStr}` : ""
        }`;
        const res = await gcalFetch(supabase, body.coach_id, tokensRef, path, {
          method: "POST",
          body: JSON.stringify(params.requestBody),
        });
        // Capture the full event payload — we need conferenceData.entryPoints
        // and the top-level hangoutLink after a successful Meet creation.
        const data = (await res.json().catch(() => ({}))) as {
          id?: string;
          hangoutLink?: string;
          conferenceData?: {
            entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
          };
        };
        if (!res.ok) throw new Error(`gcal insert ${res.status}: ${JSON.stringify(data)}`);
        return { data };
      },
      patch: async (params: {
        calendarId: string;
        eventId: string;
        requestBody: Record<string, unknown>;
        conferenceDataVersion?: 0 | 1;
      }) => {
        const qs = new URLSearchParams();
        if (params.conferenceDataVersion !== undefined) {
          qs.set("conferenceDataVersion", String(params.conferenceDataVersion));
        }
        const qsStr = qs.toString();
        const path = `/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(
          params.eventId,
        )}${qsStr ? `?${qsStr}` : ""}`;
        const res = await gcalFetch(supabase, body.coach_id, tokensRef, path, {
          method: "PATCH",
          body: JSON.stringify(params.requestBody),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`gcal patch ${res.status}: ${t}`);
        }
        return { data: await res.json().catch(() => ({})) };
      },
      delete: async (params: { calendarId: string; eventId: string }) => {
        const res = await gcalFetch(
          supabase,
          body.coach_id,
          tokensRef,
          `/calendars/${encodeURIComponent(params.calendarId)}/events/${encodeURIComponent(params.eventId)}`,
          { method: "DELETE" },
        );
        if (!res.ok && res.status !== 410 && res.status !== 404) {
          const t = await res.text();
          throw new Error(`gcal delete ${res.status}: ${t}`);
        }
        return { data: {} };
      },
      list: async (params: {
        calendarId: string;
        timeMin?: string;
        timeMax?: string;
        singleEvents?: boolean;
        orderBy?: string;
        maxResults?: number;
        pageToken?: string;
      }) => {
        const qs = new URLSearchParams();
        if (params.timeMin) qs.set("timeMin", params.timeMin);
        if (params.timeMax) qs.set("timeMax", params.timeMax);
        if (params.singleEvents) qs.set("singleEvents", "true");
        if (params.orderBy) qs.set("orderBy", params.orderBy);
        if (params.maxResults) qs.set("maxResults", String(params.maxResults));
        if (params.pageToken) qs.set("pageToken", params.pageToken);
        const res = await gcalFetch(
          supabase,
          body.coach_id,
          tokensRef,
          `/calendars/${encodeURIComponent(params.calendarId)}/events?${qs.toString()}`,
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`gcal list ${res.status}: ${t}`);
        }
        return {
          data: (await res.json()) as { items?: unknown[]; nextPageToken?: string },
        };
      },
    },
  };

  // Helper (P2): compute the actual timeMin for a Google Calendar list
  // request. Spec: take the MIN of (Jan 1 current year) and (earliest
  // active training_block.start_date for this coach), then return the
  // earlier of that vs the caller's hint. This guarantees coaches with
  // older active clients see every event from the start of their
  // training, no matter how the frontend was configured.
  //
  // Returns an ISO string ready to feed to `calendar.events.list`.
  async function computeDynamicTimeMin(callerHintIso: string | undefined): Promise<string> {
    const jan1 = new Date(new Date().getFullYear(), 0, 1).toISOString();
    let earliestStart: string | null = null;
    try {
      const { data, error } = await supabase
        .from("training_blocks")
        .select("start_date")
        .eq("coach_id", body.coach_id)
        .is("deleted_at", null)
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!error && data?.start_date) {
        // training_blocks.start_date is a date; promote to UTC midnight.
        earliestStart = `${data.start_date}T00:00:00Z`;
      }
    } catch (e) {
      // Read-only query — fall back to jan1/caller hint on failure.
      console.warn("computeDynamicTimeMin: training_blocks lookup failed", e);
    }
    const candidates = [jan1, earliestStart, callerHintIso].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    // Earliest wins so the window is as wide as needed.
    return candidates.reduce((min, cur) => (cur < min ? cur : min));
  }

  // Helper: carica clienti + event types + email coach (per matching)
  async function loadCoachContext() {
    const [clientsRes, etRes, coachUserRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("coach_id", body.coach_id)
        .is("deleted_at", null),
      supabase.from("event_types").select("id, name, base_type").eq("coach_id", body.coach_id),
      supabase.auth.admin.getUserById(body.coach_id).catch(() => ({ data: { user: null } })),
    ]);
    const coachEmail =
      (coachUserRes as { data?: { user?: { email?: string | null } } })?.data?.user?.email ??
      null ??
      null;
    return {
      clients: (clientsRes.data ?? []) as ClientLite[],
      eventTypes: (etRes.data ?? []) as EventTypeLite[],
      coachEmail,
    };
  }

  /**
   * Trova il training_block che copre la data e incrementa quantity_booked
   * sull'allocation che corrisponde a event_type_id (preferendo la stessa
   * settimana del blocco). Idempotente: il chiamante deve garantire che venga
   * invocata solo per booking realmente "nuovi" o non ancora contabilizzati.
   */
  async function consumeCreditFor(
    clientId: string,
    eventTypeId: string | null,
    sessionType: string,
    scheduledAtIso: string,
  ): Promise<string | null> {
    if (!clientId || clientId === body.coach_id) return null;
    const dateOnly = scheduledAtIso.slice(0, 10);
    const { data: blocks } = await supabase
      .from("training_blocks")
      .select("id, start_date, end_date")
      .eq("client_id", clientId)
      .eq("coach_id", body.coach_id)
      .lte("start_date", dateOnly)
      .gte("end_date", dateOnly)
      .is("deleted_at", null)
      .order("sequence_order", { ascending: true });
    const block = (blocks ?? [])[0];
    if (!block) return null;

    const { data: allocs } = await supabase
      .from("block_allocations")
      .select("id, week_number, event_type_id, session_type, quantity_assigned, quantity_booked")
      .eq("block_id", block.id);

    const matchPool = (a: { event_type_id: string | null; session_type: string }) =>
      eventTypeId
        ? a.event_type_id === eventTypeId
        : a.event_type_id === null && a.session_type === sessionType;

    const weeksFromStart = Math.floor(
      (new Date(scheduledAtIso).getTime() - new Date(block.start_date).getTime()) /
        (1000 * 60 * 60 * 24 * 7),
    );
    const wn = Math.min(4, Math.max(1, weeksFromStart + 1));
    const list = allocs ?? [];
    const sameWeek = list.find((a) => matchPool(a) && a.week_number === wn);
    const target = sameWeek ?? list.find(matchPool);
    if (!target) return null;

    await supabase
      .from("block_allocations")
      .update({ quantity_booked: target.quantity_booked + 1 })
      .eq("id", target.id);
    return block.id;
  }

  async function refundCreditFor(
    blockId: string | null,
    eventTypeId: string | null,
    sessionType: string,
    scheduledAtIso: string,
  ) {
    if (!blockId) return;
    const { data: block } = await supabase
      .from("training_blocks")
      .select("start_date")
      .eq("id", blockId)
      .maybeSingle();
    if (!block) return;
    const { data: allocs } = await supabase
      .from("block_allocations")
      .select("id, week_number, event_type_id, session_type, quantity_booked")
      .eq("block_id", blockId);
    const matchPool = (a: { event_type_id: string | null; session_type: string }) =>
      eventTypeId
        ? a.event_type_id === eventTypeId
        : a.event_type_id === null && a.session_type === sessionType;
    const weeksFromStart = Math.floor(
      (new Date(scheduledAtIso).getTime() - new Date(block.start_date).getTime()) /
        (1000 * 60 * 60 * 24 * 7),
    );
    const wn = Math.min(4, Math.max(1, weeksFromStart + 1));
    const list = allocs ?? [];
    const target = list.find((a) => matchPool(a) && a.week_number === wn) ?? list.find(matchPool);
    if (!target || target.quantity_booked <= 0) return;
    await supabase
      .from("block_allocations")
      .update({ quantity_booked: target.quantity_booked - 1 })
      .eq("id", target.id);
  }

  try {
    if (body.action === "create") {
      if (!body.start_iso || !body.client_name)
        return json({ error: "Missing create fields" }, 400);
      const startISO = body.start_iso;
      const endISO =
        body.end_iso ?? new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
      const event: Record<string, unknown> = {
        summary: `${body.session_label ?? "Sessione"} — ${body.client_name}`,
        description: body.meeting_link ? `Videochiamata: ${body.meeting_link}` : undefined,
        start: { dateTime: startISO, timeZone: "Europe/Rome" },
        end: { dateTime: endISO, timeZone: "Europe/Rome" },
      };
      const colorId = hexToGoogleColorId(body.color);
      if (colorId) event.colorId = colorId;

      // Google Meet auto-creation. When the caller flagged this booking as
      // online (request_meet), we ask Google to spin up a Meet room as
      // part of the event insert. The conferenceData.createRequest body
      // pairs with the conferenceDataVersion=1 query param — Google
      // silently ignores conferenceData without the query param.
      // requestId scopes the create to this booking so retries from the
      // same booking don't generate duplicate rooms.
      const wantsMeet = body.request_meet === true;
      if (wantsMeet) {
        event.conferenceData = {
          createRequest: {
            requestId: `booking_${body.booking_id ?? crypto.randomUUID()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const res = await calendar.events.insert({
        calendarId,
        requestBody: event,
        conferenceDataVersion: wantsMeet ? 1 : 0,
      });

      // Capture the Meet URL: Google returns either the top-level
      // hangoutLink (preferred) or, if the createRequest is still
      // pending, an entryPoint with type "video". Persist to the
      // bookings row when we have a booking_id from the caller.
      let meetUrl: string | null = null;
      if (wantsMeet) {
        meetUrl =
          res.data.hangoutLink ??
          res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
            ?.uri ??
          null;
        if (meetUrl && body.booking_id) {
          const { error: updErr } = await supabase
            .from("bookings")
            .update({
              meeting_link: meetUrl,
              google_event_id: res.data.id ?? null,
            })
            .eq("id", body.booking_id);
          if (updErr) {
            console.error("sync-calendar: failed to persist Meet URL on booking", updErr);
            // Surface this in the response so the caller can decide.
            // The Google event is real either way.
          }
        }
      } else if (body.booking_id && res.data.id) {
        // No Meet requested but still write back the google_event_id so
        // later mirror/cancel flows know which Google event maps to this
        // booking.
        await supabase
          .from("bookings")
          .update({ google_event_id: res.data.id })
          .eq("id", body.booking_id);
      }

      return json({ ok: true, event_id: res.data.id, meet_url: meetUrl }, 200);
    }

    if (body.action === "cancel") {
      if (!body.google_event_id)
        return json({ ok: true, skipped: true, reason: "no_event_id" }, 200);
      if (body.late) {
        // Cancellazione tardiva: NON elimina l'evento, lo marca come CANCELLATA in grigio.
        try {
          const baseSummary =
            `${body.session_label ?? "Sessione"} — ${body.client_name ?? ""}`.trim();
          const newSummary = baseSummary.startsWith("🚫 CANCELLATA")
            ? baseSummary
            : `🚫 CANCELLATA - ${baseSummary}`;
          await calendar.events.patch({
            calendarId,
            eventId: body.google_event_id,
            requestBody: { summary: newSummary, colorId: "8" },
          });
        } catch (e) {
          console.error("sync-calendar: late-cancel patch failed", e);
        }
        return json({ ok: true, late: true }, 200);
      }
      try {
        await calendar.events.delete({ calendarId, eventId: body.google_event_id });
      } catch (e) {
        console.error("sync-calendar: delete failed", e);
      }
      return json({ ok: true }, 200);
    }

    if (body.action === "update") {
      if (!body.google_event_id || !body.start_iso) {
        return json({ ok: true, skipped: true, reason: "missing_fields" }, 200);
      }
      const startISO = body.start_iso;
      const endISO =
        body.end_iso ?? new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
      const patch: Record<string, unknown> = {
        start: { dateTime: startISO, timeZone: "Europe/Rome" },
        end: { dateTime: endISO, timeZone: "Europe/Rome" },
      };
      if (body.client_name && body.session_label) {
        patch.summary = `${body.session_label} — ${body.client_name}`;
      }
      const colorId = hexToGoogleColorId(body.color);
      if (colorId) patch.colorId = colorId;
      try {
        await calendar.events.patch({
          calendarId,
          eventId: body.google_event_id,
          requestBody: patch,
        });
      } catch (e) {
        console.error("sync-calendar: update patch failed", e);
      }
      return json({ ok: true }, 200);
    }

    if (body.action === "import_history") {
      const ctx = await loadCoachContext();
      // P2: dynamic timeMin = earlier of (caller hint, Jan 1 current
      // year, earliest active training_block start_date). Coaches with
      // clients whose paths started in 2025 still see those sessions.
      const timeMin = await computeDynamicTimeMin(body.range_start_iso);
      const twoYearsAhead = new Date();
      twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2);
      const timeMax = body.range_end_iso ?? twoYearsAhead.toISOString();
      const items: Array<Record<string, unknown>> = [];
      let pageToken: string | undefined = undefined;
      do {
        const res: { data: { items?: unknown[]; nextPageToken?: string } } =
          await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
            pageToken,
          });
        items.push(...((res.data.items ?? []) as Array<Record<string, unknown>>));
        pageToken = res.data.nextPageToken as string | undefined;
      } while (pageToken);

      let imported = 0,
        updated = 0,
        matched = 0,
        creditsBooked = 0;
      const now = Date.now();
      for (const ev of items) {
        const id = ev.id as string;
        const start = ev.start as { dateTime?: string; date?: string } | undefined;
        const startIso = start?.dateTime ?? (start?.date ? `${start.date}T00:00:00Z` : null);
        if (!id || !startIso) continue;
        const summary = (ev.summary as string) ?? "Evento";
        const description = (ev.description as string) ?? "";
        const attendees = (ev.attendees ?? []) as Array<{ email?: string }>;
        const status =
          ev.status === "cancelled"
            ? "cancelled"
            : new Date(startIso).getTime() < now
              ? "completed"
              : "scheduled";

        const match = matchEvent(summary, attendees, ctx, description);
        if (match.client) matched++;
        const clientId = match.client?.id ?? null;
        const sessionType = match.eventType?.base_type ?? "PT Session";
        const eventTypeId = match.eventType?.id ?? null;

        // H1 (audit 2026-05-20): SELECT now includes is_personal so the
        // guard below can skip Personal Blocks / Consulenza rows. Without
        // this guard, import_history would happily overwrite client_id /
        // session_type / event_type_id / notes / title on rows the coach
        // already converted to a special category — and could even
        // re-trigger consumeCreditFor against a phantom client match.
        // mirror_check already had this skip; parity restored here.
        // Defensive fallback handles the case where the column migration
        // (20260519150000_bookings_is_personal.sql) hasn't shipped to the
        // target project yet — same pattern queries.ts uses on the client.
        const existingBaseCols =
          "id, status, scheduled_at, block_id, client_id, event_type_id, session_type";
        let existingResp = await supabase
          .from("bookings")
          .select(`${existingBaseCols}, is_personal`)
          .eq("google_event_id", id)
          .maybeSingle();
        if (
          existingResp.error &&
          ((existingResp.error as { code?: string }).code === "42703" ||
            (existingResp.error.message ?? "").includes("is_personal"))
        ) {
          existingResp = await supabase
            .from("bookings")
            .select(existingBaseCols)
            .eq("google_event_id", id)
            .maybeSingle();
        }
        let existing = existingResp.data as
          | (Record<string, unknown> & {
              id: string;
              status: string;
              scheduled_at: string;
              block_id: string | null;
              client_id: string | null;
              event_type_id: string | null;
              session_type: string;
              is_personal?: boolean;
            })
          | null;

        // Fallback: stesso cliente + stesso orario senza google_event_id (evita duplicati)
        if (!existing && match.client) {
          let twinResp = await supabase
            .from("bookings")
            .select(`${existingBaseCols}, is_personal`)
            .eq("coach_id", body.coach_id)
            .eq("client_id", clientId)
            .eq("scheduled_at", startIso)
            .is("google_event_id", null)
            .maybeSingle();
          if (
            twinResp.error &&
            ((twinResp.error as { code?: string }).code === "42703" ||
              (twinResp.error.message ?? "").includes("is_personal"))
          ) {
            twinResp = await supabase
              .from("bookings")
              .select(existingBaseCols)
              .eq("coach_id", body.coach_id)
              .eq("client_id", clientId)
              .eq("scheduled_at", startIso)
              .is("google_event_id", null)
              .maybeSingle();
          }
          const localTwin = twinResp.data as typeof existing;
          if (localTwin) {
            await supabase.from("bookings").update({ google_event_id: id }).eq("id", localTwin.id);
            existing = localTwin;
          }
        }

        // H1 guard: any row the coach has marked is_personal=true is off-
        // limits to import_history. Skipping here is finer-grained than
        // bailing on the whole sync — we just leave the personal row
        // untouched and move on to the next Google event.
        if (existing && existing.is_personal === true) {
          continue;
        }

        if (existing) {
          const patch: Record<string, unknown> = {
            session_type: sessionType,
            event_type_id: eventTypeId,
            notes: `Importato da Google Calendar: ${summary}`,
            title: summary,
          };
          // Solo scrivi client_id se abbiamo un match certo (non sovrascrivere
          // un client_id già impostato manualmente con null).
          if (match.client) patch.client_id = clientId;
          if (existing.scheduled_at !== startIso) patch.scheduled_at = startIso;
          if (existing.status !== status) patch.status = status;

          // Idempotenza: se l'evento è già contabilizzato (block_id presente) NON riscalare crediti.
          if (
            existing.status === "cancelled" &&
            status !== "cancelled" &&
            match.client &&
            !existing.block_id
          ) {
            const blockId = await consumeCreditFor(clientId, eventTypeId, sessionType, startIso);
            if (blockId) {
              patch.block_id = blockId;
              creditsBooked++;
            }
          }
          if (existing.status !== "cancelled" && status === "cancelled" && existing.block_id) {
            await refundCreditFor(
              existing.block_id,
              existing.event_type_id ?? null,
              existing.session_type,
              existing.scheduled_at,
            );
            patch.block_id = null;
          }
          await supabase.from("bookings").update(patch).eq("id", existing.id);
          updated++;
          continue;
        }

        // Nuovo booking importato: scala credito se matchato a un cliente reale e non cancellato
        let blockId: string | null = null;
        if (status !== "cancelled" && match.client) {
          blockId = await consumeCreditFor(clientId, eventTypeId, sessionType, startIso);
          if (blockId) creditsBooked++;
        }

        const { error: insErr } = await supabase.from("bookings").insert({
          coach_id: body.coach_id,
          client_id: clientId,
          scheduled_at: startIso,
          session_type: sessionType,
          event_type_id: eventTypeId,
          status,
          block_id: blockId,
          notes: `Importato da Google Calendar: ${summary}`,
          title: summary,
          google_event_id: id,
        });
        if (!insErr) imported++;
        else console.error("sync-calendar: import insert failed", insErr);
      }
      return json(
        { ok: true, imported, updated, matched, creditsBooked, total: items.length },
        200,
      );
    }

    if (body.action === "mirror_check") {
      const ctx = await loadCoachContext();
      const twoYearsAhead2 = new Date();
      twoYearsAhead2.setFullYear(twoYearsAhead2.getFullYear() + 2);
      // P2: dynamic timeMin — for per-month sync callers the caller
      // hint (start of month) wins because it's tighter than the
      // dynamic floor. For "Sincronizza ora" without a hint we still
      // get the wide retroactive sweep guaranteed by Jan 1 / earliest
      // training_block. The old 30-day lookback default is now
      // subsumed by the Jan 1 floor (which is at least 31 days back
      // for any time of year).
      const timeMin = await computeDynamicTimeMin(body.range_start_iso);
      const timeMax = body.range_end_iso ?? twoYearsAhead2.toISOString();

      // Defensive: same migration race as the frontend bookings query.
      // If the is_personal column hasn't shipped to this Supabase
      // project yet, retry without it and treat the absence as
      // is_personal=false for the matching loop below.
      const localsBaseCols =
        "id, google_event_id, scheduled_at, status, client_id, event_type_id, session_type, block_id";
      let localsResp = await supabase
        .from("bookings")
        .select(`${localsBaseCols}, is_personal`)
        .eq("coach_id", body.coach_id)
        .not("google_event_id", "is", null)
        .gte("scheduled_at", timeMin)
        .lte("scheduled_at", timeMax);
      if (
        localsResp.error &&
        ((localsResp.error as { code?: string }).code === "42703" ||
          (localsResp.error.message ?? "").includes("is_personal"))
      ) {
        localsResp = await supabase
          .from("bookings")
          .select(localsBaseCols)
          .eq("coach_id", body.coach_id)
          .not("google_event_id", "is", null)
          .gte("scheduled_at", timeMin)
          .lte("scheduled_at", timeMax);
      }
      const { data: locals } = localsResp;

      let cancelled = 0,
        moved = 0,
        remapped = 0,
        imported = 0,
        creditsBooked = 0;

      // 1) Pull tutti gli eventi Google nel range
      const remoteItems: Array<Record<string, unknown>> = [];
      let pageToken: string | undefined = undefined;
      do {
        const res: { data: { items?: unknown[]; nextPageToken?: string } } =
          await calendar.events.list({
            calendarId,
            timeMin,
            timeMax,
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
            pageToken,
          });
        remoteItems.push(...((res.data.items ?? []) as Array<Record<string, unknown>>));
        pageToken = res.data.nextPageToken as string | undefined;
      } while (pageToken);

      const remoteById = new Map<string, Record<string, unknown>>();
      for (const ev of remoteItems) {
        const id = ev.id as string | undefined;
        if (id) remoteById.set(id, ev);
      }

      // 2) Aggiorna i booking locali confrontandoli con la copia in cache
      for (const b of locals ?? []) {
        if (b.status === "cancelled") continue;
        // Personal blocks: the coach explicitly opted this row out of the
        // client-session bucket. Skip re-matching so a future mirror_check
        // can't reset is_personal indirectly by overwriting client_id /
        // event_type_id from a fuzzy Google match.
        if ((b as { is_personal?: boolean }).is_personal === true) continue;
        const ev = remoteById.get(b.google_event_id!);
        if (!ev || (ev.status as string) === "cancelled") {
          await supabase
            .from("bookings")
            .update({ status: "cancelled", block_id: null })
            .eq("id", b.id);
          if (b.block_id)
            await refundCreditFor(
              b.block_id,
              b.event_type_id ?? null,
              b.session_type,
              b.scheduled_at,
            );
          cancelled++;
          continue;
        }
        const start = ev.start as { dateTime?: string; date?: string } | undefined;
        const evStart = start?.dateTime ?? (start?.date ? `${start.date}T00:00:00Z` : null);
        const summary = (ev.summary as string) ?? "";
        const description = (ev.description as string) ?? "";
        const attendees = (ev.attendees ?? []) as Array<{ email?: string }>;

        const patch: Record<string, unknown> = {};
        if (evStart && evStart !== b.scheduled_at) {
          patch.scheduled_at = evStart;
          moved++;
        }

        const match = matchEvent(summary, attendees, ctx, description);
        const newClient = match.client?.id ?? null;
        const newEt = match.eventType?.id ?? null;
        const newType = match.eventType?.base_type ?? "PT Session";
        // Non sovrascrivere un client_id esistente con null se non c'è match
        const clientChanged = match.client ? newClient !== b.client_id : false;
        const etChanged = newEt !== b.event_type_id;
        if (clientChanged || etChanged) {
          if (match.client) patch.client_id = newClient;
          patch.event_type_id = newEt;
          patch.session_type = newType;
          patch.notes = `Importato da Google Calendar: ${summary}`;
          patch.title = summary;
          if (b.block_id) {
            await refundCreditFor(
              b.block_id,
              b.event_type_id ?? null,
              b.session_type,
              b.scheduled_at,
            );
            patch.block_id = null;
          }
          if (match.client && newClient) {
            const newBlockId = await consumeCreditFor(
              newClient,
              newEt,
              newType,
              evStart ?? b.scheduled_at,
            );
            if (newBlockId) patch.block_id = newBlockId;
          }
          remapped++;
        }
        if (Object.keys(patch).length > 0) {
          await supabase.from("bookings").update(patch).eq("id", b.id);
        }
      }

      // 3) Importa eventi Google non ancora presenti in Supabase
      const localIds = new Set(
        (locals ?? []).map((b) => b.google_event_id).filter(Boolean) as string[],
      );
      const now = Date.now();
      for (const ev of remoteItems) {
        const id = ev.id as string | undefined;
        if (!id || localIds.has(id)) continue;
        if ((ev.status as string) === "cancelled") continue;
        const start = ev.start as { dateTime?: string; date?: string } | undefined;
        const startIso = start?.dateTime ?? (start?.date ? `${start.date}T00:00:00Z` : null);
        if (!startIso) continue;

        // Verifica che non esista già (evita duplicati cross-range)
        const { data: existing } = await supabase
          .from("bookings")
          .select("id")
          .eq("google_event_id", id)
          .maybeSingle();
        if (existing) continue;

        const summary = (ev.summary as string) ?? "Evento";
        const description = (ev.description as string) ?? "";
        const attendees = (ev.attendees ?? []) as Array<{ email?: string }>;
        const match = matchEvent(summary, attendees, ctx, description);
        const clientId = match.client?.id ?? null;
        const sessionType = match.eventType?.base_type ?? "PT Session";
        const eventTypeId = match.eventType?.id ?? null;
        const status = new Date(startIso).getTime() < now ? "completed" : "scheduled";

        // Fallback dedup: stesso cliente + stesso orario senza google_event_id
        if (match.client) {
          const { data: localTwin } = await supabase
            .from("bookings")
            .select("id")
            .eq("coach_id", body.coach_id)
            .eq("client_id", clientId)
            .eq("scheduled_at", startIso)
            .is("google_event_id", null)
            .maybeSingle();
          if (localTwin) {
            await supabase.from("bookings").update({ google_event_id: id }).eq("id", localTwin.id);
            continue;
          }
        }

        let blockId: string | null = null;
        if (match.client) {
          blockId = await consumeCreditFor(clientId, eventTypeId, sessionType, startIso);
          if (blockId) creditsBooked++;
        }

        const { error: insErr } = await supabase.from("bookings").insert({
          coach_id: body.coach_id,
          client_id: clientId,
          scheduled_at: startIso,
          session_type: sessionType,
          event_type_id: eventTypeId,
          status,
          block_id: blockId,
          notes: `Importato da Google Calendar: ${summary}`,
          title: summary,
          google_event_id: id,
        });
        if (!insErr) imported++;
        else console.error("sync-calendar: mirror import insert failed", insErr);
      }

      return json(
        {
          ok: true,
          cancelled,
          moved,
          remapped,
          imported,
          creditsBooked,
          checked: locals?.length ?? 0,
        },
        200,
      );
    }

    if (body.action === "register_watch") {
      // Register a Google Calendar push-notification channel pointing at
      // /api/public/webhooks/gcal-watch. We generate a fresh UUID per call
      // (so re-registering invalidates the previous channel) plus a 32-byte
      // hex token that the webhook validates against gcal_channel_token to
      // reject spoofed callbacks. Channels expire after ~1 week; the UI
      // should call this again well before gcal_channel_expires_at.
      const channelId = crypto.randomUUID();
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      const channelToken = Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const webhookUrl =
        body.webhook_url ??
        "https://project--81e402d5-14ed-48a5-938a-c89e014f695a.lovable.app/api/public/webhooks/gcal-watch";

      const res = await gcalFetch(
        supabase,
        body.coach_id,
        tokensRef,
        `/calendars/${encodeURIComponent(calendarId)}/events/watch`,
        {
          method: "POST",
          body: JSON.stringify({
            id: channelId,
            type: "web_hook",
            address: webhookUrl,
            token: channelToken,
          }),
        },
      );
      const watchData = (await res.json().catch(() => ({}))) as {
        resourceId?: string;
        expiration?: string;
        id?: string;
      };
      if (!res.ok) {
        console.error("sync-calendar: register_watch failed", {
          status: res.status,
          body: watchData,
        });
        return json(
          { ok: false, error: `gcal watch ${res.status}: ${JSON.stringify(watchData)}` },
          200,
        );
      }

      // Google returns expiration as a string of Epoch milliseconds.
      const expiresAt = watchData.expiration
        ? new Date(Number(watchData.expiration)).toISOString()
        : null;

      const { error: persistErr } = await supabase
        .from("integration_settings")
        .update({
          gcal_channel_id: channelId,
          gcal_resource_id: watchData.resourceId ?? null,
          gcal_channel_token: channelToken,
          gcal_channel_expires_at: expiresAt,
          gcal_webhook_url: webhookUrl,
        })
        .eq("coach_id", body.coach_id);
      if (persistErr) {
        console.error("sync-calendar: persist watch channel failed", persistErr);
        return json({ ok: false, error: "persist_failed" }, 200);
      }

      return json(
        {
          ok: true,
          channel_id: channelId,
          resource_id: watchData.resourceId ?? null,
          expires_at: expiresAt,
        },
        200,
      );
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("sync-calendar: Google API error", e);
    return json({ ok: false, error: String(e) }, 200);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Strict matcher per cliente + tipo evento.
 * - Cliente: solo email esatta (escludendo email del coach) OPPURE
 *   "nome cognome" / "cognome nome" presente esattamente nel titolo o descrizione.
 * - Tipo evento: nome più lungo presente nel titolo/descrizione.
 */
function matchEvent(
  summary: string,
  attendees: Array<{ email?: string }>,
  ctx: { clients: ClientLite[]; eventTypes: EventTypeLite[]; coachEmail?: string | null },
  description?: string,
): { client: ClientLite | null; eventType: EventTypeLite | null } {
  const lower = `${summary ?? ""} ${description ?? ""}`.toLowerCase();
  const coachEmail = (ctx.coachEmail ?? "").toLowerCase();
  const emails = new Set(
    attendees.map((a) => (a.email ?? "").toLowerCase()).filter((e) => e && e !== coachEmail),
  );

  // Priorità 1: match esatto su email attendee (escluso coach)
  let client: ClientLite | null = null;
  for (const c of ctx.clients) {
    const ce = (c.email ?? "").toLowerCase();
    if (!ce || ce === coachEmail) continue;
    if (emails.has(ce)) {
      client = c;
      break;
    }
  }

  // Priorità 2: match esatto su "nome cognome" o "cognome nome" (case-insensitive).
  // Match parziale (solo nome o solo cognome) è VIETATO.
  if (!client) {
    for (const c of ctx.clients) {
      const fn = (c.full_name ?? "").trim();
      if (!fn) continue;
      const parts = fn.split(/\s+/);
      if (parts.length < 2) continue;
      const first = parts[0].toLowerCase();
      const last = parts.slice(1).join(" ").toLowerCase();
      if (!first || !last) continue;
      const a = `${first} ${last}`;
      const b = `${last} ${first}`;
      if (lower.includes(a) || lower.includes(b)) {
        client = c;
        break;
      }
    }
  }

  // Tipo evento: prima prova match esatto sul nome intero (priorità massima),
  // poi fallback a overlap di parole significative con prefix-match
  // (gestisce varianti singolare/plurale e nomi compositi tipo
  // "Test Funzionali + Check Tecnico" vs titolo "Test Funzionale — ...").
  let eventType: EventTypeLite | null = null;
  let bestLen = 0;
  for (const et of ctx.eventTypes) {
    const n = (et.name ?? "").trim().toLowerCase();
    if (n.length < 2) continue;
    if (lower.includes(n) && n.length > bestLen) {
      eventType = et;
      bestLen = n.length;
    }
  }

  if (!eventType) {
    const STOPWORDS = new Set([
      "pt", "di", "del", "della", "dei", "delle", "da", "il", "la", "lo",
      "le", "gli", "un", "una", "uno", "con", "per", "the", "and", "or",
      "session", "sessione", "evento", "event", "call", "meeting",
    ]);
    const summaryWords = lower
      .split(/[^a-zàèéìòù0-9]+/i)
      .filter((w) => w.length >= 3);
    const summaryStems = new Set(
      summaryWords.map((w) => (w.length > 5 ? w.slice(0, 5) : w)),
    );

    let bestScore = 0;
    let bestNameLen = 0;
    for (const et of ctx.eventTypes) {
      const n = (et.name ?? "").trim().toLowerCase();
      if (n.length < 2) continue;
      const words = n
        .split(/[^a-zàèéìòù0-9]+/i)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
      if (words.length === 0) continue;
      let score = 0;
      for (const w of words) {
        const stem = w.length > 5 ? w.slice(0, 5) : w;
        if (summaryStems.has(stem)) score++;
      }
      // Prefer higher score; tie-break on longer original name (more specific).
      if (score > 0 && (score > bestScore || (score === bestScore && n.length > bestNameLen))) {
        eventType = et;
        bestScore = score;
        bestNameLen = n.length;
      }
    }
  }

  return { client, eventType };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hexToGoogleColorId(hex?: string | null): string | null {
  if (!hex) return null;
  const palette: Record<string, [number, number, number]> = {
    "1": [0xa4, 0xbd, 0xfc],
    "2": [0x7a, 0xe7, 0xbf],
    "3": [0xdb, 0xad, 0xff],
    "4": [0xff, 0x88, 0x7c],
    "5": [0xfb, 0xd7, 0x5b],
    "6": [0xff, 0xb8, 0x78],
    "7": [0x46, 0xd6, 0xdb],
    "8": [0xe1, 0xe1, 0xe1],
    "9": [0x53, 0x84, 0xed],
    "10": [0x51, 0xb7, 0x49],
    "11": [0xdc, 0x20, 0x27],
  };
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff,
    g = (n >> 8) & 0xff,
    b = n & 0xff;
  let bestId = "9",
    bestD = Infinity;
  for (const [id, [pr, pg, pb]] of Object.entries(palette)) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      bestId = id;
    }
  }
  return bestId;
}
