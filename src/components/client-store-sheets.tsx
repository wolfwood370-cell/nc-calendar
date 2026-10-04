// ----------------------------------------------------------------------------
// I fogli dello Store (lato cliente, passata 06, audit S1, S3, V12)
// ----------------------------------------------------------------------------
// Su ClientSheet, coi pulsanti a tutta larghezza in colonna e al massimo un
// principale per foglio (V4):
//   - StoreSummarySheet: «Riepilogo», con titolo e prezzo, fino a quando
//     valgono e i crediti dopo l'acquisto; «Paga … con Stripe» resta nel foglio
//     mentre aspetta (aria-disabled, non disabled: tiene il focus) e un
//     secondo tocco non parte;
//   - StoreDoneSheet: «Pagamento completato», il ritorno da Stripe. Il testo
//     sta in una regione role="status", così il passaggio dall'attesa
//     all'arrivo dei crediti si sente; con i crediti arrivati, «Prenota ora» o
//     il WhatsApp del coach per le tipologie che fissa lui.
// I testi arrivano fatti da client-store.ts.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  CircleCheck,
  Coins,
  Loader2,
  Lock,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { ClientButton } from "@/components/client-button";
import { ClientSheet } from "@/components/client-sheet";
import { STORE_DONE_TITLE, type StoreOutcome, type StoreSummary } from "@/lib/client-store";

function SummaryRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-[1.45] text-on-surface-variant">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary-container" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

export interface StoreSummarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** storeSummary del prodotto scelto; null a foglio chiuso. */
  summary: StoreSummary | null;
  /** Il pagamento è partito: il pulsante aspetta la risposta. */
  paying: boolean;
  onPay: () => void;
  /** Dove torna il focus se «Acquista» non c'è più (V12: la card di chi non compra). */
  returnFocus: () => HTMLElement | null | undefined;
}

export function StoreSummarySheet({
  open,
  onOpenChange,
  summary,
  paying,
  onPay,
  returnFocus,
}: StoreSummarySheetProps) {
  return (
    <ClientSheet
      open={open && summary !== null}
      onOpenChange={onOpenChange}
      title="Riepilogo"
      returnFocus={returnFocus}
    >
      {summary && (
        <>
          <ul className="flex flex-col gap-2.5 rounded-[18px] bg-surface px-4 py-3.5">
            <li className="flex justify-between gap-3 text-[15px] font-bold">
              <span>{summary.title}</span>
              <span className="shrink-0 tabular-nums">{summary.price}</span>
            </li>
            <SummaryRow icon={CalendarRange}>{summary.valid}</SummaryRow>
            <SummaryRow icon={Coins}>{summary.after}</SummaryRow>
          </ul>
          <div className="flex flex-col gap-2 pt-1">
            <ClientButton
              fullWidth
              aria-disabled={paying || undefined}
              onClick={() => {
                if (!paying) onPay();
              }}
              className="aria-disabled:cursor-progress"
            >
              {paying ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Lock className="size-4" aria-hidden />
              )}
              {summary.pay}
            </ClientButton>
            <ClientButton variant="text" fullWidth onClick={() => onOpenChange(false)}>
              Indietro
            </ClientButton>
          </div>
        </>
      )}
    </ClientSheet>
  );
}

export interface StoreDoneSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** storeOutcome; null finché lo stato dei crediti non è letto. */
  outcome: StoreOutcome | null;
  /** Il foglio si apre da solo, col caricamento: alla chiusura il focus va qui. */
  returnFocus: () => HTMLElement | null | undefined;
  /** «Prenota ora»: prima di andare a Prenota l'indirizzo perde l'esito. */
  onBook: () => void;
}

export function StoreDoneSheet({
  open,
  onOpenChange,
  outcome,
  returnFocus,
  onBook,
}: StoreDoneSheetProps) {
  const action = outcome?.kind === "arrived" ? outcome.action : null;
  return (
    <ClientSheet
      open={open && outcome !== null}
      onOpenChange={onOpenChange}
      title={STORE_DONE_TITLE}
      returnFocus={returnFocus}
      icon={
        outcome?.kind === "arrived" ? (
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-success-soft text-success-text"
          >
            <CircleCheck className="size-7" />
          </span>
        ) : undefined
      }
    >
      <p
        role="status"
        aria-live="polite"
        className="text-[15px] leading-normal text-on-surface-variant"
      >
        {outcome?.text}
      </p>
      <div className="flex flex-col gap-2 pt-1">
        {action?.kind === "book" && (
          <ClientButton asChild fullWidth>
            <Link to="/client/book" search={{ eventType: action.eventTypeId }} onClick={onBook}>
              Prenota ora
            </Link>
          </ClientButton>
        )}
        {action?.kind === "whatsapp" && (
          <ClientButton asChild fullWidth>
            <a href={action.href} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-[18px]" aria-hidden />
              {action.label}
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
