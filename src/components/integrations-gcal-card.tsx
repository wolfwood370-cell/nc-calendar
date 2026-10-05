// ----------------------------------------------------------------------------
// Card di Google Calendar di Integrazioni desktop (passata 09, I1, I3, I4)
// ----------------------------------------------------------------------------
// Chip dello stato misurato (gcal-integration.ts), «Sincronizza ora», il
// riquadro d'errore, le tre caselle, gli elenchi (dalla pagina) e «Cosa fa»
// scritto su quello che l'app fa davvero:
//   1. crea l'evento alla prenotazione (use-book-confirm.ts:244,
//      session-store.ts:104);
//   2. invito al cliente e aggiornamenti a ogni modifica o cancellazione
//      (gcal.server.ts, sendUpdates in gcalCreate, gcalUpdate e gcalDelete);
//   3. i due promemoria stanno sul calendario dello studio: per Google i
//      promemoria di un evento valgono per l'account che lo crea
//      (gcal.server.ts, buildReminders);
//   4. link Meet alle sessioni online in tutti i percorsi di creazione;
//   5. la riconciliazione all'apertura del Calendario, ogni 10 minuti al
//      massimo, sui prossimi 16 giorni (use-gcal-sync.ts, gcal.functions.ts:386-393).
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  CircleAlert,
  Loader2,
  RefreshCw,
  Repeat,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { gcalChipLabel, gcalErrorTitle, type GcalChip } from "@/lib/gcal-integration";
import { APP_ERROR_TEXT } from "@/lib/gcal-sync-run";
import { cn } from "@/lib/utils";

const WHAT_IT_DOES: Array<{ icon: LucideIcon; color: string; text: string }> = [
  {
    icon: Check,
    color: "text-[#4285f4]",
    text: "Crea l'evento su Google quando una sessione viene prenotata, dal cliente o da te.",
  },
  {
    icon: Check,
    color: "text-[#4285f4]",
    text: "Invia al cliente l'invito via email, e un aggiornamento se la sessione cambia o viene annullata.",
  },
  {
    icon: Check,
    color: "text-[#4285f4]",
    text: "Sul calendario dello studio mette due promemoria: 24 ore prima, e poi 30 minuti prima per le sessioni online o 2 ore prima per quelle in studio.",
  },
  {
    icon: Video,
    color: "text-[#00897b]",
    text: "Aggiunge il link Google Meet alle sessioni online.",
  },
  {
    icon: Repeat,
    color: "text-[#4285f4]",
    text: "Quando apri il Calendario, al massimo ogni 10 minuti, riporta nell'app gli spostamenti e le cancellazioni fatti su Google per le sessioni dei prossimi 16 giorni, e ricrea su Google gli eventi che mancano.",
  },
];

function ChipView({ chip }: { chip: GcalChip }) {
  const tone =
    chip.state === "connected"
      ? "bg-success-soft text-success-text"
      : chip.state === "error"
        ? "bg-danger-soft text-danger-text"
        : "bg-surface-container text-on-surface-variant";
  return (
    <span
      role="status"
      className={cn(
        "flex items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[11px] font-bold",
        tone,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {gcalChipLabel(chip)}
    </span>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <>
      <span className="text-xs text-outline">{label}</span>
      <strong className={cn("text-[15px] font-bold text-on-surface", tone)}>{value}</strong>
    </>
  );
}

const TILE = "flex min-w-0 flex-col gap-0.5 rounded-2xl bg-surface px-3.5 py-3 text-left";

export function IntegrationsGcalCard({
  chip,
  syncing,
  disabled,
  onSyncNow,
  lastUpdate,
  assignCount,
  missingCount,
  children,
}: {
  chip: GcalChip;
  /** «Sincronizza ora» in corso. */
  syncing: boolean;
  /** Un'altra scrittura verso Google in corso. */
  disabled: boolean;
  onSyncNow: () => void;
  lastUpdate: string;
  /** null finché le sessioni non si sono lette. */
  assignCount: number | null;
  missingCount: number | null;
  /** Gli elenchi sotto le caselle. */
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="gcal-title"
      className="flex min-w-0 flex-col gap-[18px] rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-[#4285f4] text-white">
            <CalendarDays className="size-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="gcal-title" className="card-title text-on-surface">
                Google Calendar
              </h2>
              <ChipView chip={chip} />
            </div>
            <p className="text-[13px] text-on-surface-variant">Calendario condiviso dello studio</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onSyncNow}
          disabled={syncing || disabled}
          className="flex h-[38px] items-center gap-2 rounded-full border border-surface-variant px-4 text-sm font-semibold text-aura-primary transition-colors hover:border-primary-container disabled:opacity-60 disabled:hover:border-surface-variant"
        >
          {syncing ? (
            <Loader2 className="size-[15px] animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-[15px]" aria-hidden />
          )}
          {syncing ? "Sincronizzo…" : "Sincronizza ora"}
        </button>
      </div>

      {chip.state === "unavailable" && (
        <p className="text-[13px] leading-normal text-on-surface-variant">{APP_ERROR_TEXT}</p>
      )}

      {chip.state === "error" && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-[18px] border border-danger-line bg-danger-soft px-4 py-3.5"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-danger-text">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {gcalErrorTitle(chip.reason)}
          </p>
          <p className="text-[13px] leading-normal text-danger-text">
            Le prenotazioni continuano a funzionare nell'app. Le sessioni senza evento su Google
            vengono ricreate alla prossima sincronizzazione riuscita. Se l'errore resta, avvisa chi
            gestisce l'account dello studio.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <div className={TILE}>
          <Tile label="Ultimo aggiornamento" value={lastUpdate} />
        </div>
        <Link
          to="/trainer/calendar"
          search={{ filter: "assign" }}
          className={cn(TILE, "transition-colors hover:bg-surface-container-low")}
        >
          <Tile
            label="Eventi da assegnare"
            value={assignCount === null ? "—" : String(assignCount)}
            tone={assignCount ? "text-tertiary-container" : undefined}
          />
        </Link>
        <div className={TILE}>
          <Tile
            label="Sessioni non su Google"
            value={missingCount === null ? "—" : String(missingCount)}
            tone={missingCount ? "text-warning-text" : undefined}
          />
        </div>
      </div>

      {children}

      <div className="flex flex-col gap-2.5 border-t border-surface-container-low pt-3.5">
        <p className="text-xs font-bold uppercase tracking-[0.05em] text-outline">Cosa fa</p>
        <ul className="flex flex-col gap-2 text-sm leading-[1.45] text-on-surface-variant">
          {WHAT_IT_DOES.map((w) => (
            <li key={w.text} className="flex gap-2.5">
              <w.icon className={cn("mt-0.5 size-4 shrink-0", w.color)} aria-hidden />
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
