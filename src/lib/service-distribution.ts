// ----------------------------------------------------------------------------
// «Distribuzione servizi» della Panoramica
// ----------------------------------------------------------------------------
// Sessioni cliente per tipologia dal 1° gennaio (ora di Roma) a oggi: solo
// sessioni con cliente (non impegni personali, non eventi da assegnare, non
// il coach come cliente), già iniziate, svolte, assenti o ancora da
// confermare; fuori le annullate (anche tardi) e le eliminate. Le prenotazioni
// dei prossimi giorni non contano: il prototipo mostra il consuntivo
// dell'anno (ytd in nc-store.js).
// Se la query delle sessioni è stata tagliata (useCoachBookings ne carica al
// più BOOKINGS_FETCH_LIMIT, le più recenti) e non arriva al 1° gennaio, il
// conteggio parte dalla sessione più vecchia caricata e lo dice.
// ----------------------------------------------------------------------------

import { romeDate } from "@/lib/credit-order";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import { shortDateWithArticle } from "@/lib/session-time";
import { isClientSession, type AgendaBooking } from "@/lib/today-agenda";

const COUNTED_STATUSES = ["completed", "no_show", "scheduled"];

export interface DistributionBooking extends AgendaBooking {
  event_type_id: string | null;
  session_type: SessionType;
}

export interface DistributionType {
  id: string;
  name: string;
  color: string;
}

export interface DistributionItem {
  key: string;
  name: string;
  color: string;
  count: number;
  /** Percentuale intera, per la legenda. */
  pct: number;
  /** Larghezza del segmento in percentuale, senza arrotondare. */
  share: number;
}

export interface ServiceDistribution {
  items: DistributionItem[];
  total: number;
  /** null = dal 1° gennaio; altrimenti la data da cui partono i dati caricati. */
  since: Date | null;
}

/** Colore di riserva per le sessioni senza tipologia. */
export const FALLBACK_TYPE_COLOR = "var(--color-aura-primary)";

export function getServiceDistribution(
  bookings: readonly DistributionBooking[],
  types: readonly DistributionType[],
  now: Date,
  opts: { truncated?: boolean } = {},
): ServiceDistribution {
  const nowMs = now.getTime();
  const yearStart = `${romeDate(now.toISOString()).slice(0, 4)}-01-01`;
  let since: Date | null = null;
  let sinceMs = -Infinity;
  if (opts.truncated && bookings.length > 0) {
    const oldest = Math.min(...bookings.map((b) => new Date(b.scheduled_at).getTime()));
    if (romeDate(new Date(oldest).toISOString()) > yearStart) {
      since = new Date(oldest);
      sinceMs = oldest;
    }
  }
  const typeById = new Map(types.map((t) => [t.id, t]));
  const byKey = new Map<string, { name: string; color: string; count: number }>();
  let total = 0;
  for (const b of bookings) {
    if (!isClientSession(b) || b.deleted_at || !COUNTED_STATUSES.includes(b.status)) continue;
    const t = new Date(b.scheduled_at).getTime();
    if (t > nowMs || t < sinceMs || romeDate(b.scheduled_at) < yearStart) continue;
    const type = b.event_type_id ? typeById.get(b.event_type_id) : undefined;
    const key = type?.id ?? `st:${b.session_type}`;
    const row = byKey.get(key) ?? {
      name: type?.name ?? sessionLabel(b.session_type),
      color: type?.color ?? FALLBACK_TYPE_COLOR,
      count: 0,
    };
    row.count += 1;
    byKey.set(key, row);
    total += 1;
  }
  const items = [...byKey.entries()]
    .map(([key, r]) => ({
      key,
      name: r.name,
      color: r.color,
      count: r.count,
      pct: total ? Math.round((r.count / total) * 100) : 0,
      share: total ? (r.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "it"));
  return { items, total, since };
}

/** «Dal 1° gennaio · 458 sessioni»; con i dati tagliati «Dall'8 mar 2026 · …». */
export function formatDistributionLabel(d: Pick<ServiceDistribution, "total" | "since">): string {
  const from = d.since ? shortDateWithArticle(d.since, "da") : "dal 1° gennaio";
  const count = d.total === 1 ? "1 sessione" : `${d.total} sessioni`;
  return `${from.charAt(0).toUpperCase()}${from.slice(1)} · ${count}`;
}
