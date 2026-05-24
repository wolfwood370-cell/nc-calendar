import { format } from "date-fns";
import { it } from "date-fns/locale";
import { getUserTimezoneLabel } from "@/lib/datetime";
import type { Slot } from "@/lib/booking-slots";

export interface BookSlotsGridProps {
  /** Giorno scelto nell'header (null = nessuna selezione). */
  selectedDate: Date | null;
  /** Slot disponibili per il giorno selezionato (può essere vuoto). */
  slotsForSelectedDay: Slot[];
  /** ISO dello slot attualmente selezionato (null = nessuno). */
  selectedISO: string | null;
  /** Chiamato quando l'utente clicca uno slot. */
  onSelectISO: (iso: string) => void;
}

/**
 * Grid 3-colonne degli orari prenotabili per il giorno scelto, con badge
 * "Consigliato" sopra gli slot raccomandati. Estratto da client.book.tsx
 * — rimane disaccoppiato dal modello Pool del parent perché lavora solo
 * sugli Slot già filtrati per la data.
 */
export function BookSlotsGrid({
  selectedDate,
  slotsForSelectedDay,
  selectedISO,
  onSelectISO,
}: BookSlotsGridProps) {
  return (
    <section>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-stack-md">
        <h3 className="font-semibold text-lg text-on-surface">
          {selectedDate
            ? `Orari disponibili per il ${format(selectedDate, "d MMMM", { locale: it })}`
            : "Seleziona una data"}
        </h3>
        {/* M8: surface the user's timezone so coaches/clients in
            different zones can resolve ambiguous times at a glance. */}
        <span
          className="text-xs text-on-surface-variant"
          title="Fuso orario del tuo dispositivo"
        >
          {getUserTimezoneLabel().combined}
        </span>
      </div>
      {selectedDate && slotsForSelectedDay.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          Nessuno slot disponibile in questa data.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {slotsForSelectedDay.map((s) => {
            const isSelected = s.iso === selectedISO;
            const recommended = !!s.recommended;
            const button = (
              <button
                type="button"
                onClick={() => onSelectISO(s.iso)}
                className={`w-full rounded-full py-3 text-sm font-semibold tabular-nums transition-colors ${
                  isSelected
                    ? "bg-primary-container text-on-primary border border-primary-container shadow-sm"
                    : recommended
                      ? "bg-on-primary-container text-on-primary-fixed border border-primary-container shadow-sm"
                      : "bg-surface-container-lowest border border-outline-variant text-on-surface hover:border-primary hover:text-primary"
                }`}
              >
                {format(s.date, "HH:mm")}
              </button>
            );
            if (recommended) {
              return (
                <div key={s.iso} className="relative flex flex-col items-center">
                  <span className="absolute -top-3 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase z-10 shadow-sm border border-surface-container-lowest bg-aura-secondary text-on-aura-secondary">
                    Consigliato
                  </span>
                  {button}
                </div>
              );
            }
            return <div key={s.iso}>{button}</div>;
          })}
        </div>
      )}
    </section>
  );
}
