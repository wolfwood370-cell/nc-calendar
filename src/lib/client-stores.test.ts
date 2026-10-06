// La creazione del cliente dice al coach il motivo del rifiuto (passata 10 del
// lato cliente): con una risposta non 2xx supabase.functions.invoke dà data
// nullo, e il corpo della funzione resta nella Response di error.context.

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { supabaseClientCreateStore } from "@/lib/client-stores";

const INPUT = { email: "giulia@example.com", password: "x", first_name: "Giulia", last_name: "B" };

/** L'errore di supabase-js per una risposta non 2xx: il corpo resta nella Response. */
function httpError(status: number, body: string): Error {
  return Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    context: new Response(body, { status }),
  });
}

describe("supabaseClientCreateStore.createUser", () => {
  beforeEach(() => invoke.mockReset());

  it("col 400 di admin-create-user restituisce il suo motivo, non il messaggio generico", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(400, JSON.stringify({ error: "Email già registrata." })),
    });
    await expect(supabaseClientCreateStore.createUser(INPUT)).resolves.toEqual({
      error: "Email già registrata.",
    });
    expect(invoke).toHaveBeenCalledWith("admin-create-user", { body: INPUT });
  });

  it("con un corpo che non è JSON restituisce il testo, e senza corpo il messaggio dell'errore", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(500, "Impossibile creare l'invito.") });
    await expect(supabaseClientCreateStore.createUser(INPUT)).resolves.toEqual({
      error: "Impossibile creare l'invito.",
    });
    invoke.mockResolvedValue({ data: null, error: new Error("rete") });
    await expect(supabaseClientCreateStore.createUser(INPUT)).resolves.toEqual({ error: "rete" });
  });

  it("una risposta 2xx con l'id è un utente creato; senza id è un errore", async () => {
    invoke.mockResolvedValue({ data: { user_id: "u-1" }, error: null });
    await expect(supabaseClientCreateStore.createUser(INPUT)).resolves.toEqual({ userId: "u-1" });
    invoke.mockResolvedValue({ data: { error: "Dati non validi." }, error: null });
    await expect(supabaseClientCreateStore.createUser(INPUT)).resolves.toEqual({
      error: "Dati non validi.",
    });
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(supabaseClientCreateStore.createUser(INPUT)).resolves.toEqual({
      error: "Creazione cliente non riuscita.",
    });
  });
});
