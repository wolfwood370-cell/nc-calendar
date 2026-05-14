import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SessionType, BookingStatus } from "@/lib/mock-data";

export interface BookingRow {
  id: string;
  client_id: string;
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
}

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

export function useCoachClients(coachId?: string) {
  return useQuery({
    queryKey: ["clients", coachId],
    enabled: !!coachId,
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

export function useCoachBookings(coachId?: string) {
  return useQuery({
    queryKey: ["bookings", "coach", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, client_id, coach_id, block_id, session_type, scheduled_at, status, meeting_link, deleted_at, event_type_id, notes, trainer_notes, google_event_id, title",
        )
        .eq("coach_id", coachId!)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookingRow[];
    },
  });
}

export function useClientBookings(clientId?: string) {
  return useQuery({
    queryKey: ["bookings", "client", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, client_id, coach_id, block_id, session_type, scheduled_at, status, meeting_link, deleted_at, event_type_id, notes, trainer_notes, google_event_id, title",
        )
        .eq("client_id", clientId!)
        .is("deleted_at", null)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BookingRow[];
    },
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
}

export function useCoachEventTypes(coachId?: string | null) {
  return useQuery({
    queryKey: ["event_types", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<EventTypeRow[]> => {
      const { data, error } = await supabase
        .from("event_types")
        .select(
          "id, coach_id, name, description, color, duration, base_type, location_type, buffer_minutes, location_address",
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

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; late: boolean; allocationId?: string | null }) => {
      const status: BookingStatus = input.late ? "late_cancelled" : "cancelled";

      // Recupera info per Google Calendar sync + block_id per decidere il refund path
      const { data: bk } = await supabase
        .from("bookings")
        .select(
          "id, coach_id, client_id, block_id, google_event_id, scheduled_at, session_type, event_type_id",
        )
        .eq("id", input.id)
        .maybeSingle();

      const { error } = await supabase
        .from("bookings")
        .update({ status, deleted_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;

      // se la cancellazione è in tempo, restituisci il credito
      if (!input.late) {
        if (input.allocationId) {
          // Refund via block_allocations (client con blocco attivo)
          const { data: alloc } = await supabase
            .from("block_allocations")
            .select("quantity_booked")
            .eq("id", input.allocationId)
            .maybeSingle();
          if (alloc) {
            await supabase
              .from("block_allocations")
              .update({ quantity_booked: Math.max(0, alloc.quantity_booked - 1) })
              .eq("id", input.allocationId);
          }
        } else if (!bk?.block_id && bk?.client_id && bk?.event_type_id) {
          // Refund via extra_credits (cliente indipendente / booster)
          const { data: ecRows } = await supabase
            .from("extra_credits")
            .select("id, quantity_booked")
            .eq("client_id", bk.client_id)
            .eq("event_type_id", bk.event_type_id)
            .gt("quantity_booked", 0)
            .order("expires_at", { ascending: true })
            .limit(1);
          const ec = (ecRows ?? [])[0];
          if (ec) {
            await supabase
              .from("extra_credits")
              .update({ quantity_booked: Math.max(0, ec.quantity_booked - 1) })
              .eq("id", ec.id);
          }
        }
      }

      // Sync Google Calendar: late => patch (mantieni evento grigio), free => delete
      if (bk?.google_event_id && bk.coach_id) {
        try {
          let clientName: string | undefined;
          let sessionLabel: string | undefined;
          if (input.late) {
            const [clientRes, etRes] = await Promise.all([
              bk.client_id
                ? supabase.from("profiles").select("full_name").eq("id", bk.client_id).maybeSingle()
                : Promise.resolve({ data: null }),
              bk.event_type_id
                ? supabase
                    .from("event_types")
                    .select("name")
                    .eq("id", bk.event_type_id)
                    .maybeSingle()
                : Promise.resolve({ data: null }),
            ]);
            clientName =
              (clientRes.data as { full_name: string | null } | null)?.full_name ?? "Cliente";
            sessionLabel = (etRes.data as { name: string } | null)?.name ?? "Sessione";
          }
          await supabase.functions.invoke("sync-calendar", {
            body: {
              action: "cancel",
              coach_id: bk.coach_id,
              google_event_id: bk.google_event_id,
              late: input.late,
              client_name: clientName,
              session_label: sessionLabel,
            },
          });
        } catch (err) {
          console.error("sync-calendar cancel failed", err);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      qc.invalidateQueries({ queryKey: ["extra_credits"] });
    },
  });
}

export function useCoachCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (booking: BookingRow) => {
      // 1. Rimuovi evento da Google Calendar (se collegato)
      if (booking.google_event_id) {
        try {
          await supabase.functions.invoke("sync-calendar", {
            body: {
              action: "cancel",
              coach_id: booking.coach_id,
              google_event_id: booking.google_event_id,
            },
          });
        } catch (err) {
          console.error("sync-calendar cancel failed", err);
        }
      }

      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" as BookingStatus, deleted_at: new Date().toISOString() })
        .eq("id", booking.id);
      if (error) throw error;

      if (booking.block_id) {
        // Refund via block_allocations
        const { data: allocs } = await supabase
          .from("block_allocations")
          .select("id, event_type_id, session_type, quantity_booked")
          .eq("block_id", booking.block_id);
        const list = (allocs ?? []) as Array<{
          id: string;
          event_type_id: string | null;
          session_type: SessionType;
          quantity_booked: number;
        }>;
        const match =
          list.find(
            (a) =>
              booking.event_type_id &&
              a.event_type_id === booking.event_type_id &&
              a.quantity_booked > 0,
          ) ?? list.find((a) => a.session_type === booking.session_type && a.quantity_booked > 0);
        if (match) {
          await supabase
            .from("block_allocations")
            .update({ quantity_booked: Math.max(0, match.quantity_booked - 1) })
            .eq("id", match.id);
        }
      } else if (booking.client_id && booking.event_type_id) {
        // Refund via extra_credits (cliente indipendente / booster)
        const { data: ecRows } = await supabase
          .from("extra_credits")
          .select("id, quantity_booked")
          .eq("client_id", booking.client_id)
          .eq("event_type_id", booking.event_type_id)
          .gt("quantity_booked", 0)
          .order("expires_at", { ascending: true })
          .limit(1);
        const ec = (ecRows ?? [])[0];
        if (ec) {
          await supabase
            .from("extra_credits")
            .update({ quantity_booked: Math.max(0, ec.quantity_booked - 1) })
            .eq("id", ec.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      qc.invalidateQueries({ queryKey: ["block-allocations"] });
      qc.invalidateQueries({ queryKey: ["extra_credits"] });
    },
  });
}

export function useMarkNoShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "no_show" as BookingStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}

export function useCoachAvailabilityExceptions(coachId?: string | null) {
  return useQuery({
    queryKey: ["availability_exceptions", coachId],
    enabled: !!coachId,
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

export function useUpdateTrainerNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; notes: string }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ trainer_notes: input.notes })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}
