// ----------------------------------------------------------------------------
// ClientSessionsBreakdown — nested card "Le tue Sessioni" del blocco corrente.
// ----------------------------------------------------------------------------
// Layout flat a 3 colonne `[1fr_auto_auto]` con separatori sottili tra
// righe (mockup Stitch v3). Colonna 1 fluida con truncate per evitare
// overflow orizzontale su qualunque mobile; colonne 2 e 3 con `shrink-0`
// + `whitespace-nowrap` per il badge e il bottone Prenota.
//
// Pattern anti-overflow: l'unica colonna che si stringe è la #1 (nome
// tipologia). Quando il nome è troppo lungo viene troncato con `…`,
// non c'è scroll orizzontale né wrap a capo, e badge/bottone restano
// sempre completi alla loro larghezza naturale.
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
  /** Totale somma di tutti i `total` — non più reso in UI ma mantenuto
   *  in firma per backward-compat col parent. */
  grandTotal?: number;
}

export function ClientSessionsBreakdown({ rows }: Props) {
  return (
    // Card esterna Aura: bg-white (#ffffff), 32px radius, border outline-variant,
    // shadow soft. p-5 internal padding.
    <div className="bg-surface-container-lowest rounded-[32px] p-5 border border-outline-variant shadow-sm">
      {/* Header — title sx, sub-text dx (mockup v3) */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-base font-bold text-on-surface truncate">Le tue Sessioni</h3>
        <span className="text-xs font-medium text-on-surface-variant whitespace-nowrap shrink-0">
          Pianifica i tuoi appuntamenti
        </span>
      </div>

      {/* Lista righe — flat, separator sottile bottom (skip last) */}
      <div className="flex flex-col w-full">
        {rows.map((row, idx) => {
          const used = row.completed + row.booked;
          const isDone = used >= row.total && row.total > 0;
          const Icon = iconForType(row.name);
          const isLast = idx === rows.length - 1;

          return (
            <div
              key={row.key}
              className={
                "grid grid-cols-[1fr_auto_auto] items-center gap-3 w-full py-3 " +
                (isLast ? "" : "border-b border-surface-container")
              }
            >
              {/* Colonna 1: Icona + Nome (FLUIDA, truncate safe) */}
              <div className="min-w-0 flex items-center gap-2">
                <Icon className="size-5 text-aura-primary shrink-0" aria-hidden />
                <span className="text-sm font-bold text-on-surface truncate">{row.name}</span>
              </div>

              {/* Colonna 2: Badge "X / Y" — bg navy/5 + text navy */}
              <div className="shrink-0">
                <span className="inline-block bg-aura-primary/5 text-aura-primary text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap tabular-nums">
                  {used} / {row.total}
                </span>
              </div>

              {/* Colonna 3: Bottone Prenota pill (disabled se done) */}
              <div className="shrink-0">
                {isDone ? (
                  <button
                    type="button"
                    disabled
                    className="border border-outline text-outline text-xs font-bold rounded-full px-4 py-1.5 opacity-50 cursor-not-allowed whitespace-nowrap"
                  >
                    Fatto
                  </button>
                ) : (
                  <Link
                    to="/client/book"
                    className="border border-aura-primary text-aura-primary text-xs font-bold rounded-full px-4 py-1.5 transition-all hover:bg-aura-primary/5 active:scale-95 whitespace-nowrap"
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
