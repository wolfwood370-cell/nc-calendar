import { describe, expect, it } from "vitest";
import {
  canCheckIn,
  confirmLine,
  detailsStatus,
  eventKind,
  lastSessionNote,
  whatsappUrl,
  isOnGrid,
  notOnGoogle,
  notOnGoogleLabel,
  passesFilters,
  tileView,
  type GridBooking,
} from "@/lib/calendar-events";
import { filterStateOf } from "@/lib/calendar-search";

const NOW = new Date("2026-09-25T10:40:00+02:00");
let n = 0;
const b = (over: Partial<GridBooking> = {}): GridBooking => ({
  id: `b${++n}`,
  client_id: "marta",
  coach_id: "coach",
  is_personal: false,
  category: "client_session",
  status: "scheduled",
  deleted_at: null,
  event_type_id: "pt",
  scheduled_at: "2026-09-25T08:00:00.000Z",
  duration_min: 60,
  google_event_id: "g1",
  title: null,
  client_confirmed_at: null,
  ...over,
});

const session = b();
const personal = b({
  client_id: null,
  is_personal: true,
  category: "personal",
  event_type_id: null,
  title: "Dentista",
});
const consulenza = b({
  client_id: null,
  is_personal: true,
  category: "consulenza",
  event_type_id: null,
  title: "Studio Rossi",
});
const imported = b({ client_id: "coach", event_type_id: null, title: "Consulenza Bianchi" });
const toAssign = b({ client_id: null, event_type_id: null, title: "Allenamento" });
const allDay = b({
  client_id: null,
  event_type_id: null,
  title: "Compleanno",
  scheduled_at: "2026-09-25T00:00:00Z",
});
const bia = b({ event_type_id: "bia" });

describe("che cos'è un evento", () => {
  it("sessione, impegno, consulenza (due forme), da assegnare, giornaliero", () => {
    expect([session, personal, consulenza, imported, toAssign, allDay].map(eventKind)).toEqual([
      "session",
      "personal",
      "consulenza",
      "consulenza",
      "assign",
      "allday",
    ]);
  });

  it("annullate ed eliminate non stanno in griglia", () => {
    expect(isOnGrid(b({ status: "cancelled" }))).toBe(false);
    expect(isOnGrid(b({ status: "late_cancelled" }))).toBe(false);
    expect(isOnGrid(b({ deleted_at: "2026-09-24T10:00:00Z" }))).toBe(false);
    expect(isOnGrid(b({ status: "no_show" }))).toBe(true);
  });
});

describe("filtri sulla griglia", () => {
  const all = [session, personal, consulenza, imported, toAssign, allDay, bia];
  const ids = (list: GridBooking[]) => list.map((x) => x.id);
  it("«Da assegnare» solo gli eventi da assegnare", () => {
    expect(ids(all.filter((x) => passesFilters(x, filterStateOf("assign", []))))).toEqual(
      ids([toAssign]),
    );
  });
  it("«Personali» solo gli impegni", () => {
    expect(ids(all.filter((x) => passesFilters(x, filterStateOf("personal", []))))).toEqual(
      ids([personal]),
    );
  });
  it("tipologie: solo sessioni di quelle tipologie", () => {
    expect(ids(all.filter((x) => passesFilters(x, filterStateOf("all", ["bia"]))))).toEqual(
      ids([bia]),
    );
  });
  it("«Tutti»: tutto", () => {
    expect(all.every((x) => passesFilters(x, filterStateOf("all", [])))).toBe(true);
  });
});

describe("tile", () => {
  it("sessione: nome cliente e «Tipologia · ora»; spunta se il cliente ha confermato", () => {
    expect(
      tileView(
        b({ client_confirmed_at: "2026-09-24T10:00:00Z" }),
        { client: "Giulia Bianchi", type: "Personal Training" },
        "10:30",
      ),
    ).toEqual({
      variant: "session",
      title: "Giulia Bianchi",
      sub: "Personal Training · 10:30",
      confirmed: true,
    });
  });
  it("svolta, assente, consulenza, impegno, da assegnare", () => {
    expect(
      tileView(b({ status: "completed" }), { client: "Giulia", type: "PT" }, "10:30").variant,
    ).toBe("done");
    expect(
      tileView(b({ status: "no_show" }), { client: "Giulia", type: "PT" }, "10:30"),
    ).toMatchObject({ variant: "noshow", sub: "Assente · 10:30" });
    expect(tileView(consulenza, {}, "12:00")).toMatchObject({
      variant: "consulenza",
      title: "Studio Rossi",
      sub: "Consulenza esterna · 12:00",
    });
    expect(tileView(personal, {}, "13:00")).toMatchObject({
      variant: "personal",
      title: "Dentista",
      sub: "Personale · 13:00",
    });
    expect(tileView(toAssign, {}, "08:00")).toMatchObject({
      variant: "assign",
      title: "Allenamento",
      sub: "Da assegnare · 08:00",
    });
  });
});

