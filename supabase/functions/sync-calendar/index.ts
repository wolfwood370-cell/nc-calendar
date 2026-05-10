// Edge function: sincronizzazione bidirezionale con Google Calendar (Service Account).
// Azioni supportate: create | cancel | import_history | mirror_check
// Smart parsing: identifica cliente da full_name/email e tipo evento da nome.

import { google } from "npm:googleapis@140";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SyncPayload {
  action: "create" | "cancel" | "import_history" | "mirror_check";
  coach_id: string;
  client_name?: string;
  session_label?: string;
  start_iso?: string;
  end_iso?: string;
  meeting_link?: string | null;
  color?: string | null;
  google_event_id?: string | null;
  range_start_iso?: string;
  range_end_iso?: string;
  service_account_json?: string;
  calendar_id?: string;
}

type ClientLite = { id: string; full_name: string | null; email: string | null };
type EventTypeLite = { id: string; name: string; base_type: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: SyncPayload;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  if (!body.coach_id || !body.action) return json({ error: "Missing required fields" }, 400);

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
      ? JSON.parse(serviceAccountRaw) : serviceAccountRaw;
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

  // Helper: carica clienti + event types del coach (per matching)
  async function loadCoachContext() {
    const [clientsRes, etRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").eq("coach_id", body.coach_id).is("deleted_at", null),
      supabase.from("event_types").select("id, name, base_type").eq("coach_id", body.coach_id),
    ]);
    return {
      clients: (clientsRes.data ?? []) as ClientLite[],
      eventTypes: (etRes.data ?? []) as EventTypeLite[],
    };
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
      if (!body.google_event_id) return json({ ok: true, skipped: true, reason: "no_event_id" }, 200);
      try { await calendar.events.delete({ calendarId, eventId: body.google_event_id }); }
      catch (e) { console.error("sync-calendar: delete failed", e); }
      return json({ ok: true }, 200);
    }

    if (body.action === "import_history") {
      const ctx = await loadCoachContext();
      const timeMin = body.range_start_iso ?? "2026-01-01T00:00:00Z";
      const timeMax = body.range_end_iso ?? new Date().toISOString();
      const items: Array<Record<string, unknown>> = [];
      let pageToken: string | undefined = undefined;
      do {
        const res: { data: { items?: unknown[]; nextPageToken?: string } } =
          await calendar.events.list({
            calendarId, timeMin, timeMax,
            singleEvents: true, orderBy: "startTime",
            maxResults: 250, pageToken,
          });
        items.push(...((res.data.items ?? []) as Array<Record<string, unknown>>));
        pageToken = res.data.nextPageToken as string | undefined;
      } while (pageToken);

      let imported = 0, updated = 0, matched = 0;
      const now = Date.now();
      for (const ev of items) {
        const id = ev.id as string;
        const start = ev.start as { dateTime?: string; date?: string } | undefined;
        const startIso = start?.dateTime ?? (start?.date ? `${start.date}T00:00:00Z` : null);
        if (!id || !startIso) continue;
        const summary = (ev.summary as string) ?? "Evento";
        const attendees = (ev.attendees ?? []) as Array<{ email?: string }>;
        const status = ev.status === "cancelled" ? "cancelled"
          : new Date(startIso).getTime() < now ? "completed" : "scheduled";

        const match = matchEvent(summary, attendees, ctx);
        if (match.client) matched++;

        const { data: existing } = await supabase
          .from("bookings")
          .select("id, status, scheduled_at")
          .eq("google_event_id", id).maybeSingle();

        if (existing) {
          const patch: Record<string, unknown> = {
            client_id: match.client?.id ?? body.coach_id,
            session_type: match.eventType?.base_type ?? "PT Session",
            event_type_id: match.eventType?.id ?? null,
            notes: `Importato da Google Calendar: ${summary}`,
          };
          if (existing.scheduled_at !== startIso) patch.scheduled_at = startIso;
          if (existing.status !== status) patch.status = status;
          await supabase.from("bookings").update(patch).eq("id", existing.id);
          updated++;
          continue;
        }

        const { error: insErr } = await supabase.from("bookings").insert({
          coach_id: body.coach_id,
          client_id: match.client?.id ?? body.coach_id,
          scheduled_at: startIso,
          session_type: match.eventType?.base_type ?? "PT Session",
          event_type_id: match.eventType?.id ?? null,
          status,
          notes: `Importato da Google Calendar: ${summary}`,
          google_event_id: id,
        });
        if (!insErr) imported++;
        else console.error("sync-calendar: import insert failed", insErr);
      }
      return json({ ok: true, imported, updated, matched, total: items.length }, 200);
    }

    if (body.action === "mirror_check") {
      const ctx = await loadCoachContext();
      const timeMin = body.range_start_iso ?? new Date().toISOString();
      const timeMax = body.range_end_iso ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: locals } = await supabase
        .from("bookings")
        .select("id, google_event_id, scheduled_at, status, client_id, event_type_id")
        .eq("coach_id", body.coach_id)
        .not("google_event_id", "is", null)
        .gte("scheduled_at", timeMin)
        .lte("scheduled_at", timeMax);

      let cancelled = 0, moved = 0, remapped = 0;
      for (const b of locals ?? []) {
        if (b.status === "cancelled") continue;
        try {
          const ev = await calendar.events.get({ calendarId, eventId: b.google_event_id! });
          const evStatus = ev.data.status;
          const evStart = ev.data.start?.dateTime ?? (ev.data.start?.date ? `${ev.data.start.date}T00:00:00Z` : null);
          const summary = ev.data.summary ?? "";
          const attendees = (ev.data.attendees ?? []) as Array<{ email?: string }>;

          if (evStatus === "cancelled") {
            await supabase.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
            cancelled++; continue;
          }

          const patch: Record<string, unknown> = {};
          if (evStart && evStart !== b.scheduled_at) { patch.scheduled_at = evStart; moved++; }

          // Re-mapping client / tipo evento (se cambia il titolo)
          const match = matchEvent(summary, attendees, ctx);
          const newClient = match.client?.id ?? body.coach_id;
          const newEt = match.eventType?.id ?? null;
          if (newClient !== b.client_id || newEt !== b.event_type_id) {
            patch.client_id = newClient;
            patch.event_type_id = newEt;
            patch.session_type = match.eventType?.base_type ?? "PT Session";
            patch.notes = `Importato da Google Calendar: ${summary}`;
            remapped++;
          }
          if (Object.keys(patch).length > 0) {
            await supabase.from("bookings").update(patch).eq("id", b.id);
          }
        } catch (err) {
          const msg = String(err);
          if (msg.includes("404") || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("deleted")) {
            await supabase.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
            cancelled++;
          } else {
            console.error("sync-calendar: mirror_check get error", err);
          }
        }
      }
      return json({ ok: true, cancelled, moved, remapped, checked: locals?.length ?? 0 }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("sync-calendar: Google API error", e);
    return json({ ok: false, error: String(e) }, 200);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Smart matcher per cliente + tipo evento. */
function matchEvent(
  summary: string,
  attendees: Array<{ email?: string }>,
  ctx: { clients: ClientLite[]; eventTypes: EventTypeLite[] },
): { client: ClientLite | null; eventType: EventTypeLite | null } {
  const lower = (summary ?? "").toLowerCase();
  const emails = new Set(attendees.map((a) => (a.email ?? "").toLowerCase()).filter(Boolean));

  // 1) Match cliente per email attendee, poi per full_name nel titolo
  let client: ClientLite | null = null;
  for (const c of ctx.clients) {
    if (c.email && emails.has(c.email.toLowerCase())) { client = c; break; }
  }
  if (!client) {
    // preferisci match più lungo (full_name più specifico)
    let best: { c: ClientLite; len: number } | null = null;
    for (const c of ctx.clients) {
      const name = (c.full_name ?? "").trim().toLowerCase();
      if (name.length < 3) continue;
      if (lower.includes(name)) {
        if (!best || name.length > best.len) best = { c, len: name.length };
      } else {
        // prova primo nome
        const first = name.split(/\s+/)[0];
        if (first && first.length >= 3 && new RegExp(`\\b${escapeRe(first)}\\b`).test(lower)) {
          if (!best || first.length > best.len) best = { c, len: first.length };
        }
      }
    }
    if (best) client = best.c;
  }

  // 2) Match tipo evento per nome più lungo presente nel titolo
  let eventType: EventTypeLite | null = null;
  let bestLen = 0;
  for (const et of ctx.eventTypes) {
    const n = (et.name ?? "").trim().toLowerCase();
    if (n.length < 2) continue;
    if (lower.includes(n) && n.length > bestLen) { eventType = et; bestLen = n.length; }
  }

  return { client, eventType };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hexToGoogleColorId(hex?: string | null): string | null {
  if (!hex) return null;
  const palette: Record<string, [number, number, number]> = {
    "1": [0xa4, 0xbd, 0xfc], "2": [0x7a, 0xe7, 0xbf], "3": [0xdb, 0xad, 0xff],
    "4": [0xff, 0x88, 0x7c], "5": [0xfb, 0xd7, 0x5b], "6": [0xff, 0xb8, 0x78],
    "7": [0x46, 0xd6, 0xdb], "8": [0xe1, 0xe1, 0xe1], "9": [0x53, 0x84, 0xed],
    "10": [0x51, 0xb7, 0x49], "11": [0xdc, 0x20, 0x27],
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
