import { describe, expect, it } from "vitest";
import {
  ALREADY_NOT_BOOKABLE,
  NOT_BOOKABLE_HINT,
  deleteModel,
  inUseReasons,
  inUseSummary,
  isTypeInUse,
  notInUseLines,
  typeUsage,
  usageFooter,
  type TypeUsage,
  type UsageBlock,
  type UsageBooking,
  type UsageData,
} from "@/lib/event-type-usage";

// Venerdì 25/09/2026 alle 10:40 di Roma, come nell'handoff.
const NOW = new Date("2026-09-25T10:40:00+02:00");
const PT = { id: "pt", name: "Sessione PT" };

/** Ora di Roma (estate, +02:00) → ISO. */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+02:00`).toISOString();

let seq = 0;
function booking(p: Partial<UsageBooking> & { scheduled_at: string }): UsageBooking {
  seq += 1;
  return {
    id: `b${seq}`,
    client_id: "marta",
    coach_id: "coach",
    is_personal: false,
    status: "completed",
    deleted_at: null,
    event_type_id: "pt",
    ...p,
  };
}

function block(
  client_id: string,
  end_date: string,
  allocs: [string | null, number, number][],
  deleted_at: string | null = null,
): UsageBlock {
  return {
    client_id,
    end_date,
    deleted_at,
    allocations: allocs.map(([event_type_id, quantity_assigned, quantity_booked]) => ({
      event_type_id,
      quantity_assigned,
      quantity_booked,
    })),
  };
}

const EMPTY: UsageData = {
  bookings: [],
  blocks: [],
  extraCredits: [],
  clients: [],
  shopTitles: [],
};

const usage = (p: Partial<TypeUsage>): TypeUsage => ({
  monthSessions: 0,
  futureSessions: 0,
  clientsWithCredits: 0,
  archivedClientsWithCredits: 0,
  pastSessions: 0,
  soldInShop: false,
  ...p,
});

describe("sessioni di questo mese", () => {
  it("la regola della Distribuzione servizi sul mese intero di Roma, giorni dopo oggi compresi", () => {
    const bookings = [
      booking({ scheduled_at: at("2026-09-02", "10:00"), status: "completed" }), // conta
      booking({ scheduled_at: at("2026-09-10", "18:00"), status: "no_show" }), // conta
      booking({ scheduled_at: at("2026-09-28", "09:00"), status: "scheduled" }), // futura: conta
      booking({ scheduled_at: at("2026-09-30", "23:30"), status: "scheduled" }), // 30/09 a Roma: conta
      booking({ scheduled_at: at("2026-09-15", "10:00"), status: "cancelled" }), // annullata
      booking({ scheduled_at: at("2026-09-16", "10:00"), status: "late_cancelled" }), // annullata tardi
      booking({ scheduled_at: at("2026-09-18", "10:00"), deleted_at: "2026-09-18T12:00:00Z" }), // eliminata
      booking({
        scheduled_at: at("2026-09-20", "10:00"),
        is_personal: true,
        client_id: null,
      }), // impegno personale
      booking({ scheduled_at: at("2026-09-21", "10:00"), client_id: "coach" }), // il coach come cliente
      booking({ scheduled_at: at("2026-08-31", "23:30") }), // agosto a Roma (UTC 31/08)
      booking({ scheduled_at: at("2026-10-01", "00:30"), status: "scheduled" }), // ottobre a Roma (UTC 30/09)
      booking({ scheduled_at: at("2026-09-22", "10:00"), event_type_id: "bia" }), // altra tipologia
    ];
    expect(typeUsage(PT, { ...EMPTY, bookings }, NOW).monthSessions).toBe(4);
  });
});

describe("sessioni future e passate", () => {
  it("future: programmate, non eliminate, dopo adesso, di qualunque cliente", () => {
    const bookings = [
      booking({ scheduled_at: at("2026-09-28", "09:00"), status: "scheduled" }),
      booking({ scheduled_at: at("2026-10-01", "00:30"), status: "scheduled" }),
      booking({ scheduled_at: at("2026-10-05", "09:00"), status: "scheduled", client_id: "luca" }), // archiviato
      booking({ scheduled_at: at("2026-10-06", "09:00"), status: "scheduled", client_id: null }), // da assegnare
      booking({
        scheduled_at: at("2026-10-07", "09:00"),
        status: "scheduled",
        deleted_at: "2026-09-20T09:00:00Z",
      }), // eliminata
      booking({ scheduled_at: at("2026-10-08", "09:00"), status: "cancelled" }), // annullata
      booking({ scheduled_at: at("2026-09-25", "09:00"), status: "scheduled" }), // oggi, già passata
      booking({ scheduled_at: at("2026-09-02", "10:00") }),
    ];
    const u = typeUsage(PT, { ...EMPTY, bookings }, NOW);
    expect(u.futureSessions).toBe(4);
    expect(u.pastSessions).toBe(2);
  });
});

describe("clienti con crediti", () => {
  const clients = [
    { id: "marta", status: "active" },
    { id: "sara", status: "active" },
    { id: "gino", status: "not_started" },
    { id: "elena", status: "active" },
    { id: "paolo", status: "active" },
    { id: "tom", status: "active" },
    { id: "luca", status: "archived" },
    { id: "rita", status: "archived" },
  ];

  it("allocazioni con crediti rimasti in blocchi non eliminati e non finiti, più i crediti extra; archiviati a parte", () => {
    const data: UsageData = {
      ...EMPTY,
      clients,
      blocks: [
        block("marta", "2026-10-18", [["pt", 2, 1]]), // conta
        block("gino", "2026-09-25", [["pt", 1, 0]]), // finisce oggi: conta
        block("sara", "2026-09-20", [["pt", 3, 0]]), // blocco finito
        block("paolo", "2026-10-18", [["pt", 2, 0]], "2026-09-01T09:00:00Z"), // blocco eliminato
        block("tom", "2026-10-18", [["bia", 1, 0]]), // altra tipologia
        block("rita", "2026-10-30", [["pt", 1, 0]]), // archiviata
      ],
      extraCredits: [
        { client_id: "marta", event_type_id: "pt", quantity: 3, quantity_booked: 0 }, // già contata
        { client_id: "luca", event_type_id: "pt", quantity: 5, quantity_booked: 2 }, // archiviato
        { client_id: "elena", event_type_id: "pt", quantity: 1, quantity_booked: 1 }, // esauriti
        { client_id: "anna", event_type_id: "pt", quantity: 2, quantity_booked: 0 }, // non è fra i clienti
      ],
    };
    const u = typeUsage(PT, data, NOW);
    expect(u.clientsWithCredits).toBe(2);
    expect(u.archivedClientsWithCredits).toBe(2);
  });

  it("i crediti extra bastano da soli (non scadono)", () => {
    const data: UsageData = {
      ...EMPTY,
      clients,
      extraCredits: [{ client_id: "sara", event_type_id: "pt", quantity: 1, quantity_booked: 0 }],
    };
    expect(typeUsage(PT, data, NOW).clientsWithCredits).toBe(1);
  });
});

describe("negozio", () => {
  it("la vende se un pacchetto attivo ha il suo nome esatto", () => {
    expect(typeUsage(PT, { ...EMPTY, shopTitles: ["Sessione PT"] }, NOW).soldInShop).toBe(true);
    expect(typeUsage(PT, { ...EMPTY, shopTitles: ["sessione pt"] }, NOW).soldInShop).toBe(false);
  });
});

describe("in uso", () => {
  it("sessioni future, clienti con crediti o negozio; gli archiviati e le passate no", () => {
    expect(isTypeInUse(usage({ futureSessions: 1 }))).toBe(true);
    expect(isTypeInUse(usage({ clientsWithCredits: 1 }))).toBe(true);
    expect(isTypeInUse(usage({ soldInShop: true }))).toBe(true);
    expect(isTypeInUse(usage({ archivedClientsWithCredits: 12, pastSessions: 40 }))).toBe(false);
  });
});

describe("testi", () => {
  it("piè della card, coi singolari", () => {
    expect(usageFooter(usage({ monthSessions: 12, clientsWithCredits: 5 }))).toBe(
      "12 sessioni questo mese · 5 clienti con crediti",
    );
    expect(usageFooter(usage({ monthSessions: 1, clientsWithCredits: 1 }))).toBe(
      "1 sessione questo mese · 1 cliente con crediti",
    );
    expect(usageFooter(usage({}))).toBe("0 sessioni questo mese · 0 clienti con crediti");
  });

  it("in uso: solo le parti vere, con virgole ed «e»", () => {
    const all = usage({ futureSessions: 3, clientsWithCredits: 2, soldInShop: true });
    expect(inUseSummary(all)).toBe(
      "È in uso: 3 sessioni future, 2 clienti hanno crediti di questo tipo e il negozio dei clienti la vende.",
    );
    expect(inUseReasons(all)).toBe(
      "Finché è in uso non si può eliminare: sessioni e crediti perderebbero la tipologia e il negozio dei clienti non la troverebbe più.",
    );
    const one = usage({ futureSessions: 1 });
    expect(inUseSummary(one)).toBe("È in uso: 1 sessione futura.");
    expect(inUseReasons(one)).toBe(
      "Finché è in uso non si può eliminare: le sessioni perderebbero la tipologia.",
    );
    const credits = usage({ clientsWithCredits: 1 });
    expect(inUseSummary(credits)).toBe("È in uso: 1 cliente ha crediti di questo tipo.");
    expect(inUseReasons(credits)).toBe(
      "Finché è in uso non si può eliminare: i crediti perderebbero la tipologia.",
    );
    const shop = usage({ soldInShop: true });
    expect(inUseSummary(shop)).toBe("È in uso: il negozio dei clienti la vende.");
  });

  it("non in uso: sessioni passate e archiviati, se ci sono", () => {
    expect(notInUseLines(usage({}))).toEqual([
      "Non ci sono sessioni future né clienti con crediti di questo tipo.",
    ]);
    expect(notInUseLines(usage({ pastSessions: 40, archivedClientsWithCredits: 12 }))).toEqual([
      "Non ci sono sessioni future né clienti con crediti di questo tipo.",
      "Le sessioni passate restano nello storico, senza più questa tipologia.",
      "I crediti rimasti a 12 clienti archiviati perderebbero la tipologia.",
    ]);
    expect(notInUseLines(usage({ archivedClientsWithCredits: 1 }))[1]).toBe(
      "I crediti rimasti a 1 cliente archiviato perderebbero la tipologia.",
    );
  });

  it("dialog: in uso offre «Rendi non prenotabile»; se è già non prenotabile lo dice e basta", () => {
    const u = usage({ futureSessions: 2 });
    expect(deleteModel({ client_bookable: true }, u)).toEqual({
      kind: "in-use",
      lines: [inUseSummary(u), inUseReasons(u), NOT_BOOKABLE_HINT],
      canMakeNotBookable: true,
    });
    expect(deleteModel({ client_bookable: false }, u)).toEqual({
      kind: "in-use",
      lines: [inUseSummary(u), inUseReasons(u), ALREADY_NOT_BOOKABLE],
      canMakeNotBookable: false,
    });
    expect(deleteModel({ client_bookable: true }, usage({ pastSessions: 3 })).kind).toBe("free");
  });
});
