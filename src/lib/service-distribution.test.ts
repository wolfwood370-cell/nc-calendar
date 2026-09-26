import { describe, expect, it } from "vitest";
import {
  FALLBACK_TYPE_COLOR,
  formatDistributionLabel,
  getServiceDistribution,
  type DistributionBooking,
} from "@/lib/service-distribution";

const NOW = new Date("2026-09-25T10:40:00+02:00");
const TYPES = [
  { id: "pt", name: "Personal Training", color: "#003e62" },
  { id: "bia", name: "Misurazione BIA", color: "#039be5" },
];

let seq = 0;
function b(when: string, over: Partial<DistributionBooking> = {}): DistributionBooking {
  seq += 1;
  return {
    id: `b${seq}`,
    client_id: "c1",
    coach_id: "coach",
    is_personal: false,
    status: "completed",
    scheduled_at: new Date(when).toISOString(),
    deleted_at: null,
    duration_min: 60,
    event_type_id: "pt",
    session_type: "PT Session",
    ...over,
  };
}

describe("getServiceDistribution", () => {
  const bookings = [
    b("2026-01-01T00:30:00+01:00"),
    b("2026-03-10T09:00:00+01:00"),
    b("2026-06-10T09:00:00+02:00", { status: "no_show" }),
    b("2026-09-25T09:00:00+02:00", { status: "scheduled" }),
    b("2026-09-01T09:00:00+02:00", { event_type_id: "bia", session_type: "BIA" }),
    b("2026-09-02T09:00:00+02:00", { event_type_id: null, session_type: "Functional Test" }),
    // fuori
    b("2025-12-31T23:30:00+01:00"),
    b("2026-09-25T15:00:00+02:00", { status: "scheduled" }),
    b("2026-09-10T09:00:00+02:00", { status: "cancelled" }),
    b("2026-09-11T09:00:00+02:00", { status: "late_cancelled" }),
    b("2026-09-12T09:00:00+02:00", { deleted_at: "2026-09-12T10:00:00Z" }),
    b("2026-09-13T09:00:00+02:00", { is_personal: true, client_id: null }),
    b("2026-09-14T09:00:00+02:00", { client_id: null }),
    b("2026-09-15T09:00:00+02:00", { client_id: "coach" }),
  ];

  it("solo sessioni cliente già iniziate dal 1° gennaio, senza annullate ed eliminate", () => {
    const d = getServiceDistribution(bookings, TYPES, NOW);
    expect(d.total).toBe(6);
    expect(d.since).toBeNull();
    expect(d.items.map((i) => [i.name, i.count, i.pct])).toEqual([
      ["Personal Training", 4, 67],
      ["Misurazione BIA", 1, 17],
      ["Test funzionale", 1, 17],
    ]);
    expect(d.items.find((i) => i.name === "Test funzionale")?.color).toBe(FALLBACK_TYPE_COLOR);
    expect(d.items.reduce((s, i) => s + i.share, 0)).toBeCloseTo(100);
    expect(formatDistributionLabel(d)).toBe("Dal 1° gennaio · 6 sessioni");
  });

  it("con i dati tagliati parte dalla sessione più vecchia caricata e lo dice", () => {
    const recent = bookings.filter((x) => x.scheduled_at >= "2026-03-08");
    const d = getServiceDistribution(recent, TYPES, NOW, { truncated: true });
    expect(d.since?.toISOString()).toBe(new Date("2026-03-10T09:00:00+01:00").toISOString());
    expect(d.total).toBe(5);
    expect(formatDistributionLabel(d)).toBe("Dal 10 mar 2026 · 5 sessioni");
  });

  it("tagliati ma già oltre il 1° gennaio: nessun avviso", () => {
    const d = getServiceDistribution(bookings, TYPES, NOW, { truncated: true });
    expect(d.since).toBeNull();
  });

  it("anno vuoto", () => {
    const d = getServiceDistribution([], TYPES, NOW);
    expect(d).toEqual({ items: [], total: 0, since: null });
    expect(formatDistributionLabel({ total: 1, since: null })).toBe("Dal 1° gennaio · 1 sessione");
  });
});
