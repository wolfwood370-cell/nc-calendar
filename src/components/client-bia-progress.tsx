// ----------------------------------------------------------------------------
// ClientBiaProgress — card "I tuoi progressi" (design handoff, Client Dashboard)
// ----------------------------------------------------------------------------
// Toggle Peso/Massa/Grasso + sparkline (vedi bia-sparkline.tsx). Delta vs la
// PRIMA misurazione; i dati li inserisce il coach (use-bia, realtime).
// ----------------------------------------------------------------------------

import { useState } from "react";
import { useBiaMeasurements } from "@/hooks/use-bia";
import { BiaMetricToggle, BiaSparkline, type BiaMetricKey } from "@/components/bia-sparkline";

export function ClientBiaProgress({ clientId }: { clientId: string | null | undefined }) {
  const [metric, setMetric] = useState<BiaMetricKey>("weight");
  const { data: measurements = [] } = useBiaMeasurements(clientId);

  return (
    <section className="bg-surface-container-lowest rounded-card-mobile shadow-soft-card border border-outline-variant/30 p-8 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-on-surface m-0">I tuoi progressi</h3>
        <BiaMetricToggle metric={metric} onChange={setMetric} />
      </div>
      <BiaSparkline measurements={measurements} metric={metric} />
      <p className="text-xs text-outline text-center m-0">
        Misurazioni BIA registrate dal tuo coach.
      </p>
    </section>
  );
}
