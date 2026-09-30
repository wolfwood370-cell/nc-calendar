// ----------------------------------------------------------------------------
// I crediti della Home (lato cliente, passata 05, audit H1, H3, H7, H10, V2,
// V8, V9)
// ----------------------------------------------------------------------------
// HomeCreditsCard: l'intestazione col blocco (e i segmenti del percorso
// fisso), l'avviso dei crediti da prenotare, una riga per tipologia col
// numero di Prenota (H1) e l'azione della riga (Prenota, «Come si prenota»,
// «Acquista»; mai «Completo», H10), la barra del blocco della riga, la
// legenda e il fondo: il Booster per chi lo compra, altrimenti il coach, col
// link WhatsApp solo se c'è (H7: nessun invito allo Store a chi non compra).
// Righe, testi e condizioni vengono da client-home.ts; «Come si prenota» è il
// foglio di Prenota (BookHowSheet con howToBook). I colori della tipologia
// arrivano dai dati, nello style.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { ChevronRight, Hourglass, MessageCircle, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BookHowSheet } from "@/components/book-sheets";
import { ClientButton } from "@/components/client-button";
import { useClientShell } from "@/hooks/use-client-shell";
import {
  howToBook,
  typeTint,
  writeOnWhatsApp,
  type BookClient,
  type BookCoach,
  type BookState,
} from "@/lib/client-book";
import type { ClientBlock } from "@/lib/client-credits";
import {
  creditRows,
  creditsFooter,
  creditsHeader,
  creditsWarning,
  type CreditRow,
  type CreditStep,
} from "@/lib/client-home";
import { tileIcon } from "@/lib/client-session-detail";
import { iconForType } from "@/lib/session-type-icon";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-outline-variant/35 bg-white shadow-soft-card";

const STEP: Record<CreditStep, string> = {
  done: "bg-aura-primary",
  current: "bg-primary-fixed-dim",
  todo: "bg-surface-variant",
};

const FOOTER =
  "flex min-h-11 items-center justify-between gap-2 border-t border-surface-container-low pt-2.5 text-sm font-bold text-aura-primary";

export interface HomeCreditsCardProps {
  client: BookClient;
  /** I blocchi del cliente (useClientBlocks), per l'intestazione. */
  blocks: readonly ClientBlock[];
  /** Lo stato dei crediti di Prenota (useClientBookState). */
  state: BookState;
  coach: BookCoach;
}

