// ----------------------------------------------------------------------------
// ClientMoveSheet — il foglio Sposta (lato cliente, passata 04, audit B2)
// ----------------------------------------------------------------------------
// Lo apre il dettaglio della sessione, e la 05 lo apre dalla card della Home:
// riceve la sessione e legge da sé il resto (l'ora della cornice, i blocchi
// del cliente e, per una sessione senza blocco, i suoi extra, dalla passata
// 09; gli orari del coach di useCoachSlotInputs), solo mentre è aperto. Offre
// gli stessi giorni e orari di Prenota per la stessa sessione:
// getClientSlotDays con la finestra del blocco della sessione (getMoveWindow)
// ed `exclude`, che libera il suo orario; da quei giorni moveDays toglie
// l'orario in cui la sessione è adesso. La fila dei giorni e i gruppi di
// orari sono quelli di Prenota (ClientDayStrip col margine di 20,
// ClientSlotGroups). Sotto le 24 ore dice che non si sposta più, anche se ci
// arriva a foglio aperto; senza una finestra (getMoveWindow null: il blocco
// non c'è o è finito, o nessun extra da liberare, passata 09) dice che non si
// sposta dall'app (moveNoCreditText), invece di una fila tutta chiusa. Con
// gli orari, i blocchi o gli extra non letti c'è la card «Orari non
// aggiornati», mai «Nessun orario libero» per una lettura fallita.
// Lo spostamento è useRescheduleBooking (evento Google e avviso al coach), con
// mutateAsync: la sua promessa arriva anche se il foglio si è chiuso nel
// frattempo (Esc, lo scrim, trascinando), e con lei onMoved. Un errore resta
// nel foglio, detto da actionErrorText (a foglio chiuso, un toast), e dopo
// un errore si rileggono gli occupati, come in Prenota.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BookRetryCard } from "@/components/book-blocked-card";
import { ClientButton } from "@/components/client-button";
import { ClientDayStrip } from "@/components/client-day-strip";
import { ClientSheet } from "@/components/client-sheet";
import { ClientSlotGroups } from "@/components/client-slot-groups";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientShell } from "@/hooks/use-client-shell";
import { useCoachSlotInputs } from "@/hooks/use-coach-slot-inputs";
import type { BookCoach } from "@/lib/client-book";
import { getMoveWindow } from "@/lib/client-credits";
import {
  actionErrorText,
  moveBlockedText,
  moveButton,
  moveCurrent,
  moveDay,
  moveDays,
  moveNoCreditText,
  moveNoSlotsText,
  moveRule,
  sessionMinutes,
  type DetailBooking,
} from "@/lib/client-session-detail";
import { canMove } from "@/lib/client-session-status";
import { getClientSlotDays } from "@/lib/client-slots";
import {
  useClientBlocks,
  useClientExtraCredits,
  useRescheduleBooking,
  type BookingRow,
} from "@/lib/queries";
import { invalidateBookingScope } from "@/lib/query-keys";
import { failedRead } from "@/lib/query-state";
import { formatLongDay } from "@/lib/session-time";

/** La sessione che si sposta: i campi del dettaglio, col coach e il cliente. */
export type MoveBooking = DetailBooking & Pick<BookingRow, "coach_id" | "client_id">;

export interface ClientMoveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: MoveBooking;
  /** sessionName: sotto il titolo e nell'avviso al coach. */
  name: string;
  coach: BookCoach;
  /** Il nome del cliente (profiles.full_name), per l'avviso al coach; null senza. */
  clientName: string | null;
  /** Spostata: l'inizio di prima e quello nuovo, ISO. */
  onMoved: (fromIso: string, toIso: string) => void;
  /**
   * Dove va il focus alla chiusura se il pulsante che ha aperto il foglio non
   * c'è più (nella Home la prossima sessione cambia dopo lo spostamento).
   */
  returnFocus?: () => HTMLElement | null | undefined;
}

