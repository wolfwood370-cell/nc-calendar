import type { ReactNode } from "react";

export interface FilterChipProps {
  /** Stato selezionato del chip (cambia colori bg/text/border). */
  active: boolean;
  /** Chiamato quando l'utente clicca il chip. */
  onClick: () => void;
  /** Contenuto testuale o JSX del chip. */
  children: ReactNode;
}

/**
 * Pill toggle generica usata nei filtri calendario coach (e potenzialmente
 * altrove). Stato attivo: bg-aura-primary + text-white. Inattivo: bg-white
 * + border outline.
 *
 * Estratto da trainer.calendar.tsx.
 */
export function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-aura-primary text-white border-aura-primary"
          : "bg-white text-on-surface-variant border-surface-variant hover:bg-surface-container"
      }`}
    >
      {children}
    </button>
  );
}
