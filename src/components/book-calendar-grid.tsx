import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameDay,
  isSameMonth,
  isBefore,
} from "date-fns";
import { it } from "date-fns/locale";

export interface BookCalendarGridProps {
  /** Mese attualmente visualizzato in griglia. */
  calendarMonth: Date;
  /** Chiamato quando l'utente naviga mese precedente/successivo. */
  onMonthChange: (newMonth: Date) => void;
  /** Giorno attualmente selezionato (null = nessuno). */
  selectedDate: Date | null;
  /** Chiamato quando l'utente sceglie un giorno cliccabile. */
  onSelectDate: (date: Date) => void;
  /** Set di chiavi `yyyy-MM-dd` che identificano i giorni con almeno uno slot bookable. */
  daysWithSlots: Set<string>;
  /** Cutoff per disabilitare giorni passati (tipico: startOfDay(new Date())). */
  todayStart: Date;
  /** Scadenza dei crediti del pool corrente; oltre questa data i giorni sono disabled. */
  selectedPoolValidUntil: Date | null;
  /** Origine del pool selezionato — determina il wording del messaggio sotto il calendario. */
  selectedPoolSource?: "block" | "extra" | null;
  /** Inizio del blocco successivo (se esiste). Mostrato come hint sotto il calendario. */
  nextBlockStartDate?: Date | null;
}

/**
 * Mensile-grid per la selezione data nella pagina booking client. Estratto
 * da client.book.tsx — il parent passa solo lo stato derivato necessario
 * (validUntil del pool, set giorni con slot) così il componente resta
 * disaccoppiato dal modello Pool interno.
 */
export function BookCalendarGrid({
  calendarMonth,
  onMonthChange,
  selectedDate,
  onSelectDate,
  daysWithSlots,
  todayStart,
  selectedPoolValidUntil,
  selectedPoolSource = null,
  nextBlockStartDate = null,
}: BookCalendarGridProps) {
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
    return days;
  }, [calendarMonth]);

  const goPrev = () => onMonthChange(addMonths(calendarMonth, -1));
  const goNext = () => onMonthChange(addMonths(calendarMonth, 1));

  return (
    <section className="bg-surface-container-lowest rounded-[32px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-6">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={goPrev}
          className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
          aria-label="Mese precedente"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-display font-semibold text-xl text-on-surface capitalize">
          {format(calendarMonth, "MMMM yyyy", { locale: it })}
        </span>
        <button
          onClick={goNext}
          className="p-2 text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
          aria-label="Mese successivo"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-center">
        {["L", "M", "M", "G", "V", "S", "D"].map((d, i) => (
          <div key={i} className="text-xs font-semibold text-outline mb-2">
            {d}
          </div>
        ))}
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, calendarMonth);
          const past = isBefore(day, todayStart);
          const dayKey = format(day, "yyyy-MM-dd");
          const hasSlots = daysWithSlots.has(dayKey);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          const expired = !!(selectedPoolValidUntil && isBefore(selectedPoolValidUntil, day));
          const disabled = past || !hasSlots || expired;
          return (
            <div key={dayKey} className="flex justify-center items-center py-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelectDate(day)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm transition-colors ${
                  isSelected
                    ? "bg-primary-container text-on-primary font-semibold shadow-sm"
                    : !inMonth || disabled
                      ? "text-outline-variant cursor-not-allowed"
                      : "text-on-surface hover:bg-surface-container-low cursor-pointer"
                }`}
              >
                {format(day, "d")}
              </button>
            </div>
          );
        })}
      </div>
      {selectedPoolValidUntil && (
        <div className="mt-stack-md text-xs text-on-surface-variant text-center space-y-1">
          <p>
            {selectedPoolSource === "extra"
              ? `I crediti extra scadono il ${format(selectedPoolValidUntil, "d MMMM yyyy", { locale: it })}.`
              : `Prenotabile fino al ${format(selectedPoolValidUntil, "d MMMM yyyy", { locale: it })}.`}
          </p>
          {selectedPoolSource === "block" && nextBlockStartDate && (
            <p>
              Il prossimo blocco si aprirà il{" "}
              {format(nextBlockStartDate, "d MMMM yyyy", { locale: it })}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
