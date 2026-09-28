import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import type { CreditAllocation } from "@/lib/credits";
import { toIsoDate } from "@/lib/current-block";
import {
  clientReferenceBlock,
  compareRenewals,
  formatRenewals,
  getRenewalInfo,
  listRenewals,
  type RenewalBlock,
  type RenewalBlockWithAllocations,
  type RenewalClient,
  type RenewalInfo,
} from "@/lib/renewal";

// Ora dei dati di esempio dell'handoff: 25/09/2026 alle 10:40 di Roma.
const NOW = new Date("2026-09-25T10:40:00+02:00");
const FIXED: RenewalClient = { status: "active", path_type: "fixed", auto_renew_blocks: false };
const MONTHLY_AUTO: RenewalClient = {
  status: "active",
  path_type: "recurring",
  auto_renew_blocks: true,
};
const MONTHLY_MANUAL: RenewalClient = {
  status: "active",
  path_type: "recurring",
  auto_renew_blocks: false,
};

const day = (offset: number) => toIsoDate(addDays(NOW, offset));

/** Blocco di 28 giorni che termina tra `days` giorni (negativo = già finito). */
const blockEndingIn = (days: number, id = "cur", seq = 1): RenewalBlock => ({
  id,
  start_date: day(days - 27),
  end_date: day(days),
  sequence_order: seq,
  status: days < 0 ? "completed" : "active",
});

/** Il blocco successivo a `prev`, come lo crea «Rinnova lo stesso». */
const nextBlock = (prev: RenewalBlock, id = "next"): RenewalBlock => {
  const start = addDays(new Date(`${prev.end_date}T12:00:00`), 1);
  return {
    id,
    start_date: toIsoDate(start),
    end_date: toIsoDate(addDays(start, 27)),
    sequence_order: prev.sequence_order + 1,
    status: "active",
  };
};

/** Allocazioni con `left` crediti residui nel blocco `blockId`, più un blocco precedente da ignorare. */
const creditsLeft = (left: number, blockId = "cur"): CreditAllocation[] => [
  {
    block_id: blockId,
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

describe("getRenewalInfo · la tabella del 25/09", () => {
  it("archiviato: mai", () => {
    const archived = { ...FIXED, status: "archived" };
    expect(getRenewalInfo(archived, [blockEndingIn(2)], creditsLeft(0), NOW)).toBeNull();
  });

  it("libero: mai", () => {
    const free = { ...FIXED, path_type: "free" };
    expect(getRenewalInfo(free, [blockEndingIn(2)], creditsLeft(0), NOW)).toBeNull();
  });

  it("mensile col rinnovo automatico acceso: mai, nemmeno con 0 crediti e il blocco che scade domani", () => {
    expect(getRenewalInfo(MONTHLY_AUTO, [blockEndingIn(1)], creditsLeft(0), NOW)).toBeNull();
  });

  it("mensile col rinnovo spento: come un percorso fisso", () => {
    expect(getRenewalInfo(MONTHLY_MANUAL, [blockEndingIn(4)], creditsLeft(5), NOW)).toEqual({
      reason: "Il blocco scade tra 4 giorni",
      remaining: 5,
      daysLeft: 4,
      note: null,
    });
    expect(getRenewalInfo(MONTHLY_MANUAL, [blockEndingIn(20)], creditsLeft(1), NOW)?.reason).toBe(
      "1 credito rimasto",
    );
    expect(getRenewalInfo(MONTHLY_MANUAL, [blockEndingIn(20)], creditsLeft(3), NOW)).toBeNull();
  });

  it("mensile con auto_renew_blocks null: spento, come nel server", () => {
    const monthlyNull = { ...MONTHLY_AUTO, auto_renew_blocks: null };
    expect(getRenewalInfo(monthlyNull, [blockEndingIn(2)], creditsLeft(5), NOW)?.reason).toBe(
      "Il blocco scade tra 2 giorni",
    );
  });

  it("fisso all'ultimo blocco con 2 crediti o meno: sì", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(20)], creditsLeft(2), NOW)?.reason).toBe(
      "2 crediti rimasti",
    );
  });

  it("fisso all'ultimo blocco che finisce entro 7 giorni: sì", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(7)], creditsLeft(5), NOW)?.reason).toBe(
      "Il blocco scade tra 7 giorni",
    );
  });

  it("fisso all'ultimo blocco con 3 crediti e 8 giorni: no", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(8)], creditsLeft(3), NOW)).toBeNull();
  });

  it("fisso non all'ultimo blocco con 1 credito: mai", () => {
    const cur = blockEndingIn(3);
    expect(getRenewalInfo(FIXED, [cur, nextBlock(cur)], creditsLeft(1), NOW)).toBeNull();
  });

  it("il fisso col flag del rinnovo acceso segue comunque la regola del fisso", () => {
    const fixedAuto = { ...FIXED, auto_renew_blocks: true };
    expect(getRenewalInfo(fixedAuto, [blockEndingIn(2)], creditsLeft(5), NOW)?.daysLeft).toBe(2);
  });

  it("dopo «Rinnova lo stesso» esce; con «Ripristina» rientra", () => {
    const cur = blockEndingIn(2);
    const before = getRenewalInfo(FIXED, [cur], creditsLeft(1), NOW);
    expect(before?.reason).toBe("Il blocco scade tra 2 giorni");
    const renewed = [cur, nextBlock(cur)];
    const allocations = [...creditsLeft(1), ...creditsLeft(8, "next")];
    expect(getRenewalInfo(FIXED, renewed, allocations, NOW)).toBeNull();
    // «Ripristina» toglie il blocco appena creato.
    expect(getRenewalInfo(FIXED, [cur], creditsLeft(1), NOW)).toEqual(before);
  });

  it("un blocco annullato dopo quello in corso non conta", () => {
    const cur = blockEndingIn(3);
    const cancelled = { ...nextBlock(cur), status: "cancelled" };
    expect(getRenewalInfo(FIXED, [cur, cancelled], creditsLeft(5), NOW)?.daysLeft).toBe(3);
  });
});

