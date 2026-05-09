/**
 * Store reattivo minimale sopra i dati mock per consentire mutazioni
 * (cancellazioni, no-show, nuove prenotazioni online) senza backend reale.
 */
import { useSyncExternalStore } from "react";
import { blocks as initialBlocks, bookings as initialBookings, type Booking, type BookingStatus, type SessionType, type TrainingBlock } from "@/lib/mock-data";

interface State {
  bookings: Booking[];
  blocks: TrainingBlock[];
}

let state: State = {
  bookings: initialBookings.map((b) => ({ ...b })),
  blocks: initialBlocks.map((b) => ({ ...b, allocations: b.allocations.map((a) => ({ ...a })) })),
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function useStoreBookings(): Booking[] {
  return useSyncExternalStore(subscribe, () => state.bookings, () => state.bookings);
}

export function useStoreBlocks(): TrainingBlock[] {
  return useSyncExternalStore(subscribe, () => state.blocks, () => state.blocks);
}

function mutate(next: Partial<State>) {
  state = { ...state, ...next };
  emit();
}

function adjustAllocation(clientId: string, type: SessionType, delta: number) {
  const blocks = state.blocks.map((b) => {
    if (b.client_id !== clientId || b.status !== "active") return b;
    let applied = false;
    const allocations = b.allocations.map((a) => {
      if (applied) return a;
      if (a.session_type !== type) return a;
      if (delta < 0 && a.quantity_booked <= 0) return a;
      applied = true;
      return { ...a, quantity_booked: Math.max(0, a.quantity_booked + delta) };
    });
    return { ...b, allocations };
  });
  mutate({ blocks });
}

export function addBooking(input: { clientId: string; type: SessionType; scheduledAt: string; meetingLink?: string | null }): Booking {
  const booking: Booking = {
    id: `bk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    client_id: input.clientId,
    session_type: input.type,
    scheduled_at: input.scheduledAt,
    status: "scheduled",
    meeting_link: input.meetingLink ?? null,
  };
  mutate({ bookings: [...state.bookings, booking] });
  adjustAllocation(input.clientId, input.type, +1);
  return booking;
}

export function cancelBooking(id: string, opts: { late: boolean }): void {
  const b = state.bookings.find((x) => x.id === id);
  if (!b) return;
  const newStatus: BookingStatus = opts.late ? "late_cancelled" : "cancelled";
  mutate({
    bookings: state.bookings.map((x) => (x.id === id ? { ...x, status: newStatus } : x)),
  });
  if (!opts.late) {
    // restituisce il credito
    adjustAllocation(b.client_id, b.session_type, -1);
  }
}

export function markNoShow(id: string): void {
  const b = state.bookings.find((x) => x.id === id);
  if (!b) return;
  mutate({
    bookings: state.bookings.map((x) => (x.id === id ? { ...x, status: "no_show" } : x)),
  });
  // il credito resta consumato
}
