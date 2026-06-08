import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SessionType, BookingStatus } from "@/lib/mock-data";
import { invalidateBookingScope, queryKeys } from "@/lib/query-keys";
import { gcalDeleteEvent, gcalUpdateEvent } from "@/lib/gcal.functions";

export interface BookingRow {
  id: string;
  // Nullable: unassigned events (no client picked yet) and personal
  // blocks (coach's own commitment) carry client_id = null. Existing
  // callers already gate on `b.client_id ? … : …` / `!b.client_id`.
  client_id: string | null;
  coach_id: string;
  block_id: string | null;
  session_type: SessionType;
  scheduled_at: string;
  status: BookingStatus;
  meeting_link: string | null;
  deleted_at: string | null;
  event_type_id: string | null;
  notes: string | null;
  trainer_notes: string | null;
  google_event_id: string | null;
  title: string | null;
  // H3 (FULL_APP_AUDIT.md): per-booking snapshot of the event type duration
  // and buffer, populated by trg_set_booking_duration_defaults at INSERT
  // time (migration 20260518120000). Renderers must prefer these over a
  // live event_types lookup so historical sessions keep their original
  // length even after the coach edits the parent event type.
  duration_min: number;
  buffer_min: number;
  // Personal Blocks: when true the row is the coach's own commitment
  // (e.g. "Dentista"), not a client session. block_id / event_type_id /
  // client_id are all NULL in this case. Rendered with a muted neutral
  // style and excluded from "to assign" / "external" UI categories.
  is_personal: boolean;
  // Sub-type discriminator for non-client time. Always 'client_session'
  // unless is_personal is true; then it narrows to the chosen flavor
  // ('personal' for generic blocks, 'consulenza' for consulenze, etc.).
  // Optional in BookingRow so frontend code written before the column
  // shipped keeps working under the defensive fallback.
  category?: BookingCategory;
}

export type BookingCategory = "client_session" | "personal" | "consulenza";

export interface AvailabilityExceptionRow {
  id: string;
  coach_id: string;
  date: string; // YYYY-MM-DD
  start_time: string | null; // HH:MM:SS
  end_time: string | null;
  reason: string;
}

export interface AllocationRow {
  id: string;
  block_id: string;
  week_number: number;
  session_type: SessionType;
  event_type_id: string | null;
  quantity_assigned: number;
  quantity_booked: number;
  valid_until: string | null;
}

