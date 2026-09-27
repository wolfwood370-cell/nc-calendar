// ----------------------------------------------------------------------------
// Lettura del Profilo cliente desktop (passata 06)
// ----------------------------------------------------------------------------
// Le stesse tabelle che leggeva la pagina di prima (trainer.clients.$id.tsx
// su main, load e loadOrphans), in una volta sola per useQuery. In più: il
// telefono e l'etichetta del pacchetto dal profilo, le note del coach e la
// conferma del cliente dalle sessioni, i crediti extra per i clienti liberi.
// Solo letture.
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import { isClientOrphan } from "@/lib/client-profile";
import type { BookingStatus, SessionType } from "@/lib/mock-data";

export interface ProfileClient {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  path_start_date: string | null;
  auto_renew_blocks: boolean | null;
  status: string;
  path_type: string | null;
  pack_label: string | null;
}

export interface ProfileBlock {
  id: string;
  sequence_order: number;
  start_date: string;
  end_date: string;
  status: string;
}

export interface ProfileAllocation {
  id: string;
  block_id: string;
  event_type_id: string | null;
  session_type: SessionType;
  quantity_assigned: number;
  quantity_booked: number;
  week_number: number;
  valid_until: string | null;
}

export interface ProfileExtra {
  id: string;
  event_type_id: string | null;
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

export interface ProfileBooking {
  id: string;
  scheduled_at: string;
  title: string | null;
  status: BookingStatus;
  block_id: string | null;
  event_type_id: string | null;
  session_type: SessionType;
  google_event_id: string | null;
  created_at: string;
  duration_min: number;
  trainer_notes: string | null;
  client_confirmed_at: string | null;
  client_id: string | null;
  coach_id: string;
  is_personal: boolean;
}

export interface ProfileOrphan {
  id: string;
  scheduled_at: string;
  title: string | null;
  notes: string | null;
  event_type_id: string | null;
  session_type: SessionType;
}

export interface ProfileData {
  client: ProfileClient;
  blocks: ProfileBlock[];
  allocations: ProfileAllocation[];
  extras: ProfileExtra[];
  weeks: Array<{ week_number: number; monday_date: string; shifted: boolean }>;
  /** Sessioni del cliente, dalla più recente. */
  bookings: ProfileBooking[];
  orphans: ProfileOrphan[];
}

function fail(e: { message: string }): never {
  throw new Error(e.message);
}

/** null se il cliente non c'è o il coach non lo vede. */
export async function loadClientProfile(
  clientId: string,
  coachId: string,
): Promise<ProfileData | null> {
  const { data: client, error: pErr } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, phone, path_start_date, auto_renew_blocks, status, path_type, pack_label",
    )
    .eq("id", clientId)
    .maybeSingle();
  if (pErr) fail(pErr);
  if (!client) return null;

  const { data: bls, error: bErr } = await supabase
    .from("training_blocks")
    .select("id, sequence_order, start_date, end_date, status")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("sequence_order", { ascending: true });
  if (bErr) fail(bErr);
  const blocks = (bls ?? []) as ProfileBlock[];

  let allocations: ProfileAllocation[] = [];
  if (blocks.length > 0) {
    const { data, error } = await supabase
      .from("block_allocations")
      .select(
        "id, block_id, event_type_id, session_type, quantity_assigned, quantity_booked, week_number, valid_until",
      )
      .in(
        "block_id",
        blocks.map((b) => b.id),
      );
    if (error) fail(error);
    allocations = (data ?? []) as ProfileAllocation[];
  }

  const { data: ec, error: eErr } = await supabase
    .from("extra_credits")
    .select("id, event_type_id, quantity, quantity_booked, expires_at")
    .eq("client_id", clientId);
  if (eErr) fail(eErr);

  const { data: weeks, error: wErr } = await supabase
    .from("weekly_schedule")
    .select("week_number, block_number, monday_date, shifted")
    .eq("client_id", clientId)
    .order("week_number", { ascending: true });
  if (wErr) fail(wErr);

  const { data: bks, error: kErr } = await supabase
    .from("bookings")
    .select(
      "id, scheduled_at, title, status, block_id, event_type_id, session_type, google_event_id, created_at, duration_min, trainer_notes, client_confirmed_at, client_id, coach_id, is_personal",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("scheduled_at", { ascending: false });
  if (kErr) fail(kErr);

  const { data: orph, error: oErr } = await supabase
    .from("bookings")
    .select(
      "id, scheduled_at, title, notes, event_type_id, session_type, ignored_by_clients, status, is_personal, block_id",
    )
    .eq("coach_id", coachId)
    .is("client_id", null)
    .is("deleted_at", null);
  if (oErr) fail(oErr);
  const fullName = client.full_name ?? client.email ?? "";
  const orphans = (orph ?? [])
    .filter((o) => isClientOrphan(o, fullName, clientId))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .map((o) => ({
      id: o.id,
      scheduled_at: o.scheduled_at,
      title: o.title,
      notes: o.notes,
      event_type_id: o.event_type_id,
      session_type: o.session_type as SessionType,
    }));

  return {
    client: client as ProfileClient,
    blocks,
    allocations,
    extras: (ec ?? []) as ProfileExtra[],
    weeks: (weeks ?? []).map((w) => ({
      week_number: w.week_number,
      monday_date: w.monday_date,
      shifted: w.shifted,
    })),
    bookings: (bks ?? []) as ProfileBooking[],
    orphans,
  };
}
