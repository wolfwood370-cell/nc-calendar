export interface ClientStatusTabsProps<TKey extends string> {
  /** Array di tab da renderizzare: chiave logica + label visibile + count counter. */
  tabs: ReadonlyArray<{ key: TKey; label: string; count: number }>;
  /** Tab attualmente attiva. */
  activeKey: TKey;
  /** Chiamato quando l'utente clicca una tab diversa. */
  onSelect: (key: TKey) => void;
  /**
   * Variante stilistica:
   *   - "compact" (mobile): padding ridotto, container con `-mx-1 px-1` per
   *     allineamento bordo schermo, no hover state sull'inattivo
   *   - "normal"  (desktop): padding standard, hover state sull'inattivo,
   *     container con margin-bottom
   */
  variant?: "compact" | "normal";
  /** Prefix opzionale per le chiavi React (es. "m-" per evitare collisioni quando il parent renderizza entrambe le variant). */
  keyPrefix?: string;
}

/**
 * Pill tabs per filtrare la lista clienti per stato (all / active / expiring /
 * archived / completed). Generica su TKey così riusabile in altre liste con
 * tabs status-like. Estratto da trainer.clients.index.tsx — il rendering
 * era duplicato fra header mobile e header desktop con solo piccole
 * differenze di styling, ora unificato via `variant`.
 */
export function ClientStatusTabs<TKey extends string>({
  tabs,
  activeKey,
  onSelect,
  variant = "normal",
  keyPrefix = "",
}: ClientStatusTabsProps<TKey>) {
  const isCompact = variant === "compact";
  const containerCls = isCompact
    ? "flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
    : "flex gap-2 mb-6 overflow-x-auto pb-1";
  const buttonPad = isCompact ? "shrink-0 px-4 py-2" : "px-4 py-2";
  const inactiveCls = isCompact
    ? "bg-white text-on-surface-variant border border-outline-variant font-medium"
    : "bg-white text-on-surface-variant border border-outline-variant font-medium hover:bg-surface-container-low";

  return (
    <div className={containerCls}>
      {tabs.map((t) => {
        const isActive = activeKey === t.key;
        return (
          <button
            key={`${keyPrefix}${t.key}`}
            onClick={() => onSelect(t.key)}
            className={`${buttonPad} inline-flex items-center gap-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
              isActive ? "bg-aura-primary text-white font-semibold" : inactiveCls
            }`}
          >
            {t.label}
            <span
              className={
                isActive
                  ? "bg-white/20 rounded-full px-2 text-xs tabular-nums"
                  : "text-xs text-outline tabular-nums"
              }
            >
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
