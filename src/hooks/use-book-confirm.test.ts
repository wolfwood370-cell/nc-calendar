// L'avviso al coach di una prenotazione del cliente (passata 13): il corpo di
// booking-notifications porta booking_id, che la funzione mette nel payload
// della notifica (supabase/functions/booking-notifications/index.ts:235), e la
// riga «Nuova prenotazione» della campanella apre la sessione nel Calendario
// invece del solo giorno. Supabase, l'evento Google e la push sono finti: qui
// conta la chiamata.

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const sendPush = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("@/lib/gcal.functions", () => ({ gcalCreateEvent: async () => ({ ok: true }) }));
vi.mock("@/lib/push", () => ({ sendPush: (...args: unknown[]) => sendPush(...args) }));

import { announce } from "@/hooks/use-book-confirm";

const BOOKING_ID = "3f2b8c1e-9a4d-4e2f-8b1a-2c3d4e5f6a7b";
const COACH_ID = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";

describe("announce · l'avviso al coach", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    sendPush.mockReset();
  });

  it("booking-notifications riceve l'id della sessione appena inserita", () => {
    announce({
      bookingId: BOOKING_ID,
      meId: "c1",
      coachId: COACH_ID,
      meName: "Chiara Russo",
      mePhone: "+39 347 1234567",
      type: {
        eventTypeId: "t1",
        sessionType: "PT Session",
        name: "Personal Training",
        durationMin: 60,
        location: "physical",
        color: null,
        description: null,
      },
      iso: "2026-10-20T07:00:00.000Z",
      endISO: "2026-10-20T08:00:00.000Z",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    // Senza event_type: per la funzione è una prenotazione (booking.created).
    expect(invoke).toHaveBeenCalledWith("booking-notifications", {
      body: {
        coach_id: COACH_ID,
        client_name: "Chiara Russo",
        client_phone: "+39 347 1234567",
        scheduled_at: "2026-10-20T07:00:00.000Z",
        session_label: "Personal Training",
        meeting_link: null,
        booking_id: BOOKING_ID,
      },
    });
    expect(sendPush).toHaveBeenCalledTimes(1);
  });
});
