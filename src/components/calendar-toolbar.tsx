// ----------------------------------------------------------------------------
// Testata del Calendario desktop (audit C1, C2, C5, passata 04)
// ----------------------------------------------------------------------------
// Riga 1: H1 e il solo indicatore di sincronizzazione (C1), con il chip delle
// sessioni che non sono su Google e il loro popover («Ricrea su Google»).
// Riga 2: Oggi, ‹ ›, periodo; segmentato Giorno | Settimana (C5).
// Riga 3: segmentato Tutti | Da assegnare | Personali (esclusivo, C2),
// tipologie, interruttore Disponibilità. Poi il banner dei filtri vuoti.
// La riconciliazione con Google e «Sincronizza tutto dal 1° gen» stanno in
// Integrazioni.
// ----------------------------------------------------------------------------

import { ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { SegmentedControl } from "@/components/segmented-control";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarFilter, CalendarView } from "@/lib/calendar-search";
import { notOnGoogleLabel } from "@/lib/calendar-events";
import { cn } from "@/lib/utils";

export interface MissingOnGoogle {
  id: string;
  name: string;
  when: string;
}

export interface CalendarToolbarProps {
  syncLabel: string;
  syncing: boolean;
  onSyncNow: () => void;
  missing: readonly MissingOnGoogle[];
  repairingId: string | null;
  onRepair: (id: string) => void;
  periodLabel: string;
  view: CalendarView;
  onToday: () => void;
  onShift: (dir: 1 | -1) => void;
  onView: (v: CalendarView) => void;
  filter: CalendarFilter;
  assignCount: number;
  onFilter: (f: CalendarFilter) => void;
  eventTypes: ReadonlyArray<{ id: string; name: string; color: string }>;
  types: readonly string[];
  onToggleType: (id: string) => void;
  onClearTypes: () => void;
  avail: boolean;
  onToggleAvail: () => void;
  emptyWithFilters: boolean;
  onClearFilters: () => void;
}

const Divider = () => <span className="h-[22px] w-px bg-outline-variant" aria-hidden />;

export function CalendarToolbar(p: CalendarToolbarProps) {
  const week = p.view === "week";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle className="m-0">Calendario</PageTitle>
        <div className="flex flex-wrap items-center gap-2">
          {p.missing.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-full border border-warning-line bg-warning-soft px-3.5 text-[13px] font-semibold text-warning-text"
                >
                  <TriangleAlert className="size-[15px]" aria-hidden />
                  {notOnGoogleLabel(p.missing.length)}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="flex w-[380px] flex-col gap-2.5 rounded-[18px] border-surface-container p-4 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
              >
                <p className="text-sm font-bold text-on-surface">Sessioni non presenti su Google</p>
                <p className="text-xs leading-normal text-on-surface-variant">
                  Prenotate nell'app ma senza evento su Google Calendar. Ricreale per tenere i due
                  calendari allineati.
                </p>
                <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                  {p.missing.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2.5 rounded-[14px] bg-surface-container-low px-3 py-2.5"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-semibold text-on-surface">
                          {m.name}
                        </span>
                        <span className="text-xs text-outline">{m.when}</span>
                      </div>
                      <button
                        type="button"
                        disabled={p.repairingId === m.id}
                        onClick={() => p.onRepair(m.id)}
                        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-aura-primary px-3 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {p.repairingId === m.id && (
                          <Loader2 className="size-3 animate-spin" aria-hidden />
                        )}
                        Ricrea su Google
                      </button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
          <div className="flex h-9 items-center gap-2 rounded-full border border-surface-variant bg-white py-0 pl-3.5 pr-1.5 text-[13px] text-on-surface-variant">
            <span className="size-2 rounded-full bg-[#0b8043]" aria-hidden />
            <span>Google Calendar · {p.syncLabel}</span>
            <button
              type="button"
              onClick={p.onSyncNow}
              disabled={p.syncing}
              aria-label="Sincronizza ora"
              title="Sincronizza ora"
              className="grid size-7 place-items-center rounded-full text-aura-primary transition-colors hover:bg-surface-container disabled:opacity-60"
            >
              <RefreshCw className={cn("size-3.5", p.syncing && "animate-spin")} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={p.onToday}
            className="h-9 rounded-full border border-surface-variant bg-white px-4 text-sm font-semibold text-on-surface transition-colors hover:border-primary-container"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={() => p.onShift(-1)}
            aria-label={week ? "Settimana precedente" : "Giorno precedente"}
            className="grid size-9 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <ChevronLeft className="size-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => p.onShift(1)}
            aria-label={week ? "Settimana successiva" : "Giorno successivo"}
            className="grid size-9 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <ChevronRight className="size-[18px]" aria-hidden />
          </button>
          <h2 className="font-display text-lg font-semibold text-on-surface" aria-live="polite">
            {p.periodLabel}
          </h2>
        </div>
        <SegmentedControl
          ariaLabel="Vista"
          value={p.view}
          onChange={p.onView}
          options={[
            { value: "day", label: "Giorno" },
            { value: "week", label: "Settimana" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SegmentedControl
          ariaLabel="Mostra"
          value={p.filter}
          onChange={p.onFilter}
          options={[
            { value: "all", label: "Tutti" },
            {
              value: "assign",
              label: (
                <>
                  Da assegnare
                  {p.assignCount > 0 && (
                    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-tertiary-container/15 px-[5px] text-[11px] font-bold text-tertiary-container">
                      {p.assignCount}
                    </span>
                  )}
                </>
              ),
            },
            { value: "personal", label: "Personali" },
          ]}
        />
        <Divider />
        {p.eventTypes.map((t) => {
          const on = p.types.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => p.onToggleType(t.id)}
              className={cn(
                "flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold text-on-surface-variant transition-opacity",
                on
                  ? "border-aura-primary bg-aura-primary/[0.06]"
                  : "border-surface-variant bg-white",
                p.types.length > 0 && !on && "opacity-55",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: t.color }}
                aria-hidden
              />
              {t.name}
            </button>
          );
        })}
        {p.types.length > 0 && (
          <button
            type="button"
            onClick={p.onClearTypes}
            className="text-[13px] font-semibold text-aura-primary"
          >
            Mostra tutte
          </button>
        )}
        <Divider />
        <button
          type="button"
          aria-pressed={p.avail}
          onClick={p.onToggleAvail}
          className={cn(
            "flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold text-on-surface-variant",
            p.avail
              ? "border-aura-primary bg-aura-primary/[0.06]"
              : "border-surface-variant bg-white",
          )}
        >
          <Clock className="size-3.5" aria-hidden />
          Disponibilità
        </button>
      </div>

      {p.emptyWithFilters && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl border border-surface-variant bg-white px-4 py-3 text-sm text-on-surface-variant"
        >
          Nessun evento con questi filtri nel periodo mostrato.
          <button
            type="button"
            onClick={p.onClearFilters}
            className="text-[13px] font-semibold text-aura-primary"
          >
            Rimuovi filtri
          </button>
        </div>
      )}
    </div>
  );
}
