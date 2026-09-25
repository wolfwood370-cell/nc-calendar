import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import type { CreditAllocation } from "@/lib/credits";
import { toIsoDate } from "@/lib/current-block";
import { compareRenewals, getRenewalInfo, type RenewalInfo } from "@/lib/renewal";

// Ora dei dati di esempio dell'handoff: 25/09/2026 alle 10:40.
const NOW = new Date(2026, 8, 25, 10, 40);
const ACTIVE = { status: "active", path_type: "fixed" };

/** Blocco in corso che termina tra `days` giorni (negativo = già finito). */
const blockEndingIn = (days: number) => ({ id: "cur", end_date: toIsoDate(addDays(NOW, days)) });

/** Allocazioni con `left` crediti residui nel blocco in corso, più un blocco precedente da ignorare. */
const creditsLeft = (left: number): CreditAllocation[] => [
  {
    block_id: "cur",
    event_type_id: "pt",
    session_type: "PT Session",
    quantity_assigned: 8,
    quantity_booked: 8 - left,
  },
  {
    block_id: "prev",
    event_type_id: "pt",
    session_type: "PT Session",
    quantity_assigned: 8,
    quantity_booked: 0,
  },
];

describe("getRenewalInfo · crediti residui", () => {
  it.each([
    [0, "Crediti esauriti"],
    [1, "1 credito rimasto"],
    [2, "2 crediti rimasti"],
  ])("%i crediti → in scadenza con «%s»", (left, reason) => {
    expect(getRenewalInfo(ACTIVE, blockEndingIn(20), creditsLeft(left), NOW)).toEqual({
      reason,
      remaining: left,
      daysLeft: 20,
    });
  });

  it("3 crediti e blocco lontano → non in scadenza", () => {
    expect(getRenewalInfo(ACTIVE, blockEndingIn(20), creditsLeft(3), NOW)).toBeNull();
  });

  it("somma i residui di tutte le tipologie del blocco", () => {
    const allocations: CreditAllocation[] = [
      ...creditsLeft(2),
      {
        block_id: "cur",
        event_type_id: "bia",
        session_type: "BIA",
        quantity_assigned: 1,
        quantity_booked: 0,
      },
    ];
    expect(getRenewalInfo(ACTIVE, blockEndingIn(20), allocations, NOW)).toBeNull();
  });
});

describe("getRenewalInfo · fine del blocco", () => {
  it.each([
    [0, "Il blocco scade oggi"],
    [1, "Il blocco scade domani"],
    [7, "Il blocco scade tra 7 giorni"],
  ])("blocco che termina tra %i giorni → «%s»", (days, reason) => {
    expect(getRenewalInfo(ACTIVE, blockEndingIn(days), creditsLeft(5), NOW)).toEqual({
      reason,
      remaining: 5,
      daysLeft: days,
    });
  });

  it("8 giorni → non in scadenza", () => {
    expect(getRenewalInfo(ACTIVE, blockEndingIn(8), creditsLeft(5), NOW)).toBeNull();
  });

  it("con data e crediti insieme il motivo è la data", () => {
    expect(getRenewalInfo(ACTIVE, blockEndingIn(3), creditsLeft(1), NOW)?.reason).toBe(
      "Il blocco scade tra 3 giorni",
    );
  });

  it("vale anche per gli abbonamenti mensili", () => {
    const recurring = { status: "active", path_type: "recurring" };
    expect(getRenewalInfo(recurring, blockEndingIn(4), creditsLeft(5), NOW)?.daysLeft).toBe(4);
  });
});

describe("getRenewalInfo · esclusioni", () => {
  it("cliente libero → null", () => {
    const free = { status: "active", path_type: "free" };
    expect(getRenewalInfo(free, blockEndingIn(2), creditsLeft(0), NOW)).toBeNull();
  });

  it("cliente archiviato → null", () => {
    const archived = { status: "archived", path_type: "fixed" };
    expect(getRenewalInfo(archived, blockEndingIn(2), creditsLeft(0), NOW)).toBeNull();
  });

  it("nessun blocco → null", () => {
    expect(getRenewalInfo(ACTIVE, null, creditsLeft(0), NOW)).toBeNull();
  });

  it("percorso concluso (blocco finito, 0 residui) → null", () => {
    expect(getRenewalInfo(ACTIVE, blockEndingIn(-3), creditsLeft(0), NOW)).toBeNull();
  });

  it("blocco finito con crediti residui → regola dei crediti", () => {
    expect(getRenewalInfo(ACTIVE, blockEndingIn(-3), creditsLeft(1), NOW)).toEqual({
      reason: "1 credito rimasto",
      remaining: 1,
      daysLeft: -3,
    });
  });
});

describe("compareRenewals", () => {
  it("prima per giorni alla scadenza, poi per crediti residui", () => {
    const list: RenewalInfo[] = [
      { reason: "2 crediti rimasti", remaining: 2, daysLeft: 20 },
      { reason: "Il blocco scade tra 5 giorni", remaining: 6, daysLeft: 5 },
      { reason: "Crediti esauriti", remaining: 0, daysLeft: 30 },
      { reason: "Il blocco scade domani", remaining: 4, daysLeft: 1 },
    ];
    expect([...list].sort(compareRenewals).map((r) => r.reason)).toEqual([
      "Il blocco scade domani",
      "Il blocco scade tra 5 giorni",
      "Crediti esauriti",
      "2 crediti rimasti",
    ]);
  });

  it("a parità di giorni mette prima chi ha meno crediti", () => {
    const a: RenewalInfo = { reason: "Il blocco scade oggi", remaining: 3, daysLeft: 0 };
    const b: RenewalInfo = { reason: "Il blocco scade oggi", remaining: 1, daysLeft: 0 };
    expect([a, b].sort(compareRenewals)).toEqual([b, a]);
  });
});
