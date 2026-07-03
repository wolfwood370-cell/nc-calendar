// ----------------------------------------------------------------------------
// ClientBiaProgress — card "I tuoi progressi" (design handoff, Client Dashboard)
// ----------------------------------------------------------------------------
// Toggle Peso/Massa/Grasso + sparkline SVG pura (stessa geometria del
// prototipo: viewBox 330×120, padding 8/14, area 8% + polyline 2.5 + punti).
// Delta calcolato vs la PRIMA misurazione; verde se il trend è "buono" per
// la metrica (massa su, peso/grasso giù). Dati dal coach via use-bia.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useBiaMeasurements } from "@/hooks/use-bia";

const METRICS = {
  weight: { label: "Peso", unit: "kg", color: "#003e62" },
  muscle: { label: "Massa", unit: "kg", color: "#0b8043" },
  fat: { label: "Grasso", unit: "%", color: "#ea580c" },
} as const;

type MetricKey = keyof typeof METRICS;

const W = 330;
const H = 120;
const PX = 8;
const PY = 14;

function monthLabel(isoDate: string): string {
  const label = format(new Date(`${isoDate}T00:00:00`), "MMM", { locale: it });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
}

export function ClientBiaProgress({ clientId }: { clientId: string | null | undefined }) {
  const [metric, setMetric] = useState<MetricKey>("weight");
  const { data: measurements = [] } = useBiaMeasurements(clientId);

  const M = METRICS[metric];
  const values = measurements.map((p) =>
    metric === "weight" ? p.weight_kg : metric === "muscle" ? p.muscle_kg : p.fat_pct,
  );

  let body: React.ReactNode;
  if (values.length === 0) {
    body = <p className="text-sm text-outline m-0">Nessuna misurazione ancora.</p>;
  } else {
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

    body = (
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
            {delta} {M.unit} da {monthLabel(measurements[0]?.measured_on ?? "")}
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
          {values.map((v, i) => (
            <circle
              key={measurements[i]?.id ?? i}
              cx={x(i).toFixed(1)}
              cy={y(v).toFixed(1)}
              r="3.5"
              fill="#fff"
              stroke={M.color}
              strokeWidth="2"
            >
              <title>
                {monthLabel(measurements[i]?.measured_on ?? "")}: {v} {M.unit}
              </title>
            </circle>
          ))}
        </svg>
        <div className="flex justify-between mt-1.5 text-[10px] text-outline">
          {measurements.map((p) => (
            <span key={p.id}>{monthLabel(p.measured_on)}</span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="bg-surface-container-lowest rounded-card-mobile shadow-soft-card border border-outline-variant/30 p-8 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-on-surface m-0">I tuoi progressi</h3>
        <div className="flex gap-1">
          {(Object.keys(METRICS) as MetricKey[]).map((k) => {
            const on = k === metric;
            const Mk = METRICS[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMetric(k)}
                aria-pressed={on}
                className="text-[11px] font-semibold px-2.5 py-[5px] rounded-full border transition-colors"
                style={
                  on
                    ? { borderColor: Mk.color, background: Mk.color, color: "#fff" }
                    : { borderColor: "#c1c7d0", background: "#fff", color: "#41474f" }
                }
              >
                {Mk.label}
              </button>
            );
          })}
        </div>
      </div>
      {body}
      <p className="text-xs text-outline text-center m-0">
        Misurazioni BIA registrate dal tuo coach.
      </p>
    </section>
  );
}
