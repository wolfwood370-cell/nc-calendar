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
    <div className="bg-surface-container-lowest rounded-[24px] p-5 border border-outline-variant/30 shadow-[0_4px_20px_rgba(0,0,0,0.03)] overflow-x-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 min-w-max mb-4">
        <div className="flex flex-col">
          <h3 className="text-base font-semibold text-on-surface">Le tue Sessioni</h3>
          <p className="text-[11px] text-on-surface-variant">
            Pianifica i tuoi appuntamenti
          </p>
        </div>
        <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
          {grandTotal} {grandTotal === 1 ? "Totale" : "Totali"}
        </span>
      </div>

      {/* Lista righe */}
      <div className="flex flex-col gap-3 w-full min-w-[500px]">
        {rows.map((row) => {
          const used = row.completed + row.booked;
          const remaining = Math.max(0, row.total - used);
          const pct = row.total > 0 ? Math.min(100, (used / row.total) * 100) : 0;
          const Icon = iconForType(row.name);
          const isDone = remaining === 0;

          return (
            <div
              key={row.key}
              className="grid grid-cols-[180px_1fr_auto] items-center gap-4 w-full py-1"
            >
              {/* Colonna 1: Icona + Nome (180px fissi, truncate safe) */}
              <div className="flex items-center gap-3 min-w-[180px] max-w-[180px]">
                <div className="size-9 rounded-full bg-aura-primary/5 flex items-center justify-center text-aura-primary shrink-0">
                  <Icon className="size-4" aria-hidden />
                </div>
                <span className="text-sm font-semibold text-on-surface truncate">
                  {row.name}
                </span>
              </div>

              {/* Colonna 2: Progress bar (fluida, prende lo spazio centrale) */}
              <div className="w-full px-2">
                <div className="w-full bg-aura-primary/10 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-aura-primary h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Colonna 3: Badge + Azione (ancorate a destra) */}
              <div className="flex items-center gap-2 justify-end min-w-[140px] shrink-0">
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
