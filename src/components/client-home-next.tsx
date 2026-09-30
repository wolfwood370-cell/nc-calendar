// ----------------------------------------------------------------------------
// La prossima sessione della Home (lato cliente, passata 05, audit H2, H4, H5,
// H7, N1, V1, V11)
// ----------------------------------------------------------------------------
//   - HomeNextCard: la prossima sessione in cima, con al massimo un pulsante
//     pieno («Entra nella videochiamata» o «Conferma presenza», l'unico punto
//     della Home in cui compare: niente banner, H4); «Sposta» (il foglio della
//     04) e «Dettagli» da 24 ore in su, sotto le 24 ore «Dettagli» e la riga
//     col motivo (V1); quanto manca in parole, mai al secondo (H5); «Hai altre
//     N sessioni prenotate» verso Sessioni (N1);
//   - HomeNoNextCard: «Nessuna sessione in programma», col primo orario libero
//     fra le tipologie che si prenotano. Gli orari del coach si leggono solo
//     qui, cioè senza prossima sessione, e solo con qualcosa da prenotare;
//   - HomeConcludedCard: il percorso concluso, col WhatsApp del coach solo se
//     c'è il link (H7: niente Store, niente Prenota).
// Testi, stati, date e azioni vengono da client-home.ts. Il focus non si
// perde: dopo «Conferma presenza» e dopo lo spostamento va sul titolo della
// card, che resta anche quando la prossima sessione cambia.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import {
  Award,
  ChevronRight,
  CircleCheck,
  MapPin,
  MessageCircle,
  Repeat,
  Video,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ClientButton } from "@/components/client-button";
import { ClientMoveSheet } from "@/components/client-move-sheet";
import { AuraLineSkeleton } from "@/components/ui/aura-skeleton";
import { useClientShell } from "@/hooks/use-client-shell";
import { useCoachSlotInputs } from "@/hooks/use-coach-slot-inputs";
import { useConfirmAttendance } from "@/hooks/use-confirm-attendance";
import { useMoveUndo } from "@/hooks/use-move-undo";
import type { BookCoach, BookOption } from "@/lib/client-book";
import {
  concludedText,
  concludedWhatsApp,
  firstFreeSlot,
  homeNextCard,
  noNextCard,
  othersLabel,
} from "@/lib/client-home";
import { sessionName } from "@/lib/client-sessions";
import { getClientSlotDays } from "@/lib/client-slots";
import type { BookingRow, EventTypeRow } from "@/lib/queries";
import { iconForType } from "@/lib/session-type-icon";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-outline-variant/35 bg-white shadow-soft-card";

// I titoli delle card sono in Manrope (README, V3): la regola globale dà Sora
// e la spaziatura stretta a ogni h2.
const LABEL = "font-sans text-sm font-bold tracking-normal text-on-surface-variant";
const TITLE = "font-sans text-[17px] font-bold tracking-normal";

// ----------------------------------------------------------------------------
// La prossima sessione
// ----------------------------------------------------------------------------

export interface HomeNextCardProps {
  /** homeNext: la prossima sessione. */
  booking: BookingRow;
  /** Le tipologie del coach, per il nome, il colore e il luogo. */
  eventTypes: readonly EventTypeRow[];
  /** homeNext: quante altre sessioni in programma. */
  others: number;
  coach: BookCoach;
  /** profiles.full_name, per l'avviso al coach dello spostamento; null senza. */
  clientName: string | null;
}

