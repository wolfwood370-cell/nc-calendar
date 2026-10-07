import { describe, expect, it } from "vitest";
import { isAllDayEvent } from "@/lib/all-day-event";
import {
  collectRepairCandidates,
  reconcileWith,
  writeBackEventId,
  yearStartISO,
  type PageResult,
  type ReconcileEvent,
  type ReconcileRpcResult,
} from "@/lib/gcal-repair";

type Row = { id: string; scheduled_at: string };

/** Pagine lette da un elenco, come .range(from, to) di PostgREST. */
function pages(rows: Row[], calls: Array<[number, number]> = []) {
  return async (from: number, to: number): Promise<PageResult<Row>> => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };
}

const allDay = (i: number): Row => ({ id: `g${i}`, scheduled_at: "2026-10-11T00:00:00+00:00" });
const real = (i: number): Row => ({ id: `r${i}`, scheduled_at: "2026-10-11T08:00:00+00:00" });

describe("«tutto il giorno»: la mezzanotte UTC in ogni scrittura (passata 11)", () => {
  it("giornalieri: Z, +00:00, +0000, -00:00, con o senza millesimi", () => {
    for (const at of [
      "2026-10-11T00:00:00Z",
      "2026-10-11T00:00:00.000Z",
      "2026-10-11T00:00:00+00:00",
      "2026-10-11T00:00:00.000+00:00",
      "2026-10-11T00:00:00+0000",
      "2026-10-11T00:00:00-00:00",
    ]) {
      expect(isAllDayEvent({ scheduled_at: at })).toBe(true);
    }
  });

  it("non giornalieri: la mezzanotte di Roma, un altro orario, un altro fuso", () => {
    for (const at of [
      "2026-10-10T22:00:00+00:00",
      "2026-10-11T00:00:01+00:00",
      "2026-10-11T00:30:00Z",
      "2026-10-11T00:00:00+02:00",
    ]) {
      expect(isAllDayEvent({ scheduled_at: at })).toBe(false);
    }
  });
});

