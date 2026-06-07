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

import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { iconForType } from "@/lib/session-type-icon";

export interface SessionTypeBreakdownRow {
  /** Stable key per il map (event_type_id o session_type fallback). */
  key: string;
  /** UUID di event_types.id se presente — usato per il deep-link al
   *  pool picker della /client/book (?eventType=<uuid>). */
  eventTypeId: string | null;
  /** Etichetta visibile (nome dell'event type o fallback session_type). */
  name: string;
  /** Conteggio booking completed dentro la finestra del blocco. */
  completed: number;
  /** Conteggio booking scheduled (prenotati ma non ancora fatti). */
  booked: number;
  /** Totale assegnato dal coach per questa tipologia nel blocco. */
  total: number;
  /** Crediti residui realmente prenotabili: somma di
   *  (quantity_assigned - quantity_booked) sulle allocations di questa
   *  tipologia. Fonte unica con la pagina /client/book per evitare che
   *  la dashboard offra "Prenota" e la pagina booking nasconda il pool
   *  (drift counter). Può essere <0 in caso di drift positivo. */
  remaining: number;
}

interface Props {
  rows: SessionTypeBreakdownRow[];
  /** Totale somma di tutti i `total` — non più reso in UI ma mantenuto
   *  in firma per backward-compat col parent. */
  grandTotal?: number;
  /** Set dei `event_types.name` per cui esiste un booster_pack attivo
   *  (acquistabile dallo store). Se row.name è in questo set e i crediti
   *  sono esauriti, mostriamo un toast che invita ad acquistare il booster
   *  invece di disabilitare silenziosamente il bottone. */
  boosterTitles?: Set<string>;
}

export function ClientSessionsBreakdown({ rows, boosterTitles }: Props) {
  const navigate = useNavigate();
  return (
    // Card esterna Aura: bg-white (#ffffff), 32px radius, border outline-variant,
    // shadow soft. p-5 internal padding.
    <div className="bg-surface-container-lowest rounded-[32px] p-5 border border-outline-variant shadow-sm">
      {/* Header — solo title (sub-text rimosso per risparmiare spazio) */}
      <h3 className="text-base font-bold text-on-surface mb-4">Le tue Sessioni</h3>

      {/* Lista righe — flat, separator sottile bottom (skip last) */}
      <div className="flex flex-col w-full">
        {rows.map((row, idx) => {
          const used = row.completed + row.booked;
          // Lo stato del bottone è derivato dalla STESSA fonte di /client/book
          // (allocation.quantity_assigned - quantity_booked) per evitare la
          // divergenza dashboard↔booking. Tre stati:
          //   1) used >= total → "Fatto" (tutto completato/prenotato)
          //   2) remaining <= 0 (drift counter o booster già consumato) →
          //      "Esauriti": se esiste booster_pack per questa tipologia,
          //      click suggerisce l'acquisto; altrimenti disabilitato.
          //   3) altrimenti → "Prenota" link normale.
          const isDone = used >= row.total && row.total > 0;
          const isOutOfCredits = !isDone && row.remaining <= 0 && row.total > 0;
          const hasBooster = isOutOfCredits && !!boosterTitles?.has(row.name);
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

              {/* Colonna 3: Bottone Prenota / Esauriti / Fatto */}
              <div className="shrink-0">
                {isDone ? (
                  <button
                    type="button"
                    disabled
                    className="border border-outline text-outline text-xs font-bold rounded-full px-4 py-1.5 opacity-50 cursor-not-allowed whitespace-nowrap"
                  >
                    Fatto
                  </button>
                ) : isOutOfCredits && hasBooster ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.info("Crediti esauriti per questa tipologia", {
                        description: "Acquista un Booster nello Store per prenotare ancora.",
                        action: {
                          label: "Vai allo Store",
                          onClick: () => navigate({ to: "/client/store" }),
                        },
                      });
                    }}
                    className="border border-aura-primary text-aura-primary text-xs font-bold rounded-full px-4 py-1.5 transition-all hover:bg-aura-primary/5 active:scale-95 whitespace-nowrap"
                  >
                    Esauriti
                  </button>
                ) : isOutOfCredits ? (
                  <button
                    type="button"
                    disabled
                    className="border border-outline text-outline text-xs font-bold rounded-full px-4 py-1.5 opacity-50 cursor-not-allowed whitespace-nowrap"
                    title="Crediti esauriti per questa tipologia"
                  >
                    Esauriti
                  </button>
                ) : (
                  <Link
                    to="/client/book"
                    // Deep-link: passiamo eventTypeId via search param così
                    // la pagina di prenotazione pre-seleziona il pool della
                    // tipologia cliccata. Fallback graceful al primo pool
                    // disponibile se eventTypeId è null (es. allocations
                    // legacy senza event_type_id) o non matcha nessun pool.
                    search={row.eventTypeId ? { eventType: row.eventTypeId } : undefined}
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
