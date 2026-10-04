// La riga di Sessioni (passata 03), resa sul server come client-day-strip.test.ts:
// quattro sessioni di Giulia di client-sessions.test.ts, lunedì 28/09/2026 alle
// 10:40 (ora locale).

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientSessionRow } from "@/components/client-session-row";
import { sessionRow, type SessionBooking, type SessionEventType } from "@/lib/client-sessions";

const at = (m: number, d: number, h: number, min = 0) => new Date(2026, m - 1, d, h, min);
const NOW = at(9, 28, 10, 40);

const TYPES: SessionEventType[] = [
  { id: "pt", name: "Sessione PT", color: "#D50000", location_type: "physical" },
  { id: "call", name: "Call di consulenza", color: "#039BE5", location_type: "online" },
];
const RATINGS: ReadonlyMap<string, number> = new Map([
  ["p4", 5],
  ["p5", 4],
]);

const s = (
  id: string,
  typeId: string,
  when: Date,
  status: SessionBooking["status"],
  durationMin = 60,
): SessionBooking => ({
  id,
  status,
  scheduled_at: when.toISOString(),
  duration_min: durationMin,
  client_confirmed_at: null,
  title: null,
  event_type_id: typeId,
  session_type: "PT Session",
  deleted_at: null,
  category: "client_session",
});

const html = (b: SessionBooking) =>
  renderToStaticMarkup(
    createElement(ClientSessionRow, {
      row: sessionRow(b, TYPES, RATINGS, NOW),
      onOpen: () => {},
    }),
  );

/** Il tag di apertura del pulsante. */
const buttonTag = (markup: string) => {
  const tag = markup.match(/^<button[^>]*>/)?.[0];
  if (!tag) throw new Error("pulsante assente");
  return tag;
};
/** Il tag di apertura del riquadro della data: il primo span dentro il pulsante. */
const tileTag = (markup: string) => {
  const tag = markup.match(/^<button[^>]*>(<span[^>]*>)/)?.[1];
  if (!tag) throw new Error("riquadro assente");
  return tag;
};

describe("ClientSessionRow", () => {
  it("un pulsante col nome accessibile, i testi della riga e i colori della tipologia", () => {
    const markup = html(s("u2", "pt", at(9, 30, 10), "scheduled"));
    const button = buttonTag(markup);
    expect(button).toContain('type="button"');
    expect(button).toContain(
      'aria-label="Mercoledì 30 settembre, 10:00–11:00, Sessione PT, da confermare"',
    );
    for (const text of [">mer<", ">30<", ">10:00–11:00<", ">Sessione PT<", ">Da confermare<"]) {
      expect(markup).toContain(text);
    }
    expect(tileTag(markup)).toContain('style="background-color:#D500001a;color:#D50000"');
  });

  it("il testo del riquadro ripiega sul primario sotto 4,5:1", () => {
    const markup = html(s("u1", "call", at(9, 28, 10, 15), "scheduled", 45));
    expect(tileTag(markup)).toContain("color:var(--color-aura-primary)");
    expect(markup).toContain(">Call di consulenza · online<");
    expect(markup).toContain(">In corso<");
  });

  it("valutata: la stella, il voto e il voto nel nome accessibile", () => {
    const markup = html(s("p4", "pt", at(9, 23, 11), "completed"));
    expect(markup).toContain('fill="var(--color-rating-star)"');
    expect(markup).toContain("5 su 5");
    expect(buttonTag(markup)).toMatch(/aria-label="[^"]*, svolta, valutata 5 su 5"/);
    expect(markup).toContain(">Svolta<");
  });

  it("annullata: il riquadro sul fondo neutro, senza colori della tipologia", () => {
    const markup = html(s("p10", "pt", at(10, 10, 9), "cancelled"));
    expect(markup).toContain(">Annullata<");
    const tile = tileTag(markup);
    expect(tile).not.toContain("style=");
    expect(tile).toContain("bg-surface-container-low");
    expect(markup).not.toContain("#D50000");
  });

  it("niente stella senza voto", () => {
    const markup = html(s("u2", "pt", at(9, 30, 10), "scheduled"));
    expect(markup).not.toContain("--color-rating-star");
    expect(markup).not.toContain("su 5");
  });
});