export function HomeCreditsCard({ client, blocks, state, coach }: HomeCreditsCardProps) {
  const { now } = useClientShell();
  const [howOpen, setHowOpen] = useState(false);
  // Resta dopo la chiusura: il foglio tiene titolo e testo mentre si chiude.
  const [howKey, setHowKey] = useState<string | null>(null);

  const header = creditsHeader(client, blocks, now);
  const warning = creditsWarning(client, state, now);
  const rows = creditRows(state);
  const footer = creditsFooter(state.canBuy, coach);
  const howOption = state.options.find((o) => o.key === howKey) ?? null;
  const how = howOption ? howToBook(howOption, state, coach) : null;

  const explain = (key: string) => {
    setHowKey(key);
    setHowOpen(true);
  };

  return (
    <section aria-label="I tuoi crediti" className={cn(CARD, "flex flex-col gap-3 p-[18px]")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h2 tabIndex={-1} className="font-sans text-[17px] font-bold tracking-normal">
            I tuoi crediti
          </h2>
          {header.sub && (
            <p className="text-[13px] leading-[1.4] text-on-surface-variant">{header.sub}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-on-surface-variant">
          {header.chip}
        </span>
      </div>

      {header.steps && (
        <div role="img" aria-label={header.steps.aria} className="flex gap-1">
          {header.steps.steps.map((step, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", STEP[step])} />
          ))}
        </div>
      )}

      {warning && (
        <p className="flex gap-2 rounded-[12px] bg-warning-soft px-3 py-2.5 text-[13px] leading-[1.45] text-warning-ink">
          <Hourglass className="mt-px size-4 shrink-0" aria-hidden />
          <span>{warning}</span>
        </p>
      )}

      <div className="flex flex-col">
        {rows.map((row, i) => (
          <CreditRowView key={row.key} row={row} first={i === 0} onExplain={explain} />
        ))}
      </div>

      <div
        aria-hidden
        className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-on-surface-variant"
      >
        <LegendItem swatch="bg-aura-primary">Svolte</LegendItem>
        <LegendItem swatch="bg-primary-fixed-dim">Prenotate</LegendItem>
        {rows.some((r) => r.lost > 0) && (
          <LegendItem swatch="bg-credit-lost">Perse (assenze e annullate tardi)</LegendItem>
        )}
      </div>

      {footer.kind === "buy" ? (
        <Link to="/client/store" className={FOOTER}>
          <span className="flex items-center gap-2">
            <Sparkles className="size-4" aria-hidden />
            Acquista un Booster
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      ) : footer.href ? (
        <a href={footer.href} target="_blank" rel="noopener noreferrer" className={FOOTER}>
          <span className="flex items-center gap-2">
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            {footer.text}
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </a>
      ) : (
        <p className={FOOTER}>
          <span className="flex items-center gap-2">
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            {footer.text}
          </span>
        </p>
      )}

      <BookHowSheet
        open={howOpen}
        onOpenChange={(open) => {
          if (!open) setHowOpen(false);
        }}
        how={how}
        eventTypeId={howOption?.eventTypeId ?? null}
        whatsappLabel={writeOnWhatsApp(coach)}
      />
    </section>
  );
}

function CreditRowView({
  row,
  first,
  onExplain,
}: {
  row: CreditRow;
  first: boolean;
  onExplain: (key: string) => void;
}) {
  const Icon = iconForType(row.name);
  const action = row.action;
  let button: ReactNode = null;
  if (action?.kind === "book") {
    button = (
      <ClientButton variant="row" asChild>
        <Link
          to="/client/book"
          search={action.eventTypeId ? { eventType: action.eventTypeId } : {}}
        >
          Prenota
        </Link>
      </ClientButton>
    );
  } else if (action?.kind === "how") {
    button = (
      <ClientButton variant="row-outline" onClick={() => onExplain(row.key)}>
        Come si prenota
      </ClientButton>
    );
  } else if (action?.kind === "buy") {
    button = (
      <ClientButton variant="row-outline" asChild>
        <Link to="/client/store" search={{ type: action.eventTypeId }}>
          Acquista
        </Link>
      </ClientButton>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-2 py-3", !first && "border-t border-surface-container-low")}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[12px]"
          style={{ background: typeTint(row.color), color: tileIcon(row.color) }}
        >
          <Icon className="size-5" />
        </span>
        {/* Nome e azione vanno a capo solo se non ci stanno: a 320 px «Come si
            prenota» scende sotto il nome invece di schiacciarlo. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex min-w-24 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">{row.name}</span>
            <span
              className={cn(
                "text-sm font-bold",
                row.tone === "success" ? "text-success-text" : "text-warning-text",
              )}
            >
              {row.avail}
            </span>
          </span>
          {button}
        </div>
      </div>
      <div
        role="img"
        aria-label={row.aria}
        className="flex h-2 overflow-hidden rounded-full bg-surface-container"
      >
        <span className="bg-aura-primary" style={{ width: row.bar.done }} />
        <span className="bg-primary-fixed-dim" style={{ width: row.bar.booked }} />
        <span className="bg-credit-lost" style={{ width: row.bar.lost }} />
      </div>
      <p className="text-[13px] text-on-surface-variant">{row.detail}</p>
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 shrink-0 rounded-[3px]", swatch)} />
      {children}
    </span>
  );
}