describe("ripristino · le sessioni a cui ridare l'evento (passata 11)", () => {
  it("i giornalieri non occupano la passata: se ne prendono 50 vere anche dopo 120 giornalieri", async () => {
    const rows = [
      ...Array.from({ length: 120 }, (_, i) => allDay(i)),
      ...Array.from({ length: 60 }, (_, i) => real(i)),
    ];
    const r = await collectRepairCandidates(pages(rows));
    expect(r.rows).toHaveLength(50);
    expect(r.rows.every((x) => x.id.startsWith("r"))).toBe(true);
    expect(r.more).toBe(false);
  });

  it("una pagina con 3 giornalieri e 50 vere: 50, non 47", async () => {
    const rows = [
      allDay(0),
      allDay(1),
      allDay(2),
      ...Array.from({ length: 60 }, (_, i) => real(i)),
    ];
    expect((await collectRepairCandidates(pages(rows))).rows).toHaveLength(50);
  });

  it("finite le righe si ferma e lo dice con meno di 50", async () => {
    const calls: Array<[number, number]> = [];
    const r = await collectRepairCandidates(pages([allDay(0), real(1), real(2)], calls));
    expect(r.rows.map((x) => x.id)).toEqual(["r1", "r2"]);
    expect(r.more).toBe(false);
    expect(calls).toEqual([[0, 99]]);
  });

  it("al tetto di pagine con altre righe: more", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => allDay(i));
    const r = await collectRepairCandidates(pages(rows));
    expect(r.rows).toEqual([]);
    expect(r.more).toBe(true);
  });

  it("una lettura fallita: l'errore, e nessuna riga", async () => {
    const r = await collectRepairCandidates(async () => ({ data: null, error: { message: "x" } }));
    expect(r).toEqual({ rows: [], more: false, error: { message: "x" } });
  });

  it("la finestra parte dal 1° gennaio dell'anno, anche nel 2027", () => {
    expect(yearStartISO(new Date(2026, 9, 6))).toBe("2026-01-01T00:00:00.000Z");
    expect(yearStartISO(new Date(2027, 1, 3))).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("ripristino · l'id dell'evento si scrive solo dove manca (passata 11)", () => {
  type Answer = { data: unknown[] | null; error: unknown } | "throw";
  type Read = { data: { google_event_id: string | null } | null; error: unknown } | "throw";
  function deps(write: Answer, read: Read = { data: { google_event_id: null }, error: null }) {
    const deleted: number[] = [];
    const reads: number[] = [];
    return {
      deleted,
      reads,
      d: {
        createdId: "g-nuovo",
        writeIfEmpty: async () => {
          if (write === "throw") throw new Error("rete");
          return write;
        },
        readId: async () => {
          reads.push(1);
          if (read === "throw") throw new Error("rete");
          return read;
        },
        deleteCreated: async () => {
          deleted.push(1);
        },
      },
    };
  }

  it("scritto: l'evento resta, senza riletture", async () => {
    const { d, deleted, reads } = deps({ data: [{ id: "b1" }], error: null });
    expect(await writeBackEventId(d)).toBe("written");
    expect(deleted).toEqual([]);
    expect(reads).toEqual([]);
  });

  it("un altro ripristino l'ha già scritto: il proprio evento si toglie, e non è creato", async () => {
    const { d, deleted } = deps({ data: [], error: null });
    expect(await writeBackEventId(d)).toBe("taken");
    expect(deleted).toEqual([1]);
  });

  it("la scrittura fallisce davvero (l'id è ancora vuoto): il proprio evento si toglie, perché alla passata dopo ne nascerebbe un secondo", async () => {
    for (const w of [{ data: null, error: { message: "x" } }, "throw"] as const) {
      const { d, deleted } = deps(w);
      expect(await writeBackEventId(d)).toBe("failed");
      expect(deleted).toEqual([1]);
    }
  });

  it("errore ambiguo con la scrittura fatta (la risposta persa): l'id è il nostro, l'evento resta", async () => {
    const { d, deleted } = deps(
      { data: null, error: { message: "", status: 0 } },
      {
        data: { google_event_id: "g-nuovo" },
        error: null,
      },
    );
    expect(await writeBackEventId(d)).toBe("written");
    expect(deleted).toEqual([]);
  });

  it("errore e un altro id nella riga: ha vinto un altro, il proprio evento si toglie", async () => {
    const { d, deleted } = deps("throw", { data: { google_event_id: "g-altro" }, error: null });
    expect(await writeBackEventId(d)).toBe("taken");
    expect(deleted).toEqual([1]);
  });

  it("errore e rilettura fallita: non si toglie niente, perché la riconciliazione annullerebbe una sessione legata a un evento cancellato", async () => {
    for (const r of [{ data: null, error: { message: "x" } }, "throw"] as const) {
      const { d, deleted } = deps("throw", r);
      expect(await writeBackEventId(d)).toBe("kept");
      expect(deleted).toEqual([]);
    }
  });

  it("Google che non risponde alla cancellazione non fa lanciare", async () => {
    const r = await writeBackEventId({
      createdId: "g-nuovo",
      writeIfEmpty: async () => ({ data: [], error: null }),
      readId: async () => ({ data: null, error: null }),
      deleteCreated: async () => {
        throw new Error("google");
      },
    });
    expect(r).toBe("taken");
  });
});

describe("riconciliazione · annullamenti e spostamenti (passata 11)", () => {
  const byEventId = new Map([
    ["e1", { id: "b1", scheduledMs: Date.parse("2026-10-07T08:00:00Z") }],
    ["e2", { id: "b2", scheduledMs: Date.parse("2026-10-08T08:00:00Z") }],
    ["e3", { id: "b3", scheduledMs: Date.parse("2026-10-09T08:00:00Z") }],
  ]);

  it("un annullamento non riuscito si conta fra le sessioni non aggiornate", async () => {
    const r = await reconcileWith(
      [
        { id: "e1", status: "cancelled", startMs: null },
        { id: "e2", status: "cancelled", startMs: null },
        { id: "e3", status: "confirmed", startMs: Date.parse("2026-10-09T09:00:00Z") },
        { id: "fuori", status: "cancelled", startMs: null },
      ],
      byEventId,
      {
        cancel: async (id) => ({ error: id === "b2" ? { message: "no" } : null }),
        move: async () => ({ error: null }),
      },
    );
    expect(r).toEqual({ cancelled: 1, moved: 1, overlaps: 0, conflicts: 1 });
  });

  it("uno spostamento non riuscito, e uno entro un minuto che non è uno spostamento", async () => {
    const moves: string[] = [];
    const r = await reconcileWith(
      [
        { id: "e1", status: "confirmed", startMs: Date.parse("2026-10-07T08:00:30Z") },
        { id: "e2", status: "confirmed", startMs: Date.parse("2026-10-08T10:00:00Z") },
      ],
      byEventId,
      {
        cancel: async () => ({ error: null }),
        move: async (id, at) => {
          moves.push(`${id}@${at}`);
          return { error: { message: "sovrapposta" } };
        },
      },
    );
    expect(moves).toEqual(["b2@2026-10-08T10:00:00.000Z"]);
    expect(r).toEqual({ cancelled: 0, moved: 0, overlaps: 0, conflicts: 1 });
  });
});

// Dal giro del server del 07/10/2026 reconcile_gcal_cancel e reconcile_gcal_move
// restituiscono l'esito (text). Il ritorno indietro della migrazione le rimette
// void: data nullo, e si conta come prima.
describe("riconciliazione · l'esito delle due RPC (passata 13)", () => {
  const byEventId = new Map([
    ["e1", { id: "b1", scheduledMs: Date.parse("2026-10-07T08:00:00Z") }],
    ["e2", { id: "b2", scheduledMs: Date.parse("2026-10-08T08:00:00Z") }],
    ["e3", { id: "b3", scheduledMs: Date.parse("2026-10-09T08:00:00Z") }],
    ["e4", { id: "b4", scheduledMs: Date.parse("2026-10-10T08:00:00Z") }],
  ]);
  const cancelledOnGoogle = (id: string): ReconcileEvent => ({
    id,
    status: "cancelled",
    startMs: null,
  });
  /** Spostata su Google di due ore. */
  const movedOnGoogle = (id: string): ReconcileEvent => ({
    id,
    status: "confirmed",
    startMs: byEventId.get(id)!.scheduledMs + 2 * 3_600_000,
  });

  /** Le RPC finte, con una risposta per sessione, e i log raccolti. */
  async function run(events: ReconcileEvent[], answers: Record<string, ReconcileRpcResult>) {
    const logs: Array<[string, unknown]> = [];
    const calls: string[] = [];
    const answer = (rpc: string) => async (id: string) => {
      calls.push(`${rpc}:${id}`);
      return answers[id] ?? { data: null, error: null };
    };
    const counts = await reconcileWith(events, byEventId, {
      cancel: answer("cancel"),
      move: answer("move"),
      logError: (what, detail) => logs.push([what, detail]),
    });
    return { counts, logs, calls };
  }

  it("annullata, spostata e sovrapposta: ognuna nel suo conto, e la sovrapposta non è spostata", async () => {
    const { counts, logs, calls } = await run(
      [cancelledOnGoogle("e1"), movedOnGoogle("e2"), movedOnGoogle("e3"), movedOnGoogle("e4")],
      {
        b1: { data: "cancelled", error: null },
        b2: { data: "moved", error: null },
        b3: { data: "overlap", error: null },
        b4: { data: "overlap", error: null },
      },
    );
    expect(calls).toEqual(["cancel:b1", "move:b2", "move:b3", "move:b4"]);
    expect(counts).toEqual({ cancelled: 1, moved: 1, overlaps: 2, conflicts: 0 });
    expect(logs).toEqual([]);
  });

  it("not_scheduled e not_found: la sessione era già cambiata o eliminata, e non si conta", async () => {
    const { counts, logs } = await run(
      [cancelledOnGoogle("e1"), cancelledOnGoogle("e2"), movedOnGoogle("e3"), movedOnGoogle("e4")],
      {
        b1: { data: "not_scheduled", error: null },
        b2: { data: "not_found", error: null },
        b3: { data: "not_scheduled", error: null },
        b4: { data: "not_found", error: null },
      },
    );
    expect(counts).toEqual({ cancelled: 0, moved: 0, overlaps: 0, conflicts: 0 });
    expect(logs).toEqual([]);
  });

  it("il server di prima (void): data nullo o assente si conta come allora", async () => {
    const { counts, logs } = await run(
      [cancelledOnGoogle("e1"), cancelledOnGoogle("e2"), movedOnGoogle("e3"), movedOnGoogle("e4")],
      {
        b1: { data: null, error: null },
        b2: { error: null },
        b3: { data: null, error: null },
        b4: { error: null },
      },
    );
    expect(counts).toEqual({ cancelled: 2, moved: 2, overlaps: 0, conflicts: 0 });
    expect(logs).toEqual([]);
  });

  it("un esito sconosciuto vale come nullo, e va nei log", async () => {
    const { counts, logs } = await run(
      [cancelledOnGoogle("e1"), cancelledOnGoogle("e2"), movedOnGoogle("e3"), movedOnGoogle("e4")],
      {
        b1: { data: "boh", error: null },
        // 'overlap' è un esito dello spostamento, non dell'annullamento.
        b2: { data: "overlap", error: null },
        b3: { data: "cancelled", error: null },
        b4: { data: 42, error: null },
      },
    );
    expect(counts).toEqual({ cancelled: 2, moved: 2, overlaps: 0, conflicts: 0 });
    expect(logs).toEqual([
      ["reconcile_gcal_cancel: esito sconosciuto", { id: "b1", data: "boh" }],
      ["reconcile_gcal_cancel: esito sconosciuto", { id: "b2", data: "overlap" }],
      ["reconcile_gcal_move: esito sconosciuto", { id: "b3", data: "cancelled" }],
      ["reconcile_gcal_move: esito sconosciuto", { id: "b4", data: 42 }],
    ]);
  });

  it("un errore resta un conflitto, qualunque cosa dica data", async () => {
    const error = { message: "no" };
    const { counts, logs } = await run([cancelledOnGoogle("e1"), movedOnGoogle("e2")], {
      b1: { data: "cancelled", error },
      b2: { data: "overlap", error },
    });
    expect(counts).toEqual({ cancelled: 0, moved: 0, overlaps: 0, conflicts: 2 });
    expect(logs).toEqual([
      ["reconcile_gcal_cancel failed", { id: "b1", error }],
      ["reconcile_gcal_move failed", { id: "b2", error }],
    ]);
  });
});
