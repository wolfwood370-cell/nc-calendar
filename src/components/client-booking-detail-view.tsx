// ----------------------------------------------------------------------------
// ClientBookingDetailView — il dettaglio della sessione (lato cliente, passata
// 04, audit D1-D5, O3, O4, B2, H9 e V11)
// ----------------------------------------------------------------------------
// Sotto l'intestazione della pagina, una colonna con gap 16:
//   - l'intestazione della sessione (D3): il chip dello stato, la tipologia
//     col suo riquadro, giorno e orario, «con …» quando il coach si conosce,
//     il luogo con «Apri in Mappe» o la videochiamata;
//   - le azioni dello stato, con al massimo un pulsante pieno (V11): entrare
//     nella videochiamata, confermare la presenza, Sposta e Annulla, il
//     riquadro delle 24 ore, o la card delle svolte, assenti, annullate e in
//     verifica;
//   - la valutazione (H9), la stessa della Home;
//   - le informazioni (D4, O4), solo quelle che ci sono: la nota del coach,
//     «Cosa aspettarti», l'invito del calendario. Nessun pulsante per
//     aggiungere l'evento al calendario (D2): l'invito si aggiorna da solo.
// Ogni stato, soglia, data e testo viene da client-session-detail.ts. Dopo
// un'azione si resta sulla sessione: Annulla e Sposta chiudono il foglio,
// rileggono il dettaglio e lasciano un toast con «Ripristina» per 8 secondi;
// «Ripristina» riuscito rimette il focus sul titolo, se si era perso col
// toast (passata 09).
// Il coach viene da useMyCoach (get_my_coach): finché non arriva, o senza
// nome, i testi dicono «il tuo coach», e la riga «con …» e i pulsanti
// WhatsApp non ci sono.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarDays,
  CircleCheck,
  Clock,
  MapPin,
  MessageCircle,
  Repeat,
  User,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ClientButton } from "@/components/client-button";
import { ClientCancelSheet } from "@/components/client-cancel-sheet";
import { ClientMoveSheet, type MoveBooking } from "@/components/client-move-sheet";
import { ClientSessionRating } from "@/components/client-session-rating";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { useConfirmAttendance } from "@/hooks/use-confirm-attendance";
import { useMoveUndo } from "@/hooks/use-move-undo";
import { useMyCoach } from "@/hooks/use-my-coach";
import { useRestoreBooking } from "@/hooks/use-restore-booking";
import { useClientFeedback } from "@/hooks/use-session-feedback";
import { typeTint, withCoachLine, writeOnWhatsApp } from "@/lib/client-book";
import {
  LOCKED_TITLE,
  absentHint,
  canRebook,
  cancelToast,
  coachNoteTitle,
  confirmCaption,
  detailPanel,
  detailPlace,
  detailStatus,
  detailWhen,
  freeCancelNote,
  inviteText,
  lockedText,
  ratingState,
  sessionMinutes,
  statusCard,
  tileIcon,
  type DetailEventType,
} from "@/lib/client-session-detail";
import { sessionName } from "@/lib/client-sessions";
import { focusIfLost } from "@/lib/focus";
import { queryKeys } from "@/lib/query-keys";
import { iconForType } from "@/lib/session-type-icon";
import { toastWithUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";

/** La sessione del dettaglio, col coach, il cliente e la sua tipologia (null senza). */
export type ClientBookingDetail = MoveBooking & { event_type: DetailEventType | null };

const CARD = "rounded-[24px] border border-outline-variant/35 bg-white";

function DetailRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[15px] leading-[1.4]">
      <Icon className="mt-px size-[18px] shrink-0 text-aura-primary" aria-hidden />
      <span className="flex min-w-0 flex-col">{children}</span>
    </li>
  );
}

export interface ClientBookingDetailViewProps {
  booking: ClientBookingDetail;
}

