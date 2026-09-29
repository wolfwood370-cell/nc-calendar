import { CalendarDays, CalendarPlus, Home, Sparkles, User } from "lucide-react";
import { describe, expect, it } from "vitest";
import {
  CLIENT_TABS,
  activeClientTab,
  backFallback,
  bookSubtitle,
  clientPageTitle,
  homeSubtitle,
  isClientPath,
  sessionsBadge,
  sessionsSubtitle,
  showsTabBar,
  upcomingCount,
} from "@/lib/client-shell";
import type { StatusBooking } from "@/lib/client-session-status";
import type { RenewalBlock } from "@/lib/renewal";

// Lunedì 28 settembre 2026 alle 10:40, ora locale (uguale con Roma e con UTC).
const NOW = new Date(2026, 8, 28, 10, 40);
// Lunedì 29 settembre 2031: un orologio implicito fa cadere il test.
const NOW_2031 = new Date(2031, 8, 29, 10, 40);
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const session = (over: Partial<StatusBooking> = {}): StatusBooking => ({
  status: "scheduled",
  scheduled_at: at(30 * HOUR),
  duration_min: 60,
  client_confirmed_at: null,
  ...over,
});

// Le sette sessioni del prompt.
const A = session({ scheduled_at: at(30 * HOUR) }); // fra 30 ore, non confermata
const B = session({ scheduled_at: at(26 * HOUR), client_confirmed_at: at(-HOUR) }); // confermata
const C = session({ scheduled_at: at(72 * HOUR) }); // fra 72 ore
const D = session({ scheduled_at: at(-20 * MIN) }); // iniziata 20 minuti fa, 60 minuti
const E = session({ scheduled_at: at(-24 * HOUR), status: "completed" }); // svolta ieri
const F = session({ scheduled_at: at(24 * HOUR), status: "cancelled" }); // annullata, domani
const G = session({ scheduled_at: at(-26 * HOUR) }); // in programma e finita ieri
const SEVEN = [A, B, C, D, E, F, G];

let blockSeq = 0;
function blocks(dates: [string, string][], status = "active"): RenewalBlock[] {
  return dates.map(([start_date, end_date], i) => ({
    id: `blocco-${++blockSeq}`,
    status,
    start_date,
    end_date,
    sequence_order: i + 1,
  }));
}

// Percorso fisso di sei blocchi di quattro settimane: il terzo dal 14/09 all'11/10.
const FIXED: [string, string][] = [
  ["2026-07-20", "2026-08-16"],
  ["2026-08-17", "2026-09-13"],
  ["2026-09-14", "2026-10-11"],
  ["2026-10-12", "2026-11-08"],
  ["2026-11-09", "2026-12-06"],
  ["2026-12-07", "2027-01-03"],
];

describe("CLIENT_TABS · le cinque schede", () => {
  it("in quest'ordine, con percorso, etichetta e icona", () => {
    expect(CLIENT_TABS.map((t) => [t.key, t.to, t.label, t.icon])).toEqual([
      ["home", "/client", "Home", Home],
      ["prenota", "/client/book", "Prenota", CalendarPlus],
      ["sessioni", "/client/sessions", "Sessioni", CalendarDays],
      ["booster", "/client/store", "Booster", Sparkles],
      ["profilo", "/client/settings", "Profilo", User],
    ]);
  });
});

describe("activeClientTab · per segmenti di percorso", () => {
  it("Home solo su /client, le altre sul loro percorso", () => {
    expect(activeClientTab("/client")).toBe("home");
    expect(activeClientTab("/client/")).toBe("home");
    expect(activeClientTab("/client/book")).toBe("prenota");
    expect(activeClientTab("/client/sessions")).toBe("sessioni");
    expect(activeClientTab("/client/store")).toBe("booster");
    expect(activeClientTab("/client/settings")).toBe("profilo");
  });

  it("il dettaglio di una sessione accende Sessioni, le Notifiche nessuna", () => {
    expect(activeClientTab("/client/bookings/abc")).toBe("sessioni");
    expect(activeClientTab("/client/notifications")).toBeNull();
  });

  it("un prefisso di stringa non basta", () => {
    expect(activeClientTab("/clientx")).toBeNull();
    expect(activeClientTab("/client/bookx")).toBeNull();
    expect(activeClientTab("/client/storefront")).toBeNull();
  });
});

describe("showsTabBar · la barra nelle cinque schede", () => {
  it("c'è sulle cinque schede", () => {
    for (const path of [
      "/client",
      "/client/book",
      "/client/sessions",
      "/client/store",
      "/client/settings",
    ]) {
      expect(showsTabBar(path)).toBe(true);
    }
  });

  it("non c'è sulle pagine aperte", () => {
    expect(showsTabBar("/client/bookings/abc")).toBe(false);
    expect(showsTabBar("/client/notifications")).toBe(false);
  });
});