export function ClientMoveSheet({
  open,
  onOpenChange,
  booking,
  name,
  coach,
  clientName,
  onMoved,
  returnFocus,
}: ClientMoveSheetProps) {
  return (
    <ClientSheet
      open={open}
      onOpenChange={onOpenChange}
      returnFocus={returnFocus}
      title="Sposta la sessione"
      description={
        <span className="block text-sm leading-[1.45]">{moveCurrent(booking, name)}</span>
      }
      list
      className="shadow-[0_-12px_40px_rgba(0,0,0,0.12)]"
    >
      <MoveBody
        booking={booking}
        name={name}
        coach={coach}
        clientName={clientName}
        onMoved={onMoved}
        onClose={() => onOpenChange(false)}
      />
    </ClientSheet>
  );
}

interface MoveBodyProps extends Omit<
  ClientMoveSheetProps,
  "open" | "onOpenChange" | "returnFocus"
> {
  onClose: () => void;
}

/**
 * Il contenuto del foglio. Sta dentro il pannello, che si monta solo a
 * foglio aperto: le letture partono all'apertura, e scelte ed errore
 * ripartono da capo a ogni apertura.
 */
function MoveBody({ booking, name, coach, clientName, onMoved, onClose }: MoveBodyProps) {
  const { now } = useClientShell();
  const qc = useQueryClient();
  const blocksQ = useClientBlocks(booking.client_id ?? undefined);
  // Gli extra servono solo a una sessione senza blocco (getMoveWindow, passata
  // 09): per le altre la lettura resta spenta.
  const needsExtras = booking.block_id === null && !!booking.client_id;
  const extrasQ = useClientExtraCredits(needsExtras ? (booking.client_id ?? undefined) : undefined);
  const {
    availabilityQ,
    exceptionsQ,
    optimizationQ,
    busyQ,
    busy,
    slotsReady,
    retrySlots,
    retryingSlots,
  } = useCoachSlotInputs(booking.coach_id, now);
  const reschedule = useRescheduleBooking();
  const [dayIso, setDayIso] = useState<string | null>(null);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const movable = canMove(booking, now);
  const blocks = blocksQ.data;
  // Senza blocchi letti la finestra sarebbe null e i giorni vuoti: si aspetta.
  // Lo stesso per gli extra di una sessione senza blocco.
  const blocksArrived = blocks !== undefined || !booking.client_id;
  const extras = extrasQ.data;
  const extrasArrived = !needsExtras || extras !== undefined;
  // In errore, oppure senza dati e riletta dopo un errore (failedRead): finché
  // risponde resta la card, con «Riprova» occupato, come in Sessioni.
  const failed =
    [availabilityQ, exceptionsQ, busyQ, blocksQ].some(failedRead) ||
    (needsExtras && failedRead(extrasQ));
  const ready = slotsReady && blocksArrived && extrasArrived;
  const moveWindow = useMemo(
    () => getMoveWindow(booking, blocks ?? [], now, needsExtras ? (extras ?? []) : undefined),
    [booking, blocks, now, needsExtras, extras],
  );
  const days = useMemo(() => {
    if (!movable || failed || !ready) return null;
    const slotDays = getClientSlotDays({
      now,
      durationMin: sessionMinutes(booking),
      bufferMin: booking.buffer_min,
      availability: availabilityQ.data ?? [],
      exceptions: exceptionsQ.data ?? [],
      busy,
      windows: moveWindow ? [moveWindow] : [],
      exclude: new Date(booking.scheduled_at),
      optimization: optimizationQ.data ?? true,
    });
    return moveDays(slotDays.days, booking);
  }, [
    movable,
    failed,
    ready,
    now,
    booking,
    availabilityQ.data,
    exceptionsQ.data,
    busy,
    moveWindow,
    optimizationQ.data,
  ]);

  // Il giorno è quello scelto finché ha orari, altrimenti il primo con orari;
  // quello mostrato si ricorda, così un giorno prima che si libera non gli
  // passa davanti (come in Prenota).
  const day = days ? moveDay(days, dayIso) : null;
  const shownDay = day?.isoDate ?? null;
  useEffect(() => {
    if (shownDay !== null && shownDay !== dayIso) setDayIso(shownDay);
  }, [shownDay, dayIso]);
  const slot = day?.slots.find((s) => s.iso === slotIso) ?? null;

  const pickDay = (isoDate: string) => {
    if (isoDate === day?.isoDate) return;
    setDayIso(isoDate);
    setSlotIso(null);
    setError(null);
  };
  const pickSlot = (iso: string) => {
    setSlotIso(iso);
    setError(null);
  };
  const retry = () => {
    retrySlots();
    if (booking.client_id) void blocksQ.refetch();
    if (needsExtras) void extrasQ.refetch();
  };
  const onMove = () => {
    if (!slot) return;
    const from = booking.scheduled_at;
    const to = slot.iso;
    setError(null);
    reschedule
      .mutateAsync({
        bookingId: booking.id,
        newScheduledISO: to,
        oldScheduledISO: from,
        sessionLabel: name,
        clientName: clientName ?? undefined,
      })
      .then(() => onMoved(from, to))
      .catch((err) => {
        // Un orario preso da altri resterebbe fra quelli offerti: si rileggono.
        invalidateBookingScope(qc, { coachId: booking.coach_id, clientId: booking.client_id });
        const text = actionErrorText(err, "move");
        if (mounted.current) setError(text);
        else toast.warning(text);
      });
  };

  if (!movable) {
    return (
      <>
        <p className="text-[15px] leading-normal text-on-surface-variant">
          {moveBlockedText(coach)}
        </p>
        <ClientButton variant="text" fullWidth onClick={onClose}>
          Indietro
        </ClientButton>
      </>
    );
  }

  let content: ReactNode;
  if (failed) {
    content = (
      <BookRetryCard
        title="Orari non aggiornati"
        text="Non siamo riusciti a leggere gli orari liberi. Riprova tra poco."
        onRetry={retry}
        retrying={retryingSlots || blocksQ.isFetching || (needsExtras && extrasQ.isFetching)}
      />
    );
  } else if (!days) {
    content = <MoveSkeleton />;
  } else if (moveWindow === null) {
    // Nessuna finestra (passata 09): niente fila di giorni tutta chiusa, il
    // perché e il coach; resta «Indietro».
    content = (
      <p className="text-[15px] leading-normal text-on-surface-variant">
        {moveNoCreditText(coach)}
      </p>
    );
  } else {
    content = (
      <>
        <div className="flex flex-col gap-2.5">
          <h3 className="text-[15px] font-bold">Nuovo giorno</h3>
          <ClientDayStrip
            days={days}
            selectedIso={day?.isoDate ?? null}
            onSelect={pickDay}
            gutter={20}
          />
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-[15px] font-bold">{day ? formatLongDay(day.date) : "Orari"}</h3>
          {day ? (
            <ClientSlotGroups day={day} selectedIso={slot?.iso ?? null} onSelect={pickSlot} />
          ) : (
            <p className="text-sm leading-normal text-on-surface-variant">
              {moveNoSlotsText(coach)}
            </p>
          )}
        </div>
        <p className="flex gap-2 text-[13px] leading-normal text-on-surface-variant">
          <Info className="mt-px size-4 shrink-0 text-primary-container" aria-hidden />
          <span>{moveRule(moveWindow, coach, now)}</span>
        </p>
        {error && (
          <p role="alert" className="text-sm font-semibold text-danger-text">
            {error}
          </p>
        )}
        <ClientButton fullWidth disabled={!slot} busy={reschedule.isPending} onClick={onMove}>
          {moveButton(slot)}
        </ClientButton>
      </>
    );
  }

  return (
    <>
      {content}
      <ClientButton variant="text" fullWidth busy={reschedule.isPending} onClick={onClose}>
        Indietro
      </ClientButton>
    </>
  );
}

/** Mentre arrivano gli orari o i blocchi: la fila dei giorni e una griglia di orari. */
function MoveSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-[60px] shrink-0 rounded-[18px]" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}
