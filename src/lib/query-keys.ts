// Centralized query-key factory. Existing useQuery call sites still use inline
// arrays — TanStack matches keys by structural equality, so factory-produced
// keys invalidate them correctly. Mutations and any new code should use the
// factory so the scope of an invalidation is explicit.
//
// Why this exists: audit finding H3 — mutations were calling
// invalidateQueries({ queryKey: ["bookings"] }) without parameters, which
// prefix-matches every per-user bookings query in the cache and triggers a
// stampede of unrelated refetches.

export const queryKeys = {
  bookings: {
    root: ["bookings"] as const,
    coach: (coachId: string | null | undefined) => ["bookings", "coach", coachId] as const,
    client: (clientId: string | null | undefined) => ["bookings", "client", clientId] as const,
    unassignedAll: (coachId: string | null | undefined) =>
      ["bookings", "unassigned-all", coachId] as const,
    detail: (bookingId: string | null | undefined) => ["booking-detail", bookingId] as const,
  },
  blocks: {
    root: ["blocks"] as const,
    coach: (coachId: string | null | undefined) => ["blocks", "coach", coachId] as const,
    client: (clientId: string | null | undefined) => ["blocks", "client", clientId] as const,
  },
  extraCredits: {
    root: ["extra_credits"] as const,
    client: (clientId: string | null | undefined) => ["extra_credits", "client", clientId] as const,
  },
  clients: {
    root: ["clients"] as const,
    coach: (coachId: string | null | undefined) => ["clients", coachId] as const,
  },
  eventTypes: {
    root: ["event_types"] as const,
    coach: (coachId: string | null | undefined) => ["event_types", coachId] as const,
  },
  profile: (userId: string | null | undefined) => ["profile", userId] as const,
  trainerAvailability: (coachId: string | null | undefined) =>
    ["trainer_availability", coachId] as const,
  trainerSettings: (coachId: string | null | undefined) => ["trainer_settings", coachId] as const,
  availabilityExceptions: (coachId: string | null | undefined) =>
    ["availability_exceptions", coachId] as const,
} as const;

// Helper: a single mutation that touches a coach↔client booking invalidates
// the same set of caches almost every time. Centralize the list so callers
// never forget one.
import type { QueryClient } from "@tanstack/react-query";

export function invalidateBookingScope(
  qc: QueryClient,
  scope: { coachId: string | null | undefined; clientId: string | null | undefined },
) {
  qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(scope.coachId) });
  qc.invalidateQueries({ queryKey: queryKeys.bookings.client(scope.clientId) });
  qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(scope.coachId) });
  qc.invalidateQueries({ queryKey: queryKeys.blocks.client(scope.clientId) });
  qc.invalidateQueries({ queryKey: queryKeys.extraCredits.client(scope.clientId) });
}
