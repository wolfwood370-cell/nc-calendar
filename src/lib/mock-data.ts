export type SessionType = "PT Session" | "BIA" | "Functional Test";
export type Role = "trainer" | "client";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone_number: string;
  email: string;
}

export interface BlockAllocation {
  id: string;
  block_id: string;
  week_number: 1 | 2 | 3 | 4;
  session_type: SessionType;
  quantity_assigned: number;
  quantity_booked: number;
}

export interface TrainingBlock {
  id: string;
  client_id: string;
  start_date: string; // ISO date
  end_date: string;
  status: "active" | "completed";
  allocations: BlockAllocation[];
}

export interface AvailabilitySlot {
  id: string;
  day_of_week: number; // 0-6
  start_time: string; // "07:00"
  end_time: string;
}

export interface Booking {
  id: string;
  client_id: string;
  session_type: SessionType;
  scheduled_at: string; // ISO datetime
  status: "scheduled" | "cancelled" | "completed";
}

const today = new Date();
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const trainer: Profile = {
  id: "trainer-1",
  role: "trainer",
  full_name: "Alex Morgan",
  phone_number: "+1 555 0100",
  email: "trainer@demo.app",
};

export const clients: Profile[] = [
  { id: "c1", role: "client", full_name: "Jordan Chen", phone_number: "+1 555 0111", email: "client@demo.app" },
  { id: "c2", role: "client", full_name: "Sam Rivera", phone_number: "+1 555 0112", email: "sam@demo.app" },
  { id: "c3", role: "client", full_name: "Priya Patel", phone_number: "+1 555 0113", email: "priya@demo.app" },
  { id: "c4", role: "client", full_name: "Noah Kim", phone_number: "+1 555 0114", email: "noah@demo.app" },
];

const blockStart = addDays(today, -3);
const blockEnd = addDays(blockStart, 28);

function makeAlloc(blockId: string, week: 1 | 2 | 3 | 4, type: SessionType, q: number, booked: number): BlockAllocation {
  return {
    id: `${blockId}-w${week}-${type}`,
    block_id: blockId,
    week_number: week,
    session_type: type,
    quantity_assigned: q,
    quantity_booked: booked,
  };
}

export const blocks: TrainingBlock[] = [
  {
    id: "b1",
    client_id: "c1",
    start_date: iso(blockStart),
    end_date: iso(blockEnd),
    status: "active",
    allocations: [
      makeAlloc("b1", 1, "PT Session", 2, 2),
      makeAlloc("b1", 1, "BIA", 1, 1),
      makeAlloc("b1", 2, "PT Session", 2, 1),
      makeAlloc("b1", 3, "PT Session", 2, 0),
      makeAlloc("b1", 3, "Functional Test", 1, 0),
      makeAlloc("b1", 4, "PT Session", 2, 0),
    ],
  },
  {
    id: "b2",
    client_id: "c2",
    start_date: iso(blockStart),
    end_date: iso(blockEnd),
    status: "active",
    allocations: [
      makeAlloc("b2", 1, "PT Session", 3, 2),
      makeAlloc("b2", 2, "PT Session", 3, 0),
      makeAlloc("b2", 3, "PT Session", 3, 0),
      makeAlloc("b2", 4, "PT Session", 3, 0),
      makeAlloc("b2", 4, "BIA", 1, 0),
    ],
  },
];

export const availability: AvailabilitySlot[] = [
  { id: "a1", day_of_week: 1, start_time: "07:00", end_time: "12:00" },
  { id: "a2", day_of_week: 2, start_time: "07:00", end_time: "12:00" },
  { id: "a3", day_of_week: 3, start_time: "14:00", end_time: "19:00" },
  { id: "a4", day_of_week: 4, start_time: "07:00", end_time: "12:00" },
  { id: "a5", day_of_week: 5, start_time: "07:00", end_time: "16:00" },
  { id: "a6", day_of_week: 6, start_time: "08:00", end_time: "11:00" },
];

export const bookings: Booking[] = [
  { id: "bk1", client_id: "c1", session_type: "PT Session", scheduled_at: iso(addDays(today, -2)), status: "completed" },
  { id: "bk2", client_id: "c1", session_type: "PT Session", scheduled_at: iso(addDays(today, -1)), status: "completed" },
  { id: "bk3", client_id: "c1", session_type: "BIA", scheduled_at: iso(addDays(today, -3)), status: "completed" },
  { id: "bk4", client_id: "c1", session_type: "PT Session", scheduled_at: iso(addDays(today, 2)), status: "scheduled" },
  { id: "bk5", client_id: "c2", session_type: "PT Session", scheduled_at: iso(addDays(today, 1)), status: "scheduled" },
  { id: "bk6", client_id: "c2", session_type: "PT Session", scheduled_at: iso(addDays(today, 3)), status: "scheduled" },
  { id: "bk7", client_id: "c3", session_type: "PT Session", scheduled_at: iso(addDays(today, 4)), status: "scheduled" },
];

export function getCurrentClient() {
  return clients[0];
}

export function getActiveBlock(clientId: string) {
  return blocks.find((b) => b.client_id === clientId && b.status === "active");
}

export function getCurrentWeek(block: TrainingBlock): 1 | 2 | 3 | 4 {
  const start = new Date(block.start_date).getTime();
  const days = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
  const w = Math.min(4, Math.max(1, Math.floor(days / 7) + 1));
  return w as 1 | 2 | 3 | 4;
}

export function clientName(id: string) {
  return clients.find((c) => c.id === id)?.full_name ?? "Sconosciuto";
}

export function sessionLabel(t: SessionType): string {
  if (t === "PT Session") return "Sessione PT";
  if (t === "Functional Test") return "Test Funzionale";
  return "BIA";
}