describe("getRenewalInfo · blocco di riferimento", () => {
  it("usa il blocco in corso, non uno passato", () => {
    const prev = blockEndingIn(-1, "prev", 1);
    const cur = { ...blockEndingIn(27, "cur", 2) };
    expect(getRenewalInfo(FIXED, [prev, cur], creditsLeft(1), NOW)?.reason).toBe(
      "1 credito rimasto",
    );
  });

  it("percorso non ancora iniziato: il primo blocco futuro", () => {
    const first = blockEndingIn(30, "cur", 1);
    expect(getRenewalInfo(FIXED, [first], creditsLeft(2), NOW)?.remaining).toBe(2);
    expect(getRenewalInfo(FIXED, [first, nextBlock(first)], creditsLeft(2), NOW)).toBeNull();
  });

  it("nessun blocco → null", () => {
    expect(getRenewalInfo(FIXED, [], creditsLeft(0), NOW)).toBeNull();
  });

  it("percorso concluso (blocco finito, 0 residui) → null", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(-3)], creditsLeft(0), NOW)).toBeNull();
  });

  it("blocco finito con crediti residui → regola dei crediti", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(-3)], creditsLeft(1), NOW)).toEqual({
      reason: "1 credito rimasto",
      remaining: 1,
      daysLeft: -3,
      note: "Blocco 1, finito il 22 set 2026",
    });
  });
});

describe("getRenewalInfo · crediti residui", () => {
  it.each([
    [0, "Crediti esauriti"],
    [1, "1 credito rimasto"],
    [2, "2 crediti rimasti"],
  ])("%i crediti → in scadenza con «%s»", (left, reason) => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(20)], creditsLeft(left), NOW)).toEqual({
      reason,
      remaining: left,
      daysLeft: 20,
      note: null,
    });
  });

  it("3 crediti e blocco lontano → non in scadenza", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(20)], creditsLeft(3), NOW)).toBeNull();
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
    expect(getRenewalInfo(FIXED, [blockEndingIn(20)], allocations, NOW)).toBeNull();
  });
});

describe("getRenewalInfo · fine del blocco", () => {
  it.each([
    [0, "Il blocco scade oggi"],
    [1, "Il blocco scade domani"],
    [7, "Il blocco scade tra 7 giorni"],
  ])("blocco che termina tra %i giorni → «%s»", (days, reason) => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(days)], creditsLeft(5), NOW)).toEqual({
      reason,
      remaining: 5,
      daysLeft: days,
      note: null,
    });
  });

  it("8 giorni → non in scadenza", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(8)], creditsLeft(5), NOW)).toBeNull();
  });

  it("con data e crediti insieme il motivo è la data", () => {
    expect(getRenewalInfo(FIXED, [blockEndingIn(3)], creditsLeft(1), NOW)?.reason).toBe(
      "Il blocco scade tra 3 giorni",
    );
  });
});

describe("listRenewals", () => {
  const client = (id: string, name: string, extra: Partial<RenewalClient> = {}) => ({
    id,
    full_name: name,
    ...FIXED,
    ...extra,
  });
  const withAllocations = (
    b: RenewalBlock,
    clientId: string,
    left: number,
  ): RenewalBlockWithAllocations => ({
    ...b,
    client_id: clientId,
    allocations: creditsLeft(left, b.id),
  });

  it("tutti i clienti in scadenza, senza tagli, nell'ordine della regola", () => {
    const clients = [
      client("a", "Anna"),
      client("b", "Bruno"),
      client("c", "Carla", MONTHLY_AUTO),
      client("d", "Dario"),
      client("e", "Elisa"),
      client("f", "Fabio"),
    ];
    const blocks = [
      withAllocations(blockEndingIn(20, "a1"), "a", 2),
      withAllocations(blockEndingIn(2, "b1"), "b", 6),
      withAllocations(blockEndingIn(1, "c1"), "c", 0),
      withAllocations(blockEndingIn(20, "d1"), "d", 0),
      withAllocations(blockEndingIn(6, "e1"), "e", 4),
      withAllocations(blockEndingIn(20, "f1"), "f", 1),
    ];
    expect(listRenewals(clients, blocks, NOW).map((r) => [r.client.id, r.info.reason])).toEqual([
      ["b", "Il blocco scade tra 2 giorni"],
      ["e", "Il blocco scade tra 6 giorni"],
      ["d", "Crediti esauriti"],
      ["f", "1 credito rimasto"],
      ["a", "2 crediti rimasti"],
    ]);
  });
});

