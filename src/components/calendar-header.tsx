import { Loader2, ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/filter-chip";

export interface CalendarHeaderProps {
  /** True quando lo sync con Google Calendar è in corso (mostra spinner). */
  mirroring: boolean;
  /** Stringa "26 - 1 maggio" / "28 aprile - 4 maggio" da fmtRange(weekStart, weekEnd). */
  weekRangeLabel: string;
  /** Click "Oggi" → torna alla settimana corrente. */
  onToday: () => void;
  /** Naviga alla settimana precedente. */
  onPrevWeek: () => void;
  /** Naviga alla settimana successiva. */
  onNextWeek: () => void;
  /** Filter toggle: mostra fasce di disponibilità in trasparenza. */
  showAvailability: boolean;
  onToggleAvailability: () => void;
  /** Filter toggle: mostra solo bookings di tipo PT. */
  onlyPT: boolean;
  onToggleOnlyPT: () => void;
  /** Filter toggle: mostra solo eventi senza client (imported da GCal). */
  onlyToAssign: boolean;
  onToggleOnlyToAssign: () => void;
  /** Click "Refresh" → forza refetch dei booking. */
  onRefresh: () => void;
  /** Errore sulla query principale dei booking (mostra banner rosso). */
  hasBookingsError: boolean;
  /** Callback per retry quando hasBookingsError è true. */
  onRetryBookings: () => void;
  /** Filtri attivi che potrebbero nascondere tutti gli eventi (per banner empty-state). */
  filtersActive: boolean;
  /** Conteggio eventi visibili dopo filtri (banner se 0 + filtersActive). */
  totalVisible: number;
}

/**
 * Header completo della pagina calendario coach:
 *   - title + spinner mirroring
 *   - week navigation (Oggi + prev/next + range label)
 *   - 3 FilterChip toggles + RefreshCw button
 *   - banner errore caricamento booking + banner empty-with-filters
 *
 * Estratto da trainer.calendar.tsx. Stateless: lo stato vive nel parent
 * (CalendarPage) che passa value + handlers per ogni controllo.
 */
export function CalendarHeader({
  mirroring,
  weekRangeLabel,
  onToday,
  onPrevWeek,
  onNextWeek,
  showAvailability,
  onToggleAvailability,
  onlyPT,
  onToggleOnlyPT,
  onlyToAssign,
  onToggleOnlyToAssign,
  onRefresh,
  hasBookingsError,
  onRetryBookings,
  filtersActive,
  totalVisible,
}: CalendarHeaderProps) {
  return (
    <header className="flex flex-col gap-4 mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl font-bold text-aura-primary">Calendario Master</h1>
        {mirroring && (
          <div className="flex items-center gap-2 text-xs text-outline rounded-full border border-outline-variant px-3 py-1.5 bg-white">
            <Loader2 className="size-3.5 animate-spin" /> Sincronizzazione…
          </div>
        )}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onToday}
            className="rounded-full bg-white border-surface-variant"
          >
            Oggi
          </Button>
          <div className="flex items-center gap-1">
            <button
              onClick={onPrevWeek}
              className="size-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
              aria-label="Settimana precedente"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold min-w-40 text-center capitalize">
              {weekRangeLabel}
            </span>
            <button
              onClick={onNextWeek}
              className="size-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
              aria-label="Settimana successiva"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip active={showAvailability} onClick={onToggleAvailability}>
            Mostra Disponibilità
          </FilterChip>
          <FilterChip active={onlyPT} onClick={onToggleOnlyPT}>
            Solo Sessioni PT
          </FilterChip>
          <FilterChip active={onlyToAssign} onClick={onToggleOnlyToAssign}>
            Eventi da Assegnare
          </FilterChip>
          <button
            onClick={onRefresh}
            className="size-8 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
            aria-label="Aggiorna"
            title="Aggiorna calendario"
          >
            <RefreshCw className="size-4" />
          </button>
        </div>
      </div>
      {hasBookingsError && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4" />
            Errore nel caricamento del calendario.
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetryBookings}
            className="rounded-full bg-white"
          >
            Riprova
          </Button>
        </div>
      )}
      {!hasBookingsError && filtersActive && totalVisible === 0 && (
        <div className="rounded-2xl border border-surface-variant bg-white px-4 py-3 text-sm text-outline">
          Nessun evento corrisponde ai filtri attivi.
        </div>
      )}
    </header>
  );
}
