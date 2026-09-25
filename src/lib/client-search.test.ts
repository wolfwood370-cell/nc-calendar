import { describe, expect, it } from "vitest";
import { clientPlanLabel, searchClients, type SearchableClient } from "@/lib/client-search";

const client = (
  id: string,
  full_name: string,
  extra: Partial<SearchableClient> = {},
): SearchableClient => ({
  id,
  full_name,
  email: `${id}@email.it`,
  phone: null,
  status: "active",
  ...extra,
});

const CLIENTS = [
  client("giulia", "Giulia Bianchi", { phone: "+39 340 118 22 09" }),
  client("luca", "Luca Verdi", { email: "luca.verdi@email.it", phone: "+39 347 220 71 33" }),
  client("marta", "Marta Conti"),
  client("nicolo", "Nicolò Galli"),
  client("roberto", "Roberto Fontana", { status: "archived" }),
];

const ids = (list: SearchableClient[]) => list.map((c) => c.id);

describe("searchClients", () => {
  it("ricerca vuota → nessun risultato", () => {
    expect(searchClients(CLIENTS, "")).toEqual([]);
    expect(searchClients(CLIENTS, "   ")).toEqual([]);
  });

  it("cerca nel nome senza distinguere maiuscole e accenti", () => {
    expect(ids(searchClients(CLIENTS, "BIAN"))).toEqual(["giulia"]);
    expect(ids(searchClients(CLIENTS, "nicolo"))).toEqual(["nicolo"]);
  });

  it("cerca nell'email: la parte prima della «@», l'indirizzo intero solo se la ricerca ha «@»", () => {
    expect(ids(searchClients(CLIENTS, "luca.verdi"))).toEqual(["luca"]);
    expect(ids(searchClients(CLIENTS, "luca.verdi@email"))).toEqual(["luca"]);
    // «ma» è nel dominio di tutti (email.it): trova solo Marta, per nome.
    expect(ids(searchClients(CLIENTS, "ma"))).toEqual(["marta"]);
    expect(searchClients(CLIENTS, "email.it")).toEqual([]);
  });

  it("cerca nel telefono solo con almeno 3 cifre, ignorando spazi e prefisso", () => {
    expect(ids(searchClients(CLIENTS, "340 118"))).toEqual(["giulia"]);
    expect(ids(searchClients(CLIENTS, "+39 347"))).toEqual(["luca"]);
    expect(searchClients(CLIENTS, "34")).toEqual([]);
  });

  it("esclude gli archiviati", () => {
    expect(searchClients(CLIENTS, "roberto")).toEqual([]);
  });

  it("prima i nomi che iniziano con la ricerca, poi in ordine alfabetico", () => {
    const list = [
      client("a", "Anna Amari"),
      client("b", "Marco Rossi"),
      client("c", "Chiara Marchi"),
      client("d", "Mario Bianchi"),
      client("e", "Paolo Neri", { email: "marzo.paolo@email.it" }),
    ];
    // Nome che inizia (Marco, Mario) · parola che inizia (Marchi) · dentro il nome (Amari) · email.
    expect(ids(searchClients(list, "mar"))).toEqual(["b", "d", "c", "a", "e"]);
  });

  it("al massimo 6 risultati", () => {
    const many = Array.from({ length: 9 }, (_, i) => client(`c${i}`, `Cliente ${i}`));
    expect(searchClients(many, "cliente")).toHaveLength(6);
  });
});

describe("clientPlanLabel", () => {
  it("usa l'etichetta del pacchetto se c'è", () => {
    expect(clientPlanLabel({ path_type: "fixed", pack_label: "PT Pack 12" })).toBe("PT Pack 12");
  });

  it.each([
    ["recurring", "Abbonamento Mensile"],
    ["free", "Cliente Libero"],
    ["fixed", "Percorso Fisso"],
  ])("percorso %s → «%s»", (path_type, label) => {
    expect(clientPlanLabel({ path_type, pack_label: null })).toBe(label);
  });
});
