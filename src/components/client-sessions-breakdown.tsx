// ----------------------------------------------------------------------------
// ClientSessionsBreakdown — nested card "Le tue Sessioni" del blocco corrente.
// ----------------------------------------------------------------------------
// Layout mobile-first 2-colonne di tile compatte (iOS widget-style).
// Sostituisce il vecchio layout 3-colonne orizzontali che andava in
// overflow su mobile (anche iPhone 15 Pro Max al breakpoint stretto).
//
// Ogni tile (h-[170px]) ha 3 slot verticali:
//   1. TOP    — icona in cerchio + titolo tipologia (truncate)
//   2. MIDDLE — AuraProgressRing size 56 con readout = "rimaste / totale"
//   3. BOTTOM — CTA full-width pill "Prenota" / "Fatto" (disabled)
//
// Grid container:
//   - <640px:  2 colonne (mobile portrait → 2 tile per riga)
//   - ≥768px:  3 colonne (tablet+ → 3 tile per riga)
// Le tile sono auto-aligned via flex-col + justify-between, quindi il
// CTA è SEMPRE alla stessa altezza Y in fondo alla card. La height fissa
// 170px previene il layout shift quando il nome tipologia va a capo.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { iconForType } from "@/lib/session-type-icon";
import { AuraProgressRing } from "@/components/ui/aura-progress-ring";

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
    // Wrapper card esterna: 32px radius + outline-variant border + shadow soft.
    <div className="bg-surface-container-lowest rounded-[32px] p-6 border border-outline-variant shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex flex-col min-w-0">
          <h3 className="text-base font-semibold text-on-surface truncate">Le tue Sessioni</h3>
          <p className="text-[11px] text-on-surface-variant truncate">
            Pianifica i tuoi appuntamenti
          </p>
        </div>
        <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0">
          {grandTotal} {grandTotal === 1 ? "Totale" : "Totali"}
        </span>
      </div>

      {/* Grid tile: 2-col mobile, 3-col su tablet+. gap-3 mantiene
          respiro senza forzare overflow. */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full">
        {rows.map((row) => {
          const used = row.completed + row.booked;
          const remaining = Math.max(0, row.total - used);
          const Icon = iconForType(row.name);
          const isDone = remaining === 0;

          return (
            <div
              key={row.key}
              className="bg-surface-container-lowest rounded-3xl border border-outline-variant/60 p-4 flex flex-col justify-between h-[170px] shadow-sm"
            >
              {/* Top: icona + titolo (truncate w-full evita 3-line wrap) */}
              <div className="flex flex-col gap-2 min-w-0">
                <div className="size-8 rounded-full bg-aura-primary/5 text-aura-primary flex items-center justify-center shrink-0">
                  <Icon className="size-4" aria-hidden />
                </div>
                <span className="text-sm font-bold text-on-surface truncate w-full">
                  {row.name}
                </span>
              </div>

              {/* Middle: ring con readout "rimaste" centrato. Color va in
                  alert (rosso soft) quando remaining ≤ 2 automatico via
                  lowThreshold di AuraProgressRing. */}
              <div className="flex justify-center -my-1">
                <AuraProgressRing
                  used={used}
                  total={row.total}
                  size={56}
                  strokeWidth={6}
                  label={`${remaining}`}
                />
              </div>

              {/* Bottom: CTA pill full-width */}
              {isDone ? (
                <button
                  type="button"
                  disabled
                  className="w-full rounded-full py-1.5 text-xs font-bold text-center border border-outline text-outline opacity-50 cursor-not-allowed"
                >
                  Fatto
                </button>
              ) : (
                <Link
                  to="/client/book"
                  className="w-full rounded-full py-1.5 text-xs font-bold transition-all text-center border border-aura-primary text-aura-primary hover:bg-aura-primary/5 active:scale-95"
                >
                  Prenota
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
