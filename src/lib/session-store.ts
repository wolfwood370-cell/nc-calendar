// ----------------------------------------------------------------------------
// SessionStore su Supabase e Google Calendar (per cancel-session.ts)
// ----------------------------------------------------------------------------
// Le scritture sono condizionate al valore letto (compare-and-set con un
// filtro in più nell'UPDATE): se nel frattempo la riga è cambiata l'UPDATE non
// tocca nulla e si rilegge. Così due annullamenti in parallelo, o una
// prenotazione del cliente nello stesso istante, non si sovrascrivono i
// contatori dei crediti.
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import type { AssignableEvent, AssignStore } from "@/lib/assign-event";
import type { CreditRef, SessionStore, StoredSession } from "@/lib/cancel-session";
import { gcalCreateEvent, gcalDeleteEvent } from "@/lib/gcal.functions";
import { toGoogleColorId } from "@/lib/gcal-colors";
import { sessionLabel } from "@/lib/mock-data";

const SESSION_COLUMNS =
  "id, status, deleted_at, client_id, coach_id, is_personal, block_id, event_type_id, session_type, scheduled_at, google_event_id";

/** Tentativi di compare-and-set sui contatori prima di arrendersi. */
const MAX_ATTEMPTS = 3;

function toError(e: { code?: string; message: string }): Error {
  // bookings_no_overlap_per_coach: rimettere in agenda sovrapporrebbe due sessioni.
  if (e.code === "23P01") return new Error("L'orario ora è occupato da un'altra sessione.");
  return new Error(e.message);
}

async function moveAllocation(id: string, delta: 1 | -1): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("block_allocations")
      .select("quantity_assigned, quantity_booked")
      .eq("id", id)
      .maybeSingle();
    if (error) throw toError(error);
    if (!data) return false;
    const next = data.quantity_booked + delta;
    if (next < 0 || (delta > 0 && next > data.quantity_assigned)) return false;
    const { data: rows, error: upErr } = await supabase
      .from("block_allocations")
      .update({ quantity_booked: next })
      .eq("id", id)
      .eq("quantity_booked", data.quantity_booked)
      .select("id");
    if (upErr) throw toError(upErr);
    if ((rows ?? []).length > 0) return true;
  }
  return false;
}

async function moveExtraCredit(id: string, delta: 1 | -1): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
      .from("extra_credits")
      .select("quantity, quantity_booked")
      .eq("id", id)
      .maybeSingle();
    if (error) throw toError(error);
    if (!data) return false;
    const next = data.quantity_booked + delta;
    if (next < 0 || (delta > 0 && next > data.quantity)) return false;
    const { data: rows, error: upErr } = await supabase
      .from("extra_credits")
      .update({ quantity_booked: next })
      .eq("id", id)
      .eq("quantity_booked", data.quantity_booked)
      .select("id");
    if (upErr) throw toError(upErr);
    if ((rows ?? []).length > 0) return true;
  }
  return false;
}

/** Ricrea l'evento Google come fa la riparazione del Calendario: «Tipologia — Cliente». */
async function createGoogleEvent(sessionId: string): Promise<boolean> {
  const { data: b, error } = await supabase
    .from("bookings")
    .select(
      "id, client_id, coach_id, is_personal, title, event_type_id, session_type, scheduled_at, duration_min",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !b) return false;

  const { data: et } = b.event_type_id
    ? await supabase
        .from("event_types")
        .select("name, color, location_type, description")
        .eq("id", b.event_type_id)
        .maybeSingle()
    : { data: null };
  const own = b.is_personal || !b.client_id || b.client_id === b.coach_id;
  const { data: client } =
    !own && b.client_id
      ? await supabase.from("profiles").select("full_name").eq("id", b.client_id).maybeSingle()
      : { data: null };

  const label = b.title?.trim() || et?.name || sessionLabel(b.session_type);
  const start = new Date(b.scheduled_at);
  const end = new Date(start.getTime() + (b.duration_min || 60) * 60_000);
  const isOnline = et?.location_type === "online";
  const r = await gcalCreateEvent({
    data: {
      bookingId: b.id,
      summary: client?.full_name ? `${label} — ${client.full_name}` : label,
      description: et?.description ?? undefined,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      requestMeet: isOnline,
      isOnline,
      colorId: toGoogleColorId(et?.color),
    },
  });
  if (!r.ok) return false;
  // Il server salva già il nuovo id sulla sessione; riscriverlo (solo se è
  // ancora vuoto) copre il caso raro in cui quella scrittura fallisca.
  await supabase
    .from("bookings")
    .update({ google_event_id: r.googleEventId })
    .eq("id", b.id)
    .is("google_event_id", null);
  return true;
}

