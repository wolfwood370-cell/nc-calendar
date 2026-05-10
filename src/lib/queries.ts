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
}

/* ---------- queries ---------- */

export function useCoachClients(coachId?: string) {
  return useQuery({
    queryKey: ["clients", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, coach_id")
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
        .select("id, client_id, coach_id, block_id, session_type, scheduled_at, status, meeting_link, deleted_at, event_type_id, notes, trainer_notes, google_event_id")
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
        .select("id, client_id, coach_id, block_id, session_type, scheduled_at, status, meeting_link, deleted_at, event_type_id, notes, trainer_notes, google_event_id")
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
    .select("id, block_id, week_number, session_type, event_type_id, quantity_assigned, quantity_booked")
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
}

export function useCoachEventTypes(coachId?: string | null) {
  return useQuery({
    queryKey: ["event_types", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<EventTypeRow[]> => {
      const { data, error } = await supabase
        .from("event_types")
        .select("id, coach_id, name, description, color, duration, base_type, location_type, buffer_minutes")
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

/* ---------- mutations ---------- */

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; late: boolean; allocationId?: string | null }) => {
      const status: BookingStatus = input.late ? "late_cancelled" : "cancelled";
      const { error } = await supabase
        .from("bookings")
        .update({ status, deleted_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
      // se la cancellazione è in tempo, restituisci il credito
      if (!input.late && input.allocationId) {
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
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
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
