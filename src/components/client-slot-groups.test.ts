// Gli orari di un giorno a gruppi (passata 02), resi sul server come
// segmented-control.test.ts: il 29/09 della PT di Giulia, lunedì 28/09/2026
// alle 10:40 (ora locale). La tastiera si prova nel browser.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientSlotGroups } from "@/components/client-slot-groups";
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

const { days } = getClientSlotDays({
  now: NOW,
  durationMin: 60,
  bufferMin: 10,
  availability: [...weekdays("09:00:00", "13:00:00"), ...weekdays("15:00:00", "20:00:00")],
  exceptions: [],
  busy: [busy(at(9, 29, 10), 70), busy(at(9, 29, 18, 30), 70)],
  windows: [
    { from: "2026-09-14", until: "2026-10-11", source: "block", blockId: "b3", blockNumber: 3 },
  ],
  optimization: true,
});
const TUESDAY = days.find((d) => d.isoDate === "2026-09-29")!;

const render = (selectedIso: string | null) =>
  renderToStaticMarkup(
    createElement(ClientSlotGroups, { day: TUESDAY, selectedIso, onSelect: () => {} }),
  );
/** Il pulsante dell'orario, col suo testo. */
const radioOf = (html: string, time: string) => {
  const tag = html.match(new RegExp(`<button[^>]*>${time}</button>`))?.[0];
  if (!tag) throw new Error(`orario ${time} assente`);
  return tag;
};

describe("ClientSlotGroups · il 29/09 della PT di Giulia", () => {
  const html = render(null);

  it("tre radiogroup con le loro etichette, i consigliati col motivo", () => {
    expect(html.match(/role="radiogroup"/g)).toHaveLength(3);
    expect(html.match(/aria-label="[^"]*"/g)).toEqual([
      'aria-label="Orari consigliati"',
      'aria-label="Orari pomeriggio"',
      'aria-label="Orari sera"',
    ]);
    expect(html).toContain(">Consigliati</p>");
    expect(html).toContain("Subito dopo le altre sessioni della giornata");
  });

  it("le 11:10 consigliate compaiono una volta sola", () => {
    expect(html.match(/>11:10</g)).toHaveLength(1);
  });

  it("senza scelta, il punto di Tab è il primo di ogni gruppo", () => {
    expect(html.match(/tabindex="0"/g)).toHaveLength(3);
    expect(radioOf(html, "15:00")).toContain('tabindex="0"');
    expect(radioOf(html, "16:00")).toContain('tabindex="-1"');
  });

  it("con le 15:00 scelte: aria-checked e il punto di Tab su di loro, non sulle 16:00", () => {
    const chosen = render(TUESDAY.slots.find((s) => s.time === "15:00")!.iso);
    expect(radioOf(chosen, "15:00")).toContain('aria-checked="true"');
    expect(radioOf(chosen, "15:00")).toContain('tabindex="0"');
    expect(radioOf(chosen, "16:00")).toContain('aria-checked="false"');
    expect(radioOf(chosen, "16:00")).toContain('tabindex="-1"');
    expect(chosen.match(/aria-checked="true"/g)).toHaveLength(1);
  });
});
