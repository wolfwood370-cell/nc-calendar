// Il «Salva» del Percorso (passata 13): una chiamata sola a save_path_schedule,
// con le settimane ridotte ai quattro campi che l'RPC vuole. Il coach lo mette
// il server (il coach del cliente), il cliente è p_client_id: client_id e
// coach_id nelle righe non passano. Un errore arriva al chiamante, che lo mostra nel toast
// con errorMessage. Supabase è finto.

import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { savePathSchedule } from "@/lib/path-schedule";
import { errorMessage } from "@/lib/utils";

const CLIENT_ID = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const COACH_ID = "3f2b8c1e-9a4d-4e2f-8b1a-2c3d4e5f6a7b";

describe("savePathSchedule", () => {
  // Con il corpo fra graffe: una funzione restituita da beforeEach vitest la
  // chiama alla fine del test, e rpc() lì darebbe il suo rifiuto al test.
  beforeEach(() => {
    rpc.mockReset();
  });

  it("una chiamata sola, coi tre argomenti e le settimane coi soli quattro campi", async () => {
    // Il conto è quello del server (5), non quello delle righe mandate (2).
    rpc.mockResolvedValue({ data: 5, error: null });
    // Le righe come le potrebbe tenere un componente, con campi in più.
    const rows = [
      {
        week_number: 1,
        block_number: 1,
        monday_date: "2026-10-05",
        shifted: false,
        client_id: CLIENT_ID,
        coach_id: COACH_ID,
        id: "w1",
      },
      {
        week_number: 2,
        block_number: 1,
        monday_date: "2026-10-19",
        shifted: true,
        client_id: CLIENT_ID,
        coach_id: COACH_ID,
      },
    ];
    await expect(
      savePathSchedule({ clientId: CLIENT_ID, pathStartDate: "2026-10-05", rows }),
    ).resolves.toBe(5);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_path_schedule", {
      p_client_id: CLIENT_ID,
      p_path_start_date: "2026-10-05",
      p_rows: [
        { week_number: 1, block_number: 1, monday_date: "2026-10-05", shifted: false },
        { week_number: 2, block_number: 1, monday_date: "2026-10-19", shifted: true },
      ],
    });
    const args = rpc.mock.calls[0]![1] as Record<string, unknown> & {
      p_rows: Record<string, unknown>[];
    };
    expect(Object.keys(args).sort()).toEqual(["p_client_id", "p_path_start_date", "p_rows"]);
    for (const r of args.p_rows) {
      expect(Object.keys(r).sort()).toEqual([
        "block_number",
        "monday_date",
        "shifted",
        "week_number",
      ]);
    }
  });

  it("senza settimane la chiamata c'è lo stesso: data d'inizio e settimane vuote insieme", async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    await expect(
      savePathSchedule({ clientId: CLIENT_ID, pathStartDate: "2026-10-05", rows: [] }),
    ).resolves.toBe(0);
    expect(rpc).toHaveBeenCalledWith("save_path_schedule", {
      p_client_id: CLIENT_ID,
      p_path_start_date: "2026-10-05",
      p_rows: [],
    });
  });

  it.each([
    ["42501", "Permesso negato."],
    ["P0001", "Dati del calendario non validi."],
    ["23505", 'duplicate key value violates unique constraint "weekly_schedule_client_week"'],
    ["23502", 'null value in column "monday_date" violates not-null constraint'],
    ["PGRST202", "Could not find the function public.save_path_schedule in the schema cache"],
  ])("l'errore %s arriva al chiamante, col suo messaggio per il toast", async (code, message) => {
    const error = { code, message, details: null, hint: null };
    rpc.mockResolvedValue({ data: null, error });
    const caught = await savePathSchedule({
      clientId: CLIENT_ID,
      pathStartDate: "2026-10-05",
      rows: [{ week_number: 1, block_number: 1, monday_date: "2026-10-05", shifted: false }],
    }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(caught).toBe(error);
    expect(errorMessage(caught)).toBe(message);
  });

  it("una chiamata che non risponde (la rete) arriva al chiamante", async () => {
    rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      savePathSchedule({ clientId: CLIENT_ID, pathStartDate: "2026-10-05", rows: [] }),
    ).rejects.toThrow("Failed to fetch");
  });
});
