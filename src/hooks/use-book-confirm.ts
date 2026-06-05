// ----------------------------------------------------------------------------
// use-book-confirm — orchestrazione "Conferma prenotazione" client-side
// ----------------------------------------------------------------------------
// Estratto da client.book.tsx (commit 2026-05-24). Il flusso `confirm`
// vive isolato da BookFlow perché incapsula 5 responsabilità diverse:
//
//   1. Validazione input (meId, coachId, selectedISO, selectedPoolKey, pool match)
//   2. Risoluzione credito (block allocation prima, extra credit fallback)
//   3. INSERT booking (overlap + credit consumption enforced via DB triggers)
//   4. Side-effects fire-and-forget: syncCalendar, email, booking-notifications, sendPush
//   5. Toast successo + invalidazione query + navigate → /client
//
// Il hook gestisce internamente `confirmingRef` (sincrono, double-tap
// guard) + `confirming` boolean (per il render del bottone CTA) così il
// parent non deve esporre quello stato.
// ----------------------------------------------------------------------------

import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { gcalCreateEvent } from "@/lib/gcal.functions";
import { generateGoogleCalendarLink } from "@/lib/calendar";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { invalidateBookingScope } from "@/lib/query-keys";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import {
  findAllocationForWeek,
  findExtraCredit,
  type ExtraCreditRow,
} from "@/lib/booking-allocation";
import type { EventTypeRow, AllocationRow } from "@/lib/queries";

/** Subset structural del Pool richiesto da useBookConfirm. */
export interface PoolForConfirm {
  key: string;
  type: SessionType;
  eventTypeId: string | null;
  source: "block" | "extra";
}

/** Subset structural del block (training_blocks) richiesto da useBookConfirm. */
export interface BlockForConfirm {
  id: string;
  start_date: string;
  allocations: AllocationRow[];
}

export interface UseBookConfirmInput {
  meId: string | undefined;
  meName: string;
  meEmail: string;
  mePhone: string | null;
  coachId: string | null | undefined;
  coachName: string;
  emailNotificationsEnabled: boolean;
  selectedISO: string | null;
  selectedPoolKey: string | null;
  pools: readonly PoolForConfirm[];
  block: BlockForConfirm | null | undefined;
  customTypes: readonly EventTypeRow[];
  extraCredits: readonly ExtraCreditRow[] | null | undefined;
}

export interface UseBookConfirmReturn {
  /** Funzione async che orchestra l'INSERT + tutti i side-effect. Safe da chiamare più volte (double-tap guard interno). */
  confirm: () => Promise<void>;
  /** True mentre confirm() è in volo. Usalo per disabilitare il bottone CTA. */
  confirming: boolean;
}

