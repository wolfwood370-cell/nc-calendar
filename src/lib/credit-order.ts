// ----------------------------------------------------------------------------
// Ordine dei crediti — lo stesso del server
// ----------------------------------------------------------------------------
// I flussi del coach che restituiscono o scalano un credito dal browser
// (annullare, eliminare, ripristinare, assegnare un evento) devono toccare la
// stessa allocazione che toccherebbe il server. L'ordine è quello di
// validate_booking_block_allocation (consumo) e di reschedule_booking
// (restituzione del credito della vecchia data), entrambe in
// supabase/migrations/20260827143053_4c03121c-40d9-4f2d-8501-15475d9eab70.sql:
//   1. valid_until crescente, le allocazioni senza scadenza in fondo;
//   2. prima la stessa tipologia (event_type_id);
//   3. prima la settimana del blocco in cui cade la sessione;
//   4. poi la settimana più vicina;
//   5. poi l'allocazione creata prima.
// Sono ammesse le allocazioni della stessa tipologia oppure dello stesso
// session_type, come nel WHERE del server. Senza blocco il credito sta negli
// extra_credits della tipologia, per expires_at crescente.
// ----------------------------------------------------------------------------

/** Campi della sessione che decidono quale credito toccare. */
export interface CreditSession {
  block_id: string | null;
  event_type_id: string | null;
  session_type: string;
  scheduled_at: string;
}

/** Riga di block_allocations con i campi dell'ordinamento. */
export interface OrderedAllocation {
  id: string;
  block_id: string;
  event_type_id: string | null;
  session_type: string;
  week_number: number;
  quantity_assigned: number;
  quantity_booked: number;
  valid_until: string | null;
  created_at: string;
}

/** Riga di extra_credits con i campi dell'ordinamento. */
export interface OrderedExtraCredit {
  id: string;
  event_type_id: string | null;
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

const DAY_MS = 86_400_000;

/**
 * Data di calendario a Roma (YYYY-MM-DD), come
 * `(scheduled_at AT TIME ZONE 'Europe/Rome')::date` sul server.
 */
export function romeDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) / DAY_MS;
}

/**
 * Settimana del blocco (1–4) in cui cade la sessione, con la formula del
 * server: LEAST(4, GREATEST(1, FLOOR((data a Roma − inizio blocco) / 7) + 1)).
 */
export function weekInBlock(scheduledAt: string, blockStartDate: string): number {
  const days = dayNumber(romeDate(scheduledAt)) - dayNumber(blockStartDate);
  return Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
}

/** Stessa tipologia, oppure stesso session_type (allocazioni senza tipologia o gemelle). */
function inPool(a: OrderedAllocation, s: CreditSession): boolean {
  const sameType = s.event_type_id !== null && a.event_type_id === s.event_type_id;
  return sameType || a.session_type === s.session_type;
}

function compareServerOrder(
  a: OrderedAllocation,
  b: OrderedAllocation,
  s: CreditSession,
  week: number | null,
): number {
  // 1. valid_until ASC NULLS LAST (date YYYY-MM-DD: il confronto tra stringhe basta).
  if (a.valid_until !== b.valid_until) {
    if (a.valid_until === null) return 1;
    if (b.valid_until === null) return -1;
    return a.valid_until < b.valid_until ? -1 : 1;
  }
  // 2. prima la stessa tipologia.
  const typeRank = (x: OrderedAllocation) =>
    s.event_type_id !== null && x.event_type_id === s.event_type_id ? 0 : 1;
  const byType = typeRank(a) - typeRank(b);
  if (byType !== 0) return byType;
  // 3–4. prima la settimana della sessione, poi la più vicina (senza inizio
  // blocco il server ha una settimana NULL e questi criteri non contano).
  if (week !== null) {
    const byWeek = Number(a.week_number !== week) - Number(b.week_number !== week);
    if (byWeek !== 0) return byWeek;
    const byDistance = Math.abs(a.week_number - week) - Math.abs(b.week_number - week);
    if (byDistance !== 0) return byDistance;
  }
  // 5. created_at ASC.
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function firstInServerOrder(
  candidates: OrderedAllocation[],
  s: CreditSession,
  blockStartDate: string | null,
): OrderedAllocation | null {
  const week = blockStartDate ? weekInBlock(s.scheduled_at, blockStartDate) : null;
  return [...candidates].sort((a, b) => compareServerOrder(a, b, s, week))[0] ?? null;
}

/**
 * Allocazione a cui restituire il credito di una sessione del blocco
 * `s.block_id`: tra quelle con almeno un credito impegnato, la prima
 * nell'ordine del server. null se la sessione non ha blocco o nessuna
 * allocazione ha crediti da restituire.
 */
export function pickRefundAllocation(
  s: CreditSession,
  allocations: readonly OrderedAllocation[],
  blockStartDate: string | null,
): OrderedAllocation | null {
  if (!s.block_id) return null;
  const candidates = allocations.filter(
    (a) => a.block_id === s.block_id && a.quantity_booked > 0 && inPool(a, s),
  );
  return firstInServerOrder(candidates, s, blockStartDate);
}

/**
 * Allocazione da cui scalare il credito di una sessione del blocco
 * `s.block_id`: tra quelle con capienza, la prima nell'ordine del server.
 */
export function pickConsumeAllocation(
  s: CreditSession,
  allocations: readonly OrderedAllocation[],
  blockStartDate: string | null,
): OrderedAllocation | null {
  if (!s.block_id) return null;
  const candidates = allocations.filter(
    (a) => a.block_id === s.block_id && a.quantity_assigned > a.quantity_booked && inPool(a, s),
  );
  return firstInServerOrder(candidates, s, blockStartDate);
}

function byExpiry(credits: OrderedExtraCredit[]): OrderedExtraCredit | null {
  return (
    [...credits].sort(
      (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime(),
    )[0] ?? null
  );
}

/** Credito extra a cui restituire il credito: stessa tipologia, già impegnato, scadenza più vicina. */
export function pickRefundExtraCredit(
  eventTypeId: string | null,
  credits: readonly OrderedExtraCredit[],
): OrderedExtraCredit | null {
  if (!eventTypeId) return null;
  return byExpiry(credits.filter((c) => c.event_type_id === eventTypeId && c.quantity_booked > 0));
}

/** Credito extra da cui scalare: stessa tipologia, con residuo, scadenza più vicina. */
export function pickConsumeExtraCredit(
  eventTypeId: string | null,
  credits: readonly OrderedExtraCredit[],
): OrderedExtraCredit | null {
  if (!eventTypeId) return null;
  return byExpiry(
    credits.filter((c) => c.event_type_id === eventTypeId && c.quantity > c.quantity_booked),
  );
}