export interface ExtraCreditRow {
  id: string;
  client_id: string;
  event_type_id: string;
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

export interface BlockRow {
  id: string;
  client_id: string;
  coach_id: string;
  start_date: string;
  end_date: string;
  status: "active" | "completed";
  sequence_order: number;
  allocations: AllocationRow[];
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  coach_id: string | null;
  status: string;
}

/* ---------- queries ---------- */

// M3: staleTime tuning. The default of 0 caused refetches on every window
// focus for read-heavy, slowly-changing data (event types, weekly
// availability, settings). Configuration tables get a 5-minute stale time;
// bookings/blocks/credits stay reactive (staleTime: 0) so a mutation
// elsewhere is immediately reflected in derived views.
const STALE_CONFIG = 5 * 60 * 1000;

export function useCoachClients(coachId?: string) {
  return useQuery({
    queryKey: ["clients", coachId],
    enabled: !!coachId,
    staleTime: STALE_CONFIG,
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, coach_id, status")
        .eq("coach_id", coachId!)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
}

// Defensive: the Personal Blocks feature added an `is_personal` column to
// public.bookings. When the frontend deploys ahead of the migration (which
// happens with Lovable's pipeline where SQL migrations are applied
// separately from the JS build), Postgres returns 42703 / "column ...
// does not exist" and the entire bookings query fails — leaving the
// calendar with the "Errore nel caricamento del calendario." banner.
// This helper tries the full SELECT first and retries without the new
// column on that specific error, treating any returned rows as
// is_personal=false until the migration lands.
const BOOKINGS_BASE_COLS =
  "id, client_id, coach_id, block_id, session_type, scheduled_at, status, meeting_link, deleted_at, event_type_id, notes, trainer_notes, google_event_id, title, duration_min, buffer_min";
// Two extra optional columns added by separate migrations. We attempt the
// widest SELECT first and fall back through the narrower variants if the
// project hasn't applied the relevant migration yet.
const BOOKINGS_COLS_WITH_PERSONAL = `${BOOKINGS_BASE_COLS}, is_personal`;
const BOOKINGS_COLS_FULL = `${BOOKINGS_COLS_WITH_PERSONAL}, category`;

function isMissingColumnError(
  err: { code?: string; message?: string } | null,
  needle: string,
): boolean {
  if (!err) return false;
  if (err.code === "42703") return true;
  return typeof err.message === "string" && err.message.includes(needle);
}

// Apply default values for columns that may be missing because the
// migration hasn't shipped yet. Preserves any value already present on
// the row (so the post-migration "wide" SELECT returns unchanged data),
// while filling in safe defaults for the older shapes. Centralizing the
// cast here lets the call sites drop the noisy `as unknown as BookingRow`.
function withBookingDefaults(b: Record<string, unknown>): BookingRow {
  const row = b as Partial<BookingRow>;
  return {
    ...b,
    is_personal: row.is_personal ?? false,
    category: row.category ?? "client_session",
  } as BookingRow;
}

// Generic ladder: try wider → narrower SELECTs until one succeeds, then
// fill in missing columns with safe defaults. The supabase-js typing
// can't model the union of "all three columns" / "two columns" / "base"
// well, so we treat results as raw objects and project them at the end.
async function loadBookingsWithFallback(
  build: (cols: string) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>,
): Promise<BookingRow[]> {
  // Attempt 1: widest schema (category + is_personal).
  const wide = await build(BOOKINGS_COLS_FULL);
  if (!wide.error) {
    return (wide.data as BookingRow[] | null) ?? [];
  }
  if (!isMissingColumnError(wide.error, "category")) {
    // Maybe is_personal is missing too — try base.
    if (isMissingColumnError(wide.error, "is_personal")) {
      const base = await build(BOOKINGS_BASE_COLS);
      if (base.error) throw base.error;
      return ((base.data as Record<string, unknown>[] | null) ?? []).map(withBookingDefaults);
    }
    throw wide.error;
  }

  // Attempt 2: category missing, is_personal present.
  const mid = await build(BOOKINGS_COLS_WITH_PERSONAL);
  if (!mid.error) {
    return ((mid.data as Record<string, unknown>[] | null) ?? []).map(withBookingDefaults);
  }
  if (!isMissingColumnError(mid.error, "is_personal")) throw mid.error;

  // Attempt 3: pre-personal-blocks project.
  const base = await build(BOOKINGS_BASE_COLS);
  if (base.error) throw base.error;
  return ((base.data as Record<string, unknown>[] | null) ?? []).map(withBookingDefaults);
}

// HIGH-2 (audit 2026-05-26): safety net contro fetch unbounded.
// Senza cap, un coach con 5000+ bookings storici (o un cliente con
// percorso pluri-annuale + booster) scaricherebbe l'intero set al mount,
// causando layout shift e memoria elevata. Il limit a 1000 copre con
// margine i casi reali (28 sessioni/blocco × 24 blocchi = 672 max
// teorico per un cliente) e funge da circuit-breaker.
//
// Ordine DESC: con il limit servono i più RECENTI (i consumer fanno
// filtering/sorting proprio downstream, quindi il cambio di default non
// rompe nessuno — verificato grep dei call site su client.{index,book},
// trainer.{index,calendar,clients.$id}, mobile-calendar-agenda).
const BOOKINGS_FETCH_LIMIT = 1000;

async function selectBookingsByCoach(coachId: string): Promise<BookingRow[]> {
  return loadBookingsWithFallback((cols) =>
    supabase
      .from("bookings")
      .select(cols)
      .eq("coach_id", coachId)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false })
      .limit(BOOKINGS_FETCH_LIMIT),
  );
}

async function selectBookingsByClient(clientId: string): Promise<BookingRow[]> {
  return loadBookingsWithFallback((cols) =>
    supabase
      .from("bookings")
      .select(cols)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false })
      .limit(BOOKINGS_FETCH_LIMIT),
  );
}

