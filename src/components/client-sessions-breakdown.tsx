// ----------------------------------------------------------------------------
// ClientSessionsBreakdown — nested card "Le tue Sessioni" del blocco corrente.
// ----------------------------------------------------------------------------
// Sostituisce il vecchio KPI box single-counter ("3 sessioni da prenotare")
// con un breakdown granulare per tipologia di evento (Personal Training,
// Valutazione FMS, Consulenza, ...). Ogni riga ha:
//   - colonna fissa 180px: icona + nome tipologia troncato
//   - colonna fluida: progress bar (used+booked) / total
//   - colonna auto: badge "X disponibili" + bottone "Prenota"
//
// Layout via CSS Grid `[180px_1fr_auto]` per garantire allineamento
// rigido: tutte le barre iniziano e finiscono sullo stesso asse Y
// indipendentemente dalla lunghezza del nome tipologia. min-w-[500px]
// + overflow-x-auto sul container così il layout non si squashifica
// su screen narrow.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { iconForType } from "@/lib/session-type-icon";

export interface SessionTypeBreakdownRow {
  /** Stable key per il map (event_type_id o session_type fallback). */
  key: string;
  /** Etichetta visibile (nome dell'event type o fallback session_type). */
  name: string;
  /** Conteggio booking completed dentro la finestra del blocco. */
  completed: number;
  /** Conteggio booking scheduled (prenotati ma non ancora fatti). */
  booked: number;
  /** Totale assegnato dal coach per questa tipologia nel blocco. */
  total: number;
}

interface Props {
  rows: SessionTypeBreakdownRow[];
  /** Totale somma di tutti i `total` — mostrato nel badge dell'header. */
  grandTotal: number;
}

export function ClientSessionsBreakdown({ rows, grandTotal }: Props) {
  return (
    // Vincolo Aura: card 32px radius + outline-variant (#c1c7d0) + shadow soft.
    // bg-surface-container-lowest === #ffffff (token), outline-variant === #c1c7d0.
    // p-6 + shadow-sm per allineare al resto delle card del design system.
    <div className="bg-surface-container-lowest rounded-[32px] p-6 border border-outline-variant shadow-sm overflow-x-auto">
      {/* Header — `min-w-max` evita che il title vada a capo quando il container
          è in overflow-x-auto mode su screen narrow */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex flex-col">
          <h3 className="text-base font-semibold text-on-surface">Le tue Sessioni</h3>
          <p className="text-[11px] text-on-surface-variant">Pianifica i tuoi appuntamenti</p>
        </div>
        <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0">
          {grandTotal} {grandTotal === 1 ? "Totale" : "Totali"}
        </span>
      </div>

      {/* Lista righe — responsive grid:
          - mobile (default): colonna 1 = 110px (tipologia compatta)
          - sm+ (≥640px):     colonna 1 = 180px (full nome)
          Le 3 colonne restano allineate su tutte le righe perché il grid è
          identico per ogni riga e le larghezze sono fisse/derivate. */}
      <div className="flex flex-col gap-3 w-full">
        {rows.map((row) => {
          const used = row.completed + row.booked;
          const remaining = Math.max(0, row.total - used);
          const pct = row.total > 0 ? Math.min(100, (used / row.total) * 100) : 0;
          const Icon = iconForType(row.name);
          const isDone = remaining === 0;

          return (
            <div
              key={row.key}
              className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[180px_1fr_auto] items-center gap-3 sm:gap-4 w-full py-1"
            >
              {/* Colonna 1: Icona + Nome (responsive 110px → 180px) */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-[110px] max-w-[110px] sm:min-w-[180px] sm:max-w-[180px]">
                <div className="size-8 sm:size-9 rounded-full bg-aura-primary/5 flex items-center justify-center text-aura-primary shrink-0">
                  <Icon className="size-4" aria-hidden />
                </div>
                <span className="text-[13px] sm:text-sm font-semibold text-on-surface truncate">
                  {row.name}
                </span>
              </div>

              {/* Colonna 2: Progress bar fluida (pill-shaped, vincolo Aura) */}
              <div className="w-full px-1 sm:px-2">
                <div className="w-full bg-aura-primary/10 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-aura-primary h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Colonna 3: Badge pill + bottone pill (vincolo Aura: rounded-full) */}
              <div className="flex items-center gap-2 justify-end shrink-0">
                <span
                  className={
                    isDone
                      ? "text-[11px] font-bold text-on-surface-variant px-2 py-0.5 rounded-full bg-surface-container-high whitespace-nowrap"
                      : "text-[11px] font-bold text-aura-primary px-2 py-0.5 rounded-full bg-aura-primary/10 whitespace-nowrap"
                  }
                >
                  {remaining}{" "}
                  {remaining === 1
                    ? isDone
                      ? "rimasta"
                      : "disponibile"
                    : isDone
                      ? "rimaste"
                      : "disponibili"}
                </span>
                {isDone ? (
                  <button
                    type="button"
                    disabled
                    className="border border-outline text-outline px-3 py-1 rounded-full text-[11px] font-bold opacity-50 cursor-not-allowed shrink-0"
                  >
                    Fatto
                  </button>
                ) : (
                  <Link
                    to="/client/book"
                    className="border border-aura-primary text-aura-primary px-3 py-1 rounded-full text-[11px] font-bold hover:bg-aura-primary/5 active:scale-95 transition shrink-0"
                  >
                    Prenota
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
