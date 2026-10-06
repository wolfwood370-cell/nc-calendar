import { describe, expect, it } from "vitest";
import {
  autoRenewHint,
  blockChip,
  buildWeekRows,
  changedWeeks,
  daysAgo,
  dirtyLabel,
  hasShiftedWeeks,
  inSessionFilter,
  isScheduleDirty,
  leavesSchedule,
  longDay,
  moveWeek,
  opensPackage,
  orphanLinkLabel,
  packageCta,
  packageSummary,
  parseProfileSearch,
  profileSearchOf,
  profileTab,
  rebaseWeeks,
  recentSessions,
  regenerateWeeks,
  renewalControl,
  sessionFilterCounts,
  upcomingSessions,
} from "@/lib/client-profile";

/** Venerdì 25/09/2026 alle 10:40 di Roma. */
const NOW = new Date("2026-09-25T10:40:00+02:00");

// Giulia: percorso fisso da 6 blocchi dal 13/07, il blocco 3 è in corso.
const BLOCKS = [1, 2, 3, 4, 5, 6].map((n) => {
  const start = new Date(Date.UTC(2026, 6, 13 + (n - 1) * 28));
  const end = new Date(start.getTime() + 27 * 86_400_000);
  return {
    id: `b${n}`,
    sequence_order: n,
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    status: "active",
  };
});

describe("tab nell'URL", () => {
  it("tab=percorso|sessioni restano, il resto è la panoramica", () => {
    expect(profileTab(parseProfileSearch({ tab: "percorso" }))).toBe("percorso");
    expect(profileTab(parseProfileSearch({ tab: "sessioni" }))).toBe("sessioni");
    expect(profileTab(parseProfileSearch({}))).toBe("panoramica");
    expect(parseProfileSearch({ tab: "boh" })).toEqual({ tab: undefined });
  });

  it("tab=pacchetto apre il dialog sulla panoramica", () => {
    const s = parseProfileSearch({ tab: "pacchetto" });
    expect(opensPackage(s)).toBe(true);
    expect(profileTab(s)).toBe("panoramica");
  });

  it("ogni tab scrive il suo parametro; la panoramica nessuno", () => {
    expect(profileSearchOf("percorso")).toEqual({ tab: "percorso" });
    expect(profileSearchOf("sessioni")).toEqual({ tab: "sessioni" });
    expect(profileSearchOf("panoramica")).toEqual({});
    for (const tab of ["panoramica", "percorso", "sessioni"] as const) {
      expect(profileTab(parseProfileSearch({ ...profileSearchOf(tab) }))).toBe(tab);
    }
  });
});

describe("protezione all'uscita", () => {
  const here = { pathname: "/trainer/clients/giulia", search: { tab: "percorso" as const } };

  it("un'altra pagina o un altro tab lasciano il percorso", () => {
    expect(leavesSchedule(here, { pathname: "/trainer/clients", search: {} })).toBe(true);
    expect(leavesSchedule(here, { pathname: here.pathname, search: {} })).toBe(true);
    expect(leavesSchedule(here, { pathname: here.pathname, search: { tab: "sessioni" } })).toBe(
      true,
    );
    expect(leavesSchedule(here, { pathname: here.pathname, search: { tab: "pacchetto" } })).toBe(
      true,
    );
  });

  it("restare sul tab Percorso non è un'uscita", () => {
    expect(leavesSchedule(here, { pathname: here.pathname, search: { tab: "percorso" } })).toBe(
      false,
    );
  });
});

