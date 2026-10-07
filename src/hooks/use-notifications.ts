// ----------------------------------------------------------------------------
// use-notifications — recipient-scoped notification feed + realtime + mark-read
// ----------------------------------------------------------------------------
// Bound to the `notifications` table introduced in
// supabase/migrations/20260524100000_notifications.sql. Writes happen
// server-side (booking-notifications Edge Function with service role,
// stripe-webhook for the Booster purchases, passata 06, and from the server
// round of 07/10/2026 the database itself when a client cancels or restores
// a session); the client only reads its own rows (RLS) and toggles read_at
// via the mark_notification_read / mark_all_notifications_read RPCs.
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

/**
 * Un cliente ha comprato un Booster (stripe-webhook, passata 06): la
 * campanella apre il suo profilo.
 */
export interface BoosterPurchasedPayload {
  client_id: string;
  /** profiles.full_name dopo il trim, al più 200 caratteri, o «Cliente». */
  client_name: string;
  /** I crediti comprati, un intero da 1 in su. */
  quantity: number;
  /** Il nome della tipologia. */
  session_label: string;
  /** Il prezzo pagato, in euro (come extra_credits.price_paid). */
  amount?: number;
  /** booster_packs.package_type. */
  package_type?: string | null;
}

/**
 * Il cliente ha annullato una sessione (giro del server del 07/10/2026): la
 * riga c'è solo quando agisce il cliente. `late` vero: annullata a meno di 24
 * ore dall'inizio, e il credito resta scalato. Il server scrive sempre
 * booking_id; la guardia non lo pretende, e senza si apre solo il giorno.
 */
export interface BookingCancelledPayload {
  booking_id?: string;
  client_name: string;
  session_label: string;
  scheduled_at: string; // ISO, da jsonb con l'offset (a volte coi microsecondi)
  late: boolean;
}

/** Il «Ripristina» del cliente, entro 10 minuti dall'annullamento (giro del server del 07/10/2026). */
export interface BookingRestoredPayload {
  booking_id?: string;
  client_name: string;
  session_label: string;
  scheduled_at: string; // ISO, da jsonb con l'offset (a volte coi microsecondi)
}

export type NotificationType =
  | "booking.created"
  | "booking.rescheduled"
  | "booster.purchased"
  | "booking.cancelled"
  | "booking.restored";

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

// ----- Query / realtime / mutations -------------------------------------

const PAGE_SIZE = 30;
const notificationsKey = (userId: string) => ["notifications", userId] as const;

// Suffisso univoco per istanza di hook: supabase.channel(nome) RIUSA il
// canale se il nome coincide, e aggiungere .on() a un canale già
// sottoscritto lancia "cannot add postgres_changes callbacks after
// subscribe()". Con due bell montate (header globale + testata mobile
// della Panoramica) il nome condiviso `notifications:<uid>` crashava.
let notifChannelSeq = 0;

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
      const { data, error } = await supabase
        .from("notifications")
        .select("id, recipient_id, type, payload, read_at, created_at")
        .eq("recipient_id", userId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw new Error(error.message);
      // payload is typed as Supabase Json (which includes null / array /
      // primitives). The producers (booking-notifications edge function)
      // always write an object, but a malformed historical row should
      // degrade to {} rather than crash the consumer.
      // MED-C2: il fallback {} nasconde silenziosamente schema corrotti.
      // Aggiungo console.warn così uno schema invalido è almeno visibile
      // nei logs (sarà catturato anche da Sentry se attivo). Non blocca
      // il render — la UI continua a degradare gracefully.
      return (data ?? []).map((row) => {
        const isValidPayload =
          typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload);
        if (!isValidPayload && row.payload !== null && row.payload !== undefined) {
          console.warn("use-notifications: payload schema invalido", {
            id: (row as { id?: string }).id,
            payloadType: typeof row.payload,
            isArray: Array.isArray(row.payload),
          });
        }
        return {
          ...row,
          payload: isValidPayload ? (row.payload as Record<string, unknown>) : {},
        };
      });
    },
    enabled: !!userId,
    // N14 (audit 2026-06-03): seed con array vuoto così la chiave [""]
    // non viene mai popolata con dati di un altro utente quando userId
    // è null/undefined (es. logout in corso).
    initialData: userId ? undefined : [],
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}:${++notifChannelSeq}`)
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
      const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
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
      const { error } = await supabase.rpc("mark_all_notifications_read");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
