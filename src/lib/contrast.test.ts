// Contrasto dei chip e dei badge (audit V12, README «Contrasto testo ≥ 4.5:1»).
// Il rapporto si calcola: colori dai token di src/styles.css, classi lette dai
// sorgenti. Rimettere text-outline su un chip, o bg-error-bright sotto il
// badge bianco, fa scendere il rapporto sotto 4.5 e questa prova diventa rossa.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles.css", "utf8");
const TOKENS: Record<string, string> = { white: "#ffffff" };
for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  TOKENS[m[1]!] = m[2]!;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Rapporto WCAG 2.1 fra due token di colore. */
function ratio(fg: string, bg: string): number {
  const a = TOKENS[fg];
  const b = TOKENS[bg];
  if (!a || !b) throw new Error(`token sconosciuto: ${a ? bg : fg}`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const src = (f: string) => readFileSync(`src/components/${f}`, "utf8");

/** Il primo gruppo di `re` in `f`, oppure un errore che dice cosa non si trova. */
function pick(f: string, re: RegExp): string[] {
  const m = src(f).match(re);
  if (!m) throw new Error(`${f}: ${re} non trova niente`);
  return m.slice(1);
}

describe("i token noti hanno il rapporto del censimento", () => {
  it("text-outline è sotto 4.5 su tutti i fondi chiari, anche sul bianco", () => {
    expect(ratio("outline", "white")).toBeCloseTo(4.47, 2);
    expect(ratio("outline", "surface-container-low")).toBeCloseTo(4.03, 2);
    expect(ratio("outline", "surface-container")).toBeCloseTo(3.85, 2);
  });
  it("i tre chip di stato passano", () => {
    expect(ratio("success-text", "success-soft")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("warning-text", "warning-soft")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("danger-text", "danger-soft")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("i token nuovi del lato cliente (passata 00) stanno sopra 4.5", () => {
  it("warning-ink su warning-soft: il testo dentro i riquadri di avviso", () => {
    expect(ratio("warning-ink", "warning-soft")).toBeCloseTo(6.88, 2);
    expect(ratio("warning-ink", "warning-soft")).toBeGreaterThanOrEqual(4.5);
  });
  it("rating-text su rating-soft: il chip «Da valutare»", () => {
    expect(ratio("rating-text", "rating-soft")).toBeCloseTo(6.37, 2);
    expect(ratio("rating-text", "rating-soft")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("le coppie corrette nella passata 10 stanno sopra 4.5", () => {
  it("chip «muted» del Profilo (profile-ui.tsx)", () => {
    const [bg, fg] = pick("profile-ui.tsx", /muted: "bg-(\S+) text-(\S+)"/);
    expect(ratio(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
  });
  it("CountPill a zero della Panoramica (overview-desktop.tsx)", () => {
    const [bg, fg] = pick("overview-desktop.tsx", /n === 0\s*\?\s*"bg-(\S+) text-(\S+)"/);
    expect(ratio(fg!, bg!)).toBeGreaterThanOrEqual(4.5);
  });
  it("badge delle notifiche del desktop (trainer-notifications-bell.tsx)", () => {
    const [cls] = pick("trainer-notifications-bell.tsx", /"([^"]*h-\[18px\] min-w-\[18px\][^"]*)"/);
    const bg = cls!.match(/\bbg-(\S+)/)![1]!;
    expect(cls).toContain("text-white");
    expect(ratio("white", bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("badge della campanella del cliente (client-notifications-bell.tsx, passata 08)", () => {
    const [cls] = pick("client-notifications-bell.tsx", /"([^"]*h-5 min-w-5[^"]*)"/);
    const bg = cls!.match(/\bbg-(\S+)/)![1]!;
    expect(cls).toContain("text-white");
    expect(ratio("white", bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("variazione della BIA, in su e in giù, sulla card bianca (bia-sparkline.tsx)", () => {
    const [up, down] = pick("bia-sparkline.tsx", /good \? "text-(\S+)" : "text-(\S+)"/);
    expect(ratio(up!, "surface-container-lowest")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(down!, "surface-container-lowest")).toBeGreaterThanOrEqual(4.5);
  });
  it("conteggi nei tab di Clienti e nel filtro delle Sessioni, sulla pista", () => {
    const [clients] = pick("clients-desktop.tsx", /"text-warning-text"\s*:\s*"text-(\S+)"/);
    const [sessions] = pick("profile-sessions.tsx", /tabular-nums text-(\S+)"/);
    expect(ratio(clients!, "surface-container")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(sessions!, "surface-container")).toBeGreaterThanOrEqual(4.5);
  });
});
