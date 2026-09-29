// ----------------------------------------------------------------------------
// use-book-confirm — la prenotazione del cliente (lato cliente, passata 02)
// ----------------------------------------------------------------------------
// Estratto da client.book.tsx il 24/05/2026, riscritto nella passata 02.
// confirm() inserisce la sessione e restituisce l'esito: riepilogo, esito ed
// errori li mostra il foglio di Prenota, e la pagina resta dov'è.
//   1. Prima di scrivere: cliente, coach, tipologia, orario, la finestra del
//      giorno scelto e le 24 ore di preavviso, con l'ora del momento: il foglio
//      può essere rimasto aperto, e all'inserimento il server il preavviso non
//      lo guarda (enforce_client_booking_rules guarda solo la tipologia).
//   2. L'inserimento paga col credito del giorno scelto: block_id è il blocco
//      della finestra (window.blockId) se la pagano i crediti di un blocco,
//      nullo se la paga un extra. Ogni credito vale nel suo blocco, e le date
//      del blocco dopo si prenotano coi suoi (decisioni di Nicolò del
//      28/09/2026). Sovrapposizione e crediti li controlla il server (23P01,
//      P0001). Oggi validate_booking_block_allocation sceglie comunque fra
//      tutti i blocchi del cliente, anche finiti, e riscrive block_id
//      (20260827143053_4c03121c-…sql:35-61): lo corregge il server il
//      02/10/2026, e l'app non lo compensa.
//   3. Chi prenota entro 48 ore risulta già confermato (O3), e il riepilogo lo
//      promette; il server non lo fa ancora (la migrazione O3 è del
//      02/10/2026). Quindi, dopo l'inserimento, confirm_booking_attendance, e
//      se ne aspetta la risposta; un errore va solo in console e la sessione
//      resta «Da confermare». Con la migrazione O3 diventa una chiamata che non
//      fa niente, e si toglie. Il server rifiuta ogni modifica del cliente a una
//      sessione che inizia prima di now() + 24 ore (20260607191854_…sql:15):
//      un orario preso a pochi secondi dalla soglia fa fallire la conferma, e
//      vale il ripiego.
//   4. Gli effetti di contorno, senza aspettarli: l'evento di Google Calendar
//      (gcalCreateEvent, lato server; l'invito arriva all'email del cliente),
//      l'avviso al coach (booking-notifications), la push al cliente.
//   5. Dopo, riuscita o no, invalidateBookingScope: dopo un 23P01 l'orario
//      deve sparire, dopo un P0001 i crediti devono essere quelli del server.
// Il doppio tocco lo ferma confirmingRef: il secondo tocco riceve la stessa
// promessa del primo, e la scrittura resta una.
// ----------------------------------------------------------------------------

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CreditWindow } from "@/lib/booking-rules";
import { NOTICE_GONE, bookingErrorMessage, confirmsOnBooking, noticeOk } from "@/lib/client-book";
import { gcalCreateEvent } from "@/lib/gcal.functions";
import type { SessionType } from "@/lib/mock-data";
import { sendPush } from "@/lib/push";
import { invalidateBookingScope } from "@/lib/query-keys";

/** La tipologia scelta, coi campi che servono all'inserimento e agli effetti di contorno. */
export interface BookConfirmType {
  eventTypeId: string | null;
  sessionType: SessionType;
  name: string;
  durationMin: number;
  location: "physical" | "online" | null;
  color: string | null;
  description: string | null;
}

export interface UseBookConfirmInput {
  meId: string | undefined;
  coachId: string | null | undefined;
  /** Nome e telefono del cliente, per l'avviso al coach. */
  meName: string;
  mePhone: string | null;
  type: BookConfirmType | null;
  /** L'orario scelto, ISO. */
  iso: string | null;
  /** La finestra dei crediti del giorno scelto (ClientSlotDay.window). */
  window: CreditWindow | null;
}

export type BookConfirmResult =
  | { ok: true; bookingId: string }
  | { ok: false; error: string; code: string | null };

export interface UseBookConfirmReturn {
  /** Inserisce e restituisce l'esito; con un tocco in volo restituisce quello. */
  confirm: () => Promise<BookConfirmResult>;
  /** Vero mentre confirm() è in volo: il pulsante resta disattivato. */
  confirming: boolean;
}

/**
 * Gli effetti di contorno di una prenotazione riuscita, senza aspettarli e
 * senza che un loro errore arrivi al foglio: l'evento sul calendario della
 * piattaforma (lato server: se online chiede la stanza di Meet, sendUpdates=all
 * manda l'invito al cliente; colore e descrizione della tipologia, GCAL-FIX
 * dell'08/06/2026), l'avviso al coach, la push al cliente.
 */
