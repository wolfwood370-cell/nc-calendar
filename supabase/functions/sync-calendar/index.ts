// Edge function: sincronizza una prenotazione con Google Calendar tramite Service Account.
// Architettura iniziale: l'inserimento reale è racchiuso in try/catch e logga eventuali errori.

import { google } from "npm:googleapis@140";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncPayload {
  action: "create" | "cancel";
  coach_id: string;
  client_name: string;
  session_label: string;
  start_iso: string; // ISO datetime
  end_iso?: string;  // optional ISO datetime
  meeting_link?: string | null;
  // facoltativi: in alternativa a coach_id, si possono passare le credenziali direttamente
  service_account_json?: string;
  calendar_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: SyncPayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.coach_id || !body.start_iso || !body.client_name) {
    return json({ error: "Missing required fields" }, 400);
  }

  // Recupera credenziali dal DB se non passate inline
  let serviceAccountRaw = body.service_account_json ?? null;
  let calendarId = body.calendar_id ?? null;
  let enabled = true;

  if (!serviceAccountRaw || !calendarId) {
    try {
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data, error } = await supabase
        .from("integration_settings")
        .select("gcal_service_account_json, gcal_calendar_id, gcal_enabled")
        .eq("coach_id", body.coach_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ skipped: true, reason: "no_settings" }, 200);
      serviceAccountRaw = data.gcal_service_account_json;
      calendarId = data.gcal_calendar_id;
      enabled = !!data.gcal_enabled;
    } catch (e) {
      console.error("sync-calendar: settings lookup failed", e);
      return json({ skipped: true, reason: "settings_error", error: String(e) }, 200);
    }
  }

  if (!enabled || !serviceAccountRaw || !calendarId) {
    return json({ skipped: true, reason: "not_configured" }, 200);
  }

  const startISO = body.start_iso;
  const endISO = body.end_iso ?? new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();

  try {
    const credentials = typeof serviceAccountRaw === "string"
      ? JSON.parse(serviceAccountRaw)
      : serviceAccountRaw;

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    if (body.action === "create") {
      const event = {
        summary: `${body.session_label} — ${body.client_name}`,
        description: body.meeting_link ? `Videochiamata: ${body.meeting_link}` : undefined,
        start: { dateTime: startISO, timeZone: "Europe/Rome" },
        end: { dateTime: endISO, timeZone: "Europe/Rome" },
      };
      const res = await calendar.events.insert({
        calendarId: calendarId,
        requestBody: event,
      });
      return json({ ok: true, event_id: res.data.id }, 200);
    }

    // action === "cancel": semplice log per ora (nessun id evento memorizzato)
    console.log("sync-calendar: cancellazione richiesta", { coach_id: body.coach_id, start: startISO });
    return json({ ok: true, note: "cancel-not-implemented" }, 200);
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
