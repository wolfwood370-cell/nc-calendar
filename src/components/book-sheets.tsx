// ----------------------------------------------------------------------------
// I fogli di Prenota (lato cliente, passata 02, audit B4, B5, O3 e D2)
// ----------------------------------------------------------------------------
// Su ClientSheet, coi pulsanti a tutta larghezza in colonna e al massimo un
// principale per foglio (V4):
//   - BookConfirmSheet: il riepilogo, «Conferma la prenotazione», e nello
//     stesso foglio l'esito, «Prenotata»: dopo la conferma il foglio resta
//     aperto e cambia, e chiuso l'esito il focus torna nel contenuto della
//     pagina (returnFocus), perché «Continua» non c'è più;
//   - BookHowSheet: «Come si prenota», per le tipologie che non si scelgono.
// I testi arrivano fatti da client-book.ts; il WhatsApp del coach c'è solo col
// link (oggi mai: get_my_coach è del 02/10/2026).
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CircleCheck,
  Coins,
  Loader2,
  MapPin,
  MessageCircle,
  User,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { ClientButton } from "@/components/client-button";
import { ClientSheet } from "@/components/client-sheet";
import { typeColor, typeTint } from "@/lib/client-book";
import { iconForType } from "@/lib/session-type-icon";

/** Il riepilogo, coi testi di client-book.ts. */
export interface BookSummary {
  name: string;
  color: string | null;
  durationMin: number;
  online: boolean;
  /** whenLine */
  when: string;
  /** withCoachLine: «con Nicolò Castello»; null senza nome, e la riga non c'è. */
  coach: string | null;
  /** placeLine; null senza tipologia. */
  place: string | null;
  /** creditLine */
  credit: string;
  /** summaryRule */
  rule: string;
}

/** L'esito: la sessione creata e doneText. */
export interface BookDone {
  bookingId: string;
  text: string;
}

function SummaryRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[15px] leading-[1.4]">
      <Icon className="mt-px size-[18px] shrink-0 text-primary-container" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

export interface BookConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Il riepilogo dell'orario scelto; null se non c'è (il foglio mostra l'esito o niente). */
  summary: BookSummary | null;
  /** Con l'esito il foglio è «Prenotata». */
  done: BookDone | null;
  /** bookingErrorMessage, sopra i pulsanti. */
  error: string | null;
  confirming: boolean;
  onConfirm: () => void;
  /** Dove torna il focus chiuso l'esito, quando «Continua» non c'è più. */
  returnFocus: () => HTMLElement | null | undefined;
}

export function BookConfirmSheet({
  open,
  onOpenChange,
  summary,
  done,
  error,
  confirming,
  onConfirm,
  returnFocus,
}: BookConfirmSheetProps) {
  if (done) {
    return (
      <ClientSheet
        open={open}
        onOpenChange={onOpenChange}
        title="Prenotata"
        description={done.text}
        returnFocus={returnFocus}
        icon={
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-success-soft text-success-text"
          >
            <CircleCheck className="size-7" />
          </span>
        }
      >
        <div className="flex flex-col gap-2 pt-1">
          <ClientButton asChild fullWidth>
            <Link to="/client/bookings/$bookingId" params={{ bookingId: done.bookingId }}>
              Vedi la sessione
            </Link>
          </ClientButton>
          <ClientButton variant="secondary" fullWidth onClick={() => onOpenChange(false)}>
            Prenota un'altra sessione
          </ClientButton>
        </div>
      </ClientSheet>
    );
  }

  const Icon = summary ? iconForType(summary.name) : CalendarDays;
  return (
    <ClientSheet
      open={open && summary !== null}
      onOpenChange={onOpenChange}
      title="Conferma la prenotazione"
      returnFocus={returnFocus}
    >
      {summary && (
        <>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-[14px]"
              style={{ background: typeTint(summary.color), color: typeColor(summary.color) }}
            >
              <Icon className="size-[22px]" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[17px] font-bold">{summary.name}</span>
              <span className="text-sm text-on-surface-variant">{summary.durationMin} minuti</span>
            </div>
          </div>
          <ul className="flex flex-col gap-3 rounded-[18px] bg-surface px-4 py-3.5">
            <SummaryRow icon={CalendarDays}>
              <span className="font-semibold">{summary.when}</span>
            </SummaryRow>
            {summary.coach && <SummaryRow icon={User}>{summary.coach}</SummaryRow>}
            {summary.place && (
              <SummaryRow icon={summary.online ? Video : MapPin}>{summary.place}</SummaryRow>
            )}
            <SummaryRow icon={Coins}>{summary.credit}</SummaryRow>
          </ul>
          <p className="text-sm leading-normal text-on-surface-variant">{summary.rule}</p>
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger-text">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <ClientButton fullWidth disabled={confirming} onClick={onConfirm}>
              {confirming && <Loader2 className="size-[18px] animate-spin" aria-hidden />}
              Conferma prenotazione
            </ClientButton>
            <ClientButton
              variant="text"
              fullWidth
              disabled={confirming}
              onClick={() => onOpenChange(false)}
            >
              Indietro
            </ClientButton>
          </div>
        </>
      )}
    </ClientSheet>
  );
}

export interface BookHowSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** howToBook; null a foglio chiuso. */
  how: { title: string; text: string; buy: boolean; whatsapp: string | null } | null;
  /** La tipologia, per «Acquista un Booster» (/client/store?type=…). */
  eventTypeId: string | null;
  /** writeOnWhatsApp: «Scrivi a Nicolò su WhatsApp». */
  whatsappLabel: string;
}

export function BookHowSheet({
  open,
  onOpenChange,
  how,
  eventTypeId,
  whatsappLabel,
}: BookHowSheetProps) {
  const buy = !!how?.buy && eventTypeId !== null;
  return (
    <ClientSheet
      open={open && how !== null}
      onOpenChange={onOpenChange}
      title={how?.title ?? ""}
      description={how?.text}
    >
      <div className="flex flex-col gap-2 pt-1">
        {buy && eventTypeId && (
          <ClientButton asChild fullWidth>
            <Link to="/client/store" search={{ type: eventTypeId }}>
              Acquista un Booster
            </Link>
          </ClientButton>
        )}
        {how?.whatsapp && (
          <ClientButton asChild fullWidth variant={buy ? "secondary" : "primary"}>
            <a href={how.whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className={buy ? "size-4" : "size-[18px]"} aria-hidden />
              {whatsappLabel}
            </a>
          </ClientButton>
        )}
        <ClientButton variant="text" fullWidth onClick={() => onOpenChange(false)}>
          Chiudi
        </ClientButton>
      </div>
    </ClientSheet>
  );
}