function announce(b: {
  bookingId: string;
  meId: string;
  coachId: string;
  meName: string;
  mePhone: string | null;
  type: BookConfirmType;
  iso: string;
  endISO: string;
}) {
  const isOnline = b.type.location === "online";
  void (async () => {
    try {
      const { toGoogleColorId } = await import("@/lib/gcal-colors");
      await gcalCreateEvent({
        data: {
          bookingId: b.bookingId,
          summary: `${b.type.name} — ${b.meName}`,
          description: b.type.description ?? undefined,
          startISO: b.iso,
          endISO: b.endISO,
          requestMeet: isOnline,
          isOnline,
          colorId: toGoogleColorId(b.type.color),
        },
      });
    } catch (e) {
      console.error("gcalCreateEvent failed", e);
    }
  })();
  try {
    void supabase.functions
      .invoke("booking-notifications", {
        body: {
          coach_id: b.coachId,
          client_name: b.meName,
          client_phone: b.mePhone,
          scheduled_at: b.iso,
          session_label: b.type.name,
          meeting_link: null,
        },
      })
      .catch((e) => console.error("booking-notifications failed", e));
    sendPush({
      profileId: b.meId,
      title: "Prenotazione confermata",
      body: `${b.type.name} — ${new Date(b.iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}`,
      url: "/client",
    });
  } catch (e) {
    console.error("booking-notifications / send-push failed", e);
  }
}

export function useBookConfirm(input: UseBookConfirmInput): UseBookConfirmReturn {
  const qc = useQueryClient();
  const confirmingRef = useRef<Promise<BookConfirmResult> | null>(null);
  const [confirming, setConfirming] = useState(false);

  const book = async (): Promise<BookConfirmResult> => {
    const { meId, coachId, meName, mePhone, type, iso, window } = input;
    if (!meId || !coachId || !type || !iso || !window) {
      return { ok: false, error: bookingErrorMessage(null, type?.name ?? ""), code: null };
    }
    if (!noticeOk(iso, new Date())) return { ok: false, error: NOTICE_GONE, code: null };

    const endISO = new Date(new Date(iso).getTime() + type.durationMin * 60_000).toISOString();
    const refresh = () => invalidateBookingScope(qc, { coachId, clientId: meId });
    let bookingId: string | null;
    try {
      const { data, error } = await supabase
        .from("bookings")
        .insert({
          client_id: meId,
          coach_id: coachId,
          block_id: window.source === "block" ? window.blockId : null,
          session_type: type.sessionType,
          event_type_id: type.eventTypeId,
          scheduled_at: iso,
          // Richiesto dallo schema; il trigger a_trg_set_booking_duration_defaults
          // lo ricalcola da durata e margine.
          end_at: endISO,
          status: "scheduled",
          // Le sessioni online: il link di Meet lo scrive sync-calendar.
          meeting_link: null,
        })
        .select("id")
        .single();
      bookingId = (data as { id: string } | null)?.id ?? null;
      if (error || !bookingId) {
        refresh();
        return {
          ok: false,
          error: bookingErrorMessage(error, type.name),
          code: error?.code ?? null,
        };
      }
    } catch (e) {
      refresh();
      return {
        ok: false,
        error: bookingErrorMessage(e instanceof Error ? e : null, type.name),
        code: null,
      };
    }

    // Da qui la sessione c'è: niente di quello che segue la trasforma in un
    // errore (un errore rimanderebbe a riprovare, e la prenotazione raddoppierebbe).
    announce({ bookingId, meId, coachId, meName, mePhone, type, iso, endISO });
    if (confirmsOnBooking(iso, new Date())) {
      try {
        const res = await supabase.rpc("confirm_booking_attendance", { p_booking_id: bookingId });
        if (res.error || res.data === false) {
          console.error("confirm_booking_attendance failed", res.error ?? "non aggiornata");
        }
      } catch (e) {
        console.error("confirm_booking_attendance failed", e);
      }
    }
    refresh();
    return { ok: true, bookingId };
  };

  const confirm = () => {
    if (confirmingRef.current) return confirmingRef.current;
    setConfirming(true);
    const pending = book().finally(() => {
      confirmingRef.current = null;
      setConfirming(false);
    });
    confirmingRef.current = pending;
    return pending;
  };

  return { confirm, confirming };
}
