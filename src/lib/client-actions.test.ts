import { describe, expect, it } from "vitest";
import {
  ActionConflictError,
  cancelInvitation,
  invitationWriteError,
  restoreInvitation,
  sentAgo,
  setArchived,
  undoArchive,
  type ClientActionsStore,
} from "@/lib/client-actions";

function memory() {
  const invitations = [
    { id: "i1", email: "federica@email.it", status: "pending" },
    { id: "i2", email: "matteo@email.it", status: "pending" },
  ];
  const profiles = [{ id: "c1", status: "active" }];
  const store: ClientActionsStore = {
    async setInvitationStatus(id, from, to) {
      const row = invitations.find((i) => i.id === id && i.status === from);
      if (!row) return false;
      if (
        to === "pending" &&
        invitations.some((o) => o !== row && o.status === "pending" && o.email === row.email)
      ) {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
      row.status = to;
      return true;
    },
    async setClientStatus(id, from, to) {
      const row = profiles.find((p) => p.id === id && p.status === from);
      if (!row) return false;
      row.status = to;
      return true;
    },
  };
  return { store, invitations, profiles };
}

describe("«Annulla invito» e «Ripristina»", () => {
  it("Ripristina rimette lo stesso invito in attesa", async () => {
    const m = memory();
    await cancelInvitation(m.store, "i1");
    expect(m.invitations[0]!.status).toBe("cancelled");
    await restoreInvitation(m.store, "i1");
    expect(m.invitations[0]).toEqual({ id: "i1", email: "federica@email.it", status: "pending" });
  });
  it("se nel frattempo è stato mandato un altro invito alla stessa email, lo dice", async () => {
    const m = memory();
    await cancelInvitation(m.store, "i1");
    m.invitations.push({ id: "i3", email: "federica@email.it", status: "pending" });
    const e = await restoreInvitation(m.store, "i1").catch((x: { code?: string }) => x);
    expect(invitationWriteError(e as { code?: string })).toBe(
      "C'è già un altro invito in attesa per questa email.",
    );
    expect(m.invitations[0]!.status).toBe("cancelled");
  });
  it("un invito già accettato non si annulla", async () => {
    const m = memory();
    m.invitations[1]!.status = "accepted";
    await expect(cancelInvitation(m.store, "i2")).rejects.toThrow(ActionConflictError);
    expect(m.invitations[1]!.status).toBe("accepted");
  });
});

describe("«Archivia» e «Ripristina»", () => {
  it("immediato, e Ripristina rimette lo stato di prima", async () => {
    const m = memory();
    const before = await setArchived(m.store, { id: "c1", status: "active" }, true);
    expect(m.profiles[0]!.status).toBe("archived");
    await undoArchive(m.store, { id: "c1" }, "archived", before);
    expect(m.profiles[0]!.status).toBe("active");
  });
  it("se è cambiato nel frattempo non tocca niente", async () => {
    const m = memory();
    await setArchived(m.store, { id: "c1", status: "active" }, true);
    m.profiles[0]!.status = "active";
    await expect(undoArchive(m.store, { id: "c1" }, "archived", "active")).rejects.toThrow(
      ActionConflictError,
    );
  });
});

describe("«inviato … fa»", () => {
  // Ore locali, come le altre prove con le date: sentAgo conta i giorni del
  // calendario di chi guarda, e con +02:00 scritto nelle stringhe la prova a
  // Los Angeles cadeva («ieri» invece di «oggi»). Passata 10 del lato cliente.
  const now = new Date(2026, 8, 25, 10, 40);
  const at = (day: number, h: number) => new Date(2026, 8, day, h, 0).toISOString();
  it("oggi, ieri, N giorni", () => {
    expect(sentAgo(at(25, 7), now)).toBe("inviato oggi");
    expect(sentAgo(at(24, 20), now)).toBe("inviato ieri");
    expect(sentAgo(at(22, 9), now)).toBe("inviato 3 giorni fa");
  });
});
