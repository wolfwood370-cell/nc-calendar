// ----------------------------------------------------------------------------
// I dati della cornice del cliente (lato cliente, passate 01 e 08)
// ----------------------------------------------------------------------------
// Il layout del cliente li legge una volta (useClientShellState) e li passa
// con un contesto a chi li usa: la barra in basso (il badge di Sessioni), la
// campanella dell'header desktop e quella delle intestazioni di scheda (le non
// lette), la pagina Notifiche (le voci, una letta alla volta o tutte) e le
// pagine che vogliono l'ora. Una lettura sola e un orologio solo (useNow, così
// il badge compare quando una sessione entra nelle 48 ore).
// Dalla 08 le notifiche hanno due fonti (client-notifications.ts):
//   - i promemoria, calcolati qui dalle sessioni, dalle valutazioni, dalla BIA
//     (col suo canale realtime), dallo stato dei crediti di Prenota
//     (useClientBookState) e dal coach (useMyCoach): le stesse chiavi delle
//     pagine, quindi le stesse letture in cache;
//   - le azioni del coach, righe di notifications col loro canale realtime
//     (useNotifications, lo stesso hook del coach, che non cambia). Una riga
//     nuova fa rileggere sessioni e crediti (invalidateBookingScope): le
//     sessioni non hanno un canale realtime, e la riga parla di una sessione
//     che la cache può non avere ancora.
// Lo stato «letta» dei promemoria resta in localStorage, ma localStorage da
// solo non avvisa nessuno: qui sopra c'è un piccolo store, così quando la
// pagina Notifiche segna una voce la campanella dell'header desktop, che resta
// montata, si aggiorna subito (e anche le altre schede del browser, con
// l'evento storage). Le righe del database si segnano con le due RPC di
// use-notifications.ts, e la cache si segna prima della risposta; se la RPC
// fallisce, le righe si rileggono.
// La pagina mostra lo scheletro finché non sono arrivate tutte le letture da
// cui vengono le voci (le righe, le sessioni, le valutazioni, la BIA, lo stato
// dei crediti e il profilo di qui), e la card con «Riprova» se una è persa:
// «Nessuna notifica», o una lista a metà, detti prima di aver letto sarebbero
// falsi. Una cliente con la sola voce dei crediti, senza lo stato dei crediti
// nel cancello, vedrebbe «Nessuna notifica» finché non arriva, e per sempre se
// la lettura degli extra si perde.
// ⚠️ La cache delle righe si segna senza fermare una lettura in volo
// (cancelQueries): se un evento realtime ne ha appena fatta partire una, la
// sua risposta può riportare la riga a «non letta» fino all'invalidazione
// della RPC riuscita (qualche centinaio di millisecondi, sulla pagina che il
// tocco ha appena lasciato). Dichiarato, non corretto.
// Il profilo (coach_id per i nomi delle tipologie, path_start_date per il
// percorso nuovo) si legge con una chiave sua: quella di Home e Prenota
// («profile» e l'id, la stessa di query-keys.ts) ha due select diversi, e la
// cache mescolerebbe le colonne anche qui.
// ----------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useBiaMeasurements, type BiaMeasurement } from "@/hooks/use-bia";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useMyCoach } from "@/hooks/use-my-coach";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationRow,
} from "@/hooks/use-notifications";
import { useNow } from "@/hooks/use-now";
import { useClientFeedback } from "@/hooks/use-session-feedback";
import {
  clientNotificationList,
  clientNotificationsReadKey,
  clientReminders,
  nextReadIds,
  parseReadIds,
  unreadCount,
  type ClientNotificationItem,
} from "@/lib/client-notifications";
import { sessionsBadge } from "@/lib/client-shell";
import { invalidateBookingScope } from "@/lib/query-keys";
import { arrivedRead, lostRead } from "@/lib/query-state";
import {
  useClientBookings,
  useCoachEventTypes,
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
  /** Le voci della pagina Notifiche, dalla più recente: i promemoria e le azioni del coach. */
  notifications: readonly ClientNotificationItem[];
  /** Una delle letture da cui vengono le voci non è ancora arrivata: lo scheletro. */
  notificationsLoading: boolean;
  /** Una delle letture da cui vengono le voci è persa: la card con «Riprova». */
  notificationsLost: boolean;
  /** Rilegge tutte le letture da cui vengono le voci. */
  retryNotifications: () => void;
  /** Una di quelle letture sta rileggendo. */
  notificationsRetrying: boolean;
  /** Le voci non lette, di tutte e due le fonti: il badge della campanella. */
  unread: number;
  /** Segna letta una voce sola: la riga con mark_notification_read, il promemoria nello storage. */
  markRead: (item: ClientNotificationItem) => void;
  /** Segna lette tutte le voci: i promemoria di adesso e, se ce n'è, le righe non lette. */
  markAllRead: () => void;
}

