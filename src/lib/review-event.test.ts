// La catena di ?reviewEventId= (regressione del brief della passata 10):
// Panoramica e Calendario la scrivono, il layout /trainer la valida e la
// legge, «Assegna evento» si apre con quell'id e chiudendolo la si toglie.
// Nessun test la copriva: qui ogni anello, letto dai sorgenti, e la
// validazione, eseguita.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { uuidParam } from "@/lib/search-params";

const read = (f: string) => readFileSync(f, "utf8");
const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

describe("reviewEventId · chi lo scrive", () => {
  it("la Panoramica, dal pulsante «Assegna»", () => {
    expect(read("src/components/overview-desktop.tsx")).toMatch(
      /search: \(prev: Record<string, unknown>\) => \(\{ \.\.\.prev, reviewEventId: id \}\)/,
    );
  });
  it("il Calendario, dal tile da assegnare e dall'evento nell'URL", () => {
    const src = read("src/components/calendar-desktop.tsx");
    expect(src).toMatch(/go\(\{ event: undefined, reviewEventId: b\.id \}, true\)/);
    expect(src).toMatch(/go\(\{ reviewEventId: id \}\)/);
  });
});

describe("reviewEventId · il layout /trainer", () => {
  const src = read("src/routes/trainer.tsx");
  it("lo valida con uuidParam", () => {
    expect(src).toMatch(/reviewEventId: uuidParam\(search\.reviewEventId\)/);
  });
  it("lo legge e apre «Assegna evento» con quell'id", () => {
    expect(src).toMatch(/const \{ reviewEventId \} = Route\.useSearch\(\);/);
    expect(src).toMatch(
      /<AssignEventDialog eventId=\{reviewEventId \?\? null\} onClose=\{closeReviewDialog\} \/>/,
    );
  });
  it("chiudendo il dialog lo toglie dall'URL, senza una voce nella cronologia", () => {
    expect(src).toMatch(
      /search: \(prev: TrainerSearch\) => \(\{ \.\.\.prev, reviewEventId: undefined \}\),\s*replace: true/,
    );
  });
  it("il dialog si apre solo con un id", () => {
    expect(read("src/components/assign-event-dialog.tsx")).toMatch(
      /<CoachDialog open=\{!!eventId\} onOpenChange=\{\(o\) => !o && onClose\(\)\}>/,
    );
  });
});

describe("reviewEventId · la validazione", () => {
  it("un uuid passa, il resto si scarta", () => {
    expect(uuidParam(ID)).toBe(ID);
    expect(uuidParam("non-un-id")).toBeUndefined();
    expect(uuidParam(42)).toBeUndefined();
    expect(uuidParam(undefined)).toBeUndefined();
  });
});
