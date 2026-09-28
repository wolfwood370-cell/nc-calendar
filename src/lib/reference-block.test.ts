// Audit V6, passata 10 (C10): quale blocco mostra ogni superficie.
// Un buco fra due blocchi: il blocco 2 è finito ieri, il 3 comincia fra dieci
// giorni. Le superfici del «percorso oggi» (Panoramica, Clienti, Profilo,
// dialog Pacchetto) mostrano tutte il blocco 3 e dicono che deve iniziare; le
// superfici della «data della sessione» (pannello del Calendario, Assegna
// evento) mostrano il blocco che contiene quella data, e nessun blocco per
// una sessione che cade nel buco. Prima il pannello e il Pacchetto usavano il
// blocco che contiene oggi: nel buco, niente.

import { describe, expect, it } from "vitest";
import { availableCredits, availableCreditsSource, sessionBlockCredits } from "@/lib/assign-event";
import { blockChip, packageSummary } from "@/lib/client-profile";
import {
  buildClientRows,
  type ListAllocation,
  type ListBlock,
  type ListClient,
} from "@/lib/client-list";
import { renewNote, renewalResidual } from "@/lib/package-actions";
import { getRenewalInfo } from "@/lib/renewal";

// 25/09/2026 alle 10:40 di Roma, come i dati dell'handoff.
const NOW = new Date("2026-09-25T10:40:00+02:00");

const CLIENT: ListClient = {
  id: "c1",
  full_name: "Cliente di prova",
  email: null,
  phone: null,
  pack_label: null,
  status: "active",
  path_type: "fixed",
  auto_renew_blocks: false,
};

const BLOCKS: ListBlock[] = [
  {
    id: "b1",
    client_id: "c1",
    sequence_order: 1,
    start_date: "2026-08-01",
    end_date: "2026-08-28",
  },
  {
    id: "b2",
    client_id: "c1",
    sequence_order: 2,
    start_date: "2026-08-29",
    end_date: "2026-09-24",
  },
  {
    id: "b3",
    client_id: "c1",
    sequence_order: 3,
    start_date: "2026-10-05",
    end_date: "2026-11-01",
  },
];

const pt = (block_id: string, assigned: number, booked: number): ListAllocation => ({
  block_id,
  event_type_id: "pt",
  session_type: "PT Session",
  quantity_assigned: assigned,
  quantity_booked: booked,
});

// Blocco 2: 8 assegnati, 6 prenotati. Blocco 3: 2 assegnati, nessuno prenotato.
const ALLOCS: ListAllocation[] = [pt("b1", 8, 8), pt("b2", 8, 6), pt("b3", 2, 0)];
const WITH_ALLOCS = BLOCKS.map((b) => ({
  ...b,
  allocations: ALLOCS.filter((a) => a.block_id === b.id),
}));

const STARTS = "dal 5 ott 2026";
const PT_TYPE = { id: "pt", base_type: "PT Session" as const };

describe("il percorso del cliente oggi: tutte sul blocco 3, e lo dicono", () => {
  it("Panoramica: «In scadenza» coi crediti del blocco 3", () => {
    const info = getRenewalInfo(CLIENT, BLOCKS, ALLOCS, NOW);
    expect(info?.remaining).toBe(2);
    expect(info?.note).toBe(`Blocco 3, ${STARTS}`);
  });

  it("Clienti: la scheda coi crediti del blocco 3", () => {
    const [row] = buildClientRows(
      { clients: [CLIENT], blocks: BLOCKS, allocations: ALLOCS, bookings: [], extras: [] },
      NOW,
    );
    expect(row?.credits).toMatchObject({
      title: `Crediti del blocco 3 di 3 · ${STARTS}`,
      left: 2,
      total: 2,
    });
  });

  it("Profilo: chip, riquadro del pacchetto e segmenti", () => {
    expect(blockChip("fixed", BLOCKS, NOW)).toBe(`Blocco 3 di 3 · ${STARTS}`);
    const s = packageSummary("fixed", BLOCKS, ALLOCS, NOW);
    expect(s.expiryLabel).toBe("Il blocco 3 inizia il 5 ott 2026");
    expect(s.creditsTitle).toBe(`Crediti del blocco 3 · ${STARTS}`);
    expect(s.segments).toEqual(["past", "past", "future"]);
    expect(s.credits.map((c) => [c.assigned, c.left])).toEqual([[2, 2]]);
  });

  it("dialog Pacchetto: il residuo del rinnovo è del blocco 3, e la nota lo dice", () => {
    const r = renewalResidual(WITH_ALLOCS, NOW);
    expect(r.residual).toBe(2);
    expect(r.block).toMatchObject({ number: 3, timing: "future" });
    expect(renewNote(new Date(2026, 10, 2), r.residual, r.block)).toContain(
      "I 2 crediti del blocco 3, che inizia il 5 ott 2026, restano validi fino alla sua fine.",
    );
  });
});

