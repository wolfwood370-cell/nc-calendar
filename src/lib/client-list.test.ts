import { describe, expect, it } from "vitest";
import { profileEngagement } from "@/lib/attendance";
import {
  backToListSearch,
  buildClientRows,
  clientsSearchOf,
  clientsState,
  filterRows,
  parseClientsSearch,
  sortRows,
  tabCounts,
  withoutNewParam,
  type ClientRow,
  type ClientsListState,
  type ListAllocation,
  type ListBlock,
  type ListBooking,
  type ListClient,
} from "@/lib/client-list";
import { listRenewals } from "@/lib/renewal";
import { ALLOCATIONS, BLOCKS, BOOKINGS, CLIENTS, EXTRAS, NOW } from "@/lib/testing/clients-seed";

const DATA = {
  clients: CLIENTS,
  blocks: BLOCKS,
  allocations: ALLOCATIONS,
  bookings: BOOKINGS,
  extras: EXTRAS,
};
const rows = buildClientRows(DATA, NOW);
const row = (id: string) => rows.find((r) => r.client.id === id)!;
const ids = (list: readonly ClientRow[]) => list.map((r) => r.client.id);

describe("stati e tab", () => {
  it("uno stato per cliente", () => {
    expect(Object.fromEntries(rows.map((r) => [r.client.id, r.status]))).toEqual({
      giulia: "active",
      luca: "active",
      marta: "expiring",
      sara: "expiring",
      davide: "completed",
      elena: "active",
      roberto: "archived",
      andrea: "active",
      andrea2: "expiring",
    });
  });

  it("conteggi dei tab, «Tutti» senza archiviati", () => {
    expect(tabCounts(rows)).toEqual({
      all: 8,
      active: 4,
      expiring: 3,
      completed: 1,
      archived: 1,
    });
    expect(ids(filterRows(rows, "all", ""))).not.toContain("roberto");
    expect(filterRows(rows, "all", "")).toHaveLength(8);
    expect(ids(filterRows(rows, "archived", ""))).toEqual(["roberto"]);
    expect(ids(filterRows(rows, "completed", ""))).toEqual(["davide"]);
  });

  it("«In scadenza» è l'insieme della Panoramica sugli stessi dati", () => {
    const withAllocs = BLOCKS.map((b) => ({
      ...b,
      allocations: ALLOCATIONS.filter((a) => a.block_id === b.id),
    }));
    const panoramica = listRenewals(CLIENTS, withAllocs, NOW).map((r) => r.client.id);
    const lista = rows.filter((r) => r.status === "expiring").map((r) => r.client.id);
    expect(new Set(lista)).toEqual(new Set(panoramica));
    expect(lista.length).toBeGreaterThan(0);
  });

  it("ricerca per nome, email o telefono (almeno 3 cifre)", () => {
    expect(ids(filterRows(rows, "all", "bianchi"))).toEqual(["giulia"]);
    expect(ids(filterRows(rows, "all", "luca@email"))).toEqual(["luca"]);
    expect(ids(filterRows(rows, "all", "111 22"))).toEqual(["giulia"]);
    expect(ids(filterRows(rows, "all", "34"))).toEqual([]);
  });
});

