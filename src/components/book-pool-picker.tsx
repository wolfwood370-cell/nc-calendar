/** Subset structural del pool richiesto dal picker (label visibile + counter residuo). */
export interface BookPoolForPicker {
  key: string;
  label: string;
  remaining: number;
}

export interface BookPoolPickerProps {
  /** Lista pool crediti da mostrare come pill scrollabili. Vuoto = stato "nessun credito". */
  pools: readonly BookPoolForPicker[];
  /** Chiave del pool attualmente selezionato (null = nessuno). */
  selectedPoolKey: string | null;
  /** Chiamato quando l'utente clicca una pill diversa. */
  onSelectPoolKey: (key: string) => void;
}

/**
 * Header "Seleziona la tipologia" + lista orizzontale di pill cliccabili
 * (una per pool credito). Stato attivo evidenziato in primary-container.
 * Counter residuo a destra del label. Estratto da client.book.tsx.
 */
export function BookPoolPicker({ pools, selectedPoolKey, onSelectPoolKey }: BookPoolPickerProps) {
  return (
    <section>
      <h2 className="font-semibold text-lg text-on-surface mb-stack-sm">
        Seleziona la tipologia
      </h2>
      {pools.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          Nessun credito residuo nel blocco attivo.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label="Tipo di sessione"
          className="flex overflow-x-auto gap-3 pb-2 -mx-margin-mobile px-margin-mobile [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {pools.map((p) => {
            const active = p.key === selectedPoolKey;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelectPoolKey(p.key)}
                className={`flex-shrink-0 rounded-full px-6 py-3 text-sm font-semibold whitespace-nowrap transition-transform active:scale-95 ${
                  active
                    ? "bg-primary-container text-on-primary"
                    : "bg-transparent border border-outline-variant text-on-surface"
                }`}
              >
                {p.label}
                <span
                  className={`ml-2 text-xs ${active ? "text-on-primary/80" : "text-on-surface-variant"}`}
                >
                  {p.remaining}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