export function useCoachBookings(coachId?: string) {
  return useQuery({
    queryKey: ["bookings", "coach", coachId],
    enabled: !!coachId,
    // B20 (audit): staleTime breve per evitare refetch dell'intera lista a ogni
    // focus/cambio finestra. Le mutation invalidano comunque la query
    // (invalidateQueries), quindi i cambiamenti restano immediati.
    staleTime: 30_000,
    queryFn: () => selectBookingsByCoach(coachId!),
  });
}

export function useClientBookings(clientId?: string) {
  return useQuery({
    queryKey: ["bookings", "client", clientId],
    enabled: !!clientId,
    staleTime: 30_000,
    queryFn: () => selectBookingsByClient(clientId!),
  });
}

async function loadBlocks(filter: { coach_id?: string; client_id?: string }): Promise<BlockRow[]> {
  let q = supabase
    .from("training_blocks")
    .select("id, client_id, coach_id, start_date, end_date, status, sequence_order")
    .is("deleted_at", null)
    .order("sequence_order", { ascending: true })
    .order("start_date", { ascending: false });
  if (filter.coach_id) q = q.eq("coach_id", filter.coach_id);
  if (filter.client_id) q = q.eq("client_id", filter.client_id);
  const { data: blocks, error } = await q;
  if (error) throw error;
  const ids = (blocks ?? []).map((b) => b.id);
  if (ids.length === 0) return [];
  const { data: allocs, error: aerr } = await supabase
    .from("block_allocations")
    .select(
      "id, block_id, week_number, session_type, event_type_id, quantity_assigned, quantity_booked, valid_until",
    )
    .in("block_id", ids);
  if (aerr) throw aerr;
  return (blocks ?? []).map((b) => ({
    ...(b as Omit<BlockRow, "allocations">),
    allocations: ((allocs ?? []) as AllocationRow[]).filter((a) => a.block_id === b.id),
  }));
}

export function useCoachBlocks(coachId?: string) {
  return useQuery({
    queryKey: ["blocks", "coach", coachId],
    enabled: !!coachId,
    queryFn: () => loadBlocks({ coach_id: coachId }),
  });
}

export function useClientBlocks(clientId?: string) {
  return useQuery({
    queryKey: ["blocks", "client", clientId],
    enabled: !!clientId,
    queryFn: () => loadBlocks({ client_id: clientId }),
  });
}

export function useClientExtraCredits(clientId?: string) {
  return useQuery({
    queryKey: ["extra_credits", "client", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<ExtraCreditRow[]> => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("extra_credits")
        .select("id, client_id, event_type_id, quantity, quantity_booked, expires_at")
        .eq("client_id", clientId!)
        .gte("expires_at", now);
      if (error) throw error;
      return (data ?? []) as ExtraCreditRow[];
    },
  });
}