// Il calcolo dello stato di trainer.clients.index.tsx su origin/main
// (ee8ecb9, righe 461-615), compresa la copia locale di findCurrentBlock
// (:211), trascritto qui per provare che la sostituzione non cambia nulla.
function statusBefore(
  c: ListClient,
  cb: ListBlock[],
  cAllocs: ListAllocation[],
  cBookings: ListBooking[],
  today: Date,
  getRenewal: (c: ListClient, b: ListBlock[], a: ListAllocation[], d: Date) => unknown,
): string {
  function findCurrentBlockLocal(blocks: ListBlock[], t: Date): ListBlock | null {
    if (blocks.length === 0) return null;
    const sorted = [...blocks].sort((a, b) => b.sequence_order - a.sequence_order);
    for (const b of sorted) {
      const start = new Date(b.start_date + "T00:00:00").getTime();
      const end = new Date(b.end_date + "T23:59:59").getTime();
      if (t.getTime() >= start && t.getTime() <= end + 7 * 86400000) return b;
    }
    return sorted[0] ?? null;
  }
  // Usato allora solo per i residui del blocco precedente, che non si vedevano.
  void findCurrentBlockLocal(cb, today);
  const keyOf = (etId: string | null, st: string) => etId ?? `st:${st}`;
  const agg = new Map<string, { used: number; total: number }>();
  for (const a of cAllocs) {
    const k = keyOf(a.event_type_id, a.session_type);
    const cur = agg.get(k) ?? { used: 0, total: 0 };
    cur.total += a.quantity_assigned;
    agg.set(k, cur);
  }
  for (const bk of cBookings) {
    if (bk.status !== "completed" && bk.status !== "late_cancelled" && bk.status !== "scheduled")
      continue;
    const cur = agg.get(keyOf(bk.event_type_id ?? null, bk.session_type));
    if (!cur) continue;
    cur.used += 1;
  }
  const summary = [...agg.values()]
    .map((r) => ({ ...r, used: Math.min(r.used, r.total) }))
    .filter((r) => r.total > 0);
  const totalUsed = summary.reduce((s, r) => s + r.used, 0);
  const totalQty = summary.reduce((s, r) => s + r.total, 0);
  if (c.status === "archived") return "archived";
  if (getRenewal(c, cb, cAllocs, today)) return "expiring";
  if (totalQty > 0 && totalUsed >= totalQty) return "completed";
  return "active";
}

describe("findCurrentBlock di current-block.ts al posto della copia locale", () => {
  it("sui dati di prova nessuno stato cambia", async () => {
    const { getRenewalInfo } = await import("@/lib/renewal");
    for (const c of CLIENTS) {
      const cb = BLOCKS.filter((b) => b.client_id === c.id);
      const blockIds = new Set(cb.map((b) => b.id));
      const before = statusBefore(
        c,
        cb,
        ALLOCATIONS.filter((a) => blockIds.has(a.block_id)),
        BOOKINGS.filter((b) => b.client_id === c.id),
        NOW,
        getRenewalInfo,
      );
      expect(row(c.id).status, c.id).toBe(before);
    }
  });
});

describe("crediti in scheda (L8)", () => {
  it("percorso fisso: blocco in corso e «k di N»", () => {
    expect(row("giulia").credits).toEqual({
      title: "Crediti del blocco 3 di 6",
      left: 5,
      total: 6,
      label: "5 di 6 rimasti",
      short: "5/6",
    });
  });
  it("mensile: «Crediti del mese»; libero: «Crediti extra»", () => {
    expect(row("luca").credits?.title).toBe("Crediti del mese");
    expect(row("luca").credits?.label).toBe("5 di 14 rimasti");
    expect(row("elena").credits).toMatchObject({ title: "Crediti extra", label: "2 di 7 rimasti" });
  });
  it("in scadenza: il motivo di getRenewalInfo", () => {
    expect(row("marta").renewal?.reason).toBe("Il blocco scade tra 2 giorni");
    expect(row("sara").renewal?.reason).toBe("1 credito rimasto");
    expect(row("giulia").renewal).toBeNull();
  });
});

