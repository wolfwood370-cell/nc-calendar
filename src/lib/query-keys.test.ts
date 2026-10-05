// invalidateBookingScope (passata 09): il dettaglio di una sessione è nello
// scope, così una riga del coach che arriva in tempo reale (spostata,
// annullata) rilegge anche il dettaglio aperto; la chiave del vecchio foglio di
// riprogrammazione, che nessuno legge più, no.

import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateBookingScope } from "@/lib/query-keys";

describe("invalidateBookingScope", () => {
  it("rilegge anche il dettaglio aperto, per prefisso; non la chiave che nessuno legge più", () => {
    const keys: unknown[] = [];
    const qc = {
      invalidateQueries: (filters: { queryKey: unknown }) => {
        keys.push(filters.queryKey);
        return Promise.resolve();
      },
    } as unknown as QueryClient;
    invalidateBookingScope(qc, { coachId: "c1", clientId: "u1" });
    expect(keys).toContainEqual(["booking-detail"]);
    expect(keys).toContainEqual(["coach-busy", "c1"]);
    expect(keys.some((k) => Array.isArray(k) && k[0] === "coach-busy-reschedule")).toBe(false);
  });
});