export function useBookConfirm(input: UseBookConfirmInput): UseBookConfirmReturn {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirmingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);

  const {
    meId,
    meName,
    meEmail,
    mePhone,
    coachId,
    coachName,
    emailNotificationsEnabled,
    selectedISO,
    selectedPoolKey,
    pools,
    block,
    customTypes,
    extraCredits,
  } = input;

  const confirm = async () => {
    // L2: synchronous double-tap guard, runs before React schedules the
    // disabled-button re-render.
    if (confirmingRef.current) return;

    if (!meId) {
      toast.error("Sessione non valida", {
        description: "Effettua di nuovo l'accesso e riprova.",
      });
      return;
    }
    if (!coachId) {
      toast.error("Coach non assegnato. Contatta il tuo coach.");
      return;
    }
    if (!selectedISO || !selectedPoolKey) {
      toast.error("Seleziona data e orario.");
      return;
    }
    const pool = pools.find((p) => p.key === selectedPoolKey);
    if (!pool) {
      toast.error("Tipologia non disponibile.");
      return;
    }

    confirmingRef.current = true;
    setConfirming(true);
    try {
      // L1 (FULL_APP_AUDIT.md): the previous body wrapped this single-slot
      // flow in `for (const [iso, pick] of [[selectedISO, ...]])` as
      // scaffolding for a future multi-slot booking UI. That UI never
      // shipped, so the loop, the `localUsed` tracker and the singular/
      // plural toast machinery were all dead code masking the real shape
      // of the action. Unrolled to a straight-line single booking; the
      // multi-slot version, when needed, can be a fresh implementation
      // built around a real mutation rather than this hollow loop.
      const iso = selectedISO;
      const type: SessionType = pool.type;
      const eventType = pool.eventTypeId
        ? (customTypes.find((e) => e.id === pool.eventTypeId) ?? null)
        : null;
      const displayLabel = eventType?.name ?? sessionLabel(type);

      // Resolve credit source: 1) block allocation, 2) extra credit fallback.
      let allocId: string | null = null;
      let extraId: string | null = null;
      if (pool.source === "block") {
        const a = findAllocationForWeek(block, type, eventType?.id ?? null, iso);
        if (a) {
          allocId = a.id;
        } else {
          const ec = findExtraCredit(extraCredits, eventType?.id ?? null);
          if (ec) extraId = ec.id;
        }
      } else {
        const ec = findExtraCredit(extraCredits, eventType?.id ?? null);
        if (ec) extraId = ec.id;
      }

      if (!allocId && !extraId) {
        toast.error(`Credito esaurito per ${displayLabel}.`, {
          description: "Acquista un Booster per continuare a prenotare.",
          action: {
            label: "Vai allo Store",
            onClick: () => navigate({ to: "/client/store" }),
          },
        });
        return;
      }

      const isOnline = eventType?.location_type === "online";

      // INSERT booking. Overlap and credit consumption are enforced
      // server-side:
      //   - bookings_no_overlap_per_coach (exclusion constraint, SQLSTATE 23P01)
      //   - trg_booking_validate_block_allocation (P0001 on exhausted block)
      //   - trg_booking_validate_extra_credits   (P0001 on exhausted credit)
      // The previous client-side SELECT-then-INSERT conflict check was removed
      // because it has a wide race window between SELECT and INSERT.
      //
      // meeting_link starts NULL for online sessions: sync-calendar will
      // create a real Google Meet room and write the URL back. The fall-
      // back mock link generator is kept around for offline-mode demos
      // but the production path always waits for the real Meet URL.
      const { data: insertedBooking, error: bErr } = await supabase
        .from("bookings")
        .insert({
          client_id: meId,
          coach_id: coachId,
          block_id: allocId ? (block?.id ?? null) : null,
          session_type: type,
          event_type_id: eventType?.id ?? null,
          scheduled_at: iso,
          // end_at is required by the schema; the
          // a_trg_set_booking_duration_defaults trigger recomputes it
          // server-side from duration_min + buffer_min, so this client
          // value is just a placeholder to satisfy the NOT NULL constraint.
          end_at: new Date(
            new Date(iso).getTime() + (eventType?.duration ?? 60) * 60_000,
          ).toISOString(),
          status: "scheduled",
          meeting_link: null,
        })
        .select("id")
        .single();
      if (bErr) {
        if (bErr.code === "23P01") {
          toast.error("Slot già occupato", {
            description:
              "Un altro utente ha appena prenotato questo orario. Ricarica la pagina e scegli un altro slot.",
          });
        } else if (bErr.code === "P0001") {
          toast.error("Prenotazione non possibile", { description: bErr.message });
        } else {
          toast.error("Errore prenotazione", { description: bErr.message });
        }
        return;
      }
      const bookingId = (insertedBooking as { id: string } | null)?.id ?? null;

      // Credit deduction is handled atomically by the DB triggers above.
      const calendarUrl = generateGoogleCalendarLink(
        { scheduled_at: iso },
        eventType
          ? {
              name: eventType.name,
              duration: eventType.duration,
              location_type: eventType.location_type,
              location_address: eventType.location_address,
            }
          : { name: displayLabel },
        meName,
      );

      // notifications (fire and forget). gcalCreateEvent runs server-side:
      //   - crea l'evento sul calendario della piattaforma (Lovable Connector)
      //   - se online, chiede a Google una Meet room (conferenceData +
      //     conferenceDataVersion=1) e scrive l'URL su bookings.meeting_link
      //   - scrive google_event_id sulla riga booking così update/cancel
      //     futuri sanno quale evento Google riferire
      //   - sendUpdates=all → il cliente riceve email di invito
      // S-AUTHZ: gcalCreateEvent ora richiede un bookingId (l'attendee email è
      // derivata server-side dal cliente del booking). Se l'INSERT non ha reso
      // l'id, saltiamo la creazione evento invece di chiamarla a vuoto.
      if (bookingId) {
        void gcalCreateEvent({
          data: {
            bookingId,
            summary: `${displayLabel} — ${meName}`,
            startISO: iso,
            endISO: new Date(
              new Date(iso).getTime() + (eventType?.duration ?? 60) * 60_000,
            ).toISOString(),
            requestMeet: isOnline,
            isOnline,
            colorId: eventType?.color ?? undefined,
          },
        }).catch((e) => console.error("gcalCreateEvent failed", e));
      } else {
        console.error("gcalCreateEvent skipped: booking insert returned no id");
      }
      // Avviamo l'invio email + la notifica al coach in parallelo. L'esito
      // dell'email serve a personalizzare il toast in modo non contraddittorio:
      // se la consegna fallisce, NON diciamo "Email inviata".
      const emailPromise: Promise<{ ok: boolean }> = emailNotificationsEnabled
        ? sendBookingConfirmationEmail({
            to: meEmail,
            recipientName: meName,
            sessionLabel: displayLabel,
            scheduledAt: new Date(iso),
            coachName,
            clientName: meName,
          }).catch((e) => {
            console.error("email failed", e);
            return { ok: false };
          })
        : Promise.resolve({ ok: true });

      void supabase.functions
        .invoke("booking-notifications", {
          body: {
            coach_id: coachId,
            client_name: meName,
            client_phone: mePhone,
            scheduled_at: iso,
            session_label: displayLabel,
            meeting_link: null,
          },
        })
        .catch((e) => console.error("booking-notifications failed", e));

      sendPush({
        profileId: meId,
        title: "Prenotazione confermata",
        body: `${displayLabel} — ${new Date(iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" })}`,
        url: "/client",
      });

      const emailResult = await emailPromise;
      const emailOk = emailResult?.ok !== false;
      const usedExtra = !!extraId;
      const emailNote = emailNotificationsEnabled
        ? emailOk
          ? " Email di conferma inviata."
          : " Email di conferma non disponibile al momento."
        : "";
      const meetNote = " I link videochiamata sono generati automaticamente per le sessioni online.";
      toast.success("Sessione prenotata", {
        description: usedExtra
          ? `Scalata da credito omaggio/extra.${emailNote}`
          : `${emailNote.trim()}${emailNote ? " " : ""}${meetNote.trim()}`.trim(),
        action: calendarUrl
          ? {
              label: "Aggiungi al Calendario",
              onClick: () => window.open(calendarUrl, "_blank", "noopener,noreferrer"),
            }
          : undefined,
      });

      invalidateBookingScope(qc, { coachId, clientId: meId });
      navigate({ to: "/client" });
    } finally {
      confirmingRef.current = false;
      setConfirming(false);
    }
  };

  return { confirm, confirming };
}