export interface AvailabilityRow {
  id: string;
  coach_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface EventTypeRow {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  color: string;
  duration: number;
  base_type: SessionType;
  location_type: "physical" | "online";
  buffer_minutes: number;
  location_address: string | null;
  client_bookable: boolean;
  unavailable_message: string | null;
}

export function useCoachEventTypes(coachId?: string | null) {
  return useQuery({
    queryKey: ["event_types", coachId],
    enabled: !!coachId,
    staleTime: STALE_CONFIG,
    queryFn: async (): Promise<EventTypeRow[]> => {
      const { data, error } = await supabase
        .from("event_types")
        .select(
          "id, coach_id, name, description, color, duration, base_type, location_type, buffer_minutes, location_address, client_bookable, unavailable_message",
        )
        .eq("coach_id", coachId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventTypeRow[];
    },
  });
}

export function useCoachAvailability(coachId?: string | null) {
  return useQuery({
    queryKey: ["trainer_availability", coachId],
    enabled: !!coachId,
    staleTime: STALE_CONFIG,
    queryFn: async (): Promise<AvailabilityRow[]> => {
      const { data, error } = await supabase
        .from("trainer_availability")
        .select("id, coach_id, day_of_week, start_time, end_time")
        .eq("coach_id", coachId!)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AvailabilityRow[];
    },
  });
}

export function useCoachOptimizationEnabled(coachId?: string | null) {
  return useQuery({
    queryKey: ["integration_settings", "optimization", coachId],
    enabled: !!coachId,
    staleTime: STALE_CONFIG,
    queryFn: async (): Promise<boolean> => {
      const { data } = await supabase
        .from("integration_settings")
        .select("calendar_optimization_enabled")
        .eq("coach_id", coachId!)
        .maybeSingle();
      const v = (data as { calendar_optimization_enabled?: boolean } | null)
        ?.calendar_optimization_enabled;
      return v ?? true;
    },
  });
}

/* ---------- mutations ---------- */

// M1: optimistic remove of a booking row from any cached bookings list,
// with rollback on failure. Shared by client and coach cancel flows.
function optimisticBookingRemove(qc: QueryClient, bookingId: string) {
  return async () => {
    await qc.cancelQueries({ predicate: (q) => q.queryKey[0] === "bookings" });
    const snapshots = qc.getQueriesData<BookingRow[]>({
      predicate: (q) => q.queryKey[0] === "bookings",
    });
    qc.setQueriesData<BookingRow[]>({ predicate: (q) => q.queryKey[0] === "bookings" }, (old) =>
      (old ?? []).filter((b) => b.id !== bookingId),
    );
    return { snapshots };
  };
}

function rollbackSnapshots(
  qc: QueryClient,
  snapshots?: Array<[unknown, BookingRow[] | undefined]>,
) {
  if (!snapshots) return;
  for (const [key, data] of snapshots) {
    qc.setQueryData(key as readonly unknown[], data);
  }
}

export interface CancelBookingResult {
  coachId: string | null;
  clientId: string | null;
  wasLate: boolean;
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    // M3 (FULL_APP_AUDIT.md): the late/free decision and the credit refund
    // now happen inside the cancel_booking SECURITY DEFINER RPC, which
    // compares scheduled_at to now() on the server clock. The frontend no
    // longer chooses; it just calls and reads the result. Google Calendar
    // sync stays here because it lives outside the DB transaction.
    mutationFn: async (input: { id: string }): Promise<CancelBookingResult> => {
      // Snapshot the minimal metadata needed for the post-cancel sync
      // before the row is soft-deleted by the RPC.
      const { data: bk } = await supabase
        .from("bookings")
        .select("id, coach_id, client_id, google_event_id, event_type_id")
        .eq("id", input.id)
        .maybeSingle();

      const { data, error } = await supabase.rpc("cancel_booking", {
        p_booking_id: input.id,
      });
      if (error) throw error;
      const result = (Array.isArray(data) ? data[0] : data) as {
        status: BookingStatus;
        was_late: boolean;
      } | null;
      if (!result) throw new Error("Cancellazione non riuscita.");
      const wasLate = result.was_late;

      // Sync Google Calendar: in entrambi i casi (late o free) cancelliamo
      // l'evento dal calendario della piattaforma. La logica del rimborso
      // credito vive nel RPC `cancel_booking` (server-side).
      if (bk?.google_event_id) {
        try {
          await gcalDeleteEvent({ data: { googleEventId: bk.google_event_id } });
        } catch (err) {
          console.error("gcalDeleteEvent failed", err);
        }
      }

      return {
        coachId: bk?.coach_id ?? null,
        clientId: bk?.client_id ?? null,
        wasLate,
      };
    },
    onMutate: (input) => optimisticBookingRemove(qc, input.id)(),
    onError: (_e, _vars, ctx) => rollbackSnapshots(qc, ctx?.snapshots),
    onSuccess: (scope) => {
      invalidateBookingScope(qc, scope);
    },
  });
}

