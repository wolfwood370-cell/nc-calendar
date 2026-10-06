import { describe, expect, it } from "vitest";
import { cardCredits } from "@/lib/client-list";
import { extraTotals, extraValidNow, validExtras } from "@/lib/extra-credits";

const NOW = new Date("2026-10-06T12:00:00Z");
const coach = { quantity: 5, quantity_booked: 2, expires_at: "2100-01-01T00:00:00.000Z" };
const boosterValid = { quantity: 3, quantity_booked: 1, expires_at: "2026-10-31T22:59:59.999Z" };
const boosterExpired = { quantity: 3, quantity_booked: 0, expires_at: "2026-10-01T21:59:59.999Z" };

describe("i crediti extra che il coach vede (passata 11)", () => {
  it("vale fino all'istante della scadenza, compreso", () => {
    expect(extraValidNow({ expires_at: "2026-10-06T12:00:00Z" }, NOW)).toBe(true);
    expect(extraValidNow({ expires_at: "2026-10-06T11:59:59.999Z" }, NOW)).toBe(false);
    expect(extraValidNow({ expires_at: "non-una-data" }, NOW)).toBe(false);
  });

  it("un Booster scaduto con crediti rimasti non conta", () => {
    expect(validExtras([coach, boosterValid, boosterExpired], NOW)).toEqual([coach, boosterValid]);
    expect(extraTotals([coach, boosterValid, boosterExpired], NOW)).toEqual({ total: 8, left: 5 });
    expect(extraTotals([boosterExpired], NOW)).toEqual({ total: 0, left: 0 });
  });

  it("la scheda dell'elenco Clienti di un cliente libero conta solo quelli validi", () => {
    const client = { id: "c", path_type: "free" } as Parameters<typeof cardCredits>[0];
    const extras = [
      { client_id: "c", ...coach },
      { client_id: "c", ...boosterExpired },
    ];
    expect(cardCredits(client, [], [], extras, NOW)).toMatchObject({ left: 3, total: 5 });
  });
});
