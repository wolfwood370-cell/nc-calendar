// ----------------------------------------------------------------------------
// I progressi della Home (lato cliente, passata 05)
// ----------------------------------------------------------------------------
// HomeProgressCard: le misurazioni BIA, solo con almeno due (progressModel è
// null con meno, e la card non c'è). Il segmentato «Misura» (Peso, Massa
// magra, Grasso) è un radiogroup con un solo punto di Tab, frecce, Home ed
// End (SegmentedControl, segmentKeyTarget); sotto il valore dell'ultima
// misurazione con la variazione dalla prima, il grafico a linea e le date
// agli estremi. Numeri, punti e testi vengono da client-home.ts; i colori
// sono token.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import type { BookCoach } from "@/lib/client-book";
import {
  PROGRESS_METRICS,
  progressModel,
  progressNote,
  type ProgressMeasurement,
  type ProgressMetric,
} from "@/lib/client-home";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-outline-variant/35 bg-white shadow-soft-card";

const METRIC_OPTIONS = PROGRESS_METRICS.map((m) => ({ value: m.key, label: m.label }));

export interface HomeProgressCardProps {
  /** useBiaMeasurements: in ordine di data. */
  measurements: readonly ProgressMeasurement[];
  coach: BookCoach;
}

export function HomeProgressCard({ measurements, coach }: HomeProgressCardProps) {
  const [metric, setMetric] = useState<ProgressMetric>("weight");
  const model = progressModel(measurements, metric);
  if (!model) return null;

  return (
    <section aria-label="I tuoi progressi" className={cn(CARD, "flex flex-col gap-3.5 p-[18px]")}>
      <h2 tabIndex={-1} className="font-sans text-[17px] font-bold tracking-normal">
        I tuoi progressi
      </h2>
      <SegmentedControl
        appearance="plain"
        ariaLabel="Misura"
        value={metric}
        onChange={setMetric}
        options={METRIC_OPTIONS}
        className="grid grid-cols-3 gap-1 rounded-full bg-surface-container-low p-1"
        itemClassName={(checked) =>
          cn(
            "h-11 rounded-full text-sm font-bold transition-colors",
            checked
              ? "bg-white text-aura-primary shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
              : "text-on-surface-variant",
          )
        }
      />
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="font-display text-[30px] font-bold tabular-nums">{model.value}</span>
        <span className="text-sm text-on-surface-variant">{model.delta}</span>
      </div>
      <svg
        viewBox="0 0 320 100"
        className="h-24 w-full overflow-visible"
        role="img"
        aria-label={model.aria}
      >
        <line
          x1="0"
          y1="92"
          x2="320"
          y2="92"
          stroke="var(--color-surface-container)"
          strokeWidth="1"
        />
        <polyline
          points={model.points}
          fill="none"
          stroke="var(--color-primary-container)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={model.last.x}
          cy={model.last.y}
          r="4.5"
          fill="var(--color-surface-container-lowest)"
          stroke="var(--color-primary-container)"
          strokeWidth="2.5"
        />
      </svg>
      <div className="flex justify-between gap-2 text-xs text-on-surface-variant">
        <span>{model.firstDay}</span>
        <span>{model.lastDay}</span>
      </div>
      <p className="text-[13px] text-on-surface-variant">{progressNote(coach)}</p>
    </section>
  );
}
