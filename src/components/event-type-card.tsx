// ----------------------------------------------------------------------------
// Card di una tipologia, desktop (passata 07, audit E1, E2, E3)
// ----------------------------------------------------------------------------
// Aspetto di Coach Tipologie.dc.html. I −/+ e l'interruttore agiscono subito
// (event-type-actions.ts); il resto si modifica dalla matita. Mentre una
// scrittura della card è in corso i suoi controlli restano disabilitati,
// matita ed «Elimina» comprese: così il valore scritto per ultimo è quello
// mostrato, e il dialog non si apre su valori che stanno per cambiare. Se la scrittura fallisce il
// valore torna com'era e un toast dice l'errore. L'icona viene dal nome
// (iconForType, come nella Panoramica): il database non ha una colonna.
// ----------------------------------------------------------------------------

import { Activity, MapPin, Minus, Pencil, Plus, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { nextStep, type StepField } from "@/lib/event-type-actions";
import { bookableHint, locationLabel } from "@/lib/event-type-rules";
import { USAGE_UNAVAILABLE, usageFooter, type TypeUsage } from "@/lib/event-type-usage";
import type { EventTypeRow } from "@/lib/queries";
import { iconForType } from "@/lib/session-type-icon";
import { formatDuration } from "@/lib/session-time";
import { cn, errorMessage } from "@/lib/utils";

export type CardUsage = TypeUsage | "loading" | "error";

type Shown = Partial<Pick<EventTypeRow, StepField | "client_bookable">>;

export function EventTypeCard({
  type,
  usage,
  onEdit,
  onDelete,
  onStep,
  onToggle,
}: {
  type: EventTypeRow;
  usage: CardUsage;
  onEdit: () => void;
  onDelete: () => void;
  /** Scrive il passo (event-type-actions.ts); rifiuta se la scrittura non riesce. */
  onStep: (field: StepField, dir: 1 | -1) => Promise<void>;
  /** Scrive client_bookable; rifiuta se la scrittura non riesce. */
  onToggle: (bookable: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown>({});
  const t = { ...type, ...shown };
  const Icon = iconForType(type.name);

  const run = async (optimistic: Shown, write: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setShown(optimistic);
    try {
      await write();
    } catch (e) {
      toast.error("Modifica non salvata.", { description: errorMessage(e) });
    } finally {
      setShown({});
      setBusy(false);
    }
  };

  const step = (field: StepField, dir: 1 | -1) => {
    const value = nextStep(t, field, dir);
    if (value === null) return;
    void run({ [field]: value }, () => onStep(field, dir));
  };

  const toggle = () => {
    const next = !t.client_bookable;
    void run({ client_bookable: next }, () => onToggle(next));
  };

  return (
    <article className="relative flex flex-col gap-4 overflow-hidden rounded-[24px] bg-white p-[22px] shadow-[0_4px_20px_rgba(0,86,133,0.05)]">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ backgroundColor: type.color }}
      />
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-[12px] text-white"
            style={{ backgroundColor: type.color }}
          >
            <Icon className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="break-words text-[17px] font-bold text-on-surface">{type.name}</h2>
            {type.description && (
              <p
                className="line-clamp-2 text-[13px] leading-[1.4] text-on-surface-variant"
                title={type.description}
              >
                {type.description}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          aria-label={`Modifica ${type.name}`}
          className="grid size-[34px] shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Pencil className="size-[15px]" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-3 border-t border-surface-container-low pt-3.5">
        <StepperRow
          label="Durata"
          value={formatDuration(t.duration)}
          decLabel={`Riduci la durata di ${type.name}`}
          incLabel={`Aumenta la durata di ${type.name}`}
          canDec={!busy && nextStep(t, "duration", -1) !== null}
          canInc={!busy && nextStep(t, "duration", 1) !== null}
          onDec={() => step("duration", -1)}
          onInc={() => step("duration", 1)}
        />
        <StepperRow
          label="Margine dopo la sessione"
          value={`${t.buffer_minutes} min`}
          decLabel={`Riduci il margine di ${type.name}`}
          incLabel={`Aumenta il margine di ${type.name}`}
          canDec={!busy && nextStep(t, "buffer_minutes", -1) !== null}
          canInc={!busy && nextStep(t, "buffer_minutes", 1) !== null}
          onDec={() => step("buffer_minutes", -1)}
          onInc={() => step("buffer_minutes", 1)}
        />
        <div className="flex items-center gap-2 text-[13px] text-on-surface-variant">
          {type.location_type === "online" ? (
            <Video className="size-[15px] shrink-0 text-outline" aria-hidden />
          ) : (
            <MapPin className="size-[15px] shrink-0 text-outline" aria-hidden />
          )}
          <span className="min-w-0 break-words">{locationLabel(type)}</span>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={t.client_bookable}
        aria-label={`${type.name}: prenotabile dai clienti`}
        disabled={busy}
        onClick={toggle}
        className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 text-left disabled:cursor-default"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-10 shrink-0 rounded-full p-[3px] transition-colors",
            t.client_bookable ? "justify-end bg-aura-primary" : "justify-start bg-outline-variant",
          )}
        >
          <span className="size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-sm font-bold text-on-surface">Prenotabile dai clienti</strong>
          <span className="break-words text-xs leading-[1.4] text-on-surface-variant">
            {bookableHint(t)}
          </span>
        </span>
      </button>

      <div className="flex items-center justify-between gap-2 text-xs text-outline">
        <span className="flex min-w-0 items-center gap-1.5">
          <Activity className="size-3.5 shrink-0" aria-hidden />
          {usage === "loading" ? (
            <Skeleton className="h-3.5 w-52" aria-label="Utilizzo in caricamento" />
          ) : usage === "error" ? (
            <span>{USAGE_UNAVAILABLE}</span>
          ) : (
            <span>{usageFooter(usage)}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="shrink-0 text-xs font-semibold text-danger-text hover:underline disabled:cursor-default disabled:opacity-40 disabled:no-underline"
        >
          Elimina
        </button>
      </div>
    </article>
  );
}

function StepperRow({
  label,
  value,
  decLabel,
  incLabel,
  canDec,
  canInc,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  decLabel: string;
  incLabel: string;
  canDec: boolean;
  canInc: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  const btn =
    "grid size-[30px] place-items-center rounded-full border border-surface-variant transition-colors hover:border-primary-container disabled:cursor-default disabled:opacity-40 disabled:hover:border-surface-variant";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-on-surface-variant">{label}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={onDec}
          disabled={!canDec}
          aria-label={decLabel}
          className={cn(btn, "text-on-surface-variant")}
        >
          <Minus className="size-[13px]" aria-hidden />
        </button>
        <strong className="min-w-[58px] text-center text-sm font-bold tabular-nums text-on-surface">
          {value}
        </strong>
        <button
          type="button"
          onClick={onInc}
          disabled={!canInc}
          aria-label={incLabel}
          className={cn(btn, "text-aura-primary")}
        >
          <Plus className="size-[13px]" aria-hidden />
        </button>
      </span>
    </div>
  );
}
