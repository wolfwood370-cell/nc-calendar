import { describe, expect, it } from "vitest";
import { SessionChangedError } from "@/lib/cancel-session";
import type { BookingStatus } from "@/lib/mock-data";
import {
  changeSessionOutcome,
  outcomeMessage,
  withOutcome,
  type OutcomeStore,
} from "@/lib/session-outcome";

/** Archivio in memoria con la stessa condizione dello store Supabase. */
function memoryStore(rows: Record<string, { status: BookingStatus; deleted_at: string | null }>) {
  const writes: string[] = [];
  const store: OutcomeStore = {
    async updateSession(id, expected, patch) {
      const r = rows[id];
      if (!r || r.status !== expected.status || !!r.deleted_at !== expected.deleted) return false;
      Object.assign(r, patch);
      writes.push(`${id}:${patch.status}`);
      return true;
    },
  };
  return { store, rows, writes };
}

describe("changeSessionOutcome", () => {
  it("check-in e «Ripristina»: la sessione torna com'era", async () => {
    const db = memoryStore({ s1: { status: "scheduled", deleted_at: null } });
    await changeSessionOutcome(db.store, "s1", "scheduled", "completed");
    expect(db.rows.s1!.status).toBe("completed");
    await changeSessionOutcome(db.store, "s1", "completed", "scheduled");
    expect(db.rows.s1).toEqual({ status: "scheduled", deleted_at: null });
    expect(db.writes).toEqual(["s1:completed", "s1:scheduled"]);
  });

  it("assente e «Annulla assenza»", async () => {
    const db = memoryStore({ s1: { status: "scheduled", deleted_at: null } });
    await changeSessionOutcome(db.store, "s1", "scheduled", "no_show");
    expect(db.rows.s1!.status).toBe("no_show");
    await changeSessionOutcome(db.store, "s1", "no_show", "scheduled");
    expect(db.rows.s1!.status).toBe("scheduled");
  });

  it("se la sessione è cambiata nel frattempo non scrive e lo dice", async () => {
    const db = memoryStore({
      s1: { status: "cancelled", deleted_at: null },
      s2: { status: "scheduled", deleted_at: "2026-09-25T08:00:00Z" },
    });
    await expect(changeSessionOutcome(db.store, "s1", "scheduled", "completed")).rejects.toThrow(
      SessionChangedError,
    );
    await expect(changeSessionOutcome(db.store, "s2", "scheduled", "completed")).rejects.toThrow(
      SessionChangedError,
    );
    expect(db.writes).toEqual([]);
  });

  it("doppio clic: il secondo check-in non passa", async () => {
    const db = memoryStore({ s1: { status: "scheduled", deleted_at: null } });
    await changeSessionOutcome(db.store, "s1", "scheduled", "completed");
    await expect(changeSessionOutcome(db.store, "s1", "scheduled", "completed")).rejects.toThrow(
      SessionChangedError,
    );
    expect(db.writes).toEqual(["s1:completed"]);
  });
});

describe("testi e aggiornamento ottimistico", () => {
  it("toast del brief", () => {
    expect(outcomeMessage("completed", "Giulia Bianchi")).toBe(
      "Sessione di Giulia Bianchi segnata come svolta.",
    );
    expect(outcomeMessage("no_show", "Giulia Bianchi")).toBe(
      "Assenza registrata per Giulia Bianchi.",
    );
    expect(outcomeMessage("scheduled", "Giulia Bianchi")).toBe(
      "Stato ripristinato: Giulia Bianchi torna in agenda.",
    );
  });

  it("cambia solo la riga della sessione, le altre restano le stesse", () => {
    const list = [
      { id: "a", status: "scheduled" },
      { id: "b", status: "scheduled" },
    ];
    const next = withOutcome(list, "b", "completed");
    expect(next).toEqual([
      { id: "a", status: "scheduled" },
      { id: "b", status: "completed" },
    ]);
    expect(next[0]).toBe(list[0]);
    expect(list[1]!.status).toBe("scheduled");
  });
});