export function ClientBookingDetailView({ booking }: ClientBookingDetailViewProps) {
  const { now } = useClientShell();
  const qc = useQueryClient();
  // Il coach dei testi (get_my_coach), come in Prenota: senza nome «il tuo coach».
  const { coach } = useMyCoach();
  const { meId, profile, state } = useClientBookState(now, coach);
  const feedbackQ = useClientFeedback(meId);
  const confirmAttendance = useConfirmAttendance(coach);
  const restore = useRestoreBooking();
  const [sheet, setSheet] = useState<"move" | "cancel" | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  const eventType = booking.event_type;
  const name = sessionName(booking, eventType);
  const email = profile?.email ?? null;
  const feedback = feedbackQ.data?.find((f) => f.booking_id === booking.id);
  const model = useMemo(() => {
    const place = detailPlace(eventType);
    const panel = detailPanel(booking, place?.online ?? false, now);
    return {
      status: detailStatus(booking, now),
      when: detailWhen(booking, now),
      place,
      panel,
      card: panel.status ? statusCard(booking, canRebook(booking, state), now) : null,
      invite: inviteText(booking, email, now),
      rating: ratingState(booking, feedback !== undefined, now),
    };
  }, [booking, eventType, now, state, email, feedback]);
  const { status, when, place, panel, card, invite, rating } = model;

  const StatusIcon = status.icon;
  const TypeIcon = iconForType(name);
  const color = eventType?.color ?? null;
  const coachLine = withCoachLine(coach);
  const absent = absentHint(coach);
  const note = booking.trainer_notes?.trim() || null;
  const description = eventType?.description?.trim() || null;
  // La colonna note arriva col 02/10: la riga di select("*") la porta solo da lì.
  const savedNote = (feedback as { note?: string | null } | undefined)?.note ?? null;
  const hasActions = panel.join || panel.confirm || panel.manage !== null || card !== null;

  const detailKey = queryKeys.bookings.detail(booking.id);
  const refreshDetail = () => {
    void qc.invalidateQueries({ queryKey: detailKey });
  };
  // Dopo «Ripristina» il toast si chiude col pulsante che aveva il focus: il
  // focus va sul titolo, se si era perso (passata 09).
  const focusTitleIfLost = () => {
    focusIfLost(titleRef.current);
  };
  const moveUndo = useMoveUndo(coach, refreshDetail, focusTitleIfLost);

  // «Conferma presenza» sparisce con la rilettura: il focus va sul titolo.
  const onConfirmAttendance = () => {
    confirmAttendance.mutate(
      { bookingId: booking.id, clientId: booking.client_id },
      { onSuccess: () => titleRef.current?.focus({ preventScroll: true }) },
    );
  };

  // «Ripristina» dell'annullamento: la sessione com'era prima (useRestoreBooking
  // ricrea anche l'evento Google, col riepilogo di Prenota).
  const restoreSession = () => {
    restore.mutate(
      {
        bookingId: booking.id,
        coachId: booking.coach_id,
        clientId: booking.client_id,
        scheduledAt: booking.scheduled_at,
        durationMin: sessionMinutes(booking),
        name,
        clientName: profile?.full_name ?? email ?? "Cliente",
        color,
        online: place?.online ?? false,
        description,
      },
      { onSuccess: focusTitleIfLost },
    );
  };

  const onCancelled = (wasLate: boolean) => {
    // Lo stato del server subito: la card compare mentre il foglio si chiude, e
    // il focus va lì (returnFocus), perché «Annulla sessione» non c'è più.
    qc.setQueryData<ClientBookingDetail | null>(detailKey, (old) =>
      old ? { ...old, status: wasLate ? "late_cancelled" : "cancelled" } : old,
    );
    setSheet(null);
    refreshDetail();
    const done = cancelToast(wasLate);
    toastWithUndo(done.text, restoreSession, done.tone);
  };

  // Il toast con «Ripristina» è di useMoveUndo, che riporta la sessione
  // all'orario di prima e poi rilegge il dettaglio.
  const onMoved = (fromIso: string, toIso: string) => {
    setSheet(null);
    refreshDetail();
    moveUndo({
      bookingId: booking.id,
      name,
      clientName: profile?.full_name ?? null,
      fromIso,
      toIso,
    });
  };

  const closeSheet = (open: boolean) => {
    if (!open) setSheet(null);
  };

  return (
    <>
      <section className={cn(CARD, "flex flex-col gap-3.5 p-5 shadow-soft-card")}>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-bold",
            status.tone.bg,
            status.tone.fg,
          )}
        >
          <StatusIcon className="size-3.5 shrink-0" aria-hidden />
          {status.label}
        </span>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-12 shrink-0 place-items-center rounded-[14px]"
            style={{ background: typeTint(color), color: tileIcon(color) }}
          >
            <TypeIcon className="size-6" />
          </span>
          <h2
            ref={titleRef}
            tabIndex={-1}
            className="font-display text-[24px] leading-[1.2] font-bold tracking-[-0.01em]"
          >
            {name}
          </h2>
        </div>
        <ul className="flex flex-col gap-2.5">
          <DetailRow icon={CalendarDays}>
            <strong className="font-bold">{when.day}</strong>
            <span>{when.time}</span>
          </DetailRow>
          {coachLine && <DetailRow icon={User}>{coachLine}</DetailRow>}
          {place && (
            <DetailRow icon={place.online ? Video : MapPin}>
              <span>{place.text}</span>
              {place.mapsHref && (
                <a
                  href={place.mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 self-start text-sm font-bold text-aura-primary"
                >
                  Apri in Mappe
                </a>
              )}
            </DetailRow>
          )}
        </ul>
      </section>

      {hasActions && (
        <div className="flex flex-col gap-3">
          {panel.join && booking.meeting_link && (
            <ClientButton asChild fullWidth>
              <a href={booking.meeting_link} target="_blank" rel="noopener noreferrer">
                <Video className="size-[18px]" aria-hidden />
                Entra nella videochiamata
              </a>
            </ClientButton>
          )}
          {panel.confirm && (
            <div className="flex flex-col gap-2">
              <ClientButton
                fullWidth
                icon={CircleCheck}
                busy={confirmAttendance.isPending}
                onClick={onConfirmAttendance}
              >
                Conferma presenza
              </ClientButton>
              <p className="text-center text-[13px] leading-[1.45] text-on-surface-variant">
                {confirmCaption(coach)}
              </p>
            </div>
          )}
          {panel.manage === "free" && (
            <div className="flex flex-col gap-2">
              <ClientButton
                variant="secondary"
                fullWidth
                icon={Repeat}
                className="bg-white font-bold"
                onClick={() => setSheet("move")}
              >
                Sposta
              </ClientButton>
              <ClientButton variant="text-danger" fullWidth onClick={() => setSheet("cancel")}>
                Annulla sessione
              </ClientButton>
              <p className="text-center text-[13px] leading-[1.45] text-on-surface-variant">
                {freeCancelNote(booking)}
              </p>
            </div>
          )}
          {panel.manage === "locked" && (
            <section className="flex flex-col gap-2.5 rounded-[24px] bg-warning-soft p-4">
              <p className="flex items-center gap-2 text-[15px] font-bold text-warning-ink">
                <Clock className="size-[18px] shrink-0" aria-hidden />
                {LOCKED_TITLE}
              </p>
              <p className="text-sm leading-normal text-on-surface-variant">
                {lockedText(name, coach)}
              </p>
              {coach.whatsapp && (
                <ClientButton asChild variant="secondary" fullWidth className="bg-white font-bold">
                  <a href={coach.whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" aria-hidden />
                    {writeOnWhatsApp(coach)}
                  </a>
                </ClientButton>
              )}
              <ClientButton variant="text-danger" fullWidth onClick={() => setSheet("cancel")}>
                Annulla comunque
              </ClientButton>
            </section>
          )}
          {card && (
            <section className={cn(CARD, "flex flex-col gap-2.5 p-4")}>
              <p
                ref={statusRef}
                tabIndex={-1}
                className={cn("flex gap-2 text-[15px] font-bold", status.tone.fg)}
              >
                <StatusIcon className="mt-px size-[18px] shrink-0" aria-hidden />
                {card.line}
              </p>
              {card.absent && absent.href && (
                <a
                  href={absent.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start text-sm font-bold text-aura-primary"
                >
                  {absent.text}
                </a>
              )}
              {card.absent && !absent.href && (
                <p className="text-sm font-bold text-aura-primary">{absent.text}</p>
              )}
              {card.rebook && (
                <ClientButton asChild variant="secondary" fullWidth className="font-bold">
                  <Link
                    to="/client/book"
                    search={{ eventType: booking.event_type_id ?? undefined }}
                  >
                    Prenota di nuovo
                  </Link>
                </ClientButton>
              )}
            </section>
          )}
        </div>
      )}

      {rating.show && meId && feedbackQ.data !== undefined && (
        <ClientSessionRating
          bookingId={booking.id}
          clientId={meId}
          rating={feedback?.rating ?? null}
          note={savedNote}
          editable={rating.editable}
          coach={coach}
          layout="detail"
        />
      )}

      {(note || description || invite) && (
        <section className={cn(CARD, "flex flex-col gap-3.5 p-4")}>
          {note && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold">{coachNoteTitle(coach)}</h3>
              <p className="text-[15px] leading-normal whitespace-pre-wrap text-on-surface-variant">
                {note}
              </p>
            </div>
          )}
          {description && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold">Cosa aspettarti</h3>
              <p className="text-[15px] leading-normal text-on-surface-variant">{description}</p>
            </div>
          )}
          {invite && (
            <p className="flex gap-2.5 text-sm leading-[1.45] text-on-surface-variant">
              <CalendarCheck className="mt-px size-[18px] shrink-0 text-aura-primary" aria-hidden />
              <span>{invite}</span>
            </p>
          )}
        </section>
      )}

      <ClientMoveSheet
        open={sheet === "move"}
        onOpenChange={closeSheet}
        booking={booking}
        name={name}
        coach={coach}
        clientName={profile?.full_name ?? null}
        onMoved={onMoved}
      />
      <ClientCancelSheet
        open={sheet === "cancel"}
        onOpenChange={closeSheet}
        booking={booking}
        name={name}
        onCancelled={onCancelled}
        returnFocus={() => statusRef.current ?? titleRef.current}
      />
    </>
  );
}
