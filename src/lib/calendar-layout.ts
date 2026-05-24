// ----------------------------------------------------------------------------
// Pure function di layout per gli eventi sovrapposti in un giorno del
// calendar coach. Estratto da trainer.calendar.tsx — Google Calendar-style
// lane assignment per renderizzare gli eventi side-by-side via CSS calc
// invece di stack invisibile.
// ----------------------------------------------------------------------------

/** Subset structural di un booking richiesto da layoutDay (solo i campi consumati). */
export interface LayoutEventInput {
  id: string;
  scheduled_at: string;
}

/** Posizionamento risultante per un singolo evento dentro un cluster. */
export interface EventPlacement {
  /** Colonna (lane) zero-indexed assegnata all'evento. */
  col: number;
  /** Numero totale di colonne nel cluster (per calcolare CSS width = 100% / cols). */
  cols: number;
}

/**
 * Lane assignment per overlapping events (Google Calendar style):
 *   1. Sort events by start time (ties broken by end time).
 *   2. Walk events; flush un "cluster" ogni volta che il prossimo evento
 *      inizia dopo la fine corrente del cluster. Dentro un cluster, tutti
 *      condividono lo stesso `cols`.
 *   3. Dentro il cluster, assegna ogni evento alla prima lane (col) il cui
 *      ultimo evento finisce <= start del nuovo. Se nessuna disponibile,
 *      crea una nuova lane.
 *
 * Restituisce Map<eventId, EventPlacement> da cui il render layer
 * computa `left = col * (100/cols)%` e `width = (100/cols)%`.
 */
export function layoutDay<T extends LayoutEventInput>(
  events: readonly T[],
  durationMin: (b: T) => number,
): Map<string, EventPlacement> {
  const result = new Map<string, EventPlacement>();
  const withTimes = events
    .map((b) => {
      const start = new Date(b.scheduled_at).getTime();
      return { b, start, end: start + durationMin(b) * 60_000 };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let cluster: typeof withTimes = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const placements: Array<{ id: string; col: number }> = [];
    for (const ev of cluster) {
      let col = laneEnds.findIndex((e) => e <= ev.start);
      if (col === -1) {
        col = laneEnds.length;
        laneEnds.push(ev.end);
      } else {
        laneEnds[col] = ev.end;
      }
      placements.push({ id: ev.b.id, col });
    }
    const cols = laneEnds.length;
    for (const p of placements) result.set(p.id, { col: p.col, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const ev of withTimes) {
    if (ev.start >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.end);
  }
  flush();
  return result;
}
