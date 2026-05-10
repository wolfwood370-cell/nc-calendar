// Edge function: sincronizzazione bidirezionale con Google Calendar (Service Account).
// Azioni supportate: create | cancel | import_history | mirror_check

import { google } from "npm:googleapis@140";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncPayload {
  action: "create" | "cancel" | "import_history" | "mirror_check";
  coach_id: string;
  // create
  client_name?: string;
  session_label?: string;
  start_iso?: string;
  end_iso?: string;
  meeting_link?: string | null;
  color?: string | null; // hex (#rrggbb) — usato per colorId Google
  // cancel
  google_event_id?: string | null;
  // mirror_check
  range_start_iso?: string;
  range_end_iso?: string;
  // override credenziali
  service_account_json?: string;
  calendar_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: SyncPayload;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.coach_id || !body.action) {
    return json({ error: "Missing required fields" }, 400);
  }

  // Carica credenziali dal DB
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let serviceAccountRaw = body.service_account_json ?? null;
  let calendarId = body.calendar_id ?? null;
  let enabled = true;

  if (!serviceAccountRaw || !calendarId) {
    try {
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

  let calendar;
  try {
    const credentials = typeof serviceAccountRaw === "string"
      ? JSON.parse(serviceAccountRaw)
      : serviceAccountRaw;
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    calendar = google.calendar({ version: "v3", auth });
  } catch (e) {
    console.error("sync-calendar: auth init failed", e);
    return json({ ok: false, error: String(e) }, 200);
  }

  try {
    if (body.action === "create") {
      if (!body.start_iso || !body.client_name) return json({ error: "Missing create fields" }, 400);
      const startISO = body.start_iso;
      const endISO = body.end_iso ?? new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
      const event: Record<string, unknown> = {
        summary: `${body.session_label ?? "Sessione"} — ${body.client_name}`,
        description: body.meeting_link ? `Videochiamata: ${body.meeting_link}` : undefined,
        start: { dateTime: startISO, timeZone: "Europe/Rome" },
        end: { dateTime: endISO, timeZone: "Europe/Rome" },
      };
      const colorId = hexToGoogleColorId(body.color);
      if (colorId) event.colorId = colorId;
      const res = await calendar.events.insert({ calendarId, requestBody: event });
      return json({ ok: true, event_id: res.data.id }, 200);
    }

    if (body.action === "cancel") {
      if (!body.google_event_id) {
        console.log("sync-calendar: cancel skipped (no event id)");
        return json({ ok: true, skipped: true, reason: "no_event_id" }, 200);
      }
      try {
        await calendar.events.delete({ calendarId, eventId: body.google_event_id });
      } catch (e) {
        console.error("sync-calendar: delete failed", e);
      }
      return json({ ok: true }, 200);
    }

    if (body.action === "import_history") {
      const timeMin = body.range_start_iso ?? "2026-01-01T00:00:00Z";
      const timeMax = body.range_end_iso ?? new Date().toISOString();
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
        const arr = (res.data.items ?? []) as Array<Record<string, unknown>>;
        items.push(...arr);
        pageToken = res.data.nextPageToken as string | undefined;
      } while (pageToken);

      let imported = 0;
      let updated = 0;
      const now = Date.now();
      for (const ev of items) {
        const id = ev.id as string;
        const start = (ev.start as { dateTime?: string; date?: string } | undefined);
        const end = (ev.end as { dateTime?: string; date?: string } | undefined);
        const startIso = start?.dateTime ?? (start?.date ? `${start.date}T00:00:00Z` : null);
        if (!id || !startIso) continue;
        const endIso = end?.dateTime ?? null;
        const summary = (ev.summary as string) ?? "Evento";
        const status = ev.status === "cancelled"
          ? "cancelled"
          : new Date(startIso).getTime() < now ? "completed" : "scheduled";

        // Esiste già?
        const { data: existing } = await supabase
          .from("bookings")
          .select("id, status, scheduled_at")
          .eq("google_event_id", id)
          .maybeSingle();

        if (existing) {
          const patch: Record<string, unknown> = {};
          if (existing.scheduled_at !== startIso) patch.scheduled_at = startIso;
          if (existing.status !== status) patch.status = status;
          if (Object.keys(patch).length > 0) {
            await supabase.from("bookings").update(patch).eq("id", existing.id);
            updated++;
          }
          continue;
        }

        // Inserisci come booking storico (senza client_id reale → coach_id come placeholder client)
        const { error: insErr } = await supabase.from("bookings").insert({
          coach_id: body.coach_id,
          client_id: body.coach_id, // placeholder: storico senza match cliente
          scheduled_at: startIso,
          session_type: "PT Session",
          status,
          notes: `Importato da Google Calendar: ${summary}`,
          google_event_id: id,
          meeting_link: endIso,
        });
        if (!insErr) imported++;
        else console.error("sync-calendar: import insert failed", insErr);
      }
      return json({ ok: true, imported, updated, total: items.length }, 200);
    }

    if (body.action === "mirror_check") {
      const timeMin = body.range_start_iso ?? new Date().toISOString();
      const timeMax = body.range_end_iso ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Bookings locali con google_event_id nel range
      const { data: locals } = await supabase
        .from("bookings")
        .select("id, google_event_id, scheduled_at, status")
        .eq("coach_id", body.coach_id)
        .not("google_event_id", "is", null)
        .gte("scheduled_at", timeMin)
        .lte("scheduled_at", timeMax);

      let cancelled = 0;
      let moved = 0;
      for (const b of locals ?? []) {
        if (b.status === "cancelled") continue;
        try {
          const ev = await calendar.events.get({ calendarId, eventId: b.google_event_id! });
          const evStatus = ev.data.status;
          const evStart = ev.data.start?.dateTime ?? (ev.data.start?.date ? `${ev.data.start.date}T00:00:00Z` : null);
          if (evStatus === "cancelled") {
            await supabase.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
            cancelled++;
          } else if (evStart && evStart !== b.scheduled_at) {
            await supabase.from("bookings").update({ scheduled_at: evStart }).eq("id", b.id);
            moved++;
          }
        } catch (err) {
          // 404 → evento eliminato dal calendario
          const msg = String(err);
          if (msg.includes("404") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("deleted")) {
            await supabase.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
            cancelled++;
          } else {
            console.error("sync-calendar: mirror_check get error", err);
          }
        }
      }
      return json({ ok: true, cancelled, moved, checked: locals?.length ?? 0 }, 200);
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

// Mappa hex → Google Calendar colorId (1..11). Approssimazione per il colore più vicino.
function hexToGoogleColorId(hex?: string | null): string | null {
  if (!hex) return null;
  const palette: Record<string, [number, number, number]> = {
    "1": [0xa4, 0xbd, 0xfc], // Lavender
    "2": [0x7a, 0xe7, 0xbf], // Sage
    "3": [0xdb, 0xad, 0xff], // Grape
    "4": [0xff, 0x88, 0x7c], // Flamingo
    "5": [0xfb, 0xd7, 0x5b], // Banana
    "6": [0xff, 0xb8, 0x78], // Tangerine
    "7": [0x46, 0xd6, 0xdb], // Peacock
    "8": [0xe1, 0xe1, 0xe1], // Graphite
    "9": [0x53, 0x84, 0xed], // Blueberry
    "10": [0x51, 0xb7, 0x49], // Basil
    "11": [0xdc, 0x20, 0x27], // Tomato
  };
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  let bestId = "9", bestD = Infinity;
  for (const [id, [pr, pg, pb]] of Object.entries(palette)) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) { bestD = d; bestId = id; }
  }
  return bestId;
}