describe("la data della sessione: il blocco che la contiene", () => {
  it("pannello del Calendario: una sessione del 7 ottobre è del blocco 3", () => {
    const r = sessionBlockCredits(WITH_ALLOCS, ALLOCS, "2026-10-07T09:00:00+02:00", NOW);
    expect(r.block?.id).toBe("b3");
    expect(r.title).toBe(`Crediti del blocco 3 · ${STARTS}`);
  });

  it("pannello del Calendario: una sessione di oggi, nel buco, non ha blocco", () => {
    const r = sessionBlockCredits(WITH_ALLOCS, ALLOCS, "2026-09-25T18:00:00+02:00", NOW);
    expect(r).toEqual({ block: null, title: null, credits: [] });
  });

  it("Assegna evento: stesso blocco del pannello, e da dove vengono i crediti", () => {
    const at = (scheduledAt: string) =>
      availableCredits({
        blocks: WITH_ALLOCS,
        extras: [{ event_type_id: "pt", quantity: 3, quantity_booked: 2 }],
        scheduledAt,
        type: PT_TYPE,
      });
    const october = at("2026-10-07T09:00:00+02:00");
    expect(october).toEqual({ fromBlock: 2, fromExtras: 1, blockNumber: 3 });
    expect(availableCreditsSource(october)).toBe("2 del blocco 3 + 1 extra");
    const gap = at("2026-09-25T18:00:00+02:00");
    expect(gap).toEqual({ fromBlock: 0, fromExtras: 1, blockNumber: null });
    expect(availableCreditsSource(gap)).toBe("1 extra");
    expect(availableCreditsSource(at("2026-09-20T09:00:00+02:00"))).toBe(
      "2 del blocco 2 + 1 extra",
    );
  });
});

describe("dentro un blocco le superfici non aggiungono niente", () => {
  const inBlock3 = new Date("2026-10-10T10:00:00+02:00");
  it("il blocco in corso non ha nota", () => {
    expect(getRenewalInfo(CLIENT, BLOCKS, ALLOCS, inBlock3)?.note).toBeNull();
    expect(blockChip("fixed", BLOCKS, inBlock3)).toBe("Blocco 3 di 3");
    const s = packageSummary("fixed", BLOCKS, ALLOCS, inBlock3);
    expect(s.creditsTitle).toBe("Crediti del blocco in corso");
    expect(s.segments).toEqual(["past", "past", "current"]);
    expect(
      sessionBlockCredits(WITH_ALLOCS, ALLOCS, "2026-10-12T09:00:00+02:00", inBlock3).title,
    ).toBe("Crediti del blocco in corso");
  });
  it("a percorso finito la nota dice quando è finito, e il rinnovo che il residuo non passa", () => {
    const after = new Date("2026-11-05T10:00:00+01:00");
    expect(blockChip("fixed", BLOCKS, after)).toBe("Blocco 3 di 3 · finito il 1° nov 2026");
    const r = renewalResidual(WITH_ALLOCS, after);
    expect(renewNote(new Date(2026, 10, 2), r.residual, r.block)).toContain(
      "Il blocco 3 è finito il 1° nov 2026: i 2 crediti non usati non passano al nuovo blocco.",
    );
  });
});
