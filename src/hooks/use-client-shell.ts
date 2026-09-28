// ----------------------------------------------------------------------------
// I dati della cornice del cliente (lato cliente, passata 01)
// ----------------------------------------------------------------------------
// Il layout del cliente li legge una volta (useClientShellState) e li passa
// con un contesto a chi li usa: la barra in basso (il badge di Sessioni), la
// campanella dell'header desktop e quella delle intestazioni di scheda (le non
// lette), la pagina Notifiche (voci, lette, «segna tutte lette») e Sessioni.
// Una lettura sola, un orologio solo (useNow, così il badge compare quando una
// sessione entra nelle 48 ore) e un solo canale realtime della BIA, invece di
// uno per campanella.
// Lo stato «letta» resta in localStorage come prima, ma localStorage da solo
// non avvisa nessuno: qui sopra c'è un piccolo store, così quando la pagina
// Notifiche segna tutto letto la campanella dell'header desktop, che resta
// montata, perde il badge subito (e anche le altre schede del browser, con
// l'evento storage).
// Il profilo (coach_id, per i nomi delle tipologie) si legge con una chiave
// sua: quella di Home e Prenota («profile» e l'id, la stessa di query-keys.ts)
// ha due select diversi, e la cache mescolerebbe le colonne anche qui.
// ----------------------------------------------------------------------------

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useBiaMeasurements, type BiaMeasurement } from "@/hooks/use-bia";
import { useNow } from "@/hooks/use-now";
import { useClientFeedback, type SessionFeedback } from "@/hooks/use-session-feedback";
import {
  clientNotificationsReadKey,
  clientReminderItems,
  parseReadIds,
  unreadCount,
  type ClientReminderItem,
} from "@/lib/client-notifications";
import { sessionsBadge } from "@/lib/client-shell";
import {
  useClientBlocks,
  useClientBookings,
  useCoachEventTypes,
  type BlockRow,
  type BookingRow,
  type EventTypeRow,
} from "@/lib/queries";

export interface ClientShellState {
  userId: string | null;
  now: Date;
  bookings: readonly BookingRow[];
  /** Le sessioni sono ancora da caricare (la prima volta). */
  bookingsLoading: boolean;
  eventTypes: readonly EventTypeRow[];
  /** Il badge della scheda Sessioni: le sessioni «Da confermare» e il nome accessibile. */
  sessionsBadge: { count: number; label: string };
  /** Le voci della campanella, nell'ordine della pagina Notifiche. */
  reminders: readonly ClientReminderItem[];
  readIds: readonly string[];
  unread: number;
  /** Segna lette tutte le voci presenti, come faceva il popover. */
  markAllRead: () => void;
}

const NO_BOOKINGS: BookingRow[] = [];
const NO_BLOCKS: BlockRow[] = [];
const NO_EVENT_TYPES: EventTypeRow[] = [];
const NO_BIA: BiaMeasurement[] = [];
const NO_FEEDBACK: SessionFeedback[] = [];

const READ_KEY_PREFIX = clientNotificationsReadKey("");
const readListeners = new Set<() => void>();

function subscribeRead(listener: () => void) {
  readListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(READ_KEY_PREFIX)) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    readListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readRaw(userId: string | null): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(clientNotificationsReadKey(userId));
  } catch {
    return null;
  }
}

function writeRead(userId: string, ids: readonly string[]) {
  try {
    localStorage.setItem(clientNotificationsReadKey(userId), JSON.stringify(ids));
  } catch {
    // storage pieno o negato: il badge resta, nessun crash
  }
  for (const listener of readListeners) listener();
}

/** Legge e calcola i dati della cornice: lo chiama solo il layout del cliente. */
export function useClientShellState(): ClientShellState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const now = useNow();

  const profileQ = useQuery({
    queryKey: ["client-shell", "profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("coach_id")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const bookingsQ = useClientBookings(userId ?? undefined);
  const blocksQ = useClientBlocks(userId ?? undefined);
  const eventTypesQ = useCoachEventTypes(profileQ.data?.coach_id ?? null);
  const biaQ = useBiaMeasurements(userId);
  const feedbackQ = useClientFeedback(userId);

  const bookings = bookingsQ.data ?? NO_BOOKINGS;
  const blocks = blocksQ.data ?? NO_BLOCKS;
  const eventTypes = eventTypesQ.data ?? NO_EVENT_TYPES;
  const bia = biaQ.data ?? NO_BIA;
  const feedback = feedbackQ.data ?? NO_FEEDBACK;

  const reminders = useMemo(
    () => clientReminderItems({ now, bookings, blocks, eventTypes, bia, feedback }),
    [now, bookings, blocks, eventTypes, bia, feedback],
  );
  const badge = useMemo(() => sessionsBadge(bookings, now), [bookings, now]);

  const raw = useSyncExternalStore(
    subscribeRead,
    () => readRaw(userId),
    () => null,
  );
  const readIds = useMemo(() => parseReadIds(raw), [raw]);
  const unread = unreadCount(reminders, readIds);
  const markAllRead = useCallback(() => {
    if (userId)
      writeRead(
        userId,
        reminders.map((r) => r.id),
      );
  }, [userId, reminders]);

  const bookingsLoading = bookingsQ.isLoading;

  return useMemo(
    () => ({
      userId,
      now,
      bookings,
      bookingsLoading,
      eventTypes,
      sessionsBadge: badge,
      reminders,
      readIds,
      unread,
      markAllRead,
    }),
    [
      userId,
      now,
      bookings,
      bookingsLoading,
      eventTypes,
      badge,
      reminders,
      readIds,
      unread,
      markAllRead,
    ],
  );
}

export const ClientShellContext = createContext<ClientShellState | null>(null);

/** I dati della cornice, dentro il layout del cliente. */
export function useClientShell(): ClientShellState {
  const shell = useContext(ClientShellContext);
  if (!shell) throw new Error("useClientShell: fuori dal layout del cliente");
  return shell;
}
