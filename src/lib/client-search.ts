// ----------------------------------------------------------------------------
// Ricerca clienti dell'header coach (audit S2)
// ----------------------------------------------------------------------------
// Cerca per nome, email e telefono (almeno 3 cifre), esclusi gli archiviati,
// al massimo 6 risultati. Riferimento: searchClients in
// design_handoff_coach_redesign/designs/nc-store.js. In più: niente accenti
// nel confronto («nicolo» trova «Nicolò»), prima i nomi che iniziano con la
// ricerca e poi l'ordine alfabetico; l'email si confronta sulla parte prima
// della «@», e per intero solo se la ricerca contiene «@» (altrimenti «ma»
// troverebbe tutti gli indirizzi @email.it).
// ----------------------------------------------------------------------------

export const CLIENT_SEARCH_LIMIT = 6;
/** Cifre minime perché la ricerca guardi anche il telefono. */
export const CLIENT_SEARCH_MIN_PHONE_DIGITS = 3;

export interface SearchableClient {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  /** profiles.status: "active" | "archived". */
  status: string;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** 0 nome che inizia con la ricerca, 1 parola del nome, 2 dentro il nome, 3 email o telefono. */
function matchRank(c: SearchableClient, q: string, digits: string): number | null {
  const name = fold(c.full_name ?? "");
  if (name.startsWith(q)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  const email = fold(c.email ?? "");
  if ((q.includes("@") ? email : email.split("@")[0]!).includes(q)) return 3;
  if (
    digits.length >= CLIENT_SEARCH_MIN_PHONE_DIGITS &&
    (c.phone ?? "").replace(/\D/g, "").includes(digits)
  ) {
    return 3;
  }
  return null;
}

export function searchClients<T extends SearchableClient>(
  clients: readonly T[],
  query: string,
  limit: number = CLIENT_SEARCH_LIMIT,
): T[] {
  const q = fold(query.trim());
  if (!q) return [];
  const digits = query.replace(/\D/g, "");
  const found: { client: T; rank: number; name: string }[] = [];
  for (const client of clients) {
    if (client.status === "archived") continue;
    const rank = matchRank(client, q, digits);
    if (rank !== null) found.push({ client, rank, name: client.full_name ?? client.email ?? "" });
  }
  return found
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "it", { sensitivity: "base" }))
    .slice(0, limit)
    .map((f) => f.client);
}

/** Piano del cliente come nella lista Clienti: etichetta del pacchetto, altrimenti il tipo di percorso. */
export function clientPlanLabel(c: {
  path_type?: string | null;
  pack_label?: string | null;
}): string {
  if (c.pack_label) return c.pack_label;
  if (c.path_type === "recurring") return "Abbonamento Mensile";
  if (c.path_type === "free") return "Cliente Libero";
  return "Percorso Fisso";
}