export const supabaseSessionStore: SessionStore = {
  async getSession(id) {
    const { data, error } = await supabase
      .from("bookings")
      .select(SESSION_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toError(error);
    return (data as StoredSession | null) ?? null;
  },

  async updateSession(id, expected, patch) {
    const q = supabase.from("bookings").update(patch).eq("id", id).eq("status", expected.status);
    const { data, error } = await (
      expected.deleted ? q.not("deleted_at", "is", null) : q.is("deleted_at", null)
    ).select("id");
    if (error) throw toError(error);
    return (data ?? []).length > 0;
  },

  async listAllocations(blockId) {
    const { data, error } = await supabase
      .from("block_allocations")
      .select(
        "id, block_id, event_type_id, session_type, week_number, quantity_assigned, quantity_booked, valid_until, created_at",
      )
      .eq("block_id", blockId);
    if (error) throw toError(error);
    return data ?? [];
  },

  async getBlockStart(blockId) {
    const { data, error } = await supabase
      .from("training_blocks")
      .select("start_date")
      .eq("id", blockId)
      .maybeSingle();
    if (error) throw toError(error);
    return data?.start_date ?? null;
  },

  async listExtraCredits(clientId, eventTypeId) {
    const { data, error } = await supabase
      .from("extra_credits")
      .select("id, event_type_id, quantity, quantity_booked, expires_at")
      .eq("client_id", clientId)
      .eq("event_type_id", eventTypeId);
    if (error) throw toError(error);
    return data ?? [];
  },

  moveCredit(ref: CreditRef, delta) {
    return ref.kind === "allocation"
      ? moveAllocation(ref.id, delta)
      : moveExtraCredit(ref.id, delta);
  },

  async deleteGoogleEvent(googleEventId) {
    const r = await gcalDeleteEvent({ data: { googleEventId } });
    return r.ok;
  },

  createGoogleEvent,
};

const EVENT_COLUMNS =
  "id, status, deleted_at, client_id, coach_id, is_personal, category, block_id, event_type_id, session_type, scheduled_at, title, notes";

export const supabaseAssignStore: AssignStore = {
  listAllocations: supabaseSessionStore.listAllocations,
  listExtraCredits: supabaseSessionStore.listExtraCredits,
  moveCredit: supabaseSessionStore.moveCredit,

  async getEvent(id) {
    const { data, error } = await supabase
      .from("bookings")
      .select(EVENT_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw toError(error);
    return (data as AssignableEvent | null) ?? null;
  },

  async updateEvent(id, expected, patch) {
    let q = supabase
      .from("bookings")
      .update(patch)
      .eq("id", id)
      .eq("is_personal", expected.is_personal);
    q =
      expected.client_id === null ? q.is("client_id", null) : q.eq("client_id", expected.client_id);
    q = expected.block_id === null ? q.is("block_id", null) : q.eq("block_id", expected.block_id);
    const { data, error } = await q.select("id");
    if (error) throw toError(error);
    return (data ?? []).length > 0;
  },

  async listClientBlocks(clientId) {
    const { data, error } = await supabase
      .from("training_blocks")
      .select("id, start_date, end_date")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    if (error) throw toError(error);
    return data ?? [];
  },

  async markSpecial(id, category) {
    // Rimborsa i crediti eventualmente scalati e scollega cliente, blocco e
    // tipologia, controllando lato server che l'evento sia del coach.
    const { error } = await supabase.rpc("mark_booking_special", {
      p_booking_id: id,
      p_category: category,
    });
    if (error) throw toError(error);
  },
};