export function HomeNextCard({
  booking,
  eventTypes,
  others,
  coach,
  clientName,
}: HomeNextCardProps) {
  const { now } = useClientShell();
  const confirmAttendance = useConfirmAttendance();
  const moveUndo = useMoveUndo(coach);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  // La sessione del foglio: resta quella aperta anche se nel frattempo la
  // prossima sessione cambia, così «Ripristina» riporta quella spostata.
  const [moving, setMoving] = useState<BookingRow | null>(null);

  const typeOf = (b: BookingRow) => eventTypes.find((t) => t.id === b.event_type_id) ?? null;
  const card = homeNextCard(booking, typeOf(booking), coach, now);
  const more = othersLabel(others);
  const TypeIcon = iconForType(card.tile.name);
  const PlaceIcon = card.place?.online ? Video : MapPin;
  const moved = moving ?? booking;
  const movedName = sessionName(moved, typeOf(moved));

  const focusTitle = () => titleRef.current?.focus({ preventScroll: true });

  // Occupato e non disattivato mentre conferma: il pulsante tiene il focus,
  // che a conferma riuscita va sul titolo («Conferma presenza» sparisce).
  const onConfirmPresence = () => {
    if (confirmAttendance.isPending) return;
    confirmAttendance.mutate(
      { bookingId: booking.id, clientId: booking.client_id },
      { onSuccess: focusTitle },
    );
  };

  const openMove = () => {
    setMoving(booking);
    setMoveOpen(true);
  };
  const onMoved = (fromIso: string, toIso: string) => {
    setMoveOpen(false);
    moveUndo({ bookingId: moved.id, name: movedName, clientName, fromIso, toIso });
  };

  const details = (
    <ClientButton asChild variant="secondary" fullWidth>
      <Link to="/client/bookings/$bookingId" params={{ bookingId: booking.id }}>
        Dettagli
      </Link>
    </ClientButton>
  );

  return (
    <section aria-label="Prossima sessione" className={cn(CARD, "flex flex-col gap-3.5 p-[18px]")}>
      <div className="flex items-center justify-between gap-2">
        <h2 ref={titleRef} tabIndex={-1} className={LABEL}>
          Prossima sessione
        </h2>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
            card.status.tone.bg,
            card.status.tone.fg,
          )}
        >
          {card.status.label}
        </span>
      </div>

      {/* Il blocco apre il dettaglio col tocco; da tastiera c'è «Dettagli». */}
      <Link
        to="/client/bookings/$bookingId"
        params={{ bookingId: booking.id }}
        tabIndex={-1}
        className="flex items-start gap-3.5"
      >
        <span
          aria-hidden
          className="grid size-[52px] shrink-0 place-items-center rounded-[16px]"
          style={{ background: card.tile.bg, color: card.tile.fg }}
        >
          <TypeIcon className="size-[26px]" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">
            {card.day}
          </span>
          <span className="text-base font-bold tabular-nums">
            {card.time}
            {card.until && (
              <span className="font-medium text-on-surface-variant"> · {card.until}</span>
            )}
          </span>
          <span className="text-sm text-on-surface-variant">{card.type}</span>
          {card.place && (
            <span className="flex items-start gap-1.5 text-sm leading-[1.4] text-on-surface-variant">
              <PlaceIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {card.place.text}
            </span>
          )}
        </span>
      </Link>

      {card.join && booking.meeting_link && (
        <ClientButton asChild fullWidth>
          <a href={booking.meeting_link} target="_blank" rel="noopener noreferrer">
            <Video className="size-[18px]" aria-hidden />
            Entra nella videochiamata
          </a>
        </ClientButton>
      )}
      {card.confirm && (
        <ClientButton
          fullWidth
          icon={CircleCheck}
          aria-disabled={confirmAttendance.isPending || undefined}
          onClick={onConfirmPresence}
          className="aria-disabled:cursor-not-allowed aria-disabled:bg-surface-variant aria-disabled:text-on-surface-variant"
        >
          Conferma presenza
        </ClientButton>
      )}
      {card.move ? (
        <div className="grid grid-cols-2 gap-2">
          {/* Una chiave per sessione e orario: spostata la sessione, «Sposta» è un
              altro pulsante, e il foglio rende il focus al titolo (returnFocus)
              invece che al «Sposta» di prima, magari di un'altra sessione. */}
          <ClientButton
            key={`${booking.id}:${booking.scheduled_at}`}
            variant="secondary"
            fullWidth
            icon={Repeat}
            onClick={openMove}
          >
            Sposta
          </ClientButton>
          {details}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {details}
          {card.note && (
            <p className="text-[13px] leading-[1.45] text-on-surface-variant">
              {card.note.text}
              {card.note.link && (
                <>
                  {" "}
                  <a
                    href={card.note.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-primary-container"
                  >
                    {card.note.link.label}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      )}

      {more && (
        <Link
          to="/client/sessions"
          className="flex min-h-11 items-center justify-between gap-2 border-t border-surface-container-low pt-3 text-sm"
        >
          <span className="font-medium text-on-surface-variant">{more}</span>
          <span className="flex shrink-0 items-center gap-0.5 font-semibold text-aura-primary">
            Vedi tutte
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      )}

      <ClientMoveSheet
        open={moveOpen}
        onOpenChange={(open) => {
          if (!open) setMoveOpen(false);
        }}
        booking={moved}
        name={movedName}
        coach={coach}
        clientName={clientName}
        onMoved={onMoved}
        returnFocus={() => titleRef.current}
      />
    </section>
  );
}

// ----------------------------------------------------------------------------
// Nessuna sessione in programma
// ----------------------------------------------------------------------------

export interface HomeNoNextCardProps {
  /** Le opzioni di Prenota (getBookState). */
  options: readonly BookOption[];
  coachId: string | null;
  coach: BookCoach;
}

export function HomeNoNextCard({ options, coachId, coach }: HomeNoNextCardProps) {
  const { now } = useClientShell();
  const bookable = useMemo(() => options.filter((o) => o.state === "prenotabile"), [options]);
  // Senza niente da prenotare gli orari non servono: coachId nullo, nessuna lettura.
  const { availabilityQ, exceptionsQ, optimizationQ, busy, slotsReady, slotsFailed } =
    useCoachSlotInputs(bookable.length > 0 ? coachId : null, now);

  // I giorni di ogni tipologia prenotabile, come in Prenota, e il primo orario.
  const first = useMemo(() => {
    if (!slotsReady || slotsFailed) return null;
    return firstFreeSlot(
      bookable.map((option) => ({
        option,
        days: getClientSlotDays({
          now,
          durationMin: option.durationMin,
          bufferMin: option.bufferMin,
          availability: availabilityQ.data ?? [],
          exceptions: exceptionsQ.data ?? [],
          busy,
          windows: option.windows,
          optimization: optimizationQ.data ?? true,
        }).days,
      })),
    );
  }, [
    slotsReady,
    slotsFailed,
    bookable,
    now,
    availabilityQ.data,
    exceptionsQ.data,
    busy,
    optimizationQ.data,
  ]);
  const card = noNextCard(options, first, slotsFailed, coach);
  // Gli orari arrivano ancora: al posto del testo una riga di scheletro, mai
  // «Nessun orario libero» per una lettura che non c'è.
  const waiting = bookable.length > 0 && !slotsReady && !slotsFailed;

  return (
    <section className={cn(CARD, "flex flex-col gap-3 p-[18px]")}>
      <h2 tabIndex={-1} className={LABEL}>
        Prossima sessione
      </h2>
      <p className="text-[17px] font-bold">Nessuna sessione in programma</p>
      {waiting ? (
        <AuraLineSkeleton className="w-4/5" aria-busy="true" />
      ) : (
        <p className="text-[15px] leading-normal text-on-surface-variant">{card.text}</p>
      )}
      {!waiting && card.book && (
        <ClientButton asChild fullWidth>
          <Link to="/client/book" search={card.eventTypeId ? { eventType: card.eventTypeId } : {}}>
            Prenota una sessione
          </Link>
        </ClientButton>
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Il percorso concluso
// ----------------------------------------------------------------------------

export interface HomeConcludedCardProps {
  /** end_date del blocco di riferimento (getBookState.reference). */
  endDate: string;
  coach: BookCoach;
}

export function HomeConcludedCard({ endDate, coach }: HomeConcludedCardProps) {
  const whatsapp = concludedWhatsApp(coach);
  return (
    <section className={cn(CARD, "flex flex-col gap-3.5 p-5")}>
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-[14px] bg-primary-container/10 text-primary-container"
      >
        <Award className="size-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 tabIndex={-1} className={TITLE}>
          Il tuo percorso è concluso
        </h2>
        <p className="text-[15px] leading-normal text-on-surface-variant">
          {concludedText(endDate, coach)}
        </p>
      </div>
      {whatsapp && (
        <ClientButton asChild fullWidth>
          <a href={whatsapp.href} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-[18px]" aria-hidden />
            {whatsapp.label}
          </a>
        </ClientButton>
      )}
    </section>
  );
}