const NO_BOOKINGS: BookingRow[] = [];
const NO_EVENT_TYPES: EventTypeRow[] = [];
const NO_BIA: BiaMeasurement[] = [];
const NO_ROWS: NotificationRow[] = [];

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
    // storage pieno o negato: la voce resta non letta, nessun crash
  }
  for (const listener of readListeners) listener();
}

/** Legge e calcola i dati della cornice: lo chiama solo il layout del cliente. */
export function useClientShellState(): ClientShellState {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const now = useNow();
  const qc = useQueryClient();

  const profileQ = useQuery({
    queryKey: ["client-shell", "profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("coach_id, path_start_date")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const bookingsQ = useClientBookings(userId ?? undefined);
  const eventTypesQ = useCoachEventTypes(profileQ.data?.coach_id ?? null);
  const feedbackQ = useClientFeedback(userId);
  const biaQ = useBiaMeasurements(userId);
  const { coach } = useMyCoach();
  const bookState = useClientBookState(now, coach);
  const rowsQ = useNotifications(userId);
  const markRowRead = useMarkNotificationRead();
  const markRowsRead = useMarkAllNotificationsRead();

  const bookings = bookingsQ.data ?? NO_BOOKINGS;
  const eventTypes = eventTypesQ.data ?? NO_EVENT_TYPES;
  const bia = biaQ.data ?? NO_BIA;
  const rows = rowsQ.data ?? NO_ROWS;
  // null finché non arrivano: niente voce della valutazione (client-notifications.ts).
  const feedback = feedbackQ.data ?? null;
  const pathStartDate = profileQ.data?.path_start_date ?? null;
  const { client, state } = bookState;

  const reminders = useMemo(
    () =>
      userId
        ? clientReminders(
            {
              clientId: userId,
              bookings,
              eventTypes,
              feedback,
              book: client && state ? { client, state } : null,
              pathStartDate,
              bia,
              coach,
            },
            now,
          )
        : [],
    [userId, bookings, eventTypes, feedback, client, state, pathStartDate, bia, coach, now],
  );
  const badge = useMemo(() => sessionsBadge(bookings, now), [bookings, now]);

  const raw = useSyncExternalStore(
    subscribeRead,
    () => readRaw(userId),
    () => null,
  );
  const readIds = useMemo(() => parseReadIds(raw), [raw]);
  // Le righe nuove (dal realtime, o da una rilettura) dicono che il coach ha
  // cambiato sessioni o crediti del cliente, ma le sessioni non hanno un
  // canale realtime: senza rileggerle, una sessione appena inserita non sta in
  // cache (la sua riga porterebbe alla Home invece che al dettaglio), e la
  // conferma di una sessione appena spostata, il badge di Sessioni e i crediti
  // resterebbero quelli di prima. Alla prima lettura delle righe no: le
  // letture partono insieme.
  const coachId = profileQ.data?.coach_id ?? null;
  const seenRowIds = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    if (!userId || !rowsQ.data) return;
    const ids = new Set(rowsQ.data.map((r) => r.id));
    const seen = seenRowIds.current;
    seenRowIds.current = ids;
    if (seen && [...ids].some((id) => !seen.has(id))) {
      invalidateBookingScope(qc, { coachId, clientId: userId });
    }
  }, [rowsQ.data, userId, coachId, qc]);
  // Gli id delle sessioni della cornice, per le righe di una sessione che non
  // è più del cliente; null finché non arrivano, e mentre si rileggono: una
  // riga appena arrivata può parlare di una sessione che la lettura di prima
  // non aveva, e allora resta il dettaglio.
  const bookingsFetching = bookingsQ.isFetching;
  const bookingIds = useMemo(
    () => (bookingsQ.data && !bookingsFetching ? new Set(bookingsQ.data.map((b) => b.id)) : null),
    [bookingsQ.data, bookingsFetching],
  );
  const notifications = useMemo(
    () => clientNotificationList({ reminders, rows, readIds, coach, bookingIds }, now),
    [reminders, rows, readIds, coach, bookingIds, now],
  );
  const unread = unreadCount(notifications);

  // La chiave di useNotifications, per segnare la cache prima della risposta.
  const rowsKey = useMemo(() => ["notifications", userId ?? ""] as const, [userId]);
  const markRowsInCache = useCallback(
    (only: string | null) => {
      const at = new Date().toISOString();
      qc.setQueryData<NotificationRow[]>(rowsKey, (prev) =>
        prev?.map((r) =>
          r.read_at == null && (only === null || r.id === only) ? { ...r, read_at: at } : r,
        ),
      );
    },
    [qc, rowsKey],
  );
  // Se la RPC fallisce, la cache segnata prima della risposta si rilegge.
  const rereadRows = useCallback(() => {
    void qc.invalidateQueries({ queryKey: rowsKey });
  }, [qc, rowsKey]);

  const markRead = useCallback(
    (item: ClientNotificationItem) => {
      if (!userId || !item.unread) return;
      if (item.rowId) {
        markRowsInCache(item.rowId);
        markRowRead.mutate(item.rowId, { onError: rereadRows });
      } else {
        writeRead(userId, nextReadIds(readIds, reminders, item.id));
      }
    },
    [userId, readIds, reminders, markRowsInCache, markRowRead, rereadRows],
  );

  const markAllRead = useCallback(() => {
    if (!userId) return;
    writeRead(userId, nextReadIds(readIds, reminders, "all"));
    if (notifications.some((n) => n.rowId !== null && n.unread)) {
      markRowsInCache(null);
      markRowsRead.mutate(undefined, { onError: rereadRows });
    }
  }, [userId, readIds, reminders, notifications, markRowsInCache, markRowsRead, rereadRows]);

  const bookingsLoading = bookingsQ.isLoading;

  // Il cancello delle voci: tutte le letture da cui vengono, compreso il
  // profilo di qui (path_start_date decide fra «Nuovo percorso» e «È iniziato
  // un nuovo blocco», che hanno id diversi).
  const notificationsLoading =
    !!userId &&
    (!arrivedRead(rowsQ) ||
      !arrivedRead(bookingsQ) ||
      !arrivedRead(feedbackQ) ||
      !arrivedRead(biaQ) ||
      !arrivedRead(profileQ) ||
      bookState.loading);
  const notificationsLost =
    lostRead(rowsQ) ||
    lostRead(bookingsQ) ||
    lostRead(feedbackQ) ||
    lostRead(biaQ) ||
    lostRead(profileQ) ||
    bookState.failed;
  const notificationsRetrying =
    rowsQ.isFetching ||
    bookingsQ.isFetching ||
    feedbackQ.isFetching ||
    biaQ.isFetching ||
    profileQ.isFetching ||
    bookState.retrying;
  const refetchRows = rowsQ.refetch;
  const refetchBookings = bookingsQ.refetch;
  const refetchFeedback = feedbackQ.refetch;
  const refetchBia = biaQ.refetch;
  const refetchProfile = profileQ.refetch;
  const retryBookState = bookState.retry;
  const retryNotifications = useCallback(() => {
    void refetchRows();
    void refetchBookings();
    void refetchFeedback();
    void refetchBia();
    void refetchProfile();
    retryBookState();
  }, [refetchRows, refetchBookings, refetchFeedback, refetchBia, refetchProfile, retryBookState]);

  return useMemo(
    () => ({
      userId,
      now,
      bookings,
      bookingsLoading,
      eventTypes,
      sessionsBadge: badge,
      notifications,
      notificationsLoading,
      notificationsLost,
      retryNotifications,
      notificationsRetrying,
      unread,
      markRead,
      markAllRead,
    }),
    [
      userId,
      now,
      bookings,
      bookingsLoading,
      eventTypes,
      badge,
      notifications,
      notificationsLoading,
      notificationsLost,
      retryNotifications,
      notificationsRetrying,
      unread,
      markRead,
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
