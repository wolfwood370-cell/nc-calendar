// La fila dei giorni (passata 02), resa sul server come segmented-control.test.ts:
// i giorni della PT di Giulia, lunedì 28/09/2026 alle 10:40 (ora locale).

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientDayStrip } from "@/components/client-day-strip";
import type { CreditWindow } from "@/lib/booking-rules";
import { getClientSlotDays } from "@/lib/client-slots";
import type { AvailabilityRow } from "@/lib/queries";

const at = (m: number, d: number, h: number, min = 0) => new Date(2026, m - 1, d, h, min);
const NOW = at(9, 28, 10, 40);

const weekdays = (start: string, end: string): AvailabilityRow[] =>
  [1, 2, 3, 4, 5, 6].map((d) => ({
    id: `a${d}-${start}`,
    coach_id: "coach",
    day_of_week: d,
    start_time: start,
    end_time: end,
  }));
const busy = (start: Date, minutes: number) => ({
  start: start.getTime(),
  end: start.getTime() + minutes * 60_000,
});
const window = (from: string, until: string, blockId: string, n: number): CreditWindow => ({
  from,
  until,
  source: "block",
  blockId,
  blockNumber: n,
});

const { days } = getClientSlotDays({
  now: NOW,
  durationMin: 60,
  bufferMin: 10,
  availability: [...weekdays("09:00:00", "13:00:00"), ...weekdays("15:00:00", "20:00:00")],
  exceptions: [],
  busy: [
    busy(at(9, 29, 10), 70),
    busy(at(9, 29, 18, 30), 70),
    busy(at(9, 30, 9), 240),
    busy(at(9, 30, 15), 300),
  ],
  windows: [
    window("2026-09-14", "2026-10-11", "b3", 3),
    window("2026-10-12", "2026-11-08", "b4", 4),
  ],
  optimization: true,
});

const html = renderToStaticMarkup(
  createElement(ClientDayStrip, { days, selectedIso: "2026-09-29", onSelect: () => {} }),
);
/** Il tag di apertura del pulsante del giorno. */
const buttonOf = (isoDate: string) => {
  const tag = html.match(new RegExp(`<button[^>]*data-day="${isoDate}"[^>]*>`))?.[0];
  if (!tag) throw new Error(`giorno ${isoDate} assente`);
  return tag;
};

describe("ClientDayStrip · la PT di Giulia", () => {
  it("un pulsante per giorno, dal 28/09 al 12/10", () => {
    expect(html.match(/<button/g)).toHaveLength(15);
  });

  it("il 29/09 è scelto, gli altri no", () => {
    expect(buttonOf("2026-09-29")).toContain('aria-pressed="true"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(buttonOf("2026-09-29")).toContain('aria-label="Martedì 29 settembre, 4 orari"');
  });

  it("il 28/09 senza orari è disabilitato, col suo motivo", () => {
    const tag = buttonOf("2026-09-28");
    expect(tag).toContain("disabled");
    expect(tag).toContain('aria-label="Lunedì 28 settembre, serve 24 ore di preavviso"');
  });

  it("il 12/10, coi crediti del blocco 4, si sceglie", () => {
    expect(buttonOf("2026-10-12")).not.toContain("disabled");
  });

  it("la fila esce fino ai bordi col margine della pagina", () => {
    expect(html).toContain("margin:0 -16px;padding:2px 16px 6px");
    const sposta = renderToStaticMarkup(
      createElement(ClientDayStrip, { days, selectedIso: null, onSelect: () => {}, gutter: 20 }),
    );
    expect(sposta).toContain("margin:0 -20px;padding:2px 20px 6px");
    expect(sposta).not.toContain('aria-pressed="true"');
  });
});
