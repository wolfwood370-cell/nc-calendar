// ----------------------------------------------------------------------------
// BiaSparkline — grafico linea misurazioni BIA (design handoff)
// ----------------------------------------------------------------------------
// Geometria del prototipo (Client Dashboard): viewBox 330×120, padding 8/14,
// area riempita 8%, polyline 2.5, punti r=3.5. Condiviso tra la card cliente
// "I tuoi progressi" e il pannello coach "Andamento BIA".
// ----------------------------------------------------------------------------

import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { BiaMeasurement } from "@/hooks/use-bia";

export const BIA_METRICS = {
  weight: { label: "Peso", unit: "kg", color: "#003e62" },
  muscle: { label: "Massa", unit: "kg", color: "#0b8043" },
  fat: { label: "Grasso", unit: "%", color: "#ea580c" },
} as const;

export type BiaMetricKey = keyof typeof BIA_METRICS;

export function biaValue(m: BiaMeasurement, metric: BiaMetricKey): number {
  return metric === "weight" ? m.weight_kg : metric === "muscle" ? m.muscle_kg : m.fat_pct;
}

export function biaMonthLabel(isoDate: string): string {
  const label = format(new Date(`${isoDate}T00:00:00`), "MMM", { locale: it });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

const W = 330;
const H = 120;
const PX = 8;
const PY = 14;

/** Override opzionale per metrica: il mock coach usa etichette/colori
 *  leggermente diversi dal mock cliente (es. "Massa magra" #039BE5). */
export type BiaMetricsOverride = Partial<
  Record<BiaMetricKey, { label: string; unit: string; color: string }>
>;

function metricDef(k: BiaMetricKey, override?: BiaMetricsOverride) {
  return override?.[k] ?? BIA_METRICS[k];
}

/** Toggle pill Peso/Massa/Grasso, condiviso tra le due card. */
export function BiaMetricToggle({
  metric,
  onChange,
  metricsOverride,
}: {
  metric: BiaMetricKey;
  onChange: (m: BiaMetricKey) => void;
  metricsOverride?: BiaMetricsOverride;
}) {
  return (
    <div className="flex gap-1">
      {(Object.keys(BIA_METRICS) as BiaMetricKey[]).map((k) => {
        const on = k === metric;
        const M = metricDef(k, metricsOverride);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            aria-pressed={on}
            className="text-[11px] font-semibold px-2.5 py-[5px] rounded-full border transition-colors"
            style={
              on
                ? { borderColor: M.color, background: M.color, color: "#fff" }
                : { borderColor: "#c1c7d0", background: "#fff", color: "#41474f" }
            }
          >
            {M.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Valore hero + delta + sparkline + etichette mese. `measurements` deve
 * essere in ordine cronologico crescente (la query use-bia lo garantisce).
 */
export function BiaSparkline({
  measurements,
  metric,
  onPointClick,
  metricsOverride,
  deltaLabel = "from-first",
}: {
  measurements: BiaMeasurement[];
  metric: BiaMetricKey;
  /** Opzionale (pannello coach): clic su punto/etichetta per modificare. */
  onPointClick?: (m: BiaMeasurement) => void;
  metricsOverride?: BiaMetricsOverride;
  /** "from-first" → "da {mese}" (mock cliente); "total" → "totale" (mock coach). */
  deltaLabel?: "from-first" | "total";
}) {
  const M = metricDef(metric, metricsOverride);
  const values = measurements.map((p) => biaValue(p, metric));
  if (values.length === 0) {
    return <p className="text-sm text-outline m-0">Nessuna misurazione ancora.</p>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PX + (i * (W - 2 * PX)) / Math.max(1, values.length - 1);
  const y = (v: number) => PY + (1 - (v - min) / span) * (H - 2 * PY);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${x(0).toFixed(1)},${H} ${pts} ${x(values.length - 1).toFixed(1)},${H}`;
  const last = values[values.length - 1] ?? 0;
  const delta = +(last - (values[0] ?? 0)).toFixed(1);
  const good = metric === "muscle" ? delta >= 0 : delta <= 0;

  return (
    <div>
      <div className="flex items-baseline gap-2.5 mb-2">
        <span className="tabular-nums font-display text-[30px] font-bold text-on-surface">
          {last}
          <span className="text-sm text-outline font-medium"> {M.unit}</span>
        </span>
        <span
          className={`tabular-nums text-[13px] font-semibold ${
            good ? "text-success-strong" : "text-error-strong"
          }`}
        >
          {delta > 0 ? "+" : ""}
          {delta} {M.unit}{" "}
          {deltaLabel === "total"
            ? "totale"
            : `da ${biaMonthLabel(measurements[0]?.measured_on ?? "")}`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="block"
        role="img"
        aria-label={`Andamento ${M.label}`}
      >
        <polygon points={area} fill={M.color} opacity="0.08" />
        <polyline
          points={pts}
          fill="none"
          stroke={M.color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.map((v, i) => {
          const m = measurements[i];
          return (
            <circle
              key={m?.id ?? i}
              cx={x(i).toFixed(1)}
              cy={y(v).toFixed(1)}
              r="3.5"
              fill="#fff"
              stroke={M.color}
              strokeWidth="2"
              style={onPointClick ? { cursor: "pointer" } : undefined}
              onClick={m && onPointClick ? () => onPointClick(m) : undefined}
            >
              <title>
                {biaMonthLabel(m?.measured_on ?? "")}: {v} {M.unit}
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="flex justify-between mt-1.5 text-[10px] text-outline">
        {measurements.map((p) =>
          onPointClick ? (
            <button
              key={p.id}
              type="button"
              className="hover:text-on-surface hover:underline"
              onClick={() => onPointClick(p)}
            >
              {biaMonthLabel(p.measured_on)}
            </button>
          ) : (
            <span key={p.id}>{biaMonthLabel(p.measured_on)}</span>
          ),
        )}
      </div>
    </div>
  );
}
