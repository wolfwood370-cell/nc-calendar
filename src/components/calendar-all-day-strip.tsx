import { AllDayPill, type AllDayPillBooking } from "@/components/mobile-calendar-agenda";

/**
 * Subset structural del booking richiesto dal pill all-day. Estende
 * `AllDayPillBooking` (title + notes letti da AllDayPill) e aggiunge `id`
 * per la prop `key` del .map. HIGH-7: prima l'interface aveva solo `id`
 * e il pill veniva passato con `booking={b as any}`. Estendere il subset
 * elimina il cast senza forzare BookingRow completo sul caller.
 */
export interface AllDayStripBooking extends AllDayPillBooking {
  id: string;
}

export interface CalendarAllDayStripProps<T extends AllDayStripBooking> {
  /** 7 giorni della settimana — usata solo per index del map (no rendering della data). */
  weekDays: readonly Date[];
  /** Array di array (per giorno) dei booking all-day visibili. */
  allDayByDay: readonly (readonly T[])[];
}

/**
 * Strip "Tutto il dì" che renderizza i Google all-day events (compleanni,
 * anniversari, ecc.) sopra il time grid. Restituisce null se nessun
 * giorno della settimana ha all-day events — così il parent non deve
 * scrivere il guard `{allDayByDay.some(d => d.length > 0) && (...)}`.
 */
export function CalendarAllDayStrip<T extends AllDayStripBooking>({
  weekDays,
  allDayByDay,
}: CalendarAllDayStripProps<T>) {
  const hasAny = allDayByDay.some((d) => d.length > 0);
  if (!hasAny) return null;

  return (
    <div
      className="flex border-b border-surface-container bg-surface/60"
      aria-label="Eventi giornalieri"
    >
      <div className="w-16 shrink-0 border-r border-surface-container flex items-center justify-center">
        <span className="text-[10px] uppercase tracking-wider text-outline">Tutto il dì</span>
      </div>
      <div className="flex-1 grid grid-cols-7">
        {weekDays.map((_, i) => {
          const items = allDayByDay[i] ?? [];
          return (
            <div
              key={i}
              className="border-r border-surface-container last:border-r-0 px-1.5 py-1.5 flex flex-col gap-1 min-h-[36px]"
            >
              {items.map((b) => (
                <AllDayPill key={b.id} booking={b} compact />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
