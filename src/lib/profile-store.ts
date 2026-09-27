// ----------------------------------------------------------------------------
// Store Supabase del Profilo cliente (passata 06)
// ----------------------------------------------------------------------------
// Unisce gli store che il Profilo usa già altrove: quello del Calendario
// (calendar-store.ts, per modificare le sessioni), quello di «Assegna evento»
// (session-store.ts, per «Collega»), più le due scritture di prima su
// ignored_by_clients («Ignora» e «Scollega dal profilo»).
// ----------------------------------------------------------------------------

import { supabase } from "@/integrations/supabase/client";
import type { AssignStore } from "@/lib/assign-event";
import { supabaseCalendarStore } from "@/lib/calendar-store";
import type { UnlinkStore } from "@/lib/profile-session";
import type { EditStore } from "@/lib/session-edit";
import { supabaseAssignStore } from "@/lib/session-store";

export type ProfileStore = EditStore & AssignStore & UnlinkStore;

export const supabaseProfileStore: ProfileStore = {
  ...supabaseAssignStore,
  ...supabaseCalendarStore,

  async getIgnoredBy(eventId) {
    const { data, error } = await supabase
      .from("bookings")
      .select("ignored_by_clients")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.ignored_by_clients as string[] | null) ?? [];
  },

  async setIgnoredBy(eventId, clients) {
    const { error } = await supabase
      .from("bookings")
      .update({ ignored_by_clients: clients })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
  },

  async unlinkSession(id, ignored) {
    const { error } = await supabase
      .from("bookings")
      .update({ client_id: null, block_id: null, ignored_by_clients: ignored })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