describe("ordinamenti (L7)", () => {
  const all = filterRows(rows, "all", "");
  it("nome, con la parità risolta per id", () => {
    expect(ids(sortRows(all, "name"))).toEqual([
      "andrea",
      "andrea2",
      "davide",
      "elena",
      "giulia",
      "luca",
      "marta",
      "sara",
    ]);
  });
  it("crediti residui: meno in cima, a parità per nome", () => {
    expect(ids(sortRows(all, "left"))).toEqual([
      "davide",
      "sara",
      "andrea",
      "andrea2",
      "elena",
      "marta",
      "giulia",
      "luca",
    ]);
  });
  it("scadenza del blocco: prima chi finisce prima, liberi in fondo", () => {
    expect(ids(sortRows(all, "expiry"))).toEqual([
      "davide",
      "marta",
      "luca",
      "sara",
      "andrea",
      "giulia",
      "andrea2",
      "elena",
    ]);
  });
  it("ultima sessione svolta: la più recente in cima", () => {
    expect(ids(sortRows(all, "activity")).slice(0, 4)).toEqual([
      "marta",
      "andrea",
      "andrea2",
      "sara",
    ]);
    expect(ids(sortRows(all, "activity")).at(-1)).toBe("elena");
  });
  it("presenza più bassa in cima, senza dati in fondo, parità per nome", () => {
    const sorted = sortRows(all, "attendance");
    expect(sorted.map((r) => [r.client.id, r.attendance])).toEqual([
      ["andrea", 50],
      ["andrea2", 50],
      ["marta", 67],
      ["sara", 75],
      ["giulia", 83],
      ["davide", 100],
      ["luca", 100],
      ["elena", null],
    ]);
  });
});

describe("presenza: lista e Profilo dicono lo stesso numero (V5)", () => {
  it("per ogni cliente", () => {
    for (const c of CLIENTS) {
      // Il Profilo carica le sessioni del cliente in ordine di data decrescente, annullate comprese.
      const profile = BOOKINGS.filter((b) => b.client_id === c.id).sort(
        (a, b) => Date.parse(b.scheduled_at) - Date.parse(a.scheduled_at),
      );
      expect(profileEngagement(profile, NOW).att, c.id).toBe(row(c.id).attendance);
    }
  });
  it("un'annullata dal coach non conta, un'assenza di 12 settimane fa nemmeno", () => {
    expect(row("giulia").attendance).toBe(83);
    expect(row("luca").attendance).toBe(100);
  });
});

describe("URL (T4)", () => {
  it("legge e scrive tutti i parametri", () => {
    const s = parseClientsSearch({
      q: "gi",
      stato: "expiring",
      vista: "tabella",
      ordina: "attendance",
      new: "cliente",
    });
    expect(s).toEqual({
      q: "gi",
      stato: "expiring",
      vista: "tabella",
      ordina: "attendance",
      new: "cliente",
    });
    const st = clientsState(s);
    expect(st).toEqual({ q: "gi", tab: "expiring", view: "table", sort: "attendance" });
    expect(clientsSearchOf(st)).toEqual({
      q: "gi",
      stato: "expiring",
      vista: "tabella",
      ordina: "attendance",
    });
  });
  it("valori sbagliati e predefiniti non si scrivono", () => {
    expect(
      parseClientsSearch({ stato: "all", vista: "x", ordina: "name", new: "sessione" }),
    ).toEqual({
      q: undefined,
      stato: undefined,
      vista: undefined,
      ordina: undefined,
      new: undefined,
    });
    expect(clientsSearchOf({ q: "", tab: "all", view: "grid", sort: "name" })).toEqual({
      q: undefined,
      stato: undefined,
      vista: undefined,
      ordina: undefined,
    });
  });
  it("new=cliente si toglie", () => {
    expect(withoutNewParam({ q: "x", new: "cliente" })).toEqual({ q: "x", new: undefined });
  });
  it("tornando dal Profilo ricerca, tab, ordine e vista sono quelli di prima", () => {
    const states: ClientsListState[] = [
      { q: "giulia", tab: "active", view: "table", sort: "left" },
      { q: "", tab: "expiring", view: "grid", sort: "expiry" },
      { q: "34011", tab: "archived", view: "table", sort: "activity" },
      { q: "", tab: "all", view: "grid", sort: "attendance" },
    ];
    for (const st of states) {
      // La scheda porta nella cronologia la ricerca della lista; il Profilo la rilegge.
      const back = backToListSearch({ clientsSearch: clientsSearchOf(st) });
      expect(clientsState(back)).toEqual(st);
    }
    expect(backToListSearch(undefined)).toEqual({});
    expect(
      backToListSearch({ clientsSearch: { new: "cliente", stato: "active" } }).new,
    ).toBeUndefined();
  });
});