describe("compareRenewals", () => {
  it("prima per giorni alla scadenza, poi per crediti residui", () => {
    const list: RenewalInfo[] = [
      { reason: "2 crediti rimasti", remaining: 2, daysLeft: 20, note: null },
      { reason: "Il blocco scade tra 5 giorni", remaining: 6, daysLeft: 5, note: null },
      { reason: "Crediti esauriti", remaining: 0, daysLeft: 30, note: null },
      { reason: "Il blocco scade domani", remaining: 4, daysLeft: 1, note: null },
    ];
    expect([...list].sort(compareRenewals).map((r) => r.reason)).toEqual([
      "Il blocco scade domani",
      "Il blocco scade tra 5 giorni",
      "Crediti esauriti",
      "2 crediti rimasti",
    ]);
  });

  it("a parità di giorni mette prima chi ha meno crediti", () => {
    const a: RenewalInfo = {
      reason: "Il blocco scade oggi",
      remaining: 3,
      daysLeft: 0,
      note: null,
    };
    const b: RenewalInfo = {
      reason: "Il blocco scade oggi",
      remaining: 1,
      daysLeft: 0,
      note: null,
    };
    expect([a, b].sort(compareRenewals)).toEqual([b, a]);
  });
});

describe("formatRenewals · etichetta del conteggio in Panoramica (V12)", () => {
  it("singolare e plurale", () => {
    expect(formatRenewals(1)).toBe("1 cliente in scadenza");
    expect(formatRenewals(0)).toBe("0 clienti in scadenza");
    expect(formatRenewals(4)).toBe("4 clienti in scadenza");
  });
});

describe("clientReferenceBlock · il blocco in corso di Prenota e Home", () => {
  // Ora locale: lo stesso giorno con TZ=Europe/Rome e con TZ=UTC.
  const TODAY = new Date(2026, 8, 28, 10, 40);
  const block = (
    id: string,
    seq: number,
    start: string,
    end: string,
    status = "active",
  ): RenewalBlock => ({ id, sequence_order: seq, start_date: start, end_date: end, status });
  // Abbonamento coi due mesi dopo già creati.
  const subscription = [
    block("m1", 1, "2026-09-14", "2026-10-11"),
    block("m2", 2, "2026-10-12", "2026-11-08"),
    block("m3", 3, "2026-11-09", "2026-12-06"),
  ];

  it("abbonato coi mesi dopo già creati: il mese che contiene oggi, non l'ultimo creato", () => {
    expect(clientReferenceBlock(subscription, TODAY)).toBe(subscription[0]);
  });

  it("percorso fisso: il blocco che contiene oggi", () => {
    const fixed = [
      block("b1", 1, "2026-08-17", "2026-09-13", "completed"),
      block("b2", 2, "2026-09-14", "2026-10-11"),
      block("b3", 3, "2026-10-12", "2026-11-08"),
    ];
    expect(clientReferenceBlock(fixed, TODAY)?.id).toBe("b2");
  });

  it("fra due blocchi non contigui: il primo che deve iniziare", () => {
    const gap = [
      block("b1", 1, "2026-08-03", "2026-08-30", "completed"),
      block("b2", 2, "2026-10-12", "2026-11-08"),
      block("b3", 3, "2026-11-09", "2026-12-06"),
    ];
    expect(clientReferenceBlock(gap, TODAY)?.id).toBe("b2");
  });

  it("percorso finito: l'ultimo", () => {
    // Un altro anno. Una funzione che leggesse l'orologio invece di `now` qui
    // darebbe il mese dell'orologio: fino all'08/11/2026 cade questo test,
    // dal 12/10/2026 cade il primo.
    expect(clientReferenceBlock(subscription, new Date(2027, 2, 15, 10, 40))?.id).toBe("m3");
  });

  it("un blocco annullato non si sceglie, anche se contiene oggi; nessun blocco → null", () => {
    const withCancelled = [
      block("x", 1, "2026-09-14", "2026-10-11", "cancelled"),
      block("b2", 2, "2026-10-12", "2026-11-08"),
    ];
    expect(clientReferenceBlock(withCancelled, TODAY)?.id).toBe("b2");
    expect(clientReferenceBlock([], TODAY)).toBeNull();
  });
});
