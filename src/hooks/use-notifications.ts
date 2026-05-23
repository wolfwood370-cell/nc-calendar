// ----------------------------------------------------------------------------
// use-notifications — recipient-scoped notification feed + realtime + mark-read
// ----------------------------------------------------------------------------
// Bound to the `notifications` table introduced in
// supabase/migrations/20260524100000_notifications.sql. Writes happen
// server-side (booking-notifications Edge Function with service role);
// the client only reads its own rows (RLS) and toggles read_at via the
// mark_notification_read / mark_all_notifications_read RPCs.
//
// Realtime: the notifications table is published on supabase_realtime
// (the migration adds it). The channel filter `recipient_id=eq.<uid>`
// plus the RLS SELECT policy combine so a coach can only ever receive
// payloads addressed to themselves — no cross-user leakage.
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ----- Payload shapes (what producers write into payload jsonb) -----
// Documented here so consumers can switch on `type` and narrow safely.
// JSON columns are untyped at runtime, so the bell component does a
// shape check before rendering.

export interface BookingCreatedPayload {
  booking_id?: string;
  client_name: string;
  scheduled_at: string; // ISO
  session_label: string;
  meeting_link?: string;
}

export interface BookingRescheduledPayload {
  booking_id: string;
  client_name: string;
  old_scheduled_at: string; // ISO
  new_scheduled_at: string; // ISO
  session_label: string;
}

export type NotificationType = "booking.created" | "booking.rescheduled";

export interface NotificationRow {
  id: string;
  recipient_id: string;
  // Kept as `string` to stay forward-compat with future types added on
  // the server without a frontend deploy.
  type: NotificationType | string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// ----- Relaxed client shim ----------------------------------------------
// supabase.from() / supabase.rpc() are type-checked against the
// generated Database type in src/integrations/supabase/types.ts. The
// notifications table + RPCs land in that file only after Lovable
// regenerates the types post-migration. Until then we relax the client
// for these specific keys so the rest of the codebase stays strict.
// Remove the cast once `notifications` appears in the generated types.
interface NotificationsQueryBuilder {
  select: (cols: string) => NotificationsQueryBuilder;
  eq: (col: string, val: string) => NotificationsQueryBuilder;
  order: (col: string, opts: { ascending: boolean }) => NotificationsQueryBuilder;
  limit: (
    n: number,
  ) => Promise<{ data: NotificationRow[] | null; error: { message: string } | null }>;
}
interface RelaxedClient {
  from: (table: "notifications") => NotificationsQueryBuilder;
  rpc: (
    fn: "mark_notification_read" | "mark_all_notifications_read",
    args?: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
}
const sb = supabase as unknown as RelaxedClient;

// ----- Query / realtime / mutations -------------------------------------

const PAGE_SIZE = 30;
const notificationsKey = (userId: string) => ["notifications", userId] as const;

/**
 * Fetches the recipient's latest notifications and keeps them in sync via
 * a Realtime channel. Re-fetches on any INSERT / UPDATE / DELETE.
 */
export function useNotifications(userId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: notificationsKey(userId ?? ""),
    queryFn: async (): Promise<NotificationRow[]> => {
      if (!userId) return [];
      const { data, error } = await sb
        .from("notifications")
        .select("id, recipient_id, type, payload, read_at, created_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          // Volume is low (a handful per day per coach in steady state),
          // so refetching is simpler — and safer — than patching the
          // cache by hand for every event type.
          qc.invalidateQueries({ queryKey: notificationsKey(userId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query;
}

export function unreadCount(notifications: NotificationRow[] | undefined): number {
  if (!notifications) return 0;
  let n = 0;
  for (const x of notifications) if (x.read_at == null) n++;
  return n;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.rpc("mark_notification_read", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await sb.rpc("mark_all_notifications_read");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