describe("isClientPath · le route del cliente", () => {
  it("/client e ciò che sta sotto sì, il resto no", () => {
    expect(isClientPath("/client")).toBe(true);
    expect(isClientPath("/client/book")).toBe(true);
    expect(isClientPath("/clients")).toBe(false);
    expect(isClientPath("/trainer")).toBe(false);
    expect(isClientPath("/")).toBe(false);
  });
});

describe("sessionsBadge e upcomingCount · Sessioni", () => {
  it("sette sessioni: una da confermare, quattro in programma (in corso compresa)", () => {
    expect(sessionsBadge(SEVEN, NOW)).toEqual({ count: 1, label: "Sessioni, 1 da confermare" });
    expect(upcomingCount(SEVEN, NOW)).toBe(4);
    expect(sessionsSubtitle(upcomingCount(SEVEN, NOW))).toBe("4 sessioni in programma");
  });

  it("con due da confermare, e con nessuna", () => {
    const A2 = session({ scheduled_at: at(40 * HOUR) });
    expect(sessionsBadge([A, A2, C], NOW)).toEqual({
      count: 2,
      label: "Sessioni, 2 da confermare",
    });
    expect(sessionsBadge([B, C, E], NOW)).toEqual({ count: 0, label: "Sessioni" });
  });

  it("i tre sottotitoli", () => {
    expect(sessionsSubtitle(0)).toBe("Nessuna sessione in programma");
    expect(sessionsSubtitle(1)).toBe("1 sessione in programma");
    expect(sessionsSubtitle(6)).toBe("6 sessioni in programma");
  });
});

describe("bookSubtitle · il sottotitolo di Prenota sul blocco di riferimento", () => {
  it("percorso fisso: il terzo di sei, fino all'11 ottobre", () => {
    expect(bookSubtitle("fixed", blocks(FIXED), NOW)).toBe(
      "Blocco 3 di 6 · fino a domenica 11 ottobre",
    );
  });

  it("un blocco annullato non conta, né nel numero né nel totale", () => {
    const list = blocks(FIXED);
    const cancelled = { ...list[1]!, id: "annullato", status: "cancelled", sequence_order: 2 };
    expect(bookSubtitle("fixed", [...list, cancelled], NOW)).toBe(
      "Blocco 3 di 6 · fino a domenica 11 ottobre",
    );
  });

  it("abbonamento coi mesi dopo già creati: il mese in corso, non l'ultimo creato", () => {
    const months = blocks([
      ["2026-06-05", "2026-07-04"],
      ["2026-07-05", "2026-08-04"],
      ["2026-08-05", "2026-09-04"],
      ["2026-09-05", "2026-10-04"],
      ["2026-10-05", "2026-11-08"],
      ["2026-11-09", "2026-12-06"],
    ]);
    expect(bookSubtitle("recurring", months, NOW)).toBe(
      "Abbonamento mensile · blocco 4 · fino a domenica 4 ottobre",
    );
  });

  it("cliente libero, percorso concluso, blocco da iniziare, nessun blocco", () => {
    expect(bookSubtitle("free", [], NOW)).toBe("Crediti senza scadenza");
    const ended = blocks([
      ["2026-03-02", "2026-03-29"],
      ["2026-03-30", "2026-04-26"],
      ["2026-04-27", "2026-05-24"],
      ["2026-05-25", "2026-06-21"],
      ["2026-06-22", "2026-07-19"],
      ["2026-07-20", "2026-08-16"],
    ]);
    expect(bookSubtitle("fixed", ended, NOW)).toBe("Percorso concluso");
    const starting = blocks([
      ["2026-10-05", "2026-11-01"],
      ["2026-11-02", "2026-11-29"],
      ["2026-11-30", "2026-12-27"],
      ["2026-12-28", "2027-01-24"],
      ["2027-01-25", "2027-02-21"],
      ["2027-02-22", "2027-03-21"],
    ]);
    expect(bookSubtitle("fixed", starting, NOW)).toBe("Blocco 1 di 6 · inizia lunedì 5 ottobre");
    expect(bookSubtitle("fixed", [], NOW)).toBeNull();
  });

  it("nel 2031, con l'ora data e non con l'orologio", () => {
    expect(bookSubtitle("fixed", blocks([["2031-09-15", "2031-10-12"]]), NOW_2031)).toBe(
      "Blocco 1 di 1 · fino a domenica 12 ottobre",
    );
  });
});

describe("homeSubtitle, clientPageTitle, backFallback", () => {
  it("la data di oggi, anche nel 2031", () => {
    expect(homeSubtitle(NOW)).toBe("Lunedì 28 settembre");
    expect(homeSubtitle(NOW_2031)).toBe("Lunedì 29 settembre");
  });

  it("il titolo della scheda del browser", () => {
    expect(clientPageTitle("Sessione")).toBe("Sessione · NC Calendar");
  });

  it("Indietro senza una pagina dell'app prima", () => {
    expect(backFallback("/client/bookings/abc")).toBe("/client/sessions");
    expect(backFallback("/client/notifications")).toBe("/client");
  });
});
