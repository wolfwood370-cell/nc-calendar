import type { ComponentType } from "react";

const GLASS = "bg-white/60 backdrop-blur-xl border border-white/40";

export interface QuickStatProps {
  /** Componente icona (lucide o custom) da renderizzare in alto al center. */
  icon: ComponentType<{ className?: string }>;
  /** Label uppercase tracking-wider sotto l'icona. */
  label: string;
  /** Valore numerico mostrato in display-font 4xl. */
  value: number;
}

/**
 * Tile statistica compatta per la dashboard coach: icona + label + valore.
 * Glass background + ombra soft. Estratto da trainer.index.tsx.
 */
export function QuickStat({ icon: Icon, label, value }: QuickStatProps) {
  return (
    <div
      className={`${GLASS} p-6 rounded-[32px] shadow-soft-card flex flex-col items-center justify-center text-center`}
    >
      <Icon className="size-7 text-aura-primary mb-2" />
      <p className="text-xs uppercase tracking-wider text-on-surface-variant mb-1 font-semibold">
        {label}
      </p>
      <p className="font-display text-4xl font-bold text-on-background tabular-nums">{value}</p>
    </div>
  );
}