describe("settimane da salvare", () => {
  const saved = buildWeekRows(2, "2026-09-07", []);

  it("le settimane si contano dalla data d'inizio, 4 per blocco", () => {
    expect(saved).toHaveLength(8);
    expect(saved[0]).toEqual({
      week_number: 1,
      block_number: 1,
      monday_date: "2026-09-07",
      shifted: false,
    });
    expect(saved[4]?.block_number).toBe(2);
    expect(saved[7]?.monday_date).toBe("2026-10-26");
  });

  it("le settimane salvate in weekly_schedule vincono sulla data d'inizio", () => {
    const rows = buildWeekRows(1, "2026-09-07", [
      { week_number: 2, monday_date: "2026-09-21", shifted: true },
    ]);
    expect(rows.map((r) => r.monday_date)).toEqual([
      "2026-09-07",
      "2026-09-21",
      "2026-09-21",
      "2026-09-28",
    ]);
    expect(rows[1]?.shifted).toBe(true);
  });

  it("spostare una settimana la segna da salvare, con le successive che la seguono", () => {
    // Mercoledì 23/09: si porta al lunedì 21/09.
    const rows = moveWeek(saved, 1, new Date(2026, 8, 23));
    expect(rows[1]).toMatchObject({ monday_date: "2026-09-21", shifted: true });
    expect(rows[2]).toMatchObject({ monday_date: "2026-09-28", shifted: false });
    expect(rows[0]).toBe(saved[0]);
    expect(changedWeeks(rows, saved)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(isScheduleDirty(rows, saved, "2026-09-07", "2026-09-07")).toBe(true);
    expect(dirtyLabel(changedWeeks(rows, saved).length)).toBe("7 settimane modificate");
    expect(hasShiftedWeeks(rows)).toBe(true);
  });

  it("l'ultima settimana spostata: una sola da salvare", () => {
    const rows = moveWeek(saved, 7, new Date(2026, 10, 2));
    expect(changedWeeks(rows, saved)).toEqual([8]);
    expect(dirtyLabel(1)).toBe("1 settimana modificata");
  });

  it("nessun cambio, niente da salvare; la data d'inizio conta", () => {
    expect(changedWeeks(saved, saved)).toEqual([]);
    expect(isScheduleDirty(saved, saved, "2026-09-07", "2026-09-07")).toBe(false);
    expect(isScheduleDirty(saved, saved, "2026-09-14", "2026-09-07")).toBe(true);
    expect(dirtyLabel(0, true)).toBe("Data d'inizio modificata");
  });

  it("rimettere la data di prima non lascia niente da salvare", () => {
    const moved = moveWeek(saved, 7, new Date(2026, 10, 2));
    const back = moved.map((r, i) =>
      i === 7 ? { ...r, monday_date: "2026-10-26", shifted: false } : r,
    );
    expect(changedWeeks(back, saved)).toEqual([]);
  });

  it("le date standard tolgono ogni spostamento", () => {
    const moved = moveWeek(saved, 1, new Date(2026, 8, 21));
    const std = regenerateWeeks(moved, new Date(2026, 8, 7));
    expect(std).toEqual(saved);
    expect(hasShiftedWeeks(std)).toBe(false);
  });

  it("un ricaricamento non cancella le settimane non salvate", () => {
    const current = moveWeek(saved, 7, new Date(2026, 10, 2));
    // Il server ha un blocco in più (pacchetto rinnovato): 12 settimane.
    const server = buildWeekRows(3, "2026-09-07", []);
    const merged = rebaseWeeks(server, saved, current);
    expect(merged).toHaveLength(12);
    expect(merged[7]).toMatchObject({ monday_date: "2026-11-02", shifted: true });
    expect(merged[8]).toEqual(server[8]);
    expect(changedWeeks(merged, server)).toEqual([8]);
  });
});

describe("rinnovo automatico", () => {
  it("mensile: l'interruttore, acceso o spento", () => {
    expect(renewalControl("recurring", true)).toEqual({ kind: "toggle", on: true });
    expect(renewalControl("recurring", false)).toEqual({ kind: "toggle", on: false });
  });

  it("fisso spento: niente", () => {
    expect(renewalControl("fixed", false)).toBeNull();
  });

  it("fisso ancora acceso: niente, perché dal giro del 02/10/2026 il server non lo rinnova (passata 10)", () => {
    expect(renewalControl("fixed", true)).toBeNull();
  });

  it("cliente libero: niente", () => {
    expect(renewalControl("free", true)).toBeNull();
  });

  it("sotto l'interruttore: il giorno del blocco nuovo o cosa succede senza", () => {
    expect(autoRenewHint(true, "2026-10-18")).toBe("Nuovo blocco il 19 ott 2026");
    expect(autoRenewHint(false, "2026-10-18")).toBe("Alla scadenza il cliente non potrà prenotare");
  });

  it("l'articolo davanti al giorno: «l'8», «l'11», «il 1°» (passata 10)", () => {
    expect(autoRenewHint(true, "2026-10-07")).toBe("Nuovo blocco l'8 ott 2026");
    expect(autoRenewHint(true, "2026-10-10")).toBe("Nuovo blocco l'11 ott 2026");
    expect(autoRenewHint(true, "2026-09-30")).toBe("Nuovo blocco il 1° ott 2026");
  });
});

describe("intestazione e pacchetto", () => {
  it("«Blocco 3 di 6» per il fisso, «Mese 3» per l'abbonamento, niente per i liberi", () => {
    expect(blockChip("fixed", BLOCKS, NOW)).toBe("Blocco 3 di 6");
    expect(blockChip("recurring", BLOCKS.slice(0, 3), NOW)).toBe("Mese 3");
    expect(blockChip("free", [], NOW)).toBeNull();
  });

  it("un blocco annullato non conta", () => {
    const withCancelled = BLOCKS.map((b) => (b.id === "b6" ? { ...b, status: "cancelled" } : b));
    expect(blockChip("fixed", withCancelled, NOW)).toBe("Blocco 3 di 5");
  });

  it("pulsante principale", () => {
    expect(packageCta("free", false, false)).toBe("Assegna pacchetto");
    expect(packageCta("fixed", true, true)).toBe("Rinnova pacchetto");
    expect(packageCta("fixed", true, false)).toBe("Gestisci pacchetto");
    expect(packageCta("fixed", false, false)).toBe("Assegna pacchetto");
  });

  it("riepilogo: fine del blocco in corso, segmenti e crediti del blocco", () => {
    const s = packageSummary(
      "fixed",
      BLOCKS,
      [
        {
          block_id: "b3",
          event_type_id: "pt",
          session_type: "PT Session",
          quantity_assigned: 16,
          quantity_booked: 13,
        },
        {
          block_id: "b2",
          event_type_id: "pt",
          session_type: "PT Session",
          quantity_assigned: 16,
          quantity_booked: 16,
        },
      ],
      NOW,
    );
    expect(s.expiryLabel).toBe("Il blocco in corso termina il 4 ott 2026");
    expect(s.blockLabel).toBe("Blocco 3 di 6");
    expect(s.segments).toEqual(["past", "past", "current", "future", "future", "future"]);
    expect(s.creditsTitle).toBe("Crediti del blocco in corso");
    expect(s.credits).toEqual([
      expect.objectContaining({ eventTypeId: "pt", assigned: 16, left: 3 }),
    ]);
  });

  it("abbonamento: crediti del mese, niente segmenti; libero: a consumo", () => {
    const r = packageSummary("recurring", BLOCKS.slice(0, 3), [], NOW);
    expect(r.blockLabel).toBe("Abbonamento · mese 3");
    expect(r.segments).toEqual([]);
    expect(r.creditsTitle).toBe("Crediti del mese");
    expect(packageSummary("free", [], [], NOW).expiryLabel).toBe("A consumo");
  });
});

describe("sessioni", () => {
  const list = [
    { id: "a", status: "scheduled", scheduled_at: "2026-10-02T05:30:00Z" },
    { id: "b", status: "scheduled", scheduled_at: "2026-09-28T07:00:00Z" },
    { id: "c", status: "no_show", scheduled_at: "2026-09-23T09:00:00Z" },
    { id: "d", status: "completed", scheduled_at: "2026-09-21T07:00:00Z" },
    { id: "e", status: "late_cancelled", scheduled_at: "2026-09-16T07:00:00Z" },
    { id: "f", status: "cancelled", scheduled_at: "2026-09-15T07:00:00Z" },
    { id: "g", status: "scheduled", scheduled_at: "2026-09-25T07:00:00Z" },
  ];

  it("filtri con i conteggi; «Annullate» comprende le annullate tardi", () => {
    expect(sessionFilterCounts(list)).toEqual({
      all: 7,
      scheduled: 3,
      completed: 1,
      no_show: 1,
      cancelled: 2,
    });
    expect(inSessionFilter("late_cancelled", "cancelled")).toBe(true);
    expect(inSessionFilter("late_cancelled", "no_show")).toBe(false);
  });

  it("prossime: programmate future dalla più vicina; ultime: già iniziate dalla più recente", () => {
    expect(upcomingSessions(list, NOW).map((b) => b.id)).toEqual(["b", "a"]);
    expect(recentSessions(list, NOW, 3).map((b) => b.id)).toEqual(["g", "c", "d"]);
  });

  it("giorno lungo e giorni fa", () => {
    expect(longDay("2026-09-21T07:00:00Z")).toBe("Lunedì 21 settembre");
    expect(daysAgo("2026-09-21T07:00:00Z", NOW)).toBe("4 giorni fa");
    expect(daysAgo("2026-09-24T07:00:00Z", NOW)).toBe("ieri");
    expect(daysAgo("2026-09-25T07:00:00Z", NOW)).toBe("oggi");
  });
});

describe("sessioni fuori percorso", () => {
  it("il testo dice da quale blocco viene il credito", () => {
    expect(orphanLinkLabel(BLOCKS, "2026-09-01T15:00:00Z", NOW)).toBe("Collega al blocco 2");
    expect(orphanLinkLabel(BLOCKS, "2026-09-18T15:00:00Z", NOW)).toBe("Collega al blocco in corso");
    expect(orphanLinkLabel(BLOCKS, "2027-09-24T15:00:00Z", NOW)).toBe("Collega ai crediti extra");
  });
});