// ----------------------------------------------------------------------------
// useRescheduleBooking — client self-service reschedule via UPDATE-only path.
// ----------------------------------------------------------------------------
// Pure UPDATE on scheduled_at. The new DB trigger
// z_trg_validate_client_booking_update (migration 20260522100000) enforces:
//   - 24h cutoff against OLD.scheduled_at
//   - whitelist: only scheduled_at may change
// On client-driven UPDATEs, the trigger raises P0001 with an Italian message
// when violated, so callers can pass error.message straight into a toast.
//
// Same booking row → same id → same google_event_id → same meeting_link.
// No credit refund/re-consume (the credit was already debited at create
// time and stays accounted against the same allocation). After a successful
// UPDATE we fire-and-forget a sync-calendar action=update so the coach's
// Google Calendar event shifts too.
//
// Optimistic patch: shifts scheduled_at in every cached bookings list
// (coach + client + per-client) so the agenda re-orders before the server
// round-trip. Rollback on error restores the snapshot.
// ----------------------------------------------------------------------------
export function useRescheduleBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      bookingId: string;
      newScheduledISO: string;
      // M4 (audit): contesto opzionale per la notifica al coach (vedi onSuccess).
      oldScheduledISO?: string;
      sessionLabel?: string;
      clientName?: string;
    }): Promise<{
      coach_id: string;
      client_id: string | null;
      google_event_id: string | null;
      scheduled_at: string;
      end_at: string;
    }> => {
      // Reschedule via RPC atomico: valida finestra+24h, ri-alloca i crediti
      // (rilascia vecchia settimana, consuma nuova) e sposta scheduled_at.
      // Sostituisce l'UPDATE diretto + il trigger FIX D (rimosso).
      const { data, error } = await supabase.rpc("reschedule_booking", {
        p_booking_id: input.bookingId,
        p_new_scheduled_at: input.newScheduledISO,
      });
      if (error) throw error;
      // reschedule_booking RETURNS TABLE(...) -> PostgREST serializza come array.
      const row = data?.[0];
      if (!row) throw new Error("reschedule_booking non ha restituito la riga aggiornata.");
      return row;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ predicate: (q) => q.queryKey[0] === "bookings" });
      const snapshots = qc.getQueriesData<BookingRow[]>({
        predicate: (q) => q.queryKey[0] === "bookings",
      });
      qc.setQueriesData<BookingRow[]>({ predicate: (q) => q.queryKey[0] === "bookings" }, (old) =>
        (old ?? []).map((b) =>
          b.id === vars.bookingId ? { ...b, scheduled_at: vars.newScheduledISO } : b,
        ),
      );
      return { snapshots };
    },
    onError: (_e, _vars, ctx) => rollbackSnapshots(qc, ctx?.snapshots),
    onSuccess: (data, vars) => {
      invalidateBookingScope(qc, {
        coachId: data.coach_id,
        clientId: data.client_id,
      });
      // Mirror the new time to Google Calendar via Lovable Connector.
      // Fire-and-forget: GCal è downstream rispetto alla booking row.
      if (data.google_event_id) {
        void gcalUpdateEvent({
          data: {
            googleEventId: data.google_event_id,
            startISO: data.scheduled_at,
            endISO: data.end_at,
          },
        }).catch((e) => console.error("gcalUpdateEvent failed", e));
      }
      // M4 (audit): notifica il coach (booking.rescheduled) dalla mutation
      // CONDIVISA, così OGNI percorso di reschedule cliente avvisa il coach.
      // Prima solo client-reschedule-sheet (dal dettaglio) notificava;
      // reschedule-drawer (dalla dashboard) no. Fire-and-forget.
      void supabase.functions
        .invoke("booking-notifications", {
          body: {
            event_type: "booking.rescheduled",
            coach_id: data.coach_id,
            client_name: vars.clientName ?? null,
            scheduled_at: data.scheduled_at,
            old_scheduled_at: vars.oldScheduledISO ?? null,
            session_label: vars.sessionLabel ?? null,
            booking_id: vars.bookingId,
          },
        })
        .catch((e) => console.error("booking-notifications (rescheduled) failed", e));
    },
  });
}

// useCoachCancelBooking RIMOSSA (audit 2026-06-06): funzione mai importata,
// duplicava la logica di cancellazione/refund gia' coperta dall'RPC server.

export function useCoachAvailabilityExceptions(coachId?: string | null) {
  return useQuery({
    queryKey: ["availability_exceptions", coachId],
    enabled: !!coachId,
    staleTime: STALE_CONFIG,
    queryFn: async (): Promise<AvailabilityExceptionRow[]> => {
      const { data, error } = await supabase
        .from("availability_exceptions")
        .select("id, coach_id, date, start_time, end_time, reason")
        .eq("coach_id", coachId!)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AvailabilityExceptionRow[];
    },
  });
}
