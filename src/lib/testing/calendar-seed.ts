// Dati di prova dei test del Calendario (passata 04): ora fissa venerdì
// 25/09/2026 alle 10:40 di Roma, come nell'handoff.
import type { MemDb } from "@/lib/testing/memory-calendar-store";

export const NOW = new Date("2026-09-25T10:40:00+02:00");
export const COACH = "coach";

export const TYPES = {
  pt: {
    id: "pt",
    name: "Personal Training",
    duration: 60,
    buffer_minutes: 0,
    base_type: "PT Session" as const,
  },
  bia: {
    id: "bia",
    name: "Misurazione BIA",
    duration: 30,
    buffer_minutes: 0,
    base_type: "BIA" as const,
  },
  test: {
    id: "test",
    name: "Test funzionale",
    duration: 45,
    buffer_minutes: 15,
    base_type: "Functional Test" as const,
  },
};

/** Ora di Roma → ISO. */
export const at = (date: string, hhmm: string) =>
  new Date(`${date}T${hhmm}:00+02:00`).toISOString();

const alloc = (
  id: string,
  block_id: string,
  event_type_id: string,
  session_type: string,
  week_number: number,
  assigned: number,
  booked: number,
  created_at = "2026-09-01T09:00:00Z",
) => ({
  id,
  block_id,
  event_type_id,
  session_type,
  week_number,
  quantity_assigned: assigned,
  quantity_booked: booked,
  valid_until: null,
  created_at,
});

/**
 * Marta: blocco 1 dal 21/09 al 18/10 con 2 PT a settimana e 1 BIA, blocco 2
 * dal 19/10. Sara: nessun blocco, crediti extra PT. Luca: blocco senza
 * capienza e nessun extra.
 */
export function seedDb(): MemDb {
  return {
    types: Object.values(TYPES),
    blocks: [
      {
        id: "m1",
        client_id: "marta",
        start_date: "2026-09-21",
        end_date: "2026-10-18",
        deleted_at: null,
      },
      {
        id: "m2",
        client_id: "marta",
        start_date: "2026-10-19",
        end_date: "2026-11-15",
        deleted_at: null,
      },
      {
        id: "l1",
        client_id: "luca",
        start_date: "2026-09-21",
        end_date: "2026-10-18",
        deleted_at: null,
      },
    ],
    allocations: [
      alloc("m1-pt-1", "m1", "pt", "PT Session", 1, 2, 0, "2026-09-20T09:00:00Z"),
      alloc("m1-pt-2", "m1", "pt", "PT Session", 2, 2, 0, "2026-09-20T09:01:00Z"),
      alloc("m1-pt-3", "m1", "pt", "PT Session", 3, 2, 0, "2026-09-20T09:02:00Z"),
      alloc("m1-pt-4", "m1", "pt", "PT Session", 4, 2, 0, "2026-09-20T09:03:00Z"),
      alloc("m1-bia", "m1", "bia", "BIA", 1, 1, 0, "2026-09-20T09:04:00Z"),
      alloc("m2-pt-1", "m2", "pt", "PT Session", 1, 2, 0, "2026-10-18T09:00:00Z"),
      alloc("l1-pt", "l1", "pt", "PT Session", 1, 4, 4),
    ],
    extras: [
      {
        id: "s-pt-used",
        client_id: "sara",
        event_type_id: "pt",
        quantity: 2,
        quantity_booked: 2,
        expires_at: "2099-01-01T00:00:00Z",
      },
      {
        id: "s-pt-late",
        client_id: "sara",
        event_type_id: "pt",
        quantity: 3,
        quantity_booked: 0,
        expires_at: "2100-01-01T00:00:00Z",
      },
      {
        id: "s-pt-soon",
        client_id: "sara",
        event_type_id: "pt",
        quantity: 1,
        quantity_booked: 0,
        expires_at: "2099-06-01T00:00:00Z",
      },
      {
        id: "m-bia-extra",
        client_id: "marta",
        event_type_id: "bia",
        quantity: 1,
        quantity_booked: 0,
        expires_at: "2100-01-01T00:00:00Z",
      },
    ],
    bookings: [],
  };
}
