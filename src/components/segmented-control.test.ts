// Controllo segmentato e tab (O3): ruoli, tabindex rotante e tastiera sul
// gestore vero del componente. Il componente non ha hook, quindi si chiama
// come una funzione e si premono i tasti sul suo onKeyDown, con un gruppo
// finto che risponde a closest/querySelectorAll come il DOM.

import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "@/components/segmented-control";
import { segmentKeyTarget } from "@/lib/segment-keys";

type Value = "a" | "b" | "c";
const OPTIONS = [
  { value: "a", label: "Uno" },
  { value: "b", label: "Due" },
  { value: "c", label: "Tre" },
] as const satisfies ReadonlyArray<{ value: Value; label: string }>;

interface ItemProps {
  role: string;
  tabIndex: number;
  "aria-checked"?: boolean;
  "aria-selected"?: boolean;
  onKeyDown?: (e: unknown) => void;
}

function render(value: Value, kind: "radio" | "tabs" = "radio") {
  const onChange = vi.fn();
  const root = SegmentedControl<Value>({
    value,
    options: OPTIONS,
    onChange,
    ariaLabel: "Prova",
    kind,
  }) as ReactElement<{ role: string; children: ReactElement<ItemProps>[] }>;
  return { root, items: root.props.children, onChange };
}

/** Preme `key` sul segmento `index`: cosa sceglie, dove va il fuoco, se il tasto è trattenuto. */
function press(value: Value, index: number, key: string) {
  const { items, onChange } = render(value);
  const focus = [vi.fn(), vi.fn(), vi.fn()];
  const nodes = focus.map((f) => ({ focus: f }));
  const preventDefault = vi.fn();
  const handler = items[index]?.props.onKeyDown;
  if (!handler) throw new Error("il segmento non ha un gestore della tastiera");
  handler({
    key,
    preventDefault,
    currentTarget: { closest: () => ({ querySelectorAll: () => nodes }) },
  });
  return {
    chosen: onChange.mock.calls.map((c) => c[0] as Value),
    focused: focus.findIndex((f) => f.mock.calls.length > 0),
    prevented: preventDefault.mock.calls.length > 0,
  };
}

describe("segmentKeyTarget", () => {
  it("le frecce girano in tondo, anche quelle verticali", () => {
    expect(segmentKeyTarget("ArrowRight", 2, 3)).toBe(0);
    expect(segmentKeyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(segmentKeyTarget("ArrowDown", 0, 3)).toBe(1);
    expect(segmentKeyTarget("ArrowUp", 1, 3)).toBe(0);
  });
  it("Home ed End vanno agli estremi", () => {
    expect(segmentKeyTarget("Home", 2, 3)).toBe(0);
    expect(segmentKeyTarget("End", 0, 3)).toBe(2);
  });
  it("gli altri tasti non sono del gruppo", () => {
    expect(segmentKeyTarget("Tab", 0, 3)).toBeNull();
    expect(segmentKeyTarget("Enter", 0, 3)).toBeNull();
    expect(segmentKeyTarget("Home", 0, 0)).toBeNull();
  });
});

describe("SegmentedControl: ruoli e tabindex", () => {
  it("radiogroup: aria-checked e un solo punto di Tab, sul segmento scelto", () => {
    const { root, items } = render("b");
    expect(root.props.role).toBe("radiogroup");
    expect(items.map((i) => i.props.role)).toEqual(["radio", "radio", "radio"]);
    expect(items.map((i) => i.props["aria-checked"])).toEqual([false, true, false]);
    expect(items.map((i) => i.props.tabIndex)).toEqual([-1, 0, -1]);
  });
  it("tablist: aria-selected al posto di aria-checked", () => {
    const { root, items } = render("c", "tabs");
    expect(root.props.role).toBe("tablist");
    expect(items.map((i) => i.props.role)).toEqual(["tab", "tab", "tab"]);
    expect(items.map((i) => i.props["aria-selected"])).toEqual([false, false, true]);
    expect(items.every((i) => i.props["aria-checked"] === undefined)).toBe(true);
  });
  it("il markup reso porta ruoli e stato", () => {
    const html = renderToStaticMarkup(
      createElement(SegmentedControl<Value>, {
        value: "a",
        options: OPTIONS,
        onChange: () => {},
        ariaLabel: "Prova",
      }),
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Prova"');
    expect(html).toMatch(/role="radio" aria-checked="true" tabindex="0"/);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
  });
});

describe("SegmentedControl: la tastiera sceglie e sposta il fuoco", () => {
  it("→ passa al successivo", () => {
    expect(press("a", 0, "ArrowRight")).toEqual({ chosen: ["b"], focused: 1, prevented: true });
  });
  it("← dal primo va all'ultimo", () => {
    expect(press("a", 0, "ArrowLeft")).toEqual({ chosen: ["c"], focused: 2, prevented: true });
  });
  it("↓ come →", () => {
    expect(press("b", 1, "ArrowDown")).toEqual({ chosen: ["c"], focused: 2, prevented: true });
  });
  it("↑ come ←", () => {
    expect(press("b", 1, "ArrowUp")).toEqual({ chosen: ["a"], focused: 0, prevented: true });
  });
  it("Home va al primo e lo sceglie", () => {
    expect(press("c", 2, "Home")).toEqual({ chosen: ["a"], focused: 0, prevented: true });
  });
  it("End va all'ultimo e lo sceglie", () => {
    expect(press("a", 0, "End")).toEqual({ chosen: ["c"], focused: 2, prevented: true });
  });
  it("Home sul primo non sceglie di nuovo", () => {
    expect(press("a", 0, "Home")).toEqual({ chosen: [], focused: 0, prevented: true });
  });
  it("Tab esce dal gruppo senza scegliere", () => {
    expect(press("a", 0, "Tab")).toEqual({ chosen: [], focused: -1, prevented: false });
  });
});

// C5: i sei gruppi del perimetro passano dal componente, nessuno scrive i ruoli a mano.
describe("i gruppi segmentati e i tab del perimetro passano dal componente", () => {
  const read = (f: string) => readFileSync(`src/components/${f}`, "utf8");
  const FILES = [
    "clients-desktop.tsx",
    "client-profile-desktop.tsx",
    "new-client-dialog.tsx",
    "profile-sessions.tsx",
    "package-dialog.tsx",
  ];
  it.each(FILES)("%s non scrive role=tablist o radiogroup", (f) => {
    expect(read(f)).not.toMatch(/role="(tablist|radiogroup)"/);
  });
  it("il dialog Pacchetto sceglie il tipo di percorso col componente", () => {
    const src = read("package-dialog.tsx");
    expect(src).toMatch(/<SegmentedControl\s+ariaLabel="Tipo di percorso"/);
  });
  it("Clienti e Profilo hanno i tab di pagina col componente", () => {
    expect(read("clients-desktop.tsx")).toMatch(/kind="tabs"\s+size="tab"\s+ariaLabel="Stato"/);
    expect(read("client-profile-desktop.tsx")).toMatch(
      /kind="tabs"\s+size="tab"\s+ariaLabel="Sezioni del profilo"/,
    );
  });
});