describe("non su Google", () => {
  it("programmate senza evento Google, da ieri in avanti, non impegni né giornalieri", () => {
    const missing = b({ google_event_id: null, scheduled_at: "2026-09-26T08:00:00Z" });
    const list = [
      missing,
      b({ google_event_id: null, scheduled_at: "2026-09-20T08:00:00Z" }),
      b({ google_event_id: null, status: "completed" }),
      b({ ...personal, id: "p2", google_event_id: null }),
      b({ google_event_id: null, scheduled_at: "2026-09-27T00:00:00Z" }),
      session,
    ];
    expect(notOnGoogle(list, NOW).map((x) => x.id)).toEqual([missing.id]);
    expect([notOnGoogleLabel(1), notOnGoogleLabel(3)]).toEqual([
      "1 sessione non è su Google",
      "3 sessioni non sono su Google",
    ]);
  });
});

describe("pannello dettagli", () => {
  const future = b({ scheduled_at: "2026-10-01T08:00:00Z" });
  it("stato", () => {
    expect(detailsStatus(future, NOW)).toEqual({ label: "Programmata", tone: "neutral" });
    expect(detailsStatus(b({ scheduled_at: "2026-09-25T07:00:00Z" }), NOW)).toEqual({
      label: "Da confermare",
      tone: "warning",
    });
    expect(detailsStatus(b({ status: "completed" }), NOW).label).toBe("Svolta");
    expect(detailsStatus(b({ status: "no_show" }), NOW).label).toBe("Assente");
    expect(detailsStatus(personal, NOW).label).toBe("Personale");
    expect(detailsStatus(b({ status: "late_cancelled" }), NOW)).toEqual({
      label: "Annullata",
      tone: "danger",
    });
  });

  it("check-in: oggi o passata, programmata, sessione cliente", () => {
    expect(canCheckIn(b({ scheduled_at: "2026-09-25T16:00:00Z" }), NOW)).toBe(true);
    expect(canCheckIn(b({ scheduled_at: "2026-09-24T16:00:00Z" }), NOW)).toBe(true);
    expect(canCheckIn(future, NOW)).toBe(false);
    expect(canCheckIn(b({ status: "completed" }), NOW)).toBe(false);
    expect(canCheckIn(personal, NOW)).toBe(false);
  });

  it("conferma del cliente solo per le sessioni future", () => {
    expect(confirmLine(future, NOW)).toEqual({
      label: "In attesa di conferma del cliente",
      confirmed: false,
    });
    expect(
      confirmLine(
        b({ scheduled_at: "2026-10-01T08:00:00Z", client_confirmed_at: "2026-09-24T09:00:00Z" }),
        NOW,
      ),
    ).toEqual({
      label: "Presenza confermata dal cliente",
      confirmed: true,
    });
    expect(confirmLine(b({ scheduled_at: "2026-09-25T07:00:00Z" }), NOW)).toBeNull();
  });

  it("WhatsApp con le sole cifre; niente pulsante senza numero", () => {
    expect(whatsappUrl("+39 340 118 22 09")).toBe("https://wa.me/393401182209");
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl("")).toBeNull();
  });

  it("WhatsApp col prefisso del paese: lo 00 via, il 39 ai numeri italiani senza (passata 09)", () => {
    expect(whatsappUrl("0039 340 118 22 09")).toBe("https://wa.me/393401182209");
    expect(whatsappUrl("340 118 22 09")).toBe("https://wa.me/393401182209");
    expect(whatsappUrl("3401182209")).toBe("https://wa.me/393401182209");
    expect(whatsappUrl("393401182209")).toBe("https://wa.me/393401182209");
    expect(whatsappUrl("02 1234 5678")).toBe("https://wa.me/390212345678");
    expect(whatsappUrl("+44 20 7946 0958")).toBe("https://wa.me/442079460958");
    expect(whatsappUrl("0044 20 7946 0958")).toBe("https://wa.me/442079460958");
    expect(whatsappUrl("+3401182209")).toBe("https://wa.me/3401182209");
    expect(whatsappUrl("00")).toBeNull();
    expect(whatsappUrl("javascript:alert(1)")).toBeNull();
  });

  it("ultima nota: la più recente fra le sessioni già iniziate", () => {
    const list = [
      {
        client_id: "marta",
        scheduled_at: "2026-09-20T08:00:00Z",
        deleted_at: null,
        trainer_notes: "Vecchia",
      },
      {
        client_id: "marta",
        scheduled_at: "2026-09-23T08:00:00Z",
        deleted_at: null,
        trainer_notes: " Squat 4×6 ",
      },
      {
        client_id: "marta",
        scheduled_at: "2026-09-30T08:00:00Z",
        deleted_at: null,
        trainer_notes: "Futura",
      },
      {
        client_id: "sara",
        scheduled_at: "2026-09-24T08:00:00Z",
        deleted_at: null,
        trainer_notes: "Altra",
      },
    ];
    expect(lastSessionNote(list, "marta", NOW)).toBe("Squat 4×6");
    expect(lastSessionNote(list, "luca", NOW)).toBeNull();
  });
});
