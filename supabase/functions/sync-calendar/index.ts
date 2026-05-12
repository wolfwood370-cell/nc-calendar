// Edge function: sincronizzazione bidirezionale con Google Calendar (Service Account).
// Azioni supportate: create | cancel | import_history | mirror_check
// Smart parsing: identifica cliente da full_name/email e tipo evento da nome.

import { google } from "npm:googleapis@140";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

interface SyncPayload {
  action: "create" | "cancel" | "update" | "import_history" | "mirror_check";
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
  service_account_json?: string;
  calendar_id?: string;
}

type ClientLite = { id: string; full_name: string | null; email: string | null };
type EventTypeLite = { id: string; name: string; base_type: string };

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

  // Caller must be the coach itself or an admin
  if (body.coach_id !== auth.userId && auth.role !== "admin") {
    return json({ error: "Permesso negato" }, 403);
  }

  const supabase = auth.admin;

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
    const credentials =
      typeof serviceAccountRaw === "string" ? JSON.parse(serviceAccountRaw) : serviceAccountRaw;
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
      const res = await calendar.events.insert({ calendarId, requestBody: event });
      return json({ ok: true, event_id: res.data.id }, 200);
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
      const timeMin = body.range_start_iso ?? "2026-01-01T00:00:00Z";
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

        let { data: existing } = await supabase
          .from("bookings")
          .select("id, status, scheduled_at, block_id, client_id, event_type_id, session_type")
          .eq("google_event_id", id)
          .maybeSingle();

        // Fallback: stesso cliente + stesso orario senza google_event_id (evita duplicati)
        if (!existing && match.client) {
          const { data: localTwin } = await supabase
            .from("bookings")
            .select("id, status, scheduled_at, block_id, client_id, event_type_id, session_type")
            .eq("coach_id", body.coach_id)
            .eq("client_id", clientId)
            .eq("scheduled_at", startIso)
            .is("google_event_id", null)
            .maybeSingle();
          if (localTwin) {
            await supabase.from("bookings").update({ google_event_id: id }).eq("id", localTwin.id);
            existing = localTwin;
          }
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
      const timeMin = body.range_start_iso ?? new Date().toISOString();
      const timeMax = body.range_end_iso ?? twoYearsAhead2.toISOString();

      const { data: locals } = await supabase
        .from("bookings")
        .select(
          "id, google_event_id, scheduled_at, status, client_id, event_type_id, session_type, block_id",
        )
        .eq("coach_id", body.coach_id)
        .not("google_event_id", "is", null)
        .gte("scheduled_at", timeMin)
        .lte("scheduled_at", timeMax);

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

  // Tipo evento: nome più lungo presente nel titolo/descrizione
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
